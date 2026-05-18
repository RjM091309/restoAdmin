import type { Branch } from '../components/partials/Header';

export function navigateToBranch(branch: Branch, opts?: { newTab?: boolean }) {
  const url = new URL(window.location.href);
  url.searchParams.set('branchId', String(branch.id));
  url.searchParams.set('branchName', branch.name);
  try {
    localStorage.setItem('lastSelectedBranchId', String(branch.id));
    localStorage.setItem('lastSelectedBranchName', String(branch.name || ''));
  } catch {
    // ignore storage failures (private mode, quota, etc.)
  }
  if (opts?.newTab) {
    window.open(url.toString(), '_blank', 'noopener,noreferrer');
  } else {
    window.history.pushState({}, '', url.toString());
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
}
