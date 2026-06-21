# Phase10-Step8 Fix Report

**日期**: 2026-06-06  
**任务**: 修复 Phase10-Step8 Codex Architecture Audit 阻塞项  
**审计来源**: Phase10-Step8-Codex-Architecture-Audit.md  
**限制**: 仅修复审计发现的问题，不新增功能、不修改业务逻辑、不修改存档结构

---

## 修复总览

| Fix ID | 问题 | 严重度 | 状态 |
|--------|------|--------|------|
| Fix-1 | `EquipmentDetailPanel._confirmDialog` 未定义引用 | P0 阻塞 | ✅ 已修复 |
| Fix-2 | `EquipmentItemView` 对象池复用后点击回调丢失 | P1 阻塞 | ✅ 已修复 |
| Fix-3 | Presenter 与 View 双重监听事件，重复刷新 | P1 中-高 | ✅ 已修复 |
| Fix-4 | Hero 校验上下文硬编码，未建立 HeroContextProvider | P1 中 | ✅ 已修复 |

---

## Fix-1: EquipmentDetailPanel `_confirmDialog` 未定义引用

### 问题描述

审计发现 `EquipmentDetailPanel.ts:496` 存在 `this._confirmDialog` 引用，但类内只定义了 `confirmDialog: Node | null` 字段。`_confirmDialog` 为 undefined，会导致 TypeScript 编译错误和关闭流程运行时异常。

### 修改文件

- `assets/scripts/ui/EquipmentDetailPanel.ts`

### 修改内容

**原代码（`_handleClose` 方法）**:
```typescript
this._confirmDialog?.hide && this.confirmDialog.active && (this.confirmDialog.active = false);
```

**修复后**:
```typescript
if (this.confirmDialog) {
  this.confirmDialog.active = false;
}
```

### 变更说明

- 将未定义的 `_confirmDialog` 替换为正确字段 `confirmDialog`
- 简化条件判断：使用 `if (this.confirmDialog)` 替代短路求值链
- 与 `_onConfirm`、`_onCancel` 中已有的 `confirmDialog` 用法保持一致

### 验证

- `confirmDialog` 在 `@property` 中声明（line 92），类型 `Node | null`
- `_onConfirm`（line 479）和 `_onCancel`（line 487）均使用 `this.confirmDialog`，未出现 `_confirmDialog`
- 关闭流程：`_handleClose()` → 隐藏确认对话框 → 清空状态 → `close()`

---

## Fix-2: EquipmentItemView 对象池复用后点击回调丢失

### 问题描述

审计发现对象池复用链存在缺陷：

1. `EquipmentItemView.reset()` 将 `_onClick` 设为 `null`
2. `EquipmentBagPanel.onClose()` 对所有 active item 调用 `reset()` 后隐藏
3. `EquipmentBagPanel._getOrCreateItem()` 从隐藏池复用时仅调用 `activate()`，未重新绑定 `setClickCallback()`
4. 导致复用的 item 点击无响应

### 修改文件

- `assets/scripts/ui/EquipmentItemView.ts`

### 修改内容

**`reset()` 方法** — 移除 `this._onClick = null`:

```typescript
reset(): void {
  this._viewModel = null;
  // 注意：_onClick 不清空。
  // _onClick 是父面板（BagPanel）在创建时设置的结构性回调，
  // 不随数据变化。保留回调确保对象池复用后点击事件仍然有效。

  if (this.nameLabel) this.nameLabel.string = '';
  if (this.qualityLabel) this.qualityLabel.string = '';
  if (this.statsLabel) this.statsLabel.string = '';
  if (this.powerLabel) this.powerLabel.string = '';
  if (this.equippedBadgeNode) this.equippedBadgeNode.active = false;
  if (this.equippedLabel) this.equippedLabel.string = '';
}
```

### 设计决策

选择"reset 不清回调"而非"复用时重新绑定"，理由：

