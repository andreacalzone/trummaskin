import { useCallback, useEffect, useRef, useState } from 'react';

import { DEFAULT_DRUM_FX, DEFAULT_MASTER_FX, type DrumFxParamKey, type DrumFxParams, type MasterFxParamKey, type MasterFxParams } from '@/constants/fx';
import { INSTRUMENT_DEFINITIONS } from '@/constants/drums';
import { loadFxState, saveFxState } from '@/storage/fx-storage';
import type { InstrumentId } from '@/types/pattern';

const SAVE_DEBOUNCE_MS = 500;

type AudioEngineForFx = {
  isLoaded: boolean;
  setDrumFxParam: (instrumentId: InstrumentId, param: DrumFxParamKey, value: number) => void;
  setMasterFxParam: (param: MasterFxParamKey, value: number) => void;
};

function createDefaultDrumFx(): Record<InstrumentId, DrumFxParams> {
  return Object.fromEntries(INSTRUMENT_DEFINITIONS.map((definition) => [definition.id, { ...DEFAULT_DRUM_FX }])) as Record<
    InstrumentId,
    DrumFxParams
  >;
}

/**
 * Owns FX parameter state — global and pattern-independent (Milestone 25
 * §9): keyed only by instrument, never touched by pattern switching, Copy,
 * or Reset, since none of those code paths know this hook exists. Mirrors
 * use-custom-samples' shape: persisted values are restored once the audio
 * engine is loaded and pushed into it live from then on, and every setter
 * both updates displayed state and applies the change to the engine
 * immediately (real-time editing, Milestone 25 §17 — no restart of
 * anything).
 */
export function useFxState(engine: AudioEngineForFx) {
  const [drumFx, setDrumFxState] = useState<Record<InstrumentId, DrumFxParams>>(createDefaultDrumFx);
  const [masterFx, setMasterFxState] = useState<MasterFxParams>({ ...DEFAULT_MASTER_FX });
  const hasLoadedRef = useRef(false);
  const hasAppliedToEngineRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadFxState().then((restored) => {
      if (cancelled) return;
      setDrumFxState(restored.drumFx);
      setMasterFxState(restored.masterFx);
      hasLoadedRef.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounced save, gated until the initial load resolves — same policy as
  // pattern-storage, so a restore can never be clobbered by the default
  // state a fresh render starts with.
  useEffect(() => {
    if (!hasLoadedRef.current) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveFxState({ drumFx, masterFx });
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [drumFx, masterFx]);

  // One-time push of restored values into the (now-ready) audio engine.
  // Runs once both the engine has decoded its buffers/built its FX chains
  // AND the persisted values have loaded — order between those two doesn't
  // matter, this effect just waits for whichever finishes last.
  useEffect(() => {
    if (!engine.isLoaded || !hasLoadedRef.current || hasAppliedToEngineRef.current) return;
    hasAppliedToEngineRef.current = true;
    for (const definition of INSTRUMENT_DEFINITIONS) {
      const params = drumFx[definition.id];
      for (const key of Object.keys(params) as DrumFxParamKey[]) {
        engine.setDrumFxParam(definition.id, key, params[key]);
      }
    }
    for (const key of Object.keys(masterFx) as MasterFxParamKey[]) {
      engine.setMasterFxParam(key, masterFx[key]);
    }
    // drumFx/masterFx deliberately excluded — this effect only cares about
    // the very first values available once loading completes, not about
    // re-running on every subsequent edit (setDrumFxParam/setMasterFxParam
    // below apply those live, immediately, as they happen).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, engine.isLoaded]);

  const setDrumFxParam = useCallback(
    (instrumentId: InstrumentId, param: DrumFxParamKey, value: number) => {
      setDrumFxState((current) => ({ ...current, [instrumentId]: { ...current[instrumentId], [param]: value } }));
      engine.setDrumFxParam(instrumentId, param, value);
    },
    [engine],
  );

  const setMasterFxParam = useCallback(
    (param: MasterFxParamKey, value: number) => {
      setMasterFxState((current) => ({ ...current, [param]: value }));
      engine.setMasterFxParam(param, value);
    },
    [engine],
  );

  return { drumFx, masterFx, setDrumFxParam, setMasterFxParam };
}
