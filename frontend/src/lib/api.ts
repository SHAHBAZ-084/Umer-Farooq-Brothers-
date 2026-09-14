export type Paginated<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
};

export type User = {
  id: number;
  username: string;
  displayName: string;
  role: 'ADMIN' | 'USER';
  createdAt?: string;
};

export type FinancialYear = {
  id: number;
  label: string;
  startDate: string;
  endDate: string | null;
  status: 'ACTIVE' | 'CLOSED';
  closedAt?: string | null;
  closedBy?: { id: number; displayName: string; username: string } | null;
};

export type AccountCategory = {
  id: number;
  name: string;
  isActive: boolean;
};

export type Ledger = { id: number; accountId: number; balance: number };
export type Account = {
  id: number;
  categoryId: number;
  name: string;
  code: string;
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  isActive: boolean;
  phone?: string | null;
  address?: string | null;
  cnic?: string | null;
  category?: AccountCategory | null;
  ledger?: Ledger | null;
};

export type ProductCategory = {
  id: number;
  name: string;
  stockMode: 'GRAIN_BAGS' | 'QUANTITY';
  isActive: boolean;
};

export type Reminder = {
  id: number;
  accountId: number;
  amount: number;
  reminderAt: string;
  note: string | null;
  status: 'PENDING' | 'SETTLED';
  createdById: number;
  createdByRole: 'ADMIN' | 'USER';
  settledAt: string | null;
  settledById: number | null;
  lastNotifiedAt: string | null;
  notifyCount: number;
  createdAt: string;
  account?: { id: number; name: string; code: string } | null;
  createdBy?: { id: number; displayName: string | null; username: string; role: 'ADMIN' | 'USER' } | null;
  settledBy?: { id: number; displayName: string | null; username: string } | null;
};

export type ScheduleFrequency = 'HOURLY' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
export type ScheduleStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'DELETED';

export type ScheduledVoucher = {
  id: number;
  voucherType: 'PAYMENT' | 'RECEIPT' | 'JOURNAL';
  debitAccountId: number;
  creditAccountId: number;
  amount: number;
  description: string | null;
  frequency: ScheduleFrequency;
  startAt: string;
  endAt: string | null;
  occurrenceLimit: number | null;
  occurrencesRun: number;
  nextRunAt: string;
  lastRunAt: string | null;
  status: ScheduleStatus;
  createdById: number;
  createdAt: string;
  debitAccount?: { id: number; name: string; code: string } | null;
  creditAccount?: { id: number; name: string; code: string } | null;
  createdBy?: { id: number; displayName: string | null; username: string } | null;
};

export type Product = {
  id: number;
  name: string;
  code: string;
  unit: string | null;
  accountId: number;
  categoryId?: number;
  averageCost?: number | string | null;
  /** On-hand qty for QUANTITY stock products; null for grain/other. */
  quantityOnHand?: number | string | null;
  category?: ProductCategory | null;
  account?: { id: number; name: string; code: string; ledger?: { balance: number | string } | null };
};

export type Party = {
  id: number;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  accountId?: number | null;
  /** Signed ledger balance from linked Account → Ledger (positive = Dr, negative = Cr). */
  balance: number;
};

export type Invoice = {
  id: number;
  type: string;
  status: string;
  reference: string;
  total: number | string;
  createdAt: string;
  customer?: Party | null;
  supplier?: Party | null;
};

export type SystemPreferences = {
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
  updatedAt: string;
};

export type KachiMaalInvoiceResult = Invoice & {
  vouchers?: { voucher: Voucher }[];
};

export type InvoiceItemDetail = {
  id: number;
  label: string;
  quantity: number | string;
  unitPrice: number | string;
  total: number | string;
  product?: Product | null;
};

export type MaalLineDetail = {
  id: number;
  jins?: string | null;
  qism?: string | null;
  boriOrThelaMode: 'BORI' | 'THELA';
  bagCount: number | string;
  bhartii: number | string;
  dharanCount: number | string;
  looseKg: number | string;
  totalWeightKg: number | string;
  ratePerMaund: number | string;
  amount: number | string;
  bardanaQty?: number | string | null;
  bardanaRate?: number | string | null;
  bardanaAmount?: number | string | null;
  netCreditToParty: number | string;
  partyAccount?: VoucherAccount | null;
  dammiChecked?: boolean;
  dammiAmount?: number | string | null;
};

export type KachiMaalLineDetail = MaalLineDetail;

export type PurchaseMaalLineDetail = MaalLineDetail;

export type SalePaunchLineDetail = {
  id: number;
  jins?: string | null;
  qism?: string | null;
  boriOrThelaMode: 'BORI' | 'THELA';
  bagCount: number | string;
  thelaCount?: number | string | null;
  totalWeightKg: number | string;
  kaatKg: number | string;
  netWeightKg: number | string;
  lowerKaatKg: number | string;
  lowerNetWeightKg: number | string;
  upperRatePerMaund: number | string;
  upperAmount: number | string;
  kanta: number | string;
  netUpperAmount: number | string;
  lowerRatePerMaund: number | string;
  lowerAmount: number | string;
  rowRevenue?: number | string;
  bardanaQty?: number | string | null;
  bardanaRate?: number | string | null;
  bardanaAmount?: number | string | null;
  dammiChecked?: boolean;
  dammiAmount?: number | string | null;
  maalKhataAccount?: VoucherAccount | null;
};

