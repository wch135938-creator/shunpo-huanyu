// ============================================================
// modify-scene.js — Add EquipmentMediator node to Phase8Main.scene
// ============================================================

const fs = require('fs');
const path = require('path');

const scenePath = path.join(__dirname, '..', 'assets', 'scenes', 'Phase8Main.scene');
const scene = JSON.parse(fs.readFileSync(scenePath, 'utf-8'));

// EquipmentMediator compressed UUID
const MEDIATOR_CUUID = '679c9TwPJxFNbkGrNmpcHbr';

// Add EquipmentMediator node at the end of the array
const newNodeIdx = scene.length;

// EquipmentMediator node
const mediatorNode = {
  __type__: 'cc.Node',
  _name: 'EquipmentMediator',
  _objFlags: 0,
  __editorExtras__: {},
  _parent: { __id__: 1 },
  _children: [],
  _active: true,
  _components: [
    { __id__: newNodeIdx + 1 },
    { __id__: newNodeIdx + 2 },
  ],
  _prefab: null,
  _lpos: { __type__: 'cc.Vec3', x: 0, y: 0, z: 0 },
  _lrot: { __type__: 'cc.Quat', x: 0, y: 0, z: 0, w: 1 },
  _lscale: { __type__: 'cc.Vec3', x: 1, y: 1, z: 1 },
  _mobility: 0,
  _layer: 1073741824,
  _euler: { __type__: 'cc.Vec3', x: 0, y: 0, z: 0 },
  _id: 'eqmediator-node-uuid',
};

// UITransform component
const mediatorUIt = {
  __type__: 'cc.UITransform',
  _name: '',
  _objFlags: 0,
  __editorExtras__: {},
  node: { __id__: newNodeIdx },
  _enabled: true,
  __prefab: null,
  _contentSize: { __type__: 'cc.Size', width: 100, height: 100 },
  _anchorPoint: { __type__: 'cc.Vec2', x: 0.5, y: 0.5 },
  _id: 'eqmediator-uitransform',
};

// EquipmentMediator script component with panel bindings
const mediatorScript = {
  __type__: MEDIATOR_CUUID,
  _name: '',
  _objFlags: 0,
  __editorExtras__: {},
  node: { __id__: newNodeIdx },
  _enabled: true,
  __prefab: null,
  equipmentPanel: null,
  bagPanel: null,
  detailPanel: null,
  _id: 'eqmediator-script-uuid',
};

// Append new objects
scene.push(mediatorNode);
scene.push(mediatorUIt);
scene.push(mediatorScript);

// Update scene root (index 1) children to include the new node
scene[1]._children.push({ __id__: newNodeIdx });

// Write back
fs.writeFileSync(scenePath, JSON.stringify(scene, null, 2), 'utf-8');
console.log(`Updated Phase8Main.scene: added EquipmentMediator node at index ${newNodeIdx}`);
console.log(`Scene now has ${scene.length} objects`);
console.log(`Scene root children: ${JSON.stringify(scene[1]._children)}`);
