// ============================================================
// Phase8 Prefab Generator — 生成 Phase8 所需全部 14 个 Prefab .prefab 文件和 .meta 文件
//
// 生成 Cocos Creator 3.x 兼容的序列化格式
// 执行: node tools/generate-phase8-prefabs.js
// ============================================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ==================== 配置 ====================

const PROJECT_ROOT = path.resolve(__dirname, '..');
const PANELS_DIR = path.join(PROJECT_ROOT, 'assets', 'prefabs', 'panels');
const ITEMS_DIR = path.join(PROJECT_ROOT, 'assets', 'prefabs', 'items');

// 脚本 UUID（从 .meta 文件提取）
const SCRIPT_UUIDS = {
  // Panel 组件
  DungeonPanel: 'c6be3f8a-b97c-49da-811d-a4db6aff6216',
  DungeonNodeMapPanel: 'b36ce31d-4a7b-4707-8e50-829baa31f262',
  RoguelikeHUD: '1864d69c-4330-40b8-bd11-8b03519909de',
  ArtifactPanel: 'd98e5d31-dc7b-4da0-99cd-682176020024',
  LiveOpsPanel: '35eb57f4-19b0-48e1-b44f-4cdfe14bdc6e',
  EventPanel: 'bd3e0ae7-953f-4fcc-9973-21e37c06b8e1',
  ResultPanel: '323900d8-75e2-4091-ac95-33f88466dd2a',
  // Item 组件
  DungeonItemTemplate: 'ab241fd0-51fa-43c6-9690-5fe24e67babe',
  NodeMapItemTemplate: '94563aec-445a-440e-87eb-f57b749de44f',
  ForkChoiceTemplate: '7cc38353-9033-48c3-9840-a8c0d8e67d61',
  ArtifactItemTemplate: '499684fd-a279-4ac4-8acf-9de95d058417',
  LiveOpsCardTemplate: 'af6d1220-ff72-4613-a4bb-139fbefb1021',
  EventChoiceTemplate: '5bcdf859-3e38-4db3-905f-fc6121d570a1',
  RewardItemTemplate: '7b2a362d-6a4c-4de4-ab76-67bb3562ba68',
};

// ==================== 辅助：ID 生成 ====================

let idCounter = 0;
function nextId(name) {
  return `p8-${name}-${idCounter++}`;
}

function makeVec3(x, y, z) {
  return { __type__: 'cc.Vec3', x, y, z };
}

function makeVec2(x, y) {
  return { __type__: 'cc.Vec2', x, y };
}

function makeSize(w, h) {
  return { __type__: 'cc.Size', width: w, height: h };
}

function makeColor(r, g, b, a) {
  return { __type__: 'cc.Color', r, g, b, a };
}

function makeQuat() {
  return { __type__: 'cc.Quat', x: 0, y: 0, z: 0, w: 1 };
}

// ==================== 辅助：构建对象 ====================

function makeNode(name, parentId, opts = {}) {
  const node = {
    __type__: 'cc.Node',
    _name: name,
    _objFlags: 0,
    __editorExtras__: {},
    _parent: parentId !== null ? { __id__: parentId } : null,
    _children: [],
    _active: opts.active !== undefined ? opts.active : true,
    _components: [],
    _prefab: { __id__: 0 }, // all nodes in a prefab reference the root cc.Prefab
    _lpos: opts.pos ? makeVec3(opts.pos[0], opts.pos[1], 0) : makeVec3(0, 0, 0),
    _lrot: makeQuat(),
    _lscale: makeVec3(1, 1, 1),
    _mobility: 0,
    _layer: 33554432,
    _euler: makeVec3(0, 0, 0),
    _id: opts.id || nextId(name),
  };
  return node;
}

function makeUITransform(nodeId, opts = {}) {
  return {
    __type__: 'cc.UITransform',
    _name: '',
    _objFlags: 0,
    __editorExtras__: {},
    node: { __id__: nodeId },
    _enabled: true,
    __prefab: { __id__: 0 },
    _contentSize: opts.size ? makeSize(opts.size[0], opts.size[1]) : makeSize(100, 40),
    _anchorPoint: makeVec2(0.5, 0.5),
    _id: nextId('UITransform'),
  };
}

function makeWidget(nodeId, opts = {}) {
  return {
    __type__: 'cc.Widget',
    _name: '',
    _objFlags: 0,
    __editorExtras__: {},
    node: { __id__: nodeId },
    _enabled: true,
    __prefab: { __id__: 0 },
    _alignFlags: 45,
    _target: null,
    _left: opts.left !== undefined ? opts.left : 0,
    _right: opts.right !== undefined ? opts.right : 0,
    _top: opts.top !== undefined ? opts.top : 0,
    _bottom: opts.bottom !== undefined ? opts.bottom : 0,
    _horizontalCenter: 0,
    _verticalCenter: 0,
    _isAbsLeft: true,
    _isAbsRight: true,
    _isAbsTop: true,
    _isAbsBottom: true,
    _isAbsHorizontalCenter: true,
    _isAbsVerticalCenter: true,
    _originalWidth: 0,
    _originalHeight: 0,
    _alignMode: 2,
    _lockFlags: 0,
    _id: nextId('Widget'),
  };
}

