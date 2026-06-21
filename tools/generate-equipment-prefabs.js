// ============================================================
// generate-equipment-prefabs.js — Phase10-Step8 Prefab Generator
// Generates all 5 Equipment UI V2 prefabs for Cocos Creator 3.x
// Uses correct array-index-based __id__ references
// ============================================================

const fs = require('fs');
const path = require('path');

// ==================== UUID Compression (Cocos Creator 3.x) ====================

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function compressUuid(uuid) {
  const hex = uuid.replace(/-/g, '');
  let out = hex.substring(0, 5);
  for (let i = 5; i < hex.length; i += 3) {
    const a = parseInt(hex[i], 16) || 0;
    const b = parseInt(hex[i + 1], 16) || 0;
    const c = parseInt(hex[i + 2], 16) || 0;
    out += B64[(a << 2) | (b >> 2)];
    if (i + 2 < hex.length) out += B64[((b & 0x3) << 4) | c];
  }
  return out;
}

// ==================== Script UUIDs (from actual .meta files) ====================

const SCRIPT_UUIDS = {
  EquipmentPanel:   'fd274f49-b5d5-4940-92d0-1131d863d326',
  EquipmentSlotItem:'1fb33f53-ba73-4db1-9a7a-c76bf68c0696',
  EquipmentBagPanel:'fb89d971-e13e-43f8-aa9c-6d9e087e9125',
  EquipmentMediator:'679c94f0-3c9c-4535-b906-acd9a97076eb',
  EquipmentDetailPanel:'534fa1a8-9b12-44ad-8401-30d03ea10094',
  EquipmentItemView:'70da1968-b79c-40ba-839a-73b2feec494c',
};

const C = {};
for (const [k, u] of Object.entries(SCRIPT_UUIDS)) C[k] = compressUuid(u);

console.log('=== Compressed Script UUIDs ===');
for (const [k, u] of Object.entries(SCRIPT_UUIDS)) console.log(`  ${k}: ${compressUuid(u)}`);

// ==================== Prefab Meta UUIDs ====================

const PREFAB_META_UUIDS = {
  EquipmentSlotItem:   'c1a2b3d4-e5f6-7890-abcd-ef1234567890',
  EquipmentItemView:   'd2b3c4e5-f6a7-8901-bcde-f12345678901',
  EquipmentPanel:      'e3c4d5f6-a7b8-9012-cdef-123456789012',
  EquipmentBagPanel:   'f4d5e6a7-b8c9-0123-defa-234567890123',
  EquipmentDetailPanel:'a5e6f7b8-c9d0-1234-efab-345678901234',
};

// ==================== Type Helpers ====================

function V3(x,y,z) { return {__type__:'cc.Vec3',x,y,z}; }
function V2(x,y)   { return {__type__:'cc.Vec2',x,y}; }
function Sz(w,h)    { return {__type__:'cc.Size',width:w,height:h}; }
function Clr(r,g,b,a){return {__type__:'cc.Color',r,g,b,a}; }
function Qt()       { return {__type__:'cc.Quat',x:0,y:0,z:0,w:1}; }

// ==================== Array Builder ====================
// All __id__ references are array indices. We build incrementally.

class PrefabBuilder {
  constructor(name, rootIdStr) {
    this.arr = [];
    this.name = name;
    this.rootIdStr = rootIdStr;
    // Index 0 = prefab header (reserved)
    this.arr.push(null);
  }

  /** Add root node at index 1, returns its index */
  addRoot(name, layer) {
    const idx = this.arr.length;
    this.arr.push({
      __type__:'cc.Node', _name:name, _objFlags:0, __editorExtras:{},
      _parent:null, _children:[], _active:true, _components:[],
      _prefab:{__id__:0}, _lpos:V3(0,0,0), _lrot:Qt(), _lscale:V3(1,1,1),
      _mobility:0, _layer:layer||33554432, _euler:V3(0,0,0), _id:this.rootIdStr,
    });
    return idx;
  }

  /** Build and return child ref object for the root's _children */
  childRef(idx) { return {__id__:idx}; }

  /** Add UITransform component, return index */
  addUITransform(w, h, ax, ay, nodeIdx) {
    const idx = this.arr.length;
    this.arr.push({
      __type__:'cc.UITransform', _name:'', _objFlags:0, __editorExtras:{},
      node:{__id__:nodeIdx}, _enabled:true, __prefab:{__id__:0},
      _contentSize:Sz(w,h), _anchorPoint:V2(ax||0.5,ay||0.5), _id:`u${idx}`,
    });
    return idx;
  }

  /** Add Sprite component */
  addSprite(r,g,b,a, nodeIdx) {
    const idx = this.arr.length;
    this.arr.push({
      __type__:'cc.Sprite', _name:'', _objFlags:0, __editorExtras:{},
      node:{__id__:nodeIdx}, _enabled:true, __prefab:{__id__:0},
      _customMaterial:null, _srcBlendFactor:2, _dstBlendFactor:4,
      _color:Clr(r||255,g||255,b||255,a||255), _spriteFrame:null, _type:0,
      _fillType:0, _sizeMode:0, _fillCenter:V2(0,0), _fillStart:0, _fillRange:0,
      _isTrimmedMode:true, _useGrayscale:false, _atlas:null, _id:`s${idx}`,
    });
    return idx;
  }

  /** Add Label component */
  addLabel(text, fontSize, r, g, b, a, halign, valign, w, h, nodeIdx) {
    const idx = this.arr.length;
    this.arr.push({
      __type__:'cc.Label', _name:'', _objFlags:0, __editorExtras:{},
      node:{__id__:nodeIdx}, _enabled:true, __prefab:{__id__:0},
      _visFlags:0, _actualString:null, _string:text||'Label',
      _font:null, _fontSize:fontSize||20, _lineHeight:(fontSize||20)+8,
      _enableWrapText:true, _isSystemFontUsed:true, _spacingX:0,
      _isItalic:false, _isBold:false, _isUnderline:false,
      _underlineColor:Clr(0,0,0,255), _cacheMode:0, _enableOutline:false,
      _outlineColor:Clr(0,0,0,255), _outlineWidth:2, _enableShadow:false,
      _shadowColor:Clr(0,0,0,255), _shadowOffset:V2(2,2), _shadowBlur:2,
      _overflow:1, _horizontalAlign:halign||1, _verticalAlign:valign||1,
      _color:Clr(r||255,g||255,b||255,a||255), _id:`l${idx}`,
    });
    return idx;
  }

