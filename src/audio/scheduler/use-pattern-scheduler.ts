import { useCallback, useEffect, useRef } from 'react';

import type { InstrumentId, Pattern } from '@/types/pattern';

/**
 * Owns musical scheduling for a bank of Patterns, using the same look-ahead
 * design validated in the Milestone 13 spike: a JS timer only wakes the
 * scheduler periodically; the actual sound events are always scheduled with
 * AudioBufferSourceNode.start(when) (via scheduleTrigger) against the audio
 * clock (via getCurrentTime). The musical timeline advances by
 * `nextStepTime += stepDuration`, never by re-reading currentTime, so JS
 * callback jitter cannot accumulate into tempo drift.
 *
 * Also exposes getCurrentStep(), a pull-based read of "which step is audible
 * right now" derived from AudioContext.currentTime — for a UI playhead to
 * poll. This is deliberately not a push callback fired once per step: a pull
 * function can't itself become a clock, since nothing depends on how often
 * (or whether) it's called for the scheduling loop to stay correct.
 *
 * Milestone 20 adds pattern banks (1–8) and AUTO chaining on top of the same
 * single loop: patternsRef holds all 8 patterns' live data, activePatternRef
 * holds which one is currently playing. Which pattern is "active" can change
 * three ways, all handled entirely with refs so the audio-timing decision
 * never waits on a React render:
 *   - jumpToPattern(): a manual switch. Takes effect on the very next
 *     step — no timer/grid change, so the tempo stays perfectly locked; only
 *     which pattern's data the next step reads from changes.
 *   - AUTO advance: decided inside tick() itself, only at a step-16→1 wrap,
 *     by reading autoRef. onPatternChange (also ref-held) is fired purely so
 *     the UI can follow along — it is never read back by tick() itself.
 *   - Song Mode advance (Milestone 26): same wrap-boundary decision point as
 *     AUTO, and mutually exclusive with it — when songModeRef is on, the
 *     wrap reads the next *position* in songArrangementRef (a list of
 *     pattern indices) instead of just incrementing by one. songPositionRef
 *     always advances by one at every wrap regardless of whether the
 *     pattern index it points to actually changes — that's what makes an
 *     arrangement like [1, 1, 2] play pattern 1 twice for free, with no
 *     special-casing for repeats. jumpToPattern() (manual selection) never
 *     touches songPositionRef, by design — see its own docs below.
 *
 * Does not own the AudioContext or any AudioBuffers — those belong to
 * useDrumAudioEngine. Does not own React pattern state — the caller keeps
 * setPatterns() in sync with live pattern state (see policy note below).
 */

const LOOKAHEAD_INTERVAL_MS = 25;
const SCHEDULE_AHEAD_SECONDS = 0.1;
// 0% swing → 50/50 (straight). 100% swing → 66.7/33.3 (the classic
// triplet-adjacent max). swingRatio is "how far into the pair the delayed
// (odd) step falls," so it only ever moves between 1/2 and 2/3.
const MIN_SWING_RATIO = 0.5;
const MAX_SWING_RATIO = 2 / 3;

/**
 * Gap from the step just scheduled to the next one. Every step normally
 * advances by a full stepDuration; swing instead pairs steps (0,1), (2,3),
 * ... and redistributes each pair's *combined* duration (always exactly
 * 2×stepDuration, so pair boundaries — and therefore pattern length — never
 * move) between an on-the-beat even step and a delayed odd step. At
 * swing=0, swingRatio is exactly 0.5 and this reduces to the old
 * `stepDuration` for every step.
 */
function stepGap(stepIndex: number, stepDuration: number, swing: number): number {
  const swingRatio = MIN_SWING_RATIO + swing * (MAX_SWING_RATIO - MIN_SWING_RATIO);
  const pairDuration = stepDuration * 2;
  const isEvenStep = stepIndex % 2 === 0;
  return isEvenStep ? pairDuration * swingRatio : pairDuration * (1 - swingRatio);
}

type UsePatternSchedulerOptions = {
  isLoaded: boolean;
  getCurrentTime: () => number;
  scheduleTrigger: (instrumentId: InstrumentId, when: number, velocity?: number) => void;
  /** Fired when AUTO advances to a new pattern, so the UI can follow along. Never read back by the scheduler itself. */
  onPatternChange?: (patternIndex: number) => void;
};