function makeLabel(nodeId, opts = {}) {
  return {
    __type__: 'cc.Label',
    _name: '',
    _objFlags: 0,
    __editorExtras__: {},
    node: { __id__: nodeId },
    _enabled: true,
    __prefab: { __id__: 0 },
    _visFlags: 0,
    _actualString: null,
    _string: opts.text || '',
    _font: null,
    _fontSize: opts.fontSize || 20,
    _lineHeight: opts.lineHeight || (opts.fontSize ? opts.fontSize + 8 : 28),
    _enableWrapText: true,
    _isSystemFontUsed: true,
    _spacingX: 0,
    _isItalic: false,
    _isBold: false,
    _isUnderline: false,
    _underlineColor: makeColor(0, 0, 0, 255),
    _cacheMode: 0,
    _enableOutline: false,
    _outlineColor: makeColor(0, 0, 0, 255),
    _outlineWidth: 2,
    _enableShadow: false,
    _shadowColor: makeColor(0, 0, 0, 255),
    _shadowOffset: makeVec2(2, 2),
    _shadowBlur: 2,
    _overflow: 1,
    _horizontalAlign: 1,
    _verticalAlign: 1,
    _color: opts.color ? makeColor(opts.color[0], opts.color[1], opts.color[2], opts.color[3]) : makeColor(255, 255, 255, 255),
    _id: nextId('Label'),
  };
}

function makeButton(nodeId, opts = {}) {
  return {
    __type__: 'cc.Button',
    _name: '',
    _objFlags: 0,
    __editorExtras__: {},
    node: { __id__: nodeId },
    _enabled: true,
    __prefab: { __id__: 0 },
    clickEvents: [],
    _interactable: true,
    _transition: 3, // SCALE
    _normalColor: makeColor(214, 214, 214, 255),
    _hoverColor: makeColor(211, 211, 211, 255),
    _pressedColor: makeColor(255, 255, 255, 255),
    _disabledColor: makeColor(124, 124, 124, 255),
    _normalSprite: null,
    _hoverSprite: null,
    _pressedSprite: null,
    _disabledSprite: null,
    _duration: 0.1,
    _zoomScale: 0.95,
    _target: { __id__: nodeId },
    _id: nextId('Button'),
  };
}

function makeSprite(nodeId, opts = {}) {
  return {
    __type__: 'cc.Sprite',
    _name: '',
    _objFlags: 0,
    __editorExtras__: {},
    node: { __id__: nodeId },
    _enabled: true,
    __prefab: { __id__: 0 },
    _customMaterial: null,
    _srcBlendFactor: 2,
    _dstBlendFactor: 4,
    _color: opts.color ? makeColor(opts.color[0], opts.color[1], opts.color[2], opts.color[3]) : makeColor(255, 255, 255, 255),
    _spriteFrame: null,
    _type: 0,
    _fillType: 0,
    _sizeMode: 0,
    _fillCenter: makeVec2(0, 0),
    _fillStart: 0,
    _fillRange: 0,
    _isTrimmedMode: true,
    _useGrayscale: false,
    _atlas: null,
    _id: nextId('Sprite'),
  };
}

function makeLayout(nodeId, opts = {}) {
  return {
    __type__: 'cc.Layout',
    _name: '',
    _objFlags: 0,
    __editorExtras__: {},
    node: { __id__: nodeId },
    _enabled: true,
    __prefab: { __id__: 0 },
    _resizeMode: 0,
    _layoutType: opts.type || 2, // 2 = VERTICAL
    _cellSize: makeSize(40, 40),
    _startAxis: 0,
    _paddingLeft: opts.paddingLeft !== undefined ? opts.paddingLeft : 20,
    _paddingRight: opts.paddingRight !== undefined ? opts.paddingRight : 20,
    _paddingTop: opts.paddingTop !== undefined ? opts.paddingTop : 10,
    _paddingBottom: opts.paddingBottom !== undefined ? opts.paddingBottom : 10,
    _spacingX: opts.spacingX || 0,
    _spacingY: opts.spacingY !== undefined ? opts.spacingY : 8,
    _verticalDirection: 1,
    _horizontalDirection: 0,
    _affectedByScale: false,
    _isAlign: false,
    _id: nextId('Layout'),
  };
}

function makeScriptComponent(nodeId, scriptUuid) {
  return {
    __type__: scriptUuid,
    _name: '',
    _objFlags: 0,
    __editorExtras__: {},
    node: { __id__: nodeId },
    _enabled: true,
    __prefab: { __id__: 0 },
    _id: nextId('Script'),
  };
}

// ==================== Prefab 构建器 ====================

class PrefabBuilder {
  constructor(name) {
    this.name = name;
    this.objects = [];
    this.idMap = new Map(); // node name -> array index
    idCounter = 0;
  }

  // 添加 cc.Prefab 根对象（index 0）
  addPrefabRoot(rootNodeIdx = 1) {
    this.objects.push({
      __type__: 'cc.Prefab',
      _name: this.name,
      _objFlags: 0,
      __editorExtras__: {},
      _native: '',
      data: { __id__: rootNodeIdx },
    });
    return this;
  }

  // 添加根节点
  addRootNode(name, opts = {}) {
    return this.addNode(name, null, opts);
  }

  // 添加节点
  addNode(name, parentIdx, opts = {}) {
    const idx = this.objects.length;
    const node = makeNode(name, parentIdx, {
      active: opts.active,
      pos: opts.pos,
      size: opts.size,
      id: this.name + '-' + name,
    });

    // 添加 _children 数组
    node._children = [];

    this.objects.push(node);

    // 如果是子节点，添加到父节点的 _children
    if (parentIdx !== null && parentIdx !== undefined) {
      this.objects[parentIdx]._children.push({ __id__: idx });
    }

    // 始终添加 UITransform
    const uitIdx = this.objects.length;
    const uit = makeUITransform(idx, { size: opts.size });
    this.objects.push(uit);
    node._components.push({ __id__: uitIdx });

    this.idMap.set(name, idx);
    return idx;
  }

