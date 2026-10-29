// site/theme.mjs - theme switcher: lANTS <-> ant.
// Self-contained: reads/writes data-theme on <html> and persists the choice
// in localStorage under "lants.theme". No network or init side effects.

export const THEMES = {
  lants: { label: 'lANTS' },
  ant: { label: 'ant' },
};

const STORAGE_KEY = 'lants.theme';

export function resolveTheme(raw) {
  return raw === 'ant' ? 'ant' : 'lants';
}

function readSavedTheme() {
  try {
    return resolveTheme(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return 'lants';
  }
}

function updateActiveIndicator(name) {
  const menu = document.getElementById('theme-menu');
  if (!menu) return;
  const options = menu.querySelectorAll('[data-theme-opt]');
  for (const opt of options) {
    const active = opt.getAttribute('data-theme-opt') === name;
    opt.setAttribute('aria-checked', active ? 'true' : 'false');
  }
}

export function applyTheme(name) {
  const theme = resolveTheme(name);
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.setAttribute('data-theme', theme);
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage unavailable (private mode / disabled): keep in-memory only.
  }
  if (typeof document !== 'undefined') {
    updateActiveIndicator(theme);
  }
  return theme;
}

function closeMenu() {
  const menu = document.getElementById('theme-menu');
  if (menu) menu.hidden = true;
  const toggle = document.getElementById('theme-toggle');
  if (toggle) toggle.setAttribute('aria-expanded', 'false');
}

function openMenu() {
  const menu = document.getElementById('theme-menu');
  if (!menu) return;
  menu.hidden = false;
  const toggle = document.getElementById('theme-toggle');
  if (toggle) toggle.setAttribute('aria-expanded', 'true');
}

export function initTheme() {
  if (typeof document === 'undefined') return;
  const toggle = document.getElementById('theme-toggle');
  if (!toggle) return;

  applyTheme(readSavedTheme());

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const menu = document.getElementById('theme-menu');
    if (!menu) return;
    if (menu.hidden) openMenu();
    else closeMenu();
  });

  const menu = document.getElementById('theme-menu');
  if (menu) {
    for (const opt of menu.querySelectorAll('[data-theme-opt]')) {
      opt.addEventListener('click', () => {
        applyTheme(opt.getAttribute('data-theme-opt'));
        closeMenu();
      });
    }
  }

  document.addEventListener('click', (e) => {
    const current = document.getElementById('theme-menu');
    if (!current || current.hidden) return;
    if (!current.contains(e.target) && e.target !== toggle) closeMenu();
  });

  document.addEventListener('keydown', (e) => {
    const current = document.getElementById('theme-menu');
    if (e.key === 'Escape' && current && !current.hidden) closeMenu();
  });
}

initTheme();
