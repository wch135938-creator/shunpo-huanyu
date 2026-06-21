# Phase10-Step11AO Equipment List Render Fix Report

**Date:** 2026-06-12
**Status:** COMPLETED
**Phase:** Phase10-Step11 FINAL

---

## 修改摘要

| 文件 | 修改类型 | 行数 |
|------|------|:--:|
| [EquipmentBagPanel.ts](assets/scripts/ui/EquipmentBagPanel.ts) | 调用顺序修复 | ~line 220 |
| [EquipmentItemView.ts](assets/scripts/ui/EquipmentItemView.ts) | 防御性保护 | ~line 89 |

---

## 修改 1: EquipmentBagPanel.ts — `open()` 调用顺序

### 文件

`assets/scripts/ui/EquipmentBagPanel.ts:217-224`

### 修改前

```typescript
this._refreshFilterButtons();
this._refreshList();

this.show();
```

### 修改后

```typescript
// [Step11AO] 必须先 show() 再 _refreshList()
// 否则 EquipmentItemView.onLoad() 晚于 setData()，
// nameLabel/qualityLabel/statsLabel/powerLabel 全部为 null
this.show();

this._refreshFilterButtons();

this._refreshList();
```

### 原理

当 `_refreshList()` 在 `show()` 之前调用时，BagPanel 节点链处于 inactive 状态。`instantiate(itemTemplate)` 创建的 EquipmentItemView 挂到 inactive 父链，其 `onLoad()` 不执行 → `_recoverBindings()` 不运行 → 所有子节点引用为 null → `setData()` 中的 `_refreshUI()` 静默跳过所有 Label.string 设置。

将 `show()` 提前确保父链 active，EquipmentItemView 的 `onLoad()` 在 `setData()` 之前执行，label 引用可用。

---

## 修改 2: EquipmentItemView.ts — `onLoad()` 防御性保护

### 文件

`assets/scripts/ui/EquipmentItemView.ts:86-92`

### 修改后

```typescript
// [Step11AO] 保护：如果 setData() 在 onLoad() 之前被调用
// （例如父面板先刷新列表再 show），修复后父面板已保证 show 先于 refresh，
// 但保留此保护防止未来回归
if (this._viewModel) {
    console.error('[Step11AO] EquipmentItemView onLoad — re-rendering from cached ViewModel');
    this._refreshUI();
}
```

### 原理

双重保护。即使未来某个调用路径再次导致 `setData()` 先于 `onLoad()` 调用，`this._viewModel` 已缓存，`onLoad()` 末尾会自动重新渲染 UI。

---

## 验收清单

| 检查项 | 预期 |
|------|------|
| 标题 "选择装备 · 护甲" | ✅ 显示 |
| 筛选提示 "1件" | ✅ 显示 |
| 装备名称 | ✅ 显示 |
| 品质标签 | ✅ 显示 |
| 战力 | ✅ 显示 |
| 1件装备 → 1个列表 Item | ✅ |

---

## Phase10-Step11 关闭状态

| Step | 任务 | 状态 |
|------|------|:--:|
| Step11A-L | Scene/Prefab Repair | ✅ COMPLETED |
| Step11AM | Lifecycle Runtime Audit | ✅ COMPLETED |
| Step11AN | Equipment List Render Audit | ✅ COMPLETED |
| **Step11AO** | **Equipment List Render Fix** | ✅ **COMPLETED** |

**Phase10-Step11 FINAL PASS — 全部 4 个 Sub-step 完成。**