export type GeneralPurchaseLineDetail = {
  id: number;
  productId: number;
  quantity: number | string;
  rate: number | string;
  lineTotal: number | string;
  mazduriAmount?: number | string | null;
  sortOrder?: number;
  product?: Product | null;
};

export type GeneralSaleLineDetail = {
  id: number;
  productId: number;
  quantity: number | string;
  rate: number | string;
  lineTotal: number | string;
  unitCost?: number | string | null;
  sortOrder?: number;
  product?: Product | null;
};

export type InvoiceDetail = Invoice & {
  invoiceDate?: string | null;
  debitAccountId?: number | null;
  partyAccountId?: number | null;
  salePartyAccountId?: number | null;
  productId?: number | null;
  billNo?: string | null;
  gariNo?: string | null;
  jins?: string | null;
  qism?: string | null;
  tafseel?: string | null;
  notes?: string | null;
  miscAmount?: number | string | null;
  munshianaAmount?: number | string | null;
  taxAmount?: number | string | null;
  biltyKirayaAmount?: number | string | null;
  lowerBardanaMode?: 'BORI' | 'THELA' | null;
  lowerBardanaQty?: number | string | null;
  lowerBardanaRate?: number | string | null;
  lowerBardanaAmount?: number | string | null;
  marketFeeEnabled?: boolean;
  mazduriEnabled?: boolean;
  debitAccount?: VoucherAccount | null;
  partyAccount?: VoucherAccount | null;
  salePartyAccount?: VoucherAccount | null;
  items?: InvoiceItemDetail[];
  kachiMaalLines?: KachiMaalLineDetail[];
  purchaseMaalLines?: PurchaseMaalLineDetail[];
  salePaunchLines?: SalePaunchLineDetail[];
  saleCommissionLines?: MaalLineDetail[];
  generalPurchaseLines?: GeneralPurchaseLineDetail[];
  generalSaleLines?: GeneralSaleLineDetail[];
  product?: Product | null;
  vouchers?: { voucher: Voucher }[];
  createdBy?: VoucherUser | null;
};

export type VoucherAccount = { id: number; name: string; code: string };
export type VoucherUser = { id: number; displayName: string | null; username: string };

export type ApprovalKind =
  | 'account'
  | 'product'
  | 'voucher'
  | 'invoice'
  | 'account-adjustment'
  | 'stock-adjustment';

export type ApprovalAccountRef = {
  name: string;
  code: string;
  amount?: number;
};

export type PendingApprovalItem = {
  kind: ApprovalKind;
  id: number;
  label: string;
  sublabel?: string | null;
  amount?: number | null;
  debitAmount?: number | null;
  creditAmount?: number | null;
  reference?: string | null;
  recordType?: string | null;
  recordDate?: string | null;
  typeLabel?: string | null;
  debitAccount?: ApprovalAccountRef | null;
  creditAccount?: ApprovalAccountRef | null;
  description?: string | null;
  createdAt: string;
  createdBy?: VoucherUser | null;
};

export type PendingApprovalDetail = {
  kind: ApprovalKind;
  record: Record<string, unknown>;
  /** Computed summary for General Goods invoices. */
  approvalDescription?: string | null;
  debitAccount?: ApprovalAccountRef | null;
  creditAccount?: ApprovalAccountRef | null;
  debitAmount?: number | null;
  creditAmount?: number | null;
};

export type VoucherLedgerEntry = {
  id: number;
  type: string;
  amount: number | string;
  notes?: string | null;
  ledger?: {
    account?: VoucherAccount | null;
  } | null;
};

export type Voucher = {
  id: number;
  type: string;
  number: number;
  date: string;
  amount: number | string;
  description?: string | null;
  reference?: string | null;
  status: string;
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string | null;
  debitAccount?: VoucherAccount | null;
  creditAccount?: VoucherAccount | null;
  ledgerEntries?: VoucherLedgerEntry[];
  createdBy?: VoucherUser | null;
  modifiedBy?: VoucherUser | null;
  deletedBy?: VoucherUser | null;
};

type ApiError = { error: string; code?: string };

export class ApiRequestError extends Error {
  code?: string;
  status?: number;
  constructor(message: string, code?: string, status?: number) {
    super(message);
    this.name = 'ApiRequestError';
    this.code = code;
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    credentials: 'include',
  });
  const data = (await response.json().catch(() => ({}))) as T & ApiError;
  if (!response.ok) throw new ApiRequestError(data.error ?? 'Request failed', data.code, response.status);
  return data;
}

