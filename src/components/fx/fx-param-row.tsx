import { useState } from 'react';
import { PanResponder, StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { shadeColor, withAlpha } from '@/utils/color';

type FxParamRowProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  /** e.g. a signed "+20"/"-20" formatter for EQ. Defaults to the plain number. */
  formatValue?: (value: number) => string;
};

const TRACK_HEIGHT = 8;
const THUMB_SIZE = 26;
const HIT_SLOP = { top: 14, bottom: 14, left: 12, right: 12 };

/**
 * One compact hardware-style row per FX parameter: label + value readout
 * above a drag slider, fader-style. Replaces the earlier +/- stepper per
 * user feedback. Built on RN's built-in PanResponder rather than a slider
 * library or gesture-handler/reanimated (both already in the dependency
 * tree from the Expo template, but unused elsewhere in this app) — a plain
 * linear drag is simple enough that pulling in either would be pure
 * overhead for no real benefit here.
 *
 * The filled portion grows from the parameter's *zero point*, not always
 * the left edge — for a 0–100 param that's the same thing, but for EQ's
 * -100..100 tilt it fills outward from the centered zero mark in either
 * direction, so the direction of the tilt reads at a glance.
 */
export function FxParamRow({ label, value, min, max, step, onChange, formatValue }: FxParamRowProps) {
  const theme = useTheme();
  const displayValue = formatValue ? formatValue(value) : String(value);
  const [trackWidth, setTrackWidth] = useState(0);

  const applyLocationX = (locationX: number) => {
    if (trackWidth <= 0) return;
    const ratio = Math.min(1, Math.max(0, locationX / trackWidth));
    const raw = min + ratio * (max - min);
    const stepped = Math.min(max, Math.max(min, Math.round(raw / step) * step));
    onChange(stepped);
  };

  // Recreated every render (cheap — it's just a plain callbacks object) so
  // its closures always see this render's trackWidth/min/max/step/onChange
  // directly, with no stale-ref pattern needed. RN dispatches gesture
  // events against whatever the view's latest committed props are, the
  // same as any other inline event handler.
  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (event: GestureResponderEvent) => applyLocationX(event.nativeEvent.locationX),
    onPanResponderMove: (event: GestureResponderEvent) => applyLocationX(event.nativeEvent.locationX),
  });

  const handleTrackLayout = (event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  };

  const zeroRatio = (0 - min) / (max - min);
  const valueRatio = (value - min) / (max - min);
  const fillStartRatio = Math.min(zeroRatio, valueRatio);
  const fillEndRatio = Math.max(zeroRatio, valueRatio);
  const thumbLeft = valueRatio * trackWidth;

  return (
    <View style={styles.row}>
      <View style={styles.header}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
          {label}
        </ThemedText>
        <ThemedText themeColor="accent" style={styles.value}>
          {displayValue}
        </ThemedText>
      </View>
      <View
        style={[styles.track, { backgroundColor: shadeColor(theme.background, -6) }]}
        onLayout={handleTrackLayout}
        hitSlop={HIT_SLOP}
        {...panResponder.panHandlers}>
        <View
          pointerEvents="none"
          style={[
            styles.fill,
            {
              left: `${fillStartRatio * 100}%`,
              width: `${(fillEndRatio - fillStartRatio) * 100}%`,
              backgroundColor: withAlpha(theme.accent, 0.9),
            },
          ]}
        />
        <View
          pointerEvents="none"
          style={[
            styles.thumb,
            {
              left: thumbLeft - THUMB_SIZE / 2,
              backgroundColor: theme.accent,
              borderColor: shadeColor(theme.accent, -18),
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: Spacing.one,
    gap: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  label: {
    letterSpacing: 1,
    fontFamily: Fonts.mono,
  },
  value: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: Fonts.mono,
  },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    justifyContent: 'center',
  },
  fill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: TRACK_HEIGHT / 2,
  },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    borderWidth: 2,
  },
});
