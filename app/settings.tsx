import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useAuth } from '../context/AuthContext';
import { deleteAccount } from '../lib/accountService';
import { CONTACT_EMAIL } from '../constants/legal';
import { Colors, Fonts, Spacing } from '../constants/theme';

export default function SettingsScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const version = Constants.expoConfig?.version ?? '1.0.0';
  const [deleting, setDeleting] = useState(false);

  function confirmSignOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
    ]);
  }

  async function runDelete() {
    setDeleting(true);
    const res = await deleteAccount();
    if (res.ok) {
      // Account is gone server-side; clear the local session → AuthGate returns to sign-in.
      await signOut();
      return; // component unmounts on redirect; leave the spinner up
    }
    setDeleting(false);
    Alert.alert(
      'Couldn’t delete account',
      'Something went wrong. Please check your connection and try again, or email us at ' + CONTACT_EMAIL + '.',
    );
  }

  function confirmDelete() {
    // Two-step confirmation — deletion is permanent and irreversible.
    Alert.alert(
      'Delete account?',
      'This permanently deletes your account and all your data — your Kundli, chats, purchases, and reports. This cannot be undone. Any unused packs or credits are forfeited.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            Alert.alert(
              'Are you sure?',
              'Last chance — your account and data will be erased and cannot be recovered.',
              [
                { text: 'Keep my account', style: 'cancel' },
                { text: 'Delete forever', style: 'destructive', onPress: runDelete },
              ],
            ),
        },
      ],
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.back}>‹ Back</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Account */}
        <Text style={styles.sectionLabel}>ACCOUNT</Text>
        <View style={styles.group}>
          <Row label="Mobile number" value={user?.phone ?? '—'} />
          <Row label="Your Kundli" value="View / edit" onPress={() => router.push('/profile')} last />
        </View>

        {/* Legal */}
        <Text style={styles.sectionLabel}>LEGAL</Text>
        <View style={styles.group}>
          <Row label="Privacy Policy" chevron onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'privacy' } })} />
          <Row label="Terms of Service" chevron onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'terms' } })} />
          <Row label="Astrology Disclaimer" chevron onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'disclaimer' } })} last />
        </View>

        {/* Support */}
        <Text style={styles.sectionLabel}>SUPPORT</Text>
        <View style={styles.group}>
          <Row label="Contact us" value={CONTACT_EMAIL} last />
        </View>

        <TouchableOpacity style={styles.signOutBtn} onPress={confirmSignOut} disabled={deleting}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        {/* Danger zone */}
        <Text style={styles.sectionLabel}>DANGER ZONE</Text>
        <TouchableOpacity
          style={[styles.deleteBtn, deleting && styles.deleteBtnBusy]}
          onPress={confirmDelete}
          disabled={deleting}
          activeOpacity={0.7}
        >
          {deleting ? (
            <ActivityIndicator color={Colors.error} />
          ) : (
            <Text style={styles.deleteText}>Delete Account</Text>
          )}
        </TouchableOpacity>
        <Text style={styles.deleteHint}>
          Permanently erases your account and all data. This can’t be undone.
        </Text>

        <Text style={styles.version}>Ritham · v{version}</Text>
        <Text style={styles.tagline}>Made with care for seekers of clarity ✦</Text>
      </ScrollView>
    </View>
  );
}

function Row({ label, value, onPress, chevron, last }: {
  label: string; value?: string; onPress?: () => void; chevron?: boolean; last?: boolean;
}) {
  const inner = (
    <View style={[styles.row, !last && styles.rowBorder]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowRight}>
        {value ? <Text style={styles.rowValue}>{value}</Text> : null}
        {(chevron || onPress) ? <Text style={styles.rowChevron}>›</Text> : null}
      </View>
    </View>
  );
  return onPress ? <TouchableOpacity onPress={onPress} activeOpacity={0.7}>{inner}</TouchableOpacity> : inner;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 52, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.bgCard,
  },
  back: { color: Colors.goldLight, fontSize: Fonts.size.md, width: 48 },
  headerTitle: { color: Colors.text, fontSize: Fonts.size.lg, fontWeight: '700' },

  content: { padding: Spacing.lg, paddingTop: Spacing.xl },
  sectionLabel: { color: Colors.textDim, fontSize: Fonts.size.xs, letterSpacing: 1, fontWeight: '700', marginBottom: Spacing.sm, marginTop: Spacing.md },
  group: {
    backgroundColor: Colors.bgCard, borderRadius: 14, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.md },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  rowLabel: { color: Colors.text, fontSize: Fonts.size.md },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  rowValue: { color: Colors.textMuted, fontSize: Fonts.size.sm },
  rowChevron: { color: Colors.textDim, fontSize: Fonts.size.lg },

  signOutBtn: {
    borderWidth: 1, borderColor: Colors.error, borderRadius: 12, padding: Spacing.md,
    alignItems: 'center', marginTop: Spacing.xl,
  },
  signOutText: { color: Colors.error, fontSize: Fonts.size.md, fontWeight: '700' },

  deleteBtn: {
    backgroundColor: Colors.error, borderRadius: 12, padding: Spacing.md,
    alignItems: 'center', justifyContent: 'center', minHeight: 52,
  },
  deleteBtnBusy: { opacity: 0.7 },
  deleteText: { color: Colors.bg, fontSize: Fonts.size.md, fontWeight: '700' },
  deleteHint: { color: Colors.textDim, fontSize: Fonts.size.xs, textAlign: 'center', marginTop: Spacing.sm },

  version: { color: Colors.textDim, fontSize: Fonts.size.xs, textAlign: 'center', marginTop: Spacing.xl },
  tagline: { color: Colors.textDim, fontSize: Fonts.size.xs, textAlign: 'center', marginTop: 4 },
});
