import { useCallback, useEffect, useRef, useState } from 'react';
import { File } from 'expo-file-system';

import { INSTRUMENT_DEFINITIONS } from '@/constants/drums';
import {
  deleteCustomSampleFile,
  importCustomSampleFile,
  loadCustomSampleRefs,
  saveCustomSampleRefs,
  type CustomSampleRefs,
} from '@/storage/custom-sample-storage';
import type { InstrumentId } from '@/types/pattern';

const TRIM_SAVE_DEBOUNCE_MS = 500;

type AudioEngineForCustomSamples = {
  isLoaded: boolean;
  setCustomSample: (instrumentId: InstrumentId, uri: string) => Promise<boolean>;
  clearCustomSample: (instrumentId: InstrumentId) => void;
  setCustomSampleTrim: (instrumentId: InstrumentId, start: number, end: number) => void;
};

export type SampleTrimState = { start: number; end: number };

/**
 * Bridges persisted custom-sample *references* (URI + trim) to decoded
 * AudioBuffers (via the audio engine) and to the UI. Custom samples are
 * global, per-instrument state — entirely separate from Pattern data — so
 * nothing here is ever touched by pattern switching, pattern copying, or
 * Reset.
 */
export function useCustomSamples(engine: AudioEngineForCustomSamples) {
  const [customSampleNames, setCustomSampleNames] = useState<Partial<Record<InstrumentId, string>>>({});
  const [customSampleTrims, setCustomSampleTrims] = useState<Partial<Record<InstrumentId, SampleTrimState>>>({});
  const refsRef = useRef<CustomSampleRefs>({});
  const hasRestoredRef = useRef(false);
  const trimSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restore on startup, once the engine has decoded its bundled samples —
  // setCustomSample decodes against the same AudioContext, so it must wait
  // until that context exists.
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
        const success = await engine.setCustomSample(definition.id, ref.uri);
        if (success) {
          // setCustomSample resets the engine's trim to full range — apply
          // the persisted trim right after, on top of that reset.
          engine.setCustomSampleTrim(definition.id, ref.trimStart, ref.trimEnd);
          restoredRefs[definition.id] = ref;
          names[definition.id] = new File(ref.uri).name;
          trims[definition.id] = { start: ref.trimStart, end: ref.trimEnd };
        }
      }

      refsRef.current = restoredRefs;
      setCustomSampleNames(names);
      setCustomSampleTrims(trims);

      // A ref that passed the existence check but still failed to decode
      // (corrupt file) shouldn't linger in storage either.
      if (Object.keys(restoredRefs).length !== Object.keys(persistedRefs).length) {
        void saveCustomSampleRefs(restoredRefs);
      }
    })();
  }, [engine, engine.isLoaded]);

  /**
   * Shared tail end of both "pick a file" and "record from the mic": persist
   * the source file, hand it to the engine, and only touch state/storage
   * once decoding actually succeeds — a bad source (corrupt pick, or a
   * recording the decoder rejects) never disturbs whatever sample was
   * already active. A brand-new file always starts at full range — same
   * reset the engine itself just applied internally.
   */
  const applyCustomSampleFile = useCallback(
    async (instrumentId: InstrumentId, source: File, displayName: string): Promise<boolean> => {
      const previousRef = refsRef.current[instrumentId];
      const persistentUri = await importCustomSampleFile(instrumentId, source);
      const success = await engine.setCustomSample(instrumentId, persistentUri);
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

  /** Opens the native file picker; on a valid pick, imports/decodes/persists it. Returns whether a custom sample is now active. */
  const selectCustomSample = useCallback(
    async (instrumentId: InstrumentId): Promise<boolean> => {
      const picked = await File.pickFileAsync({ mimeTypes: ['audio/*'] });
      if (picked.canceled || !picked.result) return false;
      return applyCustomSampleFile(instrumentId, picked.result, picked.result.name);
    },
    [applyCustomSampleFile],
  );

  /** Same commit path as selectCustomSample, but for a file useAudioRecorder already finished writing to disk. Returns whether it's now active. */
  const recordCustomSample = useCallback(
    async (instrumentId: InstrumentId, recordedFileUri: string): Promise<boolean> => {
      const source = new File(recordedFileUri);
      const displayName = `Recording ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      return applyCustomSampleFile(instrumentId, source, displayName);
    },
    [applyCustomSampleFile],
  );

  /** Reverts an instrument to its bundled sample and forgets/deletes the custom reference (trim included — it's meaningless without the file it was tuned for). */
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

  /**
   * Live-applies a new trim (fractions 0–1) to the engine immediately —
   * every drag tick — but the disk write is debounced the same way
   * pattern/FX edits are, since a drag can fire many updates per second.
   */
  const setSampleTrim = useCallback(
    (instrumentId: InstrumentId, start: number, end: number) => {
      engine.setCustomSampleTrim(instrumentId, start, end);
      setCustomSampleTrims((current) => ({ ...current, [instrumentId]: { start, end } }));

      const previousRef = refsRef.current[instrumentId];
      if (!previousRef) return; // no persisted entry to update (shouldn't happen — trim only shows in UI once a custom sample exists)
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
