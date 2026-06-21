# Phase10-Step11X2 — Runtime Stack Trace Report

## 日期

2026-06-09

## 状态

**等待用户运行 Preview 并提供控制台输出。**

---

## 一、已完成：诊断日志注入

已在 4 个核心文件中注入完整诊断日志。本阶段**仅增加日志**，未修改任何 Prefab、Layout、业务逻辑。

### 1.1 STACK_TRACE 入口标记（36 处）

| 文件 | 函数 | 标签 |
|------|------|------|
| EquipmentPanel | `open()` | `[STACK_TRACE] EquipmentPanel.open` |
| EquipmentPanel | `_refreshAll()` | `[STACK_TRACE] EquipmentPanel._refreshAll` |
| EquipmentPanel | `_renderSlots()` | `[STACK_TRACE] EquipmentPanel._renderSlots` |
| EquipmentPanel | `_handleSlotClick()` | `[STACK_TRACE] EquipmentPanel._handleSlotClick` |
| EquipmentPanel | `_handleSlotClick → _onOpenBag` | `[STACK_TRACE] EquipmentPanel._handleSlotClick → _onOpenBag callback` |
| EquipmentPanel | `_handleSlotClick → _onOpenDetail` | `[STACK_TRACE] EquipmentPanel._handleSlotClick → _onOpenDetail callback` |
| EquipmentBagPanel | `onLoad()` | `[STACK_TRACE] EquipmentBagPanel.onLoad` |
| EquipmentBagPanel | `start()` | `[STACK_TRACE] EquipmentBagPanel.start` |
| EquipmentBagPanel | `onEnable()` | `[STACK_TRACE] EquipmentBagPanel.onEnable` |
| EquipmentBagPanel | `open()` | `[STACK_TRACE] EquipmentBagPanel.open` |
| EquipmentBagPanel | `_ensureInit()` | `[STACK_TRACE] EquipmentBagPanel._ensureInit` |
| EquipmentBagPanel | `_refreshList()` | `[STACK_TRACE] EquipmentBagPanel._refreshList` |
| EquipmentBagPanel | `_handleItemClick()` | `[STACK_TRACE] EquipmentBagPanel._handleItemClick` |
| EquipmentDetailPanel | `onLoad()` | `[STACK_TRACE] EquipmentDetailPanel.onLoad` |
| EquipmentDetailPanel | `start()` | `[STACK_TRACE] EquipmentDetailPanel.start` |
| EquipmentDetailPanel | `onEnable()` | `[STACK_TRACE] EquipmentDetailPanel.onEnable` |
| EquipmentDetailPanel | `open()` | `[STACK_TRACE] EquipmentDetailPanel.open` |
| EquipmentDetailPanel | `_ensureInit()` | `[STACK_TRACE] EquipmentDetailPanel._ensureInit` |
| EquipmentDetailPanel | `refreshFromPresenter()` | `[STACK_TRACE] EquipmentDetailPanel.refreshFromPresenter` |
| EquipmentDetailPanel | `_render()` | `[STACK_TRACE] EquipmentDetailPanel._render` |
| EquipmentDetailPanel | `_onEquipClick()` | `[STACK_TRACE] EquipmentDetailPanel._onEquipClick` |
| EquipmentDetailPanel | `_onUnequipClick()` | `[STACK_TRACE] EquipmentDetailPanel._onUnequipClick` |
| EquipmentDetailPanel | `_handleClose()` | `[STACK_TRACE] EquipmentDetailPanel._handleClose` |
| EquipmentMediator | `onLoad()` | `[STACK_TRACE] EquipmentMediator.onLoad` |
| EquipmentMediator | `start()` | `[STACK_TRACE] EquipmentMediator.start` |
| EquipmentMediator | `_ensurePanelsLoaded()` | `[STACK_TRACE] EquipmentMediator._ensurePanelsLoaded` |
| EquipmentMediator | `_loadPrefabPanel()` | `[STACK_TRACE] EquipmentMediator._loadPrefabPanel` |
| EquipmentMediator | `_connectPanels()` | `[STACK_TRACE] EquipmentMediator._connectPanels` |
| EquipmentMediator | `_openBagPanel()` | `[STACK_TRACE] EquipmentMediator._openBagPanel` |
| EquipmentMediator | `_openDetailPanel()` | `[STACK_TRACE] EquipmentMediator._openDetailPanel` |
| EquipmentMediator | `_onPresenterRefresh()` | `[STACK_TRACE] EquipmentMediator._onPresenterRefresh` |
| BasePanel (继承) | `show()` | `[STACK_TRACE] BasePanel.show` |
| BasePanel (继承) | `hide()` | `[STACK_TRACE] BasePanel.hide` |
| BasePanel (继承) | `close()` | `[STACK_TRACE] BasePanel.close` |

### 1.2 完整调用栈 `[STACK_TRACE_STACK]`（7 处）

在高嫌疑函数入口打印 `new Error().stack`：

