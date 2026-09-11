import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';

import { INSTRUMENT_DEFINITIONS } from '@/constants/drums';
import type { InstrumentId } from '@/types/pattern';

/**
 * Persists custom-sample *references* — a URI per instrument pointing at a
 * copy of the user's file inside app-owned permanent storage — never
 * decoded audio. Unlike pattern-storage's all-or-nothing validation, each
 * instrument's reference is independent: a missing/corrupt file for one
 * drum falls back to just that drum's bundled sample, without discarding
 * any other instrument's still-valid custom sample.
 */

const STORAGE_KEY = 'trummaskin-custom-samples-v1';
const STORAGE_VERSION = 1;
const SAMPLES_DIR_NAME = 'custom-samples';

/** `trimStart`/`trimEnd` are fractions (0–1) of the file's own duration — always (0, 1) unless the user has trimmed it in the sample editor. */
export type CustomSampleRef = { uri: string; trimStart: number; trimEnd: number };
export type CustomSampleRefs = Partial<Record<InstrumentId, CustomSampleRef>>;

type StoredShape = {
  version: number;
  samples: unknown;
};

const VALID_INSTRUMENT_IDS = new Set<InstrumentId>(INSTRUMENT_DEFINITIONS.map((definition) => definition.id));

function isValidTrimValue(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

/**
 * A corrupt trim value falls back to full-range rather than invalidating
 * the whole entry — losing the user's picked file over a bad trim number
 * would be a much worse failure mode than just un-trimming it.
 */
function parseRefEntry(instrumentId: string, value: unknown): CustomSampleRef | null {
  if (!VALID_INSTRUMENT_IDS.has(instrumentId as InstrumentId)) return null;
  if (!value || typeof value !== 'object') return null;
  const shape = value as Record<string, unknown>;
  if (typeof shape.uri !== 'string' || shape.uri.length === 0) return null;

  const trimStart = isValidTrimValue(shape.trimStart) ? shape.trimStart : 0;
  const trimEnd = isValidTrimValue(shape.trimEnd) ? shape.trimEnd : 1;
  if (trimStart >= trimEnd) return { uri: shape.uri, trimStart: 0, trimEnd: 1 };
  return { uri: shape.uri, trimStart, trimEnd };
}

function customSamplesDirectory(): Directory {
  const directory = new Directory(Paths.document, SAMPLES_DIR_NAME);
  directory.create({ intermediates: true, idempotent: true });
  return directory;
}

/**
 * Copies a just-picked file into a permanent, app-owned location, named
 * after the instrument so replacing a drum's sample overwrites its
 * previous file instead of accumulating orphans. Returns the new
 * persistent `file://` URI to store as that instrument's reference — the
 * picker's own URI (a temporary copy on iOS) is never safe to persist.
 */
export async function importCustomSampleFile(instrumentId: InstrumentId, source: File): Promise<string> {
  const directory = customSamplesDirectory();
  const target = new File(directory, `${instrumentId}${source.extension ?? ''}`);
  await source.copy(target, { overwrite: true });
  return target.uri;
}

/** Best-effort cleanup; a failed delete never surfaces as an error to the caller. */
export async function deleteCustomSampleFile(uri: string): Promise<void> {
  try {
    const file = new File(uri);
    if (file.exists) {
      file.delete();
    }
  } catch (error) {
    console.warn('[custom-sample-storage] Failed to delete custom sample file.', error);
  }
}

/** Returns only refs that are structurally valid AND whose file still exists on disk. Never throws. */
export async function loadCustomSampleRefs(): Promise<CustomSampleRefs> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredShape;
    if (parsed.version !== STORAGE_VERSION || !parsed.samples || typeof parsed.samples !== 'object') {
      return {};
    }
    const result: CustomSampleRefs = {};
    for (const [instrumentId, rawEntry] of Object.entries(parsed.samples as Record<string, unknown>)) {
      const entry = parseRefEntry(instrumentId, rawEntry);
      if (!entry) continue;
      if (!new File(entry.uri).exists) {
        console.warn(`[custom-sample-storage] Missing file for "${instrumentId}", falling back to default.`);
        continue;
      }
      result[instrumentId as InstrumentId] = entry;
    }
    return result;
  } catch (error) {
    console.warn('[custom-sample-storage] Failed to load custom samples, using defaults.', error);
    return {};
  }
}

/** Fire-and-forget from the caller's perspective — failures are logged, never thrown. */
export async function saveCustomSampleRefs(refs: CustomSampleRefs): Promise<void> {
  try {
    const payload: StoredShape = { version: STORAGE_VERSION, samples: refs };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('[custom-sample-storage] Failed to save custom samples.', error);
  }
}
