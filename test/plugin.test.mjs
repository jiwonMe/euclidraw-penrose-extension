import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import plugin from '../dist/plugin.js';
import { validateConfig } from '../scripts/validate-config.mjs';
import { estimateViewBox } from '../src/compile.js';
import { PENROSE_DEFAULTS, readSource, sourceKey } from '../src/defaults.js';
import { COMMANDS, PENROSE_ASPECT_ID } from '../src/manifest.js';

const manifest = JSON.parse(await readFile(new URL('../alid.extension.json', import.meta.url), 'utf8'));
const aspect = plugin.aspects[0];
const geometry = { x: 24, y: 32, width: 240, height: 160, rotation: 0.5 };

function fixture({ selected = [], entities = {} } = {}) {
  const ops = [];
  const history = [];
  const removed = [];
  const commands = new Map();
  const selectCalls = [];
  let created;
  let selectedIds = [...selected];
  const world = {
    getCanonical: (id, name) => entities[id]?.[name],
    isAlive: () => true,
    isEntityReadOnly: () => false,
    listEntityIds: () => Object.keys(entities),
    getSelectedIds: () => selectedIds,
    subscribe: () => () => {},
    applyCanonicalTransaction(caller, operations) {
      ops.push({ caller, operations: operations.map(operation => ({ ...operation })) });
      for (const operation of operations) {
        entities[operation.id] ??= {};
        entities[operation.id][operation.aspect] = {
          ...(entities[operation.id][operation.aspect] ?? {}),
          ...operation.patch,
        };
      }
    },
  };
  const surface = {
    selection: { select: id => selectCalls.push(id) },
    host: {
      history: {
        begin: () => history.push('begin'),
        commit: () => history.push('commit'),
        abort: () => history.push('abort'),
      },
    },
  };
  const context = {
    world,
    services: {
      get(name) {
        if (name === 'canvas.creation') {
          return { create: request => { created = request; return 'created-id'; } };
        }
        if (name === 'canvas.active-tool-surface') return { get: () => surface };
        return undefined;
      },
    },
    commands: {
      register(spec) {
        commands.set(spec.id, spec);
        return () => {
          removed.push(spec.id);
          commands.delete(spec.id);
        };
      },
    },
  };
  return { context, ops, history, removed, commands, selectCalls, entities, setSelected: ids => { selectedIds = [...ids]; }, get created() { return created; } };
}

