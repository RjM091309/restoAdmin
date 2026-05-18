import type { Branch } from '../components/partials/Header';

/** Default sidebar logo when "All Branches" is selected */
export const DEFAULT_ALL_BRANCHES_LOGO = '/uploads/branches/GENERAL_ALL_BRANCHES.png';

export function resolveBranchLogoUrl(logoPath: string | null | undefined): string | null {
  if (!logoPath || !String(logoPath).trim()) return null;
  const path = String(logoPath).trim();
  if (path.startsWith('http')) return path;
  return path.startsWith('/') ? path : `/${path}`;
}

/** Sidebar header image for a specific branch; null for "all" (static icon in UI) */
export function resolveSidebarBranchLogo(branch: Branch | null | undefined): string | null {
  if (!branch || String(branch.id) === 'all') {
    return null;
  }
  return resolveBranchLogoUrl(branch.logo);
}
