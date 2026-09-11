import type { InstrumentId } from '@/types/pattern';

export const STEP_COUNT = 16;
export const PATTERN_COUNT = 8;

type InstrumentDefinition = {
  id: InstrumentId;
  name: string;
};

export const INSTRUMENT_DEFINITIONS: InstrumentDefinition[] = [
  { id: 'kick', name: 'Kick' },
  { id: 'snare', name: 'Snare' },
  { id: 'closedHiHat', name: 'Closed Hi-Hat' },
  { id: 'openHiHat', name: 'Open Hi-Hat' },
  { id: 'tom', name: 'Tom' },
  { id: 'clap', name: 'Clap' },
];
