import { describe, expect, it } from 'vitest';
import {
  getFocusableElements,
  indexOfFocusable,
  moveFocusInContainer,
} from '../hooks/useFocusTrap';
import { displayToIso, isoToDisplay } from '../components/ui/DateField';

describe('getFocusableElements', () => {
  it('excludes tabindex -1 and listbox options', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <input tabindex="1" />
      <input tabindex="-1" readonly />
      <div role="listbox"><div role="option">x</div></div>
      <button tabindex="2">Save</button>
    `;
    document.body.appendChild(container);
    const focusables = getFocusableElements(container);
    expect(focusables).toHaveLength(2);
    expect(focusables[0]?.tabIndex).toBe(1);
    expect(focusables[1]?.tabIndex).toBe(2);
    container.remove();
  });

  it('excludes date calendar popup controls from the tab list', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <input id="date" />
      <div data-date-field-calendar>
        <button type="button">15</button>
      </div>
      <button type="button">Save</button>
    `;
    document.body.appendChild(container);
    const focusables = getFocusableElements(container);
    expect(focusables.map((el) => el.id || el.textContent)).toEqual(['date', 'Save']);
    container.remove();
  });
});

describe('moveFocusInContainer', () => {
  it('cycles forward and backward including past the last field', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <input id="a" tabindex="1" />
      <input id="b" tabindex="2" />
      <button id="save" tabindex="9">Save</button>
      <button id="minimize">Minimize</button>
      <button id="close" tabindex="10">Close</button>
    `;
    document.body.appendChild(container);
    const a = container.querySelector('#a') as HTMLElement;
    const close = container.querySelector('#close') as HTMLElement;
    const minimize = container.querySelector('#minimize') as HTMLElement;

    // Voucher-like order: positive tabindex first, then Minimize (0)
    const focusables = getFocusableElements(container);
    expect(focusables.map((el) => el.id)).toEqual(['a', 'b', 'save', 'close', 'minimize']);

    minimize.focus();
    moveFocusInContainer(container, document.activeElement, 1);
    expect(document.activeElement).toBe(a);

    a.focus();
    moveFocusInContainer(container, document.activeElement, -1);
    expect(document.activeElement).toBe(minimize);

    close.focus();
    moveFocusInContainer(container, document.activeElement, 1);
    expect(document.activeElement).toBe(minimize);

    container.remove();
  });

  it('resolves activeElement when nested inside a focusable host', () => {
    const container = document.createElement('div');
    const host = document.createElement('button');
    host.id = 'host';
    const inner = document.createElement('span');
    inner.id = 'inner';
    host.appendChild(inner);
    container.appendChild(host);
    const other = document.createElement('input');
    other.id = 'other';
    container.appendChild(other);
    document.body.appendChild(container);

    expect(indexOfFocusable(getFocusableElements(container), inner)).toBe(0);
    moveFocusInContainer(container, inner, 1);
    expect(document.activeElement).toBe(other);
    container.remove();
  });
});

describe('DateField display helpers', () => {
  it('converts iso ↔ dd/mm/yyyy', () => {
    expect(isoToDisplay('2026-09-09')).toBe('09/09/2026');
    expect(displayToIso('9/9/2026')).toBe('2026-09-09');
    expect(displayToIso('31/02/2026')).toBeNull();
    expect(displayToIso('not-a-date')).toBeNull();
  });
});
