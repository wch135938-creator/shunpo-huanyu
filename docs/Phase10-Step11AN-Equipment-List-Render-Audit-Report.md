# Phase10-Step11AN Equipment List Render Audit Report

**Date:** 2026-06-12
**Status:** COMPLETED
**Scope:** EquipmentBagPanel.ts 列表渲染链路审计
**Constraint:** 只审计，不修改

---

## 执行摘要

**根因定位：`open()` 方法中 `_refreshList()` 在 `show()` 之前调用，导致 EquipmentItemView 的 `onLoad()` 未执行时 `setData()` 已调用，所有 label 引用为 null，列表项不可见。**

1 行代码顺序问题（line 218 vs line 220）导致整个列表为空。

---

## 一、现象确认

| 观察项 | 状态 | 含义 |
|--------|:--:|------|
| 标题 "选择装备 · 护甲" | ✅ 显示 | `open()` 已执行，titleLabel 正常 |
| 筛选 "护甲 · 全部品质 · 1件" | ✅ 显示 | `_getFilteredEntries()` 返回 1 条 ViewModel |
| "RENDER_OK" | ✅ 显示 | Scene 中独立的调试 Label（绿色），非 BagPanel 内容 |
| 装备列表 | ❌ 为空 | **1 条数据存在但 Item 不可见** |

---

## 二、渲染链路追踪

### 完整调用链

```
EquipmentMediator.start()
  → _connectPanels()
    → _openActiveScenePanel()
      → _openBagPanel(slotId)                          [EquipmentMediator.ts:261]
        → this.bagPanel.open(heroId, slotId)            [EquipmentBagPanel.ts:189]
          → this._ensureInit()                          // Line 196
          → this.titleLabel.string = "选择装备 · 护甲"    // Line 211 ✅
          → this._refreshFilterButtons()                // Line 217
          → this._refreshList()                         // Line 218 ← 问题位置
          → this.show()                                 // Line 220 ← 激活在刷新之后
```

### `_refreshList()` 内部流程

```
_refreshList()                                          [Line 343]
  → viewModels = _getFilteredEntries()                  [Line 344] → 返回 1 条
  → emptyHintNode.active = false                        [Line 351] (1 > 0)
  → _getOrCreateItem()                                  [Line 356]
    → pool 为空 → 新建
    → this.itemTemplate 非 null (UUID 正确绑定)          [Line 414]
    → instantiate(this.itemTemplate)                    [Line 420] → 创建节点
    → node.getComponent(EquipmentItemView)               [Line 423] → 获取组件
    → node.setParent(this.contentNode)                  [Line 429] → 挂到 contentNode
    → 返回 comp
  → _activeItems.push(item)                             [Line 358]
  → item.setData(viewModels[0])                         [Line 366]
    → this._viewModel = viewModel                       [setData Line 109]
    → this._refreshUI()                                 [setData Line 111]
      → this.nameLabel?.string = vm.name                [_refreshUI Line 158-159]
      → this.qualityLabel?.string = "..."               [_refreshUI Line 163-165]
      → ... 全部 label 引用此时均为 null                  ← 致命点
  → item.node.active = true                             [Line 367]
  → layout.updateLayout()                               [Line 391]
  → _updateFilterHint()                                 [Line 380] → 显示 "1件" ✅
```

---

## 三、根因分析

### 核心问题

**`open()` 方法中 `_refreshList()` 在 `this.show()` 之前调用。** 这是 1 行代码顺序问题。

```typescript
// EquipmentBagPanel.ts:217-220 — 当前顺序（错误）
this._refreshFilterButtons();
this._refreshList();   // ← Line 218: 列表刷新时 node.active = false
this.show();           // ← Line 220: 激活在刷新之后
```

### 详细机制

#### Step 1: `_ensureInit()` (line 196)

`_ensureInit()` 执行初始化：`_recoverBindings()`, `_bindEvents()`, `_ensureVisualBlocks()`, `_ensureItemTemplateLoaded()`。

**但不会激活节点。** `this.node.active` 仍为 `false`。

#### Step 2: `_refreshList()` (line 218)

调用 `_getOrCreateItem()` → `instantiate(this.itemTemplate)` 创建 EquipmentItemView 节点。

此时 **EquipmentBagPanel 节点链全部 inactive**：
- EquipmentBagPanel (root): `active = false`
- → panelRoot: 父节点 inactive → 有效 inactive
- → scrollView → view → contentNode: 有效 inactive
- → **新创建的 EquipmentItemView**: 父链 inactive → 有效 inactive

