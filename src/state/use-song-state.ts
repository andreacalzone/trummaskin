import { useCallback, useEffect, useRef, useState } from 'react';

import { loadSongState, saveSongState } from '@/storage/song-storage';

const SAVE_DEBOUNCE_MS = 500;

/**
 * Owns Song Mode's on/off flag and its arrangement — an ordered list of
 * pattern *indices* (references, per Milestone 26 §11/§13/§14: editing a
 * pattern, its FX, or its custom sample automatically affects every
 * arrangement slot that references it, for free, simply because nothing
 * here ever copies pattern data). Structurally independent from
 * usePatternState, useFxState, and useCustomSamples, the same way FX and
 * custom samples are independent from patterns — none of those hooks know
 * this one exists.
 */
export function useSongState() {
  const [songMode, setSongModeRaw] = useState(false);
  const [arrangement, setArrangement] = useState<number[]>([]);
  const hasLoadedRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadSongState().then((restored) => {
      if (cancelled) return;
      setSongModeRaw(restored.songMode);
      setArrangement(restored.arrangement);
      hasLoadedRef.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Same debounced-save-gated-on-initial-load policy as pattern/FX storage.
  useEffect(() => {
    if (!hasLoadedRef.current) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveSongState({ songMode, arrangement });
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [songMode, arrangement]);

  const setSongMode = useCallback((enabled: boolean) => {
    setSongModeRaw(enabled);
  }, []);

  /** Appends a pattern reference to the end of the arrangement. The same pattern index may appear any number of times. */
  const addToArrangement = useCallback((patternIndex: number) => {
    setArrangement((current) => [...current, patternIndex]);
  }, []);

  /** Removes one arrangement *instance* by its position — never touches pattern data, and never affects any other instance of the same pattern. */
  const removeFromArrangement = useCallback((position: number) => {
    setArrangement((current) => current.filter((_, index) => index !== position));
  }, []);

  /** Moves the instance at `fromPosition` to `toPosition`, shifting the ones in between. */
  const moveArrangementItem = useCallback((fromPosition: number, toPosition: number) => {
    setArrangement((current) => {
      if (fromPosition === toPosition || fromPosition < 0 || fromPosition >= current.length || toPosition < 0 || toPosition >= current.length) {
        return current;
      }
      const next = [...current];
      const [moved] = next.splice(fromPosition, 1);
      next.splice(toPosition, 0, moved);
      return next;
    });
  }, []);

  return { songMode, setSongMode, arrangement, addToArrangement, removeFromArrangement, moveArrangementItem };
}
