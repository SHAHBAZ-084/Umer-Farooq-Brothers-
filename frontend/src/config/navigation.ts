import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  FileText,
  Package,
  Receipt,
  Settings,
  Wallet,
} from 'lucide-react';

import { APP_BRAND_NAME } from './brand';

export type NavLink = {
  label: string;
  to: string;
  description?: string;
  /** When true, only ADMIN users see this nav item. */
  adminOnly?: boolean;
};

export type NavItem =
  | ({ kind: 'link' } & NavLink)
  | { kind: 'submenu'; label: string; children: NavLink[] };

export type SidebarSection = {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
};

/** Card shown on a section landing page. */
export type SectionCard = NavLink & {
  group?: string;
};

export const SIDEBAR_NAV: SidebarSection[] = [
  {
    id: 'accounts',
    label: 'Accounts',
    icon: Wallet,
    items: [
      {
        kind: 'submenu',
        label: 'Category',
        children: [
          { label: 'Add Category', to: '/accounts/categories/add' },
          { label: 'Edit Category', to: '/accounts/categories/edit' },
          { label: 'Remove Category', to: '/accounts/categories/remove', adminOnly: true },
        ],
      },
      {
        kind: 'submenu',
        label: 'Account',
        children: [
          { label: 'Add Account', to: '/accounts/manage/add' },
          { label: 'Edit Account', to: '/accounts/manage/edit' },
          { label: 'Remove Account', to: '/accounts/manage/remove', adminOnly: true },
        ],
      },
      { kind: 'link', label: 'Sale Party', to: '/accounts/sale-parties' },
      { kind: 'link', label: 'Purchase Party', to: '/accounts/purchase-parties' },
      { kind: 'link', label: 'Account Adjustment', to: '/accounts/adjustment' },
    ],
  },
  {
    id: 'products',
    label: 'Products',
    icon: Package,
    items: [
      { kind: 'link', label: 'Add Product', to: '/accounts/products/add' },
      { kind: 'link', label: 'Remove Product', to: '/accounts/products/remove', adminOnly: true },
      { kind: 'link', label: 'Stock Adjustment', to: '/accounts/products/stock-adjustment' },
    ],
  },
  {
    id: 'vouchers',
    label: 'Vouchers',
    icon: Receipt,
    items: [
      { kind: 'link', label: 'Payment Voucher', to: '/vouchers/payment' },
      { kind: 'link', label: 'Journal Voucher', to: '/vouchers/journal' },
      { kind: 'link', label: 'Receipt Voucher', to: '/vouchers/receipt' },
      { kind: 'link', label: 'Scheduled Vouchers', to: '/vouchers/schedules' },
      { kind: 'link', label: 'View Voucher', to: '/vouchers/view' },
    ],
  },
  {
    id: 'invoices',
    label: 'Invoices',
    icon: FileText,
    items: [
      { kind: 'link', label: 'Sale on Commission', to: '/invoices/sale-commission' },
      { kind: 'link', label: 'Sale on Paunch', to: '/invoices/sale-paunch' },
      { kind: 'link', label: 'General Trade', to: '/invoices/general-trade' },
      { kind: 'link', label: 'Purchase to Maal', to: '/invoices/purchase-maal' },
      { kind: 'link', label: 'Kachi Maal', to: '/invoices/kachi-maal' },
      { kind: 'link', label: 'View Invoice', to: '/invoices/view-invoice' },
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: BarChart3,
    items: [
      {
        kind: 'submenu',
        label: 'Account Reports',
        children: [
          { label: 'Account Ledger', to: '/reports/accounts' },
          { label: 'Account Balance', to: '/reports/account-balance' },
          { label: 'Vouchers', to: '/reports/vouchers' },
        ],
      },
      { kind: 'link', label: 'Daily Report', to: '/reports/daily' },
      { kind: 'link', label: 'Detail Trial Balance', to: '/reports/trial-balance' },
      { kind: 'link', label: 'Sale/Purchase Reports', to: '/reports/sale-purchase' },
      { kind: 'link', label: 'Stock Report', to: '/reports/stock' },
      { kind: 'link', label: 'Empty Bardana', to: '/inventory/bardana' },
    ],
  },
  {
    id: 'system',
    label: 'System',
    icon: Settings,
    items: [
      { kind: 'link', label: 'User Management', to: '/system/users' },
      { kind: 'link', label: 'System Preference', to: '/system/preferences' },
      { kind: 'link', label: 'Financial Year', to: '/settings/financial-year' },
    ],
  },
];

/** Top navbar section order (Backup and Approval are rendered separately in TopBar). */
export const TOP_NAV_SECTION_IDS = [
  'accounts',
  'products',
  'vouchers',
  'invoices',
  'reports',
  'system',
] as const;

export function getSectionLandingPath(sectionId: string): string {
  return `/${sectionId}`;
}

export function getSectionById(sectionId: string): SidebarSection | undefined {
  return SIDEBAR_NAV.find((section) => section.id === sectionId);
}

/** Flatten a section's nav items into landing-page cards (submenu label stored as group). */
export function getSectionCards(sectionId: string): SectionCard[] {
  const section = getSectionById(sectionId);
  if (!section) return [];

  const cards: SectionCard[] = [];
  for (const item of section.items) {
    if (item.kind === 'link') {
      cards.push({ label: item.label, to: item.to, description: item.description });
    } else {
      for (const child of item.children) {
        cards.push({ ...child, group: item.label });
      }
    }
  }
  return cards;
}

export type SectionCardGroup = {
  group: string | null;
  cards: SectionCard[];
};

/** Group cards when a section has more than ~8 links; otherwise return one flat group. */
export function getSectionCardGroups(sectionId: string): SectionCardGroup[] {
  const cards = getSectionCards(sectionId);
  const useGroups = cards.length > 8;

  if (!useGroups) {
    return [{ group: null, cards }];
  }

  const grouped = new Map<string | null, SectionCard[]>();
  for (const card of cards) {
    const key = card.group ?? null;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(card);
  }

  return Array.from(grouped.entries()).map(([group, groupCards]) => ({
    group,
    cards: groupCards,
  }));
}

export function linkMatchesPath(pathname: string, to: string): boolean {
  return pathname === to || (to !== '/' && pathname.startsWith(`${to}/`));
}

export function sectionHasActive(pathname: string, items: NavItem[]): boolean {
  for (const item of items) {
    if (item.kind === 'link' && linkMatchesPath(pathname, item.to)) return true;
    if (item.kind === 'submenu' && item.children.some((child) => linkMatchesPath(pathname, child.to))) {
      return true;
    }
  }
  return false;
}

export function sectionIsActive(pathname: string, section: SidebarSection): boolean {
  return sectionHasActive(pathname, section.items);
}

/** Flat links for dashboard invoice shortcuts. */
export const INVOICE_QUICK_LINKS: NavLink[] = (
  SIDEBAR_NAV.find((section) => section.id === 'invoices')?.items ?? []
).flatMap((item) => (item.kind === 'link' ? [item] : []));

export const VOUCHER_QUICK_LINKS: NavLink[] = (
  SIDEBAR_NAV.find((section) => section.id === 'vouchers')?.items ?? []
).flatMap((item) => (item.kind === 'link' && item.to !== '/vouchers/view' ? [item] : []));

/** Flat links for dashboard report shortcuts (includes nested account reports). */
export const REPORT_QUICK_LINKS: NavLink[] = (
  SIDEBAR_NAV.find((section) => section.id === 'reports')?.items ?? []
).flatMap((item) =>
  item.kind === 'link' ? [item] : item.children.map((child) => ({ ...child })),
);

const ROUTE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/user': 'User Information',
  '/backup': 'Database Backup',
  '/approvals': 'Approval',
};

