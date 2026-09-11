import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { usePatternScheduler } from '@/audio/scheduler/use-pattern-scheduler';
import { useCustomSamples } from '@/audio/use-custom-samples';
import { useDrumAudioEngine } from '@/audio/use-drum-audio-engine';
import type { ResetFlash } from '@/components/sequencer/pattern-selector';
import { cycleHoldVelocity, toggleStepActive } from '@/constants/velocity';
import { useFxState } from '@/state/use-fx-state';
import { usePatternState } from '@/state/use-pattern-state';
import { usePlaybackState } from '@/state/use-playback-state';
import { useSongState } from '@/state/use-song-state';

/**
 * Everything the sequencer needs — pattern/playback state, the audio
 * engine, the scheduler, custom samples, and (Milestone 25) FX — is
 * instantiated exactly once here, at the navigator root, instead of inside
 * the main screen. That's what lets a second screen (the FX page) reach the
 * *same* AudioContext/scheduler/state rather than standing up a duplicate
 * audio engine: Expo Router's Stack keeps every screen mounted underneath
 * the active one, so this provider (and the scheduler's setInterval/
 * AudioContext inside it) is never torn down by navigating — playback
 * simply continues regardless of which screen is on top (Milestone 25
 * §16).
 *
 * This is a straight relocation of what used to be called directly inside
 * index.tsx — no hook's own behavior changes, only where it's instantiated.
 */
