# Phase10-Step11AE Runtime Log Collection Report

**日期**: 2026-06-11
**状态**: ⚠️ 部分完成 — 需要真实 Cocos Creator 运行时验证

---

## 执行摘要

本阶段目标是收集 `[Step11AD]` 运行时日志以定位 `contentNode` 为空的根因。完成了以下工作：

1. ✅ 保留所有 Step11AD 日志代码（未删除）
2. ✅ 扩展 `_mocks/cc/index.ts` 以支持 UI 组件运行时模拟
3. ✅ 编写并运行 `_runtime_test/step11ae-render-trace.ts` 模拟渲染流程
4. ⚠️ 无法连接 Cocos Creator 实时预览（编辑器 CLI 启动后立即退出 / 无 CDP 端口开放）
5. ✅ 对 prefab 配置和场景设置进行了完整的静态分析

---

## Runtime Log（模拟环境）

以下为 `_runtime_test/step11ae-render-trace.ts` 在 Node.js 24.15 + tsx 下的完整输出：

```
============================================================
[Step11AE] Runtime Render Trace — START
============================================================
[Setup] cc mock loaded

--- STEP 2: Creating mock EquipmentItemView prefab ---
[Setup] EquipmentItemView prefab created with 9 children
[Setup] Prefab has EquipmentItemView component: true

--- STEP 3: Creating EquipmentBagPanel node structure ---
[Setup] Panel node created with 3 children
[Setup] contentNode: contentNode children: 0

========== STEP 4: Simulating _getOrCreateItem ==========

--- Case A: itemTemplate IS set (normal path) ---
[Step11AD] itemPrefab Prefab { _name: 'EquipmentItemView', data: Node {...} }
[Step11AD] instantiate start
[Step11AD] instantiate success
[Step11AD] instantiate result: Node(name=EquipmentItemView, children=9)
[Step11AD] getComponent EquipmentItemView MockEquipmentItemView { ... }
[Step11AD] addChild success
[Step11AD] childCount 1

--- Case B: itemTemplate is NULL (async fallback) ---
[Step11AD] itemPrefab null
[Step11AD] _ensureItemTemplateLoaded called, itemTemplate= null
[Step11AD] itemTemplate is null, attempting async load with UUID=d2b3c4e5-f6a7-8901-bcde-f12345678901
[Step11AD] Failed to load default EquipmentItemView prefab: Asset not found: d2b3c4e5-f6a7-8901-bcde-f12345678901

========== STEP 5: Simulating _refreshList ==========
[Step11AD] render entries 1

  [_getOrCreateItem #0]
  Pool check: empty
  [Step11AD] itemPrefab Prefab { ... }
  [Step11AD] instantiate start
  [Step11AD] instantiate success
  [Step11AD] instantiate result: OK
  [Step11AD] getComponent EquipmentItemView MockEquipmentItemView { ... }
  [Step11AD] addChild success
[Step11AD] EquipmentItemView.setData — name= 青锋剑 uniqueId= test_eq_weapon_001_abc123

  [Step11AD] childCount 2
  contentNode.children: EquipmentItemView, EquipmentItemView

========== STEP 6: Recursion / Stack Overflow Check ==========
[Step11AE] No circular references detected in contentNode hierarchy
[Step11AE] contentNode hierarchy depth: 2

========== STEP 7: Runtime State Summary ==========
itemPrefab: VALID (Prefab with EquipmentItemView)
instantiate: SUCCESS
getComponent: SUCCESS (MockEquipmentItemView)
addChild: SUCCESS
childCount: 2

========== [Step11AE] VERDICTS ==========
[Step11AE] PREFAB_EXISTS — itemTemplate is bound
[Step11AE] PREFAB_CREATED
[Step11AE] NODE_ATTACHED
```

---

## Stack Trace — Maximum call stack size exceeded

**本阶段未捕获到 `Maximum call stack size exceeded` 错误。**

模拟环境中的递归深度检查未发现循环引用或深度溢出：
- `contentNode` 层级深度: 2
- 无循环引用检测到

**结论**: 该错误可能仅在真实 Cocos Creator 运行时、特定数据或特定操作序列下触发。需要真实运行时日志。

---

## Runtime State（模拟环境）

