# Phase10-Step12A2 — Equipment UI Layout Audit Report

## 1. EquipmentPanel 节点树

```
EquipmentPanel (1280×720, Widget ALWAYS, fills Canvas)
└─ panelRoot (1280×720, Sprite dark, Widget ALWAYS, fills EquipmentPanel)
    ├─ slotContainer (640×360, y=110, Layout HORIZONTAL)
    ├─ hpBonusLabel (210×44, x=-220, y=430)
    ├─ atkBonusLabel (210×44, x=0, y=430)
    ├─ defBonusLabel (210×44, x=220, y=430)
    ├─ equipmentPowerLabel (210×44, x=-150, y=505)
    ├─ heroIdLabel (210×44, x=170, y=505)
    └─ closeButton (80×56, x=300, y=560)
```

## 2. ScrollView 结构

**EquipmentPanel 中不存在 ScrollView。**

Scene 中唯一的 ScrollView 位于 EquipmentBagPanel（__id__:4387），属于装备背包面板，与 EquipmentPanel 无关。

## 3. Viewport 尺寸

**不适用** — EquipmentPanel 无 ScrollView，无 Viewport 概念。

## 4. Content 尺寸

**不适用** — 无 ScrollView Content。

## 5. slotContainer 尺寸

| 属性 | 值 |
|------|-----|
| width | 640 |
| height | 360 |
| anchor | (0.5, 0.5) |
| position | (0, 110, 0) |

## 6. Layout 配置

| 属性 | 值 |
|------|-----|
| `_layoutType` | 1 (HORIZONTAL) |
| `_resizeMode` | 0 (NONE) |
| `_constraint` | 1 (FIXED_COL) |
| `_constraintNum` | 3 |
| `_cellSize` | 112 × 112 |
| `_spacingX` | 16 |
| `_spacingY` | 16 |
| `_paddingLeft/Right/Top/Bottom` | 16 |
| `_startAxis` | 0 (HORIZONTAL) |
| `_verticalDirection` | 1 (TOP_TO_BOTTOM) |

## 7. Widget 配置

### panelRoot Widget (核心问题)

| 属性 | 值 | 含义 |
|------|-----|------|
| `_alignFlags` | **45** | LEFT(1) \| TOP(4) \| BOTTOM(8) \| VERTICAL_CENTER(32) |
| `_alignMode` | 2 | ALWAYS |
| `_left` | 0 | ✓ isAbs |
| `_right` | — | **未设置** |
| `_top` | 0 | ✓ isAbs |
| `_bottom` | 0 | ✓ isAbs |

### EquipmentPanel Widget

| 属性 | 值 | 含义 |
|------|-----|------|
| `_alignFlags` | 45 | 同上 |
| `_alignMode` | 2 | ALWAYS |
| 四边 | 全 0 | 填满 Canvas (720×1280) |

## 8. Mask 配置

**无 Mask。** EquipmentPanel 及所有子节点均无 Mask 组件。

## 9. Sibling Index（层级顺序）

在 panelRoot 内的子节点顺序：

| Index | 节点名 | 说明 |
|-------|--------|------|
| 0 | `__EquipmentPanelBg` | 运行时 `_ensureBlock` 动态创建 |
| 1 | slotContainer | 装备槽位容器 |
| 2 | hpBonusLabel | 属性标签 |
| 3 | atkBonusLabel | 属性标签 |
| 4 | defBonusLabel | 属性标签 |
| 5 | equipmentPowerLabel | 战力标签 |
| 6 | heroIdLabel | 英雄ID标签 |
| 7 | closeButton | 关闭按钮 |

无异常遮挡关系。

## 10. Canvas 与面板尺寸对照

| 节点 | 设计尺寸 | Widget 拉伸后 | 方向 |
|------|---------|-------------|------|
| Canvas | **720 × 1280** | — | 竖屏 |
| EquipmentPanel | 1280 × 720 | **720 × 1280** | → 竖屏 |
| panelRoot | 1280 × 720 | **720+ × 1280** | 宽度溢出 |
| slotContainer | 640 × 360 | 不变 | — |

