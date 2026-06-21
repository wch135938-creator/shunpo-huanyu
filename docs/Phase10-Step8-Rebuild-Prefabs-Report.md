# Phase10-Step8-Rebuild-Prefabs-Report

**日期**: 2026-06-06
**任务**: Phase10-Step8 — 删除旧损坏 Prefab，重新生成 5 个干净 Equipment Prefab
**方法**: 直接生成 Cocos Creator 3.x 兼容 JSON（使用 cc.UITransform + 未压缩脚本 UUID）

---

## 删除的旧 Prefab

| # | 文件 | 路径 |
|---|------|------|
| 1 | `EquipmentSlotItem.prefab` + `.meta` | `assets/prefabs/items/` |
| 2 | `EquipmentItemView.prefab` + `.meta` | `assets/prefabs/items/` |
| 3 | `EquipmentPanel.prefab` + `.meta` | `assets/prefabs/panels/` |
| 4 | `EquipmentBagPanel.prefab` + `.meta` | `assets/prefabs/panels/` |
| 5 | `EquipmentDetailPanel.prefab` + `.meta` | `assets/prefabs/panels/` |

旧 Prefab 已确认损坏（EquipmentPanel 显示 "Can't add component 'cc.UITransform' because EquipmentPanel already contains the same component"），不可信。

---

## 重新生成的 Prefab

| # | Prefab | 数组项数 | 脚本 UUID |
|---|--------|---------|-----------|
| 1 | `EquipmentSlotItem.prefab` | 28 | `1fb33f53-ba73-4db1-9a7a-c76bf68c0696` |
| 2 | `EquipmentItemView.prefab` | 30 | `70da1968-b79c-40ba-839a-73b2feec494c` |
| 3 | `EquipmentPanel.prefab` | 32 | `fd274f49-b5d5-4940-92d0-1131d863d326` |
| 4 | `EquipmentBagPanel.prefab` | 67 | `fb89d971-e13e-43f8-aa9c-6d9e087e9125` |
| 5 | `EquipmentDetailPanel.prefab` | 89 | `534fa1a8-9b12-44ad-8401-30d03ea10094` |

所有 UUID 与对应 `.ts.meta` 文件完全一致。

---

## 1. EquipmentSlotItem.prefab

### 根节点组件

| 组件 | `__type__` | 说明 |
|------|-----------|------|
| UITransform | `cc.UITransform` | contentSize: 660×100 |
| EquipmentSlotItem | `1fb33f53-ba73-4db1-9a7a-c76bf68c0696` | 用户脚本 |

### @property 绑定清单

| @property | 类型 | 引用目标 | 状态 |
|-----------|------|---------|------|
| `borderNode` | Node | borderNode (Sprite 品质边框) | ✅ 已绑定 |
| `iconNode` | Node | iconNode (Sprite 图标占位) | ✅ 已绑定 |
| `slotNameLabel` | Label | slotNameLabel | ✅ 已绑定 |
| `equipmentNameLabel` | Label | equipmentNameLabel | ✅ 已绑定 |
| `statsLabel` | Label | statsLabel | ✅ 已绑定 |
| `qualityLabel` | Label | qualityLabel | ✅ 已绑定 |
| `powerLabel` | Label | powerLabel | ✅ 已绑定 |
| `clickButton` | Button | clickButton (透明全尺寸) | ✅ 已绑定 |

### 子节点层级

```
EquipmentSlotItem (root, 660×100)
├── borderNode (Sprite 背景边框)
├── iconNode (Sprite 图标, 60×60)
├── slotNameLabel ("武器", 14px, 灰色)
├── equipmentNameLabel ("— 空 —", 18px, 白色)
├── statsLabel ("", 14px, 灰色)
├── qualityLabel ("", 14px, 灰色)
├── powerLabel ("", 14px, 金色)
└── clickButton (Button, 全尺寸透明覆盖)
```

---

## 2. EquipmentItemView.prefab

### 根节点组件

| 组件 | `__type__` | 说明 |
|------|-----------|------|
| UITransform | `cc.UITransform` | contentSize: 660×100 |
| EquipmentItemView | `70da1968-b79c-40ba-839a-73b2feec494c` | 用户脚本 |

### @property 绑定清单

