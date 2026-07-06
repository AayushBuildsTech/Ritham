import { Slot, useRouter, useSegments } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { useFonts } from 'expo-font';
import {
  Fraunces_500Medium,
  Fraunces_600SemiBold,
  Fraunces_700Bold,
} from '@expo-google-fonts/fraunces';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import { LoadingScreen } from '../components/LoadingScreen';
import { AnimatedSplash } from '../components/AnimatedSplash';

// Hold the native (static) splash until fonts + first auth check are ready, so
// there is no flash of unstyled/system-font content before the branded splash.
SplashScreen.preventAutoHideAsync().catch(() => {});

// Global auth guard: reacts to session changes anywhere in the app and
// redirects. Without this, verifying OTP updates the session but leaves the
// user stranded on the verify screen, because app/index.tsx only redirects
// while the root "/" route is mounted.
function AuthGate() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === '(auth)';
    const isPublic = segments[0] === 'legal'; // policy screens are readable signed-out

    if (session && inAuthGroup) {
      // Signed in but still on an auth screen → go to the app
      router.replace('/(tabs)');
    } else if (!session && !inAuthGroup && !isPublic) {
      // Signed out but on a protected screen → go to auth
      router.replace('/(auth)');
    }
  }, [session, loading, segments, router]);

  if (loading) return <LoadingScreen />;
  return <Slot />;
}

function RootLayoutInner() {
  const { colors, statusBarStyle, ready } = useThemeBits();
  const [fontsLoaded] = useFonts({
    Fraunces_500Medium,
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const [splashDone, setSplashDone] = useState(false);

  // Hand off from the native splash once fonts + persisted theme are ready.
  const onLayoutReady = useCallback(async () => {
    if (fontsLoaded && ready) await SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, ready]);

  if (!fontsLoaded || !ready) return null; // native splash still showing

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }} onLayout={onLayoutReady}>
      <StatusBar style={statusBarStyle} />
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
      {!splashDone && <AnimatedSplash onFinish={() => setSplashDone(true)} />}
    </View>
  );
}

// small helper so RootLayoutInner reads theme without importing useTheme shape inline
function useThemeBits() {
  const { colors, ready } = useTheme();
  return { colors, ready, statusBarStyle: colors.statusBar };
}

export default function RootLayout() {
  return (
    <KeyboardProvider>
      <ThemeProvider>
        <RootLayoutInner />
      </ThemeProvider>
    </KeyboardProvider>
  );
}
