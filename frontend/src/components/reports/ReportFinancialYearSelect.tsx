import type { FinancialYear } from '../../lib/api';
import { FieldLabel } from '../ui/PageShell';
import { SearchSelect } from '../ui/SearchSelect';

export function financialYearOptionLabel(year: FinancialYear): string {
  const status = year.status === 'ACTIVE' ? 'Active' : 'Closed';
  return `${year.label} (${status})`;
}

/** Financial Year dropdown for FY-scoped report pages. */
export function ReportFinancialYearSelect({
  value,
  years,
  onChange,
  disabled,
}: {
  value: string;
  years: FinancialYear[];
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <FieldLabel>Financial year</FieldLabel>
      <SearchSelect
        value={value}
        onChange={onChange}
        disabled={disabled || years.length === 0}
        options={years.map((y) => ({
          value: String(y.id),
          label: financialYearOptionLabel(y),
        }))}
        placeholder="Select financial year…"
      />
    </div>
  );
}
