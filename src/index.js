import metadata from '../extension.json' with { type: 'json' };
import { penroseAspect } from './aspect.js';
import { clearCompileCache, dropRendered, ensureRendered } from './compile.js';
import { DEFAULT_HEIGHT, DEFAULT_WIDTH, PENROSE_DEFAULTS, readSource } from './defaults.js';
import {
  COMMANDS,
  PENROSE_ASPECT_ID,
  createPackageManifest,
} from './manifest.js';
import { createEditorPanelSpec } from './panel.jsx';

const PENROSE_ICON = Object.freeze({
  paths: Object.freeze([
    'M4 4h8',
    'M4 9h5',
    'M4 14h8',
    'M16 6l4 4-4 4',
    'M20 10h-8',
  ]),
});

function activeSurface(context) {
  return context.services?.get?.('canvas.active-tool-surface')?.get?.() ?? null;
}

function withHistoryGroup(context, run) {
  const history = activeSurface(context)?.host?.history;
  history?.begin?.();
  try {
    const result = run();
    history?.commit?.();
    return result;
  } catch (error) {
    history?.abort?.();
    throw error;
  }
}

function selectEntity(context, entityId) {
  try {
    activeSurface(context)?.selection?.select?.(entityId);
  } catch {
    // Selection is a convenience; creation succeeded regardless.
  }
}

function selectedIds(context) {
  const surfaceSelection = activeSurface(context)?.selection?.getSelection?.();
  if (Array.isArray(surfaceSelection)) return [...surfaceSelection];
  return [...(context.world.getSelectedIds?.() ?? [])];
}

function targetIds(context, explicitEntityId) {
  const ids = typeof explicitEntityId === 'string' && explicitEntityId
    ? [explicitEntityId]
    : selectedIds(context);
  return ids.filter(id => {
    if (context.world.isAlive && !context.world.isAlive(id)) return false;
    if (context.world.isEntityReadOnly?.(id)) return false;
    return Boolean(context.world.getCanonical?.(id, PENROSE_ASPECT_ID));
  });
}

function applySource(context, rawArgs = {}) {
  const args = rawArgs && typeof rawArgs === 'object' ? rawArgs : {};
  const ids = targetIds(context, args.entityId);
  if (!ids.length) return null;
  const source = readSource(args);
  const patch = {
    domain: source.domain,
    substance: source.substance,
    style: source.style,
    variation: source.variation,
  };
  withHistoryGroup(context, () => {
    context.world.applyCanonicalTransaction(
      COMMANDS.apply,
      ids.map(id => ({ id, aspect: PENROSE_ASPECT_ID, patch })),
      'local:user',
    );
  });
  for (const id of ids) ensureRendered(source, id);
  return ids[0];
}

function resetSource(context, rawArgs = {}) {
  const args = rawArgs && typeof rawArgs === 'object' ? rawArgs : {};
  return applySource(context, { entityId: args.entityId, ...PENROSE_DEFAULTS });
}

function recompile(context, rawArgs = {}) {
  const args = rawArgs && typeof rawArgs === 'object' ? rawArgs : {};
  const ids = targetIds(context, args.entityId);
  for (const id of ids) {
    dropRendered(id);
    const props = context.world.getCanonical?.(id, PENROSE_ASPECT_ID);
    ensureRendered(readSource(props), id);
  }
  return ids;
}

function insertDiagram(context) {
  const creation = context.services?.get?.('canvas.creation');
  if (!creation || typeof creation.create !== 'function') {
    throw new Error('Penrose 다이어그램을 만들려면 canvas.creation 호스트 서비스가 필요합니다.');
  }
  const id = creation.create({
    caller: COMMANDS.insert,
    aspects: { [PENROSE_ASPECT_ID]: { ...PENROSE_DEFAULTS } },
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
  });
  selectEntity(context, id);
  ensureRendered(PENROSE_DEFAULTS, id);
  return id;
}

/** Compiles every Penrose entity in the background so SVG export is warm. */
function startWarming(context) {
  let timer = null;
  const warm = () => {
    for (const id of context.world.listEntityIds?.() ?? []) {
      if (context.world.isAlive && !context.world.isAlive(id)) continue;
      const props = context.world.getCanonical?.(id, PENROSE_ASPECT_ID);
      if (props) ensureRendered(readSource(props), id);
    }
  };
  const schedule = () => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      warm();
    }, 300);
  };
  const off = context.world.subscribe?.(schedule);
  warm();
  return () => {
    if (timer !== null) clearTimeout(timer);
    off?.();
    clearCompileCache();
  };
}

export default {
  ...createPackageManifest(metadata),
  summary: metadata.summary,
  aspects: [penroseAspect],
  ui: {
    panels: [createEditorPanelSpec()],
    controls: [
      {
        id: 'penrose.insert.shelf',
        kind: 'action',
        label: 'Penrose 다이어그램',
        icon: PENROSE_ICON,
        commandSymbol: COMMANDS.insert,
        placement: 'tool-shelf',
        requiresSelection: false,
      },
    ],
  },
  activate(context) {
    const disposers = [];
    const register = (id, title, summary, run) => {
      disposers.push(context.commands.register({
        id,
        title,
        summary,
        shortcutScope: 'canvas',
        run,
      }));
    };

    register(
      COMMANDS.insert,
      'Penrose 다이어그램 추가',
      '현재 화면에 .domain · .substance · .style 예제가 담긴 Penrose 컴포넌트를 만듭니다.',
      () => insertDiagram(context),
    );
    register(
      COMMANDS.apply,
      'Penrose 소스 적용',
      '선택한 Penrose 컴포넌트의 .domain · .substance · .style과 variation을 한 번의 Undo로 저장합니다.',
      args => applySource(context, args),
    );
    register(
      COMMANDS.reset,
      'Penrose 기본 예제로 복원',
      '선택한 Penrose 컴포넌트의 소스를 기본 집합론 예제로 되돌립니다.',
      args => resetSource(context, args),
    );
    register(
      COMMANDS.recompile,
      'Penrose 다시 렌더',
      '캐시를 버리고 선택한 Penrose 컴포넌트를 다시 컴파일합니다.',
      args => recompile(context, args),
    );

    disposers.push(startWarming(context));

    return {
      api: Object.freeze({
        insertDiagram: () => insertDiagram(context),
      }),
      dispose() {
        for (let index = disposers.length - 1; index >= 0; index--) disposers[index]();
      },
    };
  },
};