| @property | 类型 | 引用目标 | 状态 |
|-----------|------|---------|------|
| `qualityBarNode` | Node | qualityBarNode (左侧竖条 Sprite) | ✅ 已绑定 |
| `nameLabel` | Label | nameLabel | ✅ 已绑定 |
| `qualityLabel` | Label | qualityLabel | ✅ 已绑定 |
| `statsLabel` | Label | statsLabel | ✅ 已绑定 |
| `powerLabel` | Label | powerLabel | ✅ 已绑定 |
| `equippedBadgeNode` | Node | equippedBadgeNode (默认隐藏) | ✅ 已绑定 |
| `equippedLabel` | Label | equippedLabel (equippedBadgeNode 子节点) | ✅ 已绑定 |
| `clickButton` | Button | clickButton (透明全尺寸) | ✅ 已绑定 |
| `bgNode` | Node | bgNode (Sprite 背景) | ✅ 已绑定 |

### 子节点层级

```
EquipmentItemView (root, 660×100)
├── bgNode (Sprite 背景, 深灰蓝)
├── qualityBarNode (Sprite 竖条, 8×100, 左侧)
├── nameLabel ("装备名称", 22px, 白色)
├── qualityLabel ("普通", 16px)
├── statsLabel ("", 14px, 灰色)
├── powerLabel ("", 14px, 金色)
├── equippedBadgeNode (默认隐藏)
│   └── equippedLabel ("已装备", 14px, 绿色)
└── clickButton (Button, 全尺寸透明覆盖)
```

---

## 3. EquipmentPanel.prefab

### 根节点组件

| 组件 | `__type__` | 说明 |
|------|-----------|------|
| UITransform | `cc.UITransform` | contentSize: 720×1280 |
| Widget | `cc.Widget` | 全屏对齐 (alignFlags: 45, alignMode: 2) |
| EquipmentPanel | `fd274f49-b5d5-4940-92d0-1131d863d326` | 用户脚本 |

### @property 绑定清单

| @property | 类型 | 引用目标 | 状态 |
|-----------|------|---------|------|
| `panelRoot` | Node | panelRoot (Sprite 背景容器) | ✅ 已绑定 |
| `slotContainer` | Node | slotContainer (Layout, Grid) | ✅ 已绑定 |
| `slotItemPrefab` | Prefab | — (需在编辑器中拖入) | ⚠ 编辑器绑定 |
| `hpBonusLabel` | Label | hpBonusLabel | ✅ 已绑定 |
| `atkBonusLabel` | Label | atkBonusLabel | ✅ 已绑定 |
| `defBonusLabel` | Label | defBonusLabel | ✅ 已绑定 |
| `equipmentPowerLabel` | Label | equipmentPowerLabel | ✅ 已绑定 |
| `heroIdLabel` | Label | heroIdLabel | ✅ 已绑定 |
| `closeButton` | Button | closeButton | ✅ 已绑定 |

### 子节点层级

```
EquipmentPanel (root, 720×1280, Widget全屏)
└── panelRoot (Sprite 背景容器, 720×700)
    ├── heroIdLabel ("英雄 —", 24px, 白色)
    ├── slotContainer (Layout Grid, 680×420)
    ├── hpBonusLabel ("HP +0", 18px, 绿色)
    ├── atkBonusLabel ("ATK +0", 18px, 红色)
    ├── defBonusLabel ("DEF +0", 18px, 蓝色)
    ├── equipmentPowerLabel ("装备战力 0", 20px, 金色, 加粗)
    └── closeButton (Button 60×60, "✕")
```

---

## 4. EquipmentBagPanel.prefab

### 根节点组件

| 组件 | `__type__` | 说明 |
|------|-----------|------|
| UITransform | `cc.UITransform` | contentSize: 720×1280 |
| Widget | `cc.Widget` | 全屏对齐 |
| EquipmentBagPanel | `fb89d971-e13e-43f8-aa9c-6d9e087e9125` | 用户脚本 |

### @property 绑定清单

