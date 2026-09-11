import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { InstrumentPickerModal, InstrumentTrigger } from '@/components/sequencer/instrument-picker';
import { RecordSampleModal } from '@/components/sequencer/record-sample-modal';
import { SampleEditorModal } from '@/components/sequencer/sample-editor';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { InstrumentId } from '@/types/pattern';
import { shadeColor } from '@/utils/color';

type SampleTrim = { start: number; end: number };

type DrumSelectorProps = {
  selectedInstrumentId: InstrumentId;
  onSelect: (id: InstrumentId) => void;
  /** Display name of the active custom sample, or undefined when using the bundled default. */
  customSampleName?: string;
  onSelectCustomSample: () => void;
  onRecordCustomSample: (uri: string) => void;
  onRestoreDefaultSample: () => void;
  /** Only meaningful while a custom sample is active — bundled samples always play in full. */
  customSampleTrim?: SampleTrim;
  onChangeSampleTrim: (start: number, end: number) => void;
  onPreviewSample: () => void;
  getActiveSampleDuration: (instrumentId: InstrumentId) => number | null;
  getWaveformPeaks: (instrumentId: InstrumentId, bucketCount: number) => Float32Array | null;
};

const FULL_TRIM: SampleTrim = { start: 0, end: 1 };

export function DrumSelector({
  selectedInstrumentId,
  onSelect,
  customSampleName,
  onSelectCustomSample,
  onRecordCustomSample,
  onRestoreDefaultSample,
  customSampleTrim,
  onChangeSampleTrim,
  onPreviewSample,
  getActiveSampleDuration,
  getWaveformPeaks,
}: DrumSelectorProps) {
  const [open, setOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);
  const theme = useTheme();

  const triggerHighlight = shadeColor(theme.backgroundElement, 10);
  const triggerShadow = shadeColor(theme.backgroundElement, -10);

  return (
    <>
      <View
        style={[
          styles.panel,
          {
            backgroundColor: theme.backgroundElement,
            borderTopColor: triggerHighlight,
            borderLeftColor: triggerHighlight,
            borderBottomColor: triggerShadow,
            borderRightColor: triggerShadow,
          },
          styles.raised,
        ]}>
        <InstrumentTrigger label="DRUM" selectedInstrumentId={selectedInstrumentId} open={open} onPress={() => setOpen(true)} />

        <View style={[styles.divider, { backgroundColor: triggerShadow }]} />

        <View style={styles.sampleRow}>
          <ThemedText type="small" style={styles.sampleName} numberOfLines={1}>
            {customSampleName ?? 'Default sample'}
          </ThemedText>
          <View style={styles.sampleActions}>
            {customSampleName && (
              <Pressable
                onPress={onRestoreDefaultSample}
                accessibilityRole="button"
                accessibilityLabel="Use default sample"
                hitSlop={8}
                style={({ pressed }) => [
                  styles.sampleButton,
                  { backgroundColor: theme.background },
                  pressed && styles.sampleButtonPressed,
                ]}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.sampleButtonText}>
                  DEFAULT
                </ThemedText>
              </Pressable>
            )}
            {customSampleName && (
              <Pressable
                onPress={() => setEditorOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Edit sample"
                hitSlop={8}
                style={({ pressed }) => [
                  styles.sampleButton,
                  { backgroundColor: theme.background },
                  pressed && styles.sampleButtonPressed,
                ]}>
                <ThemedText type="small" themeColor="accent" style={styles.sampleButtonText}>
                  EDIT
                </ThemedText>
              </Pressable>
            )}
            <Pressable
              onPress={() => setRecordOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Record sample from microphone"
              hitSlop={8}
              style={({ pressed }) => [
                styles.sampleButton,
                { backgroundColor: theme.background },
                pressed && styles.sampleButtonPressed,
              ]}>
              <ThemedText type="small" themeColor="accent" style={styles.sampleButtonText}>
                REC
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={onSelectCustomSample}
              accessibilityRole="button"
              accessibilityLabel="Load sample"
              hitSlop={8}
              style={({ pressed }) => [
                styles.sampleButton,
                { backgroundColor: theme.background },
                pressed && styles.sampleButtonPressed,
              ]}>
              <ThemedText type="small" themeColor="accent" style={styles.sampleButtonText}>
                LOAD
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </View>

      <InstrumentPickerModal visible={open} selectedInstrumentId={selectedInstrumentId} onSelect={onSelect} onClose={() => setOpen(false)} />

      {customSampleName && (
        <SampleEditorModal
          visible={editorOpen}
          onClose={() => setEditorOpen(false)}
          instrumentId={selectedInstrumentId}
          sampleName={customSampleName}
          trim={customSampleTrim ?? FULL_TRIM}
          onChangeTrim={onChangeSampleTrim}
          onPreview={onPreviewSample}
          getActiveSampleDuration={getActiveSampleDuration}
          getWaveformPeaks={getWaveformPeaks}
        />
      )}

      <RecordSampleModal
        visible={recordOpen}
        onClose={() => setRecordOpen(false)}
        instrumentId={selectedInstrumentId}
        onRecorded={onRecordCustomSample}
      />
    </>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: 12,
    borderWidth: 2,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  raised: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.5,
      shadowRadius: 4,
    },
    android: {
      elevation: 3,
    },
    web: {
      boxShadow: '0 3px 4px rgba(0, 0, 0, 0.5)',
    },
    default: {},
  }),
  divider: {
    height: 1,
    marginVertical: Spacing.half,
    opacity: 0.6,
  },
  sampleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sampleName: {
    flex: 1,
    marginRight: Spacing.two,
    fontFamily: Fonts.mono,
    fontSize: 13,
  },
  sampleActions: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  sampleButton: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 6,
    borderRadius: 8,
  },
  sampleButtonPressed: {
    opacity: 0.6,
  },
  sampleButtonText: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    letterSpacing: 0.5,
    fontWeight: '700',
  },
});
