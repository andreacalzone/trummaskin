import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { AppProvider } from '@/state/app-context';

SplashScreen.preventAutoHideAsync();

// The app has one fixed dark hardware identity — it doesn't switch look with
// the OS appearance setting, the way a physical drum machine wouldn't either.
export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <ThemeProvider value={DarkTheme}>
      <StatusBar style="light" />
      {/* One audio engine/scheduler/state instance for the whole app —
          AppProvider sits above the Stack so pushing the FX screen on top
          of the main screen never tears it down or duplicates it. */}
      <AppProvider>
        <Stack screenOptions={{ headerShown: false }}>
          {/* The FX page is full of horizontal drag sliders reaching close
              to the screen edges — iOS's default edge-swipe-to-go-back
              gesture was grabbing those drags before the sliders' own
              PanResponder could, both fighting to go back mid-drag and
              cutting the drag short. Disabled here so BACK is the only way
              back, and dragging a slider never gets interpreted as
              navigation. */}
          <Stack.Screen name="fx" options={{ gestureEnabled: false }} />
        </Stack>
      </AppProvider>
    </ThemeProvider>
  );
}
