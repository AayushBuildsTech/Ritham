// Central control of the native Google Sign-In session on the device.
//
// signInWithIdToken only creates the Supabase session — the Google client keeps
// its own cached account. So on sign-out we must clear that cache (otherwise the
// next sign-in silently reuses the same account instead of showing the picker),
// and on account DELETE we must fully revoke the grant (so no Google connection
// to Ritham lingers and the consent + picker are shown fresh next time).

import { GoogleSignin } from '@react-native-google-signin/google-signin';

const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';

export function configureGoogle() {
  GoogleSignin.configure({ webClientId: WEB_CLIENT_ID });
}

// Clear the locally cached Google account → the account picker shows next time.
export async function googleSignOut() {
  try {
    configureGoogle();
    await GoogleSignin.signOut();
  } catch {
    /* not signed in / already cleared — safe to ignore */
  }
}

// Revoke Ritham's access grant entirely (removes it from the user's Google
// "connected apps" and clears local state). Used on account deletion.
export async function googleRevoke() {
  try {
    configureGoogle();
    await GoogleSignin.revokeAccess();
  } catch {
    /* nothing to revoke — safe to ignore */
  }
}
