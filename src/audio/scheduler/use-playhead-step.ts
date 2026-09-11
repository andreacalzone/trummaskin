import { useEffect, useRef, useState } from 'react';

/**
 * Turns the scheduler's pull-based getCurrentStep() into React state for
 * rendering a playhead. Polls once per animation frame while playing and
 * only calls setState when the derived step actually changes.
 *
 * This is a visualization, not a clock: it never calls scheduleTrigger, never
 * writes to the scheduler, and has no bearing on audio timing whether it
 * runs smoothly, drops frames, or is unmounted entirely — the scheduler's
 * own setInterval + AudioContext.currentTime remain the sole timing
 * authority regardless of what this hook does.
 */
export function usePlayheadStep(isPlaying: boolean, getCurrentStep: () => number | null) {
  const [currentStep, setCurrentStep] = useState<number | null>(null);
  const lastStepRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isPlaying) {
      lastStepRef.current = null;
      return;
    }

    function frame() {
      const step = getCurrentStep();
      if (step !== lastStepRef.current) {
        lastStepRef.current = step;
        setCurrentStep(step);
      }
      frameRef.current = requestAnimationFrame(frame);
    }

    frameRef.current = requestAnimationFrame(frame);

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [isPlaying, getCurrentStep]);

  // Derived rather than synced via setState-in-effect: stopped always reads
  // as "no playhead" immediately, regardless of whatever currentStep was
  // last holding.
  return isPlaying ? currentStep : null;
}