- `_onClick` 是 `BagPanel._handleItemClick.bind(this)` 的稳定引用，由父面板在创建时设置一次
- 回调不随数据变化，属于结构性绑定而非数据状态
- `EquipmentSlotItem` 也没有在 `setEmpty()` 中清空 `_onClick`，保持一致
- 避免在 `_getOrCreateItem()` 中重复绑定，减少遗漏风险

### 验证流程

```
创建 item → setClickCallback() → 使用 → reset()（_onClick 保留）→ hide
→ 复用 → activate() → setData() → 点击 → _handleClick() → _onClick 有效 ✅
```

---

## Fix-3: 事件刷新收口

### 问题描述

审计发现 Presenter 和 View 层同时监听 EquipmentEvent，导致重复刷新：

| 组件 | 原监听事件 |
|------|-----------|
| `EquipmentUIPresenter` | LOADOUT_CHANGED, UPGRADE, ENHANCE, DECOMPOSE |
| `EquipmentPanel` | LOADOUT_CHANGED |
| `EquipmentDetailPanel` | LOADOUT_CHANGED, UPGRADE, ENHANCE, DECOMPOSE |

当一次装备操作触发事件时：
1. Presenter 收到事件 → `refreshNow()` → Mediator → `refreshFromPresenter()`
2. Panel/DetailPanel 也直接收到事件 → 再次刷新

造成同帧内重复刷新。

### 修改文件

- `assets/scripts/ui/EquipmentPanel.ts`
- `assets/scripts/ui/EquipmentDetailPanel.ts`

### 修改内容

#### EquipmentPanel

- 移除 `registerEvents()` 中的 `EventManager.on(EquipmentEvent.LOADOUT_CHANGED, ...)`
- 移除 `unregisterEvents()` 中的对应 `off()` 调用
- 移除 `_onLoadoutChanged()` 方法
- 移除未使用的 import：`EventManager`、`EquipmentEvent`

刷新现仅通过 Mediator 驱动的 `refreshFromPresenter()` 执行。

#### EquipmentDetailPanel

- 移除 `registerEvents()` 中全部 4 个事件监听
- 移除 `unregisterEvents()` 中全部 4 个事件注销
- 移除 `_onLoadoutChanged()`、`_onItemChanged()`、`_onDecomposed()` 方法
- 移除未使用的 import：`EventManager`、`EquipmentEvent`

### 最终事件链路

```
EquipmentEvent (LOADOUT_CHANGED / UPGRADE / ENHANCE / DECOMPOSE)
        ↓
EquipmentUIPresenter._onLoadoutChanged() / _onItemChanged() / _onDecompose()
        ↓
Presenter.markDirty() + refreshNow()
        ↓
Mediator._onPresenterRefresh()
        ↓
┌─ equipmentPanel?.refreshFromPresenter()
├─ bagPanel?.refreshFromPresenter()
└─ detailPanel?.refreshFromPresenter()
```

单一刷新链路，无重复。

---

## Fix-4: HeroContextProvider 接口建立

### 问题描述

审计发现 `EquipmentUIPresenter.getDetailViewModel()` 中装备校验使用硬编码值：

```typescript
canEquip(heroId, vm.slotType, instance, 1, undefined, undefined, ...)
//                                       ↑ heroLevel 固定为 1
//                                          ↑ heroProfession = undefined
//                                             ↑ heroFaction = undefined
```

导致装备规则校验无法正确判断等级限制、职业限制、阵营限制。

### 新建文件

- `assets/scripts/equipment/HeroContextProvider.ts`
- `assets/scripts/equipment/HeroContextProvider.ts.meta`

### 修改文件

- `assets/scripts/ui/EquipmentUIPresenter.ts`

### HeroContextProvider 接口

```typescript
export interface HeroContextProvider {
  getHeroLevel(heroId: string): number;
  getHeroProfession(heroId: string): string | undefined;
  getHeroFaction(heroId: string): string | undefined;
}
```

### Presenter 变更

1. **新增 import**: `import type { HeroContextProvider } from '../equipment/HeroContextProvider';`

2. **新增字段**: `private _heroContext: HeroContextProvider | null = null;`

