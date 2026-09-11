import AsyncStorage from '@react-native-async-storage/async-storage';

import { INSTRUMENT_DEFINITIONS } from '@/constants/drums';
import type { InstrumentId } from '@/types/pattern';

/**
 * Web counterpart to custom-sample-storage.ts. expo-file-system's File/
 * Directory classes are explicit no-op stubs on web (they just
 * `console.warn('expo-file-system is not supported on web')`), so there is
 * no real filesystem to copy picked/recorded audio into. This stores the
 * actual audio bytes (a Blob) in IndexedDB instead, keyed by instrument —
 * and keeps the exact same exported function names/shapes as the native
 * file so use-custom-samples.web.ts (and anything else importing
 * '@/storage/custom-sample-storage') works unmodified; Metro picks this
 * file automatically when bundling for web.
 *
 * The "uri" this module hands back to callers (and persists via
 * AsyncStorage, same as native) is a synthetic `web-custom-sample:<id>`
 * string — never a `blob:` URL, since those are only valid for the page
 * session that created them and can't be persisted across reloads.
 * resolveWebSampleBlobUrl (used only by use-custom-samples.web.ts) turns
 * that synthetic uri back into a fresh, playable `blob:` URL on demand by
 * reading the stored Blob back out of IndexedDB.
 */

const STORAGE_KEY = 'trummaskin-custom-samples-v1';
const STORAGE_VERSION = 1;
const DB_NAME = 'trummaskin-custom-samples';
const DB_STORE = 'samples';
const WEB_URI_PREFIX = 'web-custom-sample:';

export type CustomSampleRef = { uri: string; trimStart: number; trimEnd: number };
export type CustomSampleRefs = Partial<Record<InstrumentId, CustomSampleRef>>;

type StoredShape = {
  version: number;
  samples: unknown;
};

type StoredSample = { blob: Blob; name: string };

const VALID_INSTRUMENT_IDS = new Set<InstrumentId>(INSTRUMENT_DEFINITIONS.map((definition) => definition.id));

function isValidTrimValue(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

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

function webUriFor(instrumentId: InstrumentId): string {
  return `${WEB_URI_PREFIX}${instrumentId}`;
}

function instrumentIdFromWebUri(uri: string): InstrumentId | null {
  if (!uri.startsWith(WEB_URI_PREFIX)) return null;
  return uri.slice(WEB_URI_PREFIX.length) as InstrumentId;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DB_STORE)) {
        request.result.createObjectStore(DB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbPut(instrumentId: InstrumentId, blob: Blob, name: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put({ blob, name } satisfies StoredSample, instrumentId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function idbGet(instrumentId: InstrumentId): Promise<StoredSample | null> {
  const db = await openDb();
  try {
    return await new Promise<StoredSample | null>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const req = tx.objectStore(DB_STORE).get(instrumentId);
      req.onsuccess = () => resolve((req.result as StoredSample | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function idbDelete(instrumentId: InstrumentId): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).delete(instrumentId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Stores `source`'s bytes in IndexedDB under `instrumentId` and returns the synthetic uri to persist as its reference. */
export async function importCustomSampleFile(instrumentId: InstrumentId, source: Blob): Promise<string> {
  const name = (source as File).name ?? String(instrumentId);
  await idbPut(instrumentId, source, name);
  return webUriFor(instrumentId);
}

/** Best-effort cleanup; a failed delete never surfaces as an error to the caller. */
export async function deleteCustomSampleFile(uri: string): Promise<void> {
  const instrumentId = instrumentIdFromWebUri(uri);
  if (!instrumentId) return;
  try {
    await idbDelete(instrumentId);
  } catch (error) {
    console.warn('[custom-sample-storage.web] Failed to delete custom sample.', error);
  }
}

/** Returns only refs that are structurally valid AND whose blob still exists in IndexedDB. Never throws. */
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
      const stillExists = await idbGet(instrumentId as InstrumentId);
      if (!stillExists) {
        console.warn(`[custom-sample-storage.web] Missing blob for "${instrumentId}", falling back to default.`);
        continue;
      }
      result[instrumentId as InstrumentId] = entry;
    }
    return result;
  } catch (error) {
    console.warn('[custom-sample-storage.web] Failed to load custom samples, using defaults.', error);
    return {};
  }
}

/** Fire-and-forget from the caller's perspective — failures are logged, never thrown. */
export async function saveCustomSampleRefs(refs: CustomSampleRefs): Promise<void> {
  try {
    const payload: StoredShape = { version: STORAGE_VERSION, samples: refs };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('[custom-sample-storage.web] Failed to save custom samples.', error);
  }
}

/** Web-only: turns a synthetic `web-custom-sample:<id>` uri back into a fresh, decodable `blob:` URL, or null if the blob is gone. */
export async function resolveWebSampleBlobUrl(uri: string): Promise<{ url: string; name: string } | null> {
  const instrumentId = instrumentIdFromWebUri(uri);
  if (!instrumentId) return null;
  const stored = await idbGet(instrumentId);
  if (!stored) return null;
  return { url: URL.createObjectURL(stored.blob), name: stored.name };
}
