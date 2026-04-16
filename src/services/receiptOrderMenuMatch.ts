import type { MenuRecord } from './menuService';

function normalize(s: string): string {
    return s
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s/]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function nameVariants(extractedName: string): string[] {
    const t = extractedName.trim();
    if (!t) return [];
    const parts = t
        .split('/')
        .map((s) => s.trim())
        .filter(Boolean);
    return parts.length ? parts : [t];
}

function scoreMatch(extracted: string, menuName: string): number {
    const a = normalize(extracted);
    const b = normalize(menuName);
    if (!a || !b) return 0;
    if (a === b) return 1000;
    if (a.includes(b) || b.includes(a)) return 500;
    const wa = a.split(' ').filter((w) => w.length > 1);
    const wb = new Set(b.split(' ').filter((w) => w.length > 1));
    let overlap = 0;
    for (const w of wa) {
        if (wb.has(w)) overlap += 1;
    }
    return overlap * 100;
}

/** Pick best menu row for a receipt line; returns null if no decent match. */
export function bestMenuMatchForReceiptLine(extractedName: string, menus: MenuRecord[]): MenuRecord | null {
    const variants = nameVariants(extractedName);
    let best: MenuRecord | null = null;
    let bestScore = 0;
    for (const m of menus) {
        if (!m.active || !(m.effectiveAvailable ?? m.isAvailable)) continue;
        for (const part of variants) {
            const s = scoreMatch(part, m.name);
            if (s > bestScore) {
                bestScore = s;
                best = m;
            }
        }
    }
    return bestScore >= 50 ? best : null;
}
