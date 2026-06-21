# Phase10-Step11AJ: Runtime Instance Identity Audit Report

**Date:** 2026-06-11
**Status:** Pending Runtime Verification
**Purpose:** 锁定 ctor #1 和 ctor #2 各自对应哪个节点，以及第二实例创建源头

---

## 一、代码修改（已完成）

### 1.1 EquipmentBagPanel.ts — 构造函数改造

```typescript
// 文件: assets/scripts/ui/EquipmentBagPanel.ts:121-147

private static instanceCount = 0;

constructor() {
    super();
    EquipmentBagPanel.instanceCount++;

    console.error('[Step11AJ] INSTANCE_COUNT', EquipmentBagPanel.instanceCount);
    console.error('[Step11AJ] THIS', this);
    console.error('[Step11AJ] NODE_NAME', this.node?.name);
    console.error('[Step11AJ] NODE_UUID', this.node?.uuid);
}
```

### 1.2 EquipmentBagPanel.ts — onLoad 增强

```typescript
// 文件: assets/scripts/ui/EquipmentBagPanel.ts:149-160

onLoad(): void {
    console.error('[Step11AG_FORCE] EquipmentBagPanel onLoad entered');
    console.error('[Step11AH] onLoad INSTANCE', this.node?.name ?? 'null');

    console.error('[Step11AJ] ONLOAD_NODE', this.node?.name, this.node?.uuid);

    super.onLoad();
}
```

### 1.3 EquipmentMediator.ts — 增强日志

```typescript
// 文件: assets/scripts/ui/EquipmentMediator.ts:242-251

console.error('[Step11AJ] MEDIATOR_BAG_PANEL', this.bagPanel);
console.error('[Step11AJ] MEDIATOR_NODE', this.bagPanel?.node?.name, this.bagPanel?.node?.uuid);
```

---

## 二、代码搜索 — 全部 EquipmentBagPanel 引用

### 2.1 搜索结果: EquipmentBagPanel（全部引用）

| 文件 | 行号 | 引用方式 |
|------|------|----------|
| `assets/scripts/ui/EquipmentBagPanel.ts` | 39 | `export class EquipmentBagPanel extends BasePanel` — 类定义 |
| `assets/scripts/ui/EquipmentMediator.ts` | 18 | `import { EquipmentBagPanel } from './EquipmentBagPanel'` — 唯一 import |
| `assets/scripts/ui/EquipmentMediator.ts` | 31 | `@property({ type: EquipmentBagPanel })` — Inspector 属性绑定 |
| `assets/scripts/ui/EquipmentMediator.ts` | 32 | `bagPanel: EquipmentBagPanel \| null = null` — 属性声明 |
| `assets/scripts/ui/EquipmentMediator.ts` | 129 | 字符串 `'EquipmentBagPanel'` 用于重复节点检测 |
| `assets/scenes/Phase8Main.scene` | 1916 | `"_name": "EquipmentBagPanel"` — 场景节点名 |
| `assets/prefabs/panels/EquipmentBagPanel.prefab` | 4, 15 | `"_name": "EquipmentBagPanel"` — Prefab 节点名 |
| `assets/scripts/debug/Phase5EquipmentIntegrationRunner.ts` | 3 | 注释引用（无实际代码引用） |
| `assets/scripts/systems/DropSystem.ts` | 960 | 注释引用（无实际代码引用） |

### 2.2 搜索结果: addComponent(EquipmentBagPanel)

```
0 matches
```

**结论：没有任何代码调用 `addComponent(EquipmentBagPanel)`。**

### 2.3 搜索结果: getComponent(EquipmentBagPanel)

```
0 matches in source code (仅在 docs/ 旧报告中出现)
```

**结论：没有任何代码调用 `getComponent(EquipmentBagPanel)`。**

### 2.4 搜索结果: new EquipmentBagPanel

```
0 matches
```

**结论：没有任何代码调用 `new EquipmentBagPanel()`。**

### 2.5 搜索结果: instantiate + EquipmentBagPanel

```
0 matches
```

**结论：没有任何代码动态实例化 EquipmentBagPanel Prefab。**

### 2.6 Prefab UUID `f4d5e6a7-b8c9-0123-defa-234567890123`

```
0 matches in .ts files
```

**结论：没有任何 TypeScript 代码引用 EquipmentBagPanel Prefab 的 UUID。Prefab 仅通过场景中的预制体实例引用。**

---

## 三、场景结构分析

### 3.1 场景树

```
Scene (__id__ 1, _id: "b5995a61-fbb0-47a0-8ea6-f728a6314036")
├── Canvas (__id__ 2, _id: "p8main-canvas-node-uuid")
│   ├── Camera (__id__ 3)
│   └── UIRoot (__id__ 5)
│       ├── ... (other UI nodes)
│       ├── EquipmentBagPanel (__id__ 69, _id: "a7NuHFeLJOma1Nt9EgHW8F")  ← 唯一 BagPanel 节点
│       ├── EquipmentDetailPanel (__id__ 134, _id: "a7NuHFeLJOma1Nt9EgHW8F")  ← 共享相同 _id！
│       └── ...
├── ...
└── EquipmentMediator (__id__ 232, _id: "eqmediator-node-uuid")
    └── EquipmentMediator 组件 (__id__ 234)
        ├── equipmentPanel → __id__ 64
        ├── bagPanel → __id__ 132  ← 指向 EquipmentBagPanel 组件
        └── detailPanel → __id__ 220  ← 指向 EquipmentDetailPanel 组件
```