  // 给节点添加组件
  addComponent(nodeIdx, compType, opts = {}) {
    const compIdx = this.objects.length;
    let comp;

    switch (compType) {
      case 'Widget':
        comp = makeWidget(nodeIdx, opts);
        break;
      case 'Label':
        comp = makeLabel(nodeIdx, opts);
        break;
      case 'Button':
        comp = makeButton(nodeIdx, opts);
        break;
      case 'Sprite':
        comp = makeSprite(nodeIdx, opts);
        break;
      case 'Layout':
        comp = makeLayout(nodeIdx, opts);
        break;
      default:
        // 脚本组件
        if (SCRIPT_UUIDS[compType]) {
          comp = makeScriptComponent(nodeIdx, SCRIPT_UUIDS[compType]);
        } else {
          throw new Error(`Unknown component type: ${compType}`);
        }
    }

    this.objects.push(comp);
    this.objects[nodeIdx]._components.push({ __id__: compIdx });
    return compIdx;
  }

  // 构建最终的 JSON 数组
  build() {
    return this.objects;
  }

  // 获取节点索引
  getNodeIdx(name) {
    return this.idMap.get(name);
  }
}

// ==================== 各 Panel 构建函数 ====================

function buildDungeonPanel() {
  const b = new PrefabBuilder('DungeonPanel');
  b.addPrefabRoot(1);

  // Root node
  const root = b.addRootNode('DungeonPanel', { size: [720, 1280] });
  b.addComponent(root, 'DungeonPanel');
  b.addComponent(root, 'Widget');

  // PanelRoot
  const panelRoot = b.addNode('PanelRoot', root, { size: [720, 700] });

  // TitleLabel
  const titleLabel = b.addNode('TitleLabel', panelRoot, { pos: [0, 280], size: [600, 60] });
  b.addComponent(titleLabel, 'Label', { text: '选择地牢', fontSize: 36, color: [255, 215, 0, 255] });

  // PowerLabel
  const powerLabel = b.addNode('PowerLabel', panelRoot, { pos: [0, 230], size: [400, 40] });
  b.addComponent(powerLabel, 'Label', { text: '战力: 0', fontSize: 24, color: [255, 255, 255, 255] });

  // ContentNode
  const contentNode = b.addNode('ContentNode', panelRoot, { pos: [0, 0], size: [680, 400] });
  b.addComponent(contentNode, 'Layout');

  // EmptyHintLabel
  const emptyHint = b.addNode('EmptyHintLabel', panelRoot, { pos: [0, -240], size: [600, 40] });
  b.addComponent(emptyHint, 'Label', { text: '暂无可用的地牢', fontSize: 22, color: [158, 158, 158, 255] });

  // CloseButton
  const closeBtn = b.addNode('CloseButton', panelRoot, { pos: [310, 310], size: [60, 60] });
  b.addComponent(closeBtn, 'Button');
  b.addComponent(closeBtn, 'Label', { text: '✕', fontSize: 28, color: [255, 255, 255, 255] });

  return b.build();
}

function buildDungeonNodeMapPanel() {
  const b = new PrefabBuilder('DungeonNodeMapPanel');
  b.addPrefabRoot(1);

  const root = b.addRootNode('DungeonNodeMapPanel', { size: [720, 1280] });
  b.addComponent(root, 'DungeonNodeMapPanel');
  b.addComponent(root, 'Widget');

  const panelRoot = b.addNode('PanelRoot', root, { size: [720, 700] });

  // LayerTitleLabel
  const layerTitle = b.addNode('LayerTitleLabel', panelRoot, { pos: [0, 300], size: [500, 50] });
  b.addComponent(layerTitle, 'Label', { text: '第 1 层', fontSize: 32, color: [255, 215, 0, 255] });

  // NodeListContainer
  const nodeList = b.addNode('NodeListContainer', panelRoot, { pos: [0, 40], size: [680, 400] });
  b.addComponent(nodeList, 'Layout');

  // InfoLabel
  const infoLabel = b.addNode('InfoLabel', panelRoot, { pos: [0, -280], size: [600, 30] });
  b.addComponent(infoLabel, 'Label', { text: '', fontSize: 18, color: [158, 158, 158, 255] });

  // CloseButton
  const closeBtn = b.addNode('CloseButton', panelRoot, { pos: [310, 310], size: [60, 60] });
  b.addComponent(closeBtn, 'Button');
  b.addComponent(closeBtn, 'Label', { text: '✕', fontSize: 28, color: [255, 255, 255, 255] });

  // ForkPanel
  const forkPanel = b.addNode('ForkPanel', panelRoot, { active: false, pos: [0, -200], size: [680, 200] });
  // ForkTitleLabel
  const forkTitle = b.addNode('ForkTitleLabel', forkPanel, { pos: [0, 80], size: [500, 50] });
  b.addComponent(forkTitle, 'Label', { text: '选择前进方向', fontSize: 28, color: [255, 215, 0, 255] });
  // ForkChoiceContainer
  const forkChoice = b.addNode('ForkChoiceContainer', forkPanel, { pos: [0, 0], size: [600, 160] });
  b.addComponent(forkChoice, 'Layout');

  return b.build();
}

