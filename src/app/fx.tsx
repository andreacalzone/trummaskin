import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FxParamRow } from '@/components/fx/fx-param-row';
import { InstrumentPickerModal, InstrumentTrigger } from '@/components/sequencer/instrument-picker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  DEFAULT_DRUM_FX,
  DEFAULT_MASTER_FX,
  DRUM_FX_PARAM_LABEL,
  DRUM_FX_PARAM_ORDER,
  DRUM_FX_PARAM_RANGE,
  MASTER_FX_PARAM_LABEL,
  MASTER_FX_PARAM_ORDER,
  MASTER_FX_PARAM_RANGE,
} from '@/constants/fx';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppContext } from '@/state/app-context';
import type { InstrumentId } from '@/types/pattern';
import { shadeColor } from '@/utils/color';

/**
 * FX §4: two clearly-separated sections, DRUM FX (one instrument's chain at
 * a time, picked via the same dropdown concept as the main screen) and
 * MASTER (the shared bus). Both read/write straight from AppContext's
 * `drumFx`/`masterFx`/`setDrumFxParam`/`setMasterFxParam` — the same audio
 * engine instance the main screen uses, so nothing here can duplicate the
 * engine or scheduler, and playback (owned entirely by the provider, not by
 * this screen) is completely unaffected by being on this page.
 *
 * Which instrument's FX is showing starts out as whatever was selected on
 * the main screen — arriving here already editing the drum you were just
 * working with, instead of always landing on Kick. From then on it's local
 * UI state (picked via the same dropdown as the main screen, but not the
 * same state): switching instruments in here doesn't change what the step
 * grid shows when you go back, and vice versa.
 */
export default function FxScreen() {
  const { drumFx, masterFx, setDrumFxParam, setMasterFxParam, selectedInstrumentId: mainScreenInstrumentId } = useAppContext();
  const [selectedInstrumentId, setSelectedInstrumentId] = useState<InstrumentId>(mainScreenInstrumentId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const theme = useTheme();

  const selectedDrumFx = drumFx[selectedInstrumentId];

  /** Resets every slider currently on screen — this instrument's drum FX and MASTER — back to their defaults. Other instruments' FX are untouched. */
  const handleResetFx = () => {
    for (const param of DRUM_FX_PARAM_ORDER) {
      setDrumFxParam(selectedInstrumentId, param, DEFAULT_DRUM_FX[param]);
    }
    for (const param of MASTER_FX_PARAM_ORDER) {
      setMasterFxParam(param, DEFAULT_MASTER_FX[param]);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.titleRow}>
          <BackButton onPress={() => router.back()} />
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.title}>
            FX
          </ThemedText>
          <View style={styles.titleSpacer} />
        </View>

        <SectionHeader label="DRUM FX" />
        <View
          style={[
            styles.panel,
            {
              backgroundColor: theme.backgroundElement,
              borderTopColor: shadeColor(theme.backgroundElement, 10),
              borderLeftColor: shadeColor(theme.backgroundElement, 10),
              borderBottomColor: shadeColor(theme.backgroundElement, -10),
              borderRightColor: shadeColor(theme.backgroundElement, -10),
            },
          ]}>
          <InstrumentTrigger
            label="EDITING"
            selectedInstrumentId={selectedInstrumentId}
            open={pickerOpen}
            onPress={() => setPickerOpen(true)}
          />
          <View style={[styles.divider, { backgroundColor: shadeColor(theme.backgroundElement, -10) }]} />
          {DRUM_FX_PARAM_ORDER.map((param) => (
            <FxParamRow
              key={param}
              label={DRUM_FX_PARAM_LABEL[param]}
              value={selectedDrumFx[param]}
              min={DRUM_FX_PARAM_RANGE[param].min}
              max={DRUM_FX_PARAM_RANGE[param].max}
              step={DRUM_FX_PARAM_RANGE[param].step}
              formatValue={formatFxValue}
              onChange={(value) => setDrumFxParam(selectedInstrumentId, param, value)}
            />
          ))}
        </View>

        <SectionHeader label="MASTER" />
        <View
          style={[
            styles.panel,
            {
              backgroundColor: theme.backgroundElement,
              borderTopColor: shadeColor(theme.backgroundElement, 10),
              borderLeftColor: shadeColor(theme.backgroundElement, 10),
              borderBottomColor: shadeColor(theme.backgroundElement, -10),
              borderRightColor: shadeColor(theme.backgroundElement, -10),
            },
          ]}>
          {MASTER_FX_PARAM_ORDER.map((param) => (
            <FxParamRow
              key={param}
              label={MASTER_FX_PARAM_LABEL[param]}
              value={masterFx[param]}
              min={MASTER_FX_PARAM_RANGE[param].min}
              max={MASTER_FX_PARAM_RANGE[param].max}
              step={MASTER_FX_PARAM_RANGE[param].step}
              formatValue={formatFxValue}
              onChange={(value) => setMasterFxParam(param, value)}
            />
          ))}
        </View>

        <ResetFxButton onPress={handleResetFx} />
      </SafeAreaView>

      <InstrumentPickerModal
        visible={pickerOpen}
        selectedInstrumentId={selectedInstrumentId}
        onSelect={setSelectedInstrumentId}
        onClose={() => setPickerOpen(false)}
      />
    </ThemedView>
  );
}

