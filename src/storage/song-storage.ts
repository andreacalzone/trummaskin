import AsyncStorage from '@react-native-async-storage/async-storage';

import { PATTERN_COUNT } from '@/constants/drums';

/**
 * Persists the Song Mode arrangement — separate AsyncStorage key/namespace
 * from pattern-storage, custom-sample-storage, and fx-storage (Milestone 26
 * §12). The arrangement itself is only pattern-index *references*; actual
 * pattern content lives entirely in pattern-storage and is never duplicated
 * here.
 *
 * Validation is per-entry, like custom-sample-storage: one corrupt index in
 * the arrangement is dropped rather than discarding the whole song.
 */

const STORAGE_KEY = 'trummaskin-song-v1';
const STORAGE_VERSION = 1;

export type PersistedSongState = {
  songMode: boolean;
  arrangement: number[];
};

type StoredShape = {
  version: number;
  songMode: unknown;
  arrangement: unknown;
};

function isValidPatternIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < PATTERN_COUNT;
}

/** Returns validated song state, never null — missing/corrupt data just falls back to Song Mode off with an empty arrangement. Never throws. */
export async function loadSongState(): Promise<PersistedSongState> {
  const fallback: PersistedSongState = { songMode: false, arrangement: [] };
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as StoredShape;
    if (parsed.version !== STORAGE_VERSION) return fallback;

    const songMode = typeof parsed.songMode === 'boolean' ? parsed.songMode : false;
    const arrangement = Array.isArray(parsed.arrangement) ? parsed.arrangement.filter(isValidPatternIndex) : [];

    return { songMode, arrangement };
  } catch (error) {
    console.warn('[song-storage] Failed to load song state, using defaults.', error);
    return fallback;
  }
}

/** Fire-and-forget from the caller's perspective — failures are logged, never thrown. */
export async function saveSongState(state: PersistedSongState): Promise<void> {
  try {
    const payload: StoredShape = { version: STORAGE_VERSION, songMode: state.songMode, arrangement: state.arrangement };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('[song-storage] Failed to save song state.', error);
  }
}