| @property | 类型 | 引用目标 | 状态 |
|-----------|------|---------|------|
| `panelRoot` | Node | panelRoot (Sprite 背景容器) | ✅ 已绑定 |
| `scrollView` | ScrollView | scrollView (含 view → contentNode) | ✅ 已绑定 |
| `contentNode` | Node | contentNode (Layout, resizeMode: CONTAINER) | ✅ 已绑定 |
| `itemTemplate` | Prefab | — (需在编辑器中拖入) | ⚠ 编辑器绑定 |
| `titleLabel` | Label | titleLabel | ✅ 已绑定 |
| `filterHintLabel` | Label | filterHintLabel | ✅ 已绑定 |
| `typeAllBtn` | Button | typeAllBtn (含 Label "全部") | ✅ 已绑定 |
| `typeWeaponBtn` | Button | typeWeaponBtn (含 Label "武器") | ✅ 已绑定 |
| `typeArmorBtn` | Button | typeArmorBtn (含 Label "护甲") | ✅ 已绑定 |
| `typeAccessoryBtn` | Button | typeAccessoryBtn (含 Label "饰品") | ✅ 已绑定 |
| `qualityAllBtn` | Button | qualityAllBtn (含 Label "品质全") | ✅ 已绑定 |
| `qualityCommonBtn` | Button | qualityCommonBtn (含 Label "普通") | ✅ 已绑定 |
| `qualityRareBtn` | Button | qualityRareBtn (含 Label "稀有") | ✅ 已绑定 |
| `qualityEpicBtn` | Button | qualityEpicBtn (含 Label "史诗") | ✅ 已绑定 |
| `qualityLegendaryBtn` | Button | qualityLegendaryBtn (含 Label "传说") | ✅ 已绑定 |
| `closeButton` | Button | closeButton (含 Label "✕") | ✅ 已绑定 |
| `emptyHintNode` | Node | emptyHintNode (默认隐藏) | ✅ 已绑定 |

### 子节点层级

```
EquipmentBagPanel (root, 720×1280, Widget全屏)
└── panelRoot (Sprite 背景容器, 720×1200)
    ├── titleLabel ("装备背包", 32px, 金色)
    ├── filterHintLabel ("全部类型 · 全部品质 · 0 件", 16px, 灰色)
    ├── typeAllBtn / typeWeaponBtn / typeArmorBtn / typeAccessoryBtn (100×36)
    ├── qualityAllBtn / qualityCommonBtn / qualityRareBtn / qualityEpicBtn / qualityLegendaryBtn (100×36)
    ├── scrollView (680×700, 垂直)
    │   └── view (Mask + Sprite)
    │       └── contentNode (Layout, resizeMode: CONTAINER)
    ├── closeButton (60×60, "✕")
    └── emptyHintNode ("暂无装备", 默认隐藏)
```

ScrollView 的 `_content` 已绑定到 contentNode (__id__: 57)。

---

## 5. EquipmentDetailPanel.prefab

### 根节点组件

| 组件 | `__type__` | 说明 |
|------|-----------|------|
| UITransform | `cc.UITransform` | contentSize: 720×1280 |
| Widget | `cc.Widget` | 全屏对齐 |
| EquipmentDetailPanel | `534fa1a8-9b12-44ad-8401-30d03ea10094` | 用户脚本 |

### @property 绑定清单

| @property | 类型 | 引用目标 | 状态 |
|-----------|------|---------|------|
| `nameLabel` | Label | nameLabel | ✅ 已绑定 |
| `qualityLabel` | Label | qualityLabel | ✅ 已绑定 |
| `levelLabel` | Label | levelLabel | ✅ 已绑定 |
| `enhanceLevelLabel` | Label | enhanceLevelLabel (默认隐藏) | ✅ 已绑定 |
| `powerLabel` | Label | powerLabel | ✅ 已绑定 |
| `hpStatLabel` | Label | hpStatLabel | ✅ 已绑定 |
| `atkStatLabel` | Label | atkStatLabel | ✅ 已绑定 |
| `defStatLabel` | Label | defStatLabel | ✅ 已绑定 |
| `equipStatusLabel` | Label | equipStatusLabel | ✅ 已绑定 |
| `equipBtn` | Button | equipBtn | ✅ 已绑定 |
| `unequipBtn` | Button | unequipBtn (默认隐藏) | ✅ 已绑定 |
| `upgradeBtn` | Button | upgradeBtn | ✅ 已绑定 |
| `enhanceBtn` | Button | enhanceBtn | ✅ 已绑定 |
| `decomposeBtn` | Button | decomposeBtn | ✅ 已绑定 |
| `previewContainer` | Node | previewContainer (默认隐藏) | ✅ 已绑定 |
| `previewPowerLabel` | Label | previewPowerLabel | ✅ 已绑定 |
| `previewCostLabel` | Label | previewCostLabel | ✅ 已绑定 |
| `confirmDialog` | Node | confirmDialog (默认隐藏) | ✅ 已绑定 |
| `confirmTextLabel` | Label | confirmTextLabel | ✅ 已绑定 |
| `confirmBtn` | Button | confirmBtn | ✅ 已绑定 |
| `cancelBtn` | Button | cancelBtn | ✅ 已绑定 |
| `closeButton` | Button | closeButton | ✅ 已绑定 |
| `slotPickerContainer` | Node | slotPickerContainer (默认隐藏) | ✅ 已绑定 |
| `slotPickerCloseBtn` | Button | slotPickerCloseBtn | ✅ 已绑定 |

