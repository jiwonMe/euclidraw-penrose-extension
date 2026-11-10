import { PENROSE_ASPECT_ID } from './manifest.js';
import {
  DEFAULT_HEIGHT,
  DEFAULT_WIDTH,
  PENROSE_DEFAULTS,
  readSource,
  sourceKey,
} from './defaults.js';
import { ensureRendered } from './compile.js';

const renderTokens = new Map();
const painted = new WeakMap();
const escapeXml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
const positive = (value, fallback) => Number.isFinite(value) && value > 0 ? value : fallback;

/**
 * Reads canonical transform/bounds and returns screen geometry. This is a pure
 * derivation: it never compiles, measures or writes to the document.
 */
function derive(_props, id, view) {
  const transform = view.getCanonical(id, 'core.transform') ?? {};
  const bounds = view.getCanonical(id, 'core.bounds') ?? {};
  return {
    x: finite(transform.x, 0),
    y: finite(transform.y, 0),
    width: positive(bounds.width, DEFAULT_WIDTH),
    height: positive(bounds.height, DEFAULT_HEIGHT),
    rotation: finite(transform.rotation, 0),
  };
}

function responsiveSvg(entry) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="${escapeXml(entry.viewBox)}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Penrose 다이어그램" style="display:block;overflow:visible;pointer-events:none">${entry.inner}</svg>`;
}

function loadingMarkup() {
  return '<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;box-sizing:border-box;border:1px dashed var(--alid-border-subtle, #d4d4d8);border-radius:10px;background:var(--alid-bg-muted, #fafafa);color:var(--alid-text-muted, #71717a);font:12px/1.4 var(--alid-font, system-ui, sans-serif)">Penrose 다이어그램을 계산하는 중…</div>';
}

function errorMarkup(error) {
  return `<div style="width:100%;height:100%;box-sizing:border-box;overflow:auto;padding:10px 12px;border:1px solid color-mix(in srgb, var(--alid-danger, #dc2626) 42%, transparent);border-radius:10px;background:color-mix(in srgb, var(--alid-danger, #dc2626) 7%, var(--alid-bg-surface, #ffffff));color:var(--alid-danger, #b91c1c);font:11px/1.45 var(--alid-font-mono, ui-monospace, monospace);white-space:pre-wrap"><strong style="display:block;margin-bottom:4px;font:600 12px/1.3 var(--alid-font, system-ui, sans-serif)">Penrose 오류</strong>${escapeXml(error)}</div>`;
}

function renderDom(content, props, geometry, entityId) {
  if (!content) return;
  const id = entityId ?? 'anonymous';
  const token = (renderTokens.get(id) ?? 0) + 1;
  renderTokens.set(id, token);
  const source = readSource(props);
  const paint = entry => {
    if (renderTokens.get(id) !== token) return;
    // Moving or resizing an island re-runs renderDom with unchanged source. Keep the
    // mounted SVG and only replace markup when source, status or viewBox changes.
    const signature = `${sourceKey(source)}\u0000${entry.status}\u0000${entry.viewBox ?? ''}\u0000${entry.error ?? ''}`;
    if (painted.get(content) === signature && content.firstChild) return;
    if (entry.status === 'ready') content.innerHTML = responsiveSvg(entry);
    else if (entry.status === 'error') content.innerHTML = errorMarkup(entry.error ?? 'Penrose 오류');
    else content.innerHTML = loadingMarkup();
    painted.set(content, signature);
  };
  const entry = ensureRendered(source, id);
  paint(entry);
  if (entry.status === 'pending') entry.promise.then(paint);
  return () => {
    renderTokens.set(id, token + 1);
  };
}

function placeholderSvg(error, geometry) {
  const { width, height, rotation } = geometry;
  const cx = width / 2;
  const message = error ? 'Penrose 오류' : 'Penrose 다이어그램';
  const detail = error ? String(error).slice(0, 240) : '미리보기를 준비하는 중';
  return `<g transform="translate(${geometry.x},${geometry.y}) rotate(${rotation * 180 / Math.PI},${cx},${height / 2})"><rect x="0" y="0" width="${width}" height="${height}" rx="10" fill="var(--alid-bg-muted, #fafafa)" stroke="var(--alid-border-subtle, #d4d4d8)" stroke-dasharray="4 4"/><text x="${cx}" y="${height / 2 - 6}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="13" font-weight="600" fill="var(--alid-text-secondary, #52525b)">${escapeXml(message)}</text><text x="${cx}" y="${height / 2 + 14}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="11" fill="var(--alid-text-muted, #71717a)">${escapeXml(detail)}</text></g>`;
}

function renderSvg(props, geometry, entityId) {
  if (!geometry) return { svg: '' };
  const id = entityId ?? 'anonymous';
  const entry = ensureRendered(readSource(props), id);
  if (entry.status !== 'ready') return { svg: placeholderSvg(entry.status === 'error' ? entry.error : null, geometry) };
  const { x, y, width, height, rotation } = geometry;
  const transform = `translate(${x},${y}) rotate(${rotation * 180 / Math.PI},${width / 2},${height / 2})`;
  return {
    svg: `<g transform="${transform}"><svg x="0" y="0" width="${width}" height="${height}" viewBox="${escapeXml(entry.viewBox)}" preserveAspectRatio="xMidYMid meet" overflow="visible" style="pointer-events:none">${entry.inner}</svg></g>`,
  };
}

export const penroseAspect = {
  id: PENROSE_ASPECT_ID,
  label: 'Penrose 다이어그램',
  summary: 'Penrose .domain · .substance · .style 소스를 편집해 순수 벡터 다이어그램으로 렌더링합니다.',
  defaults: { ...PENROSE_DEFAULTS },
  textFields: ['domain', 'substance', 'style'],
  textSearchFields: [],
  dependsOnCanonical: [PENROSE_ASPECT_ID, 'core.transform', 'core.bounds'],
  dependsOnComputed: [],
  paintOverflow: 0,
  derive,
  renderDom,
  renderSvg,
};

export const __test__ = { derive, renderDom, renderSvg, placeholderSvg, loadingMarkup, errorMarkup };