> panelRoot 的 Widget 只有 LEFT 没有 RIGHT → 宽度保持原值 1280，在 720 宽的 Canvas 中**向右溢出 560px**。

## 11. EquipmentSlotItem 尺寸

| 属性 | 值 |
|------|-----|
| width | **620** |
| height | **100** |
| anchor | (0.5, 0.5) |

> Layout cellSize=112×112，但实际 item=620×100 → 每个 item 宽度是 cell 的 **5.5 倍**，Layout 不会 resize 容器，item 会溢出 cell 边界。

## 12. 运行时尺寸（通过代码追踪确认）

`_ensureVisualBlocks()` 在 `onLoad()` 中运行的硬编码尺寸：

```ts
// EquipmentPanel.ts:290-299
_ensureBlock(this.panelRoot, '__EquipmentPanelBg', 720, 1280, new Color(25,25,35,230));
_ensureBlock(this.slotContainer, '__SlotContainerBg', 640, 360, new Color(38,44,58,180));
_ensureBlock(this.closeButton.node, '__CloseButtonBg', 80, 56, new Color(70,85,110,255));
```

**panelRoot 上的 Graphics 绘制为 720×1280 → 精确填满 Canvas → 这就是「巨大深色区域」的来源。**

---

# 最终根因（唯一）

## 布局坐标系错配

**panelRoot 的子节点位置是为 1280×720 横屏布局设计的，但 panelRoot 通过 Widget 拉伸到了 720×1280 竖屏全屏。**

关键数据链：

```
设计坐标系:  1280×720 (横屏)    →  slotContainer y=110, labels y=430~560
实际坐标系:  720×1280 (竖屏)    →  所有子节点保持原坐标
```

### 三个症状的精确解释

**1. 「巨大深色区域」**

`_ensureVisualBlocks()` 在 panelRoot 上绘制 720×1280 Graphics（深色 `#191923`），完全覆盖 Canvas。panelRoot 自身 Sprite 也是深色。整个屏幕渲染为深色背景。

**2. 「青锋剑被挤到底部/需要拖动」**

在 1280 高的竖屏空间中，slotContainer (y=110, h=360) 的实际渲染范围为：
- 中心: y = 640 + 110 = 750 (from bottom)
- 上边: y = 930 (from bottom) = 350 (from top)
- 下边: y = 570 (from bottom) = 710 (from top)

装备 Item (100 高) 在 slotContainer 内 Layout 定位在第一行，y ≈ 108 (slotContainer 内) → 屏幕 y ≈ 350~450 (from top)。

**slotContainer 及装备内容占据屏幕上方 27%~55% 区域。屏幕下方 570px (45%) 为纯深色空白。内容集中在上半部分，视觉上感觉被「挤」到一个小区域内。**

**3. 「需要拖动后才能看见内容」**

panelRoot 宽度为 1280px (Widget 未设 RIGHT，宽度保持原值)，在 720px 宽的 Canvas 中向右溢出 560px。装备 item (x ≈ -248 in panelRoot) 实际渲染在屏幕左侧约 x=32 处。用户可能需要在 Cocos Preview 中拖动来看到被溢出的右侧内容，或者该描述指的是在非常空旷的深色背景中寻找内容。

---

# 唯一修复方案

修改 **panelRoot 的 Widget** 使其正确适配竖屏布局。

### 修改文件

`assets/prefabs/panels/EquipmentPanel.prefab`

### 修改内容

**1. 修改 panelRoot 的 Widget `_alignFlags`：**

```json
// 修改前 (line 1507)
"_alignFlags": 45,

// 修改后
"_alignFlags": 15,
```

`15 = LEFT(1) | RIGHT(2) | TOP(4) | BOTTOM(8)` — 四边对齐，panelRoot 精确填满父节点 (720×1280) 而非溢出。

**2. 修改 panelRoot UITransform `_contentSize`（可选但建议）：**

```json
// 修改前 (line 1438-1441)
"_contentSize": {
    "width": 1280,
    "height": 720
}

// 修改后
"_contentSize": {
    "width": 720,
    "height": 1280
}
```

**3. 调整子节点位置以适配竖屏中心布局：**

