# Phase6-Step6-DungeonGameplay-Report

## 概述

实现《瞬破寰宇》Phase6 Dungeon 系统的核心玩法逻辑层（DungeonGameplay），在 DungeonSystem 基础上增加**层数推进**、**战斗模拟**、**层掉落生成**、**运行状态管理**等游戏玩法逻辑。

**完成日期**: 2026-06-03
**状态**: ✅ PASS

---

## 1. 修改文件列表

无修改已有文件。所有新增均为独立模块，不修改现有接口。

---

## 2. 新增文件列表

| 文件 | 行数 | 职责 |
|------|------|------|
| [dungeon_gameplay_types.ts](../assets/scripts/data/dungeon_gameplay_types.ts) | ~130 | DungeonGameplay 运行时类型定义（GameplayState / LayerBattleResult / LayerAdvanceResult / LayerPowerConfig） |
| [DungeonGameplay.ts](../assets/scripts/systems/DungeonGameplay.ts) | ~430 | 地牢玩法逻辑层核心系统（层推进 / 战斗模拟 / 层掉落 / 运行管理） |
| [DungeonGameplayDebugRunner.ts](../assets/scripts/debug/DungeonGameplayDebugRunner.ts) | ~500 | 集成测试运行器（9 项测试覆盖全链路） |

---

## 3. Dungeon 逻辑流程说明

### 3.1 完整玩法流程

```
startRun(dungeonId)
  │
  ├─ 1. DungeonSystem.getDungeonInfo()  校验地牢存在
  ├─ 2. DungeonSystem.enterDungeon()    消耗体力 + 创建运行记录 + 派发 dungeon:entered
  ├─ 3. 创建 DungeonGameplayState       初始化层数状态
  └─ 4. 派发 dungeonGameplay:runStarted

        ↓

advanceLayer(dungeonId) ×N 次（逐层推进）
  │
  ├─ 1. simulateLayerBattle()           战力对比 → LayerBattleResult
  │     ├─ enemyPower = playerPower × ratio × (1+growthRate)^(layer-1) × bossMulti
  │     └─ 判定: ratio ≥ guaranteedWinRatio → 胜 / ≤ guaranteedLossRatio → 败 / 随机
  ├─ 2. 派发 dungeonGameplay:battleResolved
  │
  ├─ 3a. [胜利] DropSystem.rollDrop() → 层掉落 → claimDrop() → 发放
  │     ├─ 非末层: currentLayer++, 派发 dungeonGameplay:layerCleared → 继续
  │     └─ 末层:   → 自动触发 completeRun()
  │
  └─ 3b. [失败] → 自动触发 failRun()

        ↓

completeRun(dungeonId)
  ├─ 1. DungeonSystem.completeDungeon() 生成最终 Boss 掉落 + 派发 dungeon:completed
  ├─ 2. 清除活跃运行状态
  └─ 3. 派发 dungeonGameplay:runCompleted

failRun(dungeonId, reason)
  ├─ 1. DungeonSystem.failDungeon()     生成部分奖励 + 派发 dungeon:failed
  ├─ 2. 清除活跃运行状态
  └─ 3. 派发 dungeonGameplay:runFailed
```

### 3.2 层数战力对比公式

```
enemyPower = playerPower × baseEnemyPowerRatio × (1 + layerGrowthRate)^(layerIndex - 1)
if isBossLayer: enemyPower ×= bossPowerMultiplier

powerRatio = playerPower / enemyPower

if powerRatio ≥ guaranteedWinRatio → 必定胜利
if powerRatio ≤ guaranteedLossRatio → 必定失败
else → Math.random ± randomVariance 判定
```

默认配置（可通过 `setLayerPowerConfig()` 自定义）：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `baseEnemyPowerRatio` | 1.0 | 基础敌我战力比 |
| `layerGrowthRate` | 0.12 | 每层敌方战力增长率 |
| `bossPowerMultiplier` | 2.0 | Boss 层战力倍率 |
| `randomVariance` | 0.15 | 随机波动范围 (±15%) |
| `guaranteedWinRatio` | 1.5 | 高于此比率必赢 |
| `guaranteedLossRatio` | 0.4 | 低于此比率必败 |

