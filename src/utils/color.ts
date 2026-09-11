/** Lightens (positive percent) or darkens (negative percent) a `#rrggbb` color. */
export function shadeColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);

  const r = clampChannel((num >> 16) + amt);
  const g = clampChannel(((num >> 8) & 0x00ff) + amt);
  const b = clampChannel((num & 0x0000ff) + amt);

  return `#${(0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1)}`;
}

function clampChannel(value: number): number {
  return Math.min(255, Math.max(0, value));
}

/** Converts a `#rrggbb` color to an `rgba(...)` string at the given opacity (0–1). */
export function withAlpha(hex: string, alpha: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
