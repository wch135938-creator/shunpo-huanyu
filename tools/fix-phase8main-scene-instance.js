// Phase10-Step11X9 Scene JSON ID Recovery
// Repairs Phase8Main.scene equipment panel prefab instances without modifying TS or prefab files.

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = 'E:/CocosProjects/TestGame/TestGame';
const SCENE_PATH = path.join(PROJECT_ROOT, 'assets/scenes/Phase8Main.scene');
const BAG_PREFAB_PATH = path.join(PROJECT_ROOT, 'assets/prefabs/panels/EquipmentBagPanel.prefab');
const DETAIL_PREFAB_PATH = path.join(PROJECT_ROOT, 'assets/prefabs/panels/EquipmentDetailPanel.prefab');

const BAG_PREFAB_UUID = 'f4d5e6a7-b8c9-0123-defa-234567890123';
const DETAIL_PREFAB_UUID = 'a5e6f7b8-c9d0-1234-efab-345678901234';

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

function collectSubtree(scene, rootIndex) {
  const result = new Set();
  function walk(index) {
    if (result.has(index)) return;
    const obj = scene[index];
    if (!obj) return;
    result.add(index);
    if (obj.__type__ === 'cc.Node') {
      for (const child of obj._children || []) walk(child.__id__);
      for (const comp of obj._components || []) walk(comp.__id__);
      if (obj._prefab && typeof obj._prefab.__id__ === 'number') walk(obj._prefab.__id__);
    }
  }
  walk(rootIndex);
  return result;
}

function findNodes(scene, name) {
  const found = [];
  for (let i = 0; i < scene.length; i++) {
    const obj = scene[i];
    if (obj && obj.__type__ === 'cc.Node' && obj._name === name) {
      found.push(i);
    }
  }
  return found;
}

function findComponentOnNode(scene, nodeIndex, typePrefix) {
  const node = scene[nodeIndex];
  for (const comp of node._components || []) {
    const compIndex = comp.__id__;
    const obj = scene[compIndex];
    if (obj && typeof obj.__type__ === 'string' && obj.__type__.startsWith(typePrefix)) {
      return compIndex;
    }
  }
  return null;
}

