import { useCallback, useEffect, useRef, useState } from 'react';

import { INSTRUMENT_DEFINITIONS } from '@/constants/drums';
import {
  deleteCustomSampleFile,
  importCustomSampleFile,
  loadCustomSampleRefs,
  resolveWebSampleBlobUrl,
  saveCustomSampleRefs,
  type CustomSampleRefs,
} from '@/storage/custom-sample-storage.web';
import type { InstrumentId } from '@/types/pattern';

/**
 * Web counterpart to use-custom-samples.ts. Two things expo-file-system
 * normally handles on native don't exist on web — File.pickFileAsync (the
 * "LOAD" button's file picker) and any real filesystem to persist into
 * (expo-file-system's File/Directory are no-op stubs on web) — so this
 * reimplements both against browser primitives instead, keeping the exact
 * same exported hook shape as the native file. Metro picks this file
 * automatically when bundling for web.
 *
 * Picking uses a hidden <input type="file">. Persistence goes through
 * custom-sample-storage.web.ts's IndexedDB-backed functions (Metro also
 * resolves that import to its .web.ts version). Decoding always happens
 * from a fresh `blob:` URL — react-native-audio-api's web AudioContext
 * decodes any string source via fetch(), so a blob: URL works exactly like
 * the http(s) URLs it's normally given.
 */

const TRIM_SAVE_DEBOUNCE_MS = 500;

type AudioEngineForCustomSamples = {
  isLoaded: boolean;
  setCustomSample: (instrumentId: InstrumentId, uri: string) => Promise<boolean>;
  clearCustomSample: (instrumentId: InstrumentId) => void;
  setCustomSampleTrim: (instrumentId: InstrumentId, start: number, end: number) => void;
};

export type SampleTrimState = { start: number; end: number };

/** Opens a native OS file picker restricted to audio files. Resolves null if the user cancels. */
function pickAudioFileFromBrowser(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    let settled = false;
    const settle = (file: File | null) => {
      if (settled) return;
      settled = true;
      resolve(file);
    };
    input.onchange = () => settle(input.files?.[0] ?? null);
    // Supported in evergreen Chrome/Firefox/Safari — without it, cancelling
    // the OS picker just leaves this promise (and the LOAD button's await)
    // pending until the user tries again, never a crash.
    input.oncancel = () => settle(null);
    input.click();
  });
}