function buildRoguelikeHUD() {
  const b = new PrefabBuilder('RoguelikeHUD');
  b.addPrefabRoot(1);

  const root = b.addRootNode('RoguelikeHUD', { size: [720, 1280] });
  b.addComponent(root, 'RoguelikeHUD');
  b.addComponent(root, 'Widget');

  const panelRoot = b.addNode('PanelRoot', root, { pos: [0, 540], size: [720, 160] });

  // DungeonNameLabel
  const nameLabel = b.addNode('DungeonNameLabel', panelRoot, { pos: [-200, 600], size: [300, 36] });
  b.addComponent(nameLabel, 'Label', { text: '地牢名称', fontSize: 22, color: [255, 215, 0, 255] });

  // FloorLabel
  const floorLabel = b.addNode('FloorLabel', panelRoot, { pos: [200, 600], size: [200, 36] });
  b.addComponent(floorLabel, 'Label', { text: '1 / 3', fontSize: 22, color: [255, 255, 255, 255] });

  // ProgressFill
  const progressFill = b.addNode('ProgressFill', panelRoot, { pos: [-200, 570], size: [300, 16] });
  b.addComponent(progressFill, 'Sprite', { color: [105, 240, 174, 255] });

  // ProgressLabel
  const progressLabel = b.addNode('ProgressLabel', panelRoot, { pos: [40, 570], size: [80, 20] });
  b.addComponent(progressLabel, 'Label', { text: '0%', fontSize: 16, color: [255, 255, 255, 255] });

  // GoldLabel
  const goldLabel = b.addNode('GoldLabel', panelRoot, { pos: [-260, 540], size: [200, 32] });
  b.addComponent(goldLabel, 'Label', { text: '💰 0', fontSize: 20, color: [255, 215, 0, 255] });

  // ExpLabel
  const expLabel = b.addNode('ExpLabel', panelRoot, { pos: [0, 540], size: [200, 32] });
  b.addComponent(expLabel, 'Label', { text: '✨ 0', fontSize: 20, color: [179, 136, 255, 255] });

  // SeedLabel
  const seedLabel = b.addNode('SeedLabel', panelRoot, { pos: [-260, 510], size: [250, 22] });
  b.addComponent(seedLabel, 'Label', { text: '种子: ---', fontSize: 14, color: [158, 158, 158, 255] });

  // PauseButton
  const pauseBtn = b.addNode('PauseButton', panelRoot, { pos: [310, 600], size: [56, 56] });
  b.addComponent(pauseBtn, 'Button');
  b.addComponent(pauseBtn, 'Label', { text: '⏸', fontSize: 28, color: [255, 255, 255, 255] });

  return b.build();
}

function buildArtifactPanel() {
  const b = new PrefabBuilder('ArtifactPanel');
  b.addPrefabRoot(1);

  const root = b.addRootNode('ArtifactPanel', { size: [720, 1280] });
  b.addComponent(root, 'ArtifactPanel');
  b.addComponent(root, 'Widget');

  const panelRoot = b.addNode('PanelRoot', root, { size: [720, 700] });

  // TitleLabel
  const titleLabel = b.addNode('TitleLabel', panelRoot, { pos: [0, 300], size: [300, 50] });
  b.addComponent(titleLabel, 'Label', { text: '神器', fontSize: 32, color: [255, 215, 0, 255] });

  // ActiveArtifactLabel
  const activeLabel = b.addNode('ActiveArtifactLabel', panelRoot, { pos: [0, 250], size: [500, 32] });
  b.addComponent(activeLabel, 'Label', { text: '未激活任何神器', fontSize: 20, color: [105, 240, 174, 255] });

  // ArtifactListContainer
  const listContainer = b.addNode('ArtifactListContainer', panelRoot, { pos: [0, 20], size: [680, 380] });
  b.addComponent(listContainer, 'Layout');

  // EmptyHintLabel
  const emptyHint = b.addNode('EmptyHintLabel', panelRoot, { pos: [0, -240], size: [600, 40] });
  b.addComponent(emptyHint, 'Label', { text: '尚未获得任何神器', fontSize: 22, color: [158, 158, 158, 255] });

  // CloseButton
  const closeBtn = b.addNode('CloseButton', panelRoot, { pos: [310, 310], size: [60, 60] });
  b.addComponent(closeBtn, 'Button');
  b.addComponent(closeBtn, 'Label', { text: '✕', fontSize: 28, color: [255, 255, 255, 255] });

  // TooltipNode
  const tooltip = b.addNode('TooltipNode', panelRoot, { active: false, pos: [200, 0], size: [300, 140] });
  b.addComponent(tooltip, 'Sprite', { color: [40, 40, 40, 230] });
  // TooltipNameLabel
  const tooltipName = b.addNode('TooltipNameLabel', tooltip, { pos: [0, 40], size: [280, 36] });
  b.addComponent(tooltipName, 'Label', { text: '', fontSize: 24, color: [255, 215, 0, 255] });
  // TooltipEffectLabel
  const tooltipEffect = b.addNode('TooltipEffectLabel', tooltip, { pos: [0, -10], size: [280, 80] });
  b.addComponent(tooltipEffect, 'Label', { text: '', fontSize: 18, color: [255, 255, 255, 255] });
  // TooltipLevelLabel
  const tooltipLevel = b.addNode('TooltipLevelLabel', tooltip, { pos: [0, -60], size: [280, 24] });
  b.addComponent(tooltipLevel, 'Label', { text: '', fontSize: 16, color: [158, 158, 158, 255] });

  return b.build();
}