type ScheduledStep = { step: number; time: number };

export function usePatternScheduler({
  isLoaded,
  getCurrentTime,
  scheduleTrigger,
  onPatternChange,
}: UsePatternSchedulerOptions) {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const nextStepTimeRef = useRef(0);
  const currentStepRef = useRef(0);
  const stepDurationRef = useRef(60 / 120 / 4);
  // Fraction 0..1 (UI percent / 100) — see stepGap() above.
  const swingRef = useRef(0);
  const patternsRef = useRef<Pattern[]>([]);
  const activePatternRef = useRef(0);
  const autoRef = useRef(false);
  const songModeRef = useRef(false);
  const songArrangementRef = useRef<number[]>([]);
  const songPositionRef = useRef(0);
  const onPatternChangeRef = useRef(onPatternChange);
  // Recently-scheduled (step, time) pairs, oldest first — lets getCurrentStep
  // find "the most recent step whose time has already passed" without
  // affecting the scheduling loop above in any way.
  const scheduledQueueRef = useRef<ScheduledStep[]>([]);

  useEffect(() => {
    onPatternChangeRef.current = onPatternChange;
  }, [onPatternChange]);

  const tick = useCallback(() => {
    const patterns = patternsRef.current;
    if (patterns.length === 0) return;

    const currentTime = getCurrentTime();
    while (nextStepTimeRef.current < currentTime + SCHEDULE_AHEAD_SECONDS) {
      const stepIndex = currentStepRef.current;
      const scheduledTime = nextStepTimeRef.current;
      const pattern = patterns[activePatternRef.current];

      for (const instrument of pattern.instruments) {
        const velocity = instrument.steps[stepIndex];
        if (velocity > 0) {
          scheduleTrigger(instrument.id, scheduledTime, velocity);
        }
      }

      scheduledQueueRef.current.push({ step: stepIndex, time: scheduledTime });

      nextStepTimeRef.current += stepGap(stepIndex, stepDurationRef.current, swingRef.current);

      const wrapped = stepIndex === pattern.stepCount - 1;
      currentStepRef.current = wrapped ? 0 : stepIndex + 1;

      // Pattern-boundary decision: only ever made here, only at a real
      // 16→1 wrap, so it can never cut a pattern off mid-way. Song Mode
      // takes priority over AUTO when both would apply (they're presented
      // as mutually exclusive in the UI, but this order is the tie-break if
      // that ever changes); neither touched simply keeps playing the same
      // index — an explicit no-op re-read, not a special case.
      if (wrapped) {
        const previousIndex = activePatternRef.current;
        const arrangement = songArrangementRef.current;
        let nextIndex = previousIndex;
        if (songModeRef.current && arrangement.length > 0) {
          const nextPosition = (songPositionRef.current + 1) % arrangement.length;
          songPositionRef.current = nextPosition;
          nextIndex = arrangement[nextPosition];
        } else if (autoRef.current) {
          nextIndex = (previousIndex + 1) % patterns.length;
        }
        if (nextIndex !== previousIndex) {
          activePatternRef.current = nextIndex;
          onPatternChangeRef.current?.(nextIndex);
        }
      }
    }
  }, [getCurrentTime, scheduleTrigger]);

  /**
   * Live pattern policy: the caller (index.tsx) keeps this in sync with all
   * 8 patterns' state on every change, whether or not the loop is running.
   * Because tick() re-reads patternsRef on every scheduling cycle, edits made
   * while playing take effect for the next not-yet-scheduled step — typically
   * within one look-ahead window (~100ms), not "next Play after Stop". A step
   * that has already been handed to scheduleTrigger (its sound already
   * dispatched) can't be un-played — that's an inherent limit of any
   * look-ahead scheduler, not something to work around here.
   */
  const setPatterns = useCallback((patterns: Pattern[]) => {
    patternsRef.current = patterns;
  }, []);

  /** Kept in sync continuously (like setPatterns/setBpm) — see tick()'s wrap-boundary read. */
  const setAuto = useCallback((enabled: boolean) => {
    autoRef.current = enabled;
  }, []);

  /** Kept in sync continuously, like setAuto — Song Mode and AUTO are mutually exclusive at the UI level; tick() prefers Song Mode when both happen to be set. */
  const setSongMode = useCallback((enabled: boolean) => {
    songModeRef.current = enabled;
  }, []);

  /**
   * Live arrangement policy, same as setPatterns: the caller keeps this in
   * sync with the Song state on every change. Only ever read at a wrap
   * boundary, so mid-playback edits (add/remove/reorder) take effect for the
   * *next* transition, never retroactively. If the arrangement shrinks
   * enough that songPositionRef's next value would be out of range, the
   * `% arrangement.length` in tick() already wraps it back into range —
   * no separate clamping needed here.
   */
  const setSongArrangement = useCallback((arrangement: number[]) => {
    songArrangementRef.current = arrangement;
  }, []);

  /**
   * Manual pattern switch while playing. Deliberately touches only which
   * pattern + step the *next* tick reads from — never nextStepTimeRef — so
   * the tempo grid itself is untouched and the switch lands cleanly on the
   * next regularly-timed step, with the new pattern starting at step 1. A
   * few already-committed steps from the old pattern (inside the current
   * ~100ms look-ahead window) may still be audible; that's the same
   * unavoidable look-ahead latency as any live edit, not a new limitation.
   *
   * Deliberately never touches songPositionRef (Milestone 26): manually
   * picking a pattern while Song Mode is on is a temporary preview, not a
   * re-seek of the arrangement — the song keeps its own place and resumes
   * the arrangement, unaffected, at the next wrap boundary.
   */
  const jumpToPattern = useCallback((patternIndex: number) => {
    if (!timerRef.current) return; // not playing — nothing to redirect
    activePatternRef.current = patternIndex;
    currentStepRef.current = 0;
  }, []);

  const start = useCallback(
    (initialPatternIndex: number) => {
      if (!isLoaded || timerRef.current || patternsRef.current.length === 0) return; // not ready, or already running

      activePatternRef.current = initialPatternIndex;
      currentStepRef.current = 0;
      // A fresh Play always starts the song from its own top — see the
      // caller (AppProvider's handlePlay), which is responsible for also
      // passing arrangement[0] as initialPatternIndex when Song Mode is on,
      // keeping this reset in sync with what's actually about to play.
      songPositionRef.current = 0;
      nextStepTimeRef.current = getCurrentTime() + 0.05;
      scheduledQueueRef.current = [];
      timerRef.current = setInterval(tick, LOOKAHEAD_INTERVAL_MS);
    },
    [isLoaded, getCurrentTime, tick],
  );

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /**
   * Updates tempo for the currently-running loop (or the next one). Applies
   * from the next scheduled step onward — steps already inside the look-ahead
   * window keep their committed time. No interpolation/ramping.
   */
  const setBpm = useCallback((bpm: number) => {
    stepDurationRef.current = 60 / bpm / 4;
  }, []);

  /**
   * Same live-update policy as setBpm/setPatterns/setAuto: only affects the
   * gap computed for steps not yet scheduled. `percent` is the UI's 0–100
   * value; stored internally as a 0–1 fraction for stepGap().
   */
  const setSwing = useCallback((percent: number) => {
    swingRef.current = percent / 100;
  }, []);

  /**
   * Returns the step that should currently be audible, or null if stopped or
   * still in the brief pre-roll before the first step's scheduled time. Pure
   * read of refs + the audio clock — safe to call as often as a UI wants
   * (e.g. every animation frame) with no effect on scheduling.
   */
  const getCurrentStep = useCallback((): number | null => {
    if (!timerRef.current) return null;

    const currentTime = getCurrentTime();
    const queue = scheduledQueueRef.current;
    let matchIndex = -1;
    for (let i = 0; i < queue.length; i++) {
      if (queue[i].time <= currentTime) {
        matchIndex = i;
      } else {
        break;
      }
    }
    if (matchIndex === -1) return null;

    if (matchIndex > 0) {
      queue.splice(0, matchIndex); // drop entries older than the current match
    }
    return queue[0].step;
  }, [getCurrentTime]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return { start, stop, setBpm, setSwing, setPatterns, setAuto, setSongMode, setSongArrangement, jumpToPattern, getCurrentStep };
}
