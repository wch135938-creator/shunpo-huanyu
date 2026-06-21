# Phase7-Step3-DungeonEvent-Implementation-Report

## 执行日期

2026-06-03

## 执行范围

Phase7-Step3：Dungeon Event 系统实现，包含 EventPool / EventConfig / EventManager / EventResult / EventHistory / RewardSource 集成 / DungeonGraph 事件联动 / Validator 扩展 / SaveMigration。

---

## 一、文件清单

### 新增文件 (3 个)

| 文件 | 行数 | 职责 |
|------|------|------|
| `assets/scripts/data/event_types.ts` | ~160 | EventPool / EventConfig / EventResult / EventHistoryRecord / EventCondition 类型定义 |
| `assets/scripts/systems/DungeonEventManager.ts` | ~420 | 事件管理器：rollEvent 加权抽取 / resolveEvent 解析 / validateEvent 校验 / EventHistory 记录 / 图联动 API（triggerForkEvent / triggerBranchSelectedEvent / triggerFloorTransitionEvent） |
| `assets/scripts/debug/Phase7Step3DebugRunner.ts` | ~550 | DungeonEvent 集成测试：14 组共 **85 个断言**，覆盖所有系统 |

### 修改文件 (5 个)

| 文件 | 行数变化 | 修改内容 |
|------|---------|---------|
| `assets/scripts/data/roguelike_types.ts` | +25 | DomainEventType 新增 DUNGEON_EVENT_ROLLED / DUNGEON_EVENT_REWARD_GRANTED / DUNGEON_EVENT_HISTORY_RECORDED；NodeFork 新增 forkTriggerEvent；BranchPath 新增 branchSelectedEvent；FloorTransition 新增 floorTransitionEvent；DungeonRunState 新增 eventHistory |
| `assets/scripts/validation/ConfigValidator.ts` | +200 | 新增 validateEventPools() — 事件池 ID 唯一性 / eventPoolRefs 引用有效性 / 循环引用检测 / 嵌套深度检测；新增 validateEventConfigs() — category 合法性 / weight 合法性 / conditions 类型校验 / nextEventRefs 自引用检测 |
| `assets/scripts/validation/RuntimeValidator.ts` | +130 | 新增 validateEventResolution() — 事件解析结果完整性 / 领域事件 correlationId 校验 / RewardSource 交叉校验；新增 validateEventHistory() — runId / eventId / nodeId / layerId / correlationId 完整性 |
| `assets/scripts/save/SaveContainer.ts` | +1 | CURRENT_SAVE_VERSION: 2 → 3；版本历史记录新增 V3 说明 |
| `assets/scripts/save/SaveMigrationSystem.ts` | +45 | 新增 V2→V3 迁移步骤：为 activeRun 和 runHistory 中的每条记录添加 eventHistory 字段 |

---

## 二、新增类型

### 2.1 EventPool（事件池）

```typescript
interface EventPool {
  id: string;
  version: number;
  nameKey: string;
  eventPoolRefs: string[];  // 指向 EventConfig.id 或嵌套 EventPool.id
}
```

支持多事件池串联和嵌套池引用。

### 2.2 EventConfig（事件配置）

```typescript
interface EventConfig {
  id: string;
  version: number;
  nameKey: string;
  descriptionKey: string;
  category: 'reward' | 'battle' | 'shop' | 'blessing' | 'curse' | 'story' | 'boss' | 'special';
  weight: number;              // 抽取权重（≥ 0）
  rewardSourceRefs?: string[]; // 奖励来源引用
  nextEventRefs?: string[];    // 后续事件链
  tags?: string[];             // 标签（once_per_run 等）
  conditions?: EventCondition[]; // 触发条件
}
```

### 2.3 EventCondition（事件条件）

```typescript
interface EventCondition {
  type: 'minLevel' | 'maxLevel' | 'minPower' | 'hasHero' | 'hasItem'
       | 'dungeonClear' | 'previousEventResolved' | 'custom';
  params: Record<string, number | string>;
}
```

### 2.4 EventResult（事件解析结果）

```typescript
interface EventResult {
  eventId: string;
  rewards: RewardSource[];          // 统一通过 DropSystem 结算
  emittedEvents: DomainEvent[];     // 领域事件
  nextEventIds?: string[];          // 后续事件链
  completedAt: number;
}
```

### 2.5 EventHistoryRecord（事件历史记录）