function useAppState() {
  const {
    patterns,
    patternHasContent,
    selectedPatternIndex,
    setSelectedPatternIndex,
    auto,
    setAuto,
    selectedInstrumentId,
    setSelectedInstrumentId,
    selectedSteps,
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
  } = usePatternState();
  const [resetFlash, setResetFlash] = useState<ResetFlash>(null);
  const { isPlaying, play, stop } = usePlaybackState();
  const { songMode, setSongMode, arrangement: songArrangement, addToArrangement, removeFromArrangement, moveArrangementItem } = useSongState();

  const engine = useDrumAudioEngine();
  const { isLoaded, trigger, scheduleTrigger, getCurrentTime, getActiveSampleDuration, getWaveformPeaks } = engine;
  const { customSampleNames, customSampleTrims, selectCustomSample, recordCustomSample, restoreDefaultSample, setSampleTrim } = useCustomSamples(engine);
  const { drumFx, masterFx, setDrumFxParam, setMasterFxParam } = useFxState(engine);

  // AUTO advancing to a new pattern only updates *which* pattern is shown/
  // edited — it must never re-enter the scheduler (that would fight with the
  // transition tick() just made on its own). Kept as a ref-stable callback.
  const handlePatternChange = useCallback(
    (index: number) => {
      setSelectedPatternIndex(index);
    },
    [setSelectedPatternIndex],
  );
  const {
    start: startScheduler,
    stop: stopScheduler,
    setBpm: setSchedulerBpm,
    setSwing: setSchedulerSwing,
    setPatterns: setSchedulerPatterns,
    setAuto: setSchedulerAuto,
    setSongMode: setSchedulerSongMode,
    setSongArrangement: setSchedulerSongArrangement,
    jumpToPattern,
    getCurrentStep,
  } = usePatternScheduler({
    isLoaded,
    getCurrentTime,
    scheduleTrigger,
    onPatternChange: handlePatternChange,
  });
  const isPlayingRef = useRef(isPlaying);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // BPM, pattern data, and AUTO all apply live: the scheduler re-reads them
  // on its next scheduling cycle (~100ms look-ahead), whether or not it's
  // currently running — no restart needed, no ramping/interpolation.
  useEffect(() => {
    setSchedulerBpm(bpm);
  }, [bpm, setSchedulerBpm]);

  useEffect(() => {
    setSchedulerSwing(swing);
  }, [swing, setSchedulerSwing]);

  useEffect(() => {
    setSchedulerPatterns(patterns);
  }, [patterns, setSchedulerPatterns]);

  useEffect(() => {
    setSchedulerAuto(auto);
  }, [auto, setSchedulerAuto]);

  useEffect(() => {
    setSchedulerSongMode(songMode);
  }, [songMode, setSchedulerSongMode]);

  useEffect(() => {
    setSchedulerSongArrangement(songArrangement);
  }, [songArrangement, setSchedulerSongArrangement]);

  // Manual pattern pick: switches the display immediately, and — only while
  // playing — redirects the scheduler to start that pattern at step 1 on the
  // very next step (see jumpToPattern's own docs for why that's safe).
  // AUTO-driven changes go through handlePatternChange above instead, so
  // this is never called re-entrantly from the scheduler's own callback.
  const handleSelectPattern = useCallback(
    (index: number) => {
      setSelectedPatternIndex(index);
      if (isPlayingRef.current) {
        jumpToPattern(index);
      }
    },
    [setSelectedPatternIndex, jumpToPattern],
  );

  // Copying is a pattern-*data* operation (setPatterns, same as any edit) —
  // it never touches the scheduler directly. Selecting the destination
  // afterward reuses the exact same manual-switch path as a plain pattern
  // tap, so it gets the same "jump cleanly on the next step while playing"
  // behavior for free, with no new transport logic.
  const handleCopyPattern = useCallback(
    (sourceIndex: number, targetIndex: number) => {
      copyPattern(sourceIndex, targetIndex);
      handleSelectPattern(targetIndex);
    },
    [copyPattern, handleSelectPattern],
  );

  const handleStepPress = useCallback(
    (stepIndex: number) => {
      const newVelocity = toggleStepActive(selectedSteps[stepIndex]);
      toggleStep(stepIndex);
      // Skip the (silent) trigger when deactivating.
      if (newVelocity > 0) {
        trigger(selectedInstrumentId, newVelocity);
      }
    },
    [selectedSteps, toggleStep, trigger, selectedInstrumentId],
  );

  const handleStepLongPress = useCallback(
    (stepIndex: number) => {
      const newVelocity = cycleHoldVelocity(selectedSteps[stepIndex]);
      cycleStepVelocity(stepIndex);
      // Holding always results in an active state, so always preview it.
      trigger(selectedInstrumentId, newVelocity);
    },
    [selectedSteps, cycleStepVelocity, trigger, selectedInstrumentId],
  );

  // Song Mode always starts a fresh Play from the top of the arrangement —
  // like a tape deck, not a "resume where I left off." Song Mode OFF (or an
  // empty arrangement) starts from whatever's selected on the grid, exactly
  // as before Milestone 26. Keeping the grid's own selection in sync here
  // too means what's displayed never lags behind what's actually playing.
  const handlePlay = useCallback(() => {
    const startIndex = songMode && songArrangement.length > 0 ? songArrangement[0] : selectedPatternIndex;
    if (startIndex !== selectedPatternIndex) {
      setSelectedPatternIndex(startIndex);
    }
    startScheduler(startIndex);
    play();
  }, [startScheduler, play, selectedPatternIndex, setSelectedPatternIndex, songMode, songArrangement]);

  const handleToggleSongMode = useCallback(() => {
    setSongMode(!songMode);
  }, [setSongMode, songMode]);

  const handleStop = useCallback(() => {
    stopScheduler();
    stop();
  }, [stopScheduler, stop]);

  const handleToggleAuto = useCallback(() => {
    setAuto((current) => !current);
  }, [setAuto]);

  const handleSelectCustomSample = useCallback(() => {
    void selectCustomSample(selectedInstrumentId);
  }, [selectCustomSample, selectedInstrumentId]);

  const handleRecordCustomSample = useCallback(
    (recordedFileUri: string) => {
      void recordCustomSample(selectedInstrumentId, recordedFileUri);
    },
    [recordCustomSample, selectedInstrumentId],
  );

  const handleRestoreDefaultSample = useCallback(() => {
    void restoreDefaultSample(selectedInstrumentId);
  }, [restoreDefaultSample, selectedInstrumentId]);

  const handleResetPattern = useCallback(() => {
    resetPattern(selectedPatternIndex);
    setResetFlash({ tier: 'pattern', token: Date.now() });
  }, [resetPattern, selectedPatternIndex]);

  const handleResetAllPatterns = useCallback(() => {
    resetAllPatterns();
    setResetFlash({ tier: 'all', token: Date.now() });
  }, [resetAllPatterns]);

  return {
    // Pattern/UI state
    patterns,
    patternHasContent,
    selectedPatternIndex,
    auto,
    selectedInstrumentId,
    setSelectedInstrumentId,
    selectedSteps,
    resetSelectedInstrument,
    bpm,
    setBpm,
    swing,
    setSwing,
    resetFlash,
    isPlaying,
    isLoaded,
    customSampleNames,
    customSampleTrims,
    setSampleTrim,
    getActiveSampleDuration,
    getWaveformPeaks,
    trigger,
    getCurrentStep,
    handleSelectPattern,
    handleCopyPattern,
    handleStepPress,
    handleStepLongPress,
    handlePlay,
    handleStop,
    handleToggleAuto,
    handleSelectCustomSample,
    handleRecordCustomSample,
    handleRestoreDefaultSample,
    handleResetPattern,
    handleResetAllPatterns,
    // FX (Milestone 25)
    drumFx,
    masterFx,
    setDrumFxParam,
    setMasterFxParam,
    // Song Mode (Milestone 26)
    songMode,
    songArrangement,
    handleToggleSongMode,
    addToArrangement,
    removeFromArrangement,
    moveArrangementItem,
  };
}

type AppContextValue = ReturnType<typeof useAppState>;

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const value = useAppState();
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
}
