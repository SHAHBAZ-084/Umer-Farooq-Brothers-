import { describe, expect, it } from 'vitest';
import {
  groupAccountsByCategory,
  packCategoryGroupsIntoPages,
  paginateCategoryAccountGroups,
} from './category-report-pagination';

type Row = {
  accountId: number;
  categoryId: number;
  categoryName: string;
  name: string;
};

function row(id: number, categoryId: number, categoryName: string): Row {
  return { accountId: id, categoryId, categoryName, name: `A${id}` };
}

describe('category-report-pagination', () => {
  it('groups accounts preserving first-seen category order', () => {
    const rows = [
      row(1, 10, 'Bank'),
      row(2, 10, 'Bank'),
      row(3, 20, 'Expenses'),
      row(4, 10, 'Bank'),
    ];
    const groups = groupAccountsByCategory(rows);
    expect(groups.map((g) => g.categoryId)).toEqual([10, 20]);
    expect(groups[0]!.accounts.map((a) => a.accountId)).toEqual([1, 2, 4]);
  });

  it('never splits a category across packed pages', () => {
    const groups = groupAccountsByCategory([
      row(1, 1, 'A'),
      row(2, 1, 'A'),
      row(3, 1, 'A'),
      row(4, 2, 'B'),
      row(5, 2, 'B'),
      row(6, 3, 'C'),
    ]);
    const pages = packCategoryGroupsIntoPages(groups, 3);
    // A has 3 accounts → alone on page 0; B(2)+C(1)=3 → page 1
    expect(pages).toHaveLength(2);
    expect(pages[0]!.map((g) => g.categoryName)).toEqual(['A']);
    expect(pages[1]!.map((g) => g.categoryName)).toEqual(['B', 'C']);
  });

  it('keeps an oversized single category on one page', () => {
    const groups = groupAccountsByCategory([
      row(1, 1, 'Big'),
      row(2, 1, 'Big'),
      row(3, 1, 'Big'),
      row(4, 1, 'Big'),
    ]);
    const pages = packCategoryGroupsIntoPages(groups, 3);
    expect(pages).toHaveLength(1);
    expect(pages[0]![0]!.accounts).toHaveLength(4);
  });

  it('paginate pack mode returns pageCount and whole categories', () => {
    const rows = [
      row(1, 1, 'A'),
      row(2, 1, 'A'),
      row(3, 2, 'B'),
      row(4, 2, 'B'),
      row(5, 3, 'C'),
    ];
    const groups = groupAccountsByCategory(rows);
    const page0 = paginateCategoryAccountGroups(groups, rows, { limit: 3, offset: 0 }, 'pack');
    const page1 = paginateCategoryAccountGroups(groups, rows, { limit: 3, offset: 3 }, 'pack');

    expect(page0.pageCount).toBe(2);
    expect(page0.groups.every((g) => g.accounts.length > 0)).toBe(true);
    // Page 0 should be complete categories only
    const ids0 = new Set(page0.accounts.map((a) => a.categoryId));
    for (const id of ids0) {
      const full = groups.find((g) => g.categoryId === id)!;
      const onPage = page0.groups.find((g) => g.categoryId === id)!;
      expect(onPage.accounts.length).toBe(full.accounts.length);
    }
    expect(page1.groups.length).toBeGreaterThan(0);
  });
});