  /** Add Button component */
  addButton(nodeIdx) {
    const idx = this.arr.length;
    this.arr.push({
      __type__:'cc.Button', _name:'', _objFlags:0, __editorExtras:{},
      node:{__id__:nodeIdx}, _enabled:true, __prefab:{__id__:0},
      clickEvents:[], _interactable:true, _transition:3,
      _normalColor:Clr(214,214,214,255), _hoverColor:Clr(211,211,211,255),
      _pressedColor:Clr(255,255,255,255), _disabledColor:Clr(124,124,124,255),
      _normalSprite:null, _hoverSprite:null, _pressedSprite:null, _disabledSprite:null,
      _duration:0.1, _zoomScale:1.2, _target:null, _id:`b${idx}`,
    });
    return idx;
  }

  /** Add Layout component */
  addLayout(type, spacingY, nodeIdx) {
    const idx = this.arr.length;
    this.arr.push({
      __type__:'cc.Layout', _name:'', _objFlags:0, __editorExtras:{},
      node:{__id__:nodeIdx}, _enabled:true, __prefab:{__id__:0},
      _resizeMode:1, _layoutType:type||2, _cellSize:Sz(40,40), _startAxis:0,
      _paddingLeft:8, _paddingRight:8, _paddingTop:8, _paddingBottom:8,
      _spacingX:8, _spacingY:spacingY||8, _verticalDirection:1, _horizontalDirection:0,
      _constraint:0, _constraintNum:2, _affectedByScale:false, _isAlign:false, _id:`ly${idx}`,
    });
    return idx;
  }

  /** Add ScrollView component */
  addScrollView(contentRef, nodeIdx) {
    const idx = this.arr.length;
    this.arr.push({
      __type__:'cc.ScrollView', _name:'', _objFlags:0, __editorExtras:{},
      node:{__id__:nodeIdx}, _enabled:true, __prefab:{__id__:0},
      _content:contentRef, _horizontal:false, _vertical:true, _inertia:true,
      _brake:0.75, _elastic:true, _bounceDuration:0.15,
      _horizontalScrollBar:null, _verticalScrollBar:null,
      _scrollEvents:[], _cancelInnerEvents:true, _id:`sv${idx}`,
    });
    return idx;
  }

  /** Add a Script component with properties */
  addScript(compressedUuid, props, nodeIdx) {
    const idx = this.arr.length;
    this.arr.push({
      __type__:compressedUuid, _name:'', _objFlags:0, __editorExtras:{},
      node:{__id__:nodeIdx}, _enabled:true, __prefab:{__id__:0},
      ...props, _id:`sc${idx}`,
    });
    return idx;
  }

  /**
   * Create a complete child node with its components.
   * Returns { nodeIdx, compIndices: { uit, sprite?, label?, button?, layout?, scrollView? } }
   */
  addNode(name, parentIdx, posX, posY, active) {
    const nodeIdx = this.arr.length;
    this.arr.push({
      __type__:'cc.Node', _name:name, _objFlags:0, __editorExtras:{},
      _parent:{__id__:parentIdx}, _children:[], _active:active!==false,
      _components:[], _prefab:{__id__:0},
      _lpos:V3(posX,posY,0), _lrot:Qt(), _lscale:V3(1,1,1),
      _mobility:0, _layer:33554432, _euler:V3(0,0,0), _id:`n${nodeIdx}`,
    });
    return { nodeIdx };
  }

  /** Set the _children array on a node */
  setChildren(nodeIdx, childRefs) {
    this.arr[nodeIdx]._children = childRefs;
  }

  /** Set the _components array on a node */
  setComponents(nodeIdx, compRefs) {
    this.arr[nodeIdx]._components = compRefs;
  }

  /** Finalize and return the JSON array */
  finalize() {
    // Index 0 = prefab header
    this.arr[0] = {
      __type__:'cc.Prefab', _name:this.name, _objFlags:0, __editorExtras:{},
      _native:'', data:{__id__:1}, persistent:false,
    };
    return this.arr;
  }
}

// =====================================================================
// PREFAB: EquipmentSlotItem
// =====================================================================

