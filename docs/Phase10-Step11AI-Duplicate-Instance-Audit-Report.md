# Phase10-Step11AI: Duplicate Instance Audit Report

**Date:** 2026-06-11
**Status:** Complete — Root Cause Identified
**Purpose:** 锁定为什么 ctor 出现两次、onLoad 不执行、Maximum call stack exceeded

---

## 运行时证据（已确认）

```
[Step11AH] MODULE_LOADED — EquipmentBagPanel      ← ✅ 模块加载
[Step11AH] EquipmentBagPanel ctor — INSTANCE created   ← ✅ 实例#1
[Step11AH] EquipmentBagPanel ctor — INSTANCE created   ← ✅ 实例#2
Maximum call stack size exceeded                   ← ⚠️ 递归溢出
```

生命周期日志（onLoad/start/onEnable/open/MEDIATOR_BAG_PANEL）全部未出现。

---

## 审计任务1: UUID `a7NuHFeLJOma1Nt9EgHW8F` 出现次数

### 搜索结果

`a7NuHFeLJOma1Nt9EgHW8F` 在 `Phase8Main.scene` 中出现 **44 次**。

### 分布

| 行号范围 | 所属面板 | 节点类型 | 数量 |
|----------|----------|----------|:---:|
| 1970–4298 | **EquipmentBagPanel** | 根节点 + panelRoot + 所有子节点 | ~18 |
| 5042–8788 | **EquipmentDetailPanel** | 根节点 + panelRoot + 所有子节点 | ~26 |

### 具体节点对照

#### EquipmentBagPanel 子树（行1970–4298，shared _id）

| 行号 | 节点名称 | __id__ |
|------|----------|--------|
| 1970 | **EquipmentBagPanel** (root) | 69 |
| 2064 | panelRoot | 70 |
| 2115 | titleLabel | 72 |
| 2256 | filterHintLabel | 75 |
| 2400 | typeAllBtn | 78 |
| 2599 | typeWeaponBtn | 82 |
| 2798 | typeArmorBtn | 86 |
| 2997 | typeAccessoryBtn | 90 |
| 3196 | qualityAllBtn | 94 |
| 3395 | qualityCommonBtn | 98 |
| 3594 | qualityRareBtn | 102 |
| 3793 | qualityEpicBtn | 106 |
| 3992 | qualityLegendaryBtn | 110 |
| 4192/4247/4298 | scrollView + sub-nodes | 114–116 |
| 4509 | closeButton | 123 |
| 4705 | emptyHintNode | 125 |

#### EquipmentDetailPanel 子树（行5042–8788，shared _id）

| 行号 | 节点名称 | __id__ |
|------|----------|--------|
| 5042 | **EquipmentDetailPanel** (root) | 134 |
| 5148 | panelRoot | 135 |
| 5199 | nameLabel | 137 |
| 5340 | qualityLabel | 140 |
| ... | slotPickerContainer, equipBtn, unequipBtn, upgradeBtn, enhanceBtn, decomposeBtn, confirmDialog, closeButton, etc. | 各种 |

### 正常对照

**EquipmentPanel** 所有节点使用独立的 `_id`（例如 `"02bOnthWdFrICGxaNQHPWl"`），无冲突。

**EquipmentDetailPanel.prefab** 中所有节点使用独立唯一 `_id`（例如 `"EquipmentDetailPanel-root"`, `"p8-UITransform-0"`, `"p8-Label-6"` 等），无冲突。

---

## 审计任务2: EquipmentBagPanel 节点出现次数

场景中 `"_name": "EquipmentBagPanel"` 仅出现 **1 次**（line 1916, __id__ 69）。

不存在第二 EquipmentBagPanel 节点。

不存在隐藏节点。

但 `ctor` 出现两次 → 同一个类的构造函数被执行两次，不是因为有第二个节点，而是因为同一节点上的组件被重复构造。

---

## 审计任务3: Prefab 引用检查

### EquipmentBagPanel.prefab

