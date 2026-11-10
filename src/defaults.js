/**
 * The default trio is the classic set-theory example from the Penrose README.
 * A Penrose diagram is defined by exactly three source files:
 *   .domain    — the vocabulary (types, predicates, functions)
 *   .substance — the concrete objects and facts
 *   .style     — shapes, constraints and layout guidance
 * The variation string seeds Penrose's randomized layout.
 */
export const DEFAULT_DOMAIN = `type Set

predicate Disjoint(Set s1, Set s2)
predicate Intersecting(Set s1, Set s2)
predicate Subset(Set s1, Set s2)
`;

export const DEFAULT_SUBSTANCE = `Set A, B, C, D, E, F, G

Subset(B, A)
Subset(C, A)
Subset(D, B)
Subset(E, B)
Subset(F, C)
Subset(G, C)

Disjoint(E, D)
Disjoint(F, G)
Disjoint(B, C)

AutoLabel All
`;

export const DEFAULT_STYLE = `canvas {
  width = 760
  height = 560
}

forall Set x {
  shape x.icon = Circle { }
  shape x.text = Equation {
    string : x.label
    fontSize : "30px"
  }
  ensure contains(x.icon, x.text)
  encourage norm(x.text.center - x.icon.center) == 0
  layer x.text above x.icon
}

forall Set x; Set y
where Subset(x, y) {
  ensure disjoint(y.text, x.icon, 10)
  ensure contains(y.icon, x.icon, 5)
  layer x.icon above y.icon
}

forall Set x; Set y
where Disjoint(x, y) {
  ensure disjoint(x.icon, y.icon)
}

forall Set x; Set y
where Intersecting(x, y) {
  ensure overlapping(x.icon, y.icon)
  ensure disjoint(y.text, x.icon)
  ensure disjoint(x.text, y.icon)
}
`;

export const DEFAULT_VARIATION = 'EucliDraw';

export const DEFAULT_WIDTH = 760;
export const DEFAULT_HEIGHT = 560;

/** Source text is user intent and stays in the canonical aspect. */
export const PENROSE_DEFAULTS = Object.freeze({
  domain: DEFAULT_DOMAIN,
  substance: DEFAULT_SUBSTANCE,
  style: DEFAULT_STYLE,
  variation: DEFAULT_VARIATION,
});

export function defaultSource() {
  return { ...PENROSE_DEFAULTS };
}

const MAX_SOURCE_LENGTH = 200_000;

function sourceText(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const text = value.replace(/\r\n?/g, '\n');
  return text.length > MAX_SOURCE_LENGTH ? text.slice(0, MAX_SOURCE_LENGTH) : text;
}

function variationText(value) {
  if (typeof value !== 'string') return DEFAULT_VARIATION;
  const text = value.trim().slice(0, 120);
  return text || DEFAULT_VARIATION;
}

/** Normalizes only what is stored; it never compiles or writes to the document. */
export function readSource(props) {
  return {
    domain: sourceText(props?.domain, DEFAULT_DOMAIN),
    substance: sourceText(props?.substance, DEFAULT_SUBSTANCE),
    style: sourceText(props?.style, DEFAULT_STYLE),
    variation: variationText(props?.variation),
  };
}

/** A stable key for compile/render caches. Source text is the only input. */
export function sourceKey(source) {
  const value = readSource(source);
  return `${value.variation}\u0000${value.domain}\u0000${value.substance}\u0000${value.style}`;
}

export function shortSourceKey(source) {
  let hash = 0x811c9dc5;
  const text = sourceKey(source);
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function sourceLabels(source) {
  const value = readSource(source);
  return {
    domain: `${value.domain.split('\n').length}줄`,
    substance: `${value.substance.split('\n').length}줄`,
    style: `${value.style.split('\n').length}줄`,
  };
}
