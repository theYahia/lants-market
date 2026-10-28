// site/dom-test-helper.mjs - jsdom setup for DOM builder tests (node --test).
// Not part of the build manifest: never copied to dist/.

import { JSDOM } from 'jsdom';

const GLOBALS = [
  'window',
  'document',
  'navigator',
  'CustomEvent',
  'Node',
  'HTMLElement',
  'Element',
  'HTMLTableElement',
  'SVGElement',
];

let previous = null;

// Install jsdom globals so DOM modules can be imported/run under node --test.
// Returns the jsdom instance and its window/document.
export function setupDom(html = '<!doctype html><html><body></body></html>') {
  const dom = new JSDOM(html, { url: 'https://lants.eth.limo/', pretendToBeVisual: true });
  const { window } = dom;

  previous = {};
  for (const name of GLOBALS) {
    previous[name] = globalThis[name];
    try {
      globalThis[name] = window[name];
    } catch {
      Object.defineProperty(globalThis, name, {
        value: window[name],
        configurable: true,
        writable: true,
      });
    }
  }

  return { dom, window, document: window.document };
}

// Restore the node globals captured before setupDom().
export function teardown() {
  if (!previous) return;
  for (const name of GLOBALS) {
    try {
      globalThis[name] = previous[name];
    } catch {
      Object.defineProperty(globalThis, name, {
        value: previous[name],
        configurable: true,
        writable: true,
      });
    }
    previous[name] = undefined;
  }
  previous = null;
}

// Point window.ethereum at a fake provider with a `request` method.
export function stubWallet(provider) {
  const request = typeof provider === 'function' ? provider : (args) => provider[args.method];
  if (typeof window !== 'undefined') {
    window.ethereum = { request };
  }
  return request;
}