#### Step 3: `getComponent(EquipmentItemView)` + `setData()` (lines 423, 366)

`getComponent()` 成功找到组件（组件在 Prefab JSON 中存在且正确绑定）。

但 `setData()` → `_refreshUI()` 中：
```typescript
// EquipmentItemView._refreshUI() — line 143-200
if (this.nameLabel) this.nameLabel.string = vm.name;     // nameLabel === null → 跳过
if (this.qualityLabel) this.qualityLabel.string = "..."; // qualityLabel === null → 跳过
if (this.statsLabel) this.statsLabel.string = "...";     // statsLabel === null → 跳过
if (this.powerLabel) this.powerLabel.string = "...";     // powerLabel === null → 跳过
```

**所有 label 引用均为 null**，因为 `EquipmentItemView.onLoad()` 尚未执行，`_recoverBindings()` 尚未运行。

#### Step 4: `this.show()` (line 220)

BagPanel 节点激活 → 子节点链变为有效 active → EquipmentItemView `onLoad()` 触发。

`onLoad()` → `_recoverBindings()` 找到所有子节点引用：
```typescript
// EquipmentItemView._recoverBindings() — line 210-219
this.nameLabel = this._findNode('nameLabel')?.getComponent(Label);    // ✅ 成功
this.qualityLabel = this._findNode('qualityLabel')?.getComponent(Label); // ✅ 成功
// ... 所有引用现在可用
```

**但 `_refreshUI()` 不会再次调用。** `this._viewModel` 已设置（从 Step 3），但 Label.string 仍为空字符串。

### 结果

树中确实存在 1 个 EquipmentItemView 节点（contentNode 的 child），但其所有 Label 组件的 `string` 属性为空。**节点存在但不可见（文本为空）。**

---

## 四、证据链

### 4.1 Scene JSON 确认

| 元素 | UUID / 引用 | 状态 |
|------|------|:--:|
| EquipmentBagPanel 节点 | Scene `__id__ 69` | `_active: false` |
| itemTemplate 绑定 | `f4d5e6a7...` → `d2b3c4e5...` | ✅ UUID 匹配 EquipmentItemView.prefab |
| contentNode 子节点 | 初始为空 `_children: []` | ✅ 待动态填充 |
| EquipmentItemView.prefab | `d2b3c4e5-f6a7-8901-bcde-f12345678901` | ✅ 存在于 `assets/prefabs/items/` |

### 4.2 Prefab 结构确认

**EquipmentItemView.prefab** (root node):
- UITransform: 660 × 100, anchor (0.5, 0.5)
- Component: `70da1lot5xAuoOac7L+7ElM` (EquipmentItemView compiled type)
- Children: bgNode, qualityBarNode, nameLabel, qualityLabel, statsLabel, powerLabel, equippedBadgeNode, clickButton
- All children have Label/Sprite/Button components ✅

**EquipmentBagPanel.prefab** (contentNode):
- UITransform: 680 × 14, anchor (0.5, 1)
- Layout: VERTICAL, resizeMode=CONTAINER, paddingTop=10, paddingBottom=10, spacingY=6

### 4.3 数据流确认

```
InventoryService.getAllInstanceItems()
  → InstanceItem[] (含 1 条 category='Equipment' 的物品)
    → EquipmentInventoryView.getEquipmentList(filter)
      → 筛选后 [1 条 EquipmentViewModel]
        → EquipmentUIPresenter.getEquipmentList()
          → 缓存 → 返回 [1 条]
            → BagPanel._getFilteredEntries()
              → viewModels.length = 1 ✅
```

数据链路完整且正确。

### 4.4 代码证据总结

| 检查点 | 文件:行号 | 结果 |
|--------|------|:--:|
| `itemTemplate` 绑定 UUID | BagPanel.prefab:3043-3046 | ✅ |
| UUID 对应真实 Prefab | EquipmentItemView.prefab.meta:5 | ✅ |
| `getComponent` 能找到组件 | Prefab JSON root 有 EquipmentItemView 类型 | ✅ |
| `setData` 被调用 | BagPanel.ts:366 | ✅ |
| `_refreshUI` 检查 ViewModel | EquipmentItemView.ts:144 | ✅ |
| `_refreshUI` 检查 nameLabel | EquipmentItemView.ts:158 | ❌ null → skip |
| nameLabel 何时被赋值 | EquipmentItemView.ts:212 (`_recoverBindings`) | ❌ 在 onLoad 中 |
| onLoad 何时被调用 | 父节点 active 后 | ❌ 在 show() 之后 |
| show() 何时被调用 | BagPanel.ts:220 | ❌ 在 _refreshList 之后 |

