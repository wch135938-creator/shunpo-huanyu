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

function ref(index) {
  return { __id__: index };
}

function makeId(key) {
  return crypto.createHash('sha256').update(`operations-ui:${key}`).digest('base64').slice(0, 22);
}

function compressUuid(uuid) {
  const hex = uuid.replaceAll('-', '');
  assert.equal(hex.length, 32, `UUID 长度无效: ${uuid}`);
  const prefix = hex.slice(0, 5);
  const bits = [...hex.slice(5)]
    .map((digit) => Number.parseInt(digit, 16).toString(2).padStart(4, '0'))
    .join('');
  let encoded = '';
  for (let offset = 0; offset < bits.length; offset += 6) {
    encoded += BASE64[Number.parseInt(bits.slice(offset, offset + 6), 2)];
  }
  return prefix + encoded;
}

function readScriptType(relativeMetaPath) {
  const meta = JSON.parse(fs.readFileSync(path.join(root, relativeMetaPath), 'utf8'));
  return compressUuid(meta.uuid);
}

assert.equal(
  compressUuid('fd274f49-b5d5-4940-92d0-1131d863d326'),
  'fd2749JtdVJQJLQETHYY9Mm',
  'Cocos UUID 压缩算法校验失败',
);

const scriptTypes = {
  backdrop: readScriptType('assets/scripts/ui/OperationsUIBackdrop.ts.meta'),
  manager: readScriptType('assets/scripts/ui/OperationsUIManager.ts.meta'),
  mail: readScriptType('assets/scripts/ui/MailPanel.ts.meta'),
  redeem: readScriptType('assets/scripts/ui/RedeemCodePanel.ts.meta'),
  login: readScriptType('assets/scripts/ui/LoginRewardPopup.ts.meta'),
};

const uiRootIndex = objects.findIndex((entry) => entry?.__type__ === 'cc.Node' && entry._name === 'UIRoot');
assert.notEqual(uiRootIndex, -1, '未找到 UIRoot');
assert.equal(
  objects.some((entry) => entry?.__type__ === 'cc.Node' && entry._name === 'OperationsMenu'),
  false,
  'Operations UI 已挂载，拒绝重复执行',
);

function append(object) {
  const index = objects.length;
  objects.push(object);
  return index;
}

function base(type, key) {
  return {
    __type__: type,
    _name: '',
    _objFlags: 0,
    __editorExtras__: {},
    _id: makeId(key),
  };
}

