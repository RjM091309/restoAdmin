/**
 * Per-branch action sub-toggles shown under a sidebar item in
 * Control Panel → Branches. Administrators are never bound by them.
 *
 * NOTE: keys must match FLAGS in server/models/branchFeatureFlagModel.js.
 */
export type BranchFeatureFlagKey = 'orders_update_encoded_dt' | 'orders_soft_delete';

export type BranchFeatureFlags = Partial<Record<BranchFeatureFlagKey, boolean>>;

export interface BranchFeatureFlagConfig {
  key: BranchFeatureFlagKey;
  /** Sidebar feature key the toggle sits under (only usable while that item is visible). */
  parent: string;
  label: string;
  description: string;
}

export const BRANCH_FEATURE_FLAGS: readonly BranchFeatureFlagConfig[] = [
  {
    key: 'orders_update_encoded_dt',
    parent: 'orders',
    label: 'Update encoded date',
    description: "Branch users can move an order to another date/time.",
  },
  {
    key: 'orders_soft_delete',
    parent: 'orders',
    label: 'Soft delete orders',
    description: 'Branch users can remove an order from lists and reports.',
  },
];
