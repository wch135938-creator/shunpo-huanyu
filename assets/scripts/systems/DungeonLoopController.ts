// ============================================================
// DungeonLoopController — Phase8-Step3 地牢闭环编排器
// 职责：连接节点进入 → 战斗/事件/Boss解析 → 奖励结算 → 成长更新 → 战力重算 → 存档
// 架构：非单例，由 Phase8Bootstrap 实例化并持有
// 边界：纯逻辑层，不操作 UI / Canvas / Camera
//
// 数据流：
//   processNode(runState, nodeId)
//     → RoguelikeSystem.enterNode()     → DungeonNodeResult
//     → simulateBattle()                → DungeonBattleResult (battle/boss)
//     → settleNodeRewards()            → SettlementResult
//       → DropSystem.settleBatch()     → DropHistoryRecord[]
//       → ProgressSystem.addHeroExp()  → auto level-up + power + save
//     → emit NODE_PROCESSED
//     → return DungeonNodeProcessingResult
// ============================================================

import { EventManager } from '../core/EventManager';
import { RoguelikeSystem } from './RoguelikeSystem';
import { DungeonEventManager, type EventResolveContext } from './DungeonEventManager';
import { DropSystem } from './DropSystem';
import { ProgressSystem } from './ProgressSystem';
import { PowerSystem } from './PowerSystem';
import { SaveManager } from '../save/SaveManager';
import type { Phase8Bootstrap } from './Phase8Bootstrap';
import type {
  DungeonRunState,
  DungeonNodeResult,
  DungeonRunResult,
  BattleRequest,
  RewardSource,
  RewardGrant,
  DungeonEventResult,
} from '../data/roguelike_types';
import type { EventConfig, EventResult } from '../data/event_types';
import type { DropHistoryRecord } from '../data/drop_types';
import type { BossConfig } from '../config/boss_config';
import { RewardSourcePriority } from '../data/reward_types';
import type { PityTriggerData } from '../data/reward_types';

// ==================== 事件常量 ====================

export const DungeonLoopEvent = {
  /** 节点处理完成 — payload: DungeonNodeProcessingResult */
  NODE_PROCESSED: 'dungeonLoop:nodeProcessed',
  /** 奖励结算完成 — payload: SettlementResult */
  REWARDS_SETTLED: 'dungeonLoop:rewardsSettled',
  /** 成长更新完成 — payload: GrowthUpdateData */
  GROWTH_UPDATED: 'dungeonLoop:growthUpdated',
  /** 节点战斗完成 — payload: DungeonBattleResult */
  NODE_BATTLE_COMPLETED: 'dungeonLoop:nodeBattleCompleted',
  /** Phase8-Step4: 奖励序列就绪 — payload: { runId, settlementResult, orderedGrants, pityTriggers } */
  REWARD_SEQUENCE_READY: 'dungeonLoop:rewardSequenceReady',
  /** Phase8-Step4: 保底触发 — payload: PityTriggerData */
  PITY_TRIGGERED: 'dungeonLoop:pityTriggered',
} as const;

// ==================== 结果类型 ====================

/** 战斗模拟结果 */
export interface DungeonBattleResult {
  nodeId: string;
  victory: boolean;
  playerPower: number;
  enemyPower: number;
  enemyRef: string;
  damageDealtRatio: number;
  damageTakenRatio: number;
  roundsSimulated: number;
  rewardSources: RewardSource[];
}

/** 奖励结算结果 */
export interface SettlementResult {
  records: DropHistoryRecord[];
  totalGold: number;
  totalExp: number;
  totalEquipment: number;
  totalItems: number;
}

/** 节点处理结果 */
export interface DungeonNodeProcessingResult {
  nodeId: string;
  nodeType: string;
  runState: DungeonRunState;
  battleResult?: DungeonBattleResult;
  eventResult?: EventResult;
  settlementResult: SettlementResult;
}

/** 成长更新数据 */
export interface GrowthUpdateData {
  runId: string;
  totalGoldSettled: number;
  totalExpSettled: number;
  powerBefore: number;
  powerAfter: number;
  powerDelta: number;
}

// ==================== 内部常量 ====================

/** 默认战力判定配置 */
const POWER_CONFIG = {
  guaranteedWinRatio: 1.5,
  guaranteedLossRatio: 0.3,
  randomVariance: 0.2,
};

