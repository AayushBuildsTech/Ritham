import { useEffect, useMemo, useState } from 'react';
import {
  Modal, View, Text, TextInput, Pressable, FlatList, StyleSheet, ActivityIndicator,
} from 'react-native';
import { Colors, Fonts, Spacing, Radius, Scrim } from '../constants/theme';
import { Icon } from './Icon';

export interface Option {
  label: string;
  value: string;
  sublabel?: string;
  data?: unknown; // arbitrary payload (e.g. a geocoded place with coords/tz)
}

interface Props {
  visible: boolean;
  title: string;
  options: Option[];
  selectedValue?: string;
  searchable?: boolean;
  // When provided, typing runs this async search (debounced) instead of local
  // filtering. `options` are shown as defaults while the query is empty.
  remoteSearch?: (query: string) => Promise<Option[]>;
  onSelect: (value: string, option?: Option) => void;
  onClose: () => void;
}

// Themed bottom-sheet selector built from RN core only (no native picker module,
// so no rebuild). Supports local filtering or async remote search.
export function SelectModal({
  visible, title, options, selectedValue, searchable, remoteSearch, onSelect, onClose,
}: Props) {
  const [query, setQuery] = useState('');
  const [remote, setRemote] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  // debounced remote search
  useEffect(() => {
    if (!remoteSearch) return;
    const q = query.trim();
    if (q.length < 2) { setRemote([]); setLoading(false); setErr(''); return; }

    setLoading(true);
    setErr('');
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await remoteSearch(q);
        setRemote(r);
      } catch (e) {
        if (!ctrl.signal.aborted) setErr('Search failed — check your connection.');
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 350);

    return () => { clearTimeout(t); ctrl.abort(); };
  }, [query, remoteSearch]);

  const data = useMemo(() => {
    const q = query.trim();
    if (remoteSearch) return q.length >= 2 ? remote : options;
    if (!searchable || !q) return options;
    const lq = q.toLowerCase();
    return options.filter(
      (o) => o.label.toLowerCase().includes(lq) || o.sublabel?.toLowerCase().includes(lq),
    );
  }, [options, remote, query, searchable, remoteSearch]);

  const close = () => { setQuery(''); setRemote([]); setErr(''); onClose(); };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.title}>{title}</Text>

          {(searchable || remoteSearch) && (
            <View style={styles.searchWrap}>
              <TextInput
                style={styles.search}
                placeholder={remoteSearch ? 'Search any city, town or village…' : 'Search…'}
                placeholderTextColor={Colors.textDim}
                value={query}
                onChangeText={setQuery}
                autoFocus
                autoCorrect={false}
              />
              {loading && <ActivityIndicator style={styles.searchSpinner} color={Colors.gold} />}
            </View>
          )}

          {err ? <Text style={styles.err}>{err}</Text> : null}

          <FlatList
            data={data}
            keyExtractor={(item) => item.value}
            keyboardShouldPersistTaps="handled"
            style={styles.list}
            initialNumToRender={20}
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const active = item.value === selectedValue;
              return (
                <Pressable
                  style={styles.row}
                  onPress={() => { onSelect(item.value, item); close(); }}
                  android_ripple={{ color: Colors.goldFaint }}
                >
                  <View style={styles.rowTextWrap}>
                    <Text style={[styles.rowLabel, active && styles.rowLabelActive]}>{item.label}</Text>
                    {item.sublabel ? <Text style={styles.rowSub}>{item.sublabel}</Text> : null}
                  </View>
                  {active ? <Icon name="check" size={18} color={Colors.gold} /> : null}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              loading ? null : (
                <Text style={styles.empty}>
                  {remoteSearch && query.trim().length >= 2 ? 'No places found' : 'No matches'}
                </Text>
              )
            }
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: Scrim.backdrop, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Scrim.sheet,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
    maxHeight: '78%',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  handle: {
    width: 44, height: 4, borderRadius: 2, backgroundColor: Colors.gold, opacity: 0.5,
    alignSelf: 'center', marginBottom: Spacing.md,
  },
  title: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.xl, color: Colors.text, marginBottom: Spacing.md },
  searchWrap: { justifyContent: 'center' },
  search: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm,
    padding: Spacing.md, paddingRight: 40, color: Colors.text, backgroundColor: Colors.surfaceSunken,
    marginBottom: Spacing.sm, fontFamily: Fonts.body, fontSize: Fonts.size.md,
  },
  searchSpinner: { position: 'absolute', right: Spacing.md, top: Spacing.md },
  err: { fontFamily: Fonts.body, color: Colors.error, fontSize: Fonts.size.sm, marginBottom: Spacing.sm },
  list: { flexGrow: 0 },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  rowTextWrap: { flex: 1, paddingRight: Spacing.sm },
  rowLabel: { fontFamily: Fonts.body, fontSize: Fonts.size.md, color: Colors.text },
  rowLabelActive: { fontFamily: Fonts.bodySemibold, color: Colors.goldLight },
  rowSub: { fontFamily: Fonts.body, fontSize: Fonts.size.xs, color: Colors.textDim, marginTop: 2 },
  empty: { fontFamily: Fonts.body, color: Colors.textDim, textAlign: 'center', padding: Spacing.lg },
});