function collectRouteTitles(items: NavItem[], titles: Record<string, string>) {
  for (const item of items) {
    if (item.kind === 'link') {
      titles[item.to] = item.label;
    } else {
      for (const child of item.children) {
        titles[child.to] = child.label;
      }
    }
  }
}

for (const section of SIDEBAR_NAV) {
  ROUTE_TITLES[getSectionLandingPath(section.id)] = section.label;
  collectRouteTitles(section.items, ROUTE_TITLES);
}

export function getPageTitle(pathname: string): string {
  if (ROUTE_TITLES[pathname]) return ROUTE_TITLES[pathname];
  const match = Object.entries(ROUTE_TITLES)
    .filter(([path]) => path !== '/')
    .sort(([a], [b]) => b.length - a.length)
    .find(([path]) => pathname.startsWith(path));
  return match?.[1] ?? APP_BRAND_NAME;
}

export const INVOICE_TYPE_LABELS: Record<string, string> = {
  SALE_COMMISSION: 'Sale on Commission',
  SALE_PAUNCH: 'Sale on Paunch',
  PURCHASE_MAAL: 'Purchase to Maal',
  KACHI_MAAL: 'Kachi Maal',
  PURCHASE_GENERAL: 'Purchase Invoice (General)',
  SALE_GENERAL: 'Sale Invoice (General)',
  GENERAL_TRADE: 'General Trade',
};

/** @deprecated Use SIDEBAR_NAV — kept for any legacy imports */
export type NavGroup = {
  label: string;
  children?: NavItem[];
  to?: string;
};

export const TOP_NAV: NavGroup[] = SIDEBAR_NAV.map((section) => ({
  label: section.label,
  children: section.items,
}));