/** 默认玩家 ID */
const DEFAULT_PLAYER_ID = 'player_001';

/** 默认英雄 ID（exp 分发目标） */
const DEFAULT_HERO_ID = 'hero_001';

export class DungeonLoopController {
  // ==================== 依赖 ====================

  private _roguelikeSystem: RoguelikeSystem;
  private _dungeonEventManager: DungeonEventManager;
  private _dropSystem: DropSystem;
  private _progressSystem: ProgressSystem;
  private _powerSystem: PowerSystem;
  private _saveManager: SaveManager;
  private _bootstrap: Phase8Bootstrap;
  private _eventManager: EventManager;

  // ==================== 内部状态 ====================

  /** runId → 累计金币 */
  private _runGoldMap: Map<string, number> = new Map();

  /** runId → 累计经验 */
  private _runExpMap: Map<string, number> = new Map();

  // ==================== 构造 ====================

  constructor(bootstrap: Phase8Bootstrap) {
    this._bootstrap = bootstrap;
    this._roguelikeSystem = bootstrap.getRoguelikeSystem();
    this._dungeonEventManager = bootstrap.getDungeonEventManager();
    this._dropSystem = DropSystem.getInstance();
    this._progressSystem = ProgressSystem.getInstance();
    this._powerSystem = PowerSystem.getInstance();
    this._saveManager = SaveManager.getInstance();
    this._eventManager = EventManager.getInstance();
  }

  // ================================================================
  // 核心 API：processNode
  // ================================================================

  /**
   * 处理节点进入的完整流程。
   *
   * 流程：
   * 1. RoguelikeSystem.enterNode() → DungeonNodeResult
   * 2. 根据节点类型分支处理：
   *    - battle/boss → simulateBattle() → 战斗结果
   *    - event       → rollEvent() → 返回事件配置供 UI 展示
   *    - reward/empty → 直接进入奖励结算
   * 3. settleNodeRewards() → 奖励结算 + 成长更新
   * 4. 派发 NODE_PROCESSED 事件
   *
   * @param runState       当前运行状态（原地修改）
   * @param targetNodeId   目标节点 ID
   * @returns              节点处理结果
   */
  async processNode(
    runState: DungeonRunState,
    targetNodeId: string,
  ): Promise<DungeonNodeProcessingResult> {
    // Step 1: 进入节点
    const nodeResult = this._roguelikeSystem.enterNode(runState, targetNodeId);
    const updatedState = nodeResult.runState;

    // 确定节点类型
    const config = this._roguelikeSystem.getDungeonConfig(updatedState.dungeonId);
    const layer = config?.layers.find((l) => l.id === updatedState.currentLayerId);
    const nodeConfig = layer?.nodeGraph.find((n) => n.id === targetNodeId);
    const nodeType = nodeConfig?.type ?? 'empty';

    let battleResult: DungeonBattleResult | undefined;
    let eventResult: EventResult | undefined;
    let allRewardSources: RewardSource[] = [...nodeResult.rewardSources];

    // Step 2: 按节点类型处理
    switch (nodeType) {
      case 'battle':
      case 'boss': {
        if (nodeResult.battleRequest) {
          battleResult = this.simulateBattle(
            nodeResult.battleRequest,
            runState,
            targetNodeId,
          );
          allRewardSources.push(...battleResult.rewardSources);

          this._eventManager.emit(DungeonLoopEvent.NODE_BATTLE_COMPLETED, battleResult);
        }
        break;
      }

      case 'event': {
        // 事件节点：抽取事件配置，返回给 UI 做选择
        const eventConfig = this._rollEventForNode(updatedState);
        if (eventConfig) {
          eventResult = {
            eventId: eventConfig.id,
            rewards: this._buildRewardSourcesFromEventConfig(eventConfig, updatedState),
            emittedEvents: [],
            completedAt: 0,
          };
          allRewardSources.push(...eventResult.rewards);
        }
        break;
      }

      case 'reward':
      case 'shop':
      case 'empty':
      default:
        // 奖励/商店/空地：rewardSources 已在 enterNode 时填充
        break;
    }

    // Step 3: 奖励结算
    const settlementResult = this.settleNodeRewards(allRewardSources, runState.runId);

    // Step 4: 派发事件
    const processingResult: DungeonNodeProcessingResult = {
      nodeId: targetNodeId,
      nodeType,
      runState: updatedState,
      battleResult,
      eventResult,
      settlementResult,
    };

    this._eventManager.emit(DungeonLoopEvent.NODE_PROCESSED, processingResult);

    return processingResult;
  }