export const api = {
  login(username: string, password: string) {
    return request<{ user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  },
  logout() {
    return request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
  },
  me() {
    return request<{ user: User }>('/api/auth/me');
  },

  listUsers() {
    return request<User[]>('/api/auth/users');
  },
  createUser(data: { username: string; password: string; displayName?: string }) {
    return request<{ user: User }>('/api/auth/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  updateUser(id: number, data: {
    username?: string;
    displayName?: string | null;
    role?: 'ADMIN' | 'USER';
  }) {
    return request<{ user: User }>(`/api/auth/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },
  resetUserPassword(id: number, data: { newPassword: string }) {
    return request<{ ok: boolean }>(`/api/auth/users/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  deleteUser(id: number) {
    return request<{ ok: boolean }>(`/api/auth/users/${id}`, { method: 'DELETE' });
  },
  changePassword(data: { currentPassword: string; newPassword: string }) {
    return request<{ ok: boolean }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  listCategories() {
    return request<AccountCategory[]>('/api/accounting/categories');
  },
  createCategory(name: string) {
    return request<AccountCategory>('/api/accounting/categories', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  },
  deleteCategory(id: number) {
    return request<AccountCategory>(`/api/accounting/categories/${id}`, { method: 'DELETE' });
  },

  listProducts(params?: { stockMode?: 'GRAIN_BAGS' | 'QUANTITY'; categoryId?: number }) {
    const query = new URLSearchParams();
    if (params?.stockMode) query.set('stockMode', params.stockMode);
    if (params?.categoryId != null) query.set('categoryId', String(params.categoryId));
    const suffix = query.toString() ? `?${query}` : '';
    return request<Product[]>(`/api/products${suffix}`);
  },
  listProductCategories(stockMode?: 'GRAIN_BAGS' | 'QUANTITY') {
    const query = stockMode ? `?stockMode=${stockMode}` : '';
    return request<ProductCategory[]>(`/api/products/categories${query}`);
  },
  createProductCategory(data: { name: string; stockMode: 'GRAIN_BAGS' | 'QUANTITY' }) {
    return request<ProductCategory>('/api/products/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  createProduct(data: {
    name: string;
    unit?: string;
    code?: string;
    categoryId?: number;
    openingBalance?: number;
    openingBalanceSide?: 'DR' | 'CR';
  }) {
    return request<Product>('/api/products', { method: 'POST', body: JSON.stringify(data) });
  },
  removeProduct(id: number) {
    return request<{ ok: boolean }>(`/api/products/${id}`, { method: 'DELETE' });
  },

  listSaleParties() {
    return request<Party[]>('/api/parties/sale-parties');
  },
  createSaleParty(data: Record<string, string | undefined>) {
    return request<Party>('/api/parties/sale-parties', { method: 'POST', body: JSON.stringify(data) });
  },
  removeSaleParty(id: number) {
    return request<Party>(`/api/parties/sale-parties/${id}`, { method: 'DELETE' });
  },

  listPurchaseParties() {
    return request<Party[]>('/api/parties/purchase-parties');
  },
  createPurchaseParty(data: Record<string, string | undefined>) {
    return request<Party>('/api/parties/purchase-parties', { method: 'POST', body: JSON.stringify(data) });
  },
  removePurchaseParty(id: number) {
    return request<Party>(`/api/parties/purchase-parties/${id}`, { method: 'DELETE' });
  },

  listInvoices(type?: string, pagination?: { limit?: number; offset?: number }) {
    const query = new URLSearchParams();
    if (type) query.set('type', type);
    if (pagination?.limit != null) query.set('limit', String(pagination.limit));
    if (pagination?.offset != null) query.set('offset', String(pagination.offset));
    const suffix = query.toString() ? `?${query}` : '';
    return request<Paginated<Invoice>>(`/api/invoices${suffix}`);
  },

  getInvoice(id: number) {
    return request<InvoiceDetail>(`/api/invoices/${id}`);
  },
  getInvoiceByReference(reference: string) {
    const query = new URLSearchParams({ reference });
    return request<InvoiceDetail>(`/api/invoices/by-reference?${query.toString()}`);
  },

  getNextKachiMaalReference() {
    return request<{ reference: string }>('/api/invoices/kachi-maal/next-reference');
  },

  createKachiMaalInvoice(data: {
    invoiceDate: string;
    billNo?: string;
    gariNo?: string;
    jins?: string;
    qism?: string;
    tafseel?: string;
    debitAccountId: number;
    miscAmount?: number;
    lowerBardanaMode?: 'BORI' | 'THELA' | null;
    lowerBardanaQty?: number | null;
    lowerBardanaRate?: number | null;
    lines: {
      partyAccountId: number;
      jins?: string;
      qism?: string;
      boriOrThelaMode: 'BORI' | 'THELA';
      bagCount: number;
      bhartii: number;
      dharanCount: number;
      looseKg: number;
      ratePerMaund: number;
      bardanaQty?: number | null;
      bardanaRate?: number | null;
    }[];
  }) {
    return request<KachiMaalInvoiceResult>('/api/invoices/kachi-maal', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updatePendingKachiMaalInvoice(invoiceId: number, data: Record<string, unknown>) {
    return request<KachiMaalInvoiceResult>(`/api/invoices/kachi-maal/${invoiceId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  getNextPurchaseMaalReference() {
    return request<{ reference: string }>('/api/invoices/purchase-maal/next-reference');
  },

  createPurchaseMaalInvoice(data: {
    invoiceDate: string;
    productId: number;
    billNo?: string;
    gariNo?: string;
    jins?: string;
    qism?: string;
    tafseel?: string;
    marketFeeEnabled?: boolean;
    mazduriEnabled?: boolean;
    lowerBardanaMode?: 'BORI' | 'THELA' | null;
    lowerBardanaQty?: number | null;
    lowerBardanaRate?: number | null;
    lines: {
      partyAccountId: number;
      jins?: string;
      qism?: string;
      boriOrThelaMode: 'BORI' | 'THELA';
      bagCount: number;
      bhartii: number;
      dharanCount: number;
      looseKg: number;
      ratePerMaund: number;
      bardanaQty?: number | null;
      bardanaRate?: number | null;
      dammiChecked?: boolean;
    }[];
  }) {
    return request<KachiMaalInvoiceResult>('/api/invoices/purchase-maal', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updatePendingPurchaseMaalInvoice(invoiceId: number, data: Record<string, unknown>) {
    return request<KachiMaalInvoiceResult>(`/api/invoices/purchase-maal/${invoiceId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  getNextPurchaseGeneralReference() {
    return request<{ reference: string }>('/api/invoices/purchase-general/next-reference');
  },

  createPurchaseGeneralInvoice(data: {
    invoiceDate: string;
    partyAccountId: number;
    billNo?: string;
    tafseel?: string;
    lines: {
      productId: number;
      quantity: number;
      rate: number;
      mazduriAmount?: number;
    }[];
  }) {
    return request<KachiMaalInvoiceResult>('/api/invoices/purchase-general', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updatePendingPurchaseGeneralInvoice(invoiceId: number, data: Record<string, unknown>) {
    return request<KachiMaalInvoiceResult>(`/api/invoices/purchase-general/${invoiceId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  getNextSaleGeneralReference() {
    return request<{ reference: string }>('/api/invoices/sale-general/next-reference');
  },

  createSaleGeneralInvoice(data: {
    invoiceDate: string;
    salePartyAccountId: number;
    billNo?: string;
    tafseel?: string;
    lines: {
      productId: number;
      quantity: number;
      rate: number;
    }[];
  }) {
    return request<KachiMaalInvoiceResult>('/api/invoices/sale-general', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updatePendingSaleGeneralInvoice(invoiceId: number, data: Record<string, unknown>) {
    return request<KachiMaalInvoiceResult>(`/api/invoices/sale-general/${invoiceId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  getNextGeneralTradeReference() {
    return request<{ reference: string }>('/api/invoices/general-trade/next-reference');
  },

  createGeneralTradeInvoice(data: {
    invoiceDate: string;
    partyAccountId: number;
    salePartyAccountId: number;
    billNo?: string;
    tafseel?: string;
    lines: {
      productId: number;
      quantity: number;
      purchaseRate: number;
      saleRate: number;
      mazduriAmount?: number;
    }[];
  }) {
    return request<KachiMaalInvoiceResult>('/api/invoices/general-trade', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updatePendingGeneralTradeInvoice(invoiceId: number, data: Record<string, unknown>) {
    return request<KachiMaalInvoiceResult>(`/api/invoices/general-trade/${invoiceId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  getNextSalePaunchReference() {
    return request<{ reference: string }>('/api/invoices/sale-paunch/next-reference');
  },

  createSalePaunchInvoice(data: {
    invoiceDate: string;
    salePartyAccountId: number;
    billNo?: string;
    gariNo?: string;
    jins?: string;
    qism?: string;
    tafseel?: string;
    taxAmount?: number;
    biltyKirayaAmount?: number;
    miscAmount?: number;
    lowerBardanaMode?: 'BORI' | 'THELA' | null;
    lowerBardanaQty?: number | null;
    lowerBardanaRate?: number | null;
    lines: {
      maalKhataAccountId: number;
      jins?: string;
      qism?: string;
      boriOrThelaMode: 'BORI' | 'THELA';
      bagCount: number;
      thelaCount?: number;
      compWeightKg: number;
      kaatKg?: number;
      lowerKaatKg?: number;
      upperRatePerMaund: number;
      lowerRatePerMaund: number;
      kanta?: number;
      bardanaQty?: number | null;
      bardanaRate?: number | null;
      dammiChecked?: boolean;
    }[];
  }) {
    return request<KachiMaalInvoiceResult>('/api/invoices/sale-paunch', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updatePendingSalePaunchInvoice(invoiceId: number, data: Record<string, unknown>) {
    return request<KachiMaalInvoiceResult>(`/api/invoices/sale-paunch/${invoiceId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  getNextSaleCommissionReference() {
    return request<{ reference: string }>('/api/invoices/sale-commission/next-reference');
  },

  createSaleCommissionInvoice(data: {
    invoiceDate: string;
    salePartyAccountId: number;
    billNo?: string;
    gariNo?: string;
    jins?: string;
    qism?: string;
    tafseel?: string;
    munshianaAmount?: number;
    miscAmount?: number;
    lowerBardanaMode?: 'BORI' | 'THELA' | null;
    lowerBardanaQty?: number | null;
    lowerBardanaRate?: number | null;
    lines: {
      partyAccountId: number;
      jins?: string;
      qism?: string;
      boriOrThelaMode: 'BORI' | 'THELA';
      bagCount: number;
      bhartii: number;
      dharanCount: number;
      looseKg: number;
      ratePerMaund: number;
      bardanaQty?: number | null;
      bardanaRate?: number | null;
      dammiChecked?: boolean;
    }[];
  }) {
    return request<KachiMaalInvoiceResult>('/api/invoices/sale-commission', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updatePendingSaleCommissionInvoice(invoiceId: number, data: Record<string, unknown>) {
    return request<KachiMaalInvoiceResult>(`/api/invoices/sale-commission/${invoiceId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  getSystemPreferences() {
    return request<SystemPreferences>('/api/preferences');
  },

  updateSystemPreferences(data: Partial<Omit<SystemPreferences, 'updatedAt'>>) {
    return request<SystemPreferences>('/api/preferences', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  listVouchers(params?: {
    fromDate?: string;
    toDate?: string;
    type?: string;
    financialYearId?: number;
    limit?: number;
    offset?: number;
  }) {
    const query = new URLSearchParams();
    if (params?.fromDate) query.set('fromDate', params.fromDate);
    if (params?.toDate) query.set('toDate', params.toDate);
    if (params?.type) query.set('type', params.type);
    if (params?.financialYearId != null) query.set('financialYearId', String(params.financialYearId));
    if (params?.limit != null) query.set('limit', String(params.limit));
    if (params?.offset != null) query.set('offset', String(params.offset));
    const suffix = query.toString() ? `?${query}` : '';
    return request<
      Paginated<Voucher> & {
        totals: {
          totalAmount: number;
          byType: {
            PAYMENT: number;
            RECEIPT: number;
            JOURNAL: number;
            KACHI: number;
            PURCHASE_MAAL: number;
          };
        };
      }
    >(`/api/accounting/vouchers${suffix}`);
  },

  verifyDatabaseIntegrity() {
    return request<{ ok: boolean; results: string[] }>('/api/system/verify-database', {
      method: 'POST',
    });
  },

  backupDatabase() {
    return request<{ ok: boolean; path: string | null }>('/api/system/backup-database', {
      method: 'POST',
    });
  },

  getGoogleDriveBackupStatus() {
    return request<{
      connected: boolean;
      needsReconnect: boolean;
      lastSuccessAt: string | null;
      lastAttemptAt: string | null;
      lastError: string | null;
      oauthConfigured: boolean;
      oauthClientIdHint: string | null;
    }>('/api/system/backup-status');
  },

  getGoogleOAuthConfig() {
    return request<{ configured: boolean; clientIdHint: string | null }>(
      '/api/system/google-drive/oauth-config',
    );
  },

  saveGoogleOAuthConfig(data: { clientId: string; clientSecret: string }) {
    return request<{ configured: boolean; clientIdHint: string | null }>(
      '/api/system/google-drive/oauth-config',
      { method: 'POST', body: JSON.stringify(data) },
    );
  },

  connectGoogleDrive() {
    return request<{
      ok: boolean;
      connected: boolean;
      needsReconnect: boolean;
      lastSuccessAt: string | null;
      lastAttemptAt: string | null;
      lastError: string | null;
      oauthConfigured: boolean;
      oauthClientIdHint: string | null;
    }>('/api/system/google-drive/connect', {
      method: 'POST',
      signal: AbortSignal.timeout(6 * 60 * 1000),
    });
  },

  disconnectGoogleDrive() {
    return request<{ ok: boolean }>('/api/system/google-drive/disconnect', { method: 'POST' });
  },

  backupToGoogleDrive() {
    return request<{ ok: boolean; uploadedAt?: string; error?: string }>(
      '/api/system/google-drive/backup-now',
      { method: 'POST' },
    );
  },

  getDashboardSummary() {
    return request<{
      cashBalance: number;
      productStock: Array<{
        productId: number;
        name: string;
        code: string;
        bori: number;
        thela: number;
      }>;
      vouchersToday: number;
      recentVouchers: {
        id: number;
        number: number;
        type: string;
        amount: number;
        date: string;
        status: string;
        accountLabel: string;
      }[];
    }>('/api/accounting/dashboard-summary');
  },
  getNextVoucherNumber(type: 'PAYMENT' | 'RECEIPT' | 'JOURNAL') {
    const query = new URLSearchParams({ type });
    return request<{ number: number; financialYearId: number; type: string }>(
      `/api/accounting/vouchers/next-number?${query.toString()}`,
    );
  },
  createVoucher(data: {
    type: string;
    debitAccountId: number;
    creditAccountId: number;
    amount: number;
    date: string;
    description?: string;
    reference: string;
  }) {
    return request<Voucher>('/api/accounting/vouchers', { method: 'POST', body: JSON.stringify(data) });
  },
  updateVoucherAmount(voucherId: number, amount: number) {
    return this.updateVoucherDetails(voucherId, { amount });
  },
  updateVoucherDetails(
    voucherId: number,
    data: {
      amount?: number;
      date?: string;
      debitAccountId?: number;
      creditAccountId?: number;
      reference?: string;
      description?: string | null;
    },
  ) {
    return request<Voucher>(`/api/accounting/vouchers/${voucherId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },
  updatePendingVoucher(
    voucherId: number,
    data: {
      amount?: number;
      date?: string;
      debitAccountId?: number;
      creditAccountId?: number;
      reference?: string;
      description?: string | null;
    },
  ) {
    return request<Voucher>(`/api/accounting/vouchers/${voucherId}/pending`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },
  cancelVoucher(voucherId: number) {
    return request<Voucher>(`/api/accounting/vouchers/${voucherId}`, { method: 'DELETE' });
  },

  listAccounts() {
    return request<Account[]>('/api/accounting/accounts');
  },
  createAccount(data: {
    categoryId: number;
    name: string;
    code?: string;
    type?: Account['type'];
    openingBalance?: number;
    openingBalanceSide?: 'DR' | 'CR';
    phone?: string | null;
    address?: string | null;
    cnic?: string | null;
  }) {
    return request<Account>('/api/accounting/accounts', { method: 'POST', body: JSON.stringify(data) });
  },
  updateAccount(id: number, data: {
    name?: string;
    code?: string;
    isActive?: boolean;
    phone?: string | null;
    address?: string | null;
    cnic?: string | null;
  }) {
    return request<Account>(`/api/accounting/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  },
  removeAccount(id: number) {
    return request<Account>(`/api/accounting/accounts/${id}`, { method: 'DELETE' });
  },

  getLedger(accountId: number, params?: {
    fromDate?: string;
    toDate?: string;
    financialYearId?: number;
    limit?: number;
    offset?: number;
  }) {
    const queryParams = new URLSearchParams();
    if (params?.fromDate) queryParams.set('fromDate', params.fromDate);
    if (params?.toDate) queryParams.set('toDate', params.toDate);
    if (params?.financialYearId != null) queryParams.set('financialYearId', String(params.financialYearId));
    if (params?.limit != null) queryParams.set('limit', String(params.limit));
    if (params?.offset != null) queryParams.set('offset', String(params.offset));
    const query = queryParams.toString() ? `?${queryParams.toString()}` : '';
    return request<{
      account: { id: number; name: string; code: string; type: string };
      balance: number;
      rows: {
        date: string;
        voucherNo: string;
        ref: string | null;
        type: string;
        description: string;
        debit: number;
        credit: number;
        balance: number;
        isOpeningRow?: boolean;
      }[];
      total: number;
      limit: number;
      offset: number;
      summary: { periodOpening: number; totalDebit: number; totalCredit: number; closingBalance: number };
    }>(`/api/accounting/ledger/${accountId}${query}`);
  },

  listFinancialYears() {
    return request<FinancialYear[]>('/api/accounting/financial-years');
  },
  getActiveFinancialYear() {
    return request<Pick<FinancialYear, 'id' | 'label' | 'startDate' | 'endDate' | 'status'>>(
      '/api/accounting/financial-years/active',
    );
  },
  closeFinancialYear(data: { confirm: true; password: string }) {
    return request<{
      closedYear: FinancialYear;
      newYear: FinancialYear;
      snapshot: {
        closedLabel: string;
        accountCount: number;
        totalDebit: number;
        totalCredit: number;
        closedAt: string | null;
        endDate: string | null;
      };
    }>('/api/accounting/financial-year/close', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getTrialBalance(params?: {
    financialYearId?: number;
    limit?: number;
    offset?: number;
  }) {
    const query = new URLSearchParams();
    if (params?.financialYearId != null) query.set('financialYearId', String(params.financialYearId));
    if (params?.limit != null) query.set('limit', String(params.limit));
    if (params?.offset != null) query.set('offset', String(params.offset));
    const suffix = query.toString() ? `?${query}` : '';
    return request<{
      accounts: {
        accountId: number;
        accountCode: string;
        accountName: string;
        accountType: string;
        categoryId: number;
        categoryName: string;
        balance: number;
        debit: number;
        credit: number;
      }[];
      groups: {
        categoryId: number;
        categoryName: string;
        accounts: {
          accountId: number;
          accountCode: string;
          accountName: string;
          accountType: string;
          categoryId: number;
          categoryName: string;
          balance: number;
          debit: number;
          credit: number;
        }[];
      }[];
      totalDebit: number;
      totalCredit: number;
      isBalanced: boolean;
      financialYearId?: number;
      financialYearLabel?: string;
      total: number;
      limit: number;
      offset: number;
      pageCount: number;
    }>(`/api/accounting/trial-balance${suffix}`);
  },

  getAccountBalanceReport(params: {
    date: string;
    categoryId?: number;
    side?: 'debit' | 'credit' | 'both';
    financialYearId?: number;
    limit?: number;
    offset?: number;
  }) {
    const query = new URLSearchParams({ date: params.date, side: params.side ?? 'both' });
    if (params.categoryId != null) query.set('categoryId', String(params.categoryId));
    if (params.financialYearId != null) query.set('financialYearId', String(params.financialYearId));
    if (params.limit != null) query.set('limit', String(params.limit));
    if (params.offset != null) query.set('offset', String(params.offset));
    return request<{
      date: string;
      side: 'debit' | 'credit' | 'both';
      categoryId: number | null;
      accounts: {
        accountId: number;
        accountCode: string;
        accountName: string;
        categoryId: number;
        categoryName: string;
        balance: number;
        debit: number;
        credit: number;
      }[];
      groups: {
        categoryId: number;
        categoryName: string;
        accounts: {
          accountId: number;
          accountCode: string;
          accountName: string;
          categoryId: number;
          categoryName: string;
          balance: number;
          debit: number;
          credit: number;
        }[];
      }[];
      totalDebit: number;
      totalCredit: number;
      grandBalance: number;
      total: number;
      limit: number;
      offset: number;
      pageCount: number;
    }>(`/api/accounting/reports/account-balance?${query.toString()}`);
  },

  getEmptyBardana() {
    return request<{
      balances: Array<{ bagType: 'BORI' | 'THELA'; balance: number }>;
      movements: Array<{
        id: number;
        date: string;
        bagType: 'BORI' | 'THELA';
        direction: 'IN' | 'OUT';
        qty: number;
        source: string;
        description: string | null;
        invoiceId: number | null;
      }>;
    }>('/api/inventory/bardana');
  },
  addEmptyBardana(data: { bagType: 'BORI' | 'THELA'; quantity: number }) {
    return request<{
      balances: Array<{ bagType: 'BORI' | 'THELA'; balance: number }>;
      movements: Array<{
        id: number;
        date: string;
        bagType: 'BORI' | 'THELA';
        direction: 'IN' | 'OUT';
        qty: number;
        source: string;
        description: string | null;
        invoiceId: number | null;
      }>;
    }>('/api/inventory/bardana/add', { method: 'POST', body: JSON.stringify(data) });
  },

  getStockReport(params: {
    productId: number;
    bagType: 'BORI' | 'THELA';
    limit?: number;
    offset?: number;
  }) {
    const query = new URLSearchParams({
      productId: String(params.productId),
      bagType: params.bagType,
    });
    if (params.limit != null) query.set('limit', String(params.limit));
    if (params.offset != null) query.set('offset', String(params.offset));
    return request<{
      product: {
        id: number;
        name: string;
        code: string;
        stockMode?: 'GRAIN_BAGS' | 'QUANTITY';
        unit?: string | null;
      };
      bagType: 'BORI' | 'THELA' | null;
      stockMode?: 'GRAIN_BAGS' | 'QUANTITY';
      trackingStartedAt: string;
      historicalBackfill: false;
      carriedRemainderKg: number;
      rows: Array<{
        id: number;
        date: string;
        description: string;
        invoiceReference: string;
        invoiceType: string;
        status: 'IN' | 'OUT';
        bags: number;
        quantity?: number;
        runningBalance: number;
      }>;
      total: number;
      limit: number;
      offset: number;
      totals: { totalIn: number; totalOut: number; netBalance: number };
    }>(`/api/stock/report?${query.toString()}`);
  },

  getDailyReport(params: {
    date: string;
    filterKey?: string;
    limit?: number;
    offset?: number;
  }) {
    const query = new URLSearchParams({ date: params.date });
    if (params.filterKey && params.filterKey !== 'all') query.set('filterKey', params.filterKey);
    if (params.limit != null) query.set('limit', String(params.limit));
    if (params.offset != null) query.set('offset', String(params.offset));
    return request<{
      date: string;
      rows: Array<{
        kind: 'voucher' | 'invoice';
        id: number;
        filterKey:
          | 'PAYMENT'
          | 'RECEIPT'
          | 'JOURNAL'
          | 'KACHI_MAAL'
          | 'PURCHASE_MAAL'
          | 'SALE_PAUNCH'
          | 'SALE_COMMISSION'
          | 'PURCHASE_GENERAL'
          | 'SALE_GENERAL'
          | 'GENERAL_TRADE';
        typeLabel: string;
        reference: string;
        amount: number;
        date: string;
        debitAccount: { name: string; code: string } | null;
        creditAccount: { name: string; code: string } | null;
        voucherType?: string;
        voucherNumber?: number;
        invoiceType?: string;
        invoiceNumber?: number;
        invoiceReference?: string;
      }>;
      totals: { count: number; amount: number };
      filteredTotals: { count: number; amount: number };
      kindCounts: Partial<Record<string, number>>;
      total: number;
      limit: number;
      offset: number;
    }>(`/api/reports/daily?${query.toString()}`);
  },

  getSalePurchaseReport(params: {
    mode: 'SALE' | 'PURCHASE';
    typeFilter: 'ALL' | 'COMMISSION' | 'PAUNCH' | 'MAAL';
    fromDate: string;
    toDate: string;
    partyAccountId?: number | null;
    productId?: number | null;
    limit?: number;
    offset?: number;
  }) {
    const query = new URLSearchParams({
      mode: params.mode,
      typeFilter: params.typeFilter,
      fromDate: params.fromDate,
      toDate: params.toDate,
    });
    if (params.partyAccountId) query.set('partyAccountId', String(params.partyAccountId));
    if (params.productId) query.set('productId', String(params.productId));
    if (params.limit != null) query.set('limit', String(params.limit));
    if (params.offset != null) query.set('offset', String(params.offset));
    return request<{
      mode: 'SALE' | 'PURCHASE';
      typeFilter: 'ALL' | 'COMMISSION' | 'PAUNCH' | 'MAAL';
      fromDate: string;
      toDate: string;
      title: string;
      rowCount: number;
      total: number;
      limit: number;
      offset: number;
      categories: Array<{
        category: 'COMMISSION' | 'PAUNCH' | 'MAAL';
        label: string;
        parties: Array<{
          partyAccountId: number;
          partyName: string;
          rows: Array<{
            invoiceId: number;
            invoiceReference: string;
            invoiceNumber: string;
            date: string;
            category: 'COMMISSION' | 'PAUNCH' | 'MAAL';
            partyAccountId: number;
            partyName: string;
            product: string;
            thela: number;
            bori: number;
            weight: number;
            totalPrice: number;
            netBill: number;
          }>;
          subtotal: {
            thela: number;
            bori: number;
            weight: number;
            totalPrice: number;
            netBill: number;
          };
        }>;
        subtotal: {
          thela: number;
          bori: number;
          weight: number;
          totalPrice: number;
          netBill: number;
        };
      }>;
      grandTotal: {
        thela: number;
        bori: number;
        weight: number;
        totalPrice: number;
        netBill: number;
      };
    }>(`/api/reports/sale-purchase?${query.toString()}`);
  },

  listPendingApprovals() {
    return request<PendingApprovalItem[]>('/api/approvals/pending');
  },
  getPendingApprovalDetail(kind: ApprovalKind, id: number) {
    return request<PendingApprovalDetail>(`/api/approvals/${kind}/${id}`);
  },
  patchPendingApproval(kind: ApprovalKind, id: number, data: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/api/approvals/${kind}/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },
  approvePendingRecord(kind: ApprovalKind, id: number) {
    return request<{ ok: boolean; record: Record<string, unknown> }>(
      `/api/approvals/${kind}/${id}/approve`,
      { method: 'POST' },
    );
  },
  rejectPendingRecord(kind: ApprovalKind, id: number) {
    return request<{ ok: boolean; record: Record<string, unknown> }>(
      `/api/approvals/${kind}/${id}/reject`,
      { method: 'POST' },
    );
  },

  createAccountAdjustment(data: {
    accountId: number;
    amount: number;
    side: 'DR' | 'CR';
    adjustmentDate: string;
    notes?: string;
  }) {
    return request<Record<string, unknown>>('/api/adjustments/account', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  createStockAdjustment(data: {
    productId: number;
    bagType: 'BORI' | 'THELA';
    direction: 'IN' | 'OUT';
    bags: number;
    amount: number;
    adjustmentDate: string;
    notes?: string;
  }) {
    return request<Record<string, unknown>>('/api/adjustments/stock', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  listReminders(status: 'PENDING' | 'SETTLED' | 'ALL' = 'PENDING') {
    const query = new URLSearchParams({ status });
    return request<Reminder[]>(`/api/reminders?${query.toString()}`);
  },
  createReminder(data: {
    accountId: number;
    amount: number;
    reminderAt: string;
    note?: string | null;
  }) {
    return request<Reminder>('/api/reminders', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  settleReminder(id: number) {
    return request<Reminder>(`/api/reminders/${id}/settle`, { method: 'POST' });
  },
  recordReminderNotification(id: number, data?: { notifyCount?: number }) {
    return request<Reminder>(`/api/reminders/${id}/notify`, {
      method: 'POST',
      body: JSON.stringify(data ?? {}),
    });
  },

  listSchedules() {
    return request<ScheduledVoucher[]>('/api/schedules');
  },
  createSchedule(data: {
    voucherType: 'PAYMENT' | 'RECEIPT' | 'JOURNAL';
    debitAccountId: number;
    creditAccountId: number;
    amount: number;
    description?: string | null;
    frequency: ScheduleFrequency;
    startAt: string;
    endAt?: string | null;
    occurrenceLimit?: number | null;
  }) {
    return request<ScheduledVoucher>('/api/schedules', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  updateSchedule(
    id: number,
    data: Partial<{
      voucherType: 'PAYMENT' | 'RECEIPT' | 'JOURNAL';
      debitAccountId: number;
      creditAccountId: number;
      amount: number;
      description: string | null;
      frequency: ScheduleFrequency;
      startAt: string;
      endAt: string | null;
      occurrenceLimit: number | null;
      resetNextRun: boolean;
    }>,
  ) {
    return request<ScheduledVoucher>(`/api/schedules/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },
  pauseSchedule(id: number) {
    return request<ScheduledVoucher>(`/api/schedules/${id}/pause`, { method: 'POST' });
  },
  resumeSchedule(id: number) {
    return request<ScheduledVoucher>(`/api/schedules/${id}/resume`, { method: 'POST' });
  },
  deleteSchedule(id: number) {
    return request<ScheduledVoucher>(`/api/schedules/${id}`, { method: 'DELETE' });
  },
};
