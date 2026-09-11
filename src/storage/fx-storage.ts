import AsyncStorage from '@react-native-async-storage/async-storage';

import { INSTRUMENT_DEFINITIONS } from '@/constants/drums';
import {
  DEFAULT_DRUM_FX,
  DEFAULT_MASTER_FX,
  DRUM_FX_PARAM_RANGE,
  MASTER_FX_PARAM_RANGE,
  type DrumFxParamKey,
  type DrumFxParams,
  type MasterFxParamKey,
  type MasterFxParams,
} from '@/constants/fx';
import type { InstrumentId } from '@/types/pattern';

/**
 * Persists FX settings under their own AsyncStorage key/namespace, entirely
 * separate from pattern-storage and custom-sample-storage — FX is
 * pattern-independent (Milestone 25 §9/§15), so it has no business sharing a
 * key with pattern content. Validation is per-instrument/per-parameter, like
 * custom-sample-storage: one corrupt field falls back to just its own
 * default rather than discarding every other still-valid setting.
 */

const STORAGE_KEY = 'trummaskin-fx-v1';
const STORAGE_VERSION = 1;

export type PersistedFxState = {
  drumFx: Record<InstrumentId, DrumFxParams>;
  masterFx: MasterFxParams;
};

type StoredShape = {
  version: number;
  drumFx: unknown;
  masterFx: unknown;
};

function isValidParamValue(value: unknown, range: { min: number; max: number }): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= range.min && value <= range.max;
}

function validateDrumFxParams(raw: unknown): DrumFxParams {
  const result = { ...DEFAULT_DRUM_FX };
  if (!raw || typeof raw !== 'object') return result;
  const shape = raw as Record<string, unknown>;
  for (const key of Object.keys(DRUM_FX_PARAM_RANGE) as DrumFxParamKey[]) {
    const value = shape[key];
    if (isValidParamValue(value, DRUM_FX_PARAM_RANGE[key])) {
      result[key] = value;
    }
  }
  return result;
}

function validateMasterFxParams(raw: unknown): MasterFxParams {
  const result = { ...DEFAULT_MASTER_FX };
  if (!raw || typeof raw !== 'object') return result;
  const shape = raw as Record<string, unknown>;
  for (const key of Object.keys(MASTER_FX_PARAM_RANGE) as MasterFxParamKey[]) {
    const value = shape[key];
    if (isValidParamValue(value, MASTER_FX_PARAM_RANGE[key])) {
      result[key] = value;
    }
  }
  return result;
}

/** Returns validated FX state, falling back per-field to defaults on any corruption. Never throws, never returns null — there's always a well-formed value to render/apply. */
export async function loadFxState(): Promise<PersistedFxState> {
  const fallback: PersistedFxState = {
    drumFx: Object.fromEntries(INSTRUMENT_DEFINITIONS.map((definition) => [definition.id, { ...DEFAULT_DRUM_FX }])) as Record<InstrumentId, DrumFxParams>,
    masterFx: { ...DEFAULT_MASTER_FX },
  };

  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as StoredShape;
    if (parsed.version !== STORAGE_VERSION) return fallback;

    const drumFxShape = (parsed.drumFx && typeof parsed.drumFx === 'object' ? parsed.drumFx : {}) as Record<string, unknown>;
    const drumFx = Object.fromEntries(
      INSTRUMENT_DEFINITIONS.map((definition) => [definition.id, validateDrumFxParams(drumFxShape[definition.id])]),
    ) as Record<InstrumentId, DrumFxParams>;

    return { drumFx, masterFx: validateMasterFxParams(parsed.masterFx) };
  } catch (error) {
    console.warn('[fx-storage] Failed to load FX settings, using defaults.', error);
    return fallback;
  }
}

/** Fire-and-forget from the caller's perspective — failures are logged, never thrown. */
export async function saveFxState(state: PersistedFxState): Promise<void> {
  try {
    const payload: StoredShape = { version: STORAGE_VERSION, drumFx: state.drumFx, masterFx: state.masterFx };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('[fx-storage] Failed to save FX settings.', error);
  }
}
