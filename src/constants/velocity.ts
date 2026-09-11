/**
 * A step's stored value doubles as both "is it active" and "how hard does it
 * hit": 0 means inactive, any other value is the gain multiplier applied to
 * that scheduled hit. Keeping it a single number (rather than a
 * { active, velocity } object) keeps "is this step active?" a one-line check
 * everywhere it's already checked as a boolean-ish value.
 */
export const STEP_VELOCITY = {
  NORMAL: 1,
  ACCENT: 1.25,
  SOFT: 0.4,
} as const;

/** Quick tap: plain on/off. Reactivating always resets to normal velocity. */
export function toggleStepActive(current: number): number {
  return current === 0 ? STEP_VELOCITY.NORMAL : 0;
}

/**
 * Long-press: cycles the step's velocity while keeping it active —
 * normal (or inactive) → accent → soft → normal → ... Never returns 0, so
 * holding can activate a step but never deactivate one.
 */
export function cycleHoldVelocity(current: number): number {
  if (current === STEP_VELOCITY.ACCENT) return STEP_VELOCITY.SOFT;
  if (current === STEP_VELOCITY.SOFT) return STEP_VELOCITY.NORMAL;
  return STEP_VELOCITY.ACCENT; // covers 0 (inactive) and NORMAL
}
