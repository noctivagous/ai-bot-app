// @vitest-environment jsdom
// TopStrip behaviour tests (real DOM via jsdom):
//  R4 — the connection popover: focus enters on open (close button),
//    Escape closes it, and focus returns to the lamp-cluster.

// The adapter store is never started here, so the strip renders its
// unconfigured snapshot — enough for the dialog/search mechanics.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TopStrip } from './TopStrip';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let query = '';
let onQuery: (q: string) => void;

function renderTopStrip(): void {
  act(() => {
    root.render(createElement(TopStrip, { query, onQuery }));
  });
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}

function keydown(target: Document | HTMLElement, init: KeyboardEventInit): void {
  act(() => {
    target.dispatchEvent(new window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
  });
}

beforeEach(() => {
  query = '';
  onQuery = (q: string) => {
    query = q;
    renderTopStrip();
  };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  renderTopStrip();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const cluster = () => container.querySelector<HTMLButtonElement>('[data-testid="lamp-cluster"]')!;
const popover = () => container.querySelector('.popover');
const searchInput = () => container.querySelector<HTMLInputElement>('input[aria-label="Search conversations"]')!;

describe('TopStrip — R4 connection popover dialog behaviour', () => {
  it('moves focus into the popover on open, and Escape closes it and returns focus to the cluster', () => {
    act(() => cluster().click());
    expect(popover()).not.toBeNull();
    const closeBtn = container.querySelector<HTMLButtonElement>('button[aria-label="Close connection panel"]')!;
    expect(document.activeElement).toBe(closeBtn);

    keydown(document, { key: 'Escape' });
    expect(popover()).toBeNull();
    expect(document.activeElement).toBe(cluster());
  });

  it('returns focus to the cluster after an outside-click close too', () => {
    act(() => cluster().click());
    expect(popover()).not.toBeNull();
    act(() => {
      document.body.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    });
    expect(popover()).toBeNull();
    expect(document.activeElement).toBe(cluster());
  });
});

describe('TopStrip — R6 search well', () => {
  it('⌘K and Ctrl+K focus the search input from anywhere', () => {
    keydown(document, { key: 'k', metaKey: true });
    expect(document.activeElement).toBe(searchInput());
    act(() => searchInput().blur());
    keydown(document, { key: 'k', ctrlKey: true });
    expect(document.activeElement).toBe(searchInput());
  });

  it('clear button exists only with a query, and clears it', () => {
    expect(container.querySelector('[data-testid="search-clear"]')).toBeNull();
    setInputValue(searchInput(), 'nib');
    expect(query).toBe('nib');
    const clear = container.querySelector<HTMLButtonElement>('[data-testid="search-clear"]')!;
    expect(clear).not.toBeNull();
    act(() => clear.click());
    expect(query).toBe('');
    expect(container.querySelector('[data-testid="search-clear"]')).toBeNull();
  });

  it('Escape while the input is focused clears the query', () => {
    setInputValue(searchInput(), 'ansci');
    expect(query).toBe('ansci');
    keydown(searchInput(), { key: 'Escape' });
    expect(query).toBe('');
  });

});