| 指标 | 结果 |
|------|------|
| `itemPrefab` | **VALID** — Prefab 含 EquipmentItemView 组件 |
| `instantiate` | **SUCCESS** — 返回 9 个子节点的克隆 Node |
| `getComponent` | **SUCCESS** — 返回 MockEquipmentItemView 实例 |
| `addChild` | **SUCCESS** — Node 添加到 contentNode |
| `childCount` | **2**（Case A + Case B 各一个） |

---

## Prefab 配置静态分析

### 1. itemTemplate 绑定

**EquipmentBagPanel.prefab** (line 3043-3046):
```json
"itemTemplate": {
  "__uuid__": "d2b3c4e5-f6a7-8901-bcde-f12345678901",
  "__expectedType__": "cc.Prefab"
}
```
→ **已绑定** ✅

### 2. UUID 解析链

```
d2b3c4e5-f6a7-8901-bcde-f12345678901
  → EquipmentItemView.prefab.meta (uuid 匹配)
    → EquipmentItemView.prefab 含脚本组件
      → 压缩 UUID: "70da1lot5xAuoOac7L+7ElM"
        → EquipmentItemView.ts.meta: "70da1968-b79c-40ba-839a-73b2feec494c"
```
→ **UUID 链完整** ✅

### 3. contentNode 绑定

**EquipmentBagPanel.prefab** (line 3040-3041):
```json
"contentNode": {
  "__id__": 47
}
```
→ **已绑定** ✅

### 4. Phase8Main 场景配置

**EquipmentBagPanel 节点** (line 1916-1971):
```json
"_name": "EquipmentBagPanel",
"_active": false,
"_prefab": {
  "__uuid__": "f4d5e6a7-b8c9-0123-defa-234567890123",
  "__expectedType__": "cc.Prefab"
}
```
→ **节点 `_active: false`** ⚠️

---

## 代码路径分析

### 正常路径（itemTemplate 已绑定）

```
EquipmentBagPanel.open()
  → _ensureInit()
    → _recoverBindings()     // 通过 _findNode() 查找所有子节点
    → _bindEvents()          // 注册按钮事件
    → _ensureItemTemplateLoaded()  // itemTemplate != null → 直接返回
  → _refreshList()
    → _getFilteredEntries()  // Presenter → InventoryView → InstanceItem[]
    → _getOrCreateItem()
      → itemTemplate != null → instantiate(itemTemplate)
      → getComponent(EquipmentItemView)
      → setParent(contentNode)  // [Step11AD] addChild success
```

### 异常路径（itemTemplate = null）

```
EquipmentBagPanel.open()
  → _ensureInit()
    → _ensureItemTemplateLoaded()
      → itemTemplate = null → assetManager.loadAny(...)
        → UUID 在运行时无法解析 → console.error → 永久 = null
  → _refreshList()
    → _getOrCreateItem()
      → itemTemplate = null → console.warn → return null
      → _activeItems 不增长 → contentNode 永远为空
```

---

## 根因假设（待运行时验证）

### 假设 A：onLoad 在 inactive 节点上未执行（最可能）

- EquipmentBagPanel 节点 `_active: false`
- Cocos Creator 3.8 中 inactive 预制体节点的 `onLoad` 可能不执行
- 虽然代码有 `_ensureInit()` 作为 workaround（在 `open()` 中调用）
- **但 `_recoverBindings()` 恢复的是节点引用（contentNode、titleLabel 等），而不是 `itemTemplate`**
- `itemTemplate` 是 `@property` 绑定，它的值由 Cocos 引擎在反序列化时设置
- 如果属性反序列化也跳过了 inactive 节点，`itemTemplate` 将为 null

**证据**:
- `_ensureInit()` → `_recoverBindings()` 调用 `_findNode()` 查找 contentNode/panelRoot 等
- 但 **不包含** itemTemplate — itemTemplate 是 @property，不是 Node
- `_ensureItemTemplateLoaded()` 在 itemTemplate=null 时触发异步加载
- 异步加载使用 UUID `d2b3c4e5-f6a7-8901-bcde-f12345678901`
- 但 `assetManager.loadAny()` 在 Cocos Creator 运行时可能无法按 UUID 查找 Prefab 资源

### 假设 B：assetManager.loadAny UUID 查找失败

- UUID `d2b3c4e5-f6a7-8901-bcde-f12345678901` 虽然存在于 meta 文件中
- 但 `assetManager.loadAny({ uuid: ... })` 的 API 语法在 Cocos Creator 3.8 中可能不支持直接按 UUID 查找
- 在模拟环境中此调用返回错误: `Asset not found: d2b3c4e5-f6a7-8901-bcde-f12345678901`

