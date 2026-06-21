# Phase10 Step11X7 — Real Click Chain Hard Trace Report

## 目标

从"武器 ——空——"点击行为反向追踪实际运行链，用 `[REAL_CLICK_CHAIN]` 日志确认每一跳。

---

## 1. 哪个文件实际处理了点击

按调用顺序，以下文件参与处理"武器空槽点击"：

| 顺序 | 文件 | 函数 | 角色 |
|------|------|------|------|
| 1 | `EquipmentSlotItem.ts` | `_handleClick()` | **入口** — Button CLICK 事件直接回调 |
| 2 | `EquipmentPanel.ts` | `_handleSlotClick()` | **路由** — 判断 isEmpty → 调用 onOpenBag |
| 3 | `EquipmentMediator.ts` | lambda in `_connectPanels()` | **桥接** — setOpenBagCallback 中的箭头函数 |
| 4 | `EquipmentMediator.ts` | `_openBagPanel()` | **导航** — 取 heroId，调用 bagPanel.open() |
| 5 | `EquipmentBagPanel.ts` | `open()` | **终点** — 设置 title="选择装备 · 武器"，show() |
| 5b | `EquipmentUIPresenter.ts` | `getSlotName()` | **辅助** — 被 BagPanel.open 调用，解析 "Weapon" → "武器" |

---

## 2. 哪个函数实际被调用

完整调用栈（代码级确认）：

```
Button.CLICK event
  → EquipmentSlotItem._handleClick()              [EquipSlotItem:264]
    → this._onClick(slotId, isEmpty, vm)           // _onClick = EquipmentPanel._handleSlotClick bound
      → EquipmentPanel._handleSlotClick()          [EquipPanel:386]
        → this._onOpenBag(slotId)                  // isEmpty=true, _onOpenBag = Mediator lambda
          → (slotId) => this._openBagPanel(slotId) [Mediator:228] — lambda in _connectPanels
            → EquipmentMediator._openBagPanel()    [Mediator:282]
              → this.bagPanel.open(heroId, slotId)  [Mediator:334]
                → EquipmentBagPanel.open()          [BagPanel:151]
                  → this._presenter?.getSlotName()  // 构建 "选择装备 · 武器" title
                  → this.show()                     // 显示面板
```

---

## 3. 点击后完整调用顺序

```
REAL_CLICK_CHAIN trace order (expected at runtime):

1. [REAL_CLICK_CHAIN] EquipmentSlotItem _handleClick {slotId, isEmpty, ...}
2. [REAL_CLICK_CHAIN] EquipmentPanel _handleSlotClick {slotId, isEmpty, ...}
3. [REAL_CLICK_CHAIN] EquipmentPanel _handleSlotClick→onOpenBag {slotId}
4. [REAL_CLICK_CHAIN] EquipmentMediator openBagCallback λ {slotId}
5. [REAL_CLICK_CHAIN] EquipmentMediator _openBagPanel {slotId, hasBagPanel, heroId, ...}
6. [REAL_CLICK_CHAIN] EquipmentUIPresenter getSlotName {slotId:"Weapon", name:"武器"}
7. [REAL_CLICK_CHAIN] EquipmentBagPanel open {heroId, preselectedSlot:"Weapon", ...}
```

---

## 4. 是否经过 EquipmentMediator

**是。** 点击链路 100% 经过 EquipmentMediator。

具体路径：
- `EquipmentPanel._handleSlotClick` 调用 `this._onOpenBag(slotId)`
- `_onOpenBag` 在 `EquipmentMediator._connectPanels()` 中设置（第 228 行）
- 该 callback 是一个箭头函数 `(slotId) => { this._openBagPanel(slotId); }`
- `_openBagPanel()` 在 `EquipmentMediator` 类中（第 282 行）

---

## 5. 是否经过 EquipmentUIPresenter

**部分经过。** Presenter 不在点击链路的主路径上，但在以下环节被调用：

| 环节 | 函数 | 调用方 |
|------|------|--------|
| 构建标题 | `getSlotName('Weapon')` → `"武器"` | `BagPanel.open()` → `titleLabel.string = "选择装备 · 武器"` |
| 获取列表 | `getEquipmentList(filter)` | `BagPanel._refreshList()` |
| 获取英雄视图 | `getHeroEquipmentView(heroId)` | `EquipmentPanel._refreshAll()` |

**Presenter 不在主点击路由中**——点击路由（空槽→打开背包）的逻辑完全在 Panel 和 Mediator 之间完成。Presenter 只负责数据查询。

---

## 6. 是谁打开了"选择装备 - 武器"

**EquipmentBagPanel.open()** 的第 171 行：

```typescript
if (this._preselectedSlot) {
  const slotName = this._presenter?.getSlotName(this._preselectedSlot) ?? this._preselectedSlot;
  this.titleLabel.string = `选择装备 · ${slotName}`;
}
```

- `this._preselectedSlot` = `'Weapon'`（由 `_openBagPanel` 传入）
- `getSlotName('Weapon')` 查表返回 `'武器'`
- 所以 title 变成 `"选择装备 · 武器"`

**调用链：** EquipmentMediator._openBagPanel('Weapon') → bagPanel.open(heroId, 'Weapon') → 设置 title

---

## 7. 为什么之前 EquipmentMediator 没日志

经过代码审查，发现以下可能原因：

### 7a. 之前 Mediator 可能确实没有被实例化

