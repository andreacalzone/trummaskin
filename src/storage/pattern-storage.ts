import AsyncStorage from '@react-native-async-storage/async-storage';

import { INSTRUMENT_DEFINITIONS, PATTERN_COUNT, STEP_COUNT } from '@/constants/drums';
import { DEFAULT_SWING, MAX_BPM, MAX_SWING, MIN_BPM, MIN_SWING } from '@/constants/sequencer';
import { STEP_VELOCITY } from '@/constants/velocity';
import type { Instrument, InstrumentId, Pattern } from '@/types/pattern';

/**
 * Persists only pattern *content* (the 8-pattern bank + global BPM) — never
 * playback/scheduler/UI state (isPlaying, playhead, AUTO, selected pattern).
 * A fresh launch always starts stopped with Pattern 1 selected and AUTO off;
 * only the pattern data itself needs to survive a restart.
 *
 * This module is intentionally dumb: serialize, validate, read, write.
 * Nothing here knows about React, the scheduler, or the audio engine — the
 * pattern-state hook is the only caller, and it decides *when* to load/save.
 */

const STORAGE_KEY = 'trummaskin-patterns-v1';
const STORAGE_VERSION = 1;

export type PersistedPatternState = {
  patterns: Pattern[];
  bpm: number;
  swing: number;
};

type StoredShape = {
  version: number;
  patterns: unknown;
  bpm: unknown;
  /** Absent in Milestone 22 payloads — see validate()'s handling below. */
  swing?: unknown;
};

const VALID_INSTRUMENT_IDS = new Set<InstrumentId>(INSTRUMENT_DEFINITIONS.map((definition) => definition.id));

function isValidStep(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= STEP_VELOCITY.ACCENT;
}

function isValidInstrument(value: unknown): value is Instrument {
  if (!value || typeof value !== 'object') return false;
  const instrument = value as Record<string, unknown>;
  return (
    typeof instrument.id === 'string' &&
    VALID_INSTRUMENT_IDS.has(instrument.id as InstrumentId) &&
    typeof instrument.name === 'string' &&
    typeof instrument.sample === 'string' &&
    Array.isArray(instrument.steps) &&
    instrument.steps.length === STEP_COUNT &&
    instrument.steps.every(isValidStep) &&
    typeof instrument.volume === 'number' &&
    Number.isFinite(instrument.volume) &&
    typeof instrument.muted === 'boolean'
  );
}

function isValidPattern(value: unknown): value is Pattern {
  if (!value || typeof value !== 'object') return false;
  const pattern = value as Record<string, unknown>;
  return (
    typeof pattern.id === 'string' &&
    typeof pattern.name === 'string' &&
    typeof pattern.bpm === 'number' &&
    Number.isFinite(pattern.bpm) &&
    pattern.stepCount === STEP_COUNT &&
    Array.isArray(pattern.instruments) &&
    pattern.instruments.length === INSTRUMENT_DEFINITIONS.length &&
    pattern.instruments.every(isValidInstrument)
  );
}

function isValidBpm(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= MIN_BPM && value <= MAX_BPM;
}

function isValidSwing(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= MIN_SWING && value <= MAX_SWING;
}

/**
 * All-or-nothing for every *required* field: any structural mismatch in
 * patterns/bpm discards the whole payload rather than risk a partially-
 * corrupt merge. `swing` is the one exception — it didn't exist before
 * Milestone 23, so a payload saved by Milestone 22 simply won't have it.
 * Missing swing defaults to 0 without invalidating otherwise-good data; a
 * *present but malformed* swing is still treated as corruption, same as
 * every other field.
 */
function validate(raw: unknown): PersistedPatternState | null {
  if (!raw || typeof raw !== 'object') return null;
  const shape = raw as StoredShape;
  if (shape.version !== STORAGE_VERSION) return null;
  if (!Array.isArray(shape.patterns) || shape.patterns.length !== PATTERN_COUNT) return null;
  if (!shape.patterns.every(isValidPattern)) return null;
  if (!isValidBpm(shape.bpm)) return null;
  if (shape.swing !== undefined && !isValidSwing(shape.swing)) return null;
  const swing = shape.swing === undefined ? DEFAULT_SWING : shape.swing;
  return { patterns: shape.patterns, bpm: shape.bpm, swing };
}

/** Returns null on missing/corrupt/incompatible data — the caller should fall back to its own defaults. Never throws. */
export async function loadPatternState(): Promise<PersistedPatternState | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const validated = validate(JSON.parse(raw));
    if (!validated) {
      console.warn('[pattern-storage] Persisted patterns failed validation, using defaults.');
    }
    return validated;
  } catch (error) {
    console.warn('[pattern-storage] Failed to load persisted patterns, using defaults.', error);
    return null;
  }
}

/** Fire-and-forget from the caller's perspective — failures are logged, never thrown, never affect in-memory state. */
export async function savePatternState(state: PersistedPatternState): Promise<void> {
  try {
    const payload: StoredShape = {
      version: STORAGE_VERSION,
      patterns: state.patterns,
      bpm: state.bpm,
      swing: state.swing,
    };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('[pattern-storage] Failed to save patterns.', error);
  }
}