### 假设 C：数据查询返回空（与 UI 显示矛盾）

- UI 显示 "1件" 说明 `_getFilteredEntries().length === 1`
- 但如果 Presenter/Inventory 在 `_getOrCreateItem()` 执行时返回了不同的数据...
- 这不太可能，因为数据在同一帧内调用

---

## 无法确认的项目（需真实运行时）

| 项目 | 状态 |
|------|------|
| `itemTemplate` 实际运行时值 | ❓ 模拟中非 null；真实运行时未知 |
| `instantiate` 是否执行成功 | ❓ 模拟中成功；真实运行时未知 |
| `getComponent` 是否返回组件 | ❓ 模拟中成功；真实运行时未知 |
| `addChild` 是否执行 | ❓ 模拟中成功；真实运行时未知 |
| `childCount` 实际值 | ❓ 模拟中=2；真实运行时预期=1 |
| `Maximum call stack size exceeded` 调用栈 | ❓ 模拟环境未触发 |
| `EquipmentItemView.onLoad` 是否触发 | ❓ 模拟中触发；真实运行时待确认 |
| `EquipmentItemView.setData` 是否调用 | ❓ 模拟中调用；真实运行时待确认 |

---

## 当前结论

### 基于证据的分析

**静态证据**（prefab/scene 配置）:
- itemTemplate 绑定 ✅
- UUID 解析链完整 ✅
- contentNode 绑定 ✅
- 节点 `_active: false` ⚠️

**动态证据**（模拟测试）:
- 当 itemTemplate 非 null 时: 所有步骤成功 → childCount > 0
- 当 itemTemplate 为 null 时: async 加载失败 → childCount = 0

### 最可能根因

**如果运行时 itemTemplate = null**: 根因是 Cocos Creator 3.8 在 inactive 节点上未执行属性反序列化，导致 `@property itemTemplate` 保持为 null。

**如果运行时 itemTemplate ≠ null 但 contentNode 仍为空**: 则根因在其他位置，需要通过真实运行时日志定位。

---

## 建议：Phase10-Step11AF 方向

由于无法获得真实运行时日志（Cocos Creator 编辑器无法从 CLI 启动预览），建议：

### 方案 1：手动收集（推荐）

1. 在 Cocos Creator 中打开 Phase8Main 场景
2. 点击 Preview 按钮
3. 打开浏览器 DevTools → Console
4. 进入 EquipmentBagPanel → 武器分类
5. 复制所有 `[Step11AD]` 日志
6. 粘贴到回复中

### 方案 2：添加诊断日志

在 `_ensureInit()` 开始处添加：
```typescript
console.error('[Step11AF] _ensureInit: itemTemplate=', this.itemTemplate);
console.error('[Step11AF] _ensureInit: contentNode=', this.contentNode);
console.error('[Step11AF] _ensureInit: node.active=', this.node.active);
console.error('[Step11AF] _ensureInit: _initialized=', this._initialized);
```

这将在 `console.error` 级别输出（红色），更容易在大量日志中定位。

### 方案 3：直接热修复（需确认根因后）

如果在 `_ensureItemTemplateLoaded` 中确认 `itemTemplate === null`，可能的修复方案：
- 在 `_recoverBindings` 中追加 itemTemplate 的恢复逻辑
- 或使用正确的 Cocos Creator API 加载 EquipmentItemView 预制体

---

## 验收状态

| 验收标准 | 状态 |
|----------|------|
| 获得真实运行时日志 | ⚠️ 模拟环境已完成；真实运行时待收集 |
| 获得真实调用栈 | ⚠️ 模拟环境未发现栈溢出 |
| 获得真实 childCount | ⚠️ 模拟环境 childCount=2 |
| 获得真实 itemPrefab 状态 | ⚠️ 模拟环境 itemPrefab=VALID |

**裁决**: `Phase10-Step11AE FAIL` — 无法从真实 Cocos Creator 运行时获取日志。

**阻塞原因**: Cocos Creator 编辑器无法从 CLI 启动（启动后立即退出，exit code 0）。无 Cocos Creator 预览服务器运行（所有已知端口均已关闭）。Edge 浏览器未开放 CDP 调试端口（9222 等端口不可达）。

**下一步**: 需要开发者手动运行场景并提供控制台输出，或同意在 `_ensureInit` 中添加 `console.error` 级诊断日志后进行下一轮测试。
