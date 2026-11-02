// Card attachment for a post. Order: render SVG -> PNG -> upload -> media id.
// Every step is optional by design: any failure returns { ok:false, reason } and
// the caller posts the text without the card. A missing media.write scope (the
// current token) is the expected case until the token is re-minted.

import { renderPng } from './card.mjs';
import { scopeAllowsMedia, uploadMedia } from './xapi.mjs';

export async function attachCard({
  accessToken,
  scope = null,
  svg,
  fetchImpl = globalThis.fetch,
  timeoutMs = 30000,
} = {}) {
  if (typeof svg !== 'string' || svg === '') return { ok: false, reason: 'no-card' };
  if (!accessToken) return { ok: false, reason: 'token' };
  if (scope != null && !scopeAllowsMedia(scope)) return { ok: false, reason: 'scope' };

  let png;
  try {
    png = await renderPng(svg);
  } catch (e) {
    return { ok: false, reason: 'render', detail: e && e.message ? e.message : String(e) };
  }
  if (!png || png.length === 0) return { ok: false, reason: 'render' };

  return uploadMedia({ accessToken, buffer: png, mimeType: 'image/png', fetchImpl, timeoutMs });
}
