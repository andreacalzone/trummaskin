import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { INSTRUMENT_DEFINITIONS, PATTERN_COUNT, STEP_COUNT } from '@/constants/drums';
import { DEFAULT_BPM, DEFAULT_SWING, MAX_BPM, MAX_SWING, MIN_BPM, MIN_SWING } from '@/constants/sequencer';
import { cycleHoldVelocity, toggleStepActive } from '@/constants/velocity';
import { loadPatternState, savePatternState } from '@/storage/pattern-storage';
import type { InstrumentId, Pattern } from '@/types/pattern';

export { PATTERN_COUNT };

// Small enough that a burst of edits (dragging across steps, a copy
// operation) collapses into one write, large enough to stay well clear of
// the audio scheduler's own ~25ms/~100ms timing — this only ever delays the
// storage write, never the in-memory state update the UI/scheduler see.
const SAVE_DEBOUNCE_MS = 500;

function createEmptyPattern(index: number): Pattern {
  return {
    id: `pattern-${index + 1}`,
    name: `Pattern ${index + 1}`,
    bpm: DEFAULT_BPM,
    stepCount: STEP_COUNT,
    instruments: INSTRUMENT_DEFINITIONS.map((definition) => ({
      id: definition.id,
      name: definition.name,
      sample: definition.id,
      steps: Array(STEP_COUNT).fill(0),
      volume: 1,
      muted: false,
    })),
  };
}

// All 8 banks start identical (empty) — "Pattern 1 contains the current
// initial pattern" simply means an empty grid, same as banks 2–8.
function createInitialPatterns(): Pattern[] {
  return Array.from({ length: PATTERN_COUNT }, (_, i) => createEmptyPattern(i));
}

