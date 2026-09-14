/**
 * Category-aware report pagination: pack whole categories into pages so a
 * category is never split across two pages (used by Account Balance + Trial Balance).
 */

export type CategoryAccountGroup<T extends { accountId: number }> = {
  categoryId: number;
  categoryName: string;
  accounts: T[];
};

export type CategoryPageResult<T extends { accountId: number }> = {
  accounts: T[];
  groups: CategoryAccountGroup<T>[];
  total: number;
  limit: number;
  offset: number;
  pageCount: number;
};

/** Build ordered category groups from a flat account list (preserves first-seen category order). */
export function groupAccountsByCategory<
  T extends { accountId: number; categoryId: number; categoryName: string },
>(rows: T[]): CategoryAccountGroup<T>[] {
  const groupsMap = new Map<number, CategoryAccountGroup<T>>();
  for (const row of rows) {
    const existing = groupsMap.get(row.categoryId);
    if (existing) {
      existing.accounts.push(row);
    } else {
      groupsMap.set(row.categoryId, {
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        accounts: [row],
      });
    }
  }
  return Array.from(groupsMap.values());
}

/** Pack whole categories into pages of roughly `limit` accounts; never split a category. */
export function packCategoryGroupsIntoPages<T extends { accountId: number }>(
  groups: CategoryAccountGroup<T>[],
  limit: number,
): CategoryAccountGroup<T>[][] {
  const pages: CategoryAccountGroup<T>[][] = [];
  let current: CategoryAccountGroup<T>[] = [];
  let currentCount = 0;
  for (const group of groups) {
    const n = group.accounts.length;
    if (currentCount > 0 && currentCount + n > limit) {
      pages.push(current);
      current = [];
      currentCount = 0;
    }
    current.push(group);
    currentCount += n;
  }
  if (current.length) pages.push(current);
  return pages;
}

/**
 * Paginate either by packing whole categories, or by flat account slice
 * (single-category / flat views).
 */
export function paginateCategoryAccountGroups<T extends { accountId: number }>(
  groups: CategoryAccountGroup<T>[],
  rows: T[],
  pagination: { limit: number; offset: number } | null,
  mode: 'pack' | 'slice',
): CategoryPageResult<T> {
  if (!pagination) {
    return {
      accounts: rows,
      groups,
      total: rows.length,
      limit: rows.length,
      offset: 0,
      pageCount: 1,
    };
  }

  const { limit, offset } = pagination;

  if (mode === 'slice' || groups.length <= 1) {
    const pageAccounts = rows.slice(offset, offset + limit);
    const pageGroups = groups
      .map((group) => ({
        ...group,
        accounts: group.accounts.filter((a) =>
          pageAccounts.some((p) => p.accountId === a.accountId),
        ),
      }))
      .filter((g) => g.accounts.length > 0);
    const pageCount = rows.length === 0 ? 0 : Math.ceil(rows.length / limit);
    return {
      accounts: pageAccounts,
      groups: pageGroups,
      total: rows.length,
      limit,
      offset,
      pageCount,
    };
  }

  const pages = packCategoryGroupsIntoPages(groups, limit);
  const pageCount = pages.length;
  const pageIndex = Math.min(
    Math.floor(offset / limit),
    Math.max(pageCount - 1, 0),
  );
  const pageGroups = pageCount === 0 ? [] : (pages[pageIndex] ?? []);
  const pageAccounts = pageGroups.flatMap((g) => g.accounts);

  return {
    accounts: pageAccounts,
    groups: pageGroups,
    total: rows.length,
    limit,
    offset: pageIndex * limit,
    pageCount,
  };
}
