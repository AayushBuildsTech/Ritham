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
import { LoadingScreen } from '../components/LoadingScreen';
import { AnimatedSplash } from '../components/AnimatedSplash';
import { Colors } from '../constants/theme';

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

export default function RootLayout() {
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

  // Hand off from the native splash to our animated one the instant fonts are
  // ready (so the wordmark renders in Cormorant, not the system font).
  const onLayoutReady = useCallback(async () => {
    if (fontsLoaded) await SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  if (!fontsLoaded) return null; // native splash still showing

  return (
    <KeyboardProvider>
      <View style={{ flex: 1, backgroundColor: Colors.canvas }} onLayout={onLayoutReady}>
        <StatusBar style="light" />
        <AuthProvider>
          <AuthGate />
        </AuthProvider>
        {!splashDone && <AnimatedSplash onFinish={() => setSplashDone(true)} />}
      </View>
    </KeyboardProvider>
  );
}