function buildEquipmentSlotItem() {
  const b = new PrefabBuilder('EquipmentSlotItem', 'eqsi-root');
  const root = b.addRoot('EquipmentSlotItem');

  // borderNode (Sprite background)
  const borderN = b.addNode('Border', root, 0, 0);
  const borderUIt = b.addUITransform(180, 230, 0.5, 0.5, borderN.nodeIdx);
  const borderSprite = b.addSprite(40, 40, 50, 255, borderN.nodeIdx);
  b.setComponents(borderN.nodeIdx, [{__id__:borderUIt},{__id__:borderSprite}]);

  // iconNode (Sprite)
  const iconN = b.addNode('Icon', root, 0, 35);
  const iconUIt = b.addUITransform(80, 80, 0.5, 0.5, iconN.nodeIdx);
  const iconSprite = b.addSprite(255, 255, 255, 255, iconN.nodeIdx);
  b.setComponents(iconN.nodeIdx, [{__id__:iconUIt},{__id__:iconSprite}]);

  // slotNameLabel
  const snN = b.addNode('SlotNameLabel', root, 0, -20);
  const snUIt = b.addUITransform(160, 24, 0.5, 0.5, snN.nodeIdx);
  const snLbl = b.addLabel('武器', 14, 180, 180, 180, 255, 1, 1, 160, 24, snN.nodeIdx);
  b.setComponents(snN.nodeIdx, [{__id__:snUIt},{__id__:snLbl}]);

  // equipmentNameLabel
  const enN = b.addNode('EquipmentNameLabel', root, 0, -42);
  const enUIt = b.addUITransform(160, 24, 0.5, 0.5, enN.nodeIdx);
  const enLbl = b.addLabel('— 空 —', 16, 158, 158, 158, 255, 1, 1, 160, 24, enN.nodeIdx);
  b.setComponents(enN.nodeIdx, [{__id__:enUIt},{__id__:enLbl}]);

  // statsLabel
  const stN = b.addNode('StatsLabel', root, 0, -60);
  const stUIt = b.addUITransform(160, 20, 0.5, 0.5, stN.nodeIdx);
  const stLbl = b.addLabel('', 12, 140, 140, 140, 255, 1, 1, 160, 20, stN.nodeIdx);
  b.setComponents(stN.nodeIdx, [{__id__:stUIt},{__id__:stLbl}]);

  // qualityLabel
  const qlN = b.addNode('QualityLabel', root, 0, -78);
  const qlUIt = b.addUITransform(160, 20, 0.5, 0.5, qlN.nodeIdx);
  const qlLbl = b.addLabel('', 12, 158, 158, 158, 255, 1, 1, 160, 20, qlN.nodeIdx);
  b.setComponents(qlN.nodeIdx, [{__id__:qlUIt},{__id__:qlLbl}]);

  // powerLabel
  const pwN = b.addNode('PowerLabel', root, 0, -96);
  const pwUIt = b.addUITransform(160, 20, 0.5, 0.5, pwN.nodeIdx);
  const pwLbl = b.addLabel('', 12, 200, 180, 50, 255, 1, 1, 160, 20, pwN.nodeIdx);
  b.setComponents(pwN.nodeIdx, [{__id__:pwUIt},{__id__:pwLbl}]);

  // clickButton (invisible full-size)
  const cbN = b.addNode('ClickButton', root, 0, 0);
  const cbUIt = b.addUITransform(180, 230, 0.5, 0.5, cbN.nodeIdx);
  const cbBtn = b.addButton(cbN.nodeIdx);
  b.setComponents(cbN.nodeIdx, [{__id__:cbUIt},{__id__:cbBtn}]);

  // Root components: UITransform + EquipmentSlotItem script
  const rootUIt = b.addUITransform(180, 230, 0.5, 0.5, root);
  const rootScript = b.addScript(C.EquipmentSlotItem, {
    borderNode: {__id__: borderN.nodeIdx},
    iconNode: {__id__: iconN.nodeIdx},
    slotNameLabel: {__id__: snLbl},
    equipmentNameLabel: {__id__: enLbl},
    statsLabel: {__id__: stLbl},
    qualityLabel: {__id__: qlLbl},
    powerLabel: {__id__: pwLbl},
    clickButton: {__id__: cbBtn},
  }, root);
  b.setComponents(root, [{__id__:rootUIt},{__id__:rootScript}]);

  // Root children
  b.setChildren(root, [
    {__id__:borderN.nodeIdx},{__id__:iconN.nodeIdx},{__id__:snN.nodeIdx},
    {__id__:enN.nodeIdx},{__id__:stN.nodeIdx},{__id__:qlN.nodeIdx},
    {__id__:pwN.nodeIdx},{__id__:cbN.nodeIdx},
  ]);

  return b.finalize();
}

// =====================================================================
// PREFAB: EquipmentItemView
// =====================================================================

function buildEquipmentItemView() {
  const b = new PrefabBuilder('EquipmentItemView', 'eqiv-root');
  const root = b.addRoot('EquipmentItemView');

  // bgNode (Background)
  const bgN = b.addNode('Background', root, 0, 0);
  const bgUIt = b.addUITransform(400, 80, 0.5, 0.5, bgN.nodeIdx);
  const bgSprite = b.addSprite(40, 40, 50, 255, bgN.nodeIdx);
  b.setComponents(bgN.nodeIdx, [{__id__:bgUIt},{__id__:bgSprite}]);

  // qualityBarNode (left color bar)
  const qbN = b.addNode('QualityBar', root, -197, 0);
  const qbUIt = b.addUITransform(6, 80, 0.5, 0.5, qbN.nodeIdx);
  const qbSprite = b.addSprite(158, 158, 158, 255, qbN.nodeIdx);
  b.setComponents(qbN.nodeIdx, [{__id__:qbUIt},{__id__:qbSprite}]);

  // nameLabel
  const nmN = b.addNode('NameLabel', root, -150, 12);
  const nmUIt = b.addUITransform(220, 24, 0, 0.5, nmN.nodeIdx);
  const nmLbl = b.addLabel('装备名称', 18, 255, 255, 255, 255, 0, 1, 220, 24, nmN.nodeIdx);
  b.setComponents(nmN.nodeIdx, [{__id__:nmUIt},{__id__:nmLbl}]);

  // qualityLabel
  const qlN = b.addNode('QualityLabel', root, -150, -12);
  const qlUIt = b.addUITransform(120, 20, 0, 0.5, qlN.nodeIdx);
  const qlLbl = b.addLabel('稀有', 14, 59, 130, 246, 255, 0, 1, 120, 20, qlN.nodeIdx);
  b.setComponents(qlN.nodeIdx, [{__id__:qlUIt},{__id__:qlLbl}]);

  // statsLabel
  const stN = b.addNode('StatsLabel', root, -10, 12);
  const stUIt = b.addUITransform(200, 20, 0, 0.5, stN.nodeIdx);
  const stLbl = b.addLabel('HP+100 ATK+50', 13, 180, 180, 180, 255, 0, 1, 200, 20, stN.nodeIdx);
  b.setComponents(stN.nodeIdx, [{__id__:stUIt},{__id__:stLbl}]);

  // powerLabel
  const pwN = b.addNode('PowerLabel', root, -10, -12);
  const pwUIt = b.addUITransform(120, 20, 0, 0.5, pwN.nodeIdx);
  const pwLbl = b.addLabel('战力 500', 13, 245, 158, 11, 255, 0, 1, 120, 20, pwN.nodeIdx);
  b.setComponents(pwN.nodeIdx, [{__id__:pwUIt},{__id__:pwLbl}]);

  // equippedBadgeNode (hidden by default)
  const ebN = b.addNode('EquippedBadge', root, 170, 12, false);
  const ebUIt = b.addUITransform(80, 24, 0.5, 0.5, ebN.nodeIdx);
  const ebSprite = b.addSprite(30, 144, 255, 200, ebN.nodeIdx);
  b.setComponents(ebN.nodeIdx, [{__id__:ebUIt},{__id__:ebSprite}]);

  // equippedLabel (child of equippedBadge)
  const elN = b.addNode('EquippedLabel', ebN.nodeIdx, 0, 0);
  const elUIt = b.addUITransform(76, 20, 0.5, 0.5, elN.nodeIdx);
  const elLbl = b.addLabel('已装备', 12, 255, 255, 255, 255, 1, 1, 76, 20, elN.nodeIdx);
  b.setComponents(elN.nodeIdx, [{__id__:elUIt},{__id__:elLbl}]);
  b.setChildren(ebN.nodeIdx, [{__id__:elN.nodeIdx}]);

  // clickButton (invisible full-size)
  const cbN = b.addNode('ClickButton', root, 0, 0);
  const cbUIt = b.addUITransform(400, 80, 0.5, 0.5, cbN.nodeIdx);
  const cbBtn = b.addButton(cbN.nodeIdx);
  b.setComponents(cbN.nodeIdx, [{__id__:cbUIt},{__id__:cbBtn}]);

  // Root components + script
  const rootUIt = b.addUITransform(400, 80, 0.5, 0.5, root);
  const rootScript = b.addScript(C.EquipmentItemView, {
    qualityBarNode: {__id__: qbN.nodeIdx},
    nameLabel: {__id__: nmLbl},
    qualityLabel: {__id__: qlLbl},
    statsLabel: {__id__: stLbl},
    powerLabel: {__id__: pwLbl},
    equippedBadgeNode: {__id__: ebN.nodeIdx},
    equippedLabel: {__id__: elLbl},
    clickButton: {__id__: cbBtn},
    bgNode: {__id__: bgN.nodeIdx},
  }, root);
  b.setComponents(root, [{__id__:rootUIt},{__id__:rootScript}]);

  b.setChildren(root, [
    {__id__:bgN.nodeIdx},{__id__:qbN.nodeIdx},{__id__:nmN.nodeIdx},
    {__id__:qlN.nodeIdx},{__id__:stN.nodeIdx},{__id__:pwN.nodeIdx},
    {__id__:ebN.nodeIdx},{__id__:elN.nodeIdx},{__id__:cbN.nodeIdx},
  ]);

  return b.finalize();
}

