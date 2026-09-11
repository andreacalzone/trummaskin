export type InstrumentId = 'kick' | 'snare' | 'closedHiHat' | 'openHiHat' | 'tom' | 'clap';

/**
 * 0 = inactive. Any other value is the gain multiplier for that step's hit
 * (see STEP_VELOCITY in constants/velocity.ts for the named levels).
 */
export type StepVelocity = number;

export type Instrument = {
  id: InstrumentId;
  name: string;
  /** Placeholder reference to the drum sample; wired up in the audio milestone. */
  sample: string;
  steps: StepVelocity[];
  volume: number;
  muted: boolean;
};

export type Pattern = {
  id: string;
  name: string;
  bpm: number;
  stepCount: number;
  instruments: Instrument[];
};