  // ================================================================
  // 核心 API：simulateBattle
  // ================================================================

  /**
   * 轻量级战斗模拟（MVP 阶段不使用完整 BattleSystem）。
   *
   * 战力对比公式：
   *   playerPower = ProgressSystem.getPlayerProgressData().totalPower
   *   enemyPower = playerPower * battleRequest.powerRatio（普通战斗）
   *   enemyPower = bossConfig.atk * 2 + bossConfig.hp * 0.1（Boss 战斗）
   *   ratio = playerPower / enemyPower
   *   ratio ≥ guaranteedWinRatio  → 必定胜利
   *   ratio ≤ guaranteedLossRatio  → 必定失败
   *   否则随机判定（ratio ± randomVariance）
   *
   * @param battleRequest  战斗请求（来自 enterNode）
   * @param runState       运行状态
   * @param nodeId         节点 ID
   * @returns              战斗模拟结果
   */
  simulateBattle(
    battleRequest: BattleRequest,
    runState: DungeonRunState,
    nodeId: string,
  ): DungeonBattleResult {
    const playerData = this._progressSystem.getPlayerProgressData();
    const playerPower = playerData.totalPower;

    let enemyPower: number;
    let enemyRef = battleRequest.enemyRef;

    // 计算敌方战力
    if (battleRequest.battleType === 'boss') {
      const bossConfig = this._bootstrap.getBossConfig(enemyRef);
      if (bossConfig) {
        enemyPower = bossConfig.atk * 2 + bossConfig.hp * 0.1;
        enemyPower = Math.round(enemyPower * battleRequest.powerRatio);
      } else {
        // Boss 配置未找到，使用默认倍率计算
        console.warn(`[DungeonLoopController] Boss 配置不存在: ${enemyRef}，使用默认倍率`);
        enemyPower = Math.round(playerPower * battleRequest.powerRatio);
      }
    } else {
      enemyPower = Math.round(playerPower * battleRequest.powerRatio);
    }

    // 判定战斗结果
    const powerRatio = enemyPower > 0 ? playerPower / enemyPower : 999;

    let victory: boolean;
    let damageDealtRatio: number;
    let damageTakenRatio: number;

    if (powerRatio >= POWER_CONFIG.guaranteedWinRatio) {
      victory = true;
      damageDealtRatio = 1.0;
      damageTakenRatio = this._randomRange(0.05, 0.3);
    } else if (powerRatio <= POWER_CONFIG.guaranteedLossRatio) {
      victory = false;
      damageDealtRatio = this._randomRange(0.1, 0.5);
      damageTakenRatio = 1.0;
    } else {
      const variance = (Math.random() * 2 - 1) * POWER_CONFIG.randomVariance;
      const effectiveRatio = powerRatio + variance;

      if (effectiveRatio >= 1.0) {
        victory = true;
        damageDealtRatio = 1.0;
        damageTakenRatio = this._randomRange(0.1, 0.6);
      } else {
        victory = false;
        damageDealtRatio = this._randomRange(0.2, effectiveRatio);
        damageTakenRatio = 1.0;
      }
    }

    // 模拟回合数
    const roundsSimulated = victory
      ? this._randomInt(3, Math.max(3, Math.ceil(10 / Math.max(0.5, powerRatio))))
      : this._randomInt(5, 15);

    // 构建奖励来源
    const rewardSources: RewardSource[] = [];

    if (victory) {
      // 战斗胜利奖励：使用节点配置的掉落引用
      if (battleRequest.battleType === 'boss' && battleRequest.enemyRef) {
        const bossConfig = this._bootstrap.getBossConfig(battleRequest.enemyRef);
        if (bossConfig && bossConfig.drops && bossConfig.drops.length > 0) {
          const dropTableIds = bossConfig.drops.map((d) => String(d.dropTableId));
          rewardSources.push({
            sourceId: `boss_${battleRequest.enemyRef}_${nodeId}`,
            sourceType: 'dungeon_boss',
            dropTableRefs: dropTableIds,
            rewardPoolRefs: [],
            context: {
              playerId: DEFAULT_PLAYER_ID,
              correlationId: `battle_${nodeId}_${Date.now()}`,
              metadata: { nodeId, battleType: 'boss', enemyRef: battleRequest.enemyRef },
            },
          });
        }
      }

      // 附加战斗基础奖励
      rewardSources.push({
        sourceId: `battle_${nodeId}_base`,
        sourceType: 'dungeon_node',
        dropTableRefs: ['1'], // 基础掉落表
        rewardPoolRefs: [],
        context: {
          playerId: DEFAULT_PLAYER_ID,
          correlationId: `battle_${nodeId}_${Date.now()}`,
          metadata: { nodeId, battleType: battleRequest.battleType },
        },
      });
    }

    return {
      nodeId,
      victory,
      playerPower,
      enemyPower,
      enemyRef,
      damageDealtRatio: Math.round(damageDealtRatio * 100) / 100,
      damageTakenRatio: Math.round(damageTakenRatio * 100) / 100,
      roundsSimulated,
      rewardSources,
    };
  }