function collectStats(scene) {
  const ids = new Map();
  const counts = {
    EquipmentPanel: 0,
    EquipmentBagPanel: 0,
    EquipmentDetailPanel: 0,
    EquipmentMediator: 0,
  };
  const panels = [];

  for (let i = 0; i < scene.length; i++) {
    const obj = scene[i];
    if (!obj) continue;

    if (obj.__type__ === 'cc.Node') {
      if (Object.prototype.hasOwnProperty.call(counts, obj._name)) {
        counts[obj._name] += 1;
        panels.push({
          index: i,
          name: obj._name,
          id: obj._id,
          path: pathOf(scene, i),
          active: obj._active,
          parent: obj._parent && obj._parent.__id__,
          components: (obj._components || []).map((c) => c.__id__),
          prefab: obj._prefab || null,
        });
      }
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

  return { objectCount: scene.length, counts, panels, duplicateIds };
}

function assertNoOutOfRangeRefs(scene) {
  const invalid = [];
  visit(scene, (obj) => {
    if (
      Object.prototype.hasOwnProperty.call(obj, '__id__')
      && typeof obj.__id__ === 'number'
      && (obj.__id__ < 0 || obj.__id__ >= scene.length)
    ) {
      invalid.push(obj.__id__);
    }
  });
  if (invalid.length > 0) {
    throw new Error(`Invalid __id__ references after repair: ${invalid.join(', ')}`);
  }
}

function makePrefabRef(uuid) {
  return { __uuid__: uuid, __expectedType__: 'cc.Prefab' };
}

function makeSceneId(prefix, oldIndex, obj) {
  const suffix = obj && obj.__type__ === 'cc.Node' ? (obj._name || 'node') : (obj.__type__ || 'object');
  return `Step11X9-${prefix}-${oldIndex}-${suffix}`;
}

function cloneBagPrefabIntoScene(scene, bagPrefab, uiRootIndex) {
  const sourceIndices = [];
  for (let i = 1; i < bagPrefab.length; i++) {
    if (bagPrefab[i].__type__ === 'cc.PrefabInfo') continue;
    sourceIndices.push(i);
  }

  const start = scene.length;
  const idMap = new Map();
  sourceIndices.forEach((oldIndex, offset) => {
    idMap.set(oldIndex, start + offset);
  });

  const cloned = sourceIndices.map((oldIndex) => {
    const obj = deepClone(bagPrefab[oldIndex]);
    rewriteIds(obj, idMap);

    if (obj.__type__ === 'cc.Node' || obj.node) {
      if (Object.prototype.hasOwnProperty.call(obj, '_id')) {
        obj._id = makeSceneId('Bag', oldIndex, obj);
      }
    }

    if (obj._prefab) obj._prefab = makePrefabRef(BAG_PREFAB_UUID);
    if (obj.__prefab) obj.__prefab = makePrefabRef(BAG_PREFAB_UUID);

    return obj;
  });

  const rootIndex = idMap.get(1);
  const scriptIndex = idMap.get(65);

  const root = cloned[rootIndex - start];
  root._parent = { __id__: uiRootIndex };
  root._active = false;
  root._id = makeSceneId('BagRoot', 1, root);
  root._prefab = makePrefabRef(BAG_PREFAB_UUID);

  const rootTransform = cloned[idMap.get(64) - start];
  if (rootTransform && rootTransform._contentSize) {
    rootTransform._contentSize.width = 720;
    rootTransform._contentSize.height = 1280;
  }

  scene.push(...cloned);

  return { rootIndex, scriptIndex, clonedCount: cloned.length };
}

function main() {
  const scene = JSON.parse(fs.readFileSync(SCENE_PATH, 'utf8'));
  const bagPrefab = JSON.parse(fs.readFileSync(BAG_PREFAB_PATH, 'utf8'));
  JSON.parse(fs.readFileSync(DETAIL_PREFAB_PATH, 'utf8'));

  const before = collectStats(scene);

  const canvasIndex = findNodes(scene, 'Canvas')[0];
  const uiRootIndex = findNodes(scene, 'UIRoot')[0];
  const equipmentPanelIndex = findNodes(scene, 'EquipmentPanel')[0];
  const mediatorNodeIndex = findNodes(scene, 'EquipmentMediator')[0];
  const renderProbeIndex = findNodes(scene, 'RenderProbeLabel')[0];

  if (canvasIndex == null || uiRootIndex == null || equipmentPanelIndex == null || mediatorNodeIndex == null) {
    throw new Error('Required Phase8Main nodes not found.');
  }

  const bagNodes = findNodes(scene, 'EquipmentBagPanel');
  const detailNodes = findNodes(scene, 'EquipmentDetailPanel');

  const corruptBagIndex = bagNodes.find((i) => scene[i]._id === 'EquipmentDetailPanel-root') ?? bagNodes[0];
  const corruptDetailIndex = detailNodes.find((i) => scene[i]._parent && scene[i]._parent.__id__ === uiRootIndex);
  const cleanDetailIndex = detailNodes.find((i) => scene[i]._parent && scene[i]._parent.__id__ === canvasIndex && i !== corruptDetailIndex);

  if (corruptBagIndex == null || corruptDetailIndex == null || cleanDetailIndex == null) {
    throw new Error(`Unable to identify corrupt/clean panel instances. bag=${corruptBagIndex}, oldDetail=${corruptDetailIndex}, cleanDetail=${cleanDetailIndex}`);
  }

  const removeSet = new Set([
    ...collectSubtree(scene, corruptBagIndex),
    ...collectSubtree(scene, corruptDetailIndex),
  ]);

  // Move the clean DetailPanel under UIRoot before remapping.
  scene[cleanDetailIndex]._parent = { __id__: uiRootIndex };
  scene[cleanDetailIndex]._active = false;
  const cleanDetailTransformIndex = (scene[cleanDetailIndex]._components || [])[0]?.__id__;
  if (cleanDetailTransformIndex != null && scene[cleanDetailTransformIndex]?._contentSize) {
    scene[cleanDetailTransformIndex]._contentSize.width = 720;
    scene[cleanDetailTransformIndex]._contentSize.height = 1280;
  }

  // Drop removed roots and old clean-detail parent link from children lists before compacting.
  scene[canvasIndex]._children = (scene[canvasIndex]._children || [])
    .filter((child) => child.__id__ !== cleanDetailIndex && !removeSet.has(child.__id__));
  scene[uiRootIndex]._children = (scene[uiRootIndex]._children || [])
    .filter((child) => !removeSet.has(child.__id__));

  const kept = [];
  const oldToNew = new Map();
  for (let i = 0; i < scene.length; i++) {
    if (removeSet.has(i)) continue;
    oldToNew.set(i, kept.length);
    kept.push(deepClone(scene[i]));
  }

  rewriteIds(kept, oldToNew);

  const newCanvasIndex = oldToNew.get(canvasIndex);
  const newUiRootIndex = oldToNew.get(uiRootIndex);
  const newEquipmentPanelIndex = oldToNew.get(equipmentPanelIndex);
  const newCleanDetailIndex = oldToNew.get(cleanDetailIndex);
  const newRenderProbeIndex = renderProbeIndex != null ? oldToNew.get(renderProbeIndex) : null;
  const newMediatorNodeIndex = oldToNew.get(mediatorNodeIndex);

  const { rootIndex: newBagIndex, scriptIndex: newBagScriptIndex, clonedCount } = cloneBagPrefabIntoScene(kept, bagPrefab, newUiRootIndex);

  const detailScriptIndex = findComponentOnNode(kept, newCleanDetailIndex, '534fa');
  const equipmentPanelScriptIndex = findComponentOnNode(kept, newEquipmentPanelIndex, 'fd274');
  const mediatorScriptIndex = findComponentOnNode(kept, newMediatorNodeIndex, '679c');

  if (detailScriptIndex == null || equipmentPanelScriptIndex == null || mediatorScriptIndex == null) {
    throw new Error(`Required script components not found. detail=${detailScriptIndex}, equipment=${equipmentPanelScriptIndex}, mediator=${mediatorScriptIndex}`);
  }

  kept[newCanvasIndex]._children = (kept[newCanvasIndex]._children || [])
    .filter((child) => child.__id__ !== newCleanDetailIndex && child.__id__ !== newBagIndex);

  const desiredUiChildren = [
    newEquipmentPanelIndex,
    newBagIndex,
    newCleanDetailIndex,
  ];
  if (newRenderProbeIndex != null) desiredUiChildren.push(newRenderProbeIndex);
  kept[newUiRootIndex]._children = desiredUiChildren.map((index) => ({ __id__: index }));

  kept[newBagIndex]._parent = { __id__: newUiRootIndex };
  kept[newCleanDetailIndex]._parent = { __id__: newUiRootIndex };
  kept[newCleanDetailIndex]._active = false;

  kept[mediatorScriptIndex].equipmentPanel = { __id__: equipmentPanelScriptIndex };
  kept[mediatorScriptIndex].bagPanel = { __id__: newBagScriptIndex };
  kept[mediatorScriptIndex].detailPanel = { __id__: detailScriptIndex };

  assertNoOutOfRangeRefs(kept);

  const after = collectStats(kept);
  if (after.duplicateIds.length > 0) {
    throw new Error(`Repair left duplicate _id entries: ${JSON.stringify(after.duplicateIds, null, 2)}`);
  }
  if (
    after.counts.EquipmentPanel !== 1
    || after.counts.EquipmentBagPanel !== 1
    || after.counts.EquipmentDetailPanel !== 1
    || after.counts.EquipmentMediator !== 1
  ) {
    throw new Error(`Unexpected panel counts after repair: ${JSON.stringify(after.counts)}`);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${SCENE_PATH}.backup.Step11X9.${stamp}`;
  fs.copyFileSync(SCENE_PATH, backupPath);
  fs.writeFileSync(SCENE_PATH, `${JSON.stringify(kept, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    backupPath,
    removed: {
      corruptBagIndex,
      corruptDetailIndex,
      removedObjectCount: removeSet.size,
    },
    preserved: {
      cleanDetailOldIndex: cleanDetailIndex,
      cleanDetailNewIndex: newCleanDetailIndex,
    },
    cloned: {
      bagPrefabObjects: clonedCount,
      bagRootIndex: newBagIndex,
      bagScriptIndex: newBagScriptIndex,
    },
    mediatorBinding: {
      mediatorScriptIndex,
      equipmentPanel: kept[mediatorScriptIndex].equipmentPanel,
      bagPanel: kept[mediatorScriptIndex].bagPanel,
      detailPanel: kept[mediatorScriptIndex].detailPanel,
    },
    before,
    after,
  }, null, 2));
}

main();