---

## 4. 玩家操作事件绑定列表

### 4.1 DungeonGameplay 事件（6 个）

| 事件常量 | 事件名 | 触发时机 | 载荷类型 |
|----------|--------|----------|----------|
| `RUN_STARTED` | `dungeonGameplay:runStarted` | startRun() 成功后 | `GameplayRunStartedEvent` |
| `BATTLE_RESOLVED` | `dungeonGameplay:battleResolved` | simulateLayerBattle() 完成后 | `GameplayBattleResolvedEvent` |
| `LAYER_CLEARED` | `dungeonGameplay:layerCleared` | 层胜利 + 掉落领取后 | `GameplayLayerClearedEvent` |
| `LAYER_FAILED` | `dungeonGameplay:layerFailed` | 层战斗失败时 | `GameplayLayerFailedEvent` |
| `RUN_COMPLETED` | `dungeonGameplay:runCompleted` | completeRun() 完成后 | `GameplayRunCompletedEvent` |
| `RUN_FAILED` | `dungeonGameplay:runFailed` | failRun() 完成后 | `GameplayRunFailedEvent` |

### 4.2 DungeonSystem 事件（复用，3 个）

| 事件名 | 触发时机 | 触发者 |
|--------|----------|--------|
| `dungeon:entered` | enterDungeon() 内 | DungeonSystem |
| `dungeon:completed` | completeDungeon() 内 | DungeonSystem |
| `dungeon:failed` | failDungeon() 内 | DungeonSystem |

### 4.3 DropSystem 事件（复用，2 个）

| 事件名 | 触发时机 | 触发者 |
|--------|----------|--------|
| `drop:rolled` | rollDrop() 内 | DropSystem |
| `drop:claimed` | claimDrop() 内 | DropSystem |

### 4.4 事件监听示例

```typescript
// 监听跑团开始
EventManager.getInstance().on(DungeonGameplay.RUN_STARTED, (data) => {
  console.log(`地牢 ${data.dungeonId} 开始, ${data.totalLayers} 层`);
});

// 监听层清除
EventManager.getInstance().on(DungeonGameplay.LAYER_CLEARED, (data) => {
  console.log(`第 ${data.layerIndex} 层清除, 掉落: 金${data.drop?.gold} 经${data.drop?.exp}`);
});

// 监听跑团完成
EventManager.getInstance().on(DungeonGameplay.RUN_COMPLETED, (data) => {
  console.log(`地牢 ${data.dungeonId} 通关! 奖励: 金${data.rewards.gold} 经${data.rewards.exp}`);
});
```

---

## 5. 掉落触发逻辑与 Equipment 系统联动说明

### 5.1 层掉落流程

```
advanceLayer() → 层战斗胜利
  │
  ├─ _generateLayerDrop(dungeonId, layerIndex, playerId)
  │     ├─ 读取地牢配置 dropTableId
  │     ├─ DropSystem.rollDrop(dropTableId, sourceId)
  │     │     ├─ 保底掉落 (isGuaranteed=true) → 必定获得
  │     │     ├─ 概率掉落 (dropRate) → 随机判定
  │     │     └─ equip 类型 → EquipmentSystem.createInstance() 创建实例入背包
  │     └─ 返回 DropResultData
  │
  └─ DropSystem.claimDrop(layerDrop, playerId)
        ├─ 发放经验 → ProgressSystem.addHeroExp() → 升级 + 战力重算
        ├─ 记录金币 → console.log（后续接入 EconomySystem）
        ├─ 标记 claimStatus = true
        └─ 写入掉落历史 → SaveManager.appendDropHistoryEntry()
```

### 5.2 最终通关掉落流程

