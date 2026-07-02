import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator,
} from 'react-native';
import { Colors, Fonts, Spacing } from '../constants/theme';

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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={close}>
        <TouchableOpacity style={styles.sheet} activeOpacity={1}>
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
            renderItem={({ item }) => {
              const active = item.value === selectedValue;
              return (
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => { onSelect(item.value, item); close(); }}
                >
                  <View style={styles.rowTextWrap}>
                    <Text style={[styles.rowLabel, active && styles.rowLabelActive]}>{item.label}</Text>
                    {item.sublabel ? <Text style={styles.rowSub}>{item.sublabel}</Text> : null}
                  </View>
                  {active ? <Text style={styles.check}>✓</Text> : null}
                </TouchableOpacity>
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
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.bgCard,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
    maxHeight: '75%',
    borderTopWidth: 1,
    borderColor: Colors.border,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border,
    alignSelf: 'center', marginBottom: Spacing.md,
  },
  title: { fontSize: Fonts.size.lg, color: Colors.text, fontWeight: '700', marginBottom: Spacing.md },
  searchWrap: { justifyContent: 'center' },
  search: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
    padding: Spacing.sm, paddingRight: 40, color: Colors.text, backgroundColor: Colors.bgMid,
    marginBottom: Spacing.sm, fontSize: Fonts.size.md,
  },
  searchSpinner: { position: 'absolute', right: Spacing.sm, top: Spacing.sm },
  err: { color: Colors.error, fontSize: Fonts.size.sm, marginBottom: Spacing.sm },
  list: { flexGrow: 0 },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  rowTextWrap: { flex: 1, paddingRight: Spacing.sm },
  rowLabel: { fontSize: Fonts.size.md, color: Colors.text },
  rowLabelActive: { color: Colors.goldLight, fontWeight: '700' },
  rowSub: { fontSize: Fonts.size.xs, color: Colors.textDim, marginTop: 2 },
  check: { color: Colors.gold, fontSize: Fonts.size.lg },
  empty: { color: Colors.textDim, textAlign: 'center', padding: Spacing.lg },
});