function formatFxValue(value: number): string {
  if (value > 0) return `+${value}`;
  return String(value);
}

function SectionHeader({ label }: { label: string }) {
  return (
    <ThemedText type="small" themeColor="textSecondary" style={styles.sectionHeader}>
      {label}
    </ThemedText>
  );
}

/** Resets every slider visible on this page (current drum + MASTER) to defaults — a plain tap, no hold-confirmation, since this only touches FX levels, not pattern data. */
function ResetFxButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Reset all FX to default"
      style={({ pressed }) => [styles.resetButton, { backgroundColor: theme.backgroundElement }, pressed && styles.resetButtonPressed]}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.resetButtonLabel}>
        RESET FX
      </ThemedText>
    </Pressable>
  );
}

const BACK_BUTTON_SIZE = 40;

/** Mirrors the main screen's FX button — same size/position language, opposite side, opposite direction. */
function BackButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  const highlightColor = shadeColor(theme.backgroundElement, 10);
  const shadowColor = shadeColor(theme.backgroundElement, -10);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Back to Groovebox"
      hitSlop={6}
      style={({ pressed }) => [
        styles.backButton,
        {
          backgroundColor: theme.backgroundElement,
          borderTopColor: highlightColor,
          borderLeftColor: highlightColor,
          borderBottomColor: shadowColor,
          borderRightColor: shadowColor,
        },
        pressed && styles.backButtonPressed,
      ]}>
      <ThemedText type="smallBold" themeColor="accent" style={styles.backButtonLabel}>
        {'‹'}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
    gap: Spacing.two,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleSpacer: {
    width: BACK_BUTTON_SIZE,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    letterSpacing: 3,
    fontFamily: Fonts.mono,
  },
  backButton: {
    width: BACK_BUTTON_SIZE,
    height: BACK_BUTTON_SIZE,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.5,
        shadowRadius: 4,
      },
      android: { elevation: 3 },
      web: { boxShadow: '0 3px 4px rgba(0, 0, 0, 0.5)' },
      default: {},
    }),
  },
  backButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.94 }],
  },
  backButtonLabel: {
    fontSize: 20,
    lineHeight: 22,
  },
  resetButton: {
    minHeight: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.one,
  },
  resetButtonPressed: {
    opacity: 0.6,
  },
  resetButtonLabel: {
    fontFamily: Fonts.mono,
    letterSpacing: 1,
    fontWeight: '700',
  },
  sectionHeader: {
    letterSpacing: 2,
    fontFamily: Fonts.mono,
    marginTop: Spacing.one,
  },
  panel: {
    borderRadius: 12,
    borderWidth: 2,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: 2,
  },
  divider: {
    height: 1,
    marginVertical: Spacing.two,
    opacity: 0.6,
  },
});
