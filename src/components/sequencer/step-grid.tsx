import { StyleSheet, View } from 'react-native';

import { StepTile } from '@/components/sequencer/step-tile';
import { Spacing } from '@/constants/theme';

const COLUMNS = 4;
const MAX_GRID_WIDTH = 480;

type StepGridProps = {
  steps: number[];
  onToggleStep: (index: number) => void;
  onLongPressStep: (index: number) => void;
  currentStep?: number | null;
};

export function StepGrid({ steps, onToggleStep, onLongPressStep, currentStep = null }: StepGridProps) {
  const rows = Array.from({ length: steps.length / COLUMNS }, (_, rowIndex) =>
    steps.slice(rowIndex * COLUMNS, rowIndex * COLUMNS + COLUMNS),
  );

  return (
    <View style={styles.container}>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {row.map((velocity, columnIndex) => {
            const stepIndex = rowIndex * COLUMNS + columnIndex;
            return (
              <StepTile
                key={stepIndex}
                velocity={velocity}
                isPlayhead={stepIndex === currentStep}
                onPress={() => onToggleStep(stepIndex)}
                onLongPress={() => onLongPressStep(stepIndex)}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    maxWidth: MAX_GRID_WIDTH,
    alignSelf: 'center',
    gap: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
});
