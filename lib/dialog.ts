// dialog — a themed, in-app replacement for React Native's native Alert.alert.
//
// Native Alert renders the OS dialog, which ignores the app's magenta theme and
// looks like a stray Android popup. showAlert() has the SAME signature as
// Alert.alert(title, message?, buttons?), so it's a drop-in swap, but it renders
// through <AppDialog /> (mounted once at the app root) in the app's own style.

import { Alert } from 'react-native';

export type DialogButtonStyle = 'default' | 'cancel' | 'destructive';

export interface DialogButton {
  text: string;
  style?: DialogButtonStyle;
  onPress?: () => void;
}

export interface DialogRequest {
  title: string;
  message?: string;
  buttons?: DialogButton[];
}

type Host = (req: DialogRequest) => void;
let host: Host | null = null;

// <AppDialog /> registers itself here on mount (and clears it on unmount).
export function registerDialogHost(h: Host | null): void {
  host = h;
}

// Drop-in themed replacement for Alert.alert(). Falls back to the native Alert
// only if the host isn't mounted yet (shouldn't happen once the root renders).
export function showAlert(title: string, message?: string, buttons?: DialogButton[]): void {
  if (host) host({ title, message, buttons });
  else Alert.alert(title, message, buttons);
}
