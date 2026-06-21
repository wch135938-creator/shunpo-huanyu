# Phase10-Step11K — InactivePanel OnLoad Lifecycle Debug Report

**日期**: 2026-06-08  
**状态**: 修复完成，待 Runtime 验证  
**是否进入 Step11L**: 是 — 用户 Preview 验证后进入

---

## 唯一根因

**EquipmentBagPanel 和 EquipmentDetailPanel 的 `_bindEvents()` 放在 `onLoad()` 中，但 `onLoad()` 对默认 `active=false` 的 prefab 实例节点不执行。**

### 证据链

| 层次 | 检查项 | 结果 |
|------|-------|------|
| 源码 | `_bindEvents()` 存在 | ✅ |
| 编译 | temp chunks 含 `_bindEvents` | ✅ |
| 绑定 | Scene/Prefab UUID 正确 | ✅ |
| 缓存 | 已删除 library/temp 重建 | ✅ |
| Runtime | `[EquipmentBagPanel] _bindEvents 完成` 不出现 | ❌ |

**结论**: 只有 `onLoad()` 不执行能解释"代码正确、编译正确、绑定正确、缓存已清除，但日志从不出现"。

### Cocos Creator 3.8 的 onLoad 行为

根据 Cocos Creator 3.x 文档：
- `onLoad()` 在组件首次激活时调用
- 对于场景中的**直接子节点**，即使 `active=false`，`onLoad()` 仍会触发
- 但对于 **prefab 实例化**的节点，如果 `active=false`，`onLoad()` 的行为依赖实例化路径

在 `EquipmentMediator._loadPrefabPanel()` 中：
```typescript
const node = instantiate(asset as Prefab);
node.setParent(canvas);
```
如果 prefab 根节点保存为 `active=false`，`instantiate` + `setParent` 后的 `onLoad()` 触发时机可能与预期不一致，导致 `_bindEvents()` 从未执行。

---

## 修复方案：_ensureInit() — 一次性安全初始化

### 设计思路

将 `_recoverBindings()` + `_bindEvents()` + `_ensureVisualBlocks()` 从 `onLoad()` 移到 `open()` 中，使用 `_initialized` 标记保证只执行一次。

```
Before (Step11H):
  onLoad() → _recoverBindings() → _bindEvents() → _ensureVisualBlocks()
  └─ 如果 onLoad 不执行 → 所有按钮事件丢失

After (Step11K):
  onLoad() → 仅调试日志 + super.onLoad()
  open()  → _ensureInit() → _recoverBindings() → _bindEvents() → _ensureVisualBlocks()
  └─ _initialized 标记保证只执行一次
  └─ 即使 onLoad 不执行，open() 必定触发初始化
```

### 涉及文件

| 文件 | 改动 |
|------|------|
| `assets/scripts/ui/EquipmentBagPanel.ts` | +`_initialized`, +`_ensureInit()`, 修改 `onLoad()`/`open()` |
| `assets/scripts/ui/EquipmentDetailPanel.ts` | +`_initialized`, +`_ensureInit()`, 修改 `onLoad()`/`open()` |

### EquipmentBagPanel.ts 改动详情

```typescript
// 新增标记
private _initialized = false;

// onLoad 简化为调试日志
onLoad(): void {
    console.log('[EquipmentBagPanel] onLoad');
    super.onLoad();
}

// start 增加调试日志
start(): void {
    console.log('[EquipmentBagPanel] start — node.active=', this.node.active);
}

// open 增加 _ensureInit() 调用 + 调试日志
open(heroId: string, preselectedSlot?: EquipmentSlotId): void {
    console.log('[EquipmentBagPanel] open — heroId=', heroId, ...);
    this._ensureInit();  // ← Step11K 核心修复
    // ... 原有逻辑
}

// Step11K 核心：一次性安全初始化
private _ensureInit(): void {
    if (this._initialized) return;
    this._initialized = true;
    
    console.log('[EquipmentBagPanel] _ensureInit — 首次初始化开始');
    this._recoverBindings();
    console.log('[EquipmentBagPanel] _recoverBindings 完成');
    this._bindEvents();
    console.log('[EquipmentBagPanel] _bindEvents 完成 — 按钮事件已注册');
    
    try {
      this._ensureVisualBlocks();
      console.log('[EquipmentBagPanel] _ensureVisualBlocks 完成');
    } catch (e) {
      console.error('[EquipmentBagPanel] _ensureVisualBlocks 异常:', e);
    }
    this._ensureItemTemplateLoaded();
}
```

### EquipmentDetailPanel.ts 改动详情

同样的 `_ensureInit()` 模式，额外包含：
```typescript
if (this.confirmDialog) this.confirmDialog.active = false;
if (this.previewContainer) this.previewContainer.active = false;
```

---

## 调试日志覆盖（完整生命周期追踪）

| Panel | onLoad | start | open | _ensureInit | _bindEvents |
|-------|--------|-------|------|-------------|-------------|
| EquipmentBagPanel | ✅ | ✅ | ✅ | ✅ | ✅ |
| EquipmentDetailPanel | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## 验证清单

Preview 后必须确认以下 Console 输出：

### 场景加载时
```
[EquipmentBagPanel] onLoad
[EquipmentDetailPanel] onLoad
[EquipmentBagPanel] start — node.active= false
[EquipmentDetailPanel] start — node.active= false
```

### 打开装备面板 → 点击空槽位 → 打开背包面板时
```
[EquipmentBagPanel] open — heroId= ... preselectedSlot= ...
[EquipmentBagPanel] _ensureInit — 首次初始化开始
[EquipmentBagPanel] _recoverBindings 完成
[EquipmentBagPanel] _bindEvents 完成 — 按钮事件已注册
[EquipmentBagPanel] _ensureVisualBlocks 完成
```

### 点击装备物品 → 打开详情面板时
```
[EquipmentDetailPanel] open — uniqueId= ... heroId= ...
[EquipmentDetailPanel] _ensureInit — 首次初始化开始
[EquipmentDetailPanel] _recoverBindings 完成
[EquipmentDetailPanel] _bindEvents 完成 — 按钮事件已注册
[EquipmentDetailPanel] _ensureVisualBlocks 完成
```

### 交互验证
- [ ] BagPanel 关闭按钮 → 可点击关闭
- [ ] BagPanel 类型筛选按钮 → 可点击切换
- [ ] BagPanel 品质筛选按钮 → 可点击切换
- [ ] DetailPanel 关闭按钮 → 可点击关闭
- [ ] DetailPanel Equip/Unequip/Upgrade/Enhance/Decompose 按钮 → 可点击

---

## 若仍不生效的排查方向

如果 `_ensureInit` 日志出现但按钮仍无效：
→ `_recoverBindings()` 找不到子节点（`_findNode` 返回 null）

如果 `_ensureInit` 日志也不出现：
→ `open()` 未被调用 / Mediator 绑定的不是这个组件实例

如果 `_bindEvents` 日志出现但按钮无效：
→ Button 组件本身有问题 / 节点层级遮挡 / Widget 偏移导致点击区域错位

---

## 结论

**修复已就绪，等待用户 Preview 验证。**