function makeNode(name, parentIndex, x, y, width, height, active = true) {
  const node = {
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
  };
  const nodeIndex = append(node);
  objects[parentIndex]._children.push(ref(nodeIndex));
  const transformIndex = append({
    ...base('cc.UITransform', `transform:${parentIndex}:${name}`),
    node: ref(nodeIndex),
    _enabled: true,
    __prefab: null,
    _contentSize: { __type__: 'cc.Size', width, height },
    _anchorPoint: { __type__: 'cc.Vec2', x: 0.5, y: 0.5 },
  });
  node._components.push(ref(transformIndex));
  return { node: nodeIndex, transform: transformIndex };
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

function color(r, g, b, a = 255) {
  return { __type__: 'cc.Color', r, g, b, a };
}

function addBackdrop(nodeIndex, key, fillColor, radius) {
  return addComponent(nodeIndex, scriptTypes.backdrop, `backdrop:${key}`, {
    color: fillColor,
    radius,
  });
}

function addLabel(parentIndex, name, x, y, width, height, fontSize, initial = '', labelColor = color(255, 255, 255)) {
  const node = makeNode(name, parentIndex, x, y, width, height);
  const label = addComponent(node.node, 'cc.Label', `label:${parentIndex}:${name}`, {
    _customMaterial: null,
    _srcBlendFactor: 2,
    _dstBlendFactor: 4,
    _color: labelColor,
    _string: initial,
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

function addButton(parentIndex, name, x, y, width, height, background = color(70, 85, 110, 255)) {
  const node = makeNode(name, parentIndex, x, y, width, height);
  addBackdrop(node.node, name, background, 14);
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
  const label = addLabel(node.node, `${name}Label`, 0, 0, width - 16, height - 12, 26);
  return { ...node, button, label: label.label };
}

function addPanelRoot(name, width, height) {
  const node = makeNode(name, uiRootIndex, 0, 0, width, height, false);
  addBackdrop(node.node, name, color(20, 22, 34, 255), 0);
  addComponent(node.node, 'cc.BlockInputEvents', `block:${name}`);
  return node;
}

function addEditBox(parentIndex, name, x, y, width, height) {
  const node = makeNode(name, parentIndex, x, y, width, height);
  addBackdrop(node.node, name, color(38, 43, 58, 255), 12);
  const text = addLabel(node.node, `${name}Text`, 0, 0, width - 32, height - 12, 28);
  const placeholder = addLabel(
    node.node,
    `${name}Placeholder`,
    0,
    0,
    width - 32,
    height - 12,
    26,
    '',
    color(150, 155, 170, 255),
  );
  objects[text.transform]._anchorPoint = { __type__: 'cc.Vec2', x: 0, y: 1 };
  objects[placeholder.transform]._anchorPoint = { __type__: 'cc.Vec2', x: 0, y: 1 };
  objects[text.label]._horizontalAlign = 0;
  objects[placeholder.label]._horizontalAlign = 0;
  objects[text.node]._active = false;
  const editBox = addComponent(node.node, 'cc.EditBox', `editbox:${name}`, {
    editingDidBegan: [],
    textChanged: [],
    editingDidEnded: [],
    editingReturn: [],
    _textLabel: ref(text.label),
    _placeholderLabel: ref(placeholder.label),
    _returnType: 1,
    _string: '',
    _tabIndex: 0,
    _backgroundImage: null,
    _inputFlag: 4,
    _inputMode: 6,
    _maxLength: 32,
  });
  return { ...node, editBox };
}

// 底部运营入口菜单
const menu = makeNode('OperationsMenu', uiRootIndex, 0, -560, 660, 90, true);
const mailMenuButton = addButton(menu.node, 'MailEntryButton', -220, 0, 190, 80, color(78, 92, 130));
const redeemMenuButton = addButton(menu.node, 'RedeemEntryButton', 0, 0, 190, 80, color(100, 78, 130));
const loginMenuButton = addButton(menu.node, 'LoginEntryButton', 220, 0, 190, 80, color(130, 96, 54));

// 邮箱面板
const mailPanel = addPanelRoot('MailPanel', 720, 1280);
const mailTitle = addLabel(mailPanel.node, 'titleLabel', 0, 490, 480, 60, 34, '', color(255, 214, 102));
const mailSubject = addLabel(mailPanel.node, 'mailTitleLabel', 0, 410, 560, 60, 30);
const mailSender = addLabel(mailPanel.node, 'senderLabel', 0, 350, 560, 50, 24, '', color(180, 190, 210));
const mailBody = addLabel(mailPanel.node, 'bodyLabel', 0, 175, 580, 280, 26);
const mailAttachments = addLabel(mailPanel.node, 'attachmentLabel', 0, -80, 560, 150, 26, '', color(120, 230, 150));
const mailResult = addLabel(mailPanel.node, 'resultLabel', 0, -245, 560, 60, 24, '', color(255, 214, 102));
const mailPage = addLabel(mailPanel.node, 'pageLabel', 0, -330, 180, 50, 24, '', color(180, 190, 210));
const previousMail = addButton(mailPanel.node, 'previousButton', -220, -450, 170, 80);
const claimMail = addButton(mailPanel.node, 'claimButton', 0, -450, 190, 80, color(54, 120, 82));
const nextMail = addButton(mailPanel.node, 'nextButton', 220, -450, 170, 80);
const closeMail = addButton(mailPanel.node, 'closeButton', 290, 495, 70, 70, color(118, 58, 66));
const mailComponent = addComponent(mailPanel.node, scriptTypes.mail, 'panel:mail', {
  titleLabel: ref(mailTitle.label),
  mailTitleLabel: ref(mailSubject.label),
  senderLabel: ref(mailSender.label),
  bodyLabel: ref(mailBody.label),
  attachmentLabel: ref(mailAttachments.label),
  pageLabel: ref(mailPage.label),
  resultLabel: ref(mailResult.label),
  previousButton: ref(previousMail.button),
  previousButtonLabel: ref(previousMail.label),
  nextButton: ref(nextMail.button),
  nextButtonLabel: ref(nextMail.label),
  claimButton: ref(claimMail.button),
  claimButtonLabel: ref(claimMail.label),
  closeButton: ref(closeMail.button),
  closeButtonLabel: ref(closeMail.label),
});

// 兑换码面板
const redeemPanel = addPanelRoot('RedeemCodePanel', 720, 1280);
const redeemTitle = addLabel(redeemPanel.node, 'titleLabel', 0, 225, 440, 60, 34, '', color(255, 214, 102));
const codeInput = addEditBox(redeemPanel.node, 'codeInput', 0, 80, 500, 90);
const redeemResult = addLabel(redeemPanel.node, 'resultLabel', 0, -45, 500, 70, 24, '', color(255, 214, 102));
const submitRedeem = addButton(redeemPanel.node, 'submitButton', 0, -175, 260, 80, color(100, 78, 130));
const closeRedeem = addButton(redeemPanel.node, 'closeButton', 260, 255, 70, 70, color(118, 58, 66));
const redeemRewardPopup = makeNode('rewardPopupRoot', redeemPanel.node, 0, 0, 560, 360, false);
addBackdrop(redeemRewardPopup.node, 'rewardPopupRoot', color(32, 37, 52, 255), 20);
addComponent(redeemRewardPopup.node, 'cc.BlockInputEvents', 'block:rewardPopupRoot');
const redeemRewardTitle = addLabel(
  redeemRewardPopup.node,
  'rewardPopupTitleLabel',
  0,
  105,
  420,
  60,
  32,
  '',
  color(255, 214, 102),
);
const redeemRewardItems = addLabel(
  redeemRewardPopup.node,
  'rewardPopupItemsLabel',
  0,
  15,
  440,
  110,
  28,
  '',
  color(120, 230, 150),
);
const redeemRewardConfirm = addButton(
  redeemRewardPopup.node,
  'rewardPopupConfirmButton',
  0,
  -110,
  240,
  80,
  color(100, 78, 130),
);
const redeemComponent = addComponent(redeemPanel.node, scriptTypes.redeem, 'panel:redeem', {
  titleLabel: ref(redeemTitle.label),
  codeInput: ref(codeInput.editBox),
  submitButton: ref(submitRedeem.button),
  submitButtonLabel: ref(submitRedeem.label),
  resultLabel: ref(redeemResult.label),
  closeButton: ref(closeRedeem.button),
  closeButtonLabel: ref(closeRedeem.label),
  rewardPopupRoot: ref(redeemRewardPopup.node),
  rewardPopupTitleLabel: ref(redeemRewardTitle.label),
  rewardPopupItemsLabel: ref(redeemRewardItems.label),
  rewardPopupConfirmButton: ref(redeemRewardConfirm.button),
  rewardPopupConfirmButtonLabel: ref(redeemRewardConfirm.label),
});

// 登录奖励弹窗
const loginPanel = addPanelRoot('LoginRewardPopup', 720, 1280);
const loginTitle = addLabel(loginPanel.node, 'titleLabel', 0, 280, 460, 60, 34, '', color(255, 214, 102));
const loginDay = addLabel(loginPanel.node, 'dayLabel', 0, 170, 400, 60, 30);
const loginReward = addLabel(loginPanel.node, 'rewardLabel', 0, 25, 480, 160, 28, '', color(120, 230, 150));
const loginStatus = addLabel(loginPanel.node, 'statusLabel', 0, -105, 480, 60, 24, '', color(255, 214, 102));
const claimLogin = addButton(loginPanel.node, 'claimButton', 0, -230, 280, 80, color(130, 96, 54));
const closeLogin = addButton(loginPanel.node, 'closeButton', 260, 305, 70, 70, color(118, 58, 66));
const loginComponent = addComponent(loginPanel.node, scriptTypes.login, 'panel:login', {
  titleLabel: ref(loginTitle.label),
  dayLabel: ref(loginDay.label),
  rewardLabel: ref(loginReward.label),
  statusLabel: ref(loginStatus.label),
  claimButton: ref(claimLogin.button),
  claimButtonLabel: ref(claimLogin.label),
  closeButton: ref(closeLogin.button),
  closeButtonLabel: ref(closeLogin.label),
});

addComponent(menu.node, scriptTypes.manager, 'manager', {
  mailButton: ref(mailMenuButton.button),
  mailButtonLabel: ref(mailMenuButton.label),
  redeemButton: ref(redeemMenuButton.button),
  redeemButtonLabel: ref(redeemMenuButton.label),
  loginButton: ref(loginMenuButton.button),
  loginButtonLabel: ref(loginMenuButton.label),
  mailPanel: ref(mailComponent),
  redeemCodePanel: ref(redeemComponent),
  loginRewardPopup: ref(loginComponent),
});

// 序列化完整性检查
const ids = new Set();
for (let index = 0; index < objects.length; index += 1) {
  const entry = objects[index];
  if (entry?._id) {
    assert.equal(ids.has(entry._id), false, `重复 _id: ${entry._id}`);
    ids.add(entry._id);
  }
  const serialized = JSON.stringify(entry);
  for (const match of serialized.matchAll(/"__id__":(\d+)/g)) {
    const target = Number(match[1]);
    assert.ok(target >= 0 && target < objects.length, `越界引用: ${index} -> ${target}`);
  }
}

for (let index = 0; index < objects.length; index += 1) {
  const entry = objects[index];
  if (entry?.__type__ !== 'cc.Node') continue;
  for (const child of entry._children ?? []) {
    assert.equal(objects[child.__id__]._parent?.__id__, index, `父子引用不一致: ${index} -> ${child.__id__}`);
  }
  for (const component of entry._components ?? []) {
    assert.equal(objects[component.__id__].node?.__id__, index, `组件引用不一致: ${index} -> ${component.__id__}`);
  }
}

fs.writeFileSync(scenePath, `${JSON.stringify(objects, null, 2)}\n`);
console.log(`Operations UI mounted: ${objects.length} serialized objects`);
