import type { InstrumentId } from '@/types/pattern';

/**
 * Every FX parameter is a plain 0–100 (EQ: -100..100) UI value. Defaults are
 * chosen so a freshly-added instrument's FX chain is fully transparent —
 * volume at unity, everything else at zero — meaning sound is byte-for-byte
 * unchanged from before this milestone until the user actually touches a
 * knob. See audio/fx-chain.ts for how each value maps to real DSP.
 */
export type DrumFxParams = {
  volume: number;
  /** Semitones, -12..12 — applied to the source's own playback, not a chain node (see use-drum-audio-engine.ts). */
  pitch: number;
  drive: number;
  eq: number;
  delay: number;
  reverb: number;
};

export type MasterFxParams = {
  volume: number;
  compressor: number;
  reverb: number;
};

export const DEFAULT_DRUM_FX: DrumFxParams = {
  volume: 100,
  pitch: 0,
  drive: 0,
  eq: 0,
  delay: 0,
  reverb: 0,
};

export const DEFAULT_MASTER_FX: MasterFxParams = {
  volume: 100,
  compressor: 0,
  reverb: 0,
};

export type DrumFxParamKey = keyof DrumFxParams;
export type MasterFxParamKey = keyof MasterFxParams;

export const DRUM_FX_PARAM_ORDER: DrumFxParamKey[] = ['volume', 'pitch', 'drive', 'eq', 'delay', 'reverb'];
export const MASTER_FX_PARAM_ORDER: MasterFxParamKey[] = ['volume', 'compressor', 'reverb'];

export const DRUM_FX_PARAM_RANGE: Record<DrumFxParamKey, { min: number; max: number; step: number }> = {
  volume: { min: 0, max: 100, step: 5 },
  pitch: { min: -12, max: 12, step: 1 },
  drive: { min: 0, max: 100, step: 5 },
  eq: { min: -100, max: 100, step: 5 },
  delay: { min: 0, max: 100, step: 5 },
  reverb: { min: 0, max: 100, step: 5 },
};

export const MASTER_FX_PARAM_RANGE: Record<MasterFxParamKey, { min: number; max: number; step: number }> = {
  volume: { min: 0, max: 100, step: 5 },
  compressor: { min: 0, max: 100, step: 5 },
  reverb: { min: 0, max: 100, step: 5 },
};

export const DRUM_FX_PARAM_LABEL: Record<DrumFxParamKey, string> = {
  volume: 'VOL',
  pitch: 'PITCH',
  drive: 'DRIVE',
  eq: 'EQ',
  delay: 'DELAY',
  reverb: 'REVERB',
};

export const MASTER_FX_PARAM_LABEL: Record<MasterFxParamKey, string> = {
  volume: 'VOLUME',
  compressor: 'COMP',
  reverb: 'REVERB',
};

export function createDefaultDrumFxMap(instrumentIds: InstrumentId[]): Record<InstrumentId, DrumFxParams> {
  const map = {} as Record<InstrumentId, DrumFxParams>;
  for (const id of instrumentIds) {
    map[id] = { ...DEFAULT_DRUM_FX };
  }
  return map;
}
