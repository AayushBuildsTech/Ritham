// AppDialog — the themed, in-app dialog host. Mounted once at the app root; it
// renders every showAlert() call from lib/dialog in the app's magenta style
// instead of the native Android popup. Supports the same shapes as Alert.alert:
// an info dialog (implicit OK), confirm/cancel, destructive actions, and chained
// (nested) dialogs — a button's onPress may open another dialog.

import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal } from 'react-native';
import { Fonts, Spacing, Radius, Depth, ThemeColors } from '../constants/theme';
import { useColors } from '../context/ThemeContext';
import { registerDialogHost, DialogRequest, DialogButton } from '../lib/dialog';

export function AppDialog() {
  const th = useColors();
  const styles = makeStyles(th);
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  const current = queue[0] ?? null;

  useEffect(() => {
    registerDialogHost((req) => setQueue((q) => [...q, req]));
    return () => registerDialogHost(null);
  }, []);

  // Pop the current dialog, then run the tapped button's action. If that action
  // calls showAlert again it enqueues onto the popped queue, so the next dialog
  // shows without the sheet flickering closed.
  function close(btn?: DialogButton) {
    setQueue((q) => q.slice(1));
    btn?.onPress?.();
  }

  const buttons: DialogButton[] = current?.buttons?.length
    ? current.buttons
    : [{ text: 'OK', style: 'default' }];

  // Hardware back / tapping the scrim behaves like the cancel button if there is
  // one; otherwise it just dismisses (matches an info dialog's single OK).
  const onDismiss = () => close(buttons.find((b) => b.style === 'cancel'));
  const row = buttons.length === 2;

  return (
    <Modal visible={!!current} transparent animationType="fade" statusBarTranslucent onRequestClose={onDismiss}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onDismiss} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
        <View style={styles.card}>
          {current?.title ? <Text style={styles.title}>{current.title}</Text> : null}
          {current?.message ? <Text style={styles.message}>{current.message}</Text> : null}
          <View style={[styles.actions, row ? styles.actionsRow : styles.actionsCol]}>
            {buttons.map((b, i) => {
              const kind = b.style ?? 'default';
              return (
                <Pressable
                  key={`${b.text}-${i}`}
                  onPress={() => close(b)}
                  android_ripple={{ color: kind === 'cancel' ? th.goldFaint : 'rgba(255,255,255,0.15)' }}
                  accessibilityRole="button"
                  accessibilityLabel={b.text}
                  style={[
                    styles.btn,
                    row ? { flex: 1 } : undefined,
                    kind === 'default' && styles.btnDefault,
                    kind === 'destructive' && styles.btnDestructive,
                    kind === 'cancel' && styles.btnCancel,
                  ]}
                >
                  <Text style={[styles.btnText, kind === 'cancel' ? styles.btnTextCancel : styles.btnTextStrong]}>
                    {b.text}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (th: ThemeColors) => StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: th.scrimBackdrop },
  card: {
    width: '100%', maxWidth: 360,
    backgroundColor: th.surfaceRaised, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: th.borderStrong,
    padding: Spacing.lg, gap: Spacing.sm, ...Depth.raised,
  },
  title: { fontFamily: Fonts.displayBold, fontSize: Fonts.size.xl, color: th.text },
  message: { fontFamily: Fonts.body, fontSize: Fonts.size.md, color: th.textMuted, lineHeight: 22 },

  actions: { marginTop: Spacing.sm, gap: Spacing.sm },
  actionsRow: { flexDirection: 'row' },
  actionsCol: { flexDirection: 'column' },

  btn: {
    minHeight: 48, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: Spacing.lg, overflow: 'hidden',
  },
  btnDefault: { backgroundColor: th.goldSurface },
  btnDestructive: { backgroundColor: th.error },
  btnCancel: { backgroundColor: th.surface, borderWidth: 1, borderColor: th.border },

  btnText: { fontFamily: Fonts.bodyBold, fontSize: Fonts.size.md, letterSpacing: 0.2 },
  btnTextStrong: { color: '#FFFFFF' },
  btnTextCancel: { color: th.textMuted },
});
