import { compile, optimize, showError, toSVG } from '@penrose/core';
import { readSource, sourceKey } from './defaults.js';

const MAX_COMPILES = 24;
const MAX_RENDERS = 48;
const MAX_ERROR_LENGTH = 6000;

/** @typedef {{status:'pending'|'ready'|'error', promise:Promise<any>, state?:any, error?:string|null, durationMs?:number}} CompileEntry */
/** @typedef {{status:'pending'|'ready'|'error', promise:Promise<any>, inner?:string, viewBox?:string, error?:string|null, durationMs?:number}} RenderEntry */

/** @type {Map<string, CompileEntry>} */
const compiles = new Map();
/** @type {Map<string, RenderEntry>} */
const renders = new Map();

function trim(map, limit) {
  for (const [key, value] of map) {
    if (map.size <= limit) break;
    if (value.status === 'pending') continue;
    map.delete(key);
  }
}

function errorText(error) {
  let text;
  try {
    text = typeof error === 'string' ? error : String(error?.message ?? error);
  } catch {
    text = '알 수 없는 오류';
  }
  if (!text || text === 'undefined') text = 'Penrose 컴파일 오류';
  return text.slice(0, MAX_ERROR_LENGTH);
}

function formatPenroseError(result) {
  try {
    return errorText(showError(result.error));
  } catch {
    return 'Penrose 소스를 해석하지 못했습니다.';
  }
}

export function estimateViewBox(style) {
  const text = typeof style === 'string' ? style : '';
  const width = Number(/\bwidth\s*=\s*([\d.]+)/.exec(text)?.[1]);
  const height = Number(/\bheight\s*=\s*([\d.]+)/.exec(text)?.[1]);
  return `0 0 ${Number.isFinite(width) && width > 0 ? width : 760} ${Number.isFinite(height) && height > 0 ? height : 560}`;
}

/** Compiles one source trio. Concurrent callers share the same promise. */
export function compileSource(source) {
  const key = sourceKey(source);
  let entry = compiles.get(key);
  if (entry) {
    // Refresh LRU position.
    compiles.delete(key);
    compiles.set(key, entry);
    return entry;
  }
  const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
  entry = { status: 'pending', promise: null, state: undefined, error: null };
  entry.promise = (async () => {
    try {
      const trio = readSource(source);
      const result = await compile({
        domain: trio.domain,
        substance: trio.substance,
        style: trio.style,
        variation: trio.variation,
      });
      if (!result.isOk()) {
        entry.status = 'error';
        entry.error = formatPenroseError(result);
        return entry;
      }
      const optimized = optimize(result.value);
      if (!optimized.isOk()) {
        entry.status = 'error';
        entry.error = formatPenroseError(optimized);
        return entry;
      }
      entry.state = optimized.value;
      entry.status = 'ready';
      entry.error = null;
    } catch (error) {
      entry.status = 'error';
      entry.error = errorText(error);
    } finally {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      entry.durationMs = Math.max(0, Math.round(now - started));
    }
    return entry;
  })();
  compiles.set(key, entry);
  trim(compiles, MAX_COMPILES);
  return entry;
}

function safeNamespace(id) {
  return `penrose-${String(id).replace(/[^A-Za-z0-9_-]/g, '-')}`;
}

function cropViewBox(svgElement, fallback) {
  try {
    const croppedNode = svgElement.querySelector('croppedViewBox')
      ?? svgElement.getElementsByTagName('croppedViewBox')[0];
    const cropped = croppedNode?.textContent?.trim();
    if (cropped) {
      const parts = cropped.split(/\s+/).map(Number);
      if (parts.length === 4 && parts.every(Number.isFinite) && parts[2] > 0 && parts[3] > 0) {
        return `${parts[0]} ${parts[1]} ${parts[2]} ${parts[3]}`;
      }
    }
  } catch {
    // Fall back to the declared canvas box.
  }
  return svgElement.getAttribute('viewBox') || fallback;
}

/** Renders one source for one entity. Penrose SVG ids are namespaced by entity. */
export function ensureRendered(source, entityId) {
  const key = `${entityId}\u0000${sourceKey(source)}`;
  let entry = renders.get(key);
  if (entry) {
    renders.delete(key);
    renders.set(key, entry);
    return entry;
  }
  const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
  entry = { status: 'pending', promise: null, inner: '', viewBox: estimateViewBox(source?.style), error: null };
  entry.promise = (async () => {
    const compiled = compileSource(source);
    await compiled.promise;
    if (compiled.status !== 'ready') {
      entry.status = 'error';
      entry.error = compiled.error || 'Penrose 컴파일 오류';
      return entry;
    }
    try {
      const svg = await toSVG(compiled.state, async () => undefined, safeNamespace(entityId), false);
      const viewBox = cropViewBox(svg, estimateViewBox(source?.style));
      const inner = String(svg.innerHTML ?? '').replace(/<penrose[\s\S]*?<\/penrose>/g, '');
      entry.inner = inner;
      entry.viewBox = viewBox;
      entry.status = 'ready';
      entry.error = null;
    } catch (error) {
      entry.status = 'error';
      entry.error = errorText(error);
    } finally {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      entry.durationMs = Math.max(0, Math.round(now - started));
    }
    return entry;
  })();
  renders.set(key, entry);
  trim(renders, MAX_RENDERS);
  return entry;
}

export function renderedSync(source, entityId) {
  const entry = ensureRendered(source, entityId);
  return entry.status === 'ready' ? entry : null;
}

export function dropRendered(entityId) {
  const prefix = `${entityId}\u0000`;
  for (const key of renders.keys()) if (key.startsWith(prefix)) renders.delete(key);
}

export function clearCompileCache() {
  compiles.clear();
  renders.clear();
}

export function cacheStats() {
  return { compiles: compiles.size, renders: renders.size };
}
