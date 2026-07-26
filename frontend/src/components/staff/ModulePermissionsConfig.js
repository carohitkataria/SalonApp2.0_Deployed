/**
 * ModulePermissionsConfig.js
 * ---------------------------------------------------------------
 * Definition of every module + its granular actions, used by the
 * Manage Staff Access → per-module drawer to render checkboxes and
 * to serialise/deserialise the JSON stored on
 *   salon_users.permissions.modules
 *
 * Shape stored in DB (example for a staff user):
 *   {
 *     "staff":          {"view": true, "view_all": false, "attendance": true, ...},
 *     "financials":     {"view_dashboard": true, ...},
 *     ...
 *   }
 *
 * Keep this schema in sync with `_MODULE_LEGACY_MAP` in backend/server.py.
 */

export const MODULES = [
  {
    key: 'staff',
    label: 'Staff Management',
    description: 'Barbers, attendance, salary, incentives, documents & access',
    color: '#C6389E', // pink (from staff design)
    actions: [
      { key: 'view',           label: 'View staff list',                  hint: 'Required to see the Staff Management section at all.' },
      { key: 'view_all',       label: 'View ALL staff (not only self)',   hint: 'When off, the user only sees their own linked profile.' },
      { key: 'create',         label: 'Add new staff',                    hint: 'Create new barbers / staff members.' },
      { key: 'edit',           label: 'Edit staff details',               hint: 'Update name, designation, compensation, etc.' },
      { key: 'delete',         label: 'Delete staff',                     hint: 'Hard-delete a staff member and their operational data.' },
      { key: 'attendance',     label: 'Mark / edit attendance',           hint: 'Check-in / check-out others, override attendance in calendar.' },
      { key: 'salary_view',    label: 'View salary & incentives',         hint: 'See computed salary + incentive payouts.' },
      { key: 'salary_pay',     label: 'Approve & pay salary / incentives',hint: 'Mark salary paid, change payout status, create financial txn.' },
      { key: 'documents',      label: 'Manage staff documents',           hint: 'Upload / delete Aadhaar, agreement, bank details.' },
      { key: 'access_control', label: 'Manage roles & access',            hint: 'Configure reward plans and grant module permissions.' },
    ],
  },
  {
    key: 'financials',
    label: 'Financials',
    description: 'Cash in / out dashboard and manual transactions',
    color: '#2FA96A',
    actions: [
      { key: 'view_dashboard',     label: 'View financial dashboard' },
      { key: 'view_transactions',  label: 'View transactions list' },
      { key: 'create_transaction', label: 'Add manual transaction' },
      { key: 'edit_transaction',   label: 'Edit financial settings (opening balance)' },
      { key: 'delete_transaction', label: 'Delete manual transaction' },
    ],
  },
  {
    key: 'analytics',
    label: 'Analytics',
    description: 'Day / staff / service wise sales, reports',
    color: '#3E93E8',
    actions: [
      { key: 'view', label: 'View analytics reports' },
    ],
  },
  {
    key: 'services',
    label: 'Services & Offerings',
    description: 'Salon service catalogue, packages, memberships',
    color: '#A67C1A',
    actions: [
      { key: 'view',                label: 'View services & offerings' },
      { key: 'create',              label: 'Add new service' },
      { key: 'edit',                label: 'Edit services' },
      { key: 'delete',              label: 'Delete services (bulk)' },
      { key: 'toggle',              label: 'Enable / disable services for salon' },
      { key: 'upload_csv',          label: 'Bulk upload via CSV' },
      { key: 'manage_categories',   label: 'Manage categories' },
      { key: 'manage_packages',     label: 'Manage packages' },
      { key: 'manage_memberships',  label: 'Manage membership plans' },
    ],
  },
  {
    key: 'gallery',
    label: 'Gallery',
    description: 'Salon photo gallery',
    color: '#8A5CD1',
    actions: [
      { key: 'view',   label: 'View gallery' },
      { key: 'upload', label: 'Upload photos' },
      { key: 'delete', label: 'Delete photos' },
    ],
  },
  {
    key: 'marketing',
    label: 'Marketing',
    description: 'Campaigns, coupons, loyalty program',
    color: '#E8952B',
    actions: [
      { key: 'view',              label: 'View marketing' },
      { key: 'create_campaign',   label: 'Create campaigns' },
      { key: 'edit_campaign',     label: 'Edit campaigns' },
      { key: 'delete_campaign',   label: 'Delete campaigns' },
      { key: 'manage_coupons',    label: 'Manage coupons / discount codes' },
      { key: 'manage_loyalty',    label: 'Manage loyalty program' },
    ],
  },
  {
    key: 'salon_settings',
    label: 'Salon Settings',
    description: 'Profile, hours, branches, notifications, subscription',
    color: '#12A594',
    actions: [
      { key: 'view',                label: 'View settings' },
      { key: 'edit_profile',        label: 'Edit salon profile' },
      { key: 'edit_hours',          label: 'Edit operational hours' },
      { key: 'edit_notifications',  label: 'Edit notification preferences' },
      { key: 'edit_branches',       label: 'Manage branches' },
      { key: 'manage_users',        label: 'Manage staff access (user accounts)' },
      { key: 'manage_subscription', label: 'Manage subscription / billing' },
    ],
  },
  {
    key: 'delete_salon',
    label: 'Delete Salon',
    description: 'Permanently delete the salon (dangerous!)',
    color: '#E5484D',
    actions: [
      { key: 'allowed', label: 'Allow salon deletion' },
    ],
  },
];

