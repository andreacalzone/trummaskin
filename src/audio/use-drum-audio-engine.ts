import { useCallback, useEffect, useRef, useState } from 'react';
// Pinned to an exact nightly build, not the last stable release (0.13.3).
// Stable 0.13.3 never produces audible output on the iOS 26 Simulator's
// CoreAudio HAL — confirmed with a minimal repro (a bare oscillator on a
// brand-new AudioContext, no app code involved) and it matches a known,
// still-open upstream bug: https://github.com/software-mansion/react-native-audio-api/issues/671
// ("skipping cycle due to overload" in the CoreAudio log). This nightly
// (dated 2026-09-09) fixes it. Move back to a stable release once one ships
// with the fix — do not casually bump this pin to a newer/moving nightly tag.
import { AudioContext, type AudioBuffer } from 'react-native-audio-api';

import { buildDrumFxChain, buildMasterFxChain, createReverbImpulse, type DrumFxChain, type MasterFxChain } from '@/audio/fx-chain';
import { SAMPLE_SOURCES } from '@/audio/sample-sources';
import { INSTRUMENT_DEFINITIONS } from '@/constants/drums';
import type { DrumFxParamKey, MasterFxParamKey } from '@/constants/fx';
import type { InstrumentId } from '@/types/pattern';

/**
 * Owns the audio engine: one AudioContext, all six drum samples decoded once
 * into reusable AudioBuffers, plus a persistent per-drum FX chain and a
 * persistent master FX chain (Milestone 25). Triggering creates a fresh
 * AudioBufferSourceNode + velocity GainNode per hit (required by the Web
 * Audio API model — a source node plays once), but that per-hit gain
 * connects into the SAME reusable FX chain every time — the chains
 * themselves, and every node in them, are built once and never recreated
 * per-trigger (see fx-chain.ts's module doc).
 *
 * Signal path per hit: source → per-hit velocity gain → drum's persistent
 * FX chain (volume → drive → EQ → dry/delay/reverb) → master FX chain
 * (volume → compressor → dry/reverb/delay) → destination. Exactly the
 * "Sample → Gain/Volume → Effects → Master" path the FX milestone spec
 * calls for.
 *
 * Buffers are kept in two maps: `bundledBuffersRef` holds the six default
 * samples decoded on mount and is never overwritten, so there's always a
 * known-good fallback. `activeBuffersRef` is what triggering actually
 * reads — it starts identical to bundled and a given instrument's entry is
 * swapped to a custom decoded buffer by `setCustomSample`, or reverted by
 * `clearCustomSample`. This keeps the scheduler/trigger path completely
 * unaware of where a buffer came from, and FX is applied after that buffer
 * is already chosen — custom vs. bundled sample selection and FX are
 * entirely orthogonal.
 */
export type SampleTrim = { start: number; end: number };

const FULL_TRIM: SampleTrim = { start: 0, end: 1 };

