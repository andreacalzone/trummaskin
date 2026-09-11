import { useEffect, useRef } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ALL_PATTERNS_RESET_HOLD_MS, PATTERN_RESET_HOLD_MS } from '@/constants/sequencer';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { shadeColor, withAlpha } from '@/utils/color';

type TransportControlsProps = {
  isPlaying: boolean;
  onPlay: () => void;
  onStop: () => void;
  /** Plain tap: resets only the selected instrument within the current pattern. */
  onResetInstrument: () => void;
  /** Hold past PATTERN_RESET_HOLD_MS: resets every instrument in the current pattern. */
  onResetPattern: () => void;
  /** Hold past ALL_PATTERNS_RESET_HOLD_MS: resets every pattern. */
  onResetAllPatterns: () => void;
};

export function TransportControls({
  isPlaying,
  onPlay,
  onStop,
  onResetInstrument,
  onResetPattern,
  onResetAllPatterns,
}: TransportControlsProps) {
  return (
    <View style={styles.row}>
      <ResetButton onTap={onResetInstrument} onHoldPattern={onResetPattern} onHoldAll={onResetAllPatterns} />
      <TransportButton label={isPlaying ? 'PLAYING' : 'PLAY'} onPress={onPlay} active={isPlaying} />
      <TransportButton label="STOP" onPress={onStop} />
    </View>
  );
}

type ResetButtonProps = {
  onTap: () => void;
  onHoldPattern: () => void;
  onHoldAll: () => void;
};

/**
 * A tap resets just the current instrument (existing behavior). Holding
 * escalates through two tiers, each firing the instant its threshold is
 * crossed — not on release — so the reset happens while you're still
 * holding, mirroring the rest of the app's tactile, immediate feel.
 * RN's Pressable only supports a single delayLongPress tier, so this tracks
 * two chained timers by hand instead.
 */
function ResetButton({ onTap, onHoldPattern, onHoldAll }: ResetButtonProps) {
  const theme = useTheme();
  const patternTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const allTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Same technique as step-tile's didLongPress: Pressable still fires
  // onPress on release even after a hold tier already fired, so track
  // whether one did to suppress the plain-tap reset in that case.
  const firedTierRef = useRef<'none' | 'pattern' | 'all'>('none');

  const clearTimers = () => {
    if (patternTimerRef.current) {
      clearTimeout(patternTimerRef.current);
      patternTimerRef.current = null;
    }
    if (allTimerRef.current) {
      clearTimeout(allTimerRef.current);
      allTimerRef.current = null;
    }
  };

  useEffect(() => clearTimers, []);

  const handlePressIn = () => {
    firedTierRef.current = 'none';
    patternTimerRef.current = setTimeout(() => {
      firedTierRef.current = 'pattern';
      onHoldPattern();
      allTimerRef.current = setTimeout(() => {
        firedTierRef.current = 'all';
        onHoldAll();
      }, ALL_PATTERNS_RESET_HOLD_MS - PATTERN_RESET_HOLD_MS);
    }, PATTERN_RESET_HOLD_MS);
  };

  const handlePress = () => {
    if (firedTierRef.current === 'none') {
      onTap();
    }
  };

  const baseColor = theme.backgroundElement;
  const highlightColor = shadeColor(baseColor, BEVEL_SHIFT);
  const shadowColor = shadeColor(baseColor, -BEVEL_SHIFT);

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={clearTimers}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel="Reset. Hold to reset the whole pattern, hold longer to reset every pattern."
      hitSlop={3}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: baseColor,
          borderTopColor: highlightColor,
          borderLeftColor: highlightColor,
          borderBottomColor: shadowColor,
          borderRightColor: shadowColor,
        },
        styles.raised,
        pressed && styles.pressed,
      ]}>
      <ThemedText type="smallBold" style={styles.label}>
        RESET
      </ThemedText>
    </Pressable>
  );
}

const BEVEL_SHIFT = 12;

type TransportButtonProps = {
  label: string;
  onPress: () => void;
  active?: boolean;
};

function TransportButton({ label, onPress, active = false }: TransportButtonProps) {
  const theme = useTheme();
  const baseColor = active ? theme.accent : theme.backgroundElement;
  const highlightColor = shadeColor(baseColor, active ? -BEVEL_SHIFT : BEVEL_SHIFT);
  const shadowColor = shadeColor(baseColor, active ? BEVEL_SHIFT : -BEVEL_SHIFT);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      hitSlop={3}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: baseColor,
          borderTopColor: highlightColor,
          borderLeftColor: highlightColor,
          borderBottomColor: shadowColor,
          borderRightColor: shadowColor,
        },
        active ? glowStyle(baseColor) : styles.raised,
        pressed && styles.pressed,
      ]}>
      <ThemedText type="smallBold" style={[styles.label, active && styles.labelActive]}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function glowStyle(colorHex: string) {
  return Platform.select({
    ios: {
      shadowColor: colorHex,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.5,
      shadowRadius: 6,
    },
    android: {
      elevation: 5,
    },
    web: {
      boxShadow: `0 2px 8px ${withAlpha(colorHex, 0.5)}`,
    },
    default: {},
  });
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  button: {
    flex: 1,
    minHeight: 56,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
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
  pressed: {
    transform: [{ scale: 0.96 }],
  },
  label: {
    letterSpacing: 1,
    fontFamily: Fonts.mono,
  },
  labelActive: {
    color: '#1A1108',
  },
});