```typescript
interface EventHistoryRecord {
  id: string;
  runId: string;
  eventId: string;
  nodeId: string;
  layerId: string;
  correlationId: string;           // 与同批次事件串联
  rewards: RewardGrant[];
  createdAt: number;
}
```

---

## 三、新增接口

### 3.1 DungeonEventManager

| 方法 | 职责 |
|------|------|
| `registerEventConfigs(configs)` | 注册事件配置到缓存 |
| `registerEventPools(pools)` | 注册事件池到缓存 |
| `rollEvent(poolRefs, resolvedEventIds, context)` | 加权随机抽取事件（过滤条件、去重） |
| `resolveEvent(eventConfig, context)` | 解析事件 → 生成 RewardSource → 发布领域事件 → 记录历史 |
| `validateEvent(eventConfig)` | 事件配置合法性校验 |
| `getEventHistory()` | 获取所有事件历史 |
| `getEventHistoryByRun(runId)` | 按 runId 查询历史 |
| `getEventHistoryByEvent(eventId)` | 按 eventId 查询历史 |
| `syncEventHistoryToRunState(runState)` | 将历史同步到 DungeonRunState |
| `restoreEventHistoryFromRunState(runState)` | 从 DungeonRunState 恢复历史 |
| `triggerForkEvent(eventId, context)` | 分叉事件触发 |
| `triggerBranchSelectedEvent(eventId, context)` | 分支选择事件触发 |
| `triggerFloorTransitionEvent(eventId, context)` | 楼层转换事件触发 |

### 3.2 事件流程

```
EventPool → rollEvent (加权随机 + 条件过滤 + once_per_run去重)
         → EventConfig
         → resolveEvent
            → RewardSource[] (统一走 DropSystem)
            → DomainEvents (DungeonEventRolled / Resolved / RewardGranted)
            → EventHistory (录制)
```

---

## 四、RewardSource 集成

所有事件奖励强制通过 RewardSource → DropSystem → RewardSettlement 链路：

```text
Event
  ↓
RewardSource (sourceType: 'dungeon_event')
  ↓ 包含 dropTableRefs / rewardPoolRefs
DropSystem
  ↓ 按权重、保底、限制规则结算
RewardSettlement
  ↓ 发放到玩家/英雄
RewardGrant[]
```

**禁止**事件直接发放奖励。所有奖励来源统一为 `sourceType: 'dungeon_event'`。

---

## 五、DungeonGraph 事件联动

### 5.1 NodeFork.forkTriggerEvent

```typescript
interface NodeFork {
  // ... existing fields
  forkTriggerEvent?: string;  // 分叉出现时触发的事件 ID
}
```

触发时机：`RoguelikeSystem.getNodeForks()` 返回 NodeFork 后，可调用 `DungeonEventManager.triggerForkEvent()`。

### 5.2 BranchPath.branchSelectedEvent

```typescript
interface BranchPath {
  // ... existing fields
  branchSelectedEvent?: string;  // 选择分支后触发的事件 ID
}
```

触发时机：`RoguelikeSystem.chooseBranch()` 返回 BranchPath 后，可调用 `DungeonEventManager.triggerBranchSelectedEvent()`。

### 5.3 FloorTransition.floorTransitionEvent

```typescript
interface FloorTransition {
  // ... existing fields
  floorTransitionEvent?: string;  // 楼层转换时触发的事件 ID
}
```

触发时机：`RoguelikeSystem.transitionFloor()` 返回 FloorTransition 后，可调用 `DungeonEventManager.triggerFloorTransitionEvent()`。

---

## 六、DomainEvent 联动

### 新增事件类型

| 事件常量 | 值 | 触发时机 |
|---------|-----|---------|
| `DUNGEON_EVENT_ROLLED` | `'DungeonEventRolled'` | rollEvent 从池中抽取事件时 |
| `DUNGEON_EVENT_REWARD_GRANTED` | `'DungeonEventRewardGranted'` | 事件奖励通过 RewardSource 产生时 |
| `DUNGEON_EVENT_HISTORY_RECORDED` | `'DungeonEventHistoryRecorded'` | 事件历史记录写入时 |

所有新增事件均携带 `correlationId`。

---

## 七、ConfigValidator 扩展

### validateEventPools()

- 事件池 ID 唯一性
- eventPoolRefs 引用有效性（交叉校验 EventConfig）
- 事件池循环引用检测（DFS 遍历）
- 嵌套深度检测（上限 5 层）
- version 合法性

