import { useCallback, useRef, useState } from 'react';

/**
 * Web counterpart to use-audio-recorder.ts. react-native-audio-api's
 * AudioRecorder is a thin wrapper over a native (iOS/Android) JSI binding —
 * `globalThis.createAudioRecorder` — that simply doesn't exist on web, so
 * `new AudioRecorder(...)` throws immediately there ("AudioRecorder is not
 * a constructor"), crashing the record modal. This reimplements the same
 * `{ isRecording, durationSeconds, startRecording, stopRecording,
 * cancelRecording }` contract using the browser's own recording primitives
 * (getUserMedia + MediaRecorder) so RecordSampleModal needs no changes at
 * all — Metro picks this file automatically when bundling for web.
 *
 * stopRecording() resolves to a `blob:` object URL (instead of a native
 * file:// URI) pointing at the recorded audio. That URL is directly
 * fetchable/decodable, and use-custom-samples.web.ts's recordCustomSample
 * re-fetches it to get the raw Blob back for IndexedDB persistence.
 */

const DURATION_POLL_MS = 100;

export function useAudioRecorder() {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef(0);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState(0);

  const stopDurationTimer = () => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
  };

  const teardownStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  /** Returns whether recording actually started — false on denied permission, no mic, or the browser lacking MediaRecorder support. */
  const startRecording = useCallback(async (): Promise<boolean> => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      return false;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      console.warn('[use-audio-recorder.web] Microphone permission denied or unavailable.', error);
      return false;
    }

    streamRef.current = stream;
    chunksRef.current = [];

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream);
    } catch (error) {
      console.warn('[use-audio-recorder.web] Failed to create MediaRecorder.', error);
      teardownStream();
      return false;
    }

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.start();
    mediaRecorderRef.current = recorder;

    startTimeRef.current = Date.now();
    setDurationSeconds(0);
    setIsRecording(true);
    durationTimerRef.current = setInterval(() => {
      setDurationSeconds((Date.now() - startTimeRef.current) / 1000);
    }, DURATION_POLL_MS);
    return true;
  }, []);

  /** Stops the active recording and returns a blob: URL for the recorded audio, or null if nothing was captured. */
  const stopRecording = useCallback(async (): Promise<string | null> => {
    const recorder = mediaRecorderRef.current;
    stopDurationTimer();
    setIsRecording(false);
    mediaRecorderRef.current = null;
    if (!recorder) {
      teardownStream();
      return null;
    }

    const blob = await new Promise<Blob | null>((resolve) => {
      recorder.onstop = () => {
        resolve(chunksRef.current.length === 0 ? null : new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' }));
      };
      if (recorder.state === 'inactive') {
        resolve(chunksRef.current.length === 0 ? null : new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' }));
      } else {
        recorder.stop();
      }
    });
    teardownStream();

    if (!blob || blob.size === 0) return null;
    return URL.createObjectURL(blob);
  }, []);

  /** Discards an in-progress recording (e.g. the modal was dismissed mid-recording) without returning a file. */
  const cancelRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    stopDurationTimer();
    setIsRecording(false);
    mediaRecorderRef.current = null;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null;
      recorder.stop();
    }
    teardownStream();
  }, []);

  return { isRecording, durationSeconds, startRecording, stopRecording, cancelRecording };
}