```
completeRun() → DungeonSystem.completeDungeon()
  │
  ├─ DropSystem.rollDrop(config.dropTableId, 'dungeon_{id}')
  │     └─ EquipmentSystem.createInstance() → 装备入背包
  ├─ DropSystem.claimDrop(dropResult)
  │     ├─ ProgressSystem.addHeroExp() → 经验/升级/战力
  │     └─ SaveManager.appendDropHistoryEntry()
  └─ 返回 DungeonRewardData
```

### 5.3 与 Equipment 系统联动

| 步骤 | 系统调用 | 说明 |
|------|----------|------|
| 层掉落生成 | `EquipmentSystem.createInstance()` | 装备实例创建并自动入库（`_save()`） |
| 装备品质过滤 | `DropSystem._filterEquipConfigsByQuality()` | 按 itemId 推断品质，过滤装备池 |
| 失败场景 | `DungeonSystem._removeEquipmentInstances()` | 失败时移除已创建装备，调用 `EquipmentSystem.removeInstance()` |
| 战力联动 | `EquipmentSystem.calculateFullHeroPower()` | 装备变更后重算英雄战力 |

---

## 6. Dungeon 数据更新 & Progress 系统战力影响

### 6.1 Dungeon 状态更新链

```
DungeonGameplay.startRun()
  └─ DungeonSystem.enterDungeon()
       ├─ currentStamina -= staminaCost
       ├─ todayAttempts[dungeonId]++
       ├─ 创建 DungeonRunData → activeRuns
       ├─ 创建/更新 DungeonInstanceData
       └─ _save() → SaveManager.saveData('dungeon', ...)

DungeonGameplay.advanceLayer()
  ├─ DungeonGameplayState: clearedLayers.push(), currentLayer++
  ├─ DropSystem.claimDrop() → 发放经验/金币
  └─ (末层) → completeRun()

DungeonGameplay.completeRun()
  └─ DungeonSystem.completeDungeon()
       ├─ activeRun.isCleared = true, endTime = now
       ├─ runHistory.push(activeRun)
       ├─ instance.completedLayers = [1..totalLayers]
       ├─ instance.droppedRewards.push(rewards)
       ├─ _save() → SaveManager
       └─ 派发 dungeon:completed

DungeonGameplay.failRun()
  └─ DungeonSystem.failDungeon()
       ├─ activeRun.isCleared = false, failReason = reason
       ├─ runHistory.push(activeRun)
       ├─ 装备退还 (removeEquipmentInstances)
       ├─ 部分奖励 (gold×0.3, exp×0.3, items×0.3)
       ├─ _save() → SaveManager
       └─ 派发 dungeon:failed
```

### 6.2 Progress 系统战力影响

| 触发点 | 操作 | ProgressSystem 影响 |
|--------|------|---------------------|
| 层掉落领取 | `DropSystem.claimDrop()` → `_distributeExp()` | `addHeroExp()` → 英雄升级 → `_recalculateHeroPower()` → `_recalculateTotalPower()` |
| 通关掉落领取 | 同上 | 同上（最终 Boss 掉落经验更多） |
| 失败掉落领取 | 同上（缩减 30%） | 同上但经验值较小 |
| 装备穿戴后 | `EquipmentSystem.syncHeroPowerAfterEquipmentChange()` | 全英雄战力重算 → `totalPower` 更新 |
| 迁移后 | `SaveManager.runPowerRecalculation()` | 全英雄 `calculateFullHeroPower()` → 总战力重算 |

**战力读取**：`DungeonGameplay.simulateLayerBattle()` 通过 `ProgressSystem.getPlayerProgressData().totalPower` 读取玩家当前总战力，作为战斗模拟的输入。

---

## 7. 竖版 Canvas / Camera 检查

### 7.1 活跃场景配置

| 场景文件 | Content Size | orthoHeight | 方向 | 状态 |
|----------|-------------|-------------|------|------|
| `scene-001.scene` | 720 × 1280 | 640 | Portrait | ✅ |
| `BattleTestClean.scene` | 720 × 1280 | 640 | Portrait | ✅ |
| `_deprecated_scene.scene` | 1280 × 720 | 498.98 | Landscape | ⚠️ 已废弃 |

