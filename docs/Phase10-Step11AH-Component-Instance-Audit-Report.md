# Phase10-Step11AH: Component Instance Audit Report

**Date:** 2026-06-11
**Status:** Complete — Awaiting User Preview Verification
**Purpose:** 确认为什么 `module loaded` 但 `onLoad` 没有执行

---

## 审计任务1: EquipmentBagPanel 节点组件审计

### 节点路径

```
Phase8Main.scene
  └── Canvas (__id__ 2)
       └── UIRoot (__id__ 5)
            ├── EquipmentPanel (__id__ 6)      ← _active: true
            ├── EquipmentBagPanel (__id__ 69)   ← _**active: false**_
            ├── EquipmentDetailPanel (__id__ 134)
            └── EquipmentMediator (__id__ 222)
```

### 节点 UUID

| 属性 | 值 |
|------|-----|
| `_id` | `a7NuHFeLJOma1Nt9EgHW8F` |
| `_name` | `EquipmentBagPanel` |
| `_active` | **`false`** ⚠️ |
| `_objFlags` | `0` |
| `_parent` | __id__ 5 (UIRoot) |
| `_layer` | `33554432` (UI_2D) |

### 挂载组件列表 (3 个)

| __id__ | 类型 | _enabled | 关键属性 |
|--------|------|----------|----------|
| 131 | `cc.UITransform` | true | 720×1280, anchor(0.5,0.5) |
| 132 | **`fb89dlx4T5D+KqcbZ4IfpEl`** (EquipmentBagPanel) | true | 所有属性已绑定（panelRoot, scrollView, contentNode, itemTemplate, titleLabel, filterHintLabel, 所有按钮, closeButton, emptyHintNode） |
| 133 | `cc.Widget` | true | _alignFlags: 45 (LEFT \| RIGHT \| TOP \| BOTTOM \| H_CENTER \| V_CENTER) |

**结论：** 组件完整，无 Missing Script，所有编辑器属性已绑定。

---

## 审计任务2: Script GUID 审计

### EquipmentBagPanel.ts.meta

```
uuid: fb89d971-e13e-43f8-aa9c-6d9e087e9125
```

### Compressed UUID 对照

| 位置 | 压缩 UUID | 匹配 |
|------|-----------|------|
| .ts.meta (源) | `fb89d971-e13e-43f8-aa9c-6d9e087e9125` | — |
| Scene 组件 (__id__ 132) | `fb89dlx4T5D+KqcbZ4IfpEl` | ✅ 匹配 |
| Prefab 组件 (__id__ 65) | `fb89dlx4T5D+KqcbZ4IfpEl` | ✅ 匹配 |

**结论：** GUID 一致，无 GUID 漂移，无失效绑定。

### Prefab UUID

| 来源 | UUID |
|------|------|
| EquipmentBagPanel.prefab.meta | `f4d5e6a7-b8c9-0123-defa-234567890123` |
| Scene 子节点 `_prefab.__uuid__` | `f4d5e6a7-b8c9-0123-defa-234567890123` ✅ |

⚠️ **注意：** `f4d5e6a7-b8c9-0123-defa-234567890123` 是人工编写的连续十六进制 UUID，非 Cocos Creator 原生生成。

---

## 审计任务3: Missing Script 审计

### 检查范围

- EquipmentBagPanel 节点（__id__ 69）
- 父节点 UIRoot（__id__ 5）
- 所有子节点（panelRoot, titleLabel, filterHintLabel, typeAllBtn, typeWeaponBtn, typeArmorBtn, typeAccessoryBtn, qualityAllBtn, qualityCommonBtn, qualityRareBtn, qualityEpicBtn, qualityLegendaryBtn, scrollView, closeButton, emptyHintNode）

### 结果

**未发现 Missing Script。** 所有组件类型（`cc.UITransform`, `cc.Label`, `cc.Button`, `cc.ScrollView`, `cc.Layout`, `cc.Mask`, `cc.Sprite`, `cc.Widget`, `fb89dlx4T5D+KqcbZ4IfpEl`）均为已知类型。