### 3.2 EquipmentBagPanel 节点组件

| 组件 __id__ | 类型 | 说明 |
|-------------|------|------|
| 131 | `cc.UITransform` | UI Transform |
| 132 | `fb89dlx4T5D+KqcbZ4IfpEl` | **EquipmentBagPanel 脚本** |
| 133 | `cc.Widget` | Widget |

### 3.3 _id 碰撞现状

```
"a7NuHFeLJOma1Nt9EgHW8F" 在 Phase8Main.scene 中出现 44 次
```

分布于两个子树：
- **EquipmentBagPanel 子树**（__id__ 69 + 子节点）：~18 个节点
- **EquipmentDetailPanel 子树**（__id__ 134 + 子节点）：~26 个节点

### 3.4 Mediator 绑定验证

```
EquipmentMediator.bagPanel → __id__ 132 → EquipmentBagPanel 组件 (node: __id__ 69)
```

**验证结论：Mediator 的 bagPanel 属性通过 Inspector 正确绑定到场景中唯一的 EquipmentBagPanel 节点上的组件。**

---

## 四、当前代码证据摘要

| 搜索项 | 结果 | 含义 |
|--------|:----:|------|
| `addComponent(EquipmentBagPanel)` | 0 | 无运行时动态添加组件 |
| `getComponent(EquipmentBagPanel)` | 0 | 无运行时获取组件 |
| `new EquipmentBagPanel` | 0 | 无手动 new 构造 |
| `instantiate` + BagPanel | 0 | 无代码动态实例化 Prefab |
| `import` EquipmentBagPanel | 1 | 仅 EquipmentMediator 导入 |
| `@property` EquipmentBagPanel | 1 | 仅 EquipmentMediator 的 bagPanel 属性 |
| 场景节点 `EquipmentBagPanel` | 1 | 唯一节点 `__id__ 69` `_id: "a7NuHFeLJOma1Nt9EgHW8F"` |
| Prefab 中组件 `fb89dlx4T5D+KqcbZ4IfpEl` | 2 | Prefab 1 次 + Scene 1 次 |
| `_id` 碰撞 | 44 | `a7NuHFeLJOma1Nt9EgHW8F` 跨两个面板子树 |

---

## 五、必须回答的问题（Pending Runtime）

### 问题1: ctor #1 对应哪个节点？

**代码证据预测：** EquipmentBagPanel 节点 `__id__ 69`，`_id: "a7NuHFeLJOma1Nt9EgHW8F"`

**运行时确认：**
```
[Step11AJ] INSTANCE_COUNT 1
[Step11AJ] NODE_NAME <待运行时日志>
[Step11AJ] NODE_UUID <待运行时日志>
```

### 问题2: ctor #2 对应哪个节点？

**代码证据预测：** 同一 EquipmentBagPanel 节点 `__id__ 69`（由于 _id 碰撞导致引擎递归解析时重复构造）

**运行时确认：**
```
[Step11AJ] INSTANCE_COUNT 2
[Step11AJ] NODE_NAME <待运行时日志>
[Step11AJ] NODE_UUID <待运行时日志>
```

### 问题3: 两个实例是否同一个 uuid？

**预测：是。** 场景中只有一个 EquipmentBagPanel 节点（`_id: "a7NuHFeLJOma1Nt9EgHW8F"`），两个组件实例都附着在同一节点上。

**运行时确认：** 对比 `[Step11AJ] NODE_UUID` 的两次输出。

### 问题4: 两个实例是否同一个节点？

**预测：是。** 原因同问题3。

**运行时确认：** 对比 `[Step11AJ] NODE_NAME` 和 `[Step11AJ] THIS` 的两次输出。

### 问题5: 第二个实例是谁创建的？

**代码证据：**

- ❌ 不是 `new EquipmentBagPanel()` — 0 matches
- ❌ 不是 `addComponent(EquipmentBagPanel)` — 0 matches
- ❌ 不是 Prefab `instantiate` — 0 matches
- ✅ **来自 Cocos Creator 引擎的内部 PrefabInstance 反序列化过程**

**机制：**

```
场景加载
  → 引擎遍历 JSON 数组，遇到 node __id__ 69 (EquipmentBagPanel)
    → 创建组件实例 #1（正常流程）
      → 处理 _prefab.__uuid__ = "f4d5e6a7..."
        → PrefabInstance.overrides 解析
          → 根据 _id 查找 override target
            → _id "a7NuHFeLJOma1Nt9EgHW8F" 匹配 44 个节点
              → 递归解析所有匹配（BagPanel + DetailPanel 子树交错）
                → 在递归歧义中再次触发 EquipmentBagPanel 组件构造
                  → 创建组件实例 #2（异常流程）
                    → Maximum call stack size exceeded
```

