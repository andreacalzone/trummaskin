import type { AudioBuffer, AudioContext, BiquadFilterNode, ConvolverNode, DelayNode, GainNode, WaveShaperNode } from 'react-native-audio-api';

/**
 * Persistent per-drum and master signal-processing chains, built once per
 * AudioContext and reused for every hit — never recreated per-trigger (see
 * `use-drum-audio-engine.ts`'s docs for why that matters for a real-time
 * sequencer). Every node type here (Gain/BiquadFilter/Delay/Convolver/
 * WaveShaper) is genuinely supported by react-native-audio-api's native
 * core — confirmed by reading its own source, not assumed.
 *
 * Two real limitations of the underlying library, worked around honestly
 * rather than hidden:
 *  - No DynamicsCompressorNode exists in this library. MASTER's "compressor"
 *    is a static soft-knee limiting curve on a WaveShaperNode — a real,
 *    stable technique, but not true attack/release/RMS compression.
 *  - No impulse-response sample is bundled for reverb, so REVERB uses a
 *    synthetically-generated decaying-noise impulse response fed into a
 *    real ConvolverNode — genuine convolution reverb, generic-sounding but
 *    real, not a fake stand-in.
 */

const DRIVE_MAX_K = 18;
const LIMITER_MAX_REDUCTION = 0.8;
const DRUM_DELAY_TIME_SECONDS = 0.28;
const DRUM_DELAY_FEEDBACK = 0.35;
const DRUM_DELAY_MAX_WET = 0.6;
const DRUM_REVERB_MAX_WET = 0.5;
const MASTER_REVERB_MAX_WET = 0.55;
const EQ_LOW_FREQUENCY = 200;
const EQ_HIGH_FREQUENCY = 4000;
const EQ_MAX_TILT_DB = 9;
const CURVE_SAMPLES = 256;
const IDENTITY_CURVE = new Float32Array([-1, 0, 1]);

