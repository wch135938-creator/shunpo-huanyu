import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scenePath = path.join(root, 'assets/scenes/Phase10Main.scene');
const objects = JSON.parse(fs.readFileSync(scenePath, 'utf8'));
const LAYER_UI_2D = 33554432;
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const ref = (index) => ({ __id__: index });
const color = (r, g, b, a = 255) => ({ __type__: 'cc.Color', r, g, b, a });
const makeId = (key) => crypto
  .createHash('sha256')
  .update(`operations-ui-v2:${key}`)
  .digest('base64')
  .slice(0, 22);

function compressUuid(uuid) {
  const hex = uuid.replaceAll('-', '');
  const bits = [...hex.slice(5)]
    .map((digit) => Number.parseInt(digit, 16).toString(2).padStart(4, '0'))
    .join('');
  let encoded = '';
  for (let offset = 0; offset < bits.length; offset += 6) {
    encoded += BASE64[Number.parseInt(bits.slice(offset, offset + 6), 2)];
  }
  return hex.slice(0, 5) + encoded;
}

function readScriptType(relativeMetaPath) {
  const meta = JSON.parse(fs.readFileSync(path.join(root, relativeMetaPath), 'utf8'));
  return compressUuid(meta.uuid);
}

const backdropType = readScriptType('assets/scripts/ui/OperationsUIBackdrop.ts.meta');
const redeemPanelType = readScriptType('assets/scripts/ui/RedeemCodePanel.ts.meta');
const append = (entry) => {
  const index = objects.length;
  objects.push(entry);
  return index;
};

function base(type, key) {
  return {
    __type__: type,
    _name: '',
    _objFlags: 0,
    __editorExtras__: {},
    _id: makeId(key),
  };
}

function findNode(name) {
  const index = objects.findIndex((entry) => entry?.__type__ === 'cc.Node' && entry._name === name);
  assert.notEqual(index, -1, `缺少节点: ${name}`);
  return index;
}

function findChild(parentIndex, name) {
  const child = objects[parentIndex]._children.find((entry) => objects[entry.__id__]?._name === name);
  assert.ok(child, `${objects[parentIndex]._name} 缺少子节点 ${name}`);
  return child.__id__;
}

function findComponent(nodeIndex, type) {
  const component = objects[nodeIndex]._components.find((entry) => objects[entry.__id__]?.__type__ === type);
  assert.ok(component, `${objects[nodeIndex]._name} 缺少组件 ${type}`);
  return component.__id__;
}

function addComponent(nodeIndex, type, key, properties = {}) {
  const componentIndex = append({
    ...base(type, `component:${nodeIndex}:${key}`),
    node: ref(nodeIndex),
    _enabled: true,
    __prefab: null,
    ...properties,
  });
  objects[nodeIndex]._components.push(ref(componentIndex));
  return componentIndex;
}

function makeNode(name, parentIndex, x, y, width, height, active = true) {
  const nodeIndex = append({
    __type__: 'cc.Node',
    _name: name,
    _objFlags: 0,
    __editorExtras__: {},
    _parent: ref(parentIndex),
    _children: [],
    _active: active,
    _components: [],
    _prefab: null,
    _lpos: { __type__: 'cc.Vec3', x, y, z: 0 },
    _lrot: { __type__: 'cc.Quat', x: 0, y: 0, z: 0, w: 1 },
    _lscale: { __type__: 'cc.Vec3', x: 1, y: 1, z: 1 },
    _mobility: 0,
    _layer: LAYER_UI_2D,
    _euler: { __type__: 'cc.Vec3', x: 0, y: 0, z: 0 },
    _id: makeId(`node:${parentIndex}:${name}`),
  });
  objects[parentIndex]._children.push(ref(nodeIndex));
  const transform = addComponent(nodeIndex, 'cc.UITransform', `transform:${name}`, {
    _contentSize: { __type__: 'cc.Size', width, height },
    _anchorPoint: { __type__: 'cc.Vec2', x: 0.5, y: 0.5 },
  });
  return { node: nodeIndex, transform };
}

function addBackdrop(nodeIndex, key, fillColor, radius) {
  return addComponent(nodeIndex, backdropType, `backdrop:${key}`, {
    color: fillColor,
    radius,
  });
}

