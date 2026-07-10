import { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { AntDesign } from '@expo/vector-icons';
import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { configureGoogle } from '../../lib/googleAuth';
import { friendlyAuthError } from '../../lib/authErrors';
import { track } from '../../lib/analytics';
import { Fonts, Spacing, Radius, Depth, ThemeColors } from '../../constants/theme';
import { useColors } from '../../context/ThemeContext';
import { Reveal } from '../../components/Reveal';

export default function SignInScreen() {
  const th = useColors();
  const styles = makeStyles(th);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    configureGoogle();
  }, []);

  const handleGoogle = async () => {
    setError('');
    setLoading(true);
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const res = await GoogleSignin.signIn();
      // v13+ returns { type, data }; older returns the userInfo directly.
      const idToken = (res as any)?.data?.idToken ?? (res as any)?.idToken;
      if (!idToken) {
        setLoading(false);
        setError('Google sign-in was cancelled.');
        return;
      }
      const { error: err } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      });
      setLoading(false);
      if (err) {
        setError(friendlyAuthError(err));
      } else {
        track('login', { method: 'google' });
        // On success, AuthContext picks up the session and AuthGate redirects to (tabs).
      }
    } catch (e: any) {
      setLoading(false);
      if (e?.code === statusCodes.SIGN_IN_CANCELLED) return; // user backed out — no error
      if (e?.code === statusCodes.IN_PROGRESS) return;
      if (e?.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        setError('Google Play Services is required to sign in. Please update it and try again.');
        return;
      }
      setError(friendlyAuthError(e));
    }
  };

  return (
    <View style={styles.root}>
      <Reveal index={0}>
        <View style={styles.header}>
          <Text style={styles.logo}>Ritham</Text>
          <View style={styles.rule} />
          <Text style={styles.tagline}>VEDIC WISDOM · REFINED</Text>
        </View>
      </Reveal>

      <Reveal index={1}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Begin your journey</Text>
          <Text style={styles.cardSubtitle}>
            Sign in to create your account and unlock your chart, horoscopes, and readings.
          </Text>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Pressable
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleGoogle}
            disabled={loading}
            android_ripple={{ color: th.goldDeep }}
          >
            {loading ? (
              <ActivityIndicator color={th.goldContrast} />
            ) : (
              <View style={styles.btnInner}>
                <AntDesign name="google" size={18} color={th.goldContrast} />
                <Text style={styles.btnText}>Continue with Google</Text>
              </View>
            )}
          </Pressable>

          <Text style={styles.disclaimer}>
            By continuing, you agree to our{' '}
            <Text style={styles.link} onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'terms' } })}>Terms of Service</Text>
            {' '}and{' '}
            <Text style={styles.link} onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'privacy' } })}>Privacy Policy</Text>.
          </Text>
        </View>
      </Reveal>
    </View>
  );
}

const makeStyles = (th: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: th.canvas, justifyContent: 'center', padding: Spacing.lg },
  header: { alignItems: 'center', marginBottom: Spacing.xxl },
  logo: { fontFamily: Fonts.displayBold, fontSize: 56, color: th.goldLight, letterSpacing: 1 },
  rule: { width: 88, height: 1, backgroundColor: th.gold, opacity: 0.7, marginVertical: Spacing.md },
  tagline: { fontFamily: Fonts.bodyMedium, fontSize: 11, color: th.textMuted, letterSpacing: 4 },
  card: {
    backgroundColor: th.surface,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: th.border,
    ...Depth.card,
  },
  cardTitle: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.xxl, color: th.text, marginBottom: Spacing.xs },
  cardSubtitle: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: th.textMuted, marginBottom: Spacing.lg, lineHeight: 20 },
  errorText: { fontFamily: Fonts.body, color: th.error, fontSize: Fonts.size.sm, marginBottom: Spacing.sm },
  btn: {
    backgroundColor: th.goldSurface,
    borderRadius: Radius.sm,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  btnDisabled: { opacity: 0.6 },
  btnInner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  btnText: { fontFamily: Fonts.bodySemibold, color: th.goldContrast, fontSize: Fonts.size.md, letterSpacing: 0.5 },
  disclaimer: { fontFamily: Fonts.body, fontSize: Fonts.size.xs, color: th.textDim, marginTop: Spacing.lg, textAlign: 'center', lineHeight: 18 },
  link: { color: th.goldLight, textDecorationLine: 'underline' },
});