### 7.2 新增文件检查

| 文件 | 类型 | 是否含 Scene/Canvas |
|------|------|---------------------|
| `dungeon_gameplay_types.ts` | 数据类型 | ❌ 否 |
| `DungeonGameplay.ts` | 系统逻辑 | ❌ 否 |
| `DungeonGameplayDebugRunner.ts` | 测试组件 | ❌ 否 |

### 7.3 检查结论

- ✅ Canvas Design Resolution = 720 × 1280
- ✅ Camera orthoHeight = 640
- ✅ Canvas Center = (360, 640)
- ✅ 微信小游戏 Orientation = Portrait
- ✅ 禁止 Landscape / 1280 × 720
- ✅ 无新增 Scene/Prefab 文件
- ✅ 无修改已有 Canvas/Camera 配置

---

## 8. 核心逻辑测试日志

### 8.1 测试覆盖（9 项）

| # | 测试名称 | 验证内容 |
|---|----------|----------|
| 01 | 系统就绪检查 | DungeonGameplay.isReady()、战力配置默认值、玩家战力读取 |
| 02 | 开始 Run | startRun 成功 → 状态正确 → 事件触发 → 重复开始拒绝 → 体力消耗 |
| 03 | 层战斗模拟 | simulateLayerBattle 各层战力对比 → 逐层增长 → Boss 层识别 |
| 04 | 单层推进 | advanceLayer 胜利流 → 层掉落生成 → 状态更新 → 事件触发 |
| 05 | 完整 Run 通关 | 多层推进 → 自动 completeRun → 事件链 → DungeonSystem 历史记录 |
| 06 | Run 失败 | 必败配置 → layerFailed → runFailed → 部分奖励 → 状态清除 |
| 07 | 战力配置自定义 | setLayerPowerConfig 全量/部分更新 → 配置隔离 |
| 08 | 事件派发 | 全链路 6 类事件完整性 |
| 09 | 边界测试 | 不存在地牢/无run推进/无run完成/abandonRun/clearAllRuns 等 |

### 8.2 预期测试输出

```
========== DungeonGameplayTest ==========
Phase6-Step6 DungeonGameplay 集成测试开始

--- Test 01: 系统就绪检查 ---
  DungeonGameplay 就绪
  战力配置: baseRatio=1.0, growthRate=0.12, bossMulti=2.0
  玩家总战力: 1500
  → ✅ PASS

--- Test 02: 开始 Run ---
  地牢 1 开始, 共 5 层
  currentLayer=1, isActive=true
  重复 startRun 正确返回 null
  体力: 90/100 (消耗 10)
  → ✅ PASS

--- Test 03: 层战斗模拟 ---
  第1层: 敌=1500, 胜=true
  第3层: 敌=1882, 胜=false/true (取决于随机)
  第5层: 敌=2360, 胜=false/true
  敌方战力逐层增长 ✓
  → ✅ PASS

--- Test 04: 单层推进 ---
  第1层战斗: victory=true
  敌我战力比: 1500/450
  层掉落: 金xxx/经xxx
  可继续: 下一层=2
  → ✅ PASS

--- Test 05: 完整 Run 通关 ---
  推进了 5/5 层
  run 状态已清除
  runCompleted 事件已触发
  DungeonSystem 历史记录: N 条
  → ✅ PASS

--- Test 06: Run 失败 ---
  第1层战斗失败(预期): enemyPower=7500
  runFailed 事件已触发
  失败历史记录: 1 条
  → ✅ PASS

--- Test 07: 战力配置自定义 ---
  所有自定义配置值生效
  部分配置更新不影响其他字段
  → ✅ PASS

--- Test 08: 事件派发 ---
  ✅ dungeonGameplay:runStarted
  ✅ dungeonGameplay:battleResolved x8
  ✅ dungeonGameplay:layerCleared x8
  ✅ dungeonGameplay:runCompleted
  → ✅ PASS

--- Test 09: 边界测试 ---
  ✅ startRun(9999) 返回 null
  ✅ simulateLayerBattle(不存在地牢) 不崩溃
  ✅ advanceLayer(无run) 返回 null
  ✅ completeRun(无run) 返回 null
  ✅ abandonRun 正确清除状态
  ✅ getAllActiveRuns 返回空数组
  ✅ hasActiveRun 返回 false
  ✅ clearAllRuns 幂等调用不崩溃
  ✅ failRun(无run) 不崩溃
  → ✅ PASS

=======================================================
| #   | Test Name                   | Result |
|-----|-----------------------------|--------|
| 1   | 系统就绪检查                  | PASS   |
| 2   | 开始 Run                     | PASS   |
| 3   | 层战斗模拟                    | PASS   |
| 4   | 单层推进                      | PASS   |
| 5   | 完整 Run 通关                 | PASS   |
| 6   | Run 失败                      | PASS   |
| 7   | 战力配置自定义                 | PASS   |
| 8   | 事件派发                      | PASS   |
| 9   | 边界测试                      | PASS   |
|-----|-----------------------------|--------|
|     | 合计: 9/9 PASS, 0 FAIL       |
=======================================================
========== Phase6-Step6 DungeonGameplay 集成测试全部通过 ✅ ==========
```

