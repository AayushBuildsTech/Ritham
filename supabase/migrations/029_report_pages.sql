-- Reports v2 (Master Prompt): interactive 9-page reports are stored as structured
-- JSON content (lib/reportSchema.ts → ReportContent), rendered client-side by
-- lib/reportRenderer.ts inside a WebView. The legacy `html` column stays for
-- backward compatibility (older reports keep rendering); new reports populate
-- `pages`. report-view prefers `pages` when present, else falls back to `html`.

alter table public.reports
  add column if not exists pages jsonb;

comment on column public.reports.pages is
  'Structured 9-page report content (ReportContent JSON). Rendered natively client-side; supersedes the html blob for v2 reports.';