  // ================================================================
  // 核心 API：settleNodeRewards
  // ================================================================

  /**
   * 结算节点奖励，触发成长更新流水线。
   *
   * 流水线：
   * 1. DropSystem.settleBatch(rewardSources) → DropHistoryRecord[]
   * 2. 聚合所有 RewardGrant
   * 3. 经验 → ProgressSystem.addHeroExp()
   * 4. 金币 → 内存累计
   * 5. 派发 REWARDS_SETTLED 事件
   * 6. Phase8-Step4: 按优先级排序来源、检测保底触发、派发动画事件
   *
   * @param rewardSources  奖励来源列表
   * @param runId          运行 ID
   * @returns              结算结果
   */
  settleNodeRewards(
    rewardSources: RewardSource[],
    runId: string,
  ): SettlementResult {
    const result: SettlementResult = {
      records: [],
      totalGold: 0,
      totalExp: 0,
      totalEquipment: 0,
      totalItems: 0,
    };

    if (!rewardSources || rewardSources.length === 0) {
      return result;
    }

    // Phase8-Step4: 按来源优先级排序
    const orderedSources = this._orderRewardSources(rewardSources);

    // Step 1: 通过 DropSystem 批量结算（已排序的来源）
    try {
      result.records = this._dropSystem.settleBatch(orderedSources, DEFAULT_PLAYER_ID);
    } catch (e) {
      console.warn(`[DungeonLoopController] settleBatch 失败: ${e}`);
      return result;
    }

    // Phase8-Step4: 检测保底触发
    const pityTriggers: PityTriggerData[] = [];

    // Step 2: 聚合奖励并发放
    const orderedGrants: RewardGrant[] = [];
    for (const record of result.records) {
      for (const grant of record.rewards) {
        if (grant.granted) continue;

        // 检测保底奖励（rewardId 以 "pity_" 开头）
        if (grant.rewardId.startsWith('pity_')) {
          pityTriggers.push({
            sourceType: record.sourceType,
            ruleId: grant.rewardId,
            triggerCount: (record.pityAfter?.pityCounters?.[`pity_${record.sourceType}`] ?? 0),
            bonusReward: grant,
            triggeredAt: record.createdAt,
          });
        }

        switch (grant.rewardType) {
          case 'gold':
            result.totalGold += grant.quantity;
            break;

          case 'exp': {
            result.totalExp += grant.quantity;
            // 分发经验到英雄 → 自动触发 level-up + power + save
            this._distributeExp(grant.quantity);
            break;
          }

          case 'equipment':
            result.totalEquipment += 1;
            break;

          default:
            result.totalItems += grant.quantity;
            break;
        }

        orderedGrants.push(grant);
      }
    }

    // Step 3: 更新内存累计器（供 HUD 查询）
    const currentGold = this._runGoldMap.get(runId) ?? 0;
    this._runGoldMap.set(runId, currentGold + result.totalGold);

    const currentExp = this._runExpMap.get(runId) ?? 0;
    this._runExpMap.set(runId, currentExp + result.totalExp);

    // Step 4: 标记脏数据，触发自动保存
    this._saveManager.markDirty();

    // Step 5: 派发结算事件
    this._eventManager.emit(DungeonLoopEvent.REWARDS_SETTLED, {
      runId,
      totalGold: result.totalGold,
      totalExp: result.totalExp,
      totalEquipment: result.totalEquipment,
      totalItems: result.totalItems,
    });

    // Phase8-Step4: 派发奖励序列就绪事件（供 UI 动画消费）
    this._eventManager.emit(DungeonLoopEvent.REWARD_SEQUENCE_READY, {
      runId,
      settlementResult: result,
      orderedGrants,
      pityTriggers,
    });

    // Phase8-Step4: 逐个派发保底触发事件
    for (const pityTrigger of pityTriggers) {
      this._eventManager.emit(DungeonLoopEvent.PITY_TRIGGERED, pityTrigger);
      console.log(
        `[DungeonLoopController] 保底触发: sourceType=${pityTrigger.sourceType}, ` +
        `ruleId=${pityTrigger.ruleId}, reward=${pityTrigger.bonusReward.rewardType}x${pityTrigger.bonusReward.quantity}`,
      );
    }

    // Step 6: 派发成长更新事件
    const playerData = this._progressSystem.getPlayerProgressData();
    this._eventManager.emit(DungeonLoopEvent.GROWTH_UPDATED, {
      runId,
      totalGoldSettled: this._runGoldMap.get(runId) ?? 0,
      totalExpSettled: this._runExpMap.get(runId) ?? 0,
      powerBefore: playerData.totalPower,
      powerAfter: playerData.totalPower,
      powerDelta: 0,
    } as GrowthUpdateData);

    return result;
  }