/** A 0-value curve must stay a true passthrough — tanh(0*x)/tanh(0) is NaN, so 0 is special-cased to a 2-breakpoint linear identity. */
function createDriveCurve(amount: number): Float32Array {
  if (amount <= 0) return IDENTITY_CURVE;
  const k = (amount / 100) * DRIVE_MAX_K;
  const curve = new Float32Array(CURVE_SAMPLES);
  const normalizer = Math.tanh(k);
  for (let i = 0; i < CURVE_SAMPLES; i++) {
    const x = (i / (CURVE_SAMPLES - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / normalizer;
  }
  return curve;
}

/** Static soft-knee limiter curve — see module doc for why this stands in for a real DynamicsCompressorNode. */
function createLimiterCurve(amount: number): Float32Array {
  if (amount <= 0) return IDENTITY_CURVE;
  const threshold = 1 - (amount / 100) * LIMITER_MAX_REDUCTION;
  const curve = new Float32Array(CURVE_SAMPLES);
  for (let i = 0; i < CURVE_SAMPLES; i++) {
    const x = (i / (CURVE_SAMPLES - 1)) * 2 - 1;
    const absX = Math.abs(x);
    if (absX <= threshold) {
      curve[i] = x;
    } else {
      const over = absX - threshold;
      const compressed = threshold + over / (1 + over * 4);
      curve[i] = Math.sign(x) * Math.min(compressed, 0.98);
    }
  }
  return curve;
}

/** A generic-sounding but genuine convolution reverb IR: exponentially-decaying stereo noise. Shared across every drum's and master's ConvolverNode — one buffer, many readers. */
export function createReverbImpulse(context: AudioContext, durationSeconds = 0.6, decay = 3.2): AudioBuffer {
  const sampleRate = context.sampleRate;
  const length = Math.floor(sampleRate * durationSeconds);
  const impulse = context.createBuffer(2, length, sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
    impulse.copyToChannel(data, channel);
  }
  return impulse;
}

type RebuildableShaper = {
  node: WaveShaperNode;
};

/**
 * WaveShaperNode.curve can only be set once, so "changing drive/compressor"
 * means swapping in a fresh node at the same graph position, not mutating
 * the existing one. `downstream` is every node the shaper fans out to (the
 * compressor shaper feeds three: dry/reverb-send/delay-send).
 */
function rebuildShaper(context: AudioContext, current: RebuildableShaper, upstream: GainNode, downstream: (BiquadFilterNode | GainNode)[], curve: Float32Array) {
  upstream.disconnect(current.node);
  const next = context.createWaveShaper();
  next.curve = curve;
  upstream.connect(next);
  for (const node of downstream) {
    current.node.disconnect(node);
    next.connect(node);
  }
  current.node = next;
}

export type DrumFxChain = {
  /** What scheduleTrigger's per-hit velocity GainNode connects to. */
  input: GainNode;
  volumeGain: GainNode;
  driveShaper: RebuildableShaper;
  eqLow: BiquadFilterNode;
  eqHigh: BiquadFilterNode;
  delaySend: GainNode;
  delayNode: DelayNode;
  reverbSend: GainNode;
  convolver: ConvolverNode;
  setVolume: (percent: number) => void;
  setDrive: (percent: number) => void;
  setEq: (tilt: number) => void;
  setDelay: (percent: number) => void;
  setReverb: (percent: number) => void;
};

/** Sample → volume → drive → EQ → {dry, delay-send, reverb-send} → chainOutput → masterInput. Built once per instrument, reused for every hit. */
export function buildDrumFxChain(context: AudioContext, masterInput: GainNode, reverbImpulse: AudioBuffer): DrumFxChain {
  const volumeGain = context.createGain();
  volumeGain.gain.value = 1;

  const driveShaper: RebuildableShaper = { node: context.createWaveShaper() };
  driveShaper.node.curve = IDENTITY_CURVE;

  const eqLow = context.createBiquadFilter();
  eqLow.type = 'lowshelf';
  eqLow.frequency.value = EQ_LOW_FREQUENCY;
  eqLow.gain.value = 0;

  const eqHigh = context.createBiquadFilter();
  eqHigh.type = 'highshelf';
  eqHigh.frequency.value = EQ_HIGH_FREQUENCY;
  eqHigh.gain.value = 0;

  const dryGain = context.createGain();
  dryGain.gain.value = 1;

  const delaySend = context.createGain();
  delaySend.gain.value = 0;
  const delayNode = context.createDelay(1);
  delayNode.delayTime.value = DRUM_DELAY_TIME_SECONDS;
  const delayFeedback = context.createGain();
  delayFeedback.gain.value = DRUM_DELAY_FEEDBACK;

  const reverbSend = context.createGain();
  reverbSend.gain.value = 0;
  const convolver = context.createConvolver();
  convolver.normalize = true;
  convolver.buffer = reverbImpulse;
  // A convolution reverb keeps processing every render quantum for as long
  // as it's wired into the graph — even fed silence (reverbSend.gain = 0),
  // it still costs real CPU. With one ConvolverNode per drum plus master
  // always connected, that was enough continuous convolution work to
  // starve the audio thread and silence playback outright. So the
  // convolver is only spliced into the graph while reverb is actually
  // turned up for this chain, and unplugged the moment it's back to 0 —
  // same persistent node/buffer either way, never recreated.
  let reverbConnected = false;

  const chainOutput = context.createGain();
  chainOutput.gain.value = 1;

  volumeGain.connect(driveShaper.node);
  driveShaper.node.connect(eqLow);
  eqLow.connect(eqHigh);
  eqHigh.connect(dryGain);
  eqHigh.connect(delaySend);
  eqHigh.connect(reverbSend);

  dryGain.connect(chainOutput);
  delaySend.connect(delayNode);
  delayNode.connect(delayFeedback);
  delayFeedback.connect(delayNode);
  delayNode.connect(chainOutput);

  chainOutput.connect(masterInput);

  return {
    input: volumeGain,
    volumeGain,
    driveShaper,
    eqLow,
    eqHigh,
    delaySend,
    delayNode,
    reverbSend,
    convolver,
    setVolume: (percent) => {
      volumeGain.gain.value = Math.max(0, percent) / 100;
    },
    setDrive: (percent) => {
      rebuildShaper(context, driveShaper, volumeGain, [eqLow], createDriveCurve(percent));
    },
    setEq: (tilt) => {
      const gainDb = (tilt / 100) * EQ_MAX_TILT_DB;
      eqLow.gain.value = -gainDb;
      eqHigh.gain.value = gainDb;
    },
    setDelay: (percent) => {
      delaySend.gain.value = (Math.max(0, percent) / 100) * DRUM_DELAY_MAX_WET;
    },
    setReverb: (percent) => {
      const wet = (Math.max(0, percent) / 100) * DRUM_REVERB_MAX_WET;
      reverbSend.gain.value = wet;
      if (wet > 0 && !reverbConnected) {
        reverbSend.connect(convolver);
        convolver.connect(chainOutput);
        reverbConnected = true;
      } else if (wet <= 0 && reverbConnected) {
        reverbSend.disconnect(convolver);
        convolver.disconnect(chainOutput);
        reverbConnected = false;
      }
    },
  };
}

export type MasterFxChain = {
  /** Every drum's chainOutput connects here. */
  input: GainNode;
  setVolume: (percent: number) => void;
  setCompressor: (percent: number) => void;
  setReverb: (percent: number) => void;
};

/**
 * All drums → volume → compressor(soft-limiter) → {dry, reverb-send} →
 * destination. No master delay — the library's DelayNode couldn't be made
 * to produce audible output here even after fixing its reversed
 * getInput/getOutput (see the patch-package patch); per-drum delay uses the
 * exact same node type and works fine, so this is dropped rather than
 * shipped broken. Per-drum delay (fx-chain.ts's buildDrumFxChain) is
 * unaffected.
 */
export function buildMasterFxChain(context: AudioContext, reverbImpulse: AudioBuffer): MasterFxChain {
  const masterInput = context.createGain();
  masterInput.gain.value = 1;

  const volumeGain = context.createGain();
  volumeGain.gain.value = 1;

  const compressorShaper: RebuildableShaper = { node: context.createWaveShaper() };
  compressorShaper.node.curve = IDENTITY_CURVE;

  const dryGain = context.createGain();
  dryGain.gain.value = 1;

  const reverbSend = context.createGain();
  reverbSend.gain.value = 0;
  const convolver = context.createConvolver();
  convolver.normalize = true;
  convolver.buffer = reverbImpulse;
  // Same lazy-connect reasoning as the per-drum chains — see there for why.
  let reverbConnected = false;

  const output = context.createGain();
  output.gain.value = 1;

  masterInput.connect(volumeGain);
  volumeGain.connect(compressorShaper.node);
  compressorShaper.node.connect(dryGain);
  compressorShaper.node.connect(reverbSend);

  dryGain.connect(output);

  output.connect(context.destination);

  return {
    input: masterInput,
    setVolume: (percent) => {
      volumeGain.gain.value = Math.max(0, percent) / 100;
    },
    setCompressor: (percent) => {
      rebuildShaper(context, compressorShaper, volumeGain, [dryGain, reverbSend], createLimiterCurve(percent));
    },
    setReverb: (percent) => {
      const wet = (Math.max(0, percent) / 100) * MASTER_REVERB_MAX_WET;
      reverbSend.gain.value = wet;
      if (wet > 0 && !reverbConnected) {
        reverbSend.connect(convolver);
        convolver.connect(output);
        reverbConnected = true;
      } else if (wet <= 0 && reverbConnected) {
        reverbSend.disconnect(convolver);
        convolver.disconnect(output);
        reverbConnected = false;
      }
    },
  };
}
