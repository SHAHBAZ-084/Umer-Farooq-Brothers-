import { beforeAll, describe, expect, it } from 'vitest';
import { AccountType, RecordStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import {
  KACHI_MAAL_CATEGORY_NAMES,
  bootstrapChartOfAccounts,
  createAccount,
  ensureKachiMaalAccounts,
  updateAccount,
} from './accounting.service';
import { AppError } from '../../utils/helpers';

describe('party contact fields + duplicate checks', () => {
  let saleCatId: number;
  let bankCatId: number;
  let stamp: number;

  beforeAll(async () => {
    stamp = Date.now();
    await bootstrapChartOfAccounts();
    await prisma.$transaction((tx) => ensureKachiMaalAccounts(tx));
    const sale = await prisma.accountCategory.findFirst({
      where: { name: KACHI_MAAL_CATEGORY_NAMES.SALE_PARTY },
    });
    const bank = await prisma.accountCategory.findFirst({ where: { name: 'Bank' } });
    if (!sale || !bank) throw new Error('categories missing');
    saleCatId = sale.id;
    bankCatId = bank.id;
  });

  it('allows blank phone/address/cnic on party create', async () => {
    const account = await createAccount({
      categoryId: saleCatId,
      name: `Party Blank ${stamp}`,
    });
    expect(account.phone).toBeNull();
    expect(account.cnic).toBeNull();
  });

  it('rejects duplicate phone within party categories', async () => {
    await createAccount({
      categoryId: saleCatId,
      name: `Party Phone A ${stamp}`,
      phone: `0300-${stamp}`,
    });
    await expect(
      createAccount({
        categoryId: saleCatId,
        name: `Party Phone B ${stamp}`,
        phone: `0300-${stamp}`,
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('rejects duplicate cnic within party categories', async () => {
    await createAccount({
      categoryId: saleCatId,
      name: `Party Cnic A ${stamp}`,
      cnic: `35202-${stamp}-1`,
    });
    await expect(
      createAccount({
        categoryId: saleCatId,
        name: `Party Cnic B ${stamp}`,
        cnic: `35202-${stamp}-1`,
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('rejects duplicate name globally including bank vs party', async () => {
    await createAccount({
      categoryId: bankCatId,
      name: `Shared Name ${stamp}`,
      type: AccountType.ASSET,
    });
    await expect(
      createAccount({
        categoryId: saleCatId,
        name: `Shared Name ${stamp}`,
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('edit does not flag itself as duplicate', async () => {
    const account = await createAccount({
      categoryId: saleCatId,
      name: `Party Edit Self ${stamp}`,
      phone: `0311-${stamp}`,
      cnic: `42101-${stamp}-9`,
    });
    const updated = await updateAccount(account.id, {
      name: account.name,
      phone: account.phone,
      cnic: account.cnic,
    });
    expect(updated.id).toBe(account.id);
    expect(updated.phone).toBe(`0311-${stamp}`);
  });

  it('ignores contact fields for non-party categories', async () => {
    const account = await createAccount({
      categoryId: bankCatId,
      name: `Bank Contact Ignore ${stamp}`,
      type: AccountType.ASSET,
      phone: 'should-not-store',
      cnic: 'should-not-store',
    });
    expect(account.phone).toBeNull();
    expect(account.cnic).toBeNull();
  });
});