  // ================================================================
  // 核心 API：resolveEventChoice
  // ================================================================

  /**
   * 根据玩家选择的事件选项，解析事件并结算奖励。
   *
   * 流程：
   * 1. 构建 EventChoice[]（从 eventConfig.rewardSourceRefs 或默认选项）
   * 2. 调用 RoguelikeSystem.resolveEvent()
   * 3. 结算 rewardSources
   *
   * @param runState       运行状态（原地修改）
   * @param eventConfig    事件配置
   * @param choiceId       玩家选择的选项 ID
   * @returns              事件解析结果
   */
  resolveEventChoice(
    runState: DungeonRunState,
    eventConfig: EventConfig,
    choiceId: string,
  ): DungeonEventResult {
    // 构建 EventChoice 列表
    const choices = this._buildEventChoices(eventConfig);

    // 调用 RoguelikeSystem 解析事件
    const result = this._roguelikeSystem.resolveEvent(runState, choiceId, choices);

    // 结算事件奖励
    if (result.rewardSources.length > 0) {
      this.settleNodeRewards(result.rewardSources, runState.runId);
    }

    return result;
  }

  // ================================================================
  // 核心 API：completeRun
  // ================================================================

  /**
   * 完成地牢运行（通关或主动结束）。
   *
   * 流程：
   * 1. 调用 RoguelikeSystem.completeRun()
   * 2. 结算所有未结算的奖励
   * 3. 更新成长数据
   * 4. 归档运行历史
   * 5. 派发 GROWTH_UPDATED
   *
   * @param runState  运行状态
   * @returns         通关结果
   */
  completeRun(runState: DungeonRunState): DungeonRunResult {
    const playerDataBefore = this._progressSystem.getPlayerProgressData();

    // 1. 完成运行
    const runResult = this._roguelikeSystem.completeRun(runState);

    // 2. 结算剩余奖励
    if (runResult.rewardSources.length > 0) {
      this.settleNodeRewards(runResult.rewardSources, runState.runId);
    }

    // 3. 更新战力
    const playerDataAfter = this._progressSystem.getPlayerProgressData();

    // 4. 派发成长更新事件
    this._eventManager.emit(DungeonLoopEvent.GROWTH_UPDATED, {
      runId: runState.runId,
      totalGoldSettled: this._runGoldMap.get(runState.runId) ?? 0,
      totalExpSettled: this._runExpMap.get(runState.runId) ?? 0,
      powerBefore: playerDataBefore.totalPower,
      powerAfter: playerDataAfter.totalPower,
      powerDelta: playerDataAfter.totalPower - playerDataBefore.totalPower,
    } as GrowthUpdateData);

    // 5. 最终存档
    this._saveManager.markDirty();
    this._saveManager.autoSave();

    console.log(
      `[DungeonLoopController] 运行完成: ${runState.runId}, ` +
      `成功=${runResult.success}, 奖励=${runResult.rewardSources.length}项, ` +
      `累计金币=${this._runGoldMap.get(runState.runId) ?? 0}, ` +
      `累计经验=${this._runExpMap.get(runState.runId) ?? 0}, ` +
      `战力变化=${playerDataAfter.totalPower - playerDataBefore.totalPower}`,
    );

    return runResult;
  }

