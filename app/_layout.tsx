import { Slot, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { LoadingScreen } from '../components/LoadingScreen';
import { Colors } from '../constants/theme';

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
  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <StatusBar style="light" />
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </View>
  );
}
