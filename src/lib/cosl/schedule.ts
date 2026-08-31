/**
 * Business-hours gate for the COSL collector.
 *
 * The auctions are run by the Arkansas Commissioner of State Lands, so the
 * "business hours" window is Central Time. The external scheduler (Supabase
 * pg_cron) fires every hour in UTC; this check — with correct DST via the
 * IANA zone — is what actually confines the work to 08:00–17:00 local, every
 * day. Runs outside the window return without touching the database.
 */

export const ARKANSAS_TZ = "America/Chicago";
export const BUSINESS_START_HOUR = 8; // inclusive
export const BUSINESS_END_HOUR = 17; // inclusive (last run at 17:00 local)

export function arkansasHour(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ARKANSAS_TZ,
    hourCycle: "h23",
    hour: "2-digit",
  }).formatToParts(now);
  return Number(parts.find((p) => p.type === "hour")?.value ?? "-1");
}

export function isWithinArkansasBusinessHours(now: Date = new Date()): boolean {
  const hour = arkansasHour(now);
  return hour >= BUSINESS_START_HOUR && hour <= BUSINESS_END_HOUR;
}