export function useCustomSamples(engine: AudioEngineForCustomSamples) {
  const [customSampleNames, setCustomSampleNames] = useState<Partial<Record<InstrumentId, string>>>({});
  const [customSampleTrims, setCustomSampleTrims] = useState<Partial<Record<InstrumentId, SampleTrimState>>>({});
  const refsRef = useRef<CustomSampleRefs>({});
  const hasRestoredRef = useRef(false);
  const trimSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!engine.isLoaded || hasRestoredRef.current) return;
    hasRestoredRef.current = true;

    (async () => {
      const persistedRefs = await loadCustomSampleRefs();
      const restoredRefs: CustomSampleRefs = {};
      const names: Partial<Record<InstrumentId, string>> = {};
      const trims: Partial<Record<InstrumentId, SampleTrimState>> = {};

      for (const definition of INSTRUMENT_DEFINITIONS) {
        const ref = persistedRefs[definition.id];
        if (!ref) continue;
        const resolved = await resolveWebSampleBlobUrl(ref.uri);
        if (!resolved) continue;
        const success = await engine.setCustomSample(definition.id, resolved.url);
        if (success) {
          engine.setCustomSampleTrim(definition.id, ref.trimStart, ref.trimEnd);
          restoredRefs[definition.id] = ref;
          names[definition.id] = resolved.name;
          trims[definition.id] = { start: ref.trimStart, end: ref.trimEnd };
        }
      }

      refsRef.current = restoredRefs;
      setCustomSampleNames(names);
      setCustomSampleTrims(trims);

      if (Object.keys(restoredRefs).length !== Object.keys(persistedRefs).length) {
        void saveCustomSampleRefs(restoredRefs);
      }
    })();
  }, [engine, engine.isLoaded]);

  const applyCustomSampleFile = useCallback(
    async (instrumentId: InstrumentId, source: Blob, displayName: string): Promise<boolean> => {
      const previousRef = refsRef.current[instrumentId];
      const persistentUri = await importCustomSampleFile(instrumentId, source);
      const decodeUrl = URL.createObjectURL(source);
      const success = await engine.setCustomSample(instrumentId, decodeUrl);
      URL.revokeObjectURL(decodeUrl);
      if (!success) {
        await deleteCustomSampleFile(persistentUri);
        return false;
      }

      const nextRef = { uri: persistentUri, trimStart: 0, trimEnd: 1 };
      const nextRefs = { ...refsRef.current, [instrumentId]: nextRef };
      refsRef.current = nextRefs;
      setCustomSampleNames((current) => ({ ...current, [instrumentId]: displayName }));
      setCustomSampleTrims((current) => ({ ...current, [instrumentId]: { start: 0, end: 1 } }));
      await saveCustomSampleRefs(nextRefs);

      if (previousRef && previousRef.uri !== persistentUri) {
        await deleteCustomSampleFile(previousRef.uri);
      }
      return true;
    },
    [engine],
  );

  /** Opens the browser's file picker; on a valid pick, imports/decodes/persists it. Returns whether a custom sample is now active. */
  const selectCustomSample = useCallback(
    async (instrumentId: InstrumentId): Promise<boolean> => {
      const file = await pickAudioFileFromBrowser();
      if (!file) return false;
      return applyCustomSampleFile(instrumentId, file, file.name);
    },
    [applyCustomSampleFile],
  );

  /** Same commit path as selectCustomSample, but for the blob: URL useAudioRecorder just finished recording. Returns whether it's now active. */
  const recordCustomSample = useCallback(
    async (instrumentId: InstrumentId, recordedBlobUrl: string): Promise<boolean> => {
      const response = await fetch(recordedBlobUrl);
      const blob = await response.blob();
      const displayName = `Recording ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      return applyCustomSampleFile(instrumentId, blob, displayName);
    },
    [applyCustomSampleFile],
  );

  /** Reverts an instrument to its bundled sample and forgets/deletes the custom reference. */
  const restoreDefaultSample = useCallback(
    async (instrumentId: InstrumentId) => {
      const previousRef = refsRef.current[instrumentId];
      if (!previousRef) return;

      engine.clearCustomSample(instrumentId);

      const nextRefs = { ...refsRef.current };
      delete nextRefs[instrumentId];
      refsRef.current = nextRefs;

      setCustomSampleNames((current) => {
        const next = { ...current };
        delete next[instrumentId];
        return next;
      });
      setCustomSampleTrims((current) => {
        const next = { ...current };
        delete next[instrumentId];
        return next;
      });

      await saveCustomSampleRefs(nextRefs);
      await deleteCustomSampleFile(previousRef.uri);
    },
    [engine],
  );

  /** Live-applies a new trim (fractions 0–1) to the engine immediately, debouncing the disk write. */
  const setSampleTrim = useCallback(
    (instrumentId: InstrumentId, start: number, end: number) => {
      engine.setCustomSampleTrim(instrumentId, start, end);
      setCustomSampleTrims((current) => ({ ...current, [instrumentId]: { start, end } }));

      const previousRef = refsRef.current[instrumentId];
      if (!previousRef) return;
      const nextRefs = { ...refsRef.current, [instrumentId]: { ...previousRef, trimStart: start, trimEnd: end } };
      refsRef.current = nextRefs;

      if (trimSaveTimeoutRef.current) clearTimeout(trimSaveTimeoutRef.current);
      trimSaveTimeoutRef.current = setTimeout(() => {
        saveCustomSampleRefs(nextRefs);
      }, TRIM_SAVE_DEBOUNCE_MS);
    },
    [engine],
  );

  useEffect(() => {
    return () => {
      if (trimSaveTimeoutRef.current) clearTimeout(trimSaveTimeoutRef.current);
    };
  }, []);

  return { customSampleNames, customSampleTrims, selectCustomSample, recordCustomSample, restoreDefaultSample, setSampleTrim };
}