在 `_ensureVisualBlocks()` 中调整尺寸，或在 Prefab 中调整以下节点位置：

| 节点 | 原 y | 建议 y | 说明 |
|------|------|--------|------|
| closeButton | 560 | 580 | 顶部右侧 |
| equipmentPowerLabel | 505 | 200 | 顶部信息区 |
| heroIdLabel | 505 | 200 | 顶部信息区 |
| hpBonusLabel | 430 | 130 | 属性行 |
| atkBonusLabel | 430 | 130 | 属性行 |
| defBonusLabel | 430 | 130 | 属性行 |
| slotContainer | 110 | **-200** | **主要内容区，居中偏下** |

实际上最简单且最有效的修复：

### 最小修改（推荐）

仅修改 **panelRoot UITransform 尺寸** 使其匹配竖屏，并**移除 panelRoot 的 Widget**，改用固定居中定位：

1. 删除 panelRoot 的 Widget 组件（或设置 `_enabled: false`）
2. 修改 panelRoot 尺寸为 `680 × 400`（适配竖屏、足够容纳内容）
3. 在 EquipmentPanel.ts 的 `_ensureVisualBlocks()` 中同步修改 Graphics 尺寸

### EquipmentPanel.ts 中的同步修改

```ts
// 修改前
_ensureBlock(this.panelRoot, '__EquipmentPanelBg', 720, 1280, ...);
_ensureBlock(this.slotContainer, '__SlotContainerBg', 640, 360, ...);

// 修改后
_ensureBlock(this.panelRoot, '__EquipmentPanelBg', 680, 400, ...);
_ensureBlock(this.slotContainer, '__SlotContainerBg', 648, 160, ...);
```

### 或者：仅改 Widget flags（最简方案）

如果希望保持 full-screen overlay 设计（常见于手游），只需将 `_alignFlags` 从 45 改为 15，并将子节点 y 坐标下移约 200-300 像素，使内容居中。

---

# 验收标准对照

| # | 问题 | 根因 | 修复验证点 |
|---|------|------|-----------|
| 1 | 巨大深色区域 | panelRoot Widget 拉伸 + Graphics 720×1280 | 修改后深色区域仅覆盖内容区 |
| 2 | 青锋剑被挤到底部 | 子节点 y 坐标为横屏设计，在竖屏中偏上 | 修改后青锋剑在画面中央显示 |
| 3 | 需要拖动查看 | panelRoot 宽度溢出 720px Canvas | 修改后无溢出，内容在可视区内 |

---

# 证据链

## 证据 A：Widget 配置矛盾

```
_alignFlags = 45 = LEFT | TOP | BOTTOM | VERTICAL_CENTER
                         ↑         ↑
                     同时设置 TOP 和 BOTTOM → 垂直拉伸填满

        ≠  RIGHT 未设置 → 宽度保持原值 1280px → 在 720px Canvas 中溢出
```

## 证据 B：坐标错配

```
Canvas:         720 × 1280  (竖屏)
panelRoot:      1280 × 720  (横屏设计) → Widget → 溢出宽 + 拉伸高
slotContainer:  y = 110    (横屏设计中的"偏下"位置)
                            在竖屏 1280 高中，110 是"偏上"位置
```

## 证据 C：运行时 Graphics 硬编码

```ts
// EquipmentPanel.ts:292 — 硬编码 720×1280
_ensureBlock(this.panelRoot, '__EquipmentPanelBg', 720, 1280, ...)
// Graphics 绘满整个 Canvas，即「巨大深色区域」
```

## 证据 D：Layout 与 Item 尺寸矛盾

```
Layout cellSize:  112 × 112  (正方形网格)
SlotItem 实际:    620 × 100  (宽列表项)
→ 每行只放得下 1 个 item（620 > 112×3 + 16×2 = 368）
→ 实际表现：item 溢出 cell，Layout 形同虚设
```

---

# 建议执行顺序

1. **优先**：修改 `_alignFlags` 45→15，修正溢出
2. **其次**：调整子节点 y 坐标，使内容居中
3. **可选**：统一 Layout cellSize 或 SlotItem 尺寸
