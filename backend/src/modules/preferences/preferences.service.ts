import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/helpers';

const BUSINESS_DEFAULTS = {
  businessName: 'Umer Farooq & Brothers',
  proprietorName: '',
  phone: '',
  mobile: null as string | null,
  email: null as string | null,
  address: null as string | null,
  ntnNumber: null as string | null,
};

const DEFAULTS = {
  daamiPercent: 0,
  paleDariPercent: 0,
  brokeryPercent: 0,
  marketFeeRate: 0,
  bardanaRate: 0,
  taxPercent: 0,
  kaatPercent: 0,
  mazduriPercent: 0,
  commissionPercent: 0,
  dalaliPercent: 0,
  sutliRate: 0,
  markeetFeeRate: 0,
  mazduriPerBagRate: 0,
  kantaRate: 0,
  closingDate: null as string | null,
  ...BUSINESS_DEFAULTS,
};

function toNumber(value: unknown) {
  return Number(value);
}

function optionalTrimmed(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function requireNonEmpty(value: string | undefined, fieldLabel: string): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!trimmed) {
    throw new AppError(400, `${fieldLabel} is required`);
  }
  return trimmed;
}

function mapPreferences(row: {
  daamiPercent: unknown;
  paleDariPercent: unknown;
  brokeryPercent: unknown;
  marketFeeRate: unknown;
  bardanaRate: unknown;
  taxPercent: unknown;
  kaatPercent: unknown;
  mazduriPercent: unknown;
  commissionPercent: unknown;
  dalaliPercent: unknown;
  sutliRate: unknown;
  markeetFeeRate: unknown;
  mazduriPerBagRate: unknown;
  kantaRate: unknown;
  closingDate: string | null;
  businessName: string;
  proprietorName: string;
  phone: string;
  mobile: string | null;
  email: string | null;
  address: string | null;
  ntnNumber: string | null;
  updatedAt: Date;
}) {
  return {
    daamiPercent: toNumber(row.daamiPercent),
    paleDariPercent: toNumber(row.paleDariPercent),
    brokeryPercent: toNumber(row.brokeryPercent),
    marketFeeRate: toNumber(row.marketFeeRate),
    bardanaRate: toNumber(row.bardanaRate),
    taxPercent: toNumber(row.taxPercent),
    kaatPercent: toNumber(row.kaatPercent),
    mazduriPercent: toNumber(row.mazduriPercent),
    commissionPercent: toNumber(row.commissionPercent),
    dalaliPercent: toNumber(row.dalaliPercent),
    sutliRate: toNumber(row.sutliRate),
    markeetFeeRate: toNumber(row.markeetFeeRate),
    mazduriPerBagRate: toNumber(row.mazduriPerBagRate),
    kantaRate: toNumber(row.kantaRate),
    closingDate: row.closingDate,
    businessName: row.businessName,
    proprietorName: row.proprietorName,
    phone: row.phone,
    mobile: row.mobile,
    email: row.email,
    address: row.address,
    ntnNumber: row.ntnNumber,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getSystemPreferences() {
  let row = await prisma.systemPreference.findUnique({ where: { id: 1 } });
  if (!row) {
    row = await prisma.systemPreference.create({ data: { id: 1, ...DEFAULTS } });
  }
  return mapPreferences(row);
}

export type SystemPreferenceUpdate = Partial<{
  daamiPercent: number;
  paleDariPercent: number;
  brokeryPercent: number;
  marketFeeRate: number;
  bardanaRate: number;
  taxPercent: number;
  kaatPercent: number;
  mazduriPercent: number;
  commissionPercent: number;
  dalaliPercent: number;
  sutliRate: number;
  markeetFeeRate: number;
  mazduriPerBagRate: number;
  kantaRate: number;
  closingDate: string | null;
  businessName: string;
  proprietorName: string;
  phone: string;
  mobile: string | null;
  email: string | null;
  address: string | null;
  ntnNumber: string | null;
}>;

export async function updateSystemPreferences(data: SystemPreferenceUpdate) {
  const update: SystemPreferenceUpdate = { ...data };

  if (data.businessName !== undefined) {
    update.businessName = requireNonEmpty(data.businessName, 'Business Name');
  }
  if (data.proprietorName !== undefined) {
    update.proprietorName = requireNonEmpty(data.proprietorName, 'Proprietor Name');
  }
  if (data.phone !== undefined) {
    update.phone = requireNonEmpty(data.phone, 'Phone');
  }
  if (data.mobile !== undefined) {
    update.mobile = optionalTrimmed(data.mobile);
  }
  if (data.email !== undefined) {
    update.email = optionalTrimmed(data.email);
  }
  if (data.address !== undefined) {
    update.address = optionalTrimmed(data.address);
  }
  if (data.ntnNumber !== undefined) {
    update.ntnNumber = optionalTrimmed(data.ntnNumber);
  }

  const row = await prisma.systemPreference.upsert({
    where: { id: 1 },
    create: { id: 1, ...DEFAULTS, ...update },
    update,
  });
  return mapPreferences(row);
}

export type SystemPreferences = Awaited<ReturnType<typeof getSystemPreferences>>;
