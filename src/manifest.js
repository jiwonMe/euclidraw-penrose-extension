import rawConfig from '../extension.json' with { type: 'json' };

export const EXTENSION_ID = rawConfig.id;
export const PENROSE_ASPECT_ID = `${EXTENSION_ID}.diagram`;
export const EDITOR_PANEL_ID = `${EXTENSION_ID}.editor`;

export const COMMAND_NAMES = Object.freeze([
  'insert-diagram',
  'apply-source',
  'reset-source',
  'recompile',
]);

export const COMMANDS = Object.freeze({
  insert: `${EXTENSION_ID}:insert-diagram`,
  apply: `${EXTENSION_ID}:apply-source`,
  reset: `${EXTENSION_ID}:reset-source`,
  recompile: `${EXTENSION_ID}:recompile`,
});

/** Shared by the bundle and build script; keep the reviewed and executed contracts identical. */
export function createPackageManifest(metadata = rawConfig) {
  return {
    id: metadata.id,
    version: metadata.version,
    engine: metadata.engine,
    dependencies: { ...metadata.dependencies },
    optionalDependencies: { ...metadata.optionalDependencies },
    conflicts: [...metadata.conflicts],
    provides: {
      services: [...metadata.provides.services],
      aspects: [`${metadata.id}.diagram`],
      hsmSlots: [...metadata.provides.hsmSlots],
    },
  };
}

export const EXTENSION_MANIFEST = Object.freeze(createPackageManifest(rawConfig));
