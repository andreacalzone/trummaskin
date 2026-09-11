import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { SWING_STEP } from '@/constants/sequencer';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { shadeColor } from '@/utils/color';

type TempoControlProps = {
  bpm: number;
  onChangeBpm: (bpm: number | ((currentBpm: number) => number)) => void;
  swing: number;
  onChangeSwing: (swing: number | ((currentSwing: number) => number)) => void;
};

/**
 * BPM and Swing sit side by side, each its own equally-sized panel — two
 * "tempo/feel" readouts sharing a row instead of Swing competing with the
 * grid for a whole extra full-width section.
 */
export function TempoControl({ bpm, onChangeBpm, swing, onChangeSwing }: TempoControlProps) {
  return (
    <View style={styles.row}>
      <ValuePanel label="BPM" value={String(bpm)} onDecrease={() => onChangeBpm((current) => current - 1)} onIncrease={() => onChangeBpm((current) => current + 1)} decreaseLabel="Decrease BPM" increaseLabel="Increase BPM" />
      <ValuePanel
        label="SWING"
        value={`${swing}%`}
        onDecrease={() => onChangeSwing((current) => current - SWING_STEP)}
        onIncrease={() => onChangeSwing((current) => current + SWING_STEP)}
        decreaseLabel="Decrease swing"
        increaseLabel="Increase swing"
      />
    </View>
  );
}

type ValuePanelProps = {
  label: string;
  value: string;
  onDecrease: () => void;
  onIncrease: () => void;
  decreaseLabel: string;
  increaseLabel: string;
};

const BEVEL_SHIFT = 10;

function ValuePanel({ label, value, onDecrease, onIncrease, decreaseLabel, increaseLabel }: ValuePanelProps) {
  const theme = useTheme();
  const highlightColor = shadeColor(theme.backgroundElement, BEVEL_SHIFT);
  const shadowColor = shadeColor(theme.backgroundElement, -BEVEL_SHIFT);

  return (
    <View
      style={[
        styles.panel,
        {
          backgroundColor: theme.backgroundElement,
          borderTopColor: highlightColor,
          borderLeftColor: highlightColor,
          borderBottomColor: shadowColor,
          borderRightColor: shadowColor,
        },
        styles.raised,
      ]}>
      <StepButton onPress={onDecrease} label="–" accessibilityLabel={decreaseLabel} />
      <View style={styles.valueWrapper}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
          {label}
        </ThemedText>
        <ThemedText themeColor="accent" style={styles.value}>
          {value}
        </ThemedText>
      </View>
      <StepButton onPress={onIncrease} label="+" accessibilityLabel={increaseLabel} />
    </View>
  );
}

function StepButton({ onPress, label, accessibilityLabel }: { onPress: () => void; label: string; accessibilityLabel: string }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      style={({ pressed }) => [styles.stepButton, { backgroundColor: theme.background }, pressed && styles.stepButtonPressed]}>
      <ThemedText style={styles.stepButtonText}>{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  panel: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 10,
    borderWidth: 2,
    paddingHorizontal: Spacing.one,
    paddingVertical: Spacing.half,
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
  stepButton: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepButtonPressed: {
    opacity: 0.6,
    transform: [{ scale: 0.9 }],
  },
  stepButtonText: {
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 20,
  },
  valueWrapper: {
    flex: 1,
    alignItems: 'center',
  },
  label: {
    letterSpacing: 1,
    fontFamily: Fonts.mono,
    fontSize: 10,
  },
  value: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 20,
    textAlign: 'center',
    fontFamily: Fonts.mono,
  },
});
