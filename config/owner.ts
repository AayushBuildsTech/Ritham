// Accounts allowed to open the in-app Owner Admin (view bookings, set the slot).
// This client list only HIDES the screen from everyone else — the real
// enforcement is server-side (the OWNER_EMAILS secret on the puja-admin Edge
// Function). Add more emails here (and to that secret) to grant access.
export const OWNER_EMAILS = [
  'aayush.kumarsep1984@gmail.com',
  'pooja.singh72@gmail.com',
  'santosh.singh077@gmail.com',
];

export function isOwner(email?: string | null): boolean {
  return !!email && OWNER_EMAILS.includes(email.trim().toLowerCase());
}
