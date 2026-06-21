// Phase10-Step11X11 Editor Residual Cleanup
// Removes the Canvas/(empty) editor-only prefab instance and moves backup/corrupt
// asset noise out of assets so Cocos AssetDB stops importing it.

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = 'E:/CocosProjects/TestGame/TestGame';
const SCENE_PATH = path.join(PROJECT_ROOT, 'assets/scenes/Phase8Main.scene');
const ASSETS_DIR = path.join(PROJECT_ROOT, 'assets');
const NOISE_ROOT = path.join(PROJECT_ROOT, '_assetdb_noise_backup');

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function visit(value, fn) {
  if (!value || typeof value !== 'object') return;
  fn(value);
  if (Array.isArray(value)) {
    for (const item of value) visit(item, fn);
    return;
  }
  for (const key of Object.keys(value)) visit(value[key], fn);
}

function rewriteIds(value, idMap) {
  visit(value, (obj) => {
    if (
      Object.prototype.hasOwnProperty.call(obj, '__id__')
      && typeof obj.__id__ === 'number'
      && idMap.has(obj.__id__)
    ) {
      obj.__id__ = idMap.get(obj.__id__);
    }
  });
}

function pathOf(scene, index) {
  const names = [];
  let current = index;
  let guard = 0;
  while (current != null && guard++ < 80) {
    const node = scene[current];
    if (!node || node.__type__ !== 'cc.Node') break;
    names.push(node._name || '(empty)');
    current = node._parent && node._parent.__id__;
  }
  return names.reverse().join('/');
}

function collectStats(scene) {
  const ids = new Map();
  const counts = {
    EquipmentPanel: 0,
    EquipmentBagPanel: 0,
    EquipmentDetailPanel: 0,
    EquipmentMediator: 0,
  };
  const emptyCanvasNodes = [];
  const prefabInstances = [];
  const invalidRefs = [];

  function checkRef(value) {
    if (
      value
      && typeof value === 'object'
      && Object.prototype.hasOwnProperty.call(value, '__id__')
      && typeof value.__id__ === 'number'
      && (value.__id__ < 0 || value.__id__ >= scene.length)
    ) {
      invalidRefs.push(value.__id__);
    }
  }
  visit(scene, checkRef);

  for (let i = 0; i < scene.length; i++) {
    const obj = scene[i];
    if (!obj) continue;

    if (obj.__type__ === 'cc.Node') {
      if (Object.prototype.hasOwnProperty.call(counts, obj._name)) {
        counts[obj._name] += 1;
      }
      if ((!obj._name || obj._name === '') && obj._prefab) {
        emptyCanvasNodes.push({
          index: i,
          path: pathOf(scene, i),
          parent: obj._parent && obj._parent.__id__,
          children: (obj._children || []).map((c) => c.__id__),
          components: (obj._components || []).map((c) => c.__id__),
          prefab: obj._prefab,
        });
      }
    }

    if (obj.__type__ === 'cc.PrefabInstance') {
      prefabInstances.push({
        index: i,
        fileId: obj.fileId,
        prefabRootNode: obj.prefabRootNode,
        mountedChildren: obj.mountedChildren,
        mountedComponents: obj.mountedComponents,
        propertyOverrides: obj.propertyOverrides,
      });
    }

    if (obj._id) {
      if (!ids.has(obj._id)) ids.set(obj._id, []);
      ids.get(obj._id).push({
        index: i,
        type: obj.__type__,
        name: obj._name,
        path: obj.__type__ === 'cc.Node' ? pathOf(scene, i) : null,
      });
    }
  }

  const duplicateIds = [...ids.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([id, items]) => ({ id, count: items.length, items }));

  return {
    objectCount: scene.length,
    counts,
    duplicateIds,
    invalidRefs,
    emptyCanvasNodes,
    prefabInstances,
  };
}

function collectResidualClosure(scene, rootIndex) {
  const remove = new Set();

  function add(index) {
    if (index == null || remove.has(index)) return;
    const obj = scene[index];
    if (!obj) return;
    remove.add(index);

    if (obj.__type__ === 'cc.Node') {
      if (obj._prefab && typeof obj._prefab.__id__ === 'number') add(obj._prefab.__id__);
      for (const child of obj._children || []) add(child.__id__);
      for (const comp of obj._components || []) add(comp.__id__);
    }

    if (obj.__type__ === 'cc.PrefabInfo') {
      if (obj.instance && typeof obj.instance.__id__ === 'number') add(obj.instance.__id__);
      if (obj.root && typeof obj.root.__id__ === 'number' && obj.root.__id__ !== rootIndex) add(obj.root.__id__);
    }

    if (obj.__type__ === 'cc.PrefabInstance') {
      for (const mounted of obj.mountedChildren || []) add(mounted.__id__);
      for (const mounted of obj.mountedComponents || []) add(mounted.__id__);
      for (const override of obj.propertyOverrides || []) add(override.__id__);
    }

    if (obj.__type__ === 'CCPropertyOverrideInfo') {
      if (obj.targetInfo && typeof obj.targetInfo.__id__ === 'number') add(obj.targetInfo.__id__);
    }
  }

  add(rootIndex);
  return remove;
}

