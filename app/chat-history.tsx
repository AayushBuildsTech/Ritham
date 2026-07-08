import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { listChatHistory, deleteChatSessions, ChatHistoryItem } from '../lib/chatService';
import { useActiveProfile } from '../context/ProfileContext';
import { track } from '../lib/analytics';
import { Fonts, Spacing, Radius, Depth, Accents, ThemeColors } from '../constants/theme';
import { useColors } from '../context/ThemeContext';
import { Icon } from '../components/Icon';
import { Reveal } from '../components/Reveal';
import { ScreenHeader } from '../components/ScreenHeader';

// A past chat's start time, e.g. "8 Jul 2026 · 3:42 PM".
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  let h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} · ${h}:${min} ${ampm}`;
}

export default function ChatHistoryScreen() {
  const th = useColors();
  const styles = makeStyles(th);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { members } = useActiveProfile();
  const showWho = members.length > 1; // only surface the profile when there's a family

  const [items, setItems] = useState<ChatHistoryItem[] | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setItems(await listChatHistory());
  }, []);

  useEffect(() => { track('chat_history_opened'); load(); }, [load]);

  function exitSelect() { setSelecting(false); setSelected(new Set()); }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function onPressCard(item: ChatHistoryItem) {
    if (selecting) { toggle(item.id); return; }
    track('chat_history_session_opened');
    router.push({ pathname: '/chat-conversation', params: { id: item.id, name: item.profileName } });
  }

  function allSelected() {
    return !!items && items.length > 0 && selected.size === items.length;
  }
  function toggleAll() {
    if (!items) return;
    setSelected(allSelected() ? new Set() : new Set(items.map((i) => i.id)));
  }

  function confirmDelete() {
    const n = selected.size;
    if (!n) return;
    Alert.alert(
      `Delete ${n} chat${n > 1 ? 's' : ''}?`,
      'This permanently removes the selected conversation' + (n > 1 ? 's' : '') + ' and cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: runDelete },
      ],
    );
  }

  async function runDelete() {
    const ids = Array.from(selected);
    if (!ids.length) return;
    setDeleting(true);
    const { error } = await deleteChatSessions(ids);
    setDeleting(false);
    if (error) { Alert.alert('Could not delete', error); return; }
    track('chat_history_deleted', { count: ids.length });
    const removed = new Set(ids);
    setItems((prev) => (prev ? prev.filter((i) => !removed.has(i.id)) : prev));
    exitSelect();
  }

  const hasItems = !!items && items.length > 0;

  const headerRight = hasItems ? (
    <Pressable onPress={() => (selecting ? exitSelect() : setSelecting(true))} hitSlop={8} disabled={deleting}>
      <Text style={styles.headerAction}>{selecting ? 'Cancel' : 'Select'}</Text>
    </Pressable>
  ) : undefined;

  return (
    <View style={styles.root}>
      <ScreenHeader title="Chat History" onBack={() => router.back()} right={headerRight} />

      {items === null ? (
        <View style={styles.center}><ActivityIndicator color={th.gold} size="large" /></View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <View style={styles.emptyIcon}><Icon name="history" size={30} color={th.gold} /></View>
          <Text style={styles.emptyTitle}>No past conversations yet</Text>
          <Text style={styles.emptySub}>
            Your chats with the astrologer will appear here so you can revisit them anytime.
          </Text>
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={[
              styles.content,
              { paddingBottom: (selecting ? 96 : Spacing.xl) + insets.bottom },
            ]}
            showsVerticalScrollIndicator={false}
          >
            <Reveal index={0}>
              <View style={styles.subHeader}>
                <Text style={styles.eyebrow}>
                  {selecting ? `${selected.size} SELECTED` : 'YOUR PAST READINGS'}
                </Text>
                {selecting && (
                  <Pressable onPress={toggleAll} hitSlop={8}>
                    <Text style={styles.selectAll}>{allSelected() ? 'Clear all' : 'Select all'}</Text>
                  </Pressable>
                )}
              </View>
            </Reveal>

            {items.map((item, i) => {
              const isSel = selected.has(item.id);
              return (
                <Reveal key={item.id} index={i + 1}>
                  <Pressable
                    style={[styles.card, selecting && isSel && styles.cardSelected]}
                    onPress={() => onPressCard(item)}
                    onLongPress={() => { if (!selecting) { setSelecting(true); toggle(item.id); } }}
                    android_ripple={{ color: th.goldFaint }}
                  >
                    {selecting ? (
                      <View style={[styles.checkbox, isSel && styles.checkboxOn]}>
                        {isSel && <Icon name="check" size={15} color={th.goldContrast} />}
                      </View>
                    ) : (
                      <View style={styles.iconWrap}>
                        <Icon name="chat" size={20} color={th.gold} />
                      </View>
                    )}
                    <View style={styles.cardBody}>
                      <Text style={styles.preview} numberOfLines={2}>{item.preview}</Text>
                      <Text style={styles.meta} numberOfLines={1}>
                        {formatWhen(item.startedAt)}
                        {showWho && item.profileName ? ` · ${item.profileName}` : ''}
                      </Text>
                    </View>
                    {!selecting && <Icon name="chevron" size={20} color={th.textDim} />}
                  </Pressable>
                </Reveal>
              );
            })}
          </ScrollView>

          {selecting && (
            <View style={[styles.actionBar, { paddingBottom: insets.bottom + Spacing.sm }]}>
              <Pressable
                style={[styles.deleteBtn, selected.size === 0 && styles.deleteBtnDisabled]}
                onPress={confirmDelete}
                disabled={selected.size === 0 || deleting}
                android_ripple={{ color: th.error }}
              >
                {deleting ? (
                  <ActivityIndicator color={th.error} />
                ) : (
                  <>
                    <Icon name="trash" size={17} color={selected.size === 0 ? th.textDim : th.error} />
                    <Text style={[styles.deleteText, selected.size === 0 && styles.deleteTextDisabled]}>
                      Delete{selected.size > 0 ? ` (${selected.size})` : ''}
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const makeStyles = (th: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: th.canvas },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  content: { padding: Spacing.lg },

  headerAction: { fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.md, color: th.goldLight, letterSpacing: 0.3 },

  subHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
  eyebrow: { fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.xs, color: th.gold, letterSpacing: 2.5 },
  selectAll: { fontFamily: Fonts.bodySemibold, fontSize: Fonts.size.sm, color: th.goldLight },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: th.surface, borderRadius: Radius.md, padding: Spacing.md,
    borderWidth: 1, borderColor: th.border, marginBottom: Spacing.sm, ...Depth.card,
  },
  cardSelected: { borderColor: th.borderStrong, backgroundColor: th.goldFaint },
  iconWrap: {
    width: 44, height: 44, borderRadius: Radius.pill, backgroundColor: th.goldFaint,
    borderWidth: 1, borderColor: th.border, alignItems: 'center', justifyContent: 'center',
  },
  checkbox: {
    width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: th.borderStrong,
    alignItems: 'center', justifyContent: 'center', marginLeft: 4, marginRight: 4,
  },
  checkboxOn: { backgroundColor: th.goldSurface, borderColor: th.goldSurface },
  cardBody: { flex: 1 },
  preview: { fontFamily: Fonts.bodyMedium, fontSize: Fonts.size.md, color: th.text, lineHeight: 21 },
  meta: { fontFamily: Fonts.body, fontSize: Fonts.size.xs, color: th.textDim, marginTop: 4 },

  actionBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm,
    backgroundColor: th.canvas, borderTopWidth: 1, borderTopColor: th.border,
  },
  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: Radius.sm,
    borderWidth: 1, borderColor: th.error, backgroundColor: Accents.ruby.faint,
  },
  deleteBtnDisabled: { borderColor: th.border, backgroundColor: th.surface },
  deleteText: { fontFamily: Fonts.bodySemibold, color: th.error, fontSize: Fonts.size.md, letterSpacing: 0.3 },
  deleteTextDisabled: { color: th.textDim },

  emptyIcon: {
    width: 72, height: 72, borderRadius: Radius.pill, marginBottom: Spacing.lg,
    backgroundColor: th.goldFaint, borderWidth: 1, borderColor: th.border,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.xl, color: th.text, textAlign: 'center', marginBottom: Spacing.sm },
  emptySub: { fontFamily: Fonts.body, fontSize: Fonts.size.sm, color: th.textMuted, textAlign: 'center', lineHeight: 21 },
});
