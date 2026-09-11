import { useEffect, useState } from 'react';
import { Animated, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { shadeColor, withAlpha } from '@/utils/color';

/** A one-shot signal: bump `token` (e.g. Date.now()) each time a reset fires so the flash re-plays even if the same tier fires twice in a row. */
export type ResetFlash = { tier: 'pattern' | 'all'; token: number } | null;

type PatternSelectorProps = {
  patternCount: number;
  selectedIndex: number;
  onSelect: (index: number) => void;
  auto: boolean;
  onToggleAuto: () => void;
  onCopyPattern: (sourceIndex: number, targetIndex: number) => void;
  /** Does each pattern (by index) have any active step, on any instrument? */
  patternHasContent: boolean[];
  /** Confirmation flash after a hold-reset: which pattern(s) just got cleared. */
  resetFlash: ResetFlash;
  /** Milestone 26 — mutually exclusive with AUTO at the UI level. */
  songMode: boolean;
  onToggleSongMode: () => void;
  /** Reopens the arrangement editor modal — only meaningful (and only shown) while songMode is on. */
  onEditArrangement: () => void;
};

const FLASH_PULSE_MS = 120;
const FLASH_PULSE_COUNT = 3;

export function PatternSelector({
  patternCount,
  selectedIndex,
  onSelect,
  auto,
  onToggleAuto,
  onCopyPattern,
  patternHasContent,
  resetFlash,
  songMode,
  onToggleSongMode,
  onEditArrangement,
}: PatternSelectorProps) {
  const [copyOpen, setCopyOpen] = useState(false);
  const theme = useTheme();
  // A stable Animated.Value that's mutated imperatively (via Animated.timing),
  // never re-set — lazy useState init instead of useRef, since accessing
  // `.current` during render trips the "no refs during render" lint rule.
  const [flashAnim] = useState(() => new Animated.Value(0));

  // Plays a fixed, short confirmation flash whenever resetFlash changes —
  // decoupled from whether the finger is still held down, so the feedback
  // is always fully visible even for a hold-then-release-immediately tap.
  useEffect(() => {
    if (!resetFlash) return;
    flashAnim.setValue(0);
    const pulse = [Animated.timing(flashAnim, { toValue: 1, duration: FLASH_PULSE_MS, useNativeDriver: true }), Animated.timing(flashAnim, { toValue: 0, duration: FLASH_PULSE_MS, useNativeDriver: true })];
    Animated.sequence(Array(FLASH_PULSE_COUNT).fill(pulse).flat()).start();
  }, [resetFlash, flashAnim]);

  return (
    <View style={styles.wrapper}>
      <View style={styles.row}>
        <SelectorButton
          label="AUTO"
          active={auto}
          onPress={onToggleAuto}
          grow={1.7}
          accessibilityLabel="Toggle AUTO pattern chaining"
        />
        {Array.from({ length: patternCount }, (_, index) => {
          const isFlashing = resetFlash != null && (resetFlash.tier === 'all' || (resetFlash.tier === 'pattern' && index === selectedIndex));
          return (
            <SelectorButton
              key={index}
              label={String(index + 1)}
              active={selectedIndex === index}
              hasContent={patternHasContent[index] ?? false}
              onPress={() => onSelect(index)}
              grow={1}
              accessibilityLabel={`Select pattern ${index + 1}`}
              flashAnim={isFlashing ? flashAnim : undefined}
            />
          );
        })}
      </View>

      {/* Subordinate to the pattern row above — quiet, small actions, not
          another state toggle row, so they stay visually secondary. SONG's
          own arrangement editor (Milestone 26) is a Modal opened from here —
          it has zero footprint on this row's fixed height regardless of
          whether it's open, so this row's height never changes with Song
          Mode on or off. */}
      <View style={styles.secondaryRow}>
        <View style={styles.songGroup}>
          <Pressable
            onPress={onToggleSongMode}
            accessibilityRole="button"
            accessibilityLabel="Toggle Song Mode"
            accessibilityState={{ selected: songMode }}
            hitSlop={4}
            style={({ pressed }) => [
              styles.songTrigger,
              { backgroundColor: songMode ? theme.accent : theme.backgroundElement },
              pressed && styles.copyTriggerPressed,
            ]}>
            <ThemedText type="small" themeColor="textSecondary" style={[styles.copyLabel, songMode && styles.songLabelActive]}>
              SONG {songMode ? 'ON' : 'OFF'}
            </ThemedText>
          </Pressable>
          {songMode && (
            <Pressable
              onPress={onEditArrangement}
              accessibilityRole="button"
              accessibilityLabel="Edit song arrangement"
              hitSlop={4}
              style={({ pressed }) => [styles.editTrigger, { backgroundColor: theme.backgroundElement }, pressed && styles.copyTriggerPressed]}>
              <ThemedText type="small" themeColor="accent" style={styles.copyLabel}>
                EDIT ›
              </ThemedText>
            </Pressable>
          )}
        </View>
        <Pressable
          onPress={() => setCopyOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Copy pattern ${selectedIndex + 1} to another pattern`}
          hitSlop={4}
          style={({ pressed }) => [styles.copyTrigger, { backgroundColor: theme.backgroundElement }, pressed && styles.copyTriggerPressed]}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.copyLabel}>
            COPY PATTERN
          </ThemedText>
        </Pressable>
      </View>

      <Modal transparent visible={copyOpen} animationType="fade" onRequestClose={() => setCopyOpen(false)}>
        <Pressable style={modalStyles.backdrop} onPress={() => setCopyOpen(false)}>
          <Pressable onPress={() => {}} style={modalStyles.sheetWrapper}>
            <ThemedView type="backgroundElement" style={modalStyles.sheet}>
              <ThemedText type="small" themeColor="textSecondary" style={modalStyles.title}>
                COPY PATTERN {selectedIndex + 1} TO:
              </ThemedText>
              <View style={modalStyles.grid}>
                {Array.from({ length: patternCount }, (_, index) => {
                  const isSource = index === selectedIndex;
                  return (
                    <Pressable
                      key={index}
                      disabled={isSource}
                      onPress={() => {
                        onCopyPattern(selectedIndex, index);
                        setCopyOpen(false);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: isSource }}
                      accessibilityLabel={isSource ? `Pattern ${index + 1} is the source` : `Copy to pattern ${index + 1}`}
                      style={({ pressed }) => [
                        modalStyles.destButton,
                        {
                          backgroundColor: theme.tile,
                          borderColor: shadeColor(theme.tile, 10),
                        },
                        isSource && modalStyles.destButtonDisabled,
                        pressed && !isSource && modalStyles.destButtonPressed,
                      ]}>
                      <ThemedText
                        type="smallBold"
                        themeColor={isSource ? 'textSecondary' : 'text'}
                        style={isSource && modalStyles.destLabelDisabled}>
                        {index + 1}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </ThemedView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const BEVEL_SHIFT = 10;

type SelectorButtonProps = {
  label: string;
  active: boolean;
  /** Only meaningful for pattern buttons — AUTO passes neither. */
  hasContent?: boolean;
  onPress: () => void;
  grow: number;
  accessibilityLabel: string;
  /** Present only while this button should be playing the reset-confirmation flash. */
  flashAnim?: Animated.Value;
};

function SelectorButton({ label, active, hasContent = false, onPress, grow, accessibilityLabel, flashAnim }: SelectorButtonProps) {
  const theme = useTheme();
  const baseColor = active ? theme.accent : theme.backgroundElement;
  const highlightColor = shadeColor(baseColor, active ? -BEVEL_SHIFT : BEVEL_SHIFT);
  const shadowColor = shadeColor(baseColor, active ? BEVEL_SHIFT : -BEVEL_SHIFT);
  // An empty, unselected pattern reads as dimmer/washed-out; a non-empty one
  // gets a small lit dot instead of a full color change, so the number stays
  // equally legible either way and the selected state still dominates.
  const isDimmed = !active && !hasContent;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: active }}
      hitSlop={{ top: 6, bottom: 6, left: 1, right: 1 }}
      style={({ pressed }) => [
        styles.button,
        { flexGrow: grow, flexBasis: 0 },
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
      <ThemedText type="smallBold" style={[styles.label, active && styles.labelActive, isDimmed && styles.labelDimmed]}>
        {label}
      </ThemedText>
      {hasContent && <View pointerEvents="none" style={[styles.contentDot, { backgroundColor: active ? theme.background : theme.accent }]} />}
      {flashAnim && <Animated.View pointerEvents="none" style={[styles.flashOverlay, { opacity: flashAnim }]} />}
    </Pressable>
  );
}

function glowStyle(colorHex: string) {
  return Platform.select({
    ios: {
      shadowColor: colorHex,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.5,
      shadowRadius: 5,
    },
    android: {
      elevation: 4,
    },
    web: {
      boxShadow: `0 2px 6px ${withAlpha(colorHex, 0.5)}`,
    },
    default: {},
  });
}

const styles = StyleSheet.create({
  wrapper: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  button: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentDot: {
    position: 'absolute',
    bottom: 5,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  flashOverlay: {
    position: 'absolute',
    // Matches `button`'s own borderRadius/borderWidth so the flash covers
    // exactly the visible face without square corners peeking past it —
    // `overflow: hidden` on `button` isn't an option since it would clip
    // away that same button's iOS drop shadow.
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  raised: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.5,
      shadowRadius: 3,
    },
    android: {
      elevation: 3,
    },
    web: {
      boxShadow: '0 2px 3px rgba(0, 0, 0, 0.5)',
    },
    default: {},
  }),
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.92 }],
  },
  label: {
    fontFamily: Fonts.mono,
    letterSpacing: 0.5,
  },
  labelActive: {
    color: '#1A1108',
  },
  labelDimmed: {
    opacity: 0.4,
  },
  secondaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  songGroup: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  songTrigger: {
    minHeight: 30,
    paddingHorizontal: Spacing.three,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  songLabelActive: {
    color: '#1A1108',
  },
  editTrigger: {
    minHeight: 30,
    paddingHorizontal: Spacing.three,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyTrigger: {
    minHeight: 30,
    paddingHorizontal: Spacing.three,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyTriggerPressed: {
    opacity: 0.6,
  },
  copyLabel: {
    fontFamily: Fonts.mono,
    letterSpacing: 1,
    fontSize: 11,
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
  destButtonDisabled: {
    opacity: 0.35,
  },
  destButtonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.94 }],
  },
  destLabelDisabled: {
    opacity: 0.7,
  },
});