---

## 审计任务4: Prefab 实例覆盖审计

### PrefabInfo 分析

场景中共有 10 个 PrefabInfo：

| __id__ | root | asset UUID | 所属 |
|--------|------|-----------|------|
| ... | ... | ... | ... |
| 68 | __id__ 6 (EquipmentPanel) | `8aab8dc9-...` (EquipmentPanel.prefab) | EquipmentPanel |
| 237 | null | null | Scene root |

**关键发现：**

- **EquipmentBagPanel 节点（__id__ 69）没有对应的 PrefabInfo！**
- EquipmentBagPanel 的 `_prefab.__uuid__` = `f4d5e6a7-...` 但它没有被任何 PrefabInfo 的 `root` 引用
- 这意味着 EquipmentBagPanel 不是通过 PrefabInstance 方式正确挂载到场景的
- 它是一个"独立节点"（detached node），其子节点保留了旧的 prefab 元数据

### 状态

| 属性 | 值 |
|------|-----|
| 是否 Prefab 实例 | **否** — 无 PrefabInfo 包裹 |
| 是否断开 Prefab 关联 | **是** — 无 PrefabInfo，但子节点保留 `_prefab.__uuid__` |
| Override 列表 | N/A（非 PrefabInstance） |

---

## 审计任务5: 生命周期探针升级

### 已添加探针

```typescript
// EquipmentBagPanel.ts — 新增完整生命周期探针

constructor() {
  super();
  console.error('[Step11AH] EquipmentBagPanel ctor — INSTANCE created');
}

onLoad(): void {
  console.error('[Step11AH] onLoad INSTANCE', this.node?.name ?? 'null');
  super.onLoad();
}

start(): void {
  console.error('[Step11AH] start INSTANCE', this.node?.name ?? 'null');
}

protected onEnable(): void {
  console.error('[Step11AH] onEnable INSTANCE', this.node?.name ?? 'null');
  super.onEnable();
}

open(heroId, preselectedSlot?): void {
  console.error('[Step11AH] open INSTANCE', this.node?.name ?? 'null');
  // ...
}
```

### 探针覆盖

| 阶段 | 日志标识 | 功能 |
|------|----------|------|
| 模块加载 | `[Step11AG_FORCE] EquipmentBagPanel module loaded` | 确认模块被 import |
| 构造函数 | `[Step11AH] EquipmentBagPanel ctor — INSTANCE created` | 确认组件实例被创建 |
| onLoad | `[Step11AH] onLoad INSTANCE <name>` | 确认 onLoad 被调用 |
| start | `[Step11AH] start INSTANCE <name>` | 确认 start 被调用 |
| onEnable | `[Step11AH] onEnable INSTANCE <name>` | 确认 onEnable 被调用 |
| open | `[Step11AH] open INSTANCE <name>` | 确认 open 被调用 |

---

## 审计任务6: Prefab 创建链路审计

### 完整链路

```
Phase8Main.scene 加载
  └── Canvas (场景根子节点)
       └── UIRoot (手动节点, _prefab: null)
            ├── EquipmentPanel (PrefabInstance, PrefabInfo root=6, asset=EquipmentPanel.prefab)
            ├── EquipmentBagPanel (独立节点, _active=false, 无 PrefabInfo)
            ├── EquipmentDetailPanel (独立节点, _active=false, 无 PrefabInfo)
            └── EquipmentMediator (脚本组件挂载, 非 Panel 节点)
```

### EquipmentMediator 创建链路

```
EquipmentMediator.onLoad()
  → 初始化 InventoryService
  → 初始化 EquipmentService
  → loadConfigs (async, 不阻塞)

EquipmentMediator.start()
  → new EquipmentUIPresenter()
  → _ensurePanelsLoaded()
      → 检查 this.bagPanel !== null ✅
      → (动态加载已禁用 _loadPrefabPanel 永远返回 null)
  → _connectPanels()
      → this.bagPanel.setPresenter(presenter)
      → this.bagPanel.setItemClickCallback(...)
  → _openActiveScenePanel()
      → 打开 EquipmentPanel (不打开 BagPanel)

用户点击空槽位
  → EquipmentMediator._openBagPanel(slotId)
      → this.bagPanel.open(heroId, slotId)
          → console.error('[Step11AH] open INSTANCE', ...)
          → _ensureInit()
          → show()
```

