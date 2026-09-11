import { useEffect, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, View } from 'react-native';

import { useAudioRecorder } from '@/audio/use-audio-recorder';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { INSTRUMENT_DEFINITIONS } from '@/constants/drums';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { InstrumentId } from '@/types/pattern';
import { shadeColor } from '@/utils/color';

// A dedicated recording-red, distinct from the app's orange accent — "REC"
// is a near-universal color cue, worth breaking from the hardware palette
// for.
const RECORD_RED = '#FF3B30';

type RecordSampleModalProps = {
  visible: boolean;
  onClose: () => void;
  instrumentId: InstrumentId;
  /** Called with the recorded file's URI once a recording is stopped and has audio in it. */
  onRecorded: (uri: string) => void;
};

/**
 * Tap-to-start/tap-to-stop mic recording (Milestone follow-up to Custom
 * Samples): records straight to a file via useAudioRecorder, then hands the
 * resulting URI to the same commit path as picking a file
 * (useCustomSamples' recordCustomSample) — so a fresh recording becomes the
 * active custom sample immediately and is trimmable via the existing sample
 * editor, exactly like a loaded file.
 */
export function RecordSampleModal({ visible, onClose, instrumentId, onRecorded }: RecordSampleModalProps) {
  const theme = useTheme();
  const { isRecording, durationSeconds, startRecording, stopRecording, cancelRecording } = useAudioRecorder();
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [pulseAnim] = useState(() => new Animated.Value(1));

  const instrumentName = INSTRUMENT_DEFINITIONS.find((definition) => definition.id === instrumentId)?.name ?? '';

  useEffect(() => {
    if (!isRecording) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [isRecording, pulseAnim]);

  // Closing mid-recording (backdrop tap, hardware back) discards it rather
  // than silently leaving the recorder running in the background.
  const handleClose = () => {
    if (isRecording) cancelRecording();
    onClose();
  };

  const handlePressRecord = async () => {
    setPermissionDenied(false);
    const started = await startRecording();
    if (!started) setPermissionDenied(true);
  };

  const handlePressStop = async () => {
    const uri = await stopRecording();
    if (uri) onRecorded(uri);
    onClose();
  };

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <Pressable onPress={() => {}} style={styles.sheetWrapper}>
          <ThemedView type="backgroundElement" style={styles.sheet}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.title}>
              RECORD SAMPLE
            </ThemedText>
            <ThemedText type="smallBold" style={styles.instrumentName}>
              {instrumentName}
            </ThemedText>

            <View style={styles.stage}>
              {isRecording ? (
                <>
                  <Animated.View style={[styles.recordDot, { backgroundColor: RECORD_RED, opacity: pulseAnim }]} />
                  <ThemedText style={styles.timer}>{formatDuration(durationSeconds)}</ThemedText>
                </>
              ) : (
                <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
                  {permissionDenied ? 'Microphone access denied — enable it in Settings to record.' : 'Tap REC to start recording from the mic.'}
                </ThemedText>
              )}
            </View>

            <View style={styles.actionsRow}>
              {isRecording ? (
                <Pressable
                  onPress={handlePressStop}
                  accessibilityRole="button"
                  accessibilityLabel="Stop recording"
                  style={({ pressed }) => [styles.actionButton, { backgroundColor: theme.background }, pressed && styles.actionPressed]}>
                  <ThemedText type="small" style={styles.actionLabel}>
                    ■ STOP
                  </ThemedText>
                </Pressable>
              ) : (
                <Pressable
                  onPress={handlePressRecord}
                  accessibilityRole="button"
                  accessibilityLabel="Start recording"
                  style={({ pressed }) => [styles.actionButton, { backgroundColor: theme.background }, pressed && styles.actionPressed]}>
                  <ThemedText type="small" style={[styles.actionLabel, { color: RECORD_RED }]}>
                    ● REC
                  </ThemedText>
                </Pressable>
              )}
              <Pressable
                onPress={handleClose}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                style={({ pressed }) => [styles.actionButton, { backgroundColor: shadeColor(theme.backgroundElement, 12) }, pressed && styles.actionPressed]}>
                <ThemedText type="small" style={styles.actionLabel}>
                  CANCEL
                </ThemedText>
              </Pressable>
            </View>
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function formatDuration(seconds: number): string {
  const totalSeconds = Math.floor(seconds);
  const mm = Math.floor(totalSeconds / 60);
  const ss = totalSeconds % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
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
    maxWidth: 360,
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
  instrumentName: {
    marginBottom: Spacing.one,
  },
  stage: {
    minHeight: 90,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  recordDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  timer: {
    fontSize: 34,
    fontWeight: '700',
    fontFamily: Fonts.mono,
    letterSpacing: 1,
  },
  hint: {
    textAlign: 'center',
    paddingHorizontal: Spacing.two,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  actionButton: {
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