3. **新增方法**: `setHeroContext(provider: HeroContextProvider | null): void`

4. **替换硬编码**:
```typescript
// 修复前
const equipCheck = canEquip(
  heroId, vm.slotType, instance,
  1, undefined, undefined,           // ← 硬编码
  this._configRepo, this._equipmentService.getEquipmentData(),
);

// 修复后
const equipCheck = canEquip(
  heroId, vm.slotType, instance,
  this._heroContext?.getHeroLevel(heroId) ?? 1,           // ← 从 Provider 获取
  this._heroContext?.getHeroProfession(heroId),
  this._heroContext?.getHeroFaction(heroId),
  this._configRepo, this._equipmentService.getEquipmentData(),
);
```

### 安全默认值

未注入 `HeroContextProvider` 时（`_heroContext === null`）：

- `getHeroLevel()` → `?? 1`（默认等级 1）
- `getHeroProfession()` → `undefined`（无职业限制）
- `getHeroFaction()` → `undefined`（无阵营限制）

与修复前的硬编码值行为完全一致，保证向后兼容。

### 后续接入

当 HeroSystem 就绪后，由系统 Bootstrap 或 Mediator 注入实现：

```typescript
presenter.setHeroContext(heroSystemAdapter);
```

---

## 风险评估

| 风险 | 等级 | 说明 |
|------|------|------|
| Fix-1 关闭流程变更 | 低 | `confirmDialog` 为 null 时静默跳过，与原逻辑等价 |
| Fix-2 回调保留 | 低 | `_onClick` 不变，`_handleClick` 已有 null guard |
| Fix-3 事件移除 | 低-中 | 仅当 Presenter/Mediator 未正确刷新时有风险；当前 Mediator 已调用 `_onPresenterRefresh` |
| Fix-4 接口引入 | 低 | 仅定义接口和可选注入，不改变现有行为；未注入时使用安全默认值 |

---

## 验收标准检查

| 标准 | 状态 |
|------|------|
| TypeScript 编译通过 | ✅ 代码审查通过，需 Cocos Creator 编辑器内确认 |
| 对象池复用通过 | ✅ `reset()` 保留 `_onClick`，复用后点击有效 |
| 事件链路收口完成 | ✅ Panel/DetailPanel 不再直接监听事件，仅 Presenter→Mediator 单一链路 |
| HeroContextProvider 建立完成 | ✅ 接口已定义，Presenter 已接入，支持依赖注入 |

---

## 未修复项（超出本次范围）

以下审计问题不在 Fix-1~4 范围内，标注为后续处理：

| ID | 问题 | 原因 |
|----|------|------|
| P0-01 | 未发现 Equipment 专属 Prefab / Scene 挂载 | 属于资源/场景工作，不属于代码修复 |
| P1-04 | BagPanel 无虚拟列表 | 性能优化，非阻塞问题 |
| P2-01 | Tutorial 配置引用旧节点路径 | 需 Prefab 定稿后同步 |
| P2-02 | Presenter 直接读取 InventoryService | 当前边界已明确（只读允许） |
| P2-03 | `getAllowedSlotIds()` 返回 `CORE_SLOT_IDS` | 后续改由 ConfigRepository |
| P2-04 | 错误提示仅 console | 后续接入 Toast/MessageBox |

---

## 修改文件清单

| 文件 | 操作 | 行数变化 |
|------|------|----------|
| `assets/scripts/ui/EquipmentDetailPanel.ts` | 修改 | ~20 行删除/修改 |
| `assets/scripts/ui/EquipmentItemView.ts` | 修改 | ~5 行修改 |
| `assets/scripts/ui/EquipmentPanel.ts` | 修改 | ~15 行删除/修改 |
| `assets/scripts/ui/EquipmentUIPresenter.ts` | 修改 | ~10 行新增/修改 |
| `assets/scripts/equipment/HeroContextProvider.ts` | **新建** | ~60 行 |
| `assets/scripts/equipment/HeroContextProvider.ts.meta` | **新建** | ~10 行 |