// =====================================================================
// PREFAB: EquipmentPanel
// =====================================================================

function buildEquipmentPanel() {
  const b = new PrefabBuilder('EquipmentPanel', 'eqp-root');
  const root = b.addRoot('EquipmentPanel');

  // panelRoot (background)
  const prN = b.addNode('PanelRoot', root, 0, 0);
  const prUIt = b.addUITransform(360, 520, 0.5, 0.5, prN.nodeIdx);
  const prSprite = b.addSprite(25, 25, 40, 240, prN.nodeIdx);
  b.setComponents(prN.nodeIdx, [{__id__:prUIt},{__id__:prSprite}]);

  // Title label
  const tiN = b.addNode('TitleLabel', root, 0, 230);
  const tiUIt = b.addUITransform(200, 32, 0.5, 0.5, tiN.nodeIdx);
  const tiLbl = b.addLabel('装备', 24, 255, 215, 0, 255, 1, 1, 200, 32, tiN.nodeIdx);
  b.setComponents(tiN.nodeIdx, [{__id__:tiUIt},{__id__:tiLbl}]);

  // heroIdLabel
  const hiN = b.addNode('HeroIdLabel', root, 0, 195);
  const hiUIt = b.addUITransform(200, 24, 0.5, 0.5, hiN.nodeIdx);
  const hiLbl = b.addLabel('英雄 ID', 14, 158, 158, 158, 255, 1, 1, 200, 24, hiN.nodeIdx);
  b.setComponents(hiN.nodeIdx, [{__id__:hiUIt},{__id__:hiLbl}]);

  // slotContainer (Layout node for dynamic slot items)
  const scN = b.addNode('SlotContainer', root, 0, 60);
  const scUIt = b.addUITransform(320, 260, 0.5, 0.5, scN.nodeIdx);
  const scLayout = b.addLayout(2, 10, scN.nodeIdx);
  b.setComponents(scN.nodeIdx, [{__id__:scUIt},{__id__:scLayout}]);

  // Attribute bonus labels
  const hpN = b.addNode('HpBonusLabel', root, -140, -90);
  const hpUIt = b.addUITransform(180, 22, 0, 0.5, hpN.nodeIdx);
  const hpLbl = b.addLabel('HP +0', 14, 200, 60, 60, 255, 0, 1, 180, 22, hpN.nodeIdx);
  b.setComponents(hpN.nodeIdx, [{__id__:hpUIt},{__id__:hpLbl}]);

  const atkN = b.addNode('AtkBonusLabel', root, -140, -115);
  const atkUIt = b.addUITransform(180, 22, 0, 0.5, atkN.nodeIdx);
  const atkLbl = b.addLabel('ATK +0', 14, 255, 100, 60, 255, 0, 1, 180, 22, atkN.nodeIdx);
  b.setComponents(atkN.nodeIdx, [{__id__:atkUIt},{__id__:atkLbl}]);

  const defN = b.addNode('DefBonusLabel', root, -140, -140);
  const defUIt = b.addUITransform(180, 22, 0, 0.5, defN.nodeIdx);
  const defLbl = b.addLabel('DEF +0', 14, 60, 140, 255, 255, 0, 1, 180, 22, defN.nodeIdx);
  b.setComponents(defN.nodeIdx, [{__id__:defUIt},{__id__:defLbl}]);

  // equipmentPowerLabel
  const epN = b.addNode('EquipmentPowerLabel', root, 0, -175);
  const epUIt = b.addUITransform(200, 26, 0.5, 0.5, epN.nodeIdx);
  const epLbl = b.addLabel('装备战力 0', 16, 245, 200, 50, 255, 1, 1, 200, 26, epN.nodeIdx);
  b.setComponents(epN.nodeIdx, [{__id__:epUIt},{__id__:epLbl}]);

  // closeButton
  const clN = b.addNode('CloseButton', root, 0, -220);
  const clUIt = b.addUITransform(60, 36, 0.5, 0.5, clN.nodeIdx);
  const clBtn = b.addButton(clN.nodeIdx);
  b.setComponents(clN.nodeIdx, [{__id__:clUIt},{__id__:clBtn}]);
  // CloseButton label child
  const cllN = b.addNode('CloseLabel', clN.nodeIdx, 0, 0);
  const cllUIt = b.addUITransform(50, 30, 0.5, 0.5, cllN.nodeIdx);
  const cllLbl = b.addLabel('关闭', 16, 255, 255, 255, 255, 1, 1, 50, 30, cllN.nodeIdx);
  b.setComponents(cllN.nodeIdx, [{__id__:cllUIt},{__id__:cllLbl}]);
  b.setChildren(clN.nodeIdx, [{__id__:cllN.nodeIdx}]);

  // Root components + script
  const rootUIt = b.addUITransform(360, 520, 0.5, 0.5, root);
  const rootScript = b.addScript(C.EquipmentPanel, {
    panelRoot: {__id__: prN.nodeIdx},
    slotContainer: {__id__: scN.nodeIdx},
    slotItemPrefab: null,
    hpBonusLabel: {__id__: hpLbl},
    atkBonusLabel: {__id__: atkLbl},
    defBonusLabel: {__id__: defLbl},
    equipmentPowerLabel: {__id__: epLbl},
    heroIdLabel: {__id__: hiLbl},
    closeButton: {__id__: clBtn},
  }, root);
  b.setComponents(root, [{__id__:rootUIt},{__id__:rootScript}]);

  b.setChildren(root, [
    {__id__:prN.nodeIdx},{__id__:tiN.nodeIdx},{__id__:hiN.nodeIdx},
    {__id__:scN.nodeIdx},{__id__:hpN.nodeIdx},{__id__:atkN.nodeIdx},
    {__id__:defN.nodeIdx},{__id__:epN.nodeIdx},{__id__:clN.nodeIdx},
    {__id__:cllN.nodeIdx},
  ]);

  return b.finalize();
}

