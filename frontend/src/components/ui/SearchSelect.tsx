import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { moveFocusInContainer } from '../../hooks/useFocusTrap';
import { filterOptions, resolveSelection } from './searchSelectUtils';

export type SearchSelectOption = { value: string; label: string };

export function SearchSelect({
  value,
  onChange,
  options,
  placeholder = 'Search…',
  disabled,
  tabIndex,
  id: idProp,
  inputRef: inputRefProp,
  nextFocusRef,
  onSelected,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SearchSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  tabIndex?: number;
  id?: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  /** Used for Enter / click advance only. Tab / Shift+Tab use the shared focus list. */
  nextFocusRef?: RefObject<HTMLElement | null>;
  onSelected?: (value: string) => void;
}) {
  const generatedId = useId();
  const inputId = idProp ?? `search-select-${generatedId}`;
  const listboxId = `${inputId}-listbox`;

  const internalInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(false);

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [highlightMovedByKeyboard, setHighlightMovedByKeyboard] = useState(false);

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  const filtered = useMemo(
    () => filterOptions(options, debouncedQuery),
    [options, debouncedQuery],
  );

  const filteredKey = filtered.map((o) => o.value).join('\0');

  useEffect(() => {
    setHighlightIndex(0);
    setHighlightMovedByKeyboard(false);
  }, [filteredKey, open]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const active = listRef.current.querySelector('[data-active="true"]');
    active?.scrollIntoView({ block: 'nearest' });
  }, [highlightIndex, open, filteredKey]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      const root = internalInputRef.current?.closest('[data-search-select-root]');
      if (root && !root.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  // Capture-phase Escape so the form focus trap never sees "close dropdown" as "leave form".
  useEffect(() => {
    const input = internalInputRef.current;
    if (!input) return;

    function onKeyDownCapture(e: globalThis.KeyboardEvent) {
      if (e.key !== 'Escape' || !openRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      setQuery('');
    }

    input.addEventListener('keydown', onKeyDownCapture, true);
    return () => input.removeEventListener('keydown', onKeyDownCapture, true);
  }, []);

  function assignInputRef(el: HTMLInputElement | null) {
    internalInputRef.current = el;
    if (inputRefProp) {
      (inputRefProp as { current: HTMLInputElement | null }).current = el;
    }
  }

  function focusTrapContainer(): HTMLElement | null {
    const input = internalInputRef.current;
    if (!input) return null;
    return (
      input.closest<HTMLElement>('[data-focus-trap]') ??
      input.form ??
      input.closest<HTMLElement>('form')
    );
  }

  function advanceAfterCommit(direction: 1 | -1 | 'next-ref') {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (direction === 'next-ref') {
          if (nextFocusRef?.current) {
            nextFocusRef.current.focus();
            return;
          }
        }
        const container = focusTrapContainer();
        const input = internalInputRef.current;
        if (container && input) {
          moveFocusInContainer(
            container,
            input,
            direction === 'next-ref' ? 1 : direction,
          );
          return;
        }
        if (direction === 'next-ref' || direction === 1) {
          nextFocusRef?.current?.focus();
        }
      });
    });
  }

  function commitSelection(option: SearchSelectOption, advance: false | 1 | -1 | 'next-ref') {
    onChange(option.value);
    onSelected?.(option.value);
    setOpen(false);
    setQuery('');
    if (advance !== false) {
      advanceAfterCommit(advance);
    }
  }

  function closeWithoutChange() {
    setOpen(false);
    setQuery('');
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (disabled) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true);
      if (filtered.length === 0) return;
      setHighlightMovedByKeyboard(true);
      setHighlightIndex((i) => Math.min(i + 1, filtered.length - 1));
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) setOpen(true);
      if (filtered.length === 0) return;
      setHighlightMovedByKeyboard(true);
      setHighlightIndex((i) => Math.max(i - 1, 0));
      return;
    }

    if (e.key === 'Escape') {
      // Capture listener handles open case; closed Escape bubbles to the form trap.
      if (!open) return;
      e.preventDefault();
      e.stopPropagation();
      closeWithoutChange();
      return;
    }

    if (e.key === 'Enter') {
      if (!open) return;
      e.preventDefault();
      const option = resolveSelection(filtered, highlightIndex, highlightMovedByKeyboard, 'enter');
      if (option) commitSelection(option, 'next-ref');
      return;
    }

    if (e.key === 'Tab') {
      if (!open) return;
      // Own focus movement so Shift+Tab goes backward; do not use nextFocusRef here.
      e.preventDefault();
      const direction: 1 | -1 = e.shiftKey ? -1 : 1;
      const option = resolveSelection(filtered, highlightIndex, highlightMovedByKeyboard, 'tab');
      if (option) {
        commitSelection(option, direction);
      } else {
        closeWithoutChange();
        advanceAfterCommit(direction);
      }
    }
  }

  const activeOptionId =
    open && filtered.length > 0 ? `${listboxId}-option-${highlightIndex}` : undefined;

  return (
    <div data-search-select-root className={`relative ${open ? 'z-[200]' : 'z-0'}`}>
      <input
        ref={assignInputRef}
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={activeOptionId}
        aria-autocomplete="list"
        autoComplete="off"
        disabled={disabled}
        tabIndex={tabIndex}
        value={open ? query : selected?.label ?? ''}
        onFocus={() => {
          setOpen(true);
          setQuery('');
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="app-input disabled:cursor-not-allowed disabled:bg-surface1"
      />
      {open ? (
        <div
          ref={listRef}
          id={listboxId}
          role="listbox"
          className="app-combobox-dropdown absolute left-0 top-full z-[201] mt-1 max-h-60 w-full overflow-y-auto"
        >
          {filtered.length === 0 ? (
            <p className="bg-white px-3 py-2 text-sm text-textMuted" role="status">
              No matches
            </p>
          ) : (
            filtered.map((o, index) => {
              const isHighlighted = index === highlightIndex;
              const isSelected = o.value === value;
              return (
                <div
                  key={o.value}
                  id={`${listboxId}-option-${index}`}
                  role="option"
                  aria-selected={isSelected}
                  data-active={isHighlighted ? 'true' : 'false'}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setHighlightIndex(index)}
                  onClick={() => commitSelection(o, nextFocusRef ? 'next-ref' : false)}
                  className={`cursor-pointer px-3 py-2 text-sm ${
                    isHighlighted || isSelected
                      ? 'bg-bgAccent font-medium text-textAccent'
                      : 'bg-white text-textPrimary hover:bg-bgAccent'
                  }`}
                >
                  {o.label}
                </div>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