### validateEventConfigs()

- 事件 ID 唯一性
- category 合法性（8 种预定义类型）
- weight 合法性（≥ 0）
- conditions 类型校验
- nextEventRefs 自引用检测

---

## 八、RuntimeValidator 扩展

### validateEventResolution()

- 事件 ID 非空
- 领域事件 correlationId 完整性
- RewardSource 交叉校验
- completedAt 有效性

### validateEventHistory()

- id / runId / eventId / nodeId / layerId / correlationId 非空
- createdAt 有效性（无未来时间戳）
- rewards 结构校验

---

## 九、SaveMigration 兼容

### V2→V3 迁移

| 步骤 | 内容 |
|------|------|
| 迁移条件 | saveVersion = 2 |
| 迁移内容 | 为 `roguelikeState.activeRun` 和 `roguelikeState.runHistory[].eventHistory` 添加空数组 |
| 兼容策略 | 旧存档无 eventHistory 字段时自动补充，不升级失败 |
| 兜底 | roguelikeState 不存在时自动创建 |

### 版本号变更

```
CURRENT_SAVE_VERSION: 2 → 3
```

---

## 十、DebugRunner 测试覆盖

### 测试组 (14 组, 85 断言)

| 测试组 | 断言数 | 覆盖范围 |
|--------|--------|---------|
| 1. EventPool | 5 | ID/version/eventPoolRefs/嵌套池 |
| 2. EventConfig | 7 | 字段/category/条件/事件链 |
| 3. rollEvent | 8 | 权重抽取/过滤/once_per_run/空池/null |
| 4. resolveEvent | 9 | 奖励生成/领域事件/无奖励/事件链 |
| 5. validateEvent | 4 | 合法/非法category/负权重/null |
| 6. EventHistory | 11 | 录制/查询/sync/恢复/runId/eventId |
| 7. ConfigValidator | 8 | 池校验/配置校验/循环引用/自引用 |
| 8. RuntimeValidator | 6 | 解析校验/历史校验/correlationId |
| 9. NodeFork事件 | 4 | undefined/有效/无效事件 |
| 10. BranchPath事件 | 3 | undefined/有效事件 |
| 11. FloorTransition事件 | 3 | undefined/有效事件 |
| 12. SaveMigration | 7 | V2→V3/版本号/activeRun/历史 |
| 13. 领域事件 | 5 | 3种新事件/correlationId |
| 14. RewardSource集成 | 5 | sourceType/dropTableRefs/禁止直发 |
| **合计** | **85** | |

---

## 十一、零破坏验证

### 接口兼容性

| 检查项 | 结果 |
|--------|------|
| Phase6 接口未修改 | ✅ 所有 Phase6 类型（DungeonSaveData 等）保持不变 |
| Phase7-Step1 接口未修改 | ✅ RoguelikeSaveData / RewardSource / DungeonRunState 核心字段不变；新增字段均为 optional |
| Phase7-Step2 接口未修改 | ✅ NodeFork / BranchPath / FloorTransition 核心字段不变；新增字段均为 optional |
| SaveContainer 向下兼容 | ✅ V0/V1/V2 存档均通过迁移自动升级到 V3 |
| 无 UI 引入 | ✅ 所有实现为纯逻辑层，无 Camera/Canvas/UI 组件 |

### 新增字段汇总（全为 optional）

- `NodeFork.forkTriggerEvent?: string`
- `BranchPath.branchSelectedEvent?: string`
- `FloorTransition.floorTransitionEvent?: string`
- `DungeonRunState.eventHistory?: EventHistoryRecord[]`

---

## 十二、目录结构

```
assets/scripts/
├── data/
│   ├── event_types.ts          ← 新增：事件类型定义
│   └── roguelike_types.ts      ← 修改：DomainEvent + NodeFork/BranchPath/FloorTransition/DungeonRunState
├── systems/
│   └── DungeonEventManager.ts  ← 新增：事件管理器
├── validation/
│   ├── ConfigValidator.ts      ← 修改：validateEventPools + validateEventConfigs
│   └── RuntimeValidator.ts     ← 修改：validateEventResolution + validateEventHistory
├── save/
│   ├── SaveContainer.ts        ← 修改：CURRENT_SAVE_VERSION → 3
│   └── SaveMigrationSystem.ts  ← 修改：V2→V3 迁移步骤
└── debug/
    └── Phase7Step3DebugRunner.ts ← 新增：85 断言集成测试
```
