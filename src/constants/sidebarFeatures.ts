/**
 * Sidebar feature keys used for branch permissions.
 * Must match server ALL_FEATURES in branchSidebarPermissionModel.js
 */
export const SIDEBAR_FEATURE_KEYS = [
  'dashboard',
  'expenses',
  'inventory',
  'menu_management',
  'sales_report',
  'sales_analytics',
  'menu',
  'category',
  'payment_type',
  'receipt',
  'orders',
  'billing',
  'ingredients',
  'table_settings',
] as const;

export type SidebarFeatureKey = (typeof SIDEBAR_FEATURE_KEYS)[number];

/** Display labels for User Access matrix (can use i18n keys later) */
export const SIDEBAR_FEATURE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  expenses: 'Expenses',
  inventory: 'Inventory',
  menu_management: 'Menu Management',
  sales_report: 'Sales Report',
  sales_analytics: 'Sales Analytics',
  menu: 'Menu (Report)',
  category: 'Category',
  payment_type: 'Payment type',
  receipt: 'Receipt',
  orders: 'Orders',
  billing: 'Billing',
  ingredients: 'Ingredients',
  table_settings: 'Table Settings',
};