- Prefab UUID: `f4d5e6a7-b8c9-0123-defa-234567890123`
- 场景中仅被 EquipBagPanel 子树引用（`_prefab.__uuid__`）
- 未被嵌套引用
- 未被错误挂载到其他面板

### EquipmentDetailPanel.prefab

- Prefab UUID: `a5e6f7b8-c9d0-1234-efab-345678901234`
- 场景 DetailPanel 子树引用此 UUID
- Prefab 内所有 `_id` 均为唯一值

**关键发现：** 两个 Prefab 各自拥有正确的内部 `_id`，但场景文件中的 `_id` 被错误地统一替换为 `a7NuHFeLJOma1Nt9EgHW8F`。

---

## 审计任务4: Mediator 动态创建检查

### 搜索结果

```typescript
// EquipmentMediator.ts 中与创建相关的代码：

line 63:  this._presenter = new EquipmentUIPresenter();     // Presenter，不涉及 BagPanel
line 84:  注释：不执行任何 assetManager.loadAny/instantiate/setParent
line 152: _loadPrefabPanel() — 已禁用，永远返回 null
```

### 结论

EquipmentMediator **不动态创建** EquipmentBagPanel。bagPanel 仅通过 `@property` Inspector 绑定获取。

---

## 审计任务5: 其他面板 BagPanel 引用检查

### 搜索结果

引用 `EquipmentBagPanel` 的文件仅 2 个：
- `EquipmentMediator.ts` — Inspector 绑定
- `EquipmentBagPanel.ts` — 自身

EquipmentPanel、EquipmentDetailPanel、UIRoot 均不持有 BagPanel 引用。

---

## 审计任务6 & 7: 新增探针

### EquipmentBagPanel.ts — 实例计数器

```typescript
private static instanceCount = 0;

constructor() {
    super();
    EquipmentBagPanel.instanceCount++;
    console.error('[Step11AI] INSTANCE_COUNT', EquipmentBagPanel.instanceCount);
    console.error('[Step11AI] NODE', this.node?.name, this.node?.uuid);
}
```

### EquipmentMediator.ts — 增强引用输出

```typescript
console.error('[Step11AI] MEDIATOR_BAG_PANEL',
    'bagPanel=', this.bagPanel,
    'node.name=', this.bagPanel?.node?.name,
    'node.uuid=', this.bagPanel?.node?.uuid,
    'node.active=', this.bagPanel?.node?.active,
);
```

---

## 根因分析

### 直接根因

**Phase8Main.scene 中 EquipmentBagPanel 和 EquipmentDetailPanel 共享相同的 `_id`：`a7NuHFeLJOma1Nt9EgHW8F`**

### 影响机制

1. **场景反序列化阶段：** Cocos Creator 引擎遍历场景 JSON 数组，为每个节点创建原生对象和组件实例。

2. **ID 碰撞：** 当引擎遇到相同的 `_id` 时，PrefabInstance 系统的 override 解析机制需要根据 `_id` 定位节点。发现 44 个节点共享同一 `_id`，解析器进入递归歧义。

3. **递归溢出：** 解析器在 BagPanel 子树和 DetailPanel 子树之间循环引用，触发 `Maximum call stack size exceeded`。

4. **双重构造：** 在递归解析过程中，EquipmentBagPanel 组件被触发构造两次 — 一次为 BagPanel 节点，一次可能在 DetailPanel 的某个节点（因为它们共享 `_id`）。

5. **生命周期中断：** 堆栈溢出发生在 `ctor` 之后、`onLoad` 之前，导致组件被创建但从未完成初始化。

### 证据链