/**
 * Given a permissions object as stored on the user record, return a summary
 * for the module (all / partial / none) so the Access card can show a pill.
 */
export function summariseModule(perms, moduleKey) {
  const mod = MODULES.find(m => m.key === moduleKey);
  if (!mod) return 'None';
  const modulePerms = (perms?.modules && perms.modules[moduleKey]) || {};
  const total = mod.actions.length;
  const enabled = mod.actions.filter(a => modulePerms[a.key]).length;
  if (enabled === 0) return 'None';
  if (enabled === total) return 'Full';
  return `${enabled}/${total}`;
}

/**
 * Convert legacy flat can_access_* keys into the new modules[] shape, so an
 * existing salon_user opened in the editor renders sensible defaults.
 */
export function hydrateModulesFromLegacy(perms) {
  if (!perms) return {};
  if (perms.modules && Object.keys(perms.modules).length) return perms.modules;
  const modules = {};
  const legacyMap = {
    staff:          { any: 'can_access_staff',      view_all: 'can_view_all_staff' },
    financials:     { any: 'can_access_financials' },
    analytics:      { any: 'can_access_analytics' },
    services:       { any: 'can_access_services' },
    gallery:        { any: 'can_access_gallery' },
    marketing:      { any: 'can_access_marketing' },
    salon_settings: { any: 'can_edit_salon' },
    delete_salon:   { any: 'can_delete_salon' },
  };
  MODULES.forEach(m => {
    const map = legacyMap[m.key] || {};
    const anyKey = map.any;
    const anyOn = anyKey && !!perms[anyKey];
    modules[m.key] = {};
    m.actions.forEach(a => {
      if (map[a.key] && perms[map[a.key]]) modules[m.key][a.key] = true;
      else if (anyOn) modules[m.key][a.key] = true;
      else modules[m.key][a.key] = false;
    });
    // Special: staff.view_all only inherits legacy can_view_all_staff, not can_access_staff
    if (m.key === 'staff') {
      modules.staff.view_all = !!perms.can_view_all_staff;
    }
  });
  return modules;
}

/**
 * Derive legacy flat keys from a modules[] map so requests keep working
 * against endpoints that still read the old flat keys.
 */
export function deriveLegacyFromModules(modules) {
  const m = modules || {};
  const anyOn = (moduleKey) => {
    const mod = m[moduleKey] || {};
    return Object.values(mod).some(Boolean);
  };
  return {
    can_edit_salon:        anyOn('salon_settings'),
    can_access_analytics:  anyOn('analytics'),
    can_access_financials: anyOn('financials'),
    can_delete_salon:      !!(m.delete_salon && m.delete_salon.allowed),
    can_access_services:   anyOn('services'),
    can_access_gallery:    anyOn('gallery'),
    can_access_staff:      anyOn('staff'),
    can_view_all_staff:    !!(m.staff && m.staff.view_all),
    can_access_marketing:  anyOn('marketing'),
  };
}