function buildLiveOpsPanel() {
  const b = new PrefabBuilder('LiveOpsPanel');
  b.addPrefabRoot(1);

  const root = b.addRootNode('LiveOpsPanel', { size: [720, 1280] });
  b.addComponent(root, 'LiveOpsPanel');
  b.addComponent(root, 'Widget');

  const panelRoot = b.addNode('PanelRoot', root, { size: [720, 700] });

  // TitleLabel
  const titleLabel = b.addNode('TitleLabel', panelRoot, { pos: [0, 300], size: [300, 50] });
  b.addComponent(titleLabel, 'Label', { text: '限时活动', fontSize: 32, color: [255, 215, 0, 255] });

  // LastRefreshLabel
  const refreshLabel = b.addNode('LastRefreshLabel', panelRoot, { pos: [0, 255], size: [400, 24] });
  b.addComponent(refreshLabel, 'Label', { text: '', fontSize: 16, color: [158, 158, 158, 255] });

  // CardListContainer
  const cardList = b.addNode('CardListContainer', panelRoot, { pos: [0, 20], size: [680, 400] });
  b.addComponent(cardList, 'Layout');

  // EmptyHintLabel
  const emptyHint = b.addNode('EmptyHintLabel', panelRoot, { pos: [0, -240], size: [600, 40] });
  b.addComponent(emptyHint, 'Label', { text: '暂无限时活动', fontSize: 22, color: [158, 158, 158, 255] });

  // CloseButton
  const closeBtn = b.addNode('CloseButton', panelRoot, { pos: [310, 310], size: [60, 60] });
  b.addComponent(closeBtn, 'Button');
  b.addComponent(closeBtn, 'Label', { text: '✕', fontSize: 28, color: [255, 255, 255, 255] });

  return b.build();
}

function buildEventPanel() {
  const b = new PrefabBuilder('EventPanel');
  b.addPrefabRoot(1);

  const root = b.addRootNode('EventPanel', { size: [720, 1280] });
  b.addComponent(root, 'EventPanel');
  b.addComponent(root, 'Widget');

  const panelRoot = b.addNode('PanelRoot', root, { size: [720, 700] });

  // TitleLabel
  const titleLabel = b.addNode('TitleLabel', panelRoot, { pos: [0, 280], size: [600, 44] });
  b.addComponent(titleLabel, 'Label', { text: '', fontSize: 28, color: [255, 215, 0, 255] });

  // CategoryLabel
  const catLabel = b.addNode('CategoryLabel', panelRoot, { pos: [0, 235], size: [300, 32] });
  b.addComponent(catLabel, 'Label', { text: '', fontSize: 20, color: [158, 158, 158, 255] });

  // DescriptionLabel
  const descLabel = b.addNode('DescriptionLabel', panelRoot, { pos: [0, 160], size: [600, 120] });
  b.addComponent(descLabel, 'Label', { text: '', fontSize: 20, color: [255, 255, 255, 255] });

  // RewardPreviewLabel
  const rewardPreview = b.addNode('RewardPreviewLabel', panelRoot, { pos: [0, 80], size: [500, 32] });
  b.addComponent(rewardPreview, 'Label', { text: '', fontSize: 18, color: [105, 240, 174, 255] });

  // ChoiceContainer
  const choiceContainer = b.addNode('ChoiceContainer', panelRoot, { pos: [0, -20], size: [600, 180] });
  b.addComponent(choiceContainer, 'Layout');

  // SkipButton
  const skipBtn = b.addNode('SkipButton', panelRoot, { pos: [0, -240], size: [160, 50] });
  b.addComponent(skipBtn, 'Button');
  b.addComponent(skipBtn, 'Label', { text: '跳过', fontSize: 22, color: [158, 158, 158, 255] });

  // ConfirmButton
  const confirmBtn = b.addNode('ConfirmButton', panelRoot, { pos: [0, -240], size: [160, 50] });
  b.addComponent(confirmBtn, 'Button');
  b.addComponent(confirmBtn, 'Label', { text: '确认', fontSize: 22, color: [105, 240, 174, 255] });

  // ResultPanel (in-event result)
  const resultPanel = b.addNode('ResultPanel', panelRoot, { active: false, pos: [0, 0], size: [500, 300] });
  // ResultTextLabel
  const resultText = b.addNode('ResultTextLabel', resultPanel, { pos: [0, 0], size: [400, 200] });
  b.addComponent(resultText, 'Label', { text: '', fontSize: 22, color: [255, 255, 255, 255] });

  return b.build();
}

function buildResultPanel() {
  const b = new PrefabBuilder('ResultPanel');
  b.addPrefabRoot(1);

  const root = b.addRootNode('ResultPanel', { size: [720, 1280] });
  b.addComponent(root, 'ResultPanel');
  b.addComponent(root, 'Widget');

  const panelRoot = b.addNode('PanelRoot', root, { size: [720, 700] });

  // TitleLabel
  const titleLabel = b.addNode('TitleLabel', panelRoot, { pos: [0, 280], size: [500, 56] });
  b.addComponent(titleLabel, 'Label', { text: '✨ 结算 ✨', fontSize: 36, color: [255, 215, 0, 255] });

  // SubtitleLabel
  const subtitleLabel = b.addNode('SubtitleLabel', panelRoot, { pos: [0, 220], size: [500, 36] });
  b.addComponent(subtitleLabel, 'Label', { text: '', fontSize: 22, color: [255, 255, 255, 255] });

  // RewardContainer
  const rewardContainer = b.addNode('RewardContainer', panelRoot, { pos: [0, 40], size: [680, 250] });
  b.addComponent(rewardContainer, 'Layout');

  // ExpGainLabel
  const expLabel = b.addNode('ExpGainLabel', panelRoot, { pos: [-150, -160], size: [250, 32] });
  b.addComponent(expLabel, 'Label', { text: '经验 +0', fontSize: 22, color: [179, 136, 255, 255] });

  // GoldGainLabel
  const goldLabel = b.addNode('GoldGainLabel', panelRoot, { pos: [150, -160], size: [250, 32] });
  b.addComponent(goldLabel, 'Label', { text: '金币 +0', fontSize: 22, color: [255, 215, 0, 255] });

  // DurationLabel
  const durLabel = b.addNode('DurationLabel', panelRoot, { pos: [0, -200], size: [300, 24] });
  b.addComponent(durLabel, 'Label', { text: '', fontSize: 16, color: [158, 158, 158, 255] });

  // ContinueButton
  const continueBtn = b.addNode('ContinueButton', panelRoot, { active: false, pos: [100, -280], size: [180, 56] });
  b.addComponent(continueBtn, 'Button');
  // ContinueButtonLabel
  const continueLabel = b.addNode('ContinueButtonLabel', continueBtn, { pos: [0, 0], size: [160, 40] });
  b.addComponent(continueLabel, 'Label', { text: '继续', fontSize: 24, color: [255, 255, 255, 255] });

  // ReturnButton
  const returnBtn = b.addNode('ReturnButton', panelRoot, { pos: [-100, -280], size: [180, 56] });
  b.addComponent(returnBtn, 'Button');
  b.addComponent(returnBtn, 'Label', { text: '返回', fontSize: 24, color: [255, 255, 255, 255] });

  return b.build();
}