// =====================================================================
// PREFAB: EquipmentBagPanel
// =====================================================================

function buildEquipmentBagPanel() {
  const b = new PrefabBuilder('EquipmentBagPanel', 'eqbp-root');
  const root = b.addRoot('EquipmentBagPanel');

  // Helper: create a button with label child, returns { nodeIdx, btnCompIdx, lblCompIdx }
  function addFilterBtn(name, px, py, label, parent) {
    const btnN = b.addNode(name, parent, px, py);
    const btnUIt = b.addUITransform(70, 30, 0.5, 0.5, btnN.nodeIdx);
    const btnComp = b.addButton(btnN.nodeIdx);
    b.setComponents(btnN.nodeIdx, [{__id__:btnUIt},{__id__:btnComp}]);
    // label child
    const lblN = b.addNode('Label', btnN.nodeIdx, 0, 0);
    const lblUIt = b.addUITransform(60, 26, 0.5, 0.5, lblN.nodeIdx);
    const lblComp = b.addLabel(label, 13, 255, 255, 255, 255, 1, 1, 60, 26, lblN.nodeIdx);
    b.setComponents(lblN.nodeIdx, [{__id__:lblUIt},{__id__:lblComp}]);
    b.setChildren(btnN.nodeIdx, [{__id__:lblN.nodeIdx}]);
    return { nodeIdx: btnN.nodeIdx, btnCompIdx: btnComp, lblCompIdx: lblComp, lblNodeIdx: lblN.nodeIdx };
  }

  // panelRoot (background)
  const prN = b.addNode('PanelRoot', root, 0, 0);
  const prUIt = b.addUITransform(400, 550, 0.5, 0.5, prN.nodeIdx);
  const prSprite = b.addSprite(25, 25, 40, 240, prN.nodeIdx);
  b.setComponents(prN.nodeIdx, [{__id__:prUIt},{__id__:prSprite}]);

  // titleLabel
  const tiN = b.addNode('TitleLabel', root, 0, 240);
  const tiUIt = b.addUITransform(200, 32, 0.5, 0.5, tiN.nodeIdx);
  const tiLbl = b.addLabel('装备背包', 22, 255, 215, 0, 255, 1, 1, 200, 32, tiN.nodeIdx);
  b.setComponents(tiN.nodeIdx, [{__id__:tiUIt},{__id__:tiLbl}]);

  // filterHintLabel
  const fhN = b.addNode('FilterHintLabel', root, 0, 210);
  const fhUIt = b.addUITransform(300, 20, 0.5, 0.5, fhN.nodeIdx);
  const fhLbl = b.addLabel('全部类型 · 全部品质 · 0 件', 12, 158, 158, 158, 255, 1, 1, 300, 20, fhN.nodeIdx);
  b.setComponents(fhN.nodeIdx, [{__id__:fhUIt},{__id__:fhLbl}]);

  // Type filter buttons
  const typeAll = addFilterBtn('TypeAllBtn', -120, 175, '全部', root);
  const typeWeapon = addFilterBtn('TypeWeaponBtn', -40, 175, '武器', root);
  const typeArmor = addFilterBtn('TypeArmorBtn', 40, 175, '护甲', root);
  const typeAccessory = addFilterBtn('TypeAccessoryBtn', 120, 175, '饰品', root);

  // Quality filter buttons
  const qualityAll = addFilterBtn('QualityAllBtn', -120, 135, '全部', root);
  const qualityCommon = addFilterBtn('QualityCommonBtn', -40, 135, '普通', root);
  const qualityRare = addFilterBtn('QualityRareBtn', 40, 135, '稀有', root);
  const qualityEpic = addFilterBtn('QualityEpicBtn', 120, 135, '史诗', root);
  const qualityLegendary = addFilterBtn('QualityLegendaryBtn', -160, 100, '传说', root);

  // ScrollView
  const svN = b.addNode('ScrollView', root, 0, -20);
  const svUIt = b.addUITransform(360, 290, 0.5, 0.5, svN.nodeIdx);
  const svSprite = b.addSprite(20, 20, 30, 200, svN.nodeIdx);
  // contentNode (child of scrollview)
  const cnN = b.addNode('Content', svN.nodeIdx, 0, 0);
  const cnUIt = b.addUITransform(360, 290, 0.5, 0.5, cnN.nodeIdx);
  const cnLayout = b.addLayout(2, 6, cnN.nodeIdx);
  b.setComponents(cnN.nodeIdx, [{__id__:cnUIt},{__id__:cnLayout}]);
  // ScrollView component (references content node)
  const svComp = b.addScrollView({__id__:cnN.nodeIdx}, svN.nodeIdx);
  b.setComponents(svN.nodeIdx, [{__id__:svUIt},{__id__:svSprite},{__id__:svComp}]);
  b.setChildren(svN.nodeIdx, [{__id__:cnN.nodeIdx}]);

  // emptyHintNode
  const ehN = b.addNode('EmptyHintNode', root, 0, -20);
  const ehUIt = b.addUITransform(200, 30, 0.5, 0.5, ehN.nodeIdx);
  const ehLbl = b.addLabel('暂无装备', 16, 158, 158, 158, 255, 1, 1, 200, 30, ehN.nodeIdx);
  b.setComponents(ehN.nodeIdx, [{__id__:ehUIt},{__id__:ehLbl}]);

  // closeButton
  const clN = b.addNode('CloseButton', root, 0, -245);
  const clUIt = b.addUITransform(60, 36, 0.5, 0.5, clN.nodeIdx);
  const clBtn = b.addButton(clN.nodeIdx);
  b.setComponents(clN.nodeIdx, [{__id__:clUIt},{__id__:clBtn}]);
  const cllN = b.addNode('Label', clN.nodeIdx, 0, 0);
  const cllUIt = b.addUITransform(50, 30, 0.5, 0.5, cllN.nodeIdx);
  const cllLbl = b.addLabel('关闭', 16, 255, 255, 255, 255, 1, 1, 50, 30, cllN.nodeIdx);
  b.setComponents(cllN.nodeIdx, [{__id__:cllUIt},{__id__:cllLbl}]);
  b.setChildren(clN.nodeIdx, [{__id__:cllN.nodeIdx}]);

  // Root components + script
  const rootUIt = b.addUITransform(400, 550, 0.5, 0.5, root);
  const rootScript = b.addScript(C.EquipmentBagPanel, {
    panelRoot: {__id__: prN.nodeIdx},
    scrollView: {__id__: svComp},
    contentNode: {__id__: cnN.nodeIdx},
    itemTemplate: null,
    titleLabel: {__id__: tiLbl},
    filterHintLabel: {__id__: fhLbl},
    typeAllBtn: {__id__: typeAll.btnCompIdx},
    typeWeaponBtn: {__id__: typeWeapon.btnCompIdx},
    typeArmorBtn: {__id__: typeArmor.btnCompIdx},
    typeAccessoryBtn: {__id__: typeAccessory.btnCompIdx},
    qualityAllBtn: {__id__: qualityAll.btnCompIdx},
    qualityCommonBtn: {__id__: qualityCommon.btnCompIdx},
    qualityRareBtn: {__id__: qualityRare.btnCompIdx},
    qualityEpicBtn: {__id__: qualityEpic.btnCompIdx},
    qualityLegendaryBtn: {__id__: qualityLegendary.btnCompIdx},
    closeButton: {__id__: clBtn},
    emptyHintNode: {__id__: ehN.nodeIdx},
  }, root);
  b.setComponents(root, [{__id__:rootUIt},{__id__:rootScript}]);

  // Collect all child refs
  const allChildRefs = [
    {__id__:prN.nodeIdx},{__id__:tiN.nodeIdx},{__id__:fhN.nodeIdx},
    {__id__:typeAll.nodeIdx},{__id__:typeWeapon.nodeIdx},{__id__:typeArmor.nodeIdx},{__id__:typeAccessory.nodeIdx},
    {__id__:qualityAll.nodeIdx},{__id__:qualityCommon.nodeIdx},{__id__:qualityRare.nodeIdx},{__id__:qualityEpic.nodeIdx},{__id__:qualityLegendary.nodeIdx},
    {__id__:svN.nodeIdx},{__id__:cnN.nodeIdx},{__id__:ehN.nodeIdx},{__id__:clN.nodeIdx},{__id__:cllN.nodeIdx},
    {__id__:typeAll.lblNodeIdx},{__id__:typeWeapon.lblNodeIdx},{__id__:typeArmor.lblNodeIdx},{__id__:typeAccessory.lblNodeIdx},
    {__id__:qualityAll.lblNodeIdx},{__id__:qualityCommon.lblNodeIdx},{__id__:qualityRare.lblNodeIdx},{__id__:qualityEpic.lblNodeIdx},{__id__:qualityLegendary.lblNodeIdx},
  ];
  b.setChildren(root, allChildRefs);

  return b.finalize();
}