export function useDrumAudioEngine() {
  const contextRef = useRef<AudioContext | null>(null);
  const bundledBuffersRef = useRef<Partial<Record<InstrumentId, AudioBuffer>>>({});
  const activeBuffersRef = useRef<Partial<Record<InstrumentId, AudioBuffer>>>({});
  // Trim (fraction 0–1 of the active buffer's duration) only ever means
  // anything for a custom sample — bundled samples always play in full.
  // Reset to FULL_TRIM whenever setCustomSample/clearCustomSample runs, so a
  // trim tuned for one file's waveform can never silently carry over to a
  // completely different one.
  const activeTrimRef = useRef<Partial<Record<InstrumentId, SampleTrim>>>({});
  // Semitones (-12..12), applied via the per-hit source node's own `detune`
  // AudioParam rather than a chain node — pitch is a property of playback
  // itself (how fast the buffer is read), not a processing stage, so unlike
  // every other drum FX param it has nothing to live on in fx-chain.ts.
  const pitchRef = useRef<Partial<Record<InstrumentId, number>>>({});
  const drumFxChainsRef = useRef<Partial<Record<InstrumentId, DrumFxChain>>>({});
  const masterFxChainRef = useRef<MasterFxChain | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const context = new AudioContext();
    contextRef.current = context;

    // Built synchronously (no decoding involved) so scheduleTrigger always
    // has somewhere to connect, even before the sample-decode promise below
    // resolves — isLoaded still gates actual triggering via the buffer check.
    const reverbImpulse = createReverbImpulse(context);
    const masterChain = buildMasterFxChain(context, reverbImpulse);
    masterFxChainRef.current = masterChain;
    for (const definition of INSTRUMENT_DEFINITIONS) {
      drumFxChainsRef.current[definition.id] = buildDrumFxChain(context, masterChain.input, reverbImpulse);
    }

    Promise.all(
      INSTRUMENT_DEFINITIONS.map(async (definition) => {
        const buffer = await context.decodeAudioData(SAMPLE_SOURCES[definition.id]);
        bundledBuffersRef.current[definition.id] = buffer;
        activeBuffersRef.current[definition.id] = buffer;
      }),
    )
      .then(() => setIsLoaded(true))
      .catch((error) => setLoadError(String(error)));

    return () => {
      context.close();
    };
  }, []);

  /**
   * Schedules a hit against the audio clock. `when` <= currentTime plays
   * immediately. `velocity` is a gain multiplier (1 = full, >1 = boosted,
   * <1 = quieter) applied via a GainNode created fresh for this one hit —
   * never shared across hits, so overlapping voices (same step, or
   * different instruments at the same step) never affect each other's
   * volume. That per-hit node is the only thing created per trigger — it
   * feeds straight into the instrument's persistent FX chain.
   */
  const scheduleTrigger = useCallback((instrumentId: InstrumentId, when: number, velocity: number = 1) => {
    const context = contextRef.current;
    const buffer = activeBuffersRef.current[instrumentId];
    const fxChain = drumFxChainsRef.current[instrumentId];
    if (!context || !buffer || !fxChain) return;

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.detune.value = (pitchRef.current[instrumentId] ?? 0) * 100; // semitones → cents

    const gainNode = context.createGain();
    gainNode.gain.value = velocity;

    source.connect(gainNode);
    gainNode.connect(fxChain.input);

    // Trim is a fraction of this buffer's own duration — only ever set to
    // something narrower than full range for a custom sample. Passing an
    // explicit offset/duration to start() — even values that work out to
    // "the whole buffer" — turned out to silence playback outright on
    // device, so the untrimmed (overwhelmingly common) case calls
    // start(when) exactly as before; the offset/duration form is used only
    // when a real trim is active.
    const trim = activeTrimRef.current[instrumentId];
    if (!trim || (trim.start === 0 && trim.end === 1)) {
      source.start(when);
    } else {
      const offset = trim.start * buffer.duration;
      const duration = Math.max(0, (trim.end - trim.start) * buffer.duration);
      source.start(when, offset, duration);
    }
  }, []);

  const trigger = useCallback(
    (instrumentId: InstrumentId, velocity: number = 1) => {
      const context = contextRef.current;
      if (!context) return;
      // Mobile browsers (notably Safari) never auto-resume a suspended
      // AudioContext on an arbitrary click the way desktop Chrome does —
      // it must be resumed from directly inside a user-gesture handler.
      // Every pad tap is such a gesture, so resume unconditionally here;
      // resume() on an already-running context is a cheap no-op.
      if (context.state !== 'running') {
        context.resume().catch(() => {});
      }
      scheduleTrigger(instrumentId, context.currentTime, velocity);
    },
    [scheduleTrigger],
  );

  const getCurrentTime = useCallback(() => contextRef.current?.currentTime ?? 0, []);

  /**
   * Decodes `uri` (a local file URI) and, only on success, swaps it in as
   * `instrumentId`'s active buffer — returns whether it succeeded. On
   * failure the previous active buffer (custom or bundled) is left exactly
   * as it was, so a bad file can never silently mute a drum.
   */
  const setCustomSample = useCallback(async (instrumentId: InstrumentId, uri: string): Promise<boolean> => {
    const context = contextRef.current;
    if (!context) return false;
    try {
      const buffer = await context.decodeAudioData(uri);
      activeBuffersRef.current[instrumentId] = buffer;
      // A fresh file's waveform has nothing to do with whatever the
      // previous file's trim was — always start at full range.
      activeTrimRef.current[instrumentId] = FULL_TRIM;
      return true;
    } catch (error) {
      console.warn(`[use-drum-audio-engine] Failed to decode custom sample for "${instrumentId}".`, error);
      return false;
    }
  }, []);

  const clearCustomSample = useCallback((instrumentId: InstrumentId) => {
    const bundledBuffer = bundledBuffersRef.current[instrumentId];
    if (bundledBuffer) {
      activeBuffersRef.current[instrumentId] = bundledBuffer;
    }
    delete activeTrimRef.current[instrumentId];
  }, []);

  /** Live-applies a trim (fractions 0–1 of the active buffer's duration) — takes effect on the very next trigger, no engine restart. Only meaningful while a custom sample is active. */
  const setCustomSampleTrim = useCallback((instrumentId: InstrumentId, start: number, end: number) => {
    const clampedStart = Math.min(1, Math.max(0, start));
    const clampedEnd = Math.min(1, Math.max(0, end));
    if (clampedStart >= clampedEnd) return;
    activeTrimRef.current[instrumentId] = { start: clampedStart, end: clampedEnd };
  }, []);

  /** Seconds, or null if no buffer is loaded yet for this instrument. */
  const getActiveSampleDuration = useCallback((instrumentId: InstrumentId): number | null => {
    return activeBuffersRef.current[instrumentId]?.duration ?? null;
  }, []);

  /**
   * A compact peak-per-bucket downsample of the active buffer's first
   * channel — the standard cheap technique for rendering a waveform
   * thumbnail without needing every individual sample. Pure computation,
   * safe to call on demand (e.g. when the trim editor opens) rather than
   * needing to be cached — a few hundred thousand samples reduces in low
   * single-digit milliseconds.
   */
  const getWaveformPeaks = useCallback((instrumentId: InstrumentId, bucketCount: number): Float32Array | null => {
    const buffer = activeBuffersRef.current[instrumentId];
    if (!buffer || bucketCount <= 0) return null;
    const data = buffer.getChannelData(0);
    const peaks = new Float32Array(bucketCount);
    const bucketSize = Math.max(1, Math.floor(data.length / bucketCount));
    for (let i = 0; i < bucketCount; i++) {
      const start = i * bucketSize;
      const end = i === bucketCount - 1 ? data.length : Math.min(data.length, start + bucketSize);
      let max = 0;
      for (let j = start; j < end; j++) {
        const abs = Math.abs(data[j]);
        if (abs > max) max = abs;
      }
      peaks[i] = max;
    }
    return peaks;
  }, []);

  /**
   * Live-applies one FX parameter for one drum's persistent chain — takes
   * effect immediately (including on whatever's already playing), and for
   * every subsequent trigger, with no scheduler/engine restart. Pattern-
   * independent by construction: the chain is keyed by instrument, never by
   * pattern, so switching patterns can't touch it (Milestone 25 §9).
   */
  const setDrumFxParam = useCallback((instrumentId: InstrumentId, param: DrumFxParamKey, value: number) => {
    // Pitch lives on the per-hit source node, not the persistent chain (see
    // pitchRef above) — handled before the chain-existence guard since it
    // doesn't need one.
    if (param === 'pitch') {
      pitchRef.current[instrumentId] = value;
      return;
    }

    const chain = drumFxChainsRef.current[instrumentId];
    if (!chain) return;
    switch (param) {
      case 'volume':
        chain.setVolume(value);
        break;
      case 'drive':
        chain.setDrive(value);
        break;
      case 'eq':
        chain.setEq(value);
        break;
      case 'delay':
        chain.setDelay(value);
        break;
      case 'reverb':
        chain.setReverb(value);
        break;
    }
  }, []);

  /** Same live-apply contract as setDrumFxParam, for the single shared master chain. */
  const setMasterFxParam = useCallback((param: MasterFxParamKey, value: number) => {
    const chain = masterFxChainRef.current;
    if (!chain) return;
    switch (param) {
      case 'volume':
        chain.setVolume(value);
        break;
      case 'compressor':
        chain.setCompressor(value);
        break;
      case 'reverb':
        chain.setReverb(value);
        break;
    }
  }, []);

  /**
   * Explicitly resumes the AudioContext if it isn't already running.
   * Needed anywhere playback can start *without* going through `trigger`
   * (e.g. pressing Play) — same mobile-Safari requirement as above, must
   * be called synchronously inside the user-gesture handler.
   */
  const resumeAudioContext = useCallback(() => {
    const context = contextRef.current;
    if (context && context.state !== 'running') {
      context.resume().catch(() => {});
    }
  }, []);

  return {
    isLoaded,
    loadError,
    trigger,
    scheduleTrigger,
    getCurrentTime,
    resumeAudioContext,
    setCustomSample,
    clearCustomSample,
    setCustomSampleTrim,
    getActiveSampleDuration,
    getWaveformPeaks,
    setDrumFxParam,
    setMasterFxParam,
  };
}
