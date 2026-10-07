/**
 * Per-branch "business day" cutoff (Manila hour a business day starts).
 *
 * Blue Moon (branch 3) trades 3PM -> 6AM, so a shift crosses midnight and an
 * order taken at 12:30AM would otherwise be reported under the *next* calendar
 * date. With `3: 7` the business day of 2026-10-06 runs 2026-10-06 07:00 ->
 * 2026-10-07 06:59:59 (PH). Stored timestamps are never altered — only how
 * rows are bucketed into days. Every other branch keeps the calendar day.
 *
 * Keep in sync with server/utils/businessDay.js and pyserver/business_day.py.
 *
 * Pure data + lookup only (no imports) so manilaDateTime.ts can depend on it;
 * the date helpers that need Manila formatting live in manilaDateTime.ts
 * (getBusinessTodayYmd, getBusinessYmdFromEncoded).
 */
export const BUSINESS_DAY_START_HOURS: Readonly<Record<number, number>> = { 3: 7 };

export const HOUR_MS = 60 * 60 * 1000;

/** Hour the business day starts for a branch; 0 (plain calendar day) for everyone else, incl. 'all'. */
export function businessDayStartHour(branchId: string | number | null | undefined): number {
  if (branchId == null || branchId === '' || branchId === 'all') return 0;
  const hour = BUSINESS_DAY_START_HOURS[Number(branchId)];
  return Number.isInteger(hour) ? hour : 0;
}
