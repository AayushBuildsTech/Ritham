import { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Colors, Fonts, Spacing } from '../../constants/theme';

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
      setError(err.message);
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
      setError(err.message);
    } else {
      setResendMsg('OTP resent successfully.');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.logo}>✦</Text>
          <Text style={styles.title}>Ritham</Text>
        </View>

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

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleVerify}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color={Colors.bg} />
              : <Text style={styles.btnText}>Verify & Continue</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.resendBtn}
            onPress={handleResend}
            disabled={resending}
          >
            <Text style={styles.resendText}>
              {resending ? 'Sending...' : "Didn't receive it? Resend OTP"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>← Change number</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: Spacing.lg },
  header: { alignItems: 'center', marginBottom: Spacing.xxl },
  logo: { fontSize: 48, color: Colors.gold, marginBottom: Spacing.sm },
  title: { fontSize: Fonts.size.hero, color: Colors.goldLight, fontWeight: '700', letterSpacing: 3 },
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: 20,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardTitle: { fontSize: Fonts.size.xl, color: Colors.text, fontWeight: '700', marginBottom: Spacing.xs },
  cardSubtitle: { fontSize: Fonts.size.sm, color: Colors.textMuted, marginBottom: Spacing.lg, lineHeight: 20 },
  phoneHighlight: { color: Colors.goldLight, fontWeight: '600' },
  otpInput: {
    borderWidth: 1,
    borderColor: Colors.gold,
    borderRadius: 10,
    padding: Spacing.md,
    fontSize: Fonts.size.xxl,
    color: Colors.goldLight,
    backgroundColor: Colors.bgMid,
    marginBottom: Spacing.md,
    letterSpacing: 12,
  },
  errorText: { color: Colors.error, fontSize: Fonts.size.sm, marginBottom: Spacing.sm, textAlign: 'center' },
  successText: { color: Colors.success, fontSize: Fonts.size.sm, marginBottom: Spacing.sm, textAlign: 'center' },
  btn: {
    backgroundColor: Colors.gold,
    borderRadius: 10,
    padding: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: Colors.bg, fontSize: Fonts.size.md, fontWeight: '700' },
  resendBtn: { padding: Spacing.md, alignItems: 'center', marginTop: Spacing.xs },
  resendText: { color: Colors.gold, fontSize: Fonts.size.sm },
  backBtn: { padding: Spacing.sm, alignItems: 'center', marginTop: Spacing.xs },
  backText: { color: Colors.textMuted, fontSize: Fonts.size.sm },
});
