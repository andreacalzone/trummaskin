import { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { shadeColor } from '@/utils/color';

type SongArrangementEditorProps = {
  visible: boolean;
  onClose: () => void;
  /** Ordered list of pattern indices (0-based) — references only, never pattern data. */
  arrangement: number[];
  patternCount: number;
  onAdd: (patternIndex: number) => void;
  onRemove: (position: number) => void;
  onMove: (fromPosition: number, toPosition: number) => void;
};

const CHIP_SIZE = 44;

/**
 * The arrangement editor (Milestone 26 §4–§7). Presented as its own
 * full-screen Modal rather than an inline panel — an earlier inline version
 * sat between the pattern row and the tempo controls and, on longer
 * arrangements, pushed the step grid down far enough to shove it partly
 * behind the pads. A Modal has zero layout footprint on the main screen
 * regardless of how it's opened or how long the arrangement gets, since it
 * renders in its own native layer on top of everything instead of
 * participating in the main screen's flex flow.
 * Reordering deliberately skips drag-and-drop (none exists elsewhere in
 * this app to reuse, and a new drag library would be disproportionate for
 * a short list): tap a chip to select it, then nudge it left/right with the
 * small toolbar that appears below. A chip's own small × badge removes that
 * one instance immediately, no selection required — deleting a mistake is
 * common enough to deserve a single tap.
 */
export function SongArrangementEditor({ visible, onClose, arrangement, patternCount, onAdd, onRemove, onMove }: SongArrangementEditorProps) {
  const theme = useTheme();
  const [selectedPosition, setSelectedPosition] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const clampedSelection = selectedPosition !== null && selectedPosition < arrangement.length ? selectedPosition : null;

  const handleSelectChip = (position: number) => {
    setSelectedPosition((current) => (current === position ? null : position));
  };

  const handleRemove = (position: number) => {
    onRemove(position);
    if (clampedSelection === position) setSelectedPosition(null);
  };

  const handleMove = (direction: -1 | 1) => {
    if (clampedSelection === null) return;
    const target = clampedSelection + direction;
    if (target < 0 || target >= arrangement.length) return;
    onMove(clampedSelection, target);
    setSelectedPosition(target);
  };

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={modalStyles.backdrop} onPress={onClose}>
        <Pressable onPress={() => {}} style={modalStyles.sheetWrapper}>
          <ThemedView
            type="backgroundElement"
            style={[
              styles.panel,
              {
                borderTopColor: shadeColor(theme.backgroundElement, 10),
                borderLeftColor: shadeColor(theme.backgroundElement, 10),
                borderBottomColor: shadeColor(theme.backgroundElement, -10),
                borderRightColor: shadeColor(theme.backgroundElement, -10),
              },
            ]}>
            <View style={styles.headerRow}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
                SONG ARRANGEMENT
              </ThemedText>
              <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close song arrangement editor" hitSlop={8}>
                <ThemedText type="small" themeColor="accent" style={styles.closeLabel}>
                  DONE
                </ThemedText>
              </Pressable>
            </View>

            {arrangement.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.emptyHint}>
                Tap + Add Pattern below to build your song
              </ThemedText>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {arrangement.map((patternIndex, position) => (
                  <ArrangementChip
                    key={`${position}-${patternIndex}`}
                    label={String(patternIndex + 1)}
                    selected={clampedSelection === position}
                    onPress={() => handleSelectChip(position)}
                    onRemove={() => handleRemove(position)}
                  />
                ))}
              </ScrollView>
            )}

            {/* Its own full-width row, outside the chip ScrollView — with a
                horizontal scrollbar hidden (no indicator), a trailing "+"
                chip inside that same row became unreachable-looking once
                enough chips were added: it scrolled off the visible edge
                with no visual hint a chip was still there to scroll to.
                A fixed, always-visible control has no such limit. */}
            <Pressable
              onPress={() => setPickerOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Add pattern to song"
              style={({ pressed }) => [
                styles.addButton,
                {
                  backgroundColor: theme.background,
                  borderColor: shadeColor(theme.background, 14),
                },
                pressed && styles.chipPressed,
              ]}>
              <ThemedText type="small" themeColor="accent" style={styles.addButtonLabel}>
                + ADD PATTERN
              </ThemedText>
            </Pressable>

            {clampedSelection !== null && (
              <View style={styles.toolbar}>
                <ToolbarButton label="‹ MOVE" disabled={clampedSelection === 0} onPress={() => handleMove(-1)} accessibilityLabel="Move left" />
                <ToolbarButton
                  label="MOVE ›"
                  disabled={clampedSelection === arrangement.length - 1}
                  onPress={() => handleMove(1)}
                  accessibilityLabel="Move right"
                />
              </View>
            )}
          </ThemedView>
        </Pressable>
      </Pressable>

      <Modal transparent visible={pickerOpen} animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={modalStyles.backdrop} onPress={() => setPickerOpen(false)}>
          <Pressable onPress={() => {}} style={modalStyles.sheetWrapper}>
            <ThemedView type="backgroundElement" style={modalStyles.sheet}>
              <ThemedText type="small" themeColor="textSecondary" style={modalStyles.title}>
                ADD PATTERN TO SONG
              </ThemedText>
              <View style={modalStyles.grid}>
                {Array.from({ length: patternCount }, (_, index) => (
                  <Pressable
                    key={index}
                    onPress={() => {
                      onAdd(index);
                      setPickerOpen(false);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Add pattern ${index + 1}`}
                    style={({ pressed }) => [
                      modalStyles.destButton,
                      { backgroundColor: theme.tile, borderColor: shadeColor(theme.tile, 10) },
                      pressed && modalStyles.destButtonPressed,
                    ]}>
                    <ThemedText type="smallBold" themeColor="text">
                      {index + 1}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            </ThemedView>
          </Pressable>
        </Pressable>
      </Modal>
    </Modal>
  );
}

type ArrangementChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  onRemove: () => void;
};

function ArrangementChip({ label, selected, onPress, onRemove }: ArrangementChipProps) {
  const theme = useTheme();
  const baseColor = selected ? theme.accent : theme.background;
  const highlightColor = shadeColor(baseColor, selected ? -12 : 10);
  const shadowColor = shadeColor(baseColor, selected ? 12 : -10);

  return (
    <View style={styles.chipWrapper}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Song slot: pattern ${label}`}
        accessibilityState={{ selected }}
        style={({ pressed }) => [
          styles.chip,
          {
            backgroundColor: baseColor,
            borderTopColor: highlightColor,
            borderLeftColor: highlightColor,
            borderBottomColor: shadowColor,
            borderRightColor: shadowColor,
          },
          pressed && styles.chipPressed,
        ]}>
        <ThemedText type="smallBold" style={selected && styles.chipLabelActive}>
          {label}
        </ThemedText>
      </Pressable>
      <Pressable
        onPress={onRemove}
        accessibilityRole="button"
        accessibilityLabel={`Remove pattern ${label} from song`}
        hitSlop={8}
        style={({ pressed }) => [styles.removeBadge, { backgroundColor: theme.background }, pressed && styles.chipPressed]}>
        <ThemedText style={styles.removeBadgeLabel}>×</ThemedText>
      </Pressable>
    </View>
  );
}

function ToolbarButton({
  label,
  disabled,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      hitSlop={4}
      style={({ pressed }) => [
        styles.toolbarButton,
        { backgroundColor: theme.background },
        disabled && styles.toolbarButtonDisabled,
        pressed && !disabled && styles.chipPressed,
      ]}>
      <ThemedText type="small" themeColor={disabled ? 'textSecondary' : 'accent'} style={styles.toolbarButtonLabel}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: 16,
    borderWidth: 2,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    letterSpacing: 1.5,
    fontFamily: Fonts.mono,
  },
  closeLabel: {
    fontFamily: Fonts.mono,
    letterSpacing: 1,
    fontWeight: '700',
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
    paddingRight: Spacing.one,
  },
  emptyHint: {
    fontFamily: Fonts.mono,
    fontStyle: 'italic',
  },
  chipWrapper: {
    width: CHIP_SIZE,
    height: CHIP_SIZE,
  },
  chip: {
    width: CHIP_SIZE,
    height: CHIP_SIZE,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.4,
        shadowRadius: 3,
      },
      android: { elevation: 2 },
      web: { boxShadow: '0 2px 3px rgba(0, 0, 0, 0.4)' },
      default: {},
    }),
  },
  chipPressed: {
    opacity: 0.7,
  },
  chipLabelActive: {
    color: '#1A1108',
  },
  removeBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBadgeLabel: {
    fontSize: 13,
    lineHeight: 15,
    fontWeight: '700',
  },
  addButton: {
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonLabel: {
    fontFamily: Fonts.mono,
    letterSpacing: 1,
    fontWeight: '700',
  },
  toolbar: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  toolbarButton: {
    flex: 1,
    minHeight: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbarButtonDisabled: {
    opacity: 0.35,
  },
  toolbarButtonLabel: {
    fontFamily: Fonts.mono,
    letterSpacing: 0.5,
    fontWeight: '700',
  },
});

const modalStyles = StyleSheet.create({
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
    gap: Spacing.three,
  },
  title: {
    textAlign: 'center',
    letterSpacing: 1,
    fontFamily: Fonts.mono,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    justifyContent: 'center',
  },
  destButton: {
    width: '22%',
    aspectRatio: 1,
    minWidth: 56,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  destButtonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.94 }],
  },
});
