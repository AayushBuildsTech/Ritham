// Stable, app-scoped device identifier — used to keep the free 1-minute chat
// scarce per physical device (anti-abuse), since Google accounts are cheap to
// create. The raw id never leaves the device unhashed: the chat Edge Function
// SHA-256s it before storing. Best-effort — returns null if unavailable, in which
// case the server falls back to the per-account guard only.

import * as Application from 'expo-application';
import { Platform } from 'react-native';

let cached: string | null | undefined;

export async function getDeviceId(): Promise<string | null> {
  if (cached !== undefined) return cached;
  try {
    if (Platform.OS === 'android') {
      cached = Application.getAndroidId(); // ANDROID_ID: stable per device + app signing key
    } else if (Platform.OS === 'ios') {
      cached = await Application.getIosIdForVendorAsync(); // identifierForVendor
    } else {
      cached = null;
    }
  } catch {
    cached = null;
  }
  return cached;
}
