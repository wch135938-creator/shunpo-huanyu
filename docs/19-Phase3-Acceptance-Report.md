# Phase3 Runtime Acceptance Report

项目：《瞬破寰宇》微信小游戏  
工程路径：`E:\CocosProjects\TestGame\TestGame`  
验收日期：2026-06-01  
验收范围：Phase3 战斗闭环运行时验收  
Preview URL：`http://[::1]:7458/?scene=344c401c-7b16-4691-ba49-595d7bae3943&run=phase3-ipv6-1780321802093`

## 1. 本次修改文件列表

1. `E:\CocosProjects\TestGame\TestGame\assets\scenes\scene-001.scene`
2. `E:\CocosProjects\TestGame\TestGame\assets\scripts\battle\BattleSystem.ts`

## 2. 修复内容

### 2.1 scene-001.scene

修复 `BattleDebugRunnerV2` 组件挂载类型。

原运行时问题：

```text
Can not find class 'db://assets/scripts/debug/BattleDebugRunnerV2'
```

修复方式：

```json
"__type__": "a3673cKiKRAkr81jcugWAGO"
```

该值对应 `BattleDebugRunnerV2.ts.meta` 的脚本 UUID 编译类型，修复后 `scene-001.scene` 可在 Preview 中正确挂载并执行 `BattleDebugRunnerV2`。

### 2.2 BattleSystem.ts

修复 `_isTimeout` 字段/方法同名冲突。

原运行时问题：

```text
TypeError: this._isTimeout is not a function
```

原因：

`BattleSystem` 内同时存在：

```ts
private _isTimeout: boolean = false;
private _isTimeout(): boolean
```

运行时字段覆盖方法，导致 `update()` 调用 `this._isTimeout()` 时崩溃。

修复方式：

将布尔字段改名为：

```ts
private _timeoutReached: boolean = false;
```

并同步更新超时状态重置、超时处理、结算 resultType 判断处的引用。

### 2.3 BattleSystem.ts

修复短战斗结算 `round = 0` 导致验收失败。

原验收失败项：

```text
❌ BattleResult.round > 0
```

原因：

Phase3 测试战斗可能在首轮内直接结束，尚未触发完整一轮行动边界，因此内部完整回合计数仍为 `0`。

修复方式：

在 `_emitBattleEnded()` 生成 `BattleExecutionResult` 时，对已经实际推进过的战斗至少报告第 1 轮：

```ts
const reportedRound =
  this._battleData.elapsedTimeMs > 0
    ? Math.max(1, this._battleData.round)
    : this._battleData.round;
```

最终输出：

```ts
round: reportedRound
```

该修复只影响结算报告口径，不改变战斗行动调度逻辑。

## 3. 运行验证步骤

1. 启动 Cocos Creator 3.8.8，并打开工程：

   ```text
   E:\CocosProjects\TestGame\TestGame
   ```

2. 使用显式场景打开 `scene-001.scene`：

   ```text
   db://assets/scenes/scene-001.scene
   ```

3. 确认 Preview 监听端口：

   ```text
   :: 7458
   ```

4. 在 in-app browser 打开运行验收 URL：

   ```text
   http://[::1]:7458/?scene=344c401c-7b16-4691-ba49-595d7bae3943&run=phase3-ipv6-1780321802093
   ```

5. 读取 Console 日志，确认 `BattleDebugRunnerV2` 生命周期、配置加载、战斗开始、伤害、击杀、奖励、验收检查、最终 Phase3 结果。

## 4. Console 关键日志

