// reportService — client helpers for Phase 7 paid reports.
//
// Flow (Vastu): buy (paymentService, kind 'report') → this uploads the floor plan
// to Storage and calls the `report` Edge Function to generate + cache the branded
// HTML. The function holds the Claude key and enforces the paid entitlement.
//
// Slug note: if the dashboard renames the deployed function, update REPORT_FUNCTION.

import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';

const REPORT_FUNCTION = 'report';

export type ReportType = 'vastu' | 'matchmaking';

export interface ReportRow {
  id: string;
  type: ReportType;
  status: 'draft' | 'generating' | 'ready' | 'failed';
  html: string | null;
  score: number | null;
  created_at: string;
}

export interface GenerateResult {
  report_id?: string;
  status?: string;
  score?: number;
  error?: string; // 'needs_purchase' | 'generation_failed' | ...
}

// Upload a picked floor-plan image (base64 from expo-image-picker) into the user's
// own Storage folder. Returns the storage path to hand to the generate function.
export async function uploadFloorplan(
  userId: string,
  base64: string,
  mimeType = 'image/jpeg',
): Promise<{ path?: string; error?: string }> {
  const ext = mimeType.includes('png') ? 'png' : 'jpg';
  const path = `${userId}/vastu-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from('reports')
    .upload(path, decode(base64), { contentType: mimeType, upsert: true });
  if (error) return { error: error.message };
  return { path };
}

// Generate the Vastu report (requires a paid, unconsumed 'report' entitlement).
export async function generateVastu(
  answers: Record<string, string>,
  floorplanPath: string,
): Promise<GenerateResult> {
  const { data, error } = await supabase.functions.invoke<GenerateResult>(REPORT_FUNCTION, {
    body: { type: 'vastu', answers, floorplanPath },
  });
  if (error) return { error: data?.error ?? error.message ?? 'request_failed' };
  return data ?? { error: 'request_failed' };
}

export type ChartStyle = 'north' | 'south';

// One person in a matchmaking pair. Birth details + the chart facts computed by
// kundliService (rule #1) — the Edge Function narrates from these, never recomputes.
export interface MatchPerson {
  name: string;
  gender: 'male' | 'female' | 'other';
  dob: string;         // YYYY-MM-DD
  tob: string;         // HH:MM:SS
  birth_place: string;
  lagna: string;
  moon_sign: string;
  sun_sign: string;
  nakshatra: string;
  placements: { graha: string; sign: string; house: number }[];
}

// Generate the Matchmaking report (requires a paid, unconsumed 'report' entitlement
// with plan_id 'matchmaking'). `self` comes from the user's own cached Kundli;
// `partner` is computed on the fly via kundliService.computeKundli.
export async function generateMatchmaking(
  self: MatchPerson,
  partner: MatchPerson,
  chartStyle: ChartStyle,
): Promise<GenerateResult> {
  const { data, error } = await supabase.functions.invoke<GenerateResult>(REPORT_FUNCTION, {
    body: { type: 'matchmaking', self, partner, chartStyle },
  });
  if (error) return { error: data?.error ?? error.message ?? 'request_failed' };
  return data ?? { error: 'request_failed' };
}

// The user's finished reports (most recent first).
export async function listReports(): Promise<ReportRow[]> {
  const { data } = await supabase
    .from('reports')
    .select('id, type, status, html, score, created_at')
    .order('created_at', { ascending: false });
  return (data as ReportRow[]) ?? [];
}

export async function getReport(id: string): Promise<ReportRow | null> {
  const { data } = await supabase
    .from('reports')
    .select('id, type, status, html, score, created_at')
    .eq('id', id).maybeSingle();
  return (data as ReportRow) ?? null;
}

// Count of unconsumed paid report credits for a type (a purchased-but-not-yet-
// generated report). Lets the UI show "Create your report" vs "Buy".
export async function reportCredits(type: ReportType): Promise<number> {
  const { data } = await supabase
    .from('entitlements_ledger')
    .select('id')
    .eq('kind', 'report').eq('plan_id', type).is('consumed_at', null);
  return (data ?? []).length;
}
