import { useMemo, useState } from 'react';
import { Modal, PanResponder, Pressable, StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { InstrumentId } from '@/types/pattern';
import { shadeColor } from '@/utils/color';

type SampleEditorModalProps = {
  visible: boolean;
  onClose: () => void;
  instrumentId: InstrumentId;
  sampleName: string;
  trim: { start: number; end: number };
  onChangeTrim: (start: number, end: number) => void;
  onPreview: () => void;
  getActiveSampleDuration: (instrumentId: InstrumentId) => number | null;
  getWaveformPeaks: (instrumentId: InstrumentId, bucketCount: number) => Float32Array | null;
};

const BUCKET_COUNT = 100;
const WAVEFORM_HEIGHT = 110;
const HANDLE_SIZE = 22;
// Fraction — keeps the two handles from ever colliding/inverting, so
// there's always at least a sliver of audible sample left either way.
const MIN_TRIM_GAP = 0.02;

/**
 * A trim-only sample editor for the currently-active *custom* sample
 * (Milestone "edit sample" follow-up to Milestone 24) — bundled samples
 * always play in full. The waveform is a plain row of Views sized from a
 * peak-per-bucket downsample (see useDrumAudioEngine's getWaveformPeaks) —
 * no SVG/chart library. Both handles share one PanResponder on the track
 * itself (grant picks whichever handle is closer to the touch, then drags
 * that one for the rest of the gesture) rather than each handle owning its
 * own responder, which sidesteps needing per-handle screen-position math.
 * Every drag tick applies live — same "no save button" philosophy as the
 * FX sliders.
 */
export function SampleEditorModal({
  visible,
  onClose,
  instrumentId,
  sampleName,
  trim,
  onChangeTrim,
  onPreview,
  getActiveSampleDuration,
  getWaveformPeaks,
}: SampleEditorModalProps) {
  const theme = useTheme();
  const [trackWidth, setTrackWidth] = useState(0);
  const [activeHandle, setActiveHandle] = useState<'start' | 'end' | null>(null);

  // Derived, not independent state — recomputed only when the modal opens
  // for a (possibly different) instrument, not on every drag-tick
  // re-render. useMemo instead of an effect+setState pair since this is a
  // pure read, not a side effect to synchronize.
  const peaks = useMemo(
    () => (visible ? getWaveformPeaks(instrumentId, BUCKET_COUNT) : null),
    [visible, instrumentId, getWaveformPeaks],
  );
  const duration = useMemo(
    () => (visible ? getActiveSampleDuration(instrumentId) : null),
    [visible, instrumentId, getActiveSampleDuration],
  );

  const applyDrag = (handle: 'start' | 'end', ratio: number) => {
    if (handle === 'start') {
      const nextStart = Math.min(ratio, trim.end - MIN_TRIM_GAP);
      onChangeTrim(Math.max(0, nextStart), trim.end);
    } else {
      const nextEnd = Math.max(ratio, trim.start + MIN_TRIM_GAP);
      onChangeTrim(trim.start, Math.min(1, nextEnd));
    }
  };

  // Recreated every render, same as the FX sliders — cheap, and its
  // closures then always see the current trackWidth/trim/activeHandle
  // without a stale-ref pattern (activeHandle is state, not a ref, so
  // there's nothing here for the "no refs during render" rule to flag).
  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (event: GestureResponderEvent) => {
      if (trackWidth <= 0) return;
      const ratio = Math.min(1, Math.max(0, event.nativeEvent.locationX / trackWidth));
      const handle: 'start' | 'end' = Math.abs(ratio - trim.start) <= Math.abs(ratio - trim.end) ? 'start' : 'end';
      setActiveHandle(handle);
      applyDrag(handle, ratio);
    },
    onPanResponderMove: (event: GestureResponderEvent) => {
      if (trackWidth <= 0 || !activeHandle) return;
      const ratio = Math.min(1, Math.max(0, event.nativeEvent.locationX / trackWidth));
      applyDrag(activeHandle, ratio);
    },
    onPanResponderRelease: () => {
      setActiveHandle(null);
    },
    onPanResponderTerminate: () => {
      setActiveHandle(null);
    },
  });

  const handleTrackLayout = (event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  };

  const startSeconds = duration !== null ? trim.start * duration : null;
  const endSeconds = duration !== null ? trim.end * duration : null;

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={() => {}} style={styles.sheetWrapper}>
          <ThemedView type="backgroundElement" style={styles.sheet}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.title}>
              EDIT SAMPLE
            </ThemedText>
            <ThemedText type="smallBold" numberOfLines={1} style={styles.sampleName}>
              {sampleName}
            </ThemedText>

            <View
              style={[styles.waveform, { backgroundColor: theme.background }]}
              onLayout={handleTrackLayout}
              {...panResponder.panHandlers}>
              <View style={styles.bars}>
                {peaks &&
                  Array.from(peaks).map((peak, index) => (
                    <View
                      key={index}
                      style={[
                        styles.bar,
                        {
                          height: Math.max(2, peak * WAVEFORM_HEIGHT),
                          backgroundColor: theme.accent,
                        },
                      ]}
                    />
                  ))}
              </View>

              <View pointerEvents="none" style={[styles.dimOverlay, { left: 0, width: `${trim.start * 100}%` }]} />
              <View pointerEvents="none" style={[styles.dimOverlay, { left: `${trim.end * 100}%`, right: 0 }]} />

              <View pointerEvents="none" style={[styles.handle, { left: `${trim.start * 100}%`, backgroundColor: theme.accent }]} />
              <View pointerEvents="none" style={[styles.handle, { left: `${trim.end * 100}%`, backgroundColor: theme.accent }]} />
            </View>

            <View style={styles.timeRow}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.timeLabel}>
                {formatSeconds(startSeconds)}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.timeLabel}>
                {formatSeconds(endSeconds)}
              </ThemedText>
            </View>

            <View style={styles.actionsRow}>
              <Pressable
                onPress={onPreview}
                accessibilityRole="button"
                accessibilityLabel="Preview trimmed sample"
                style={({ pressed }) => [
                  styles.previewButton,
                  { backgroundColor: theme.background },
                  pressed && styles.actionPressed,
                ]}>
                <ThemedText type="small" themeColor="accent" style={styles.actionLabel}>
                  ▶ PREVIEW
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Done editing sample"
                style={({ pressed }) => [
                  styles.doneButton,
                  { backgroundColor: shadeColor(theme.backgroundElement, 12) },
                  pressed && styles.actionPressed,
                ]}>
                <ThemedText type="small" style={styles.actionLabel}>
                  DONE
                </ThemedText>
              </Pressable>
            </View>
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function formatSeconds(value: number | null): string {
  if (value === null) return '--';
  return `${value.toFixed(2)}s`;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
  },
  sheetWrapper: {
    width: '100%',
    maxWidth: 400,
  },
  sheet: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: Spacing.four,
    gap: Spacing.two,
  },
  title: {
    letterSpacing: 1.5,
    fontFamily: Fonts.mono,
  },
  sampleName: {
    marginBottom: Spacing.one,
  },
  waveform: {
    height: WAVEFORM_HEIGHT,
    borderRadius: 10,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'center',
    height: '100%',
    paddingHorizontal: Spacing.one,
  },
  bar: {
    flex: 1,
    marginHorizontal: 0.5,
    borderRadius: 1,
  },
  dimOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  handle: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: HANDLE_SIZE / 4,
    marginLeft: -HANDLE_SIZE / 8,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeLabel: {
    fontFamily: Fonts.mono,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  previewButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionPressed: {
    opacity: 0.7,
  },
  actionLabel: {
    fontFamily: Fonts.mono,
    letterSpacing: 1,
    fontWeight: '700',
  },
});