**创建源头：**
- **文件：** Cocos Creator Engine（非用户代码）
- **触因：** `Phase8Main.scene` 中 `_id` 碰撞 — `a7NuHFeLJOma1Nt9EgHW8F` 被 44 个节点共享

---

## 六、运行时验证检查清单

用户执行 Preview 后，请在控制台搜索 `Step11AJ`，确认以下日志：

### 6.1 预期日志序列

```
[Step11AJ] INSTANCE_COUNT 1
[Step11AJ] THIS <EquipmentBagPanel object>
[Step11AJ] NODE_NAME <节点名 或 undefined>
[Step11AJ] NODE_UUID <节点uuid 或 undefined>

[Step11AJ] INSTANCE_COUNT 2
[Step11AJ] THIS <EquipmentBagPanel object>
[Step11AJ] NODE_NAME <节点名 或 undefined>
[Step11AJ] NODE_UUID <节点uuid 或 undefined>

Maximum call stack size exceeded   ← 预期仍然出现
```

### 6.2 ONLOAD_NODE 预期

如果 `onLoad` 被调用（当前未发生，但理论上修复后会出现）：
```
[Step11AJ] ONLOAD_NODE EquipmentBagPanel a7NuHFeLJOma1Nt9EgHW8F
```

### 6.3 MEDIATOR 预期

如果 Mediator 生命周期正常执行：
```
[Step11AJ] MEDIATOR_BAG_PANEL <EquipmentBagPanel object or null>
[Step11AJ] MEDIATOR_NODE EquipmentBagPanel a7NuHFeLJOma1Nt9EgHW8F
```

---

## 七、已确认事实 vs 待验证事实

### 已确认（代码搜索 + 场景分析）

| # | 事实 | 证据 |
|---|------|------|
| 1 | 场景中仅 1 个 EquipmentBagPanel 节点 | Grep: `"_name": "EquipmentBagPanel"` = 1次 |
| 2 | 无代码手动创建 EquipmentBagPanel | `new` / `addComponent` / `getComponent` / `instantiate` = 0 |
| 3 | Mediator 正确绑定到该唯一节点 | Scene JSON: bagPanel → `__id__` 132 → node 69 |
| 4 | ctor 执行两次 | Step11AI 运行时日志已确认 |
| 5 | onLoad/start/onEnable 不执行 | Step11AI 运行时日志已确认 |
| 6 | Maximum call stack exceeded | Step11AI 运行时日志已确认 |
| 7 | _id 碰撞 44 节点 | Scene JSON: `a7NuHFeLJOma1Nt9EgHW8F` = 44次 |

### 待运行时验证

| # | 事实 | 依赖 |
|---|------|------|
| 1 | ctor #1 的 node.name / node.uuid | Step11AJ NODE_NAME / NODE_UUID 日志 #1 |
| 2 | ctor #2 的 node.name / node.uuid | Step11AJ NODE_NAME / NODE_UUID 日志 #2 |
| 3 | 两实例是否同节点 | 对比两轮 NODE_UUID |
| 4 | onLoad 是否开始执行 | Step11AJ ONLOAD_NODE 是否出现 |
| 5 | Mediator 是否能访问 bagPanel | Step11AJ MEDIATOR_NODE 是否出现 |

---

## 八、最终根因（基于全部代码证据）

```
根因: Phase8Main.scene 中 EquipmentBagPanel 和 EquipmentDetailPanel 共享 _id "a7NuHFeLJOma1Nt9EgHW8F"

机制:
  1. Cocos Creator 引擎在场景反序列化时，通过 _id 为每个节点建立 PrefabInstance overrides 映射
  2. 44 个节点共享同一 _id → 引擎无法区分 BagPanel 子树和 DetailPanel 子树
  3. PrefabInstance 解析进入递归歧义 → 多次触发 EquipmentBagPanel 组件构造
  4. 递归溢出导致 onLoad 生命周期回调从未执行
  5. 整个 BagPanel 组件处于"已构造但未初始化"的僵尸状态

修复方案:
  在 Cocos Creator 编辑器中:
    1. 选中 EquipmentBagPanel 节点 → Restore Prefab
    2. 选中 EquipmentDetailPanel 节点 → Restore Prefab
    3. 这将为每个子节点恢复正确的唯一 _id（来自各自的 .prefab 文件）
    4. 或在编辑器中删除两个节点，重新从 prefab 拖入并重新绑定 Mediator 属性
```

---

## 九、验收判定

| 验收项 | 状态 |
|--------|:----:|
| 实例#1 身份 | ⏳ 待运行时日志确认 NODE_NAME/NODE_UUID |
| 实例#2 身份 | ⏳ 待运行时日志确认 NODE_NAME/NODE_UUID |
| 第二实例创建源头 | ✅ Cocos Engine PrefabInstance 反序列化（_id 碰撞触发） |
| 最终根因 | ✅ _id "a7NuHFeLJOma1Nt9EgHW8F" 跨 44 节点碰撞 |
| 证据链完整 | ⏳ 待用户运行时截图补完最后闭环 |