// =====================================================================
// PREFAB: EquipmentDetailPanel
// =====================================================================

function buildEquipmentDetailPanel() {
  const b = new PrefabBuilder('EquipmentDetailPanel', 'eqdp-root');
  const root = b.addRoot('EquipmentDetailPanel');

  // Helper: label node
  function addLbl(name, px, py, text, fs, w, h, cr, cg, cb2, ca, ha, va) {
    const n = b.addNode(name, root, px, py);
    const uit = b.addUITransform(w||200, h||24, ha!=null?ha:0.5, va!=null?va:0.5, n.nodeIdx);
    const lbl = b.addLabel(text, fs||16, cr||255, cg||255, cb2||255, ca||255, ha!=null?ha:1, va!=null?va:1, w||200, h||24, n.nodeIdx);
    b.setComponents(n.nodeIdx, [{__id__:uit},{__id__:lbl}]);
    return { nodeIdx: n.nodeIdx, lblCompIdx: lbl };
  }

  // Helper: button with label child
  function addBtn(name, px, py, label, w, h) {
    const btnN = b.addNode(name, root, px, py);
    const btnUIt = b.addUITransform(w||80, h||34, 0.5, 0.5, btnN.nodeIdx);
    const btnComp = b.addButton(btnN.nodeIdx);
    b.setComponents(btnN.nodeIdx, [{__id__:btnUIt},{__id__:btnComp}]);
    const lblN = b.addNode('Label', btnN.nodeIdx, 0, 0);
    const lblUIt = b.addUITransform((w||80)-10, (h||34)-6, 0.5, 0.5, lblN.nodeIdx);
    const lblComp = b.addLabel(label, 14, 255, 255, 255, 255, 1, 1, (w||80)-10, (h||34)-6, lblN.nodeIdx);
    b.setComponents(lblN.nodeIdx, [{__id__:lblUIt},{__id__:lblComp}]);
    b.setChildren(btnN.nodeIdx, [{__id__:lblN.nodeIdx}]);
    return { nodeIdx: btnN.nodeIdx, btnCompIdx: btnComp, lblNodeIdx: lblN.nodeIdx };
  }

  // Background
  const bgN = b.addNode('Background', root, 0, 0);
  const bgUIt = b.addUITransform(380, 540, 0.5, 0.5, bgN.nodeIdx);
  const bgSprite = b.addSprite(25, 25, 40, 240, bgN.nodeIdx);
  b.setComponents(bgN.nodeIdx, [{__id__:bgUIt},{__id__:bgSprite}]);

  // Info labels
  const nameLbl = addLbl('NameLabel', 0, 230, '装备名称', 24, 280, 32);
  const qualityLbl = addLbl('QualityLabel', 0, 195, '传说', 18, 150, 24, 245, 158, 11, 255);
  const levelLbl = addLbl('LevelLabel', -120, 165, 'Lv.1', 14, 100, 22, 180, 180, 180, 255);
  const enhanceLbl = addLbl('EnhanceLevelLabel', 0, 165, '强化 +5', 14, 120, 22, 100, 200, 255, 255);
  const powerLbl = addLbl('PowerLabel', 0, 140, '战力 500', 18, 200, 26, 245, 200, 50, 255);
  const hpLbl = addLbl('HpStatLabel', -100, 110, 'HP 100', 14, 160, 22, 200, 60, 60, 255);
  const atkLbl = addLbl('AtkStatLabel', -100, 85, 'ATK 50', 14, 160, 22, 255, 100, 60, 255);
  const defLbl = addLbl('DefStatLabel', -100, 60, 'DEF 30', 14, 160, 22, 60, 140, 255, 255);
  const statusLbl = addLbl('EquipStatusLabel', 0, 30, '背包中', 13, 240, 22, 158, 158, 158, 255);

  // Operation buttons
  const equipBtn = addBtn('EquipBtn', -140, -10, '装备', 80, 34);
  const unequipBtn = addBtn('UnequipBtn', -70, -10, '卸下', 80, 34);
  const upgradeBtn = addBtn('UpgradeBtn', 0, -10, '升级', 80, 34);
  const enhanceBtn = addBtn('EnhanceBtn', 70, -10, '强化', 80, 34);
  const decomposeBtn = addBtn('DecomposeBtn', 140, -10, '分解', 80, 34);

  // previewContainer (hidden)
  const pvN = b.addNode('PreviewContainer', root, 0, -60, false);
  const pvUIt = b.addUITransform(340, 80, 0.5, 0.5, pvN.nodeIdx);
  const pvSprite = b.addSprite(15, 15, 25, 200, pvN.nodeIdx);
  b.setComponents(pvN.nodeIdx, [{__id__:pvUIt},{__id__:pvSprite}]);
  // preview children
  const ppwN = b.addNode('PreviewPowerLabel', pvN.nodeIdx, 0, 15);
  const ppwUIt = b.addUITransform(300, 22, 0.5, 0.5, ppwN.nodeIdx);
  const ppwLbl = b.addLabel('战力 500 → 600 (+100)', 13, 245, 200, 50, 255, 1, 1, 300, 22, ppwN.nodeIdx);
  b.setComponents(ppwN.nodeIdx, [{__id__:ppwUIt},{__id__:ppwLbl}]);
  const pctN = b.addNode('PreviewCostLabel', pvN.nodeIdx, 0, -15);
  const pctUIt = b.addUITransform(300, 22, 0.5, 0.5, pctN.nodeIdx);
  const pctLbl = b.addLabel('消耗: Gold x100', 13, 180, 180, 180, 255, 1, 1, 300, 22, pctN.nodeIdx);
  b.setComponents(pctN.nodeIdx, [{__id__:pctUIt},{__id__:pctLbl}]);
  b.setChildren(pvN.nodeIdx, [{__id__:ppwN.nodeIdx},{__id__:pctN.nodeIdx}]);

  // confirmDialog (hidden)
  const cdN = b.addNode('ConfirmDialog', root, 0, 0, false);
  cdN.nodeIdx; // use nodeIdx
  const cdUIt = b.addUITransform(320, 180, 0.5, 0.5, cdN.nodeIdx);
  const cdSprite = b.addSprite(35, 35, 45, 245, cdN.nodeIdx);
  b.setComponents(cdN.nodeIdx, [{__id__:cdUIt},{__id__:cdSprite}]);
  // confirmTextLabel
  const ctN = b.addNode('ConfirmTextLabel', cdN.nodeIdx, 0, 20);
  const ctUIt = b.addUITransform(280, 80, 0.5, 0.5, ctN.nodeIdx);
  const ctLbl = b.addLabel('确认操作？', 14, 255, 255, 255, 255, 1, 1, 280, 80, ctN.nodeIdx);
  b.setComponents(ctN.nodeIdx, [{__id__:ctUIt},{__id__:ctLbl}]);
  // confirmBtn + cancelBtn inside dialog
  const cfmBtn = addBtn('ConfirmBtn', -70, -55, '确认', 100, 36);
  // Re-parent confirmBtn to cdN
  b.arr[cfmBtn.nodeIdx]._parent = {__id__: cdN.nodeIdx};
  const cnlBtn = addBtn('CancelBtn', 70, -55, '取消', 100, 36);
  b.arr[cnlBtn.nodeIdx]._parent = {__id__: cdN.nodeIdx};
  b.setChildren(cdN.nodeIdx, [{__id__:ctN.nodeIdx},{__id__:cfmBtn.nodeIdx},{__id__:cnlBtn.nodeIdx}]);

  // slotPickerContainer (hidden)
  const spN = b.addNode('SlotPickerContainer', root, 0, 0, false);
  const spUIt = b.addUITransform(300, 200, 0.5, 0.5, spN.nodeIdx);
  const spSprite = b.addSprite(30, 30, 40, 240, spN.nodeIdx);
  b.setComponents(spN.nodeIdx, [{__id__:spUIt},{__id__:spSprite}]);
  const spcBtn = addBtn('SlotPickerCloseBtn', 0, -70, '取消', 80, 36);
  b.arr[spcBtn.nodeIdx]._parent = {__id__: spN.nodeIdx};
  b.setChildren(spN.nodeIdx, [{__id__:spcBtn.nodeIdx}]);

  // closeButton
  const clBtnData = addBtn('CloseButton', 155, 240, 'X', 50, 36);

  // Root components + script
  const rootUIt = b.addUITransform(380, 540, 0.5, 0.5, root);
  const rootScript = b.addScript(C.EquipmentDetailPanel, {
    nameLabel: {__id__: nameLbl.lblCompIdx},
    qualityLabel: {__id__: qualityLbl.lblCompIdx},
    levelLabel: {__id__: levelLbl.lblCompIdx},
    enhanceLevelLabel: {__id__: enhanceLbl.lblCompIdx},
    powerLabel: {__id__: powerLbl.lblCompIdx},
    hpStatLabel: {__id__: hpLbl.lblCompIdx},
    atkStatLabel: {__id__: atkLbl.lblCompIdx},
    defStatLabel: {__id__: defLbl.lblCompIdx},
    equipStatusLabel: {__id__: statusLbl.lblCompIdx},
    equipBtn: {__id__: equipBtn.btnCompIdx},
    unequipBtn: {__id__: unequipBtn.btnCompIdx},
    upgradeBtn: {__id__: upgradeBtn.btnCompIdx},
    enhanceBtn: {__id__: enhanceBtn.btnCompIdx},
    decomposeBtn: {__id__: decomposeBtn.btnCompIdx},
    previewContainer: {__id__: pvN.nodeIdx},
    previewPowerLabel: {__id__: ppwLbl},
    previewCostLabel: {__id__: pctLbl},
    confirmDialog: {__id__: cdN.nodeIdx},
    confirmTextLabel: {__id__: ctLbl},
    confirmBtn: {__id__: cfmBtn.btnCompIdx},
    cancelBtn: {__id__: cnlBtn.btnCompIdx},
    closeButton: {__id__: clBtnData.btnCompIdx},
    slotPickerContainer: {__id__: spN.nodeIdx},
    slotPickerCloseBtn: {__id__: spcBtn.btnCompIdx},
  }, root);
  b.setComponents(root, [{__id__:rootUIt},{__id__:rootScript}]);

  // Collect all direct children of root
  const allRefs = [
    {__id__:bgN.nodeIdx},{__id__:nameLbl.nodeIdx},{__id__:qualityLbl.nodeIdx},
    {__id__:levelLbl.nodeIdx},{__id__:enhanceLbl.nodeIdx},{__id__:powerLbl.nodeIdx},
    {__id__:hpLbl.nodeIdx},{__id__:atkLbl.nodeIdx},{__id__:defLbl.nodeIdx},
    {__id__:statusLbl.nodeIdx},
    {__id__:equipBtn.nodeIdx},{__id__:unequipBtn.nodeIdx},{__id__:upgradeBtn.nodeIdx},
    {__id__:enhanceBtn.nodeIdx},{__id__:decomposeBtn.nodeIdx},
    {__id__:pvN.nodeIdx},{__id__:ppwN.nodeIdx},{__id__:pctN.nodeIdx},
    {__id__:cdN.nodeIdx},{__id__:ctN.nodeIdx},{__id__:cfmBtn.nodeIdx},{__id__:cnlBtn.nodeIdx},
    {__id__:spN.nodeIdx},{__id__:spcBtn.nodeIdx},{__id__:clBtnData.nodeIdx},
    {__id__:equipBtn.lblNodeIdx},{__id__:unequipBtn.lblNodeIdx},{__id__:upgradeBtn.lblNodeIdx},
    {__id__:enhanceBtn.lblNodeIdx},{__id__:decomposeBtn.lblNodeIdx},
    {__id__:cfmBtn.lblNodeIdx},{__id__:cnlBtn.lblNodeIdx},{__id__:spcBtn.lblNodeIdx},
    {__id__:clBtnData.lblNodeIdx},
  ];
  b.setChildren(root, allRefs);

  return b.finalize();
}

