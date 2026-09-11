import { useRef } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { STEP_VELOCITY } from '@/constants/velocity';
import { useTheme } from '@/hooks/use-theme';
import { shadeColor, withAlpha } from '@/utils/color';

type StepTileProps = {
  velocity: number;
  isPlayhead?: boolean;
  /** Quick tap: plain on/off. */
  onPress: () => void;
  /** Long-press (hold): cycles velocity while keeping the step active. */
  onLongPress: () => void;
};

const BEVEL_WIDTH = 3;
const BEVEL_SHIFT = 14;
const LONG_PRESS_DELAY_MS = 350;
// Accent reads as a dimmed, heavier burn of the same active hue (not a
// separate color) — a harder-hit-goes-darker/denser feel — while Soft
// lifts to the brighter accent hue, reading as a lighter touch.
const ACCENT_SHIFT = -22;
// How solid the lit fill is: <1 lets a hint of the dark body/tile show
// through, so color reads as glowing inside translucent material rather
// than a flat opaque sticker.
const FILL_OPACITY = 0.85;
const GLOSS_OPACITY = 0.05;

function getBaseFillColor(theme: ReturnType<typeof useTheme>, velocity: number): string {
  if (velocity === 0) return theme.tile;
  if (velocity === STEP_VELOCITY.ACCENT) return shadeColor(theme.accent, ACCENT_SHIFT);
  if (velocity === STEP_VELOCITY.SOFT) return theme.accentHot;
  return theme.accent; // normal
}

export function StepTile({ velocity, isPlayhead = false, onPress, onLongPress }: StepTileProps) {
  const theme = useTheme();
  const active = velocity > 0;
  // Bevel/glow colors are derived from the opaque hex; only the final fill
  // gets alpha, so shadeColor keeps working on a plain #rrggbb input.
  const baseColorHex = getBaseFillColor(theme, velocity);
  const fillColor = active ? withAlpha(baseColorHex, FILL_OPACITY) : baseColorHex;
  // RN's Pressable still fires onPress on release even after onLongPress has
  // already fired for the same gesture — track it so a hold doesn't also
  // toggle the step off right after cycling its velocity.
  const didLongPress = useRef(false);

  // Raised tiles catch light top-left / shadow bottom-right; active tiles invert
  // the bevel so they read as pressed-in and "lit", like an engaged hardware pad.
  const highlightColor = shadeColor(baseColorHex, active ? -BEVEL_SHIFT : BEVEL_SHIFT);
  const shadowColor = shadeColor(baseColorHex, active ? BEVEL_SHIFT : -BEVEL_SHIFT);

  return (
    <Pressable
      onPressIn={() => {
        didLongPress.current = false;
      }}
      onLongPress={() => {
        didLongPress.current = true;
        onLongPress();
      }}
      delayLongPress={LONG_PRESS_DELAY_MS}
      onPress={() => {
        if (didLongPress.current) return;
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      hitSlop={4}
      style={({ pressed }) => [
        styles.tile,
        {
          backgroundColor: fillColor,
          borderTopColor: highlightColor,
          borderLeftColor: highlightColor,
          borderBottomColor: shadowColor,
          borderRightColor: shadowColor,
        },
        active ? glowStyle(baseColorHex) : styles.raised,
        pressed && styles.pressed,
      ]}>
      {/* Soft-touch gloss: a faint highlight across the top of the pad so it
          reads as translucent rubber rather than flat painted plastic, on
          every state (including inactive) so the material feel is uniform. */}
      <View pointerEvents="none" style={styles.gloss} />
      {/* Playhead: a lit outline + glow rather than a fill wash, so "has a
          hit" (fill color) and "is the current step" (this ring) stay
          independently readable instead of one washing out the other. */}
      {isPlayhead && (
        <View
          pointerEvents="none"
          style={[
            styles.playheadRing,
            {
              borderColor: theme.playhead,
              shadowColor: theme.playhead,
            },
          ]}
        />
      )}
    </Pressable>
  );
}

function glowStyle(colorHex: string) {
  return Platform.select({
    ios: {
      shadowColor: colorHex,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.55,
      shadowRadius: 7,
    },
    android: {
      elevation: 6,
    },
    web: {
      boxShadow: `0 2px 10px ${withAlpha(colorHex, 0.55)}`,
    },
    default: {},
  });
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 14,
    borderWidth: BEVEL_WIDTH,
  },
  raised: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.4,
      shadowRadius: 3,
    },
    android: {
      elevation: 4,
    },
    web: {
      // react-native-web ignores the iOS shadow* props above, so it needs its own case.
      boxShadow: '0 3px 3px rgba(0, 0, 0, 0.4)',
    },
    default: {},
  }),
  pressed: {
    transform: [{ scale: 0.94 }],
  },
  gloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '48%',
    borderTopLeftRadius: 11,
    borderTopRightRadius: 11,
    backgroundColor: `rgba(255, 255, 255, ${GLOSS_OPACITY})`,
  },
  playheadRing: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 11,
    borderWidth: 2.5,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
  },
});