### 结论

- **EquipmentBagPanel 仅来自场景节点**，无动态创建
- `_loadPrefabPanel()` 已禁用，始终返回 null
- `_ensurePanelsLoaded()` 仅检查 Inspector 绑定是否为 null，不会创建新节点

---

## 必须回答的问题

### 问题1: EquipmentBagPanel 节点实际挂载了哪些组件？

**3 个组件：**
- `cc.UITransform` (720×1280)
- `fb89dlx4T5D+KqcbZ4IfpEl` (EquipmentBagPanel 脚本)
- `cc.Widget` (全屏居中)

无 Missing Script。

---

### 问题2: EquipmentBagPanel.ts 是否与 Scene 绑定的是同一个 GUID？

**是的。** `fb89d971-e13e-43f8-aa9c-6d9e087e9125` → 压缩 `fb89dlx4T5D+KqcbZ4IfpEl`，Scene 和 Prefab 均使用正确压缩 UUID。

---

### 问题3: 是否存在 Missing Script？

**不存在。**

---

### 问题4: 是否存在 Prefab Override 覆盖？

**不存在。** EquipmentBagPanel 节点不是 PrefabInstance（无对应 PrefabInfo），因此无 Override 概念。

---

### 问题5: 为什么 `module loaded` 但 `onLoad` 没有执行？

#### 根因分析

基于本次完整审计，判定如下：

**直接原因：** `EquipmentBagPanel` 节点在场景中 `_active: false`。

**更深层原因：** 该节点不是 PrefabInstance（没有 PrefabInfo 包裹），其子节点保留了旧 prefab 的 `_prefab.__uuid__` 元数据。这是一个"半连接"状态 — prefab 结构保留但实例化链路不完整。

**模块加载 ≠ 组件实例化：**
- `[Step11AG_FORCE] EquipmentBagPanel module loaded` 在 TypeScript 模块被 import 时触发（模块级代码）
- 但 Component 的 `onLoad/start/onEnable` 只在 Cocos 引擎进行场景反序列化并创建组件实例时才调用
- 如果节点处于"半连接"状态（_active=false 且无 PrefabInfo），引擎可能不会实例化其上的脚本组件

**但存在矛盾：** 用户报告 UI 显示正常（"武器 · 全部品质 · 1件"），如果组件未实例化，UI 不应该工作。这说明 Component 可能在某个时间点被实例化（但不走正常 lifecycle 流程），或者存在另一个 EquipmentBagPanel 实例。

**验证方案：** Preview 后搜索 `Step11AH`，检查 `ctor` 日志是否出现。
- 如果 `ctor` 出现但 `onLoad` 不出现 → Cocos 引擎 lifecycle 异常
- 如果 `ctor` 也不出现但 `open` 出现 → 存在其他 EquipmentBagPanel 实例
- 如果所有 `Step11AH` 都不出现但 UI 仍显示 → 组件是非 EquipmentBagPanel 的旧代码

---

## 下一步验证

### 用户操作

1. **Preview** 运行
2. 在 Console 搜索 `Step11AH`
3. 截图发回

### 根据截图结果判断

| 场景 | 结论 | 下一步 |
|------|------|--------|
| `ctor` 出现, `onLoad` 出现 | 组件正常实例化，之前是缓存问题 | 继续排查 UI |
| `ctor` 出现, `onLoad` 不出现 | Cocos lifecycle 异常 | 检查 Cocos 版本/Scene 反序列化 |
| `ctor` 不出现, `open` 出现 | 存在另一个 EquipmentBagPanel | 查找重复节点 |
| 所有都不出现 | 运行时未使用最新脚本 | 转入编译链路排查 |