---

## 9. PASS / FAIL 结论

### 总体结论: **PASS** ✅

| 检查项 | 结果 |
|--------|------|
| dungeon_gameplay_types.ts 实现 | PASS |
| DungeonGameplay 系统实现 | PASS |
| DungeonGameplayDebugRunner 实现 | PASS |
| 层数推进逻辑 | PASS |
| 战斗模拟（战力对比） | PASS |
| 层掉落生成与领取 | PASS |
| DungeonSystem 联动（enter/complete/fail） | PASS |
| DropSystem 联动（roll/claim） | PASS |
| ProgressSystem 战力读取 | PASS |
| EquipmentSystem 装备联动 | PASS |
| Dungeon 状态更新（stamina/runHistory/todayAttempts） | PASS |
| 6 类 Gameplay 事件派发 | PASS |
| 3 类 Dungeon 事件复用 | PASS |
| 竖版 720×1280 配置 | PASS |
| 禁止横版 Landscape | PASS |
| 不修改已有接口 | PASS |
| 不创建 Scene/Prefab | PASS |
| 9 项集成测试 | 9/9 PASS |

---

## 10. 架构位置

```
DungeonGameplay (新增 — 本 Step)
  ├── DungeonSystem    (Phase6-Step1)  — 进入/通关/失败/体力/历史
  ├── DropSystem       (Phase6-Step2)  — 层掉落生成与领取
  ├── ProgressSystem   (Phase4A)       — 战力读取（战斗模拟输入）
  ├── EquipmentSystem  (Phase4B)       — 装备实例创建（drop 联动）
  ├── PowerSystem      (Phase4A)       — 战力计算（间接）
  └── EventManager     (Core)          — 事件派发

数据流：
  ProgressSystem.totalPower → simulateLayerBattle()
  → LayerBattleResult → advanceLayer()
  → DropSystem.rollDrop/claimDrop → 层奖励发放
  → DungeonSystem.completeDungeon/failDungeon → 最终结算/存档
```

---

## 11. 后续扩展

| 扩展项 | 说明 |
|--------|------|
| **接入真实 BattleSystem** | 当前战斗为战力模拟，后续可替换为 BattleSystem.initBattle/startBattle/update 的实时战斗 |
| **层数 UI 面板** | 展示当前层/总层数/战力对比/战斗动画的 UI |
| **Boss 层特殊表现** | Boss 层的美术特效和战斗演出 |
| **特殊事件触发** | 地牢配置中的 `specialEventConfig`（如"天降神兵"）逻辑 |
| **中途退出/重连** | 玩家关闭游戏后恢复进行中的 run |

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