// ==================== 各 Item 构建函数 ====================

function buildDungeonItem() {
  const b = new PrefabBuilder('DungeonItem');
  b.addPrefabRoot(1);

  const root = b.addRootNode('DungeonItem', { size: [660, 120] });
  b.addComponent(root, 'DungeonItemTemplate');

  // Background
  const bg = b.addNode('Background', root, { pos: [0, 0], size: [660, 120] });
  b.addComponent(bg, 'Sprite', { color: [30, 30, 40, 255] });

  // NameLabel
  const nameLabel = b.addNode('NameLabel', root, { pos: [-280, 30], size: [300, 36] });
  b.addComponent(nameLabel, 'Label', { text: '地牢名称', fontSize: 24, color: [255, 255, 255, 255] });

  // LayerLabel
  const layerLabel = b.addNode('LayerLabel', root, { pos: [-280, -10], size: [200, 28] });
  b.addComponent(layerLabel, 'Label', { text: '层数', fontSize: 18, color: [158, 158, 158, 255] });

  // PowerLabel
  const powerLabel = b.addNode('PowerLabel', root, { pos: [80, -10], size: [200, 28] });
  b.addComponent(powerLabel, 'Label', { text: '战力', fontSize: 18, color: [255, 255, 255, 255] });

  // RewardLabel
  const rewardLabel = b.addNode('RewardLabel', root, { pos: [80, 30], size: [200, 24] });
  b.addComponent(rewardLabel, 'Label', { text: '奖励', fontSize: 16, color: [255, 215, 0, 255] });

  // EnterButton
  const enterBtn = b.addNode('EnterButton', root, { pos: [270, 0], size: [80, 48] });
  b.addComponent(enterBtn, 'Button');
  const enterBtnLabel = b.addNode('Label', enterBtn, { pos: [0, 0], size: [60, 32] });
  b.addComponent(enterBtnLabel, 'Label', { text: '进入', fontSize: 20, color: [255, 255, 255, 255] });

  // LockMask
  const lockMask = b.addNode('LockMask', root, { active: false, pos: [0, 0], size: [660, 120] });
  b.addComponent(lockMask, 'Sprite', { color: [128, 128, 128, 180] });

  return b.build();
}

function buildNodeMapItem() {
  const b = new PrefabBuilder('NodeMapItem');
  b.addPrefabRoot(1);

  const root = b.addRootNode('NodeMapItem', { size: [640, 80] });
  b.addComponent(root, 'NodeMapItemTemplate');

  // Icon
  const icon = b.addNode('Icon', root, { pos: [-280, 0], size: [48, 48] });
  b.addComponent(icon, 'Label', { text: '⬜', fontSize: 32, color: [255, 255, 255, 255] });

  // NameLabel
  const nameLabel = b.addNode('NameLabel', root, { pos: [-180, 0], size: [300, 32] });
  b.addComponent(nameLabel, 'Label', { text: '节点名称', fontSize: 20, color: [255, 255, 255, 255] });

  // StatusIndicator
  const status = b.addNode('StatusIndicator', root, { pos: [240, 0], size: [24, 24] });
  b.addComponent(status, 'Sprite', { color: [158, 158, 158, 255] });

  // EnterButton
  const enterBtn = b.addNode('EnterButton', root, { pos: [280, 0], size: [72, 44] });
  b.addComponent(enterBtn, 'Button');
  const enterLabel = b.addNode('Label', enterBtn, { pos: [0, 0], size: [56, 28] });
  b.addComponent(enterLabel, 'Label', { text: '进入', fontSize: 18, color: [255, 255, 255, 255] });

  return b.build();
}

function buildForkChoiceItem() {
  const b = new PrefabBuilder('ForkChoiceItem');
  b.addPrefabRoot(1);

  const root = b.addRootNode('ForkChoiceItem', { size: [600, 70] });
  b.addComponent(root, 'ForkChoiceTemplate');

  // ChoiceLabel
  const choiceLabel = b.addNode('ChoiceLabel', root, { pos: [-200, 0], size: [350, 32] });
  b.addComponent(choiceLabel, 'Label', { text: '选择', fontSize: 20, color: [255, 255, 255, 255] });

  // PreviewLabel
  const previewLabel = b.addNode('PreviewLabel', root, { pos: [100, 0], size: [200, 24] });
  b.addComponent(previewLabel, 'Label', { text: '', fontSize: 16, color: [105, 240, 174, 255] });

  // TypeIcon
  const typeIcon = b.addNode('TypeIcon', root, { pos: [270, 0], size: [32, 32] });
  b.addComponent(typeIcon, 'Label', { text: '⚠️', fontSize: 24, color: [255, 215, 0, 255] });

  return b.build();
}

