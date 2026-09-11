/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

// The app has a single fixed identity — a physical dark drum-machine unit —
// rather than following the OS light/dark setting like a typical app screen.
// Both keys hold the same hardware palette so useTheme()/useColorScheme()
// need no logic changes; only the palette itself changed.
const hardware = {
  text: '#ECEAE5',
  background: '#101114',
  backgroundElement: '#1C1E22',
  backgroundSelected: '#2A2D33',
  textSecondary: '#8B8F96',
  // Step-pad inactive fill: close to the body color so an unlit pad
  // recedes into the hardware, distinguished mainly by its bevel.
  tile: '#1A1C20',
  // Primary "lit" color — normal-velocity hits, Play-active, selection.
  accent: '#FF6A3D',
  // Hottest/most energetic feedback — accent-velocity hits.
  accentHot: '#FFC94A',
  // Reserved for playback position only, kept out of the pad-state palette
  // so "is this step hit" and "is this the current step" never collide.
  playhead: '#3FD6E8',
} as const;

export const Colors = {
  light: hardware,
  dark: hardware,
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const MaxContentWidth = 800;
