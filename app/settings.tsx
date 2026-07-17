import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useAuth } from '../context/AuthContext';
import { isOwner } from '../config/owner';
import { useActiveProfile } from '../context/ProfileContext';
import { deleteAccount } from '../lib/accountService';
import { googleRevoke } from '../lib/googleAuth';
import { remindersEnabled, setRemindersEnabled } from '../lib/notificationsService';
import { CONTACT_EMAIL } from '../constants/legal';
import { Colors, Fonts, Spacing, Radius, ThemeColors } from '../constants/theme';
import { useColors, useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { Icon, IconName } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';

export default function SettingsScreen() {
  const th = useColors();
  const { isDark, toggle } = useTheme();
  const { lang, isHindi, setLang, t } = useLanguage();
  const styles = makeStyles(th);
  const router = useRouter();
  const { user, signOut } = useAuth();
  // The whole app operates on the ACTIVE person (self or a family member). The
  // Kundli link must follow that too — otherwise it always opened the account
  // owner's chart even while a family member was selected.
  const { active, activeId } = useActiveProfile();
  const version = Constants.expoConfig?.version ?? '1.0.0';
  const [deleting, setDeleting] = useState(false);

  // Daily reminders (7 AM / 6 PM) — local notifications, default on.
  const [remOn, setRemOn] = useState(true);
  useEffect(() => { remindersEnabled().then(setRemOn); }, []);
  async function toggleReminders() {
    const next = !remOn;
    setRemOn(next); // optimistic; the OS permission prompt (if any) resolves inside
    await setRemindersEnabled(next, { name: active?.name ?? null, moonSign: active?.moonSign ?? null });
  }

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
      // Fully revoke Ritham's Google grant so no connection lingers and a future
      // sign-up asks the user to pick their account again (not auto-selected).
      await googleRevoke();
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
      <ScreenHeader title={t('settings.title')} onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Language */}
        <Text style={styles.sectionLabel}>{isHindi ? 'भाषा' : 'LANGUAGE'}</Text>
        <View style={styles.group}>
          <SegmentedRow
            icon="info"
            label={t('settings.language')}
            options={[{ key: 'en', label: 'English' }, { key: 'hi', label: 'हिन्दी' }]}
            selected={lang}
            onSelect={(k) => setLang(k === 'hi' ? 'hi' : 'en')}
            last
          />
        </View>
        <Text style={styles.deleteHint}>
          {isHindi
            ? 'ऐप की भाषा बदलें। चैट आपकी लिखी भाषा को स्वयं पहचानता है।'
            : 'Switch the app language. Chat still auto-detects the language you type in.'}
        </Text>

        {/* Appearance */}
        <Text style={styles.sectionLabel}>{isHindi ? 'रूप' : 'APPEARANCE'}</Text>
        <View style={styles.group}>
          <SegmentedRow
            icon={isDark ? 'moon' : 'sun'}
            label={t('settings.theme')}
            options={[{ key: 'light', label: t('settings.themeLight') }, { key: 'dark', label: t('settings.themeDark') }]}
            selected={isDark ? 'dark' : 'light'}
            onSelect={(k) => { if ((k === 'dark') !== isDark) toggle(); }}
            last
          />
        </View>

        {/* Notifications */}
        <Text style={styles.sectionLabel}>{isHindi ? 'सूचनाएं' : 'NOTIFICATIONS'}</Text>
        <View style={styles.group}>
          <SegmentedRow
            icon="clock"
            label={isHindi ? 'दैनिक मार्गदर्शन' : 'Daily guidance'}
            options={[{ key: 'on', label: isHindi ? 'चालू' : 'On' }, { key: 'off', label: isHindi ? 'बंद' : 'Off' }]}
            selected={remOn ? 'on' : 'off'}
            onSelect={(k) => { if ((k === 'on') !== remOn) toggleReminders(); }}
            last
          />
        </View>
        <Text style={styles.deleteHint}>{isHindi ? 'हर दिन सुबह 7 और शाम 6 बजे एक कोमल राशिफल।' : 'A gentle reading at 7 AM and 6 PM each day.'}</Text>

        {/* Account */}
        <Text style={styles.sectionLabel}>{isHindi ? 'खाता' : 'ACCOUNT'}</Text>
        <View style={styles.group}>
          <Row icon="mail" label={isHindi ? 'ईमेल' : 'Email'} value={user?.email ?? '—'} />
          <Row
            icon="moon"
            label={active && active.relation !== 'self' ? t('settings.personKundli', { name: active.name }) : t('settings.yourKundli')}
            value={isHindi ? 'देखें / बदलें' : 'View / edit'}
            onPress={() => router.push(activeId ? { pathname: '/profile', params: { id: activeId } } : '/profile')}
          />
          <Row icon="family" label={t('settings.profiles')} value={isHindi ? 'जोड़ें / प्रबंधित करें' : 'Add / manage'} onPress={() => router.push('/family')} last />
        </View>

        {/* Legal */}
        <Text style={styles.sectionLabel}>{isHindi ? 'कानूनी' : 'LEGAL'}</Text>
        <View style={styles.group}>
          <Row icon="lock" label={t('settings.privacy')} chevron onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'privacy' } })} />
          <Row icon="document" label={t('settings.terms')} chevron onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'terms' } })} />
          <Row icon="info" label={t('settings.disclaimer')} chevron onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'disclaimer' } })} last />
        </View>

        {/* Support */}
        <Text style={styles.sectionLabel}>{isHindi ? 'सहायता' : 'SUPPORT'}</Text>
        <View style={styles.group}>
          <Row icon="send" label={isHindi ? 'संपर्क करें' : 'Contact us'} chevron onPress={() => router.push('/contact')} last />
        </View>

        {/* Owner only — puja admin (view bookings + set slot) */}
        {isOwner(user?.email) && (
          <>
            <Text style={styles.sectionLabel}>OWNER</Text>
            <View style={styles.group}>
              <Row icon="temple" label="Puja Admin" chevron onPress={() => router.push('/puja-admin' as any)} last />
            </View>
          </>
        )}

        <Pressable style={styles.signOutBtn} onPress={confirmSignOut} disabled={deleting} android_ripple={{ color: 'rgba(199,82,75,0.15)' }}>
          <Icon name="logout" size={16} color={th.error} />
          <Text style={styles.signOutText}>{t('settings.signOut')}</Text>
        </Pressable>

        {/* Danger zone */}
        <Text style={styles.sectionLabel}>{isHindi ? 'संवेदनशील' : 'DANGER ZONE'}</Text>
        <Pressable
          style={[styles.deleteBtn, deleting && styles.deleteBtnBusy]}
          onPress={confirmDelete}
          disabled={deleting}
        >
          {deleting ? (
            <ActivityIndicator color={th.error} />
          ) : (
            <>
              <Icon name="trash" size={16} color={th.error} />
              <Text style={styles.deleteText}>{t('settings.deleteAccount')}</Text>
            </>
          )}
        </Pressable>
        <Text style={styles.deleteHint}>
          {isHindi
            ? 'आपका खाता और सारा डेटा स्थायी रूप से मिट जाता है। इसे वापस नहीं लाया जा सकता।'
            : 'Permanently erases your account and all data. This can’t be undone.'}
        </Text>

        <Text style={styles.version}>Ritham · v{version}</Text>
        <Text style={styles.tagline}>{isHindi ? 'स्पष्टता के खोजियों के लिए, सम्मान के साथ' : 'Made with care for seekers of clarity'}</Text>
        <View style={{ height: Spacing.xl }} />
      </ScrollView>
    </View>
  );
}

