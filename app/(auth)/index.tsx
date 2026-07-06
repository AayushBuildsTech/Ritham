import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { friendlyAuthError } from '../../lib/authErrors';
import { Colors, Fonts, Spacing, Radius, Depth, ThemeColors } from '../../constants/theme';
import { useColors } from '../../context/ThemeContext';
import { Reveal } from '../../components/Reveal';

export default function PhoneScreen() {
  const th = useColors();
  const styles = makeStyles(th);
  const [digits, setDigits] = useState(''); // 10-digit local number; +91 is fixed
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSendOtp = async () => {
    setError('');
    if (!/^[6-9]\d{9}$/.test(digits)) {
      setError('Enter a valid 10-digit Indian mobile number.');
      return;
    }
    const phone = `+91${digits}`;
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithOtp({ phone });
    setLoading(false);
    if (err) {
      setError(friendlyAuthError(err));
    } else {
      router.push({ pathname: '/(auth)/verify-otp', params: { phone } });
    }
  };

  return (
    <KeyboardAwareScrollView
      style={styles.root}
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
      bottomOffset={24}
      showsVerticalScrollIndicator={false}
    >
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
            Enter your mobile number to sign in or create your account.
          </Text>

          <Text style={styles.label}>MOBILE NUMBER</Text>
          <View style={[styles.phoneRow, focused && styles.phoneRowFocused]}>
            <Text style={styles.prefix}>+91</Text>
            <View style={styles.prefixDivider} />
            <TextInput
              style={styles.phoneInput}
              placeholder="98765 43210"
              placeholderTextColor={th.textDim}
              keyboardType="number-pad"
              value={digits}
              onChangeText={(t) => setDigits(t.replace(/\D/g, '').slice(0, 10))}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              autoFocus
              maxLength={10}
            />
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Pressable
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleSendOtp}
            disabled={loading}
            android_ripple={{ color: th.goldDeep }}
          >
            {loading
              ? <ActivityIndicator color={th.goldContrast} />
              : <Text style={styles.btnText}>Send OTP</Text>
            }
          </Pressable>

          <Text style={styles.disclaimer}>
            By continuing, you agree to our{' '}
            <Text style={styles.link} onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'terms' } })}>Terms of Service</Text>
            {' '}and{' '}
            <Text style={styles.link} onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'privacy' } })}>Privacy Policy</Text>.
          </Text>
        </View>
      </Reveal>
    </KeyboardAwareScrollView>
  );
}

const makeStyles = (th: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: th.canvas },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: Spacing.lg },
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
  label: { fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.xs, color: th.textMuted, letterSpacing: 1.5, marginBottom: Spacing.sm },
  phoneRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: th.border, borderRadius: Radius.sm,
    backgroundColor: th.surfaceSunken, marginBottom: Spacing.md, paddingLeft: Spacing.md,
  },
  phoneRowFocused: { borderColor: th.borderStrong },
  prefix: { fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.md, color: th.goldLight },
  prefixDivider: { width: 1, height: 22, backgroundColor: th.border, marginLeft: Spacing.md },
  phoneInput: {
    flex: 1, padding: Spacing.md,
    fontFamily: Fonts.bodyMedium, fontSize: Fonts.size.md, color: th.text, letterSpacing: 1,
  },
  errorText: { fontFamily: Fonts.body, color: th.error, fontSize: Fonts.size.sm, marginBottom: Spacing.sm },
  btn: {
    backgroundColor: th.gold,
    borderRadius: Radius.sm,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { fontFamily: Fonts.bodySemibold, color: th.goldContrast, fontSize: Fonts.size.md, letterSpacing: 0.5 },
  disclaimer: { fontFamily: Fonts.body, fontSize: Fonts.size.xs, color: th.textDim, marginTop: Spacing.lg, textAlign: 'center', lineHeight: 18 },
  link: { color: th.goldLight, textDecorationLine: 'underline' },
});
