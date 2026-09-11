import type { InstrumentId } from '@/types/pattern';

export const SAMPLE_SOURCES: Record<InstrumentId, number> = {
  kick: require('../../assets/samples/kick.wav'),
  snare: require('../../assets/samples/snare.wav'),
  closedHiHat: require('../../assets/samples/hihat-closed.wav'),
  openHiHat: require('../../assets/samples/hihat-open.wav'),
  tom: require('../../assets/samples/tom.wav'),
  clap: require('../../assets/samples/clap.wav'),
};