test('the committed install manifest identifies and hashes the built module', async () => {
  assert.equal(manifest.apiVersion, 2);
  assert.equal(manifest.id, plugin.id);
  for (const key of ['version', 'engine', 'dependencies', 'optionalDependencies', 'conflicts', 'provides']) {
    assert.deepEqual(manifest[key], plugin[key], `Reviewed ${key} must match the runtime package.`);
  }
  assert.equal(manifest.version, '0.1.0');
  assert.equal(manifest.engine, '^0.1.0');
  assert.deepEqual(manifest.provides.aspects, manifest.aspectIds);
  assert.deepEqual(manifest.aspectIds, [PENROSE_ASPECT_ID]);
  assert.equal(manifest.entry, 'dist/plugin.js');
  assert.deepEqual(manifest.capabilities.commands, Object.values(COMMANDS));
  const bytes = await readFile(new URL('../dist/plugin.js', import.meta.url));
  assert.equal(manifest.sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.equal(validateConfig(JSON.parse(await readFile(new URL('../extension.json', import.meta.url), 'utf8'))).id, plugin.id);
});

test('the component owns its canonical source trio and exposes the three file tabs', () => {
  assert.equal(aspect.id, PENROSE_ASPECT_ID);
  assert.deepEqual(Object.keys(aspect.defaults).sort(), ['domain', 'style', 'substance', 'variation']);
  assert.deepEqual(aspect.textFields, ['domain', 'substance', 'style']);
  assert.equal(aspect.ui, undefined);
  assert.equal(plugin.ui.panels[0].inspectorFor, PENROSE_ASPECT_ID);
  assert.equal(plugin.ui.panels[0].panelId, 'diagram.penrose.editor');
});

test('the tool shelf creates through canvas.creation and only sends the aspect content', () => {
  const f = fixture();
  const { api, dispose } = plugin.activate(f.context);
  const action = plugin.ui.controls[0];
  assert.equal(action.placement, 'tool-shelf');
  assert.equal(action.requiresSelection, false);
  assert.equal(action.commandSymbol, COMMANDS.insert);
  assert.ok(f.commands.has(action.commandSymbol));

  assert.equal(f.created, undefined);
  assert.equal(api.insertDiagram(), 'created-id');
  assert.equal(f.created.caller, COMMANDS.insert);
  assert.deepEqual(f.created.aspects, { [PENROSE_ASPECT_ID]: PENROSE_DEFAULTS });
  assert.equal(Object.hasOwn(f.created.aspects, 'core.transform'), false);
  assert.equal(f.created.width, 760);
  assert.equal(f.created.height, 560);
  assert.deepEqual(f.selectCalls, ['created-id']);
  dispose();
  assert.equal(f.commands.size, 0);
});

test('apply writes all three files and variation in one host Undo group', () => {
  const entity = { [PENROSE_ASPECT_ID]: { ...PENROSE_DEFAULTS } };
  const f = fixture({ selected: ['e1'], entities: { e1: entity } });
  const { dispose } = plugin.activate(f.context);
  const result = f.commands.get(COMMANDS.apply).run({
    entityId: 'e1',
    domain: 'type Point\n',
    substance: 'Point A\n',
    style: 'canvas {\n  width = 300\n  height = 200\n}\n',
    variation: '  MyLayout  ',
  });
  assert.equal(result, 'e1');
  assert.deepEqual(f.history, ['begin', 'commit']);
  assert.equal(f.ops.length, 1);
  assert.equal(f.ops[0].caller, COMMANDS.apply);
  assert.deepEqual(f.ops[0].operations, [{
    id: 'e1',
    aspect: PENROSE_ASPECT_ID,
    patch: {
      domain: 'type Point\n',
      substance: 'Point A\n',
      style: 'canvas {\n  width = 300\n  height = 200\n}\n',
      variation: 'MyLayout',
    },
  }]);
  dispose();
});

test('reset restores the documented sample without touching transform or bounds', () => {
  const f = fixture({ selected: ['e1'], entities: { e1: { [PENROSE_ASPECT_ID]: { domain: 'x', substance: 'y', style: 'z', variation: 'v' } } } });
  const { dispose } = plugin.activate(f.context);
  assert.equal(f.commands.get(COMMANDS.reset).run({ entityId: 'e1' }), 'e1');
  assert.deepEqual(f.ops[0].operations[0].patch, PENROSE_DEFAULTS);
  assert.equal(Object.hasOwn(f.ops[0].operations[0].patch, 'core.bounds'), false);
  dispose();
});

test('derive reads canonical intent only and stays finite when bounds are invalid', () => {
  const transform = Object.freeze({ x: 24, y: 32, rotation: 0.5 });
  const bounds = Object.freeze({ width: 240, height: 160 });
  const reads = [];
  const derived = aspect.derive(aspect.defaults, 'penrose-1', {
    getCanonical(id, name) {
      reads.push([id, name]);
      return name === 'core.transform' ? transform : bounds;
    },
  });
  assert.deepEqual(derived, geometry);
  assert.deepEqual(reads, [['penrose-1', 'core.transform'], ['penrose-1', 'core.bounds']]);
  const fallback = aspect.derive(aspect.defaults, 'penrose-2', {
    getCanonical: () => ({ x: Infinity, y: NaN, rotation: Infinity, width: -10, height: NaN }),
  });
  assert.deepEqual(fallback, { x: 0, y: 0, width: 760, height: 560, rotation: 0 });
  assert.equal(Object.hasOwn(derived, 'zOrder'), false);
});

test('renderSvg returns a safe placeholder before compilation and a transformed SVG after it', () => {
  const early = aspect.renderSvg({ ...PENROSE_DEFAULTS, variation: 'unit-placeholder' }, geometry, 'penrose-offscreen');
  assert.deepEqual(Object.keys(early), ['svg']);
  assert.match(early.svg, /^<g transform="translate\(24,32\) rotate\(/);
  assert.match(early.svg, /width="240" height="160"/);
  assert.ok(early.svg.includes('Penrose 다이어그램'));

  const content = { innerHTML: '' };
  const cleanup = aspect.renderDom(content, { ...PENROSE_DEFAULTS, variation: 'unit-dom' }, geometry, 'penrose-dom');
  assert.match(content.innerHTML, /계산하는 중/);
  cleanup();
});

test('source normalization and cache keys are stable and distinguish every input', () => {
  assert.equal(readSource({ domain: 'a\r\nb', substance: 'c\r\nd', style: 'e\r\nf', variation: '  v  ' }).variation, 'v');
  assert.equal(readSource({}).domain, PENROSE_DEFAULTS.domain);
  assert.equal(sourceKey({ domain: 'a', substance: 'b', style: 'c', variation: 'v' }), sourceKey({ domain: 'a', substance: 'b', style: 'c', variation: 'v' }));
  assert.notEqual(sourceKey({ domain: 'a', substance: 'b', style: 'c', variation: 'v' }), sourceKey({ domain: 'a', substance: 'b', style: 'd', variation: 'v' }));
  assert.notEqual(sourceKey({ domain: 'a', substance: 'b', style: 'c', variation: 'v' }), sourceKey({ domain: 'a', substance: 'b', style: 'c', variation: 'w' }));
  assert.equal(estimateViewBox('canvas {\n  width = 300\n  height = 200\n}'), '0 0 300 200');
  assert.equal(estimateViewBox('nope'), '0 0 760 560');
});