---

## 五、必须回答的问题

### Q1: 为什么 Inventory 有 1 件装备但界面没有任何装备 Item？

**答：** `open()` 方法中 `_refreshList()` (line 218) 在 `this.show()` (line 220) 之前调用。

当 `_refreshList()` 创建 EquipmentItemView 节点并调用 `setData()` 时，BagPanel 节点链处于 inactive 状态。EquipmentItemView 的 `onLoad()` 未执行，`_recoverBindings()` 未运行，所有子节点引用（`nameLabel`, `qualityLabel`, `statsLabel`, `powerLabel` 等）均为 null。

`setData()` → `_refreshUI()` 中每个 Label 的设置都因 `if (this.nameLabel)` null check 被跳过。

之后 `this.show()` 激活节点，`onLoad()` 执行了 `_recoverBindings()` 找到了所有 Label 引用，但 `_refreshUI()` 不再被调用，Label 文本保持为空。

**结果：列表项节点存在于 contentNode 中，但所有文本为空，视觉上列表为空。**

### Q2: 为什么标题和筛选提示正常显示？

**答：** `titleLabel` 和 `filterHintLabel` 属于 **BagPanel 自身的节点**，它们的引用在 `onLoad()` 中通过 `_recoverBindings()` 恢复。BagPanel 的 `onLoad()` 在场景加载时可能已经被调用（即使节点初始 inactive），或者 `_ensureInit()` 中的 `_recoverBindings()` 确保了引用可用。

而 `EquipmentItemView` 是**动态 instantiate 创建**的子节点，它的 `onLoad()` 依赖父链 active 状态。

### Q3: itemTemplate 是否正确绑定？

**答：** 是。`EquipmentBagPanel.prefab` 的 `itemTemplate` 属性绑定到 UUID `d2b3c4e5-f6a7-8901-bcde-f12345678901`，该 UUID 对应 `assets/prefabs/items/EquipmentItemView.prefab`（通过 `.meta` 文件确认）。

**itemTemplate 绑定不是问题根源。**

### Q4: contentNode 结构是否正确？

**答：** 是。contentNode 具有：
- UITransform (680 × 14)
- Layout (VERTICAL, CONTAINER resize, spacingY=6)

Layout 设置为 CONTAINER resize，会根据子节点自动调整高度。结构正确。

### Q5: 当前问题的归属？

| 类别 | 判断 |
|------|------|
| Scene | ❌ 不是 Scene 问题 |
| Prefab | ❌ 不是 Prefab 结构问题 |
| 数据层 | ❌ 不是数据链路问题 |
| **脚本逻辑** | ✅ **`open()` 方法中调用顺序问题** |

---

## 六、修复方案（仅供参考，不实施）

问题位于 [EquipmentBagPanel.ts:217-220](assets/scripts/ui/EquipmentBagPanel.ts#L217-L220)。

**当前代码（错误）：**
```typescript
this._refreshFilterButtons();
this._refreshList();    // ← 此时 node.active = false
this.show();            // ← 激活在刷新之后
```

**应修改为：**
```typescript
this.show();            // ← 先激活节点
this._refreshFilterButtons();
this._refreshList();    // ← 再刷新列表
```

将 `this.show()` 移到 `this._refreshList()` 之前即可解决问题。这样 EquipmentItemView 在 `instantiate()` → `setParent()` 后 `onLoad()` 会立即执行，`_recoverBindings()` 完成后再调用 `setData()`，所有 label 引用均可用。

**或备选方案（在 EquipmentItemView.ts 中）：**
```typescript
// EquipmentItemView.onLoad() 末尾增加
onLoad(): void {
    this._recoverBindings();
    if (this.clickButton) { ... }
    // 如果 setData 在 onLoad 之前被调用，重新刷新 UI
    if (this._viewModel) {
        this._refreshUI();
    }
}
```

双保险策略，即使 BagPanel 调用顺序不变，也能保证 UI 正确渲染。

---

## 七、结论

**1 行代码顺序问题导致整个列表为空。**

根本原因：`open()` 方法中 `this._refreshList()` 在 `this.show()` 之前调用。

影响范围：仅 EquipmentBagPanel 的列表渲染，不影响其他 UI 面板。

严重程度：**P1** — 功能阻断（列表完全不显示），但修复极其简单（调换 2 行代码顺序）。

Scene / Prefab / 数据链路均无问题。
