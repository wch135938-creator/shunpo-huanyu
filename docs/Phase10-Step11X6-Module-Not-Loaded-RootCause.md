# Phase10-Step11X6 — Module Not Loaded Root Cause Investigation

## 调查时间

2026-06-09

## 运行验证结果

```
[MEDIATOR_MODULE_LOADED]  ← 未出现
[MEDIATOR_ONLOAD]         ← 未出现
[MEDIATOR_START]          ← 未出现
```

**结论：EquipmentMediator.ts 模块完全未进入 SystemJS 运行时加载链。**

---

## 调查项 1：Scene → Script 映射真实性

| 字段 | 值 |
|------|-----|
| 节点路径 | Scene `Phase8Main` → Node `EquipmentMediator` (index 234) |
| 节点 `_id` | `eqmediator-node-uuid` |
| 节点 `_active` | `true` |
| 组件 `__type__` | `679c9TwPJxFNbkGrNmpcHbr` |
| 组件 `_enabled` | `true` |
| 组件 `_id` | `eqmediator-script-uuid` |
| equipmentPanel 绑定 | `__id__: 64` ✅ |
| bagPanel 绑定 | `__id__: 132` ✅ |
| detailPanel 绑定 | `__id__: 221` ✅ |

**Library 场景** (`library/b5/b5995a61-...json`) 与 **Source 场景** (`assets/scenes/Phase8Main.scene`) 完全一致。

**结论：场景中的 `__type__: "679c9TwPJxFNbkGrNmpcHbr"` 唯一且正确对应 `EquipmentMediator.ts`。**

---

## 调查项 2：UUID 反查

| 层级 | UUID | 文件 |
|------|------|------|
| .meta | `679c94f0-3c9c-4535-b906-acd9a97076eb` | `EquipmentMediator.ts` |
| Scene `__type__` | `679c9TwPJxFNbkGrNmpcHbr` (compressed) | - |
| `_RF.push` | `679c9TwPJxFNbkGrNmpcHbr` | chunk `fcd0934...js` |
| Library .assets-info | `679c94f0-3c9c-4535-b906-acd9a97076eb` → `scripts\ui\EquipmentMediator.ts` | ✅ |
| Library .assets-data | `679c94f0-3c9c-4535-b906-acd9a97076eb` → `db://assets/scripts/ui/EquipmentMediator.ts` | ✅ |

**全项目扫描：UUID `679c94f0` 仅对应 1 个文件。无重复、无冲突。**

---

## 调查项 3：Tree Shaking 检查

| 阶段 | 状态 | 证据 |
|------|------|------|
| Chunk 生成 | ✅ 已生成 | `temp/.../preview/chunks/fc/fcd0934261025c93e15bbd01b278622d545190c3.js` (26KB) |
| Chunk 注册 (import-map) | ✅ 已注册 | `import-map.json:219` → `./chunks/fc/fcd0934...js` |
| Chunk 执行 | ❌ 未执行 | `[MEDIATOR_MODULE_LOADED]` 从未出现 |
| 编译时间 | ✅ 最新 | Chunk 21:02 vs Source 20:59 |

**Tree Shaking 排除：chunk 已生成并注册，未被剔除。**

---

## 调查项 4：Sweep 模块检查

### 4.1 导入链

```
Phase8Main.scene (b5995a61-...)
  │
  ├─ dependScripts (library\.assets-data.json:1430-1436)
  │    ├── fd274f49... (EquipmentPanel.ts)    ✅
  │    ├── fb89d971... (???.ts)
  │    ├── 534fa1a8... (???.ts)
  │    ├── 989a740d... (Phase8Bootstrap.ts)
  │    ├── f9a3c7e1... (???.ts)
  │    └── 679c94f0... (EquipmentMediator.ts)  ✅ ← 在列表中
  │
  ├─ main-record.json
  │    └── EquipmentMediator.ts → type: "module", messages: []  ✅
  │
  └─ import-map.json
       └── EquipmentMediator.ts → ./chunks/fc/fcd0934...js  ✅
```