function removeResidual(scene) {
  const residualRoots = [];
  for (let i = 0; i < scene.length; i++) {
    const obj = scene[i];
    if (
      obj
      && obj.__type__ === 'cc.Node'
      && (!obj._name || obj._name === '')
      && obj._prefab
      && (obj._children || []).length === 0
      && (obj._components || []).length === 0
    ) {
      residualRoots.push(i);
    }
  }

  const removeSet = new Set();
  for (const root of residualRoots) {
    for (const index of collectResidualClosure(scene, root)) {
      removeSet.add(index);
    }
  }

  if (removeSet.size === 0) {
    return { scene, residualRoots, removedIndices: [] };
  }

  for (const obj of scene) {
    if (!obj || obj.__type__ !== 'cc.Node') continue;
    obj._children = (obj._children || []).filter((child) => !removeSet.has(child.__id__));
  }

  for (const obj of scene) {
    if (!obj || obj.__type__ !== 'cc.PrefabInfo') continue;
    obj.nestedPrefabInstanceRoots = (obj.nestedPrefabInstanceRoots || []).filter((root) => !removeSet.has(root.__id__));
    if (obj.nestedPrefabInstanceRoots.length === 0 && Object.prototype.hasOwnProperty.call(obj, 'nestedPrefabInstanceRoots')) {
      obj.nestedPrefabInstanceRoots = [];
    }
  }

  const kept = [];
  const oldToNew = new Map();
  for (let i = 0; i < scene.length; i++) {
    if (removeSet.has(i)) continue;
    oldToNew.set(i, kept.length);
    kept.push(deepClone(scene[i]));
  }
  rewriteIds(kept, oldToNew);

  return {
    scene: kept,
    residualRoots,
    removedIndices: [...removeSet].sort((a, b) => a - b),
  };
}

function walkFiles(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walkFiles(full, out);
    else out.push(full);
  }
  return out;
}

function moveAssetNoise(stamp) {
  const targets = walkFiles(path.join(ASSETS_DIR, 'scenes'))
    .concat(walkFiles(path.join(ASSETS_DIR, 'prefabs')))
    .filter((file) => /\.(backup|corrupt)\./.test(path.basename(file)));

  const moved = [];
  const destRoot = path.join(NOISE_ROOT, `Step11X11-${stamp}`);
  for (const source of targets) {
    const rel = path.relative(ASSETS_DIR, source);
    const dest = path.join(destRoot, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(source, dest);
    moved.push({ from: source, to: dest });
  }
  return { destRoot, moved };
}

function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const scene = JSON.parse(fs.readFileSync(SCENE_PATH, 'utf8'));
  const before = collectStats(scene);

  const backupPath = `${SCENE_PATH}.backup.Step11X11.${stamp}`;
  fs.copyFileSync(SCENE_PATH, backupPath);

  const cleanup = removeResidual(scene);
  const afterScene = cleanup.scene;
  const after = collectStats(afterScene);

  if (after.duplicateIds.length > 0) {
    throw new Error(`duplicateIds remain after cleanup: ${JSON.stringify(after.duplicateIds, null, 2)}`);
  }
  if (after.invalidRefs.length > 0) {
    throw new Error(`invalidRefs remain after cleanup: ${after.invalidRefs.join(', ')}`);
  }
  if (after.emptyCanvasNodes.length > 0) {
    throw new Error(`Canvas empty prefab nodes remain after cleanup: ${JSON.stringify(after.emptyCanvasNodes, null, 2)}`);
  }
  if (after.prefabInstances.length > 0) {
    throw new Error(`PrefabInstance objects remain after cleanup: ${JSON.stringify(after.prefabInstances, null, 2)}`);
  }

  fs.writeFileSync(SCENE_PATH, `${JSON.stringify(afterScene, null, 2)}\n`, 'utf8');
  const noise = moveAssetNoise(stamp);

  console.log(JSON.stringify({
    backupPath,
    before,
    cleanup: {
      residualRoots: cleanup.residualRoots,
      removedIndices: cleanup.removedIndices,
      removedCount: cleanup.removedIndices.length,
    },
    after,
    assetNoise: noise,
  }, null, 2));
}

main();