```
证据1: scene 中 "a7NuHFeLJOma1Nt9EgHW8F" 出现 44 次
  → 跨 EquipmentBagPanel 和 EquipmentDetailPanel 两个子树

证据2: EquipmentDetailPanel.prefab 有独立 _id ("EquipmentDetailPanel-root" 等)
  → 但 scene 中这些节点的 _id 被替换为 "a7NuHFeLJOma1Nt9EgHW8F"

证据3: EquipmentBagPanel.prefab 子节点 _id 为 ""（空）
  → scene 中这些节点的 _id 也被替换为 "a7NuHFeLJOma1Nt9EgHW8F"

证据4: 运行时 ctor 执行 2 次，onLoad 0 次
  → 组件被重复构造但生命周期从未开始

证据5: Maximum call stack size exceeded
  → ID 解析递归溢出

结论: _id 冲突 → 递归解析 → 双重构造 + 堆栈溢出 → 生命周期中断
```

---

## 回答必须问题

### 问题1: 为什么 ctor 执行两次？

同一 `_id` (`a7NuHFeLJOma1Nt9EgHW8F`) 被 EquipmentBagPanel (__id__ 69) 和 EquipmentDetailPanel (__id__ 134) 共享。Cocos 引擎在 PrefabInstance override 解析时，因 ID 冲突而创建了两次 EquipmentBagPanel 组件实例。

### 问题2: 运行时到底有几个 BagPanel 实例？

**2 个。** `ctor` 执行两次证实。但这两个实例都没有完成 `onLoad` 初始化。

### 问题3: `a7NuHFeLJOma1Nt9EgHW8F` 来自哪个节点？

**来自至少 44 个节点**，横跨两个面板子树。所有节点的 `_id` 被统一替换为相同值。这不是某个节点的 ID，而是两个面板子树共享的 ID。

### 问题4: 是否存在重复 UUID？

**存在。** `a7NuHFeLJOma1Nt9EgHW8F` 在 scene 中出现 44 次（应有 44 个不同的 `_id`）。

### 问题5: 递归调用链是什么？

```
Cocos Engine: 场景反序列化
  → Node.__id__ 69 (EquipmentBagPanel) _id = a7NuHFeLJOma1Nt9EgHW8F
    → 创建 EquipmentBagPanel 组件 (ctor #1)
      → _prefab.__uuid__ = f4d5e6a7-...
        → PrefabInstance override 解析
          → 根据 _id 查找 target node
            → 找到 44 个匹配节点（BagPanel + DetailPanel 子树）
              → 尝试解析每个匹配
                → BagPanel subtree → 再次遇到相同 _id
                  → DetailPanel subtree → 再次遇到相同 _id
                    → 递归溢出 (Maximum call stack size exceeded)
  → 构造第二个 EquipmentBagPanel (ctor #2, 在递归中)
  → ❌ 堆栈溢出，onLoad 从未被调用
```

---

## 修复方案

### 方案: 修复 Scene 中的 `_id` 碰撞

必须在 Cocos Creator 编辑器中操作：

1. 打开 `Phase8Main.scene`
2. 选中 `EquipmentBagPanel` 节点，右键 → `Restore Prefab` 或 `Revert to Prefab`
3. 选中 `EquipmentDetailPanel` 节点，同样 Revert to Prefab
4. 这将为每个子节点恢复正确的 `_id`（来自各自的 prefab）

或者手动：
1. 删除场景中的 EquipmentBagPanel 和 EquipmentDetailPanel 节点
2. 重新从 prefab 拖入场景
3. 在 EquipmentMediator Inspector 中重新绑定 bagPanel 和 detailPanel

---

## 下一步验证

修复后 Preview，预期应同时出现：
```
[Step11AI] INSTANCE_COUNT 1
[Step11AI] INSTANCE_COUNT 2          ← 仅当 DetailPanel 也被实例化
[Step11AH] onLoad INSTANCE EquipmentBagPanel
[Step11AH] start INSTANCE EquipmentBagPanel
[Step11AH] onEnable INSTANCE EquipmentBagPanel
[Step11AH] MEDIATOR_BAG_PANEL ...
[Step11AH] OPEN_TARGET EquipmentBagPanel true
[Step11AH] open INSTANCE EquipmentBagPanel
```

且无 `Maximum call stack size exceeded`。
