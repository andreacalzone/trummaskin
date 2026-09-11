import { useCallback, useState } from 'react';

/**
 * Playback session state (running or not) — deliberately separate from
 * pattern data and, later, from the actual audio engine's own state.
 */
export function usePlaybackState() {
  const [isPlaying, setIsPlaying] = useState(false);

  const play = useCallback(() => setIsPlaying(true), []);
  const stop = useCallback(() => setIsPlaying(false), []);

  return { isPlaying, play, stop };
}