export function usePatternState() {
  const [patterns, setPatterns] = useState<Pattern[]>(createInitialPatterns);
  const [selectedPatternIndex, setSelectedPatternIndex] = useState(0);
  const [selectedInstrumentId, setSelectedInstrumentId] = useState<InstrumentId>('kick');
  const [auto, setAuto] = useState(false);
  const [bpm, setBpmRaw] = useState(DEFAULT_BPM);
  const [swing, setSwingRaw] = useState(DEFAULT_SWING);

  // Playback/UI state (isPlaying, playhead, AUTO, selected pattern) is
  // deliberately never persisted — only pattern content and BPM. A restart
  // always comes up stopped, on Pattern 1, AUTO off, exactly like the
  // pre-persistence defaults above.
  const hasLoadedRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadPatternState().then((restored) => {
      if (cancelled) return;
      if (restored) {
        setPatterns(restored.patterns);
        setBpmRaw(restored.bpm);
        setSwingRaw(restored.swing);
      }
      hasLoadedRef.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounced save, gated until the initial load has resolved so a restore
  // can never be clobbered by the default state a fresh render starts with.
  // The state update above is synchronous/immediate either way — only this
  // storage write is deferred.
  useEffect(() => {
    if (!hasLoadedRef.current) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      savePatternState({ patterns, bpm, swing });
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [patterns, bpm, swing]);

  const updateSelectedStep = useCallback(
    (stepIndex: number, updater: (current: number) => number) => {
      setPatterns((current) =>
        current.map((pattern, patternIndex) =>
          patternIndex !== selectedPatternIndex
            ? pattern
            : {
                ...pattern,
                instruments: pattern.instruments.map((instrument) =>
                  instrument.id === selectedInstrumentId
                    ? { ...instrument, steps: instrument.steps.map((value, i) => (i === stepIndex ? updater(value) : value)) }
                    : instrument,
                ),
              },
        ),
      );
    },
    [selectedPatternIndex, selectedInstrumentId],
  );

  /** Quick tap: plain on/off. */
  const toggleStep = useCallback(
    (stepIndex: number) => updateSelectedStep(stepIndex, toggleStepActive),
    [updateSelectedStep],
  );

  /** Long-press: cycles the step's velocity while keeping it active. */
  const cycleStepVelocity = useCallback(
    (stepIndex: number) => updateSelectedStep(stepIndex, cycleHoldVelocity),
    [updateSelectedStep],
  );

  /** Clears only the selected instrument within the selected pattern — every other pattern, and every other drum, is untouched. */
  const resetSelectedInstrument = useCallback(() => {
    setPatterns((current) =>
      current.map((pattern, patternIndex) =>
        patternIndex !== selectedPatternIndex
          ? pattern
          : {
              ...pattern,
              instruments: pattern.instruments.map((instrument) =>
                instrument.id === selectedInstrumentId
                  ? { ...instrument, steps: Array(pattern.stepCount).fill(0) }
                  : instrument,
              ),
            },
      ),
    );
  }, [selectedPatternIndex, selectedInstrumentId]);

  /** Clears every instrument within the given pattern — every other pattern is untouched. */
  const resetPattern = useCallback((patternIndex: number) => {
    setPatterns((current) =>
      current.map((pattern, index) =>
        index !== patternIndex
          ? pattern
          : {
              ...pattern,
              instruments: pattern.instruments.map((instrument) => ({ ...instrument, steps: Array(pattern.stepCount).fill(0) })),
            },
      ),
    );
  }, []);

  /** Clears every instrument in every pattern. */
  const resetAllPatterns = useCallback(() => {
    setPatterns((current) =>
      current.map((pattern) => ({
        ...pattern,
        instruments: pattern.instruments.map((instrument) => ({ ...instrument, steps: Array(pattern.stepCount).fill(0) })),
      })),
    );
  }, []);

  /**
   * Overwrites the target pattern with a full, independent copy of the
   * source pattern's content (all instruments, all steps/velocities). Every
   * instrument and its steps array is rebuilt fresh — never the source's own
   * array/object references — so subsequent edits to either pattern can
   * never leak into the other. Identity fields (id/name) stay the target's
   * own; global state (BPM, selection, AUTO) is untouched, since none of it
   * lives on the Pattern object to begin with.
   */
  const copyPattern = useCallback((sourceIndex: number, targetIndex: number) => {
    if (sourceIndex === targetIndex) return;
    setPatterns((current) => {
      const source = current[sourceIndex];
      return current.map((pattern, index) =>
        index !== targetIndex
          ? pattern
          : {
              ...pattern,
              stepCount: source.stepCount,
              instruments: source.instruments.map((instrument) => ({
                ...instrument,
                steps: [...instrument.steps],
              })),
            },
      );
    });
  }, []);

  const setBpm = useCallback((value: number | ((currentBpm: number) => number)) => {
    setBpmRaw((current) => {
      const nextValue = typeof value === 'function' ? value(current) : value;
      return Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(nextValue)));
    });
  }, []);

  /** Global, like BPM — never per-pattern. */
  const setSwing = useCallback((value: number | ((currentSwing: number) => number)) => {
    setSwingRaw((current) => {
      const nextValue = typeof value === 'function' ? value(current) : value;
      return Math.min(MAX_SWING, Math.max(MIN_SWING, Math.round(nextValue)));
    });
  }, []);

  const selectedPattern = useMemo(() => patterns[selectedPatternIndex], [patterns, selectedPatternIndex]);
  const selectedInstrument = useMemo(
    () => selectedPattern.instruments.find((instrument) => instrument.id === selectedInstrumentId)!,
    [selectedPattern, selectedInstrumentId],
  );

  /** One flag per pattern: does it have any active step, on any instrument? Drives the pattern-selector's empty/has-content indicator. */
  const patternHasContent = useMemo(
    () => patterns.map((pattern) => pattern.instruments.some((instrument) => instrument.steps.some((velocity) => velocity > 0))),
    [patterns],
  );

  return {
    patterns,
    patternHasContent,
    selectedPatternIndex,
    setSelectedPatternIndex,
    auto,
    setAuto,
    selectedInstrumentId,
    setSelectedInstrumentId,
    selectedSteps: selectedInstrument.steps,
    toggleStep,
    cycleStepVelocity,
    resetSelectedInstrument,
    resetPattern,
    resetAllPatterns,
    copyPattern,
    bpm,
    setBpm,
    swing,
    setSwing,
  };
}
