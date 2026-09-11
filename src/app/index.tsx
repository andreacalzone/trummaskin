import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { usePlayheadStep } from '@/audio/scheduler/use-playhead-step';
import { DrumSelector } from '@/components/sequencer/drum-selector';
import { PatternSelector } from '@/components/sequencer/pattern-selector';
import { SongArrangementEditor } from '@/components/sequencer/song-arrangement';
import { StepGrid } from '@/components/sequencer/step-grid';
import { TempoControl } from '@/components/sequencer/tempo-control';
import { TransportControls } from '@/components/sequencer/transport-controls';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppContext } from '@/state/app-context';
import { PATTERN_COUNT } from '@/state/use-pattern-state';
import { shadeColor } from '@/utils/color';

export default function HomeScreen() {
  const {
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
    songMode,
    songArrangement,
    handleToggleSongMode,
    addToArrangement,
    removeFromArrangement,
    moveArrangementItem,
  } = useAppContext();

  const currentStep = usePlayheadStep(isPlaying, getCurrentStep);
  const [songEditorOpen, setSongEditorOpen] = useState(false);

  // Turning Song Mode on immediately opens the arrangement editor (there's
  // nothing else to do with it yet), and turning it off closes the editor
  // along with it, rather than leaving a stale open modal around.
  const handleToggleSongModeAndEditor = () => {
    const turningOn = !songMode;
    handleToggleSongMode();
    setSongEditorOpen(turningOn);
  };

  return (
    <ThemedView style={styles.container}>
      {/* A faint top-down light falloff — the only "texture" on the hardware
          body. A soft native shadow blur, not an image, so it stays cheap. */}
      <View pointerEvents="none" style={styles.surfaceLightWrapper}>
        <View style={styles.surfaceLight} />
      </View>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.titleRow}>
          <View style={styles.titleSpacer} />
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.title}>
            GROOVEBOX
          </ThemedText>
          <FxButton onPress={() => router.push('/fx')} />
        </View>
        <PatternSelector
          patternCount={PATTERN_COUNT}
          selectedIndex={selectedPatternIndex}
          onSelect={handleSelectPattern}
          auto={auto}
          onToggleAuto={handleToggleAuto}
          onCopyPattern={handleCopyPattern}
          patternHasContent={patternHasContent}
          resetFlash={resetFlash}
          songMode={songMode}
          onToggleSongMode={handleToggleSongModeAndEditor}
          onEditArrangement={() => setSongEditorOpen(true)}
        />
        {/* Rendered as a Modal (see song-arrangement.tsx) so it never takes
            up main-screen layout space — an earlier inline version pushed
            the step grid down and partly behind the pads once the
            arrangement had more than a couple of patterns in it. */}
        <SongArrangementEditor
          visible={songEditorOpen}
          onClose={() => setSongEditorOpen(false)}
          arrangement={songArrangement}
          patternCount={PATTERN_COUNT}
          onAdd={addToArrangement}
          onRemove={removeFromArrangement}
          onMove={moveArrangementItem}
        />
        <TempoControl bpm={bpm} onChangeBpm={setBpm} swing={swing} onChangeSwing={setSwing} />
        <DrumSelector
          selectedInstrumentId={selectedInstrumentId}
          onSelect={setSelectedInstrumentId}
          customSampleName={customSampleNames[selectedInstrumentId]}
          onSelectCustomSample={handleSelectCustomSample}
          onRecordCustomSample={handleRecordCustomSample}
          onRestoreDefaultSample={handleRestoreDefaultSample}
          customSampleTrim={customSampleTrims[selectedInstrumentId]}
          onChangeSampleTrim={(start, end) => setSampleTrim(selectedInstrumentId, start, end)}
          onPreviewSample={() => trigger(selectedInstrumentId)}
          getActiveSampleDuration={getActiveSampleDuration}
          getWaveformPeaks={getWaveformPeaks}
        />
        <ThemedView style={styles.gridSection}>
          <StepGrid
            steps={selectedSteps}
            onToggleStep={handleStepPress}
            onLongPressStep={handleStepLongPress}
            currentStep={currentStep}
          />
        </ThemedView>
        <TransportControls
          isPlaying={isPlaying}
          onPlay={handlePlay}
          onStop={handleStop}
          onResetInstrument={resetSelectedInstrument}
          onResetPattern={handleResetPattern}
          onResetAllPatterns={handleResetAllPatterns}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const FX_BUTTON_SIZE = 40;

/** Same bevel/shadow language as every other hardware control — a compact, always-reachable way in to the FX page (Milestone 25 §1). */
function FxButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  const highlightColor = shadeColor(theme.backgroundElement, 10);
  const shadowColor = shadeColor(theme.backgroundElement, -10);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Open FX"
      hitSlop={6}
      style={({ pressed }) => [
        styles.fxButton,
        {
          backgroundColor: theme.backgroundElement,
          borderTopColor: highlightColor,
          borderLeftColor: highlightColor,
          borderBottomColor: shadowColor,
          borderRightColor: shadowColor,
        },
        pressed && styles.fxButtonPressed,
      ]}>
      <ThemedText type="smallBold" themeColor="accent" style={styles.fxButtonLabel}>
        FX
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  surfaceLightWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
  surfaceLight: {
    marginTop: -260,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'transparent',
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 40 },
    shadowOpacity: 0.05,
    shadowRadius: 220,
    ...Platform.select({
      web: { boxShadow: '0 40px 220px rgba(255, 255, 255, 0.05)' },
      default: {},
    }),
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
    gap: Spacing.two,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleSpacer: {
    width: FX_BUTTON_SIZE,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    letterSpacing: 3,
    fontFamily: Fonts.mono,
  },
  fxButton: {
    width: FX_BUTTON_SIZE,
    height: FX_BUTTON_SIZE,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.5,
        shadowRadius: 4,
      },
      android: { elevation: 3 },
      web: { boxShadow: '0 3px 4px rgba(0, 0, 0, 0.5)' },
      default: {},
    }),
  },
  fxButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.94 }],
  },
  fxButtonLabel: {
    fontSize: 12,
    letterSpacing: 0.5,
    fontFamily: Fonts.mono,
  },
  gridSection: {
    flex: 1,
    justifyContent: 'center',
  },
});