### 4.2 其他导入源

```
Phase5EquipmentIntegrationRunner.ts
  └── import { EquipmentMediator } from '../ui/EquipmentMediator'
       → 编译为 chunk 33debd25...js ✅
```

**结论：EquipmentMediator 同时被 scene dependScripts 和 Phase5EquipmentIntegrationRunner 引用。两个入口都足以触发模块加载。**

---

## 调查项 5：Runtime Entry 检查

| 引用方式 | 是否存在 |
|----------|----------|
| `import { EquipmentMediator }` | ✅ Phase5EquipmentIntegrationRunner.ts:25 |
| `new EquipmentMediator` | ❌ 无（由引擎通过 _RF 机制自动实例化） |
| `getComponent(EquipmentMediator)` | ❌ 无 |
| `addComponent(EquipmentMediator)` | ❌ 无 |

**结论：EquipmentMediator 通过 `@ccclass` 装饰器 + `_RF.push` 注册，由场景反序列化器自动实例化。无需显式 `new`/`addComponent`。**

---

## 调查项 6：EquipmentPanel vs EquipmentMediator 对比

| 维度 | EquipmentPanel | EquipmentMediator | 差异 |
|------|---------------|-------------------|------|
| 源文件 | `EquipmentPanel.ts` | `EquipmentMediator.ts` | 无 |
| .meta UUID | `fd274f49-...` | `679c94f0-...` | 无 |
| 压缩 UUID | `fd2749JtdVJQJLQETHYY9Mm` | `679c9TwPJxFNbkGrNmpcHbr` | 无 |
| Scene `__type__` | `fd2749JtdVJQJLQETHYY9Mm` | `679c9TwPJxFNbkGrNmpcHbr` | 无 |
| `_RF.push` 注册 | ✅ 一致 | ✅ 一致 | 无 |
| Module-level console.error | ✅ `[Step11Q_FORCE]` | ✅ `[MEDIATOR_MODULE_LOADED]` | 无 |
| import-map 映射 | ✅ 存在 | ✅ 存在 | 无 |
| main-record type | `"module"` | `"module"` | 无 |
| main-record messages | `[]` | `[]` | 无 |
| Library .assets-info | ✅ 存在 | ✅ 存在 | 无 |
| Library .assets-data | ✅ 存在 | ✅ 存在 | 无 |
| Scene dependScripts | ✅ 存在 | ✅ 存在 | 无 |
| 组件挂载 | EquipmentPanel 节点 | EquipmentMediator 节点 | 无 |
| 历史日志 | ✅ 曾出现 | ❌ 从未出现 | **关键差异** |

**两者的编译、注册、导入链完全一致。但 Panel 历史加载成功，Mediator 从未加载。**

---

## 调查项 7：Library 缓存污染检查

| 缓存位置 | EquipmentMediator 状态 | 时间戳 |
|----------|----------------------|--------|
| `library/.assets` (行 260) | `scripts\\ui\\EquipmentMediator.ts` 存在 | - |
| `library/.assets-info.json` | UUID 映射存在，time=1781009980606 | 2026-06-09 |
| `library/.assets-data.json` | UUID entry 存在，versionCode=1 | - |
| `temp/programming/preview/chunks/fc/` | chunk 存在 | 21:02 (最新) |
| 旧 chunk/旧 UUID 映射 | ❌ 未发现 | - |

**无缓存污染。所有缓存均为最新版本。**

---

## 最终回答

### 1. EquipmentMediator.ts 是否被注册？

✅ **是。** `_RF.push({}, "679c9TwPJxFNbkGrNmpcHbr", "EquipmentMediator", undefined)` 位于编译产物的 `execute` 函数中（第 70 行）。但此 `execute` 函数从未被 SystemJS 调用。

### 2. EquipmentMediator.ts 是否被执行？

❌ **否。** 模块顶层 `[MEDIATOR_MODULE_LOADED]` 从未输出。`execute` 函数未执行。

### 3. EquipmentMediator.ts 是否被引用？

