import { useCallback, useRef, useState } from 'react';
import { AudioManager, AudioRecorder, FileFormat, FilePreset } from 'react-native-audio-api';

/**
 * Mic-recording mechanics for the "record your own sample" feature —
 * entirely separate from useDrumAudioEngine's persistent AudioContext, since
 * AudioRecorder isn't tied to one. A fresh AudioRecorder is created per
 * recording (cheap — this isn't a per-hit hot path like the drum engine) and
 * discarded once stopped.
 *
 * Callers get back a file URI (written to disk via enableFileOutput) that's
 * ready to hand to useCustomSamples' recordCustomSample, which persists and
 * decodes it exactly like a picked file.
 */

const DURATION_POLL_MS = 100;

export function useAudioRecorder() {
  const recorderRef = useRef<AudioRecorder | null>(null);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState(0);

  const stopDurationTimer = () => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
  };

  /** Checks first (cheap, no OS prompt) and only requests — which may show the system prompt — if not already decided. */
  const ensurePermission = useCallback(async (): Promise<boolean> => {
    const current = await AudioManager.checkRecordingPermissions();
    if (current === 'Granted') return true;
    const requested = await AudioManager.requestRecordingPermissions();
    return requested === 'Granted';
  }, []);

  /** Returns whether recording actually started — false on denied permission or a native start failure. */
  const startRecording = useCallback(async (): Promise<boolean> => {
    const granted = await ensurePermission();
    if (!granted) return false;

    // 'playback' (the app's default category) can't record. 'playAndRecord'
    // supports both, so pad-preview playback while the record modal is open
    // keeps working.
    AudioManager.setAudioSessionOptions({ iosCategory: 'playAndRecord' });

    const recorder = new AudioRecorder({ iosVoiceProcessing: false });
    recorder.enableFileOutput({ format: FileFormat.M4A, preset: FilePreset.High });

    const result = await recorder.start();
    if (result.status !== 'success') {
      return false;
    }

    recorderRef.current = recorder;
    setDurationSeconds(0);
    setIsRecording(true);
    durationTimerRef.current = setInterval(() => {
      setDurationSeconds(recorder.getCurrentDuration());
    }, DURATION_POLL_MS);
    return true;
  }, [ensurePermission]);

  /** Stops the active recording and returns the recorded file's URI, or null if nothing was captured. */
  const stopRecording = useCallback(async (): Promise<string | null> => {
    const recorder = recorderRef.current;
    stopDurationTimer();
    setIsRecording(false);
    recorderRef.current = null;
    if (!recorder) return null;

    const result = await recorder.stop();
    if (result.status !== 'success' || result.paths.length === 0) return null;
    return result.paths[0];
  }, []);

  /** Discards an in-progress recording (e.g. the modal was dismissed mid-recording) without returning a file. */
  const cancelRecording = useCallback(() => {
    const recorder = recorderRef.current;
    stopDurationTimer();
    setIsRecording(false);
    recorderRef.current = null;
    if (recorder) {
      void recorder.stop();
    }
  }, []);

  return { isRecording, durationSeconds, startRecording, stopRecording, cancelRecording };
}