| 文件 | 位置 |
|------|------|
| EquipmentPanel | `_handleSlotClick` → `_onOpenBag` 回调调用前 |
| EquipmentPanel | `_handleSlotClick` → `_onOpenDetail` 回调调用前 |
| EquipmentBagPanel | `_handleItemClick` 入口 |
| EquipmentDetailPanel | `open()` 入口 |
| EquipmentMediator | `_loadPrefabPanel()` 入口 |
| EquipmentMediator | `_openBagPanel()` 入口 |
| EquipmentMediator | `_openDetailPanel()` 入口 |

### 1.3 Prefab 加载 `[LOAD_PREFAB]`（6 处）

| 文件 | 位置 |
|------|------|
| EquipmentPanel | `_ensureSlotItemPrefabLoaded` — 加载前 + 回调内 |
| EquipmentBagPanel | `_ensureItemTemplateLoaded` — 加载前 + 回调内 |
| EquipmentMediator | `_loadPrefabPanel` — 加载前 + 回调内 |

### 1.4 实例化 `[INSTANTIATE]`（6 处）

| 文件 | 位置 |
|------|------|
| EquipmentPanel | `_createSlotItem` — instantiate 前后 |
| EquipmentBagPanel | `_getOrCreateItem` — instantiate 前后 |
| EquipmentMediator | `_loadPrefabPanel` — instantiate 前后 |

### 1.5 事件绑定 `[BIND_EVENT]`（23 处）

| 文件 | 绑定按钮数 |
|------|-----------|
| EquipmentPanel | 1（closeButton） |
| EquipmentBagPanel | 11（typeAllBtn, typeWeaponBtn, typeArmorBtn, typeAccessoryBtn, qualityAllBtn, qualityCommonBtn, qualityRareBtn, qualityEpicBtn, qualityLegendaryBtn, closeButton + START/DONE） |
| EquipmentDetailPanel | 10（equipBtn, unequipBtn, upgradeBtn, enhanceBtn, decomposeBtn, confirmBtn, cancelBtn, closeButton + START/DONE） |

### 1.6 Layout 更新 `[LAYOUT]`（4 处）

| 文件 | 位置 |
|------|------|
| EquipmentPanel | `_renderSlots` — layout.updateLayout() 前后 |
| EquipmentBagPanel | `_refreshList` — layout.updateLayout() 前后 |

---

## 二、用户运行步骤

请在 Cocos Creator 中：

1. 打开 Preview
2. 打开装备界面
3. 点击 **武器 ——空——**
4. 观察控制台输出

### 关键观察模式

打开控制台后，按以下优先级搜索：

```
优先级 1: [STACK_TRACE_STACK] — 完整调用栈，直接定位递归链
优先级 2: [STACK_TRACE] — 函数调用顺序
优先级 3: [INSTANTIATE] + [LOAD_PREFAB] — 重复实例化/加载
优先级 4: [BIND_EVENT] — 重复事件绑定
优先级 5: [LAYOUT] — Layout 循环
```

---

## 三、预期诊断路径

### 如果根因是"重复实例化"：

症状：`[INSTANTIATE]` 同一个 prefab.name 出现超过预期次数

- EquipmentDetailPanel: 预期 1 次
- EquipmentBagPanel: 预期 1 次
- EquipmentPanel: 预期 1 次
- EquipmentSlotItem: 预期 3 次（3 个槽位）

### 如果根因是"动态加载失败→重复加载"：

症状：`[LOAD_PREFAB]` 同一个 UUID 出现多次

### 如果根因是"递归调用链"：

症状：`[STACK_TRACE_STACK]` 中出现相同的函数名反复嵌套

典型递归链模式：
```
EquipmentPanel.open → _refreshAll → _renderSlots → layout.updateLayout
→ Widget.align → Layout._doLayout → ... → EquipmentPanel.open (循环)
```

### 如果根因是"重复事件绑定"：

症状：`[BIND_EVENT]` 同一个 node.name 出现超过 2 次

### 如果根因是"Layout 死循环"：

症状：`[LAYOUT] BEFORE` 出现后，没有对应的 `[LAYOUT] AFTER`

---

## 四、待填充（用户提供控制台输出后）

### 完整调用链

> [待用户提供 STACK_TRACE_STACK 输出]

### 真实 Stack Trace

> [待用户提供]

### Prefab 加载次数

> [待用户提供 LOAD_PREFAB 计数统计]

### 实例化次数

> [待用户提供 INSTANTIATE 计数统计]

### 事件绑定次数

> [待用户提供 BIND_EVENT 计数统计]

### 最终根因

> [待分析]

### 根因定位

> **哪个函数 / 哪一行？**
>
> [待确定]

### 最小修复方案

> [待确定]

---

## 五、修改文件清单

| 文件 | 修改类型 |
|------|---------|
| `assets/scripts/ui/EquipmentPanel.ts` | 增加日志 |
| `assets/scripts/ui/EquipmentBagPanel.ts` | 增加日志 |
| `assets/scripts/ui/EquipmentDetailPanel.ts` | 增加日志 |
| `assets/scripts/ui/EquipmentMediator.ts` | 增加日志 |

所有修改均为增加 `console.error()` 诊断日志，**未修改任何业务逻辑、Prefab、Layout 或 UI 结构**。