function buildArtifactItem() {
  const b = new PrefabBuilder('ArtifactItem');
  b.addPrefabRoot(1);

  const root = b.addRootNode('ArtifactItem', { size: [660, 100] });
  b.addComponent(root, 'ArtifactItemTemplate');

  // Background
  const bg = b.addNode('Background', root, { pos: [0, 0], size: [660, 100] });
  b.addComponent(bg, 'Sprite', { color: [30, 30, 40, 255] });

  // NameLabel
  const nameLabel = b.addNode('NameLabel', root, { pos: [-250, 18], size: [250, 34] });
  b.addComponent(nameLabel, 'Label', { text: '神器名称', fontSize: 22, color: [255, 255, 255, 255] });

  // RarityLabel
  const rarityLabel = b.addNode('RarityLabel', root, { pos: [50, 18], size: [150, 26] });
  b.addComponent(rarityLabel, 'Label', { text: 'SR', fontSize: 16, color: [179, 136, 255, 255] });

  // LevelLabel
  const levelLabel = b.addNode('LevelLabel', root, { pos: [-250, -18], size: [150, 26] });
  b.addComponent(levelLabel, 'Label', { text: 'Lv.1', fontSize: 16, color: [158, 158, 158, 255] });

  // ActiveIndicator
  const activeIndicator = b.addNode('ActiveIndicator', root, { active: false, pos: [260, 18], size: [16, 16] });
  b.addComponent(activeIndicator, 'Sprite', { color: [105, 240, 174, 255] });

  // LockedMask
  const lockedMask = b.addNode('LockedMask', root, { active: false, pos: [0, 0], size: [660, 100] });
  b.addComponent(lockedMask, 'Sprite', { color: [80, 80, 80, 180] });

  // ActivateButton
  const activateBtn = b.addNode('ActivateButton', root, { active: true, pos: [260, -18], size: [80, 40] });
  b.addComponent(activateBtn, 'Button');
  const activateLabel = b.addNode('Label', activateBtn, { pos: [0, 0], size: [64, 28] });
  b.addComponent(activateLabel, 'Label', { text: '激活', fontSize: 18, color: [255, 255, 255, 255] });

  return b.build();
}

function buildLiveOpsCard() {
  const b = new PrefabBuilder('LiveOpsCard');
  b.addPrefabRoot(1);

  const root = b.addRootNode('LiveOpsCard', { size: [660, 130] });
  b.addComponent(root, 'LiveOpsCardTemplate');

  // NameLabel
  const nameLabel = b.addNode('NameLabel', root, { pos: [-250, 40], size: [300, 36] });
  b.addComponent(nameLabel, 'Label', { text: '活动名称', fontSize: 24, color: [255, 255, 255, 255] });

  // StatusLabel
  const statusLabel = b.addNode('StatusLabel', root, { pos: [150, 40], size: [200, 28] });
  b.addComponent(statusLabel, 'Label', { text: '进行中', fontSize: 18, color: [105, 240, 174, 255] });

  // CountdownLabel
  const countdownLabel = b.addNode('CountdownLabel', root, { pos: [-250, 5], size: [250, 28] });
  b.addComponent(countdownLabel, 'Label', { text: '剩余: 00:00:00', fontSize: 18, color: [158, 158, 158, 255] });

  // RewardLabel
  const rewardLabel = b.addNode('RewardLabel', root, { pos: [-250, -30], size: [300, 24] });
  b.addComponent(rewardLabel, 'Label', { text: '奖励预览', fontSize: 16, color: [255, 215, 0, 255] });

  // TagLabel
  const tagLabel = b.addNode('TagLabel', root, { pos: [200, 5], size: [100, 22] });
  b.addComponent(tagLabel, 'Label', { text: '限时', fontSize: 14, color: [255, 100, 100, 255] });

  // EnterButton
  const enterBtn = b.addNode('EnterButton', root, { pos: [260, -20], size: [90, 44] });
  b.addComponent(enterBtn, 'Button');
  const enterLabel = b.addNode('Label', enterBtn, { pos: [0, 0], size: [70, 28] });
  b.addComponent(enterLabel, 'Label', { text: '进入', fontSize: 18, color: [255, 255, 255, 255] });

  return b.build();
}

function buildEventChoiceButton() {
  const b = new PrefabBuilder('EventChoiceButton');
  b.addPrefabRoot(1);

  const root = b.addRootNode('EventChoiceButton', { size: [580, 70] });
  b.addComponent(root, 'EventChoiceTemplate');
  b.addComponent(root, 'Button');

  // TextLabel
  const textLabel = b.addNode('TextLabel', root, { pos: [0, 8], size: [500, 32] });
  b.addComponent(textLabel, 'Label', { text: '选项文字', fontSize: 20, color: [255, 255, 255, 255] });

  // PreviewLabel
  const previewLabel = b.addNode('PreviewLabel', root, { pos: [0, -18], size: [400, 24] });
  b.addComponent(previewLabel, 'Label', { text: '预览', fontSize: 16, color: [105, 240, 174, 255] });

  // RiskIndicator
  const riskIndicator = b.addNode('RiskIndicator', root, { active: false, pos: [260, 0], size: [24, 24] });
  b.addComponent(riskIndicator, 'Label', { text: '⚠️', fontSize: 20, color: [255, 100, 100, 255] });

  return b.build();
}

