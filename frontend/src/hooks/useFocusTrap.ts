import { useEffect, useState, type RefObject } from 'react';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function isFocusableCandidate(el: HTMLElement, container: HTMLElement): boolean {
  if (!container.contains(el)) return false;
  if (el.getAttribute('role') === 'option') return false;
  if (el.closest('[role="listbox"]')) return false;
  if (el.closest('[data-date-field-calendar]')) return false;
  if (el.tabIndex < 0) return false;
  if (el.hasAttribute('disabled')) return false;
  const style = window.getComputedStyle(el);
  if (style.visibility === 'hidden' || style.display === 'none') return false;
  return true;
}

export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const nodes = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => isFocusableCandidate(el, container),
  );

  return nodes.sort((a, b) => {
    const order = (el: HTMLElement) => (el.tabIndex > 0 ? el.tabIndex : 1000);
    const diff = order(a) - order(b);
    if (diff !== 0) return diff;
    if (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    return 1;
  });
}

export function indexOfFocusable(
  focusables: HTMLElement[],
  active: Element | null,
): number {
  if (!active || !(active instanceof HTMLElement)) return -1;
  const direct = focusables.indexOf(active);
  if (direct >= 0) return direct;
  return focusables.findIndex((el) => el.contains(active));
}

/** Move ±1 through the container's focusable list (wraps). Shared by the trap and SearchSelect. */
export function moveFocusInContainer(
  container: HTMLElement,
  active: Element | null,
  direction: 1 | -1,
): void {
  const focusables = getFocusableElements(container);
  if (focusables.length === 0) return;
  const index = indexOfFocusable(focusables, active);
  let nextIndex: number;
  if (index === -1) {
    nextIndex = direction === 1 ? 0 : focusables.length - 1;
  } else {
    nextIndex = (index + direction + focusables.length) % focusables.length;
  }
  focusables[nextIndex]?.focus();
}

function hasOpenCombobox(container: HTMLElement): boolean {
  return Boolean(container.querySelector('[role="combobox"][aria-expanded="true"]'));
}

function hasOpenDateCalendar(container: HTMLElement): boolean {
  return Boolean(container.querySelector('[data-date-field-calendar]'));
}

type UseFocusTrapOptions = {
  /** Focus target when Escape releases the trap (e.g. page title). */
  escapeFocusRef?: RefObject<HTMLElement | null>;
  /** Initial focus target; defaults to first focusable in container. */
  initialFocusRef?: RefObject<HTMLElement | null>;
};

export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  options: UseFocusTrapOptions = {},
) {
  const [trapped, setTrapped] = useState(true);

  useEffect(() => {
    const el = containerRef.current;
    if (!trapped || !el) return;
    const container: HTMLElement = el;

    container.setAttribute('data-focus-trap', 'true');

    requestAnimationFrame(() => {
      if (options.initialFocusRef?.current) {
        options.initialFocusRef.current.focus();
        return;
      }
      getFocusableElements(container)[0]?.focus();
    });

    function handleKeyDown(e: KeyboardEvent) {
      if (!trapped) return;

      if (e.key === 'Escape') {
        // Open overlays handle Escape themselves (and stopPropagation). Do not release the form trap.
        if (hasOpenCombobox(container) || hasOpenDateCalendar(container)) return;
        e.preventDefault();
        setTrapped(false);
        requestAnimationFrame(() => {
          options.escapeFocusRef?.current?.focus();
        });
        return;
      }

      if (e.key !== 'Tab') return;

      // Let SearchSelect / DateField finish commit + move focus while their overlay is open.
      if (hasOpenCombobox(container) || hasOpenDateCalendar(container)) return;

      e.preventDefault();
      moveFocusInContainer(container, document.activeElement, e.shiftKey ? -1 : 1);
    }

    container.addEventListener('keydown', handleKeyDown);
    return () => {
      container.removeEventListener('keydown', handleKeyDown);
      container.removeAttribute('data-focus-trap');
    };
  }, [trapped, containerRef, options.escapeFocusRef, options.initialFocusRef]);

  return { trapped, releaseTrap: () => setTrapped(false) };
}
