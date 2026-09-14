import {
  forwardRef,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent,
} from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { moveFocusInContainer } from '../../hooks/useFocusTrap';

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DISPLAY_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

export function isoToDisplay(iso: string): string {
  const m = iso.trim().match(ISO_RE);
  if (!m) return '';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function displayToIso(display: string): string | null {
  const m = display.trim().match(DISPLAY_RE);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const dt = new Date(year, month - 1, day);
  if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) {
    return null;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseIso(iso: string): Date | null {
  const m = iso.trim().match(ISO_RE);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const dt = new Date(year, month - 1, day);
  if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) {
    return null;
  }
  return dt;
}

function toIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

type DateFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange' | 'defaultValue'
> & {
  value: string;
  onChange: (value: string) => void;
};

export const DateField = forwardRef<HTMLInputElement, DateFieldProps>(function DateField(
  { value, onChange, className = '', disabled, id: idProp, onBlur, onFocus, ...rest },
  ref,
) {
  const generatedId = useId();
  const inputId = idProp ?? `date-field-${generatedId}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const openRef = useRef(false);

  const [text, setText] = useState(() => isoToDisplay(value));
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => {
    const parsed = parseIso(value) ?? new Date();
    return new Date(parsed.getFullYear(), parsed.getMonth(), 1);
  });

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    setText(isoToDisplay(value));
    const parsed = parseIso(value);
    if (parsed) {
      setViewMonth(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
    }
  }, [value]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    function onKeyDownCapture(e: globalThis.KeyboardEvent) {
      if (e.key !== 'Escape' || !openRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }

    input.addEventListener('keydown', onKeyDownCapture, true);
    return () => input.removeEventListener('keydown', onKeyDownCapture, true);
  }, []);

  function assignRef(el: HTMLInputElement | null) {
    inputRef.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) (ref as { current: HTMLInputElement | null }).current = el;
  }

  function commitText(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) {
      onChange('');
      setText('');
      return;
    }
    const iso = displayToIso(trimmed);
    if (iso) {
      onChange(iso);
      setText(isoToDisplay(iso));
      return;
    }
    setText(isoToDisplay(value));
  }

  function selectDay(date: Date) {
    const iso = toIso(date);
    onChange(iso);
    setText(isoToDisplay(iso));
    setOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  const calendarDays = useMemo(() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const first = new Date(year, month, 1);
    // Monday-first offset
    const startOffset = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: Array<{ date: Date; inMonth: boolean }> = [];
    for (let i = 0; i < startOffset; i += 1) {
      const d = new Date(year, month, -startOffset + i + 1);
      cells.push({ date: d, inMonth: false });
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push({ date: new Date(year, month, day), inMonth: true });
    }
    while (cells.length % 7 !== 0) {
      const last = cells[cells.length - 1]!.date;
      const d = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1);
      cells.push({ date: d, inMonth: false });
    }
    return cells;
  }, [viewMonth]);

  const selectedIso = value.match(ISO_RE) ? value : '';
  const todayIso = toIso(new Date());
  const monthLabel = viewMonth.toLocaleString('en-GB', { month: 'long', year: 'numeric' });

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      return;
    }
    if ((e.key === 'ArrowDown' && e.altKey) || e.key === 'F4') {
      e.preventDefault();
      setOpen((v) => !v);
      return;
    }
    if (e.key === 'Tab' && open) {
      e.preventDefault();
      commitText(e.currentTarget.value);
      setOpen(false);
      const direction: 1 | -1 = e.shiftKey ? -1 : 1;
      const input = e.currentTarget;
      requestAnimationFrame(() => {
        const container =
          input.closest<HTMLElement>('[data-focus-trap]') ??
          input.form ??
          input.closest<HTMLElement>('form');
        if (container) moveFocusInContainer(container, input, direction);
      });
    }
  }

  return (
    <div ref={rootRef} className={`relative ${open ? 'z-[200]' : 'z-0'}`} data-date-field-root>
      <div className="relative">
        <input
          {...rest}
          ref={assignRef}
          id={inputId}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          disabled={disabled}
          placeholder="dd/mm/yyyy"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => {
            commitText(e.currentTarget.value);
            onBlur?.(e);
          }}
          onFocus={onFocus}
          onKeyDown={handleKeyDown}
          className={`app-input pr-10 ${className}`.trim()}
          aria-expanded={open}
          aria-haspopup="dialog"
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-label="Open calendar"
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-textMuted hover:text-textPrimary disabled:cursor-not-allowed"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setOpen((v) => !v);
            inputRef.current?.focus();
          }}
        >
          <CalendarIcon className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>
      </div>

      {open ? (
        <div
          data-date-field-calendar
          role="dialog"
          aria-label="Choose date"
          className="app-combobox-dropdown absolute left-0 top-full z-[201] mt-1 w-[280px] p-3"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <button
              type="button"
              tabIndex={-1}
              className="rounded p-1 text-textMuted hover:bg-bgAccent hover:text-textPrimary"
              aria-label="Previous month"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() =>
                setViewMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))
              }
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={2} />
            </button>
            <p className="text-sm font-medium text-textPrimary">{monthLabel}</p>
            <button
              type="button"
              tabIndex={-1}
              className="rounded p-1 text-textMuted hover:bg-bgAccent hover:text-textPrimary"
              aria-label="Next month"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() =>
                setViewMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))
              }
            >
              <ChevronRight className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
          <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-[10px] font-semibold uppercase tracking-wide text-textMuted">
            {WEEKDAYS.map((d) => (
              <span key={d} className="py-1">
                {d}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {calendarDays.map(({ date, inMonth }) => {
              const iso = toIso(date);
              const selected = iso === selectedIso;
              const isToday = iso === todayIso;
              return (
                <button
                  key={iso + String(inMonth)}
                  type="button"
                  tabIndex={-1}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectDay(date)}
                  className={`rounded py-1.5 text-sm tabular-nums ${
                    selected
                      ? 'bg-bgAccent font-semibold text-textAccent'
                      : inMonth
                        ? 'text-textPrimary hover:bg-surface1'
                        : 'text-textMuted/50 hover:bg-surface1'
                  } ${isToday && !selected ? 'ring-1 ring-border' : ''}`}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
});

export type { DateFieldProps };