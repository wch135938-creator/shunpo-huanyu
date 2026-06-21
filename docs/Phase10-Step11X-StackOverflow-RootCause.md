# Phase10-Step11X — StackOverflow Root Cause Analysis

## 状态：分析完成（静态） | 待运行时验证

---

## 一、问题摘要

| 项目 | 描述 |
|------|------|
| 现象 | `Maximum call stack size exceeded` 持续出现 |
| 触发时机 | 点击"武器 ——空——" → "选择装备 - 武器"弹出后 |
| 伴随现象 | 层级面板出现 `EquipmentDetailPanel-root`、`EquipmentDetailPanel-slotPickerCloseBtn` |
| 编辑器警告 | "层级面板过滤了重复的 UUID 节点" |
| 已确认正常 | EquipmentPanel / EquipmentMediator / SlotItem 全部 PASS |

---

## 二、完整调用链分析（静态追踪）

### 2.1 正常流程（已验证通过）

```
EquipmentPanel._handleSlotClick('Weapon', true)
  → _onOpenBag('Weapon')
  → EquipmentMediator._openBagPanel('Weapon')              [line 277]
    → bagPanel.open('0', 'Weapon')                          [line 323]
      → _ensureInit()                                       [line 149] 一次性
      → _refreshList()                                      [line 171]
      → this.show()                                         [line 173]
        → BasePanel.show()                                  [line 53]
          → node.active = true
          → _isShowing = true
```

此流程为单次触发，无递归。

### 2.2 关键发现：EquipmentDetailPanel 出现在不该出现的时间点

用户在**没有点击任何 BagPanel 中物品**的情况下，看到了：
- `EquipmentDetailPanel-root`
- `EquipmentDetailPanel-slotPickerCloseBtn`

这说明 EquipmentDetailPanel 节点被**意外创建**。正常触发路径是：

```
BagPanel 物品点击
  → _handleItemClick(viewModel)
  → _onItemSelected(uniqueId)
  → Mediator._openDetailPanel(uniqueId)
  → detailPanel.open(uniqueId, heroId)
```

但用户并未点击物品 → **EquipmentDetailPanel 必然通过其他路径被创建**。

---

## 三、根因定位

### 3.1 最高嫌疑 #1：`EquipmentMediator._loadPrefabPanel()` 重复实例化

**文件**：[EquipmentMediator.ts](../../assets/scripts/ui/EquipmentMediator.ts#L160-L208)

**代码**：
```typescript
// Line 115-143
private async _ensurePanelsLoaded(): Promise<void> {
    if (!this.detailPanel) {
        loads.push(
            this._loadPrefabPanel(
                EQUIPMENT_DETAIL_PANEL_UUID,   // ← 假 UUID!
                'EquipmentDetailPanel',
                'EquipmentDetailPanel'
            )
        );
    }
}
```

**问题分析**：

1. `EQUIPMENT_DETAIL_PANEL_UUID = 'a5e6f7b8-c9d0-1234-efab-345678901234'` — 这是**明显伪造的 UUID**
2. 如果编辑器绑定**未设置** `detailPanel`，会走运行时动态加载路径
3. 假 UUID 的 `assetManager.loadAny()` 行为不确定：
   - 可能静默失败（callback with error）→ `detailPanel` 保持 null
   - 可能意外匹配到其他资产 → 实例化出错误的 Prefab
   - **可能匹配到 EquipmentDetailPanel 的 prefab → 创建出重复节点**

4. `_loadPrefabPanel` 中将节点挂到 Canvas 下：
```typescript
const canvas = find('Canvas');
if (canvas) {
    node.setParent(canvas);          // ← 添加到 Canvas
}
```

**关键问题**：即使成功加载，实例化的节点会作为一个**独立的新节点**挂在 Canvas 下，与编辑器中可能已经存在的 EquipmentDetailPanel 节点产生**重复 UUID**（因为来自同一个 Prefab 资产）。

### 3.2 最高嫌疑 #2：Cocos Layout → Widget 循环依赖导致引擎层递归

**文件**：[EquipmentPanel.ts](../../assets/scripts/ui/EquipmentPanel.ts#L255-L258)

**代码**：
```typescript
// _renderSlots() 末尾
const layout = this.slotContainer.getComponent(Layout);
if (layout) {
    layout.updateLayout();   // ← 可能触发无限布局计算
}
```

**原理**：
- `slotContainer` 节点上存在 `Layout` 组件
- 子节点（SlotItem）上存在 `Widget` 组件（详见 Step11V 诊断输出）
- 如果 Widget 的对齐约束（如 `isAlignHorizontalCenter`）与 Layout 的 `resizeMode` 形成**相互依赖**（子节点大小影响父节点 → 父节点大小影响子节点对齐 → 子节点重新计算大小 → 循环），Cocos 引擎层的布局系统会进入无限循环

**证据链**：
- Step11V 的诊断代码打印了每个 child 的 Widget 配置（line 291-292）
- 说明开发者已经怀疑 Layout/Widget 交互问题
- "持续出现"与 Cocos 引擎每帧尝试重算布局的行为一致

### 3.3 中等嫌疑 #3：`_findNode()` 在异常节点树上的递归溢出

**文件**：多个 Panel 文件

**代码**（以 EquipmentDetailPanel 为例）：
```typescript
// Line 626-633
private _findNode(name: string, root: Node = this.node): Node | null {
    if (root.name === name) return root;
    for (const child of root.children) {
        const found = this._findNode(name, child);   // ← 无深度限制的递归
        if (found) return found;
    }
    return null;
}
```

**触发条件**：
- `_recoverBindings()` 对 **20+ 个属性**依次调用 `_findNode()`（line 599-623）
- 如果 EquipmentDetailPanel 节点被意外挂到 Canvas 下，`_findNode` 会搜索**整个 Canvas 子树**
- 如果 Canvas 层级很深（包含所有 UI 面板），单次搜索就可能消耗大量栈空间

**注意**：在没有循环引用的情况下，此函数不会无限递归。Cocos 的 `setParent` 有循环检测。但如果节点层级特别深（>1000 层），可能触发栈溢出。这在标准 UI 场景中通常不会发生。

### 3.4 低等嫌疑 #4：`_bindEvents` 重复注册

**文件**：[EquipmentDetailPanel.ts](../../assets/scripts/ui/EquipmentDetailPanel.ts#L561-L587)

**代码**：
```typescript
private _bindEvents(): void {
    if (this.equipBtn) {
        this.equipBtn.node.on(Button.EventType.CLICK, this._onEquipClick, this);
    }
    // ... (共 8 个按钮)
}
```

**分析**：
- `_bindEvents` 通过 `_ensureInit()` → `_initialized` 标记保证只执行一次
- 不会重复注册
- **但如果同一个 Prefab 被实例化两次**（每个实例有自己的 `_initialized = false`），每个实例都会注册自己的事件

**结论**：不是递归根因，但可能导致一次点击触发多次回调。

---

## 四、最可能根因（综合判断）

### 🎯 **根因 = EquipmentDetailPanel Prefab 被意外实例化，并添加到 Canvas**

**完整路径推测**：

```
EquipmentMediator.start()
  → _ensurePanelsLoaded()
    → detailPanel 编辑器绑定为 null
    → _loadPrefabPanel(假UUID, 'EquipmentDetailPanel', 'EquipmentDetailPanel')
      → assetManager.loadAny() 意外匹配到 EquipmentDetailPanel Prefab
      → instantiate(prefab) → 创建 EquipmentDetailPanel 节点
      → node.setParent(Canvas) → 添加到场景

  → _connectPanels()
  → _openActiveScenePanel()
    → equipmentPanel.open('0')
      → _refreshAll() → _renderSlots()
        → layout.updateLayout() ← 🔥 触发点

  新创建的 EquipmentDetailPanel 节点挂在 Canvas 下，
  其子节点（panelRoot, slotPickerContainer, slotPickerCloseBtn 等）
  参与 Layout 计算或 Widget 对齐，
  形成循环依赖 → 引擎 Layout 系统递归溢出
```

### 为什么"持续出现"？

Cocos Creator 的 Layout 系统在每帧渲染前检查是否需要重新布局。如果存在 Widget/Layout 循环依赖，**每帧都会触发**栈溢出。

### 为什么出现"重复 UUID"？

同一个 Prefab 被 `instantiate()` 了两次：
1. 编辑器中已有的 EquipmentDetailPanel 节点（来自场景文件）
2. 运行时 `_loadPrefabPanel()` 动态创建的节点

两者来自同一个 Prefab 源，Cocos 编辑器检测到重复 UUID 并发出警告。

---

## 五、修复方案

### 5.1 立即修复（最小改动）

#### A. 确保编辑器绑定正确设置

在 Cocos Creator 编辑器中，将 EquipmentMediator 组件的三个 `@property` 绑定：
- `equipmentPanel` → 场景中的 EquipmentPanel 节点
- `bagPanel` → 场景中的 EquipmentBagPanel 节点
- `detailPanel` → 场景中的 EquipmentDetailPanel 节点

**验证**：`_ensurePanelsLoaded()` 应该输出"所有面板均已通过编辑器绑定，无需动态加载"

#### B. 修复假 UUID（防止误匹配）

```typescript
// EquipmentMediator.ts — 将假 UUID 替换为空字符串或删除回退逻辑
const EQUIPMENT_DETAIL_PANEL_UUID = '';  // 空 UUID → loadAny 直接失败
```

或者在 `_loadPrefabPanel` 入口处加 UUID 有效性检查：

```typescript
private _loadPrefabPanel<T>(uuid: string, ...): Promise<T | null> {
    if (!uuid || uuid.length < 32) {
        console.error(`[EquipmentMediator] 无效 UUID: ${uuid}，跳过动态加载`);
        return Promise.resolve(null);
    }
    // ...
}
```

#### C. 添加 Layout 循环保护（防御性）

在 `_renderSlots()` 的 `layout.updateLayout()` 前后加 try-catch：

```typescript
const layout = this.slotContainer.getComponent(Layout);
if (layout) {
    try {
        layout.updateLayout();
    } catch (e) {
        console.error('[EquipmentPanel] Layout updateLayout 异常:', e);
        // 禁用 Layout 防止持续递归
        layout.enabled = false;
    }
}
```

### 5.2 中期改进

1. **将 `_findNode()` 改为迭代实现**，消除递归风险
2. **在 `_loadPrefabPanel` 成功后检查是否已存在同名节点**，防止重复
3. **为所有 Panel 添加 `onEnable()` 守卫**，防止重复初始化

---

## 六、验证步骤

### 6.1 优先验证

1. 在 `EquipmentMediator._loadPrefabPanel()` 入口加：
```typescript
console.error('[STACK_TRACE] _loadPrefabPanel called — uuid=', uuid, 'nodeName=', nodeName);
```

2. 在 `EquipmentPanel._ensureInit()` 和 `EquipmentDetailPanel._ensureInit()` 入口加：
```typescript
console.error('[STACK_TRACE] _ensureInit — constructor=', this.constructor.name);
```

3. 运行游戏，观察：
   - `_loadPrefabPanel` 是否被调用？
   - 被调用了几次？
   - 使用的是哪个 UUID？

### 6.2 次优先验证

1. 在编辑器中将 `EquipmentPanel.slotContainer` 的 Layout 组件临时禁用
2. 重新运行，观察是否还有栈溢出
3. 如果消失 → 确认是 Layout/Widget 循环依赖

### 6.3 Call Stack 定位

如果上述验证仍无法定位，在所有关键方法入口加入：

```typescript
console.error('[STACK_TRACE]', new Error().stack);
```

JavaScript 的 `Error.stack` 会打印完整调用栈，直接显示递归路径。

---

## 七、结论

| 项目 | 描述 |
|------|------|
| **最可能根因** | `EquipmentDetailPanel` Prefab 被意外实例化（通过 `_loadPrefabPanel` + 假 UUID 误匹配） |
| **触发点** | `EquipmentPanel._renderSlots()` → `layout.updateLayout()` |
| **循环机制** | 新节点参与 Layout/Widget 计算 → 引擎层循环依赖 → 每帧栈溢出 |
| **修复位置** | `EquipmentMediator.ts` line 137-142 — 假 UUID 回退逻辑 |
| **防御位置** | `EquipmentPanel.ts` line 255-258 — layout.updateLayout() 加 try-catch |
| **最小修复** | 确保编辑器绑定 + 将假 UUID 替换为空字符串 |

---

## 附录：已审查文件清单

| 文件 | 行数 | 递归风险 |
|------|------|----------|
| [EquipmentPanel.ts](../../assets/scripts/ui/EquipmentPanel.ts) | 565 | `_findNode` 递归（低危）、`layout.updateLayout()` （中危） |
| [EquipmentDetailPanel.ts](../../assets/scripts/ui/EquipmentDetailPanel.ts) | 668 | `_findNode` 递归（低危）、`_ensureInit` 多次调用（已防护） |
| [EquipmentBagPanel.ts](../../assets/scripts/ui/EquipmentBagPanel.ts) | 543 | `_findNode` 递归（低危）、`_ensureInit` 多次调用（已防护） |
| [EquipmentMediator.ts](../../assets/scripts/ui/EquipmentMediator.ts) | 401 | `_loadPrefabPanel` + 假 UUID（**高危**） |
| [BasePanel.ts](../../assets/scripts/core/BasePanel.ts) | 175 | show/hide/close 无递归路径 |
| [EquipmentUIPresenter.ts](../../assets/scripts/ui/EquipmentUIPresenter.ts) | 502 | 事件→刷新 单向流，无循环 |
| [EquipmentService.ts](../../assets/scripts/equipment/EquipmentService.ts) | 931 | 事件单向发射，无循环 |
| [EquipmentSlotItem.ts](../../assets/scripts/ui/EquipmentSlotItem.ts) | 299 | `_findNode` 递归（低危） |
| [EquipmentItemView.ts](../../assets/scripts/ui/EquipmentItemView.ts) | 235 | `_findNode` 递归（低危） |
| [Phase8UIManager.ts](../../assets/scripts/ui/Phase8UIManager.ts) | 360 | 与装备系统无关，无影响 |

---

> **生成时间**：2026-06-09
> **分析方式**：静态代码审计（5 个核心文件 + 5 个关联文件）
> **下一步**：运行时验证 → 确认假 UUID 是否被调用 → 确认 Layout 循环依赖
