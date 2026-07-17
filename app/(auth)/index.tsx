import { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, ImageBackground } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
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
import { useLanguage } from '../../context/LanguageContext';
import { Reveal } from '../../components/Reveal';

export default function SignInScreen() {
  const th = useColors();
  const styles = makeStyles(th);
  const { t } = useLanguage();
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
        setError(t('auth.cancelled'));
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
        setError(t('auth.playServices'));
        return;
      }
      setError(friendlyAuthError(e));
    }
  };

  return (
    <ImageBackground source={require('../../assets/auth/login-hero.webp')} style={styles.root} resizeMode="cover">
      <StatusBar style="light" />
      <LinearGradient
        colors={['rgba(13,13,26,0.15)', 'rgba(13,13,26,0.55)', 'rgba(13,13,26,0.94)']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={styles.inner}>
      <Reveal index={0}>
        <View style={styles.header}>
          <Text style={styles.logo}>Ritham</Text>
          <View style={styles.rule} />
          <Text style={styles.tagline}>{t('auth.tagline')}</Text>
        </View>
      </Reveal>

      <Reveal index={1}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('auth.beginJourney')}</Text>
          <Text style={styles.cardSubtitle}>
            {t('auth.subtitle')}
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
                <Text style={styles.btnText}>{t('auth.continueGoogle')}</Text>
              </View>
            )}
          </Pressable>

          <Text style={styles.disclaimer}>
            {t('auth.agreePre')}
            <Text style={styles.link} onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'terms' } })}>{t('auth.terms')}</Text>
            {t('auth.and')}
            <Text style={styles.link} onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'privacy' } })}>{t('auth.privacy')}</Text>.
          </Text>
        </View>
      </Reveal>
      </View>
    </ImageBackground>
  );
}

const makeStyles = (th: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: th.canvas },
  inner: { flex: 1, justifyContent: 'flex-end', padding: Spacing.lg, paddingBottom: Spacing.xxl },
  header: { alignItems: 'center', marginBottom: Spacing.xl },
  logo: { fontFamily: Fonts.displayBold, fontSize: 56, color: '#FFFFFF', letterSpacing: 1 },
  rule: { width: 88, height: 1, backgroundColor: th.goldLight, opacity: 0.9, marginVertical: Spacing.md },
  tagline: { fontFamily: Fonts.bodyMedium, fontSize: 11, color: 'rgba(255,255,255,0.75)', letterSpacing: 4 },
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
