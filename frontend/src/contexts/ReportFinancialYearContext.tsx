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
  /** True when viewing a locked closed year from the Financial Year hub. */
  locked: boolean;
  /** True when report screens must not offer mutate actions (cancel/edit). */
  readOnly: boolean;
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
      locked: false,
      readOnly: false,
    }),
    [years, financialYearId, setFinancialYearId, financialYearIdNum, selectedYear, loading],
  );

  return (
    <ReportFinancialYearContext.Provider value={value}>{children}</ReportFinancialYearContext.Provider>
  );
}

/**
 * Nested under /reports/financial-year/:id — locks reports to one CLOSED year
 * and marks the session read-only (no cancel/edit/post from report screens).
 */
export function LockedClosedYearProvider({
  financialYearId: yearIdParam,
  children,
}: {
  financialYearId: string;
  children: ReactNode;
}) {
  const [year, setYear] = useState<FinancialYear | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    api
      .listFinancialYears()
      .then((rows) => {
        if (cancelled) return;
        const match = rows.find((y) => String(y.id) === yearIdParam);
        if (!match) {
          setYear(null);
          setError('Financial year not found');
          return;
        }
        if (match.status !== 'CLOSED') {
          setYear(null);
          setError('Only closed financial years can be viewed here');
          return;
        }
        setYear(match);
      })
      .catch((err) => {
        if (cancelled) return;
        setYear(null);
        setError(err instanceof Error ? err.message : 'Failed to load financial year');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [yearIdParam]);

  const value = useMemo<ReportFinancialYearContextValue>(
    () => ({
      years: year ? [year] : [],
      financialYearId: year ? String(year.id) : '',
      setFinancialYearId: () => {},
      financialYearIdNum: year?.id,
      selectedYear: year,
      loading,
      locked: true,
      readOnly: true,
    }),
    [year, loading],
  );

  if (loading) {
    return (
      <div className="app-page p-6 text-sm text-textMuted">Loading financial year…</div>
    );
  }

  if (error || !year) {
    return (
      <div className="app-page p-6 text-sm text-danger">
        {error || 'Financial year not available'}
      </div>
    );
  }

  return (
    <ReportFinancialYearContext.Provider value={value}>{children}</ReportFinancialYearContext.Provider>
  );
}

/** Shared Financial Year selection for Reports (active by default; locked in closed-year hub). */
export function useReportFinancialYear() {
  const ctx = useContext(ReportFinancialYearContext);
  if (!ctx) {
    throw new Error('useReportFinancialYear must be used within ReportFinancialYearProvider');
  }
  return ctx;
}