✅ **是。** 被以下来源引用：
- Scene `Phase8Main` dependScripts (`library/.assets-data.json:1436`)
- `Phase5EquipmentIntegrationRunner.ts` 显式 import
- `import-map.json` 映射
- `main-record.json` 模块解析

### 4. EquipmentMediator.ts 是否被 Tree Shaking 剔除？

❌ **否。** Chunk 已生成（26KB），已在 import-map 中注册。未被剔除。

### 5. EquipmentMediator.ts 是否被旧缓存替换？

❌ **否。** 所有缓存时间戳一致，Chunk 比源码更新。

### 6. 真正导致模块未加载的根因

**证据链：**

```
模块生成   ───► chunk fcd0934...js 已生成  ✅
    ↓
模块注册   ───► import-map.json 已注册   ✅
    ↓
模块引用   ───► dependScripts / import 已引用  ✅
    ↓
模块执行   ───► execute() 未被调用  ❌ ← 断点在此
```

**根因推断（按可能性排序）：**

#### 可能性 A（最高）：Cocos Creator Preview 未触发完整重编译

模块在 21:02 完成重编译，但如果 Preview 进程在 21:02 之前已启动，则它持有旧的模块列表/缓存。旧模块列表不包含 `[MEDIATOR_MODULE_LOADED]`（虽然包含 `[MEDIATOR_ONLOAD]` 和 `[STACK_TRACE]`）。

**但为什么连 `[MEDIATOR_ONLOAD]` 也没有？** 因为如果模块根本未加载（execute 未执行），`onLoad` 当然也不会执行。

**验证**：关闭 Preview → 在编辑器中 Ctrl+S 保存 EquipmentMediator.ts → 等待 "Compilation complete" → 重新 Preview

#### 可能性 B（高）：异步 start() 导致组件初始化异常

`async start(): Promise<void>` 在 Cocos Creator 3.8 中可能触发未知的边界行为。如果引擎在等待 start() Promise 时遇到异常，可能导致整个组件被跳过。

**验证**：临时将 `async start()` 改为普通 `start()`，移除 `await _ensurePanelsLoaded()`

#### 可能性 C（中）：Phase5EquipmentIntegrationRunner 未被加载

如果 Phase5EquipmentIntegrationRunner 的 chunk 未执行（其自身依赖失败），则它不会触发 EquipmentMediator 模块的加载。

#### 可能性 D（低）：整个 Preview 运行时的脚本加载机制已全局失效

如果这是真因，则 EquipmentPanel 的 `[Step11Q_FORCE]` 在当前运行中也不会出现（历史出现不代表当前出现）。

**验证**：在 Preview 中检查是否出现 `[Step11Q_FORCE] EquipmentPanel module loaded`

---

## 下一步修复方案

### Step 1 — 验证是否为全局脚本加载失效

在 Preview 中确认 `[Step11Q_FORCE] EquipmentPanel module loaded` 是否仍出现：
- **出现** → 问题在 EquipmentMediator 特定环节 → 进入 Step 2
- **不出现** → 所有脚本加载已全局失效 → 需要排查 Preview/编译器状态

### Step 2 — 排查 EquipmentMediator 特定问题

如果 EquipmentPanel 加载正常而 EquipmentMediator 不加载：

1. 临时将 `async start()` 改为同步 `start()`，移除 `await`
2. 重新编译运行
3. 如果 `[MEDIATOR_MODULE_LOADED]` 出现 → **根因确认：async start() 导致引擎异常**

### Step 3 — 排查模块依赖失败

如果 Step 2 无效：
1. 检查 EquipmentService / InventoryService 等依赖的 chunk 是否可访问
2. 在 EquipmentMediator 的 System.register setters 中添加逐个 console.error，定位哪个依赖解析失败

### Step 4 — 强制刷新 Cocos Creator

1. 关闭 Cocos Creator
2. 删除 `temp/` 和 `library/` 目录
3. 重新打开项目，等待完整导入
4. 重新运行 Preview
