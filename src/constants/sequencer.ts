export const MIN_BPM = 40;
export const MAX_BPM = 240;
export const DEFAULT_BPM = 120;

export const MIN_SWING = 0;
export const MAX_SWING = 100;
export const DEFAULT_SWING = 0;
export const SWING_STEP = 5;

// Holding RESET escalates through two tiers: release before the first
// threshold is a plain tap (reset the current instrument only); crossing
// PATTERN_RESET_HOLD_MS resets the whole current pattern immediately, and
// continuing to hold to ALL_PATTERNS_RESET_HOLD_MS resets every pattern.
// Both fire the instant the threshold is crossed, not on release.
export const PATTERN_RESET_HOLD_MS = 600;
export const ALL_PATTERNS_RESET_HOLD_MS = 1800;
