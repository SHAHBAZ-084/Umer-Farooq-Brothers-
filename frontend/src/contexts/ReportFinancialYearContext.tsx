import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, type FinancialYear } from '../lib/api';

const STORAGE_KEY = 'reportFinancialYearId';

type ReportFinancialYearContextValue = {
  years: FinancialYear[];
  financialYearId: string;
  setFinancialYearId: (next: string) => void;
  financialYearIdNum: number | undefined;
  selectedYear: FinancialYear | null;
  loading: boolean;
};

const ReportFinancialYearContext = createContext<ReportFinancialYearContextValue | null>(null);

function readStoredYearId(): string {
  try {
    return sessionStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function writeStoredYearId(id: string) {
  try {
    if (id) sessionStorage.setItem(STORAGE_KEY, id);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore quota / private mode
  }
}

export function ReportFinancialYearProvider({ children }: { children: ReactNode }) {
  const [years, setYears] = useState<FinancialYear[]>([]);
  const [financialYearId, setFinancialYearIdState] = useState(readStoredYearId);
  const [loading, setLoading] = useState(true);

  const setFinancialYearId = useCallback((next: string) => {
    setFinancialYearIdState(next);
    writeStoredYearId(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listFinancialYears()
      .then((rows) => {
        if (cancelled) return;
        setYears(rows);
        setFinancialYearIdState((prev) => {
          const stored = prev || readStoredYearId();
          if (stored && rows.some((y) => String(y.id) === stored)) {
            writeStoredYearId(stored);
            return stored;
          }
          const active = rows.find((y) => y.status === 'ACTIVE');
          const next = String(active?.id ?? rows[0]?.id ?? '');
          writeStoredYearId(next);
          return next;
        });
      })
      .catch(() => {
        if (cancelled) return;
        setYears([]);
        setFinancialYearIdState('');
        writeStoredYearId('');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedYear = years.find((y) => String(y.id) === financialYearId) ?? null;
  const financialYearIdNum = financialYearId ? Number(financialYearId) : undefined;

  const value = useMemo(
    () => ({
      years,
      financialYearId,
      setFinancialYearId,
      financialYearIdNum,
      selectedYear,
      loading,
    }),
    [years, financialYearId, setFinancialYearId, financialYearIdNum, selectedYear, loading],
  );

  return (
    <ReportFinancialYearContext.Provider value={value}>{children}</ReportFinancialYearContext.Provider>
  );
}

/** Shared Financial Year selection for Reports (set on hub, read on report screens). */
export function useReportFinancialYear() {
  const ctx = useContext(ReportFinancialYearContext);
  if (!ctx) {
    throw new Error('useReportFinancialYear must be used within ReportFinancialYearProvider');
  }
  return ctx;
}