function addLabel(parentIndex, name, x, y, width, height, fontSize, labelColor) {
  const node = makeNode(name, parentIndex, x, y, width, height);
  const label = addComponent(node.node, 'cc.Label', `label:${name}`, {
    _customMaterial: null,
    _srcBlendFactor: 2,
    _dstBlendFactor: 4,
    _color: labelColor,
    _string: '',
    _horizontalAlign: 1,
    _verticalAlign: 1,
    _actualFontSize: fontSize,
    _fontSize: fontSize,
    _fontFamily: 'Arial',
    _lineHeight: fontSize + 8,
    _overflow: 1,
    _enableWrapText: true,
    _font: null,
    _isSystemFontUsed: true,
    _spacingX: 0,
    _isItalic: false,
    _isBold: false,
    _isUnderline: false,
    _underlineHeight: 2,
    _cacheMode: 0,
    _enableOutline: false,
    _outlineColor: color(0, 0, 0),
    _outlineWidth: 2,
    _enableShadow: false,
    _shadowColor: color(0, 0, 0),
    _shadowOffset: { __type__: 'cc.Vec2', x: 2, y: 2 },
    _shadowBlur: 2,
  });
  return { ...node, label };
}

function addButton(parentIndex, name, x, y, width, height) {
  const node = makeNode(name, parentIndex, x, y, width, height);
  addBackdrop(node.node, name, color(100, 78, 130, 255), 14);
  const button = addComponent(node.node, 'cc.Button', `button:${name}`, {
    clickEvents: [],
    _interactable: true,
    _transition: 3,
    _normalColor: color(255, 255, 255),
    _hoverColor: color(211, 211, 211),
    _pressedColor: color(255, 255, 255),
    _disabledColor: color(124, 124, 124),
    _normalSprite: null,
    _hoverSprite: null,
    _pressedSprite: null,
    _disabledSprite: null,
    _duration: 0.1,
    _zoomScale: 0.95,
    _target: ref(node.node),
  });
  const label = addLabel(node.node, `${name}Label`, 0, 0, width - 16, height - 12, 26, color(255, 255, 255));
  return { ...node, button, label: label.label };
}

assert.equal(objects.some((entry) => entry?._name === 'rewardPopupRoot'), false, 'v2 已应用');

for (const name of ['MailPanel', 'RedeemCodePanel', 'LoginRewardPopup']) {
  const panelIndex = findNode(name);
  const transformIndex = findComponent(panelIndex, 'cc.UITransform');
  objects[transformIndex]._contentSize.width = 720;
  objects[transformIndex]._contentSize.height = 1280;
  const backdropIndex = findComponent(panelIndex, backdropType);
  objects[backdropIndex].color.a = 255;
  objects[backdropIndex].radius = 0;
}

const redeemPanelIndex = findNode('RedeemCodePanel');
for (const name of ['codeInputText', 'codeInputPlaceholder']) {
  const nodeIndex = findChild(findChild(redeemPanelIndex, 'codeInput'), name);
  const transformIndex = findComponent(nodeIndex, 'cc.UITransform');
  const labelIndex = findComponent(nodeIndex, 'cc.Label');
  objects[transformIndex]._anchorPoint = { __type__: 'cc.Vec2', x: 0, y: 1 };
  objects[labelIndex]._horizontalAlign = 0;
}

const popup = makeNode('rewardPopupRoot', redeemPanelIndex, 0, 0, 560, 360, false);
addBackdrop(popup.node, 'rewardPopupRoot', color(32, 37, 52, 255), 20);
addComponent(popup.node, 'cc.BlockInputEvents', 'block:rewardPopupRoot');
const popupTitle = addLabel(popup.node, 'rewardPopupTitleLabel', 0, 105, 420, 60, 32, color(255, 214, 102));
const popupItems = addLabel(popup.node, 'rewardPopupItemsLabel', 0, 15, 440, 110, 28, color(120, 230, 150));
const popupConfirm = addButton(popup.node, 'rewardPopupConfirmButton', 0, -110, 240, 80);

const redeemComponentIndex = findComponent(redeemPanelIndex, redeemPanelType);
Object.assign(objects[redeemComponentIndex], {
  rewardPopupRoot: ref(popup.node),
  rewardPopupTitleLabel: ref(popupTitle.label),
  rewardPopupItemsLabel: ref(popupItems.label),
  rewardPopupConfirmButton: ref(popupConfirm.button),
  rewardPopupConfirmButtonLabel: ref(popupConfirm.label),
});

const ids = objects.filter((entry) => entry?._id).map((entry) => entry._id);
assert.equal(ids.length, new Set(ids).size, '场景存在重复 _id');
for (let index = 0; index < objects.length; index += 1) {
  for (const match of JSON.stringify(objects[index]).matchAll(/"__id__":(\d+)/g)) {
    const target = Number(match[1]);
    assert.ok(target >= 0 && target < objects.length, `越界引用: ${index} -> ${target}`);
  }
}

fs.writeFileSync(scenePath, `${JSON.stringify(objects, null, 2)}\n`);
console.log(`Operations UI upgraded to v2: ${objects.length} serialized objects`);