function buildRewardItem() {
  const b = new PrefabBuilder('RewardItem');
  b.addPrefabRoot(1);

  const root = b.addRootNode('RewardItem', { size: [180, 80] });
  b.addComponent(root, 'RewardItemTemplate');

  // Icon
  const icon = b.addNode('Icon', root, { pos: [0, 15], size: [40, 40] });
  b.addComponent(icon, 'Label', { text: '📦', fontSize: 28, color: [255, 255, 255, 255] });

  // NameLabel
  const nameLabel = b.addNode('NameLabel', root, { pos: [0, -15], size: [160, 28] });
  b.addComponent(nameLabel, 'Label', { text: '奖励名称', fontSize: 18, color: [255, 255, 255, 255] });

  // QtyLabel
  const qtyLabel = b.addNode('QtyLabel', root, { pos: [0, -40], size: [80, 28] });
  b.addComponent(qtyLabel, 'Label', { text: 'x1', fontSize: 18, color: [255, 215, 0, 255] });

  return b.build();
}

// ==================== .meta 文件生成 ====================

function generateUUID() {
  // Generate a v4 UUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function generatePrefabMeta(prefabName, isPanel) {
  const uuid = generateUUID();
  const dirUUID = isPanel
    ? '64e1512e-d93b-44dc-b9fb-1008598badf1'
    : '7de40de7-665a-45ed-b180-69cabd9837ee';

  return {
    ver: '1.2.0',
    importer: 'prefab',
    imported: true,
    uuid,
    files: [],
    subMetas: {},
    userData: {
      prefabName: prefabName,
      phase8Generated: true,
      generatedAt: new Date().toISOString(),
    },
  };
}

// ==================== 主入口 ====================

function main() {
  console.log('Phase8 Prefab Generator — 开始生成...\n');

  // 确保目录存在
  [PANELS_DIR, ITEMS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`  创建目录: ${dir}`);
    }
  });

  const panelBuilders = [
    { name: 'DungeonPanel', build: buildDungeonPanel },
    { name: 'DungeonNodeMapPanel', build: buildDungeonNodeMapPanel },
    { name: 'RoguelikeHUD', build: buildRoguelikeHUD },
    { name: 'ArtifactPanel', build: buildArtifactPanel },
    { name: 'LiveOpsPanel', build: buildLiveOpsPanel },
    { name: 'EventPanel', build: buildEventPanel },
    { name: 'ResultPanel', build: buildResultPanel },
  ];

  const itemBuilders = [
    { name: 'DungeonItem', build: buildDungeonItem },
    { name: 'NodeMapItem', build: buildNodeMapItem },
    { name: 'ForkChoiceItem', build: buildForkChoiceItem },
    { name: 'ArtifactItem', build: buildArtifactItem },
    { name: 'LiveOpsCard', build: buildLiveOpsCard },
    { name: 'EventChoiceButton', build: buildEventChoiceButton },
    { name: 'RewardItem', build: buildRewardItem },
  ];

  let totalObjects = 0;
  const generatedFiles = [];

  // 生成 Panel Prefab
  console.log('--- Panel Prefab ---');
  for (const { name, build } of panelBuilders) {
    const objects = build();
    const filePath = path.join(PANELS_DIR, `${name}.prefab`);
    fs.writeFileSync(filePath, JSON.stringify(objects, null, 2), 'utf8');
    generatedFiles.push(filePath);

    // .meta 文件
    const meta = generatePrefabMeta(name, true);
    const metaPath = filePath + '.meta';
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
    generatedFiles.push(metaPath);

    console.log(`  ✅ ${name}.prefab (${objects.length} objects) [uuid: ${meta.uuid}]`);
    totalObjects += objects.length;
  }

  // 生成 Item Prefab
  console.log('\n--- Item Prefab ---');
  for (const { name, build } of itemBuilders) {
    const objects = build();
    const filePath = path.join(ITEMS_DIR, `${name}.prefab`);
    fs.writeFileSync(filePath, JSON.stringify(objects, null, 2), 'utf8');
    generatedFiles.push(filePath);

    // .meta 文件
    const meta = generatePrefabMeta(name, false);
    const metaPath = filePath + '.meta';
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
    generatedFiles.push(metaPath);

    console.log(`  ✅ ${name}.prefab (${objects.length} objects) [uuid: ${meta.uuid}]`);
    totalObjects += objects.length;
  }

  console.log(`\n========================================`);
  console.log(`  生成完成!`);
  console.log(`  Panel Prefab: ${panelBuilders.length} 个`);
  console.log(`  Item Prefab: ${itemBuilders.length} 个`);
  console.log(`  总对象数: ${totalObjects}`);
  console.log(`  总文件数: ${generatedFiles.length}`);
  console.log(`========================================`);

  // 验证
  let allValid = true;
  for (const fp of generatedFiles.filter(f => f.endsWith('.prefab'))) {
    const exists = fs.existsSync(fp);
    const metaExists = fs.existsSync(fp + '.meta');

    if (!exists) {
      console.error(`  ❌ Missing: ${path.basename(fp)}`);
      allValid = false;
    }
    if (!metaExists) {
      console.error(`  ❌ Missing meta: ${path.basename(fp)}.meta`);
      allValid = false;
    }
  }

  if (allValid) {
    console.log(`\n✅ 所有文件验证通过`);
  }

  return { generatedFiles, totalObjects, allValid };
}

main();
