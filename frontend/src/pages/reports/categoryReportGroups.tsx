import type { ReactNode } from 'react';

/** Category group shape shared by Account Balance and Trial Balance APIs. */
export type CategoryReportGroup<T> = {
  categoryId: number;
  categoryName: string;
  accounts: T[];
};

export function sumGroupField<T>(accounts: T[], pick: (account: T) => number): number {
  return accounts.reduce((sum, account) => sum + pick(account), 0);
}

/**
 * Build PDF/Excel rows: category header → account rows → category subtotal → grand total.
 * Column count / formatting is caller-owned (Balance vs Debit+Credit).
 */
export function buildCategoryGroupedExportRows<T>(
  groups: CategoryReportGroup<T>[],
  options: {
    /** Extra blank cells after the category name (e.g. `['']` for 2-col, `['','']` for 3-col). */
    headerPadding: (string | number)[];
    formatAccount: (account: T) => (string | number)[];
    formatCategoryTotal: (categoryName: string, accounts: T[]) => (string | number)[];
    grandTotalRow: (string | number)[];
  },
): (string | number)[][] {
  const rows: (string | number)[][] = [];
  for (const group of groups) {
    rows.push([group.categoryName.toUpperCase(), ...options.headerPadding]);
    for (const account of group.accounts) {
      rows.push(options.formatAccount(account));
    }
    rows.push(options.formatCategoryTotal(group.categoryName, group.accounts));
  }
  rows.push(options.grandTotalRow);
  return rows;
}

/** Category section header row — bold/primary so the category name stands out. */
export function CategoryGroupHeaderRow({
  name,
  colSpan,
}: {
  name: string;
  colSpan: number;
}) {
  return (
    <tr className="border-b border-border bg-surface1">
      <td
        colSpan={colSpan}
        className="py-2 pr-3 text-sm font-bold uppercase tracking-wide text-textPrimary"
      >
        {name}
      </td>
    </tr>
  );
}

/** Category subtotal row — muted label; value cells (and their color) come from the caller. */
export function CategoryGroupTotalRow({
  categoryName,
  children,
}: {
  categoryName: string;
  children: ReactNode;
}) {
  return (
    <tr className="border-t-2 border-border bg-surface1">
      <td className="py-2 pr-3 text-textSecondary">{categoryName} Total</td>
      {children}
    </tr>
  );
}