如果场景中 Canvas 上没有挂载 EquipmentMediator 组件，整个链路的第 3 步（lambda）和第 4 步（_openBagPanel）就不会执行。但 EquipmentPanel._handleSlotClick 仍会执行——它只是调用 `this._onOpenBag(slotId)`，如果 `_onOpenBag` 为 null（因为 Mediator 不在所以从未调用 `setOpenBagCallback`），**点击会静默失败**。

### 7b. 如果 UI 确实弹出了"选择装备 - 武器"

那说明 BagPanel.open() 被调用了。有两种可能：
- **A**: 经过了 Mediator（`_onOpenBag` 被正确设置，Mediator 在场景中）
- **B**: 有其他代码路径直接调用了 BagPanel.open()（绕过 Mediator）

### 7c. 本次诊断方法

如果 Preview 后看到完整的 `[REAL_CLICK_CHAIN]` 序列 1→7，说明 **Mediator 确实在链路上，之前日志可能被过滤或位置不对**。

如果只看到 1→2 而不见 3→7，说明 **`_onOpenBag` callback 为 null，Mediator 未连接**，但 UI 仍然弹出了面板 → 说明有**另一条代码路径**在驱动 BagPanel。

---

## 8. 下一步最小修复方案

### 如果链路完整（1→7 全出现）

说明架构正确，之前 Mediator 日志缺失可能是：
- 日志被 Cocos Creator Console 过滤
- 之前的日志打点位置在 `_ensurePanelsLoaded` 等非执行路径上
- UUID 绑定问题导致 Mediator 组件未被正确实例化

**修复方案：** 无需修复链路。把之前的调试日志清理干净即可。

### 如果链路断裂（只有 1→2）

`_onOpenBag` 为 null，说明 EquipmentMediator._connectPanels() 未执行或未执行到 setOpenBagCallback 行。

**根因排查：**
1. 检查 `EquipmentMediator._connectPanels()` 是否被调用 — 添加 `[REAL_CLICK_CHAIN] EquipmentMediator _connectPanels` 日志
2. 检查 `_ensurePanelsLoaded()` 是否提前 return 导致后续 `_connectPanels()` 未执行
3. 检查 `this.equipmentPanel` 是否为 null（Inspector 绑定缺失）

**最小修复：**
```typescript
// 在 EquipmentMediator.start() 中，_ensurePanelsLoaded() 之后
// 确保 _connectPanels() 无条件执行（即使某些 Panel 为 null）
private _connectPanels(): void {
  console.error('[REAL_CLICK_CHAIN]', 'EquipmentMediator', '_connectPanels');
  if (this.equipmentPanel) {
    this.equipmentPanel.setPresenter(this._presenter!);
    this.equipmentPanel.setOpenBagCallback((slotId) => {
      this._openBagPanel(slotId);
    });
    this.equipmentPanel.setOpenDetailCallback((uniqueId) => {
      this._openDetailPanel(uniqueId);
    });
  } else {
    console.error('[REAL_CLICK_CHAIN] ⚠️ equipmentPanel is null, cannot connect');
  }
  // ... rest
}
```

---

## 最终判断标准

| 点击后日志 | 结论 |
|-----------|------|
| 1→7 全部出现 | **Mediator 在链路上**。之前日志缺失是位置/过滤问题 |
| 只出现 1→2，但 UI 弹出面板 | **存在替代路径**。需搜索是否有其他代码直接调用 `bagPanel.open()` |
| 只出现 1→2，UI 不弹出 | **_onOpenBag 为 null**。Mediator 未连接。修复 Inspector 绑定 |
| 连 1 都不出现 | **Button 事件未注册**。EquipmentSlotItem 的 clickButton 绑定失败 |

---

## 已添加的追踪点清单

| # | 文件 | 行 | 标签 |
|---|------|-----|------|
| 1 | `EquipmentSlotItem.ts` | `_handleClick` 第一行 | `[REAL_CLICK_CHAIN] EquipmentSlotItem _handleClick` |
| 2 | `EquipmentPanel.ts` | `_handleSlotClick` 第一行 | `[REAL_CLICK_CHAIN] EquipmentPanel _handleSlotClick` |
| 3 | `EquipmentPanel.ts` | `onOpenBag` 调用前 | `[REAL_CLICK_CHAIN] EquipmentPanel _handleSlotClick→onOpenBag` |
| 4 | `EquipmentMediator.ts` | `setOpenBagCallback` lambda | `[REAL_CLICK_CHAIN] EquipmentMediator openBagCallback λ` |
| 5 | `EquipmentMediator.ts` | `_openBagPanel` 第一行 | `[REAL_CLICK_CHAIN] EquipmentMediator _openBagPanel` |
| 6 | `EquipmentUIPresenter.ts` | `getSlotName` 第一行 | `[REAL_CLICK_CHAIN] EquipmentUIPresenter getSlotName` |
| 7 | `EquipmentBagPanel.ts` | `open` 第一行 | `[REAL_CLICK_CHAIN] EquipmentBagPanel open` |
| 8 | `EquipmentDetailPanel.ts` | `open` 第一行 | `[REAL_CLICK_CHAIN] EquipmentDetailPanel open` |

**Console 过滤关键字：** `REAL_CLICK_CHAIN`

---

## 验证方法

1. 打开 Cocos Creator，运行 Preview
2. 打开 Console 面板
3. 在 Console 过滤框中输入：`REAL_CLICK_CHAIN`
4. 点击"武器 ——空——"
5. 观察 Console 输出，核对上述序列 1→7
6. 截图保存
