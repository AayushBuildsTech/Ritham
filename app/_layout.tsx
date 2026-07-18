import 'react-native-get-random-values'; // crypto polyfill required by the voice-call SDK (Daily/WebRTC)
import { Stack, useRouter, useSegments } from 'expo-router';
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
import { ProfileProvider } from '../context/ProfileContext';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import { LanguageProvider, useLanguage } from '../context/LanguageContext';
import { LoadingScreen } from '../components/LoadingScreen';
import { AnimatedSplash } from '../components/AnimatedSplash';
import { AppDialog } from '../components/AppDialog';

// Hold the native (static) splash until fonts + first auth check are ready, so
// there is no flash of unstyled/system-font content before the branded splash.
SplashScreen.preventAutoHideAsync().catch(() => {});

// Global auth guard: reacts to session changes anywhere in the app and
// redirects. Without this, signing in updates the session but leaves the user
// stranded on the sign-in screen, because app/index.tsx only redirects while
// the root "/" route is mounted.
function AuthGate() {
  const { session, loading } = useAuth();
  const { chosen, ready: langReady } = useLanguage();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading || !langReady) return;
    const inAuthGroup = segments[0] === '(auth)';
    const isPublic = segments[0] === 'legal'; // policy screens are readable signed-out
    // `language` is a newly added route; the generated router types regenerate on the
    // next Expo run, so compare/navigate via a plain string until then.
    const onLanguage = (segments[0] as string) === 'language';

    // First run: force the language chooser before anything else (even sign-in).
    if (!chosen) {
      if (!onLanguage) router.replace('/language' as never);
      return;
    }

    if (session && (inAuthGroup || onLanguage)) {
      // Signed in but still on an auth/language screen → go to the app
      router.replace('/(tabs)');
    } else if (!session && !inAuthGroup && !isPublic && !onLanguage) {
      // Signed out but on a protected screen → go to auth
      router.replace('/(auth)');
    }
  }, [session, loading, chosen, langReady, segments, router]);

  if (loading) return <LoadingScreen />;
  // A real Stack (not <Slot />) gives every top-level route proper push/pop
  // history, so `router.back()` returns to the ACTUAL previous screen and the
  // (tabs) navigator keeps its active tab when popped back to — without this,
  // back always fell through to Home. All screens draw their own headers
  // (ScreenHeader / custom tab + auth chrome), so the native header stays hidden.
  return <Stack screenOptions={{ headerShown: false }} />;
}

function RootLayoutInner() {
  const { colors, statusBarStyle, ready } = useThemeBits();
  const { ready: langReady } = useLanguage();
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
    if (fontsLoaded && ready && langReady) await SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, ready, langReady]);

  if (!fontsLoaded || !ready || !langReady) return null; // native splash still showing

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }} onLayout={onLayoutReady}>
      <StatusBar style={statusBarStyle} />
      <AuthProvider>
        <ProfileProvider>
          <AuthGate />
        </ProfileProvider>
      </AuthProvider>
      {/* Themed, in-app replacement for native Alert popups. */}
      <AppDialog />
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
        <LanguageProvider>
          <RootLayoutInner />
        </LanguageProvider>
      </ThemeProvider>
    </KeyboardProvider>
  );
}