// ==================== Main ====================

function writePrefab(name, builderFn, subdir) {
  const dir = path.join(__dirname, '..', 'assets', 'prefabs', subdir);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const objects = builderFn();
  const filePath = path.join(dir, `${name}.prefab`);
  fs.writeFileSync(filePath, JSON.stringify(objects, null, 2), 'utf-8');
  console.log(`Created: ${filePath} (${objects.length} objects)`);

  // .meta file
  const meta = {
    ver: '4.0.24', importer: 'prefab', imported: true,
    uuid: PREFAB_META_UUIDS[name],
    files: [], subMetas: {}, userData: {},
  };
  fs.writeFileSync(filePath + '.meta', JSON.stringify(meta, null, 2), 'utf-8');
  console.log(`Created: ${filePath}.meta`);
}

console.log('\n=== Generating Prefabs ===\n');

writePrefab('EquipmentSlotItem', buildEquipmentSlotItem, 'items');
writePrefab('EquipmentItemView', buildEquipmentItemView, 'items');
writePrefab('EquipmentPanel', buildEquipmentPanel, 'panels');
writePrefab('EquipmentBagPanel', buildEquipmentBagPanel, 'panels');
writePrefab('EquipmentDetailPanel', buildEquipmentDetailPanel, 'panels');

console.log('\n=== All 5 prefabs generated successfully ===');
