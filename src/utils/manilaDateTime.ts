/** Asia/Manila helpers for ENCODED_DT parsing, display, and date-range filtering. */

export const MANILA_TIMEZONE = 'Asia/Manila';
const MANILA_UTC_OFFSET_HOURS = 8;

export function parseManilaLocalDateTimeToUtcMs(value: string): number | null {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(\.\d+)?$/);
    if (!m) return null;

    const year = Number(m[1]);
    const monthIndex = Number(m[2]) - 1;
    const day = Number(m[3]);
    const hour = Number(m[4]);
    const minute = Number(m[5]);
    const second = Number(m[6]);
    const ms = m[7] ? Number(m[7].slice(1).padEnd(3, '0').slice(0, 3)) : 0;

    return Date.UTC(
        year,
        monthIndex,
        day,
        hour - MANILA_UTC_OFFSET_HOURS,
        minute,
        second,
        ms,
    );
}

export function parseEncodedDtToUtcMs(encoded: string): number | null {
    if (!encoded) return null;

    if (/[zZ]$/.test(encoded) || /[+-]\d{2}:?\d{2}$/.test(encoded)) {
        const d = new Date(encoded);
        return Number.isNaN(d.getTime()) ? null : d.getTime();
    }

    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(encoded)) {
        const manilaMs = parseManilaLocalDateTimeToUtcMs(encoded);
        if (manilaMs != null) return manilaMs;
    }

    const d = new Date(encoded.replace(' ', 'T'));
    return Number.isNaN(d.getTime()) ? null : d.getTime();
}

export function formatUtcMsToManilaYmd(utcMs: number): string {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: MANILA_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(new Date(utcMs));
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
    return `${get('year')}-${get('month')}-${get('day')}`;
}

export function getManilaYmdFromEncoded(encoded: string): string | null {
    const utcMs = parseEncodedDtToUtcMs(encoded);
    if (utcMs == null) return null;
    return formatUtcMsToManilaYmd(utcMs);
}

export function formatEncodedDt(encoded: string | null | undefined): string {
    if (!encoded) return '—';
    const utcMs = parseEncodedDtToUtcMs(encoded);
    if (utcMs == null) return '—';

    return new Intl.DateTimeFormat(undefined, {
        timeZone: MANILA_TIMEZONE,
        dateStyle: 'short',
        timeStyle: 'short',
    }).format(new Date(utcMs));
}

export function isEncodedDtWithinDateRange(
    encoded: string | null | undefined,
    dateRange: { start: string; end: string },
): boolean {
    if (!encoded) return true;
    if (!dateRange.start || !dateRange.end) return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRange.start) || !/^\d{4}-\d{2}-\d{2}$/.test(dateRange.end)) {
        return true;
    }

    const manilaYmd = getManilaYmdFromEncoded(encoded);
    if (manilaYmd == null) return true;
    return manilaYmd >= dateRange.start && manilaYmd <= dateRange.end;
}
