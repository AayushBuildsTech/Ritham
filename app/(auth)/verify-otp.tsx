import { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { friendlyAuthError } from '../../lib/authErrors';
import { track } from '../../lib/analytics';
import { Colors, Fonts, Spacing, Radius, Depth } from '../../constants/theme';
import { Icon } from '../../components/Icon';
import { Reveal } from '../../components/Reveal';

export default function VerifyOtpScreen() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [resendMsg, setResendMsg] = useState('');
  const router = useRouter();

  const handleVerify = async () => {
    setError('');
    if (otp.length !== 6) {
      setError('Please enter the 6-digit OTP.');
      return;
    }
    setLoading(true);
    const { error: err } = await supabase.auth.verifyOtp({
      phone: phone ?? '',
      token: otp,
      type: 'sms',
    });
    setLoading(false);
    if (err) {
      setError(friendlyAuthError(err));
    } else {
      track('login', { method: 'otp' });
    }
    // On success, AuthContext picks up the new session and RootGuard redirects to (tabs)
  };

  const handleResend = async () => {
    setResendMsg('');
    setError('');
    setResending(true);
    const { error: err } = await supabase.auth.signInWithOtp({ phone: phone ?? '' });
    setResending(false);
    if (err) {
      setError(friendlyAuthError(err));
    } else {
      setResendMsg('OTP resent successfully.');
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
          </View>
        </Reveal>

        <Reveal index={1}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Verify OTP</Text>
            <Text style={styles.cardSubtitle}>
              Enter the 6-digit code sent to{'\n'}
              <Text style={styles.phoneHighlight}>{phone}</Text>
            </Text>

            <TextInput
              style={styles.otpInput}
              placeholder="------"
              placeholderTextColor={Colors.textDim}
              keyboardType="number-pad"
              maxLength={6}
              value={otp}
              onChangeText={setOtp}
              textAlign="center"
              autoFocus
            />

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {resendMsg ? <Text style={styles.successText}>{resendMsg}</Text> : null}

            <Pressable
              style={[styles.btn, loading && styles.btnDisabled]}
              onPress={handleVerify}
              disabled={loading}
              android_ripple={{ color: Colors.goldDeep }}
            >
              {loading
                ? <ActivityIndicator color={Colors.canvas} />
                : <Text style={styles.btnText}>Verify & Continue</Text>
              }
            </Pressable>

            <Pressable style={styles.resendBtn} onPress={handleResend} disabled={resending}>
              <Text style={styles.resendText}>
                {resending ? 'Sending…' : "Didn't receive it? Resend OTP"}
              </Text>
            </Pressable>

            <Pressable onPress={() => router.back()} style={styles.backBtn}>
              <Icon name="back" size={16} color={Colors.textMuted} />
              <Text style={styles.backText}>Change number</Text>
            </Pressable>
          </View>
        </Reveal>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.canvas },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: Spacing.lg },
  header: { alignItems: 'center', marginBottom: Spacing.xxl },
  logo: { fontFamily: Fonts.displayBold, fontSize: 56, color: Colors.goldLight, letterSpacing: 1 },
  rule: { width: 88, height: 1, backgroundColor: Colors.gold, opacity: 0.7, marginTop: Spacing.md },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Depth.card,
  },
  cardTitle: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.xxl, color: Colors.text, marginBottom: Spacing.xs },
  cardSubtitle: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: Colors.textMuted, marginBottom: Spacing.lg, lineHeight: 20 },
  phoneHighlight: { fontFamily: Fonts.bodySemibold, color: Colors.goldLight },
  otpInput: {
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    borderRadius: Radius.sm,
    padding: Spacing.md,
    fontFamily: Fonts.bodyBold,
    fontSize: Fonts.size.xxl,
    color: Colors.goldLight,
    backgroundColor: Colors.surfaceSunken,
    marginBottom: Spacing.md,
    letterSpacing: 12,
  },
  errorText: { fontFamily: Fonts.body, color: Colors.error, fontSize: Fonts.size.sm, marginBottom: Spacing.sm, textAlign: 'center' },
  successText: { fontFamily: Fonts.body, color: Colors.success, fontSize: Fonts.size.sm, marginBottom: Spacing.sm, textAlign: 'center' },
  btn: {
    backgroundColor: Colors.gold,
    borderRadius: Radius.sm,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { fontFamily: Fonts.bodySemibold, color: Colors.canvas, fontSize: Fonts.size.md, letterSpacing: 0.5 },
  resendBtn: { padding: Spacing.md, alignItems: 'center', marginTop: Spacing.xs },
  resendText: { fontFamily: Fonts.bodyMedium, color: Colors.gold, fontSize: Fonts.size.sm },
  backBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, padding: Spacing.sm, marginTop: Spacing.xs },
  backText: { fontFamily: Fonts.body, color: Colors.textMuted, fontSize: Fonts.size.sm },
});
