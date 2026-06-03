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

function englishTail(value: string): string {
  const parts = String(value || '')
    .split('/')
    .map((p) => stripLeadingNumber(p.trim()))
    .filter(Boolean);
  return normalizeCategoryLabel(parts[parts.length - 1] || value);
}

function tokenSet(value: string): Set<string> {
  return new Set(
    normalizeCategoryLabel(value)
      .split(/[\s/]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 1),
  );
}

function categoryMatchScore(extracted: string, candidate: string): number {
  const a = normalizeCategoryLabel(extracted);
  const b = normalizeCategoryLabel(candidate);
  if (!a || !b) return 0;
  if (a === b) return 100;

  const engA = englishTail(extracted);
  const engB = englishTail(candidate);
  if (engA && engB && engA === engB) return 95;
  if (engA && engB && (engA.includes(engB) || engB.includes(engA))) return 85;

  if (a.includes(b) || b.includes(a)) return 80;

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

function uniqueSubCategoryLabels(categories: InventoryCategory[]): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const cat of categories) {
    const label = String(cat.categoryType || cat.name || '').trim();
    if (!label) continue;
    const key = normalizeCategoryLabel(label);
    if (seen.has(key)) continue;
    seen.add(key);
    labels.push(label);
  }
  return labels;
}

function pickMasterCategoryForSubCategory(
  categories: InventoryCategory[],
  subCategoryLabel: string,
  preferredOpCategoryId: string | null,
): InventoryCategory | undefined {
  const normalized = normalizeCategoryLabel(subCategoryLabel);
  const matches = categories.filter((cat) => {
    const type = normalizeCategoryLabel(cat.categoryType || '');
    const name = normalizeCategoryLabel(cat.name || '');
    return type === normalized || name === normalized;
  });
  if (matches.length === 0) return undefined;

  const preferredOpMatches = preferredOpCategoryId
    ? matches.filter((cat) => cat.opCategoryId === preferredOpCategoryId)
    : matches;
  const pool = preferredOpMatches.length > 0 ? preferredOpMatches : matches;

  const subRow = pool.find(
    (cat) =>
      normalizeCategoryLabel(cat.name || '') === normalized ||
      normalizeCategoryLabel(cat.categoryType || '') === normalized,
  );
  return subRow ?? pool[0];
}

function findFallbackMasterCategory(
  categories: InventoryCategory[],
  preferredOpCategoryId: string | null,
): InventoryCategory | undefined {
  const others = categories.find(
    (cat) =>
      normalizeCategoryLabel(cat.categoryType) === 'others' ||
      normalizeCategoryLabel(cat.name) === 'others',
  );
  if (others) return others;

  if (preferredOpCategoryId) {
    const opMatch = categories.find((cat) => cat.opCategoryId === preferredOpCategoryId);
    if (opMatch) return opMatch;
  }

  return categories[0];
}

/**
 * Map an extracted receipt category to an existing master category id.
 * Never creates new sub categories — only uses rows already in RestoAdmin.
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
    const exact = active.find((cat) => {
      const type = String(cat.categoryType || '').trim();
      const name = String(cat.name || '').trim();
      return (
        type === raw ||
        name === raw ||
        normalizeCategoryLabel(type) === normalizeCategoryLabel(raw) ||
        normalizeCategoryLabel(name) === normalizeCategoryLabel(raw)
      );
    });
    if (exact) return exact.id;

    let bestLabel = '';
    let bestScore = 0;
    for (const label of uniqueSubCategoryLabels(active)) {
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
