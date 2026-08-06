import type { InventoryCategory } from '../services/inventoryService';

function normalizeCategoryLabel(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[,，、]/g, ' ')
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripLeadingNumber(value: string): string {
  return String(value || '')
    .trim()
    .replace(/^\d+\.?\s*/, '')
    .trim();
}

function hasLeadingNumber(value: string): boolean {
  return /^\d+\.?\s/.test(String(value || '').trim());
}

/** Collapse numbered/unnumbered + punctuation variants into one key. */
function canonicalCategoryKey(value: string): string {
  const parts = String(value || '')
    .split('/')
    .map((p) => stripLeadingNumber(p.trim()))
    .filter(Boolean);
  return normalizeCategoryLabel(parts.join(' / ') || stripLeadingNumber(value));
}

function englishTail(value: string): string {
  const parts = String(value || '')
    .split('/')
    .map((p) => stripLeadingNumber(p.trim()))
    .filter(Boolean);
  return normalizeCategoryLabel(parts[parts.length - 1] || value);
}

function tokenSet(value: string): Set<string> {
  return new Set(
    canonicalCategoryKey(value)
      .split(/[\s/]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 1),
  );
}

function categoryMatchScore(extracted: string, candidate: string): number {
  const aKey = canonicalCategoryKey(extracted);
  const bKey = canonicalCategoryKey(candidate);
  if (!aKey || !bKey) return 0;
  if (aKey === bKey) return 100;

  const a = normalizeCategoryLabel(extracted);
  const b = normalizeCategoryLabel(candidate);
  if (a && b && a === b) return 100;

  const engA = englishTail(extracted);
  const engB = englishTail(candidate);
  if (engA && engB && engA === engB) return 95;
  if (engA && engB && (engA.includes(engB) || engB.includes(engA))) return 85;

  if (a.includes(b) || b.includes(a) || aKey.includes(bKey) || bKey.includes(aKey)) return 80;

  const tokensA = tokenSet(extracted);
  const tokensB = tokenSet(candidate);
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let overlap = 0;
  tokensA.forEach((t) => {
    if (tokensB.has(t)) overlap += 1;
  });
  const ratio = overlap / Math.max(tokensA.size, tokensB.size);
  return Math.round(ratio * 70);
}

function labelOf(cat: InventoryCategory): string {
  return String(cat.categoryType || cat.name || '').trim();
}

function isOfficialLabel(label: string): boolean {
  return hasLeadingNumber(label);
}

/** Prefer numbered official labels over unnumbered scanner leftovers. */
function preferOfficialCategory(pool: InventoryCategory[]): InventoryCategory | undefined {
  if (pool.length === 0) return undefined;
  const numbered = pool.filter((cat) => isOfficialLabel(labelOf(cat)) || isOfficialLabel(cat.name || ''));
  return numbered[0] ?? pool[0];
}

/**
 * Unique subcategory labels for AI extraction / matching.
 * Collapses numbered + unnumbered duplicates onto the official numbered label when present.
 * Also collapses variants that share the same English tail (e.g. 기타경비 vs 간접비 / Indirect*).
 */
export function preferredSubCategoryLabels(categories: InventoryCategory[]): string[] {
  const byCanonical = new Map<string, string>();

  for (const cat of categories) {
    if (cat.active === false) continue;
    const label = labelOf(cat);
    if (!label) continue;
    const key = canonicalCategoryKey(label);
    if (!key) continue;
    const existing = byCanonical.get(key);
    if (!existing) {
      byCanonical.set(key, label);
      continue;
    }
    if (!isOfficialLabel(existing) && isOfficialLabel(label)) {
      byCanonical.set(key, label);
    }
  }

  const byEnglish = new Map<string, string>();
  for (const label of byCanonical.values()) {
    const eng = englishTail(label);
    const collapseKey = eng || canonicalCategoryKey(label);
    const existing = byEnglish.get(collapseKey);
    if (!existing) {
      byEnglish.set(collapseKey, label);
      continue;
    }
    if (!isOfficialLabel(existing) && isOfficialLabel(label)) {
      byEnglish.set(collapseKey, label);
    }
  }

  return Array.from(byEnglish.values()).sort((a, b) => {
    const numA = /^(\d+)\.?\s/.exec(a);
    const numB = /^(\d+)\.?\s/.exec(b);
    if (numA && numB) {
      const nA = parseInt(numA[1], 10);
      const nB = parseInt(numB[1], 10);
      if (nA !== nB) return nA - nB;
    }
    if (numA && !numB) return -1;
    if (!numA && numB) return 1;
    return a.localeCompare(b, undefined, { numeric: true });
  });
}

