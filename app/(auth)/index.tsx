import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Colors, Fonts, Spacing } from '../../constants/theme';

export default function PhoneScreen() {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSendOtp = async () => {
    setError('');
    const cleaned = phone.trim().replace(/\s/g, '');
    if (!/^\+91[6-9]\d{9}$/.test(cleaned)) {
      setError('Enter a valid Indian mobile number with country code, e.g. +919876543210');
      return;
    }
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithOtp({ phone: cleaned });
    setLoading(false);
    if (err) {
      setError(err.message);
    } else {
      router.push({ pathname: '/(auth)/verify-otp', params: { phone: cleaned } });
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Brand header */}
        <View style={styles.header}>
          <Text style={styles.logo}>✦</Text>
          <Text style={styles.title}>Ritham</Text>
          <Text style={styles.tagline}>Your Vedic Astrology Companion</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Begin Your Journey</Text>
          <Text style={styles.cardSubtitle}>
            Enter your mobile number to sign in or create your account.
          </Text>

          <Text style={styles.label}>Mobile Number</Text>
          <TextInput
            style={styles.input}
            placeholder="+91 98765 43210"
            placeholderTextColor={Colors.textDim}
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
            autoFocus
            maxLength={13}
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleSendOtp}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color={Colors.bg} />
              : <Text style={styles.btnText}>Send OTP</Text>
            }
          </TouchableOpacity>

          <Text style={styles.disclaimer}>
            By continuing, you agree to our Terms of Service and Privacy Policy.
          </Text>
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
  tagline: { fontSize: Fonts.size.sm, color: Colors.textMuted, marginTop: Spacing.xs, letterSpacing: 1 },
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: 20,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardTitle: { fontSize: Fonts.size.xl, color: Colors.text, fontWeight: '700', marginBottom: Spacing.xs },
  cardSubtitle: { fontSize: Fonts.size.sm, color: Colors.textMuted, marginBottom: Spacing.lg, lineHeight: 20 },
  label: { fontSize: Fonts.size.sm, color: Colors.textMuted, marginBottom: Spacing.xs },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: Spacing.md,
    fontSize: Fonts.size.md,
    color: Colors.text,
    backgroundColor: Colors.bgMid,
    marginBottom: Spacing.md,
  },
  errorText: { color: Colors.error, fontSize: Fonts.size.sm, marginBottom: Spacing.sm },
  btn: {
    backgroundColor: Colors.gold,
    borderRadius: 10,
    padding: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: Colors.bg, fontSize: Fonts.size.md, fontWeight: '700' },
  disclaimer: { fontSize: Fonts.size.xs, color: Colors.textDim, marginTop: Spacing.lg, textAlign: 'center', lineHeight: 16 },
});
