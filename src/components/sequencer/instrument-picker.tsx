import { Modal, Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { INSTRUMENT_DEFINITIONS } from '@/constants/drums';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { InstrumentId } from '@/types/pattern';
import { shadeColor } from '@/utils/color';

/**
 * The instrument-dropdown trigger + its modal list, shared between the main
 * screen's DrumSelector and the FX page's per-drum picker (Milestone 25
 * §10: "use the existing drum-selector concept" rather than building a
 * second one). Split into two pieces because the two callers embed the
 * trigger differently — DrumSelector nests it inside its own bordered panel
 * above a SAMPLE row, the FX page uses it standalone — but both want the
 * exact same modal list.
 */

type InstrumentTriggerProps = {
  label: string;
  selectedInstrumentId: InstrumentId;
  open: boolean;
  onPress: () => void;
  /** Renders its own bordered/raised box (standalone use). Omit when the caller already provides that container (e.g. DrumSelector's panel). */
  bordered?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function InstrumentTrigger({ label, selectedInstrumentId, open, onPress, bordered = false, style }: InstrumentTriggerProps) {
  const theme = useTheme();
  const selectedName = INSTRUMENT_DEFINITIONS.find((definition) => definition.id === selectedInstrumentId)?.name ?? '';
  const highlightColor = shadeColor(theme.backgroundElement, 10);
  const shadowColor = shadeColor(theme.backgroundElement, -10);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Select drum"
      hitSlop={4}
      style={({ pressed }) => [
        styles.trigger,
        bordered && [
          styles.borderedTrigger,
          {
            backgroundColor: theme.backgroundElement,
            borderTopColor: highlightColor,
            borderLeftColor: highlightColor,
            borderBottomColor: shadowColor,
            borderRightColor: shadowColor,
          },
          styles.raised,
        ],
        style,
        pressed && styles.triggerPressed,
      ]}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.triggerLabel}>
        {label}
      </ThemedText>
      <View style={styles.triggerValueRow}>
        <ThemedText style={styles.triggerValue}>{selectedName}</ThemedText>
        <ThemedText themeColor="accent" style={styles.chevron}>
          {open ? '▴' : '▾'}
        </ThemedText>
      </View>
    </Pressable>
  );
}

type InstrumentPickerModalProps = {
  visible: boolean;
  selectedInstrumentId: InstrumentId;
  onSelect: (id: InstrumentId) => void;
  onClose: () => void;
};

export function InstrumentPickerModal({ visible, selectedInstrumentId, onSelect, onClose }: InstrumentPickerModalProps) {
  const theme = useTheme();

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={() => {}} style={styles.menuWrapper}>
          <ThemedView type="backgroundElement" style={styles.menu}>
            {INSTRUMENT_DEFINITIONS.map((definition, index) => {
              const isSelected = definition.id === selectedInstrumentId;
              return (
                <Pressable
                  key={definition.id}
                  onPress={() => {
                    onSelect(definition.id);
                    onClose();
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  style={({ pressed }) => [
                    styles.option,
                    index < INSTRUMENT_DEFINITIONS.length - 1 && {
                      borderBottomWidth: 1,
                      borderBottomColor: theme.backgroundSelected,
                    },
                    isSelected && { backgroundColor: theme.backgroundSelected },
                    pressed && styles.optionPressed,
                  ]}>
                  <ThemedText type={isSelected ? 'smallBold' : 'default'} themeColor={isSelected ? 'accent' : 'text'}>
                    {definition.name}
                  </ThemedText>
                  {isSelected && <ThemedText themeColor="accent">●</ThemedText>}
                </Pressable>
              );
            })}
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  trigger: {
    gap: 2,
  },
  borderedTrigger: {
    borderRadius: 12,
    borderWidth: 2,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
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
  triggerPressed: {
    opacity: 0.9,
  },
  triggerLabel: {
    letterSpacing: 1.5,
    fontFamily: Fonts.mono,
  },
  triggerValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  triggerValue: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
  },
  chevron: {
    fontSize: 16,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
  },
  menuWrapper: {
    width: '100%',
    maxWidth: 360,
  },
  menu: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
  },
  option: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    minHeight: 52,
  },
  optionPressed: {
    opacity: 0.7,
  },
});