function pickMasterCategoryForSubCategory(
  categories: InventoryCategory[],
  subCategoryLabel: string,
  preferredOpCategoryId: string | null,
): InventoryCategory | undefined {
  const targetKey = canonicalCategoryKey(subCategoryLabel);
  const matches = categories.filter((cat) => {
    const typeKey = canonicalCategoryKey(cat.categoryType || '');
    const nameKey = canonicalCategoryKey(cat.name || '');
    return typeKey === targetKey || nameKey === targetKey;
  });
  if (matches.length === 0) return undefined;

  const preferredOpMatches = preferredOpCategoryId
    ? matches.filter((cat) => cat.opCategoryId === preferredOpCategoryId)
    : matches;
  const pool = preferredOpMatches.length > 0 ? preferredOpMatches : matches;

  return preferOfficialCategory(pool);
}

function findFallbackMasterCategory(
  categories: InventoryCategory[],
  preferredOpCategoryId: string | null,
): InventoryCategory | undefined {
  const othersPool = categories.filter(
    (cat) =>
      canonicalCategoryKey(cat.categoryType) === 'others' ||
      canonicalCategoryKey(cat.name) === 'others',
  );
  const others = preferOfficialCategory(othersPool);
  if (others) return others;

  if (preferredOpCategoryId) {
    const opMatches = categories.filter((cat) => cat.opCategoryId === preferredOpCategoryId);
    const opPick = preferOfficialCategory(opMatches);
    if (opPick) return opPick;
  }

  return preferOfficialCategory(categories) ?? categories[0];
}

/**
 * Map an extracted receipt category to an existing master category id.
 * Never creates new sub categories — only uses rows already in RestoAdmin.
 * Prefers numbered official rows when numbered + unnumbered duplicates exist.
 */
export function resolveExistingMasterCategoryId(
  categories: InventoryCategory[],
  extractedCategory: string,
  preferredOpCategoryId: string | null,
): string {
  const active = categories.filter((c) => c.active);
  if (!active.length) {
    throw new Error('No expense categories found for this branch. Add sub categories in Expenses first.');
  }

  const raw = String(extractedCategory || '').trim();

  if (raw) {
    const rawKey = canonicalCategoryKey(raw);
    const rawEng = englishTail(raw);

    // Strong matches: same canonical key OR same English tail (handles
    // "기타경비 / Indirect Expenses" vs "8. 간접비 / Indirect expenses").
    const strongMatches = active.filter((cat) => {
      const type = cat.categoryType || '';
      const name = cat.name || '';
      const typeKey = canonicalCategoryKey(type);
      const nameKey = canonicalCategoryKey(name);
      if (typeKey === rawKey || nameKey === rawKey) return true;
      if (!rawEng) return false;
      return englishTail(type) === rawEng || englishTail(name) === rawEng;
    });

    if (strongMatches.length > 0) {
      const preferredOpMatches = preferredOpCategoryId
        ? strongMatches.filter((cat) => cat.opCategoryId === preferredOpCategoryId)
        : strongMatches;
      const pool = preferredOpMatches.length > 0 ? preferredOpMatches : strongMatches;
      const picked = preferOfficialCategory(pool);
      if (picked) return picked.id;
    }

    let bestLabel = '';
    let bestScore = 0;
    for (const label of preferredSubCategoryLabels(active)) {
      const score = categoryMatchScore(raw, label);
      if (score > bestScore) {
        bestScore = score;
        bestLabel = label;
      }
    }

    if (bestScore >= 60 && bestLabel) {
      const matched = pickMasterCategoryForSubCategory(active, bestLabel, preferredOpCategoryId);
      if (matched) return matched.id;
    }
  }

  const fallback = findFallbackMasterCategory(active, preferredOpCategoryId);
  if (fallback) return fallback.id;

  throw new Error('No matching expense sub category found. Add sub categories in Expenses first.');
}