### 子节点层级

```
EquipmentDetailPanel (root, 720×1280, Widget全屏)
└── panelRoot (Sprite 背景容器, 720×1100)
    ├── nameLabel ("装备名称", 28px, 白色加粗)
    ├── qualityLabel ("传说", 18px, 金色)
    ├── levelLabel ("Lv.1", 20px)
    ├── enhanceLevelLabel ("强化 +0", 18px, 绿色, 默认隐藏)
    ├── powerLabel ("战力 0", 20px, 金色)
    ├── hpStatLabel / atkStatLabel / defStatLabel (18px)
    ├── equipStatusLabel ("背包中", 16px, 灰色)
    ├── equipBtn / unequipBtn ("装备"/"卸下", 160×48)
    ├── upgradeBtn / enhanceBtn / decomposeBtn ("升级"/"强化"/"分解", 160×48)
    ├── previewContainer (默认隐藏, 500×80, Sprite背景)
    │   ├── previewPowerLabel ("", 18px, 金色)
    │   └── previewCostLabel ("", 16px, 灰色)
    ├── confirmDialog (默认隐藏, 500×220, Sprite背景)
    │   ├── confirmTextLabel ("", 18px)
    │   ├── confirmBtn ("确认", 160×48)
    │   └── cancelBtn ("取消", 160×48)
    ├── closeButton ("✕", 60×60)
    └── slotPickerContainer (默认隐藏, 400×60, Sprite背景)
        └── slotPickerCloseBtn ("✕", 40×40)
```

---

## 脚本 .meta 文件检查

| 脚本 | .meta UUID | importer | imported | 状态 |
|------|-----------|----------|----------|------|
| EquipmentPanel.ts | fd274f49-b5d5-4940-92d0-1131d863d326 | typescript | true | ✅ |
| EquipmentBagPanel.ts | fb89d971-e13e-43f8-aa9c-6d9e087e9125 | typescript | true | ✅ |
| EquipmentDetailPanel.ts | 534fa1a8-9b12-44ad-8401-30d03ea10094 | typescript | true | ✅ |
| EquipmentSlotItem.ts | 1fb33f53-ba73-4db1-9a7a-c76bf68c0696 | typescript | true | ✅ |
| EquipmentItemView.ts | 70da1968-b79c-40ba-839a-73b2feec494c | typescript | true | ✅ |

所有脚本 `.ts.meta` 的 UUID 与 Prefab JSON 中的 `__type__` 完全匹配，Cocos Creator 可正确识别脚本组件。

---

## Cocos Creator Inspector 实测

**未实测。**

需用户在 Cocos Creator 3.8.8 中验证：

1. 关闭并重新打开 Cocos Creator 项目（刷新脚本编译 + AssetDB）
2. 在 Assets 面板中逐个双击打开 5 个 Equipment Prefab
3. 确认每个 Prefab 的 Inspector 显示：
   - Node
   - cc.UITransform
   - 对应的脚本组件 (EquipmentPanel / EquipmentBagPanel / EquipmentDetailPanel / EquipmentSlotItem / EquipmentItemView)
4. 确认所有 @property 字段在 Inspector 中正确显示绑定目标
5. 将 EquipmentSlotItem.prefab 拖入 EquipmentPanel 的 `slotItemPrefab` 字段
6. 将 EquipmentItemView.prefab 拖入 EquipmentBagPanel 的 `itemTemplate` 字段

---

## 关键说明

1. 所有 Prefab 从零重建，使用与项目现有工作 Prefab（ArtifactItem、ArtifactPanel）完全一致的 JSON 格式
2. 脚本 UUID 使用完整格式（非压缩），与 `.ts.meta` 文件完全一致
3. 面板级 Prefab 包含 `cc.Widget` 组件用于全屏自适应
4. 每个根节点仅包含正确的组件组合（Node + UITransform + 用户脚本 + 可选 Widget），不会出现重复 UITransform
5. 默认隐藏的节点（enhanceLevelLabel、previewContainer、confirmDialog、slotPickerContainer、equippedBadgeNode、emptyHintNode）初始 `_active: false`