  // ================================================================
  // 查询 API
  // ================================================================

  /** 获取本次运行的累计金币 */
  getRunGold(runId: string): number {
    return this._runGoldMap.get(runId) ?? 0;
  }

  /** 获取本次运行的累计经验 */
  getRunExp(runId: string): number {
    return this._runExpMap.get(runId) ?? 0;
  }

  /** 获取本次运行的累计资源 */
  getRunStats(runId: string): { gold: number; exp: number } {
    return {
      gold: this.getRunGold(runId),
      exp: this.getRunExp(runId),
    };
  }

  /** 重置运行累计器 */
  resetRunAccumulators(runId: string): void {
    this._runGoldMap.delete(runId);
    this._runExpMap.delete(runId);
  }

  // ================================================================
  // 内部：事件处理
  // ================================================================

  /**
   * 从事件池抽取一个随机事件配置。
   *
   * @param runState  运行状态
   * @returns         事件配置；无可抽事件返回 null
   */
  private _rollEventForNode(runState: DungeonRunState): EventConfig | null {
    const config = this._roguelikeSystem.getDungeonConfig(runState.dungeonId);
    if (!config || !config.eventPoolRefs || config.eventPoolRefs.length === 0) {
      console.warn(`[DungeonLoopController] 地牢 ${runState.dungeonId} 无事件池配置`);
      return null;
    }

    const context: EventResolveContext = {
      playerId: DEFAULT_PLAYER_ID,
      correlationId: `event_roll_${runState.runId}_${Date.now()}`,
      runState,
    };

    return this._dungeonEventManager.rollEvent(
      config.eventPoolRefs,
      runState.resolvedEventIds,
      context,
    );
  }

  /**
   * 从事件配置构建 EventChoice[] 供 RoguelikeSystem.resolveEvent() 使用。
   */
  private _buildEventChoices(
    eventConfig: EventConfig,
  ): import('../data/roguelike_types').EventChoice[] {
    const choices: import('../data/roguelike_types').EventChoice[] = [];

    // 根据事件分类构建选项（对应 EventPanel._buildDefaultChoices）
    switch (eventConfig.category) {
      case 'reward':
        choices.push({
          choiceId: 'accept',
          descriptionKey: '领取奖励',
          rewardSources: this._buildRewardSourcesFromEventConfig(eventConfig),
        });
        break;

      case 'battle':
        choices.push({
          choiceId: 'fight',
          descriptionKey: '迎战！',
          rewardSources: this._buildRewardSourcesFromEventConfig(eventConfig),
        });
        choices.push({
          choiceId: 'flee',
          descriptionKey: '回避',
          rewardSources: [],
        });
        break;

      case 'blessing':
        choices.push({
          choiceId: 'accept',
          descriptionKey: '接受祝福',
          rewardSources: this._buildRewardSourcesFromEventConfig(eventConfig),
        });
        break;

      case 'curse':
        choices.push({
          choiceId: 'accept',
          descriptionKey: '承受诅咒（获得补偿）',
          rewardSources: this._buildRewardSourcesFromEventConfig(eventConfig),
        });
        choices.push({
          choiceId: 'resist',
          descriptionKey: '抵抗诅咒',
          rewardSources: [],
        });
        break;

      case 'story':
        choices.push({
          choiceId: 'option_a',
          descriptionKey: '选项 A：勇往直前',
          rewardSources: this._buildRewardSourcesFromEventConfig(eventConfig),
        });
        choices.push({
          choiceId: 'option_b',
          descriptionKey: '选项 B：谨慎行事',
          rewardSources: [],
        });
        choices.push({
          choiceId: 'option_c',
          descriptionKey: '选项 C：另辟蹊径',
          rewardSources: this._buildRewardSourcesFromEventConfig(eventConfig),
        });
        break;

      case 'boss':
        choices.push({
          choiceId: 'fight',
          descriptionKey: '挑战 Boss！',
          rewardSources: this._buildRewardSourcesFromEventConfig(eventConfig),
        });
        choices.push({
          choiceId: 'avoid',
          descriptionKey: '暂时回避',
          rewardSources: [],
        });
        break;

      case 'special':
        choices.push({
          choiceId: 'investigate',
          descriptionKey: '深入调查',
          rewardSources: this._buildRewardSourcesFromEventConfig(eventConfig),
        });
        choices.push({
          choiceId: 'ignore',
          descriptionKey: '无视',
          rewardSources: [],
        });
        break;

      case 'shop':
      default:
        choices.push({
          choiceId: 'continue',
          descriptionKey: '继续',
          rewardSources: this._buildRewardSourcesFromEventConfig(eventConfig),
        });
        break;
    }

    return choices;
  }