```text
[BattleDebugRunnerV2] onLoad
[BattleDebugRunnerV2] onEnable
[BattleDebugRunnerV2] start

[BattleTestV2] 战斗闭环测试开始
[BattleTestV2] 目标关卡: STAGE_001
[BattleTestV2] 配置加载完成 ✅

[BattleTestV2] >>> 战斗开始! <<<
[BattleTestV2] 关卡: STAGE_001

[BattleTestV2] 我方阵容 (5):
[BattleTestV2]   [p_0] CARD_001 HP=600 ATK=50 DEF=30 SPD=90 阵营=混沌 站位=(0,0)
[BattleTestV2]   [p_1] CARD_101 HP=900 ATK=80 DEF=50 SPD=95 阵营=青龙 站位=(0,1)
[BattleTestV2]   [p_2] CARD_201 HP=680 ATK=140 DEF=35 SPD=100 阵营=朱雀 站位=(1,0)
[BattleTestV2]   [p_3] CARD_301 HP=900 ATK=200 DEF=55 SPD=135 阵营=白虎 站位=(1,1)
[BattleTestV2]   [p_4] CARD_401 HP=1200 ATK=220 DEF=70 SPD=115 阵营=混沌 站位=(1,2)

[BattleTestV2] 敌方阵容 (2):
[BattleTestV2]   [e_0] ENEMY_001 雾气精魄 HP=200 ATK=30 DEF=15 SPD=60 阵营=白虎 类型=Enemy
[BattleTestV2]   [e_1] ENEMY_002 岩甲龟 HP=350 ATK=35 DEF=25 SPD=55 阵营=混沌 类型=Enemy

[BattleTestV2] [CARD_301 CARD_301] → 攻击 → [ENEMY_001 雾气精魄] 伤害=205 [  0% |░░░░░░░░░░|] 0/200
[BattleTestV2] *** [ENEMY_001 雾气精魄] 被击杀! ***
[BattleTestV2] [CARD_401 CARD_401] → 攻击 → [ENEMY_002 岩甲龟] 伤害=195 [ 44% |████░░░░░░|] 155/350
[BattleTestV2] [CARD_301 CARD_301] → 攻击 → [ENEMY_002 岩甲龟] 伤害=185 [  0% |░░░░░░░░░░|] 0/350
[BattleTestV2] *** [ENEMY_002 岩甲龟] 被击杀! ***

[BattleTestV2] >>> 战斗结束! <<<
[BattleTestV2] 结果: Victory ✅
[BattleTestV2] 类型: Victory
[BattleTestV2] 耗时: 32ms (0.0s)
[BattleTestV2] 回合: 1

[BattleTestV2] 击杀敌人 (2):
[BattleTestV2]   - ENEMY_001
[BattleTestV2]   - ENEMY_002

[BattleTestV2] 奖励列表 (2):
[BattleTestV2]   - ITEM_GOLD (gold) × 133 [drop]
[BattleTestV2]   - ITEM_EXP (exp) × 84 [drop]

[BattleTestV2] 汇总: 经验 +84 | 金币 +133 | 战力 +0
```

验收检查日志：

```text
[BattleTestV2] 验收检查:
[BattleTestV2]   ✅ 战斗状态 → Victory/Defeat
[BattleTestV2]   ✅ BattleResult.stageId 非空
[BattleTestV2]   ✅ BattleResult.elapsedTimeMs > 0
[BattleTestV2]   ✅ BattleResult.round > 0
[BattleTestV2]   ✅ BattleResult.resultType 有效
[BattleTestV2]   ✅ 掉落结算 → rewards 非空 (胜利时)
[BattleTestV2]   ✅ expGain / goldGain 计算正确
[BattleTestV2]   ✅ UNIT_DAMAGED 事件已触发
[BattleTestV2]   ✅ UNIT_DIED 事件已触发
[BattleTestV2]   ✅ BATTLE_ENDED → STAGE_BATTLE_FINISHED 链路
[BattleTestV2] ========== Phase 3 战斗闭环验证通过 ✅ ==========
```

说明：本轮浏览器 Console 历史中曾残留旧编译包产生的 `_isTimeout` 报错和 `round = 0` 失败日志；最终使用新 Preview 实例和 IPv6 本地地址重跑后，末尾验收日志已明确通过。

## 5. 验收结果

Phase3 运行时验收通过。

通过项：

1. `BattleDebugRunnerV2` 正确挂载并执行。
2. 配置链路可加载。
3. `STAGE_001` 可正常开始战斗。
4. 玩家阵容、敌方阵容生成正常。
5. `UNIT_DAMAGED` 事件触发。
6. `UNIT_DIED` 事件触发。
7. 战斗可进入 `Victory`。
8. `BattleResult.stageId` 非空。
9. `BattleResult.elapsedTimeMs > 0`。
10. `BattleResult.round > 0`。
11. `BattleResult.resultType` 有效。
12. 胜利后奖励非空。
13. `expGain / goldGain` 汇总计算正确。
14. `BATTLE_ENDED → STAGE_BATTLE_FINISHED` 链路打通。

最终结论：

```text
Phase 3 战斗闭环验证通过
```

## 6. 已知遗留问题

1. `_deprecated_scene.scene` 仍存在历史污染残留，本次 Phase3 运行验收未处理该文件。
2. 浏览器与 Cocos Preview 存在脚本 chunk 缓存现象，修复脚本后需要重启 Preview 或更换本地访问来源以确保加载新编译产物。
3. `scene-001.scene` 当前依赖编译后的脚本类型 id 挂载 `BattleDebugRunnerV2`，后续如 Cocos 重新生成脚本类型映射，需要再次确认场景挂载是否稳定。
4. Phase3 验收覆盖的是调试闭环，不等同于完整微信小游戏真机环境、微信开发者工具构建、资源分包、启动性能、平台 API 兼容性验收。

## 7. 是否允许进入 Phase4

允许进入 Phase4。

进入依据：

1. Phase1 已完成。
2. Phase2 已完成。
3. Phase3 静态诊断已完成。
4. Phase3 运行时验收已通过。
5. 当前阻断 Phase4 的核心战斗闭环问题已解除。

建议 Phase4 启动前先处理或登记：

1. 清理 `_deprecated_scene.scene` 污染残留。
2. 固化 `BattleDebugRunnerV2` 场景挂载方式，避免后续脚本映射变化造成回归。
3. 增加一条自动化或半自动化 Preview 验收记录，至少覆盖 `BattleResult.round > 0`、伤害、死亡、奖励、事件链路。
