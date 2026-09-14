import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DateField } from '../../components/ui/DateField';
import {
  FieldLabel,
  LegacyTable,
  PageShell,
  Panel,
  PrimaryButton,
  SecondaryButton,
  TextInput,
} from '../../components/ui/PageShell';
import { useAuth } from '../../contexts/AuthContext';
import {
  api,
  ApiRequestError,
  type ApprovalAccountRef,
  type ApprovalKind,
  type PendingApprovalDetail,
  type PendingApprovalItem,
} from '../../lib/api';
import { formatDate, formatLedgerAmount } from '../../lib/format';
import { notifyApprovalsChanged } from '../../lib/approvals';

const KIND_LABELS: Record<ApprovalKind, string> = {
  account: 'Account',
  product: 'Product',
  voucher: 'Voucher',
  invoice: 'Invoice',
  'account-adjustment': 'Acct Adj.',
  'stock-adjustment': 'Stock Adj.',
};

const KIND_FILTERS: Array<{ value: 'all' | ApprovalKind; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'account', label: 'Accounts' },
  { value: 'product', label: 'Products' },
  { value: 'voucher', label: 'Vouchers' },
  { value: 'invoice', label: 'Invoices' },
  { value: 'account-adjustment', label: 'Acct Adj.' },
  { value: 'stock-adjustment', label: 'Stock Adj.' },
];

function rowKey(row: { kind: ApprovalKind; id: number }) {
  return `${row.kind}-${row.id}`;
}

function accountCellLabel(account: ApprovalAccountRef | null | undefined) {
  if (!account) return '—';
  return account.name;
}

function amountCell(value: number | null | undefined) {
  return value != null ? formatLedgerAmount(value) : '—';
}

function recordCreatedById(record: Record<string, unknown>): number | null {
  const id = record.createdById;
  return typeof id === 'number' ? id : null;
}

function recordString(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return '—';
}

function recordNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toDateInputValue(value: unknown): string {
  if (!value) return '';
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const INVOICE_EDIT_ROUTES: Record<string, string> = {
  PURCHASE_GENERAL: '/invoices/purchase-general',
  SALE_GENERAL: '/invoices/sale-general',
  GENERAL_TRADE: '/invoices/general-trade',
  KACHI_MAAL: '/invoices/kachi-maal',
  PURCHASE_MAAL: '/invoices/purchase-maal',
  SALE_PAUNCH: '/invoices/sale-paunch',
  SALE_COMMISSION: '/invoices/sale-commission',
};

const VOUCHER_EDIT_ROUTES: Record<string, string> = {
  PAYMENT: '/vouchers/payment',
  RECEIPT: '/vouchers/receipt',
  JOURNAL: '/vouchers/journal',
};

function ApprovalEditModal({
  detail,
  canEdit,
  onClose,
  onSaved,
}: {
  detail: PendingApprovalDetail;
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { kind, record } = detail;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [editName, setEditName] = useState('');
  const [editUnit, setEditUnit] = useState('');
  const [editObAmount, setEditObAmount] = useState('');
  const [editObSide, setEditObSide] = useState<'DR' | 'CR'>('DR');
  const [editReference, setEditReference] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editBillNo, setEditBillNo] = useState('');
  const [editGariNo, setEditGariNo] = useState('');
  const [editTafseel, setEditTafseel] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editInvoiceDate, setEditInvoiceDate] = useState('');
  const [editBags, setEditBags] = useState('');
  const [editBagType, setEditBagType] = useState<'BORI' | 'THELA'>('BORI');
  const [editDirection, setEditDirection] = useState<'IN' | 'OUT'>('IN');

  useEffect(() => {
    setError('');
    setEditName(recordString(record.name));
    setEditUnit(recordString(record.unit === null ? '' : record.unit));
    setEditObAmount(recordNumber(record.pendingOpeningBalance)?.toString() ?? '0');
    setEditObSide(record.side === 'CR' ? 'CR' : record.pendingOpeningBalanceSide === 'CR' ? 'CR' : 'DR');
    setEditReference(recordString(record.reference === null ? '' : record.reference));
    setEditDescription(recordString(record.description === null ? '' : record.description));
    setEditAmount(recordNumber(record.amount)?.toString() ?? '');
    setEditDate(toDateInputValue(record.date ?? record.voucherDate ?? record.adjustmentDate));
    setEditBillNo(recordString(record.billNo === null ? '' : record.billNo));
    setEditGariNo(recordString(record.gariNo === null ? '' : record.gariNo));
    setEditTafseel(recordString(record.tafseel === null ? '' : record.tafseel));
    setEditNotes(recordString(record.notes === null ? '' : record.notes));
    setEditInvoiceDate(toDateInputValue(record.invoiceDate));
    setEditBags(recordNumber(record.bags)?.toString() ?? '');
    setEditBagType(record.bagType === 'THELA' ? 'THELA' : 'BORI');
    setEditDirection(record.direction === 'OUT' ? 'OUT' : 'IN');
  }, [detail, record]);

  async function onSaveEdit(event: FormEvent) {
    event.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    setError('');
    try {
      const id = Number(record.id);
      if (kind === 'account') {
        await api.patchPendingApproval(kind, id, {
          name: editName.trim(),
          pendingOpeningBalance: Number(editObAmount),
          pendingOpeningBalanceSide: editObSide,
        });
      } else if (kind === 'product') {
        await api.patchPendingApproval(kind, id, {
          name: editName.trim(),
          unit: editUnit.trim(),
        });
      } else if (kind === 'voucher') {
        await api.patchPendingApproval(kind, id, {
          reference: editReference.trim(),
          description: editDescription.trim(),
          amount: Number(editAmount),
          date: editDate,
        });
      } else if (kind === 'invoice') {
        await api.patchPendingApproval(kind, id, {
          billNo: editBillNo.trim(),
          gariNo: editGariNo.trim(),
          tafseel: editTafseel.trim(),
          notes: editNotes.trim(),
          invoiceDate: editInvoiceDate,
        });
      } else if (kind === 'account-adjustment') {
        await api.patchPendingApproval(kind, id, {
          amount: Number(editAmount),
          side: editObSide,
          adjustmentDate: editDate,
          notes: editNotes.trim(),
        });
      } else if (kind === 'stock-adjustment') {
        await api.patchPendingApproval(kind, id, {
          bags: Number(editBags),
          amount: Number(editAmount),
          direction: editDirection,
          bagType: editBagType,
          adjustmentDate: editDate,
          notes: editNotes.trim(),
        });
      }
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Panel className="max-h-[90vh] w-full max-w-lg overflow-y-auto shadow-lg">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-textPrimary">
            Edit {KIND_LABELS[kind]}
          </h2>
          <SecondaryButton type="button" onClick={onClose}>
            Close
          </SecondaryButton>
        </div>

        {error ? <p className="mb-3 text-sm text-danger">{error}</p> : null}

        {!canEdit ? (
          <p className="text-sm text-textMuted">You cannot edit this record.</p>
        ) : (
          <form className="space-y-3" onSubmit={onSaveEdit}>
            {kind === 'account' ? (
              <>
                <div>
                  <FieldLabel>Name</FieldLabel>
                  <TextInput value={editName} onChange={(e) => setEditName(e.target.value)} required />
                </div>
                <div>
                  <FieldLabel>Opening balance</FieldLabel>
                  <TextInput
                    type="number"
                    min="0"
                    step="0.01"
                    value={editObAmount}
                    onChange={(e) => setEditObAmount(e.target.value)}
                  />
                </div>
                <div>
                  <FieldLabel>Balance side</FieldLabel>
                  <select
                    className="app-input"
                    value={editObSide}
                    onChange={(e) => setEditObSide(e.target.value as 'DR' | 'CR')}
                  >
                    <option value="DR">Debit (DR)</option>
                    <option value="CR">Credit (CR)</option>
                  </select>
                </div>
              </>
            ) : null}

            {kind === 'product' ? (
              <>
                <div>
                  <FieldLabel>Name</FieldLabel>
                  <TextInput value={editName} onChange={(e) => setEditName(e.target.value)} required />
                </div>
                <div>
                  <FieldLabel>Unit</FieldLabel>
                  <TextInput value={editUnit} onChange={(e) => setEditUnit(e.target.value)} />
                </div>
              </>
            ) : null}

            {kind === 'voucher' ? (
              <>
                <div>
                  <FieldLabel>Date</FieldLabel>
                  <DateField value={editDate} onChange={setEditDate} />
                </div>
                <div>
                  <FieldLabel>Amount</FieldLabel>
                  <TextInput
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <FieldLabel>Reference</FieldLabel>
                  <TextInput value={editReference} onChange={(e) => setEditReference(e.target.value)} />
                </div>
                <div>
                  <FieldLabel>Description</FieldLabel>
                  <TextInput value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
                </div>
              </>
            ) : null}

            {kind === 'invoice' ? (
              <>
                {detail.approvalDescription ? (
                  <div>
                    <FieldLabel>Summary</FieldLabel>
                    <p className="rounded-lg border border-border bg-surface1 px-3 py-2 text-sm text-textSecondary">
                      {detail.approvalDescription}
                    </p>
                  </div>
                ) : null}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <FieldLabel>Debit Account</FieldLabel>
                    <p className="rounded-lg border border-border bg-surface1 px-3 py-2 text-sm font-medium text-ledgerDebit">
                      {accountCellLabel(detail.debitAccount)}
                    </p>
                  </div>
                  <div>
                    <FieldLabel>Debit Amount</FieldLabel>
                    <p className="rounded-lg border border-border bg-surface1 px-3 py-2 text-sm tabular-nums text-ledgerDebit">
                      {amountCell(detail.debitAmount)}
                    </p>
                  </div>
                  <div>
                    <FieldLabel>Credit Account</FieldLabel>
                    <p className="rounded-lg border border-border bg-surface1 px-3 py-2 text-sm font-medium text-ledgerCredit">
                      {accountCellLabel(detail.creditAccount)}
                    </p>
                  </div>
                  <div>
                    <FieldLabel>Credit Amount</FieldLabel>
                    <p className="rounded-lg border border-border bg-surface1 px-3 py-2 text-sm tabular-nums text-ledgerCredit">
                      {amountCell(detail.creditAmount)}
                    </p>
                  </div>
                </div>
                <div>
                  <FieldLabel>Invoice date</FieldLabel>
                  <DateField
                    value={editInvoiceDate}
                    onChange={setEditInvoiceDate}
                  />
                </div>
                <div>
                  <FieldLabel>Bill no.</FieldLabel>
                  <TextInput value={editBillNo} onChange={(e) => setEditBillNo(e.target.value)} />
                </div>
                <div>
                  <FieldLabel>Gari no.</FieldLabel>
                  <TextInput value={editGariNo} onChange={(e) => setEditGariNo(e.target.value)} />
                </div>
                <div>
                  <FieldLabel>Tafseel</FieldLabel>
                  <TextInput value={editTafseel} onChange={(e) => setEditTafseel(e.target.value)} />
                </div>
                <div>
                  <FieldLabel>Notes</FieldLabel>
                  <TextInput value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
                </div>
              </>
            ) : null}

            {kind === 'account-adjustment' ? (
              <>
                <div>
                  <FieldLabel>Date</FieldLabel>
                  <DateField value={editDate} onChange={setEditDate} />
                </div>
                <div>
                  <FieldLabel>Amount</FieldLabel>
                  <TextInput
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <FieldLabel>Side</FieldLabel>
                  <select
                    className="app-input"
                    value={editObSide}
                    onChange={(e) => setEditObSide(e.target.value as 'DR' | 'CR')}
                  >
                    <option value="DR">Debit (DR)</option>
                    <option value="CR">Credit (CR)</option>
                  </select>
                </div>
                <div>
                  <FieldLabel>Notes</FieldLabel>
                  <TextInput value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
                </div>
              </>
            ) : null}

            {kind === 'stock-adjustment' ? (
              <>
                <div>
                  <FieldLabel>Bag type</FieldLabel>
                  <select
                    className="app-input"
                    value={editBagType}
                    onChange={(e) => setEditBagType(e.target.value as 'BORI' | 'THELA')}
                  >
                    <option value="BORI">Bori</option>
                    <option value="THELA">Thela</option>
                  </select>
                </div>
                <div>
                  <FieldLabel>Direction</FieldLabel>
                  <select
                    className="app-input"
                    value={editDirection}
                    onChange={(e) => setEditDirection(e.target.value as 'IN' | 'OUT')}
                  >
                    <option value="IN">IN</option>
                    <option value="OUT">OUT</option>
                  </select>
                </div>
                <div>
                  <FieldLabel>Bags</FieldLabel>
                  <TextInput
                    type="number"
                    min="0.01"
                    step="1"
                    value={editBags}
                    onChange={(e) => setEditBags(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <FieldLabel>Ledger amount</FieldLabel>
                  <TextInput
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <FieldLabel>Date</FieldLabel>
                  <DateField value={editDate} onChange={setEditDate} />
                </div>
                <div>
                  <FieldLabel>Notes</FieldLabel>
                  <TextInput value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
                </div>
              </>
            ) : null}

            <div className="flex gap-2 pt-2">
              <PrimaryButton type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </PrimaryButton>
              <SecondaryButton type="button" onClick={onClose}>
                Cancel
              </SecondaryButton>
            </div>
          </form>
        )}
      </Panel>
    </div>
  );
}

export function PendingApprovalsPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading, logout } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [items, setItems] = useState<PendingApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | ApprovalKind>('all');
  const [actingKey, setActingKey] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<{ kind: ApprovalKind; id: number } | null>(null);
  const [editDetail, setEditDetail] = useState<PendingApprovalDetail | null>(null);
  const [editLoading, setEditLoading] = useState(false);

  const handleSessionExpired = useCallback(async () => {
    setError('');
    setItems([]);
    try {
      await logout();
    } catch {
      // logout clears local session even if the API call fails
    }
  }, [logout]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await api.listPendingApprovals();
      setItems(rows);
      notifyApprovalsChanged();
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) {
        await handleSessionExpired();
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to load pending approvals');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [handleSessionExpired]);

  useEffect(() => {
    if (authLoading) return;
    void loadList();
  }, [authLoading, loadList]);

  useEffect(() => {
    if (!editTarget) {
      setEditDetail(null);
      return;
    }
    setEditLoading(true);
    void api
      .getPendingApprovalDetail(editTarget.kind, editTarget.id)
      .then(setEditDetail)
      .catch((err) => {
        if (err instanceof ApiRequestError && err.status === 401) {
          void handleSessionExpired();
          setEditTarget(null);
          return;
        }
        setEditDetail(null);
        setError(err instanceof Error ? err.message : 'Failed to load record for edit');
        setEditTarget(null);
      })
      .finally(() => setEditLoading(false));
  }, [editTarget, handleSessionExpired]);

  const filteredItems = useMemo(
    () => (kindFilter === 'all' ? items : items.filter((row) => row.kind === kindFilter)),
    [items, kindFilter],
  );

  function canEditRow(row: PendingApprovalItem) {
    return isAdmin || (row.createdBy?.id != null && row.createdBy.id === user?.id);
  }

  function onEdit(row: PendingApprovalItem) {
    const recordType = row.recordType ?? '';
    if (row.kind === 'invoice') {
      const route = INVOICE_EDIT_ROUTES[recordType];
      if (route) {
        navigate(`${route}?editInvoiceId=${row.id}`);
        return;
      }
    }
    if (row.kind === 'voucher') {
      const route = VOUCHER_EDIT_ROUTES[recordType];
      if (route) {
        navigate(`${route}?editVoucherId=${row.id}`);
        return;
      }
    }
    setEditTarget({ kind: row.kind, id: row.id });
  }

  function onViewInvoice(row: PendingApprovalItem) {
    if (row.kind !== 'invoice') return;
    navigate(`/invoices/view-invoice?id=${row.id}`);
  }

  async function onApprove(row: PendingApprovalItem) {
    const key = rowKey(row);
    setActingKey(key);
    setError('');
    try {
      await api.approvePendingRecord(row.kind, row.id);
      await loadList();
      notifyApprovalsChanged();
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) {
        await handleSessionExpired();
        return;
      }
      setError(err instanceof Error ? err.message : 'Approval failed');
    } finally {
      setActingKey(null);
    }
  }

  async function onReject(row: PendingApprovalItem) {
    if (!window.confirm('Cancel this pending record? It will not be posted.')) return;
    const key = rowKey(row);
    setActingKey(key);
    setError('');
    try {
      await api.rejectPendingRecord(row.kind, row.id);
      await loadList();
      notifyApprovalsChanged();
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) {
        await handleSessionExpired();
        return;
      }
      setError(err instanceof Error ? err.message : 'Cancel failed');
    } finally {
      setActingKey(null);
    }
  }

  const editCanSave =
    editDetail != null &&
    (isAdmin ||
      (editTarget &&
        items.find((row) => row.kind === editTarget.kind && row.id === editTarget.id)?.createdBy?.id ===
          user?.id) ||
      (editDetail && recordCreatedById(editDetail.record) === user?.id));

  if (authLoading) {
    return (
      <PageShell title="Approval" subtitle="Checking session…">
        <p className="text-sm text-textMuted">Loading…</p>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Approval"
      subtitle={
        isAdmin
          ? 'Review, edit, approve, or reject records awaiting administrator approval'
          : 'View pending records you submitted — an administrator must approve them'
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {KIND_FILTERS.map((filter) => (
          <SecondaryButton
            key={filter.value}
            type="button"
            className={kindFilter === filter.value ? 'ring-2 ring-accent' : ''}
            onClick={() => setKindFilter(filter.value)}
          >
            {filter.label}
            {filter.value === 'all'
              ? ` (${items.length})`
              : ` (${items.filter((row) => row.kind === filter.value).length})`}
          </SecondaryButton>
        ))}
        <SecondaryButton type="button" className="ml-auto" onClick={() => void loadList()}>
          Refresh
        </SecondaryButton>
      </div>

      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}

      <Panel className="p-0">
        {loading ? (
          <p className="p-4 text-sm text-textMuted">Loading…</p>
        ) : filteredItems.length === 0 ? (
          <p className="p-4 text-sm text-textMuted">No pending approvals.</p>
        ) : (
          <LegacyTable className="approvals-table border-0">
            <thead>
              <tr>
                <th>Kind</th>
                <th>Type</th>
                <th>Reference</th>
                <th>Date</th>
                <th>Debit Account</th>
                <th className="text-right">Debit Amount</th>
                <th>Credit Account</th>
                <th className="text-right">Credit Amount</th>
                <th>Creator</th>
                <th>Description</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((row) => {
                const key = rowKey(row);
                const busy = actingKey === key;
                const editable = canEditRow(row);
                const hasActions = isAdmin || editable;
                return (
                  <tr key={key}>
                    <td className="whitespace-nowrap">{KIND_LABELS[row.kind]}</td>
                    <td className="whitespace-nowrap">{row.typeLabel ?? row.recordType ?? '—'}</td>
                    <td className="whitespace-nowrap">{row.reference ?? row.label ?? '—'}</td>
                    <td className="whitespace-nowrap">
                      {row.recordDate ? formatDate(row.recordDate) : formatDate(row.createdAt)}
                    </td>
                    <td className="whitespace-nowrap font-medium text-ledgerDebit">
                      {accountCellLabel(row.debitAccount)}
                    </td>
                    <td className="whitespace-nowrap text-right tabular-nums text-ledgerDebit">
                      {amountCell(row.debitAmount)}
                    </td>
                    <td className="whitespace-nowrap font-medium text-ledgerCredit">
                      {accountCellLabel(row.creditAccount)}
                    </td>
                    <td className="whitespace-nowrap text-right tabular-nums text-ledgerCredit">
                      {amountCell(row.creditAmount)}
                    </td>
                    <td className="whitespace-nowrap">
                      {row.createdBy?.displayName ?? row.createdBy?.username ?? '—'}
                    </td>
                    <td className="max-w-[14rem] truncate" title={row.description ?? undefined}>
                      {row.description?.trim() ? row.description : '—'}
                    </td>
                    <td className="whitespace-nowrap">
                      {row.kind === 'invoice' || hasActions ? (
                        <div className="flex items-center gap-2">
                          {isAdmin ? (
                            <PrimaryButton
                              type="button"
                              className="!px-2.5 !py-1 text-xs"
                              disabled={busy}
                              onClick={() => void onApprove(row)}
                            >
                              {busy ? '…' : 'Approve'}
                            </PrimaryButton>
                          ) : null}
                          {row.kind === 'invoice' ? (
                            <button
                              type="button"
                              className="text-xs font-medium text-textPrimary hover:underline disabled:opacity-60"
                              disabled={busy}
                              onClick={() => onViewInvoice(row)}
                            >
                              View
                            </button>
                          ) : null}
                          {editable ? (
                            <button
                              type="button"
                              className="text-xs font-medium text-textPrimary hover:underline disabled:opacity-60"
                              disabled={busy || editLoading}
                              onClick={() => onEdit(row)}
                            >
                              Edit
                            </button>
                          ) : null}
                          {isAdmin ? (
                            <button
                              type="button"
                              className="text-xs font-medium text-danger hover:underline disabled:opacity-60"
                              disabled={busy}
                              onClick={() => void onReject(row)}
                            >
                              Cancel
                            </button>
                          ) : null}
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </LegacyTable>
        )}
      </Panel>

      {!isAdmin && filteredItems.some(canEditRow) ? (
        <p className="mt-3 text-sm text-textMuted">
          Click Edit on your rows to update them before an administrator approves.
        </p>
      ) : null}

      {editTarget && editDetail && !editLoading ? (
        <ApprovalEditModal
          detail={editDetail}
          canEdit={Boolean(editCanSave)}
          onClose={() => setEditTarget(null)}
          onSaved={loadList}
        />
      ) : null}
    </PageShell>
  );
}