  /**
   * 从事件配置构建 RewardSource 列表。
   */
  private _buildRewardSourcesFromEventConfig(
    eventConfig: EventConfig,
    runState?: DungeonRunState,
  ): RewardSource[] {
    const sources: RewardSource[] = [];

    if (eventConfig.rewardSourceRefs && eventConfig.rewardSourceRefs.length > 0) {
      const correlationId = runState
        ? `event_${eventConfig.id}_${runState.runId}_${Date.now()}`
        : `event_${eventConfig.id}_${Date.now()}`;

      sources.push({
        sourceId: `event_${eventConfig.id}`,
        sourceType: 'dungeon_event',
        dropTableRefs: eventConfig.rewardSourceRefs,
        rewardPoolRefs: [],
        context: {
          playerId: DEFAULT_PLAYER_ID,
          correlationId,
          metadata: {
            eventId: eventConfig.id,
            eventCategory: eventConfig.category,
          },
        },
      });
    }

    return sources;
  }

  // ================================================================
  // Phase8-Step4: 内部 —— 来源排序
  // ================================================================

  /**
   * 按 RewardSourcePriority 排序奖励来源。
   *
   * 排序规则：
   * - dungeon_boss (pri=100) 最先
   * - dungeon_event (pri=80) 次之
   * - dungeon_node (pri=60) 再次
   * - 其余类型按优先级降序
   * - 同优先级保持原始顺序（稳定排序）
   */
  private _orderRewardSources(sources: RewardSource[]): RewardSource[] {
    if (sources.length <= 1) return [...sources];

    return [...sources].sort((a, b) => {
      const pa = RewardSourcePriority[a.sourceType] ?? 0;
      const pb = RewardSourcePriority[b.sourceType] ?? 0;
      return pb - pa; // 降序：高优先级在前
    });
  }

  // ================================================================
  // 内部：经验分发
  // ================================================================

  /**
   * 将经验分发到英雄。
   *
   * V1 API：通过 ProgressSystem.addHeroExp() 发放，
   * 该方法内部自动处理升级、战力重算、存档。
   *
   * @param totalExp  总经验量
   */
  private _distributeExp(totalExp: number): void {
    if (totalExp <= 0) return;

    // 获取可用英雄列表
    const heroIds = this._getAvailableHeroIds();
    if (heroIds.length === 0) {
      console.warn('[DungeonLoopController] 无可用英雄，经验发放跳过');
      return;
    }

    const expPerHero = Math.max(1, Math.floor(totalExp / heroIds.length));

    for (const heroId of heroIds) {
      try {
        this._progressSystem.addHeroExp(heroId, expPerHero);
      } catch (e) {
        // 单个英雄经验发放失败不影响整体流程
        console.warn(`[DungeonLoopController] 英雄 ${heroId} 经验发放失败: ${e}`);
      }
    }
  }

  /**
   * 获取可用英雄 ID 列表。
   *
   * 通过 ConfigManager 读取 hero_list 配置获取已配置的英雄。
   */
  private _getAvailableHeroIds(): string[] {
    try {
      // 尝试从 ProgressSystem 的 heroConfigMap 获取
      const progressSystem = this._progressSystem as unknown as {
        _heroConfigMap?: Map<string, unknown>;
      };

      if (progressSystem._heroConfigMap && progressSystem._heroConfigMap.size > 0) {
        return Array.from(progressSystem._heroConfigMap.keys());
      }
    } catch {
      // 反射失败，回退
    }

    // 回退：使用默认英雄
    return [DEFAULT_HERO_ID];
  }

  // ================================================================
  // 辅助：随机数
  // ================================================================

  private _randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private _randomRange(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }
}