function Row({ icon, label, value, onPress, chevron, last }: {
  icon: IconName; label: string; value?: string; onPress?: () => void; chevron?: boolean; last?: boolean;
}) {
  const th = useColors();
  const styles = makeStyles(th);
  const inner = (
    <View style={[styles.row, !last && styles.rowBorder]}>
      <View style={styles.rowLeft}>
        <Icon name={icon} size={17} color={th.textMuted} />
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <View style={styles.rowRight}>
        {value ? <Text style={styles.rowValue}>{value}</Text> : null}
        {(chevron || onPress) ? <Icon name="chevron" size={18} color={th.textDim} /> : null}
      </View>
    </View>
  );
  return onPress
    ? <Pressable onPress={onPress} android_ripple={{ color: th.goldFaint }}>{inner}</Pressable>
    : inner;
}

// A choose-between setting shown as ONE segmented button split by a vertical
// divider (theme, language, notifications). The active half is highlighted.
function SegmentedRow({ icon, label, options, selected, onSelect, last }: {
  icon: IconName; label: string;
  options: { key: string; label: string }[];
  selected: string; onSelect: (key: string) => void; last?: boolean;
}) {
  const th = useColors();
  const styles = makeStyles(th);
  return (
    <View style={[styles.row, !last && styles.rowBorder]}>
      <View style={styles.rowLeft}>
        <Icon name={icon} size={17} color={th.textMuted} />
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <View style={styles.segment}>
        {options.map((o, i) => {
          const on = o.key === selected;
          return (
            <Pressable
              key={o.key}
              onPress={() => onSelect(o.key)}
              android_ripple={{ color: th.goldFaint }}
              style={[styles.segItem, i > 0 && styles.segDivider, on && styles.segItemOn]}
            >
              <Text style={[styles.segText, on && styles.segTextOn]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const makeStyles = (th: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: th.canvas },
  content: { padding: Spacing.lg, paddingTop: Spacing.lg },
  sectionLabel: { fontFamily: Fonts.bodySemibold, color: th.textDim, fontSize: Fonts.size.xs, letterSpacing: 2, marginBottom: Spacing.sm, marginTop: Spacing.lg },
  group: {
    backgroundColor: th.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: th.border,
    paddingHorizontal: Spacing.md,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.md },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: th.divider },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexShrink: 0 },
  rowLabel: { fontFamily: Fonts.body, color: th.text, fontSize: Fonts.size.md },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, flex: 1, justifyContent: 'flex-end' },
  rowValue: { fontFamily: Fonts.body, color: th.textMuted, fontSize: Fonts.size.sm, flexShrink: 1, textAlign: 'right' },

  // segmented (choose-between) control
  segment: { flexDirection: 'row', borderWidth: 1, borderColor: th.borderStrong, borderRadius: Radius.sm, overflow: 'hidden' },
  segItem: { paddingVertical: 7, paddingHorizontal: 14, minWidth: 58, alignItems: 'center', justifyContent: 'center', backgroundColor: th.surface },
  segItemOn: { backgroundColor: th.goldSurface },
  segDivider: { borderLeftWidth: 1, borderLeftColor: th.borderStrong },
  segText: { fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.sm, color: th.textMuted },
  segTextOn: { color: th.goldContrast },

  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderColor: 'rgba(199,82,75,0.5)', borderRadius: Radius.sm, paddingVertical: 14,
    marginTop: Spacing.xl,
  },
  signOutText: { fontFamily: Fonts.bodySemibold, color: th.error, fontSize: Fonts.size.md },

  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: 'rgba(199,82,75,0.12)', borderWidth: 1, borderColor: 'rgba(199,82,75,0.4)',
    borderRadius: Radius.sm, paddingVertical: 14, minHeight: 50,
  },
  deleteBtnBusy: { opacity: 0.7 },
  deleteText: { fontFamily: Fonts.bodySemibold, color: th.error, fontSize: Fonts.size.md },
  deleteHint: { fontFamily: Fonts.body, color: th.textDim, fontSize: Fonts.size.xs, textAlign: 'center', marginTop: Spacing.sm },

  version: { fontFamily: Fonts.bodyMedium, color: th.textMuted, fontSize: Fonts.size.xs, textAlign: 'center', marginTop: Spacing.xl, letterSpacing: 0.5 },
  tagline: { fontFamily: Fonts.body, color: th.textDim, fontSize: Fonts.size.xs, textAlign: 'center', marginTop: 4 },
});
