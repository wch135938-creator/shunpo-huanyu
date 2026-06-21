// ============================================================
// DungeonEventManager — Phase7-Step3 地牢事件管理器
// 职责：事件池管理 / 加权随机事件抽取 / 事件解析 / 条件校验
// 边界：纯领域逻辑，不实现 UI、不直接写存档、不直接操作战斗
//
// 与 RewardSource 的关系：
//   Event → RewardSource → DropSystem → RewardSettlement
//   禁止 Event 直接发放奖励，所有奖励统一走 DropSystem 结算。
//
// 与 RoguelikeSystem 的关系：
//   DungeonEventManager 负责事件抽取和执行。
//   RoguelikeSystem 负责节点图推进和运行管理。
//   两者通过 DomainEventBus 通信。
// ============================================================

import { BaseSystem } from '../core/BaseSystem';
import { DomainEventBus } from './DomainEventBus';
import type {
  RewardSource,
  RewardGrant,
  DomainEvent,
  CorrelationId,
  DungeonRunState,
} from '../data/roguelike_types';
import {
  generateCorrelationId,
  DomainEventType,
} from '../data/roguelike_types';
import type {
  EventPool,
  EventConfig,
  EventResult,
  EventHistoryRecord,
} from '../data/event_types';
import {
  generateEventHistoryId,
} from '../data/event_types';

// ---- 常量 ----

const DEFAULT_PLAYER_ID = 'player_001';

/** 事件选择上下文 */
export interface EventResolveContext {
  playerId: string;
  correlationId: CorrelationId;
  runState: DungeonRunState;
}

export class DungeonEventManager extends BaseSystem {
  // ==================== 内部状态 ====================

  /** 事件配置缓存：eventId → EventConfig */
  private _eventConfigMap: Map<string, EventConfig> = new Map();

  /** 事件池缓存：poolId → EventPool */
  private _eventPoolMap: Map<string, EventPool> = new Map();

  /** 领域事件总线 */
  private _eventBus: DomainEventBus;

  /** 活跃的关联 ID */
  private _activeCorrelationId: CorrelationId | null = null;

  /** 事件历史缓冲 */
  private _eventHistory: EventHistoryRecord[] = [];

  // ==================== 构造 ====================

  constructor() {
    super();
    this._eventBus = new DomainEventBus();
  }

  // ==================== 配置管理 ====================

  /**
   * 注册事件配置。
   *
   * @param configs  事件配置数组
   */
  registerEventConfigs(configs: EventConfig[]): void {
    this._eventConfigMap.clear();

    for (const config of configs) {
      if (!config.id) {
        throw new Error('[DungeonEventManager] 事件配置缺少 id');
      }
      if (typeof config.weight !== 'number' || config.weight < 0) {
        console.warn(`[DungeonEventManager] 事件 ${config.id} 权重无效: ${config.weight}，默认为 10`);
        config.weight = 10;
      }
      this._eventConfigMap.set(config.id, config);
    }
  }

  /**
   * 注册事件池。
   *
   * @param pools  事件池数组
   */
  registerEventPools(pools: EventPool[]): void {
    this._eventPoolMap.clear();

    for (const pool of pools) {
      if (!pool.id) {
        throw new Error('[DungeonEventManager] 事件池缺少 id');
      }
      this._eventPoolMap.set(pool.id, pool);
    }
  }

  /**
   * 获取领域事件总线。
   */
  getDomainEventBus(): DomainEventBus {
    return this._eventBus;
  }

  /** 已注册的事件配置数量 */
  getEventConfigCount(): number {
    return this._eventConfigMap.size;
  }

  /** 已注册的事件池数量 */
  getEventPoolCount(): number {
    return this._eventPoolMap.size;
  }

  // ==================== 核心 API：rollEvent ====================

  /**
   * 从事件池中加权随机抽取一个事件。
   *
   * 流程：
   * 1. 解析事件池引用链（poolRefs → EventPool → eventPoolRefs → EventConfig）。
   * 2. 过滤条件不满足的事件。
   * 3. 过滤已解析过的不可重复事件（通过 tags 标记）。
   * 4. 按权重进行加权随机抽取。
   * 5. 发布 DungeonEventRolled 领域事件。
   *
   * @param poolRefs        事件池引用列表（来自 DungeonConfigV2.eventPoolRefs）
   * @param resolvedEventIds  已解析的事件 ID 列表（防止重复）
   * @param context          解析上下文
   * @returns                抽取到的事件配置；无可抽事件时返回 null
   */
  rollEvent(
    poolRefs: string[],
    resolvedEventIds: string[],
    context: EventResolveContext,
  ): EventConfig | null {
    if (!poolRefs || poolRefs.length === 0) {
      console.warn('[DungeonEventManager] 事件池引用为空');
      return null;
    }

    // 收集所有候选事件
    const candidates: EventConfig[] = [];

    for (const poolRef of poolRefs) {
      const pool = this._eventPoolMap.get(poolRef);
      if (!pool) {
        console.warn(`[DungeonEventManager] 事件池不存在: ${poolRef}`);
        continue;
      }

      for (const eventRef of pool.eventPoolRefs) {
        const config = this._eventConfigMap.get(eventRef);
        if (!config) {
          console.warn(`[DungeonEventManager] 事件配置不存在: ${eventRef}`);
          continue;
        }

        // 过滤已解析事件（通过 tags 中的不可重复标记）
        if (config.tags && config.tags.includes('once_per_run')) {
          if (resolvedEventIds.includes(config.id)) {
            continue; // 本次 run 已触发过
          }
        }

        // 检查条件
        if (config.conditions && config.conditions.length > 0) {
          if (!this._checkConditions(config.conditions, context)) {
            continue; // 条件不满足
          }
        }

        candidates.push(config);
      }
    }

    if (candidates.length === 0) {
      console.log('[DungeonEventManager] 没有可抽取的事件');
      return null;
    }

    // 加权随机抽取
    const selected = this._weightedRandomSelect(candidates);

    // 发布领域事件
    this._publishEvent(
      DomainEventType.DUNGEON_EVENT_ROLLED,
      {
        eventId: selected.id,
        category: selected.category,
        poolRefs,
        candidateCount: candidates.length,
      },
      selected.id,
      context.playerId,
    );

    return selected;
  }

  // ==================== 核心 API：resolveEvent ====================

  /**
   * 解析事件（处理事件结果）。
   *
   * 流程：
   * 1. 根据事件配置生成 RewardSource 列表。
   * 2. 发布 DungeonEventResolved + DungeonEventRewardGranted 领域事件。
   * 3. 记录事件历史。
   *
   * @param eventConfig  事件配置
   * @param context      解析上下文
   * @returns            事件结果
   */
  resolveEvent(
    eventConfig: EventConfig,
    context: EventResolveContext,
  ): EventResult {
    const rewards: RewardSource[] = [];

    // 从事件配置构建 RewardSource（统一通过 DropSystem 结算）
    if (eventConfig.rewardSourceRefs && eventConfig.rewardSourceRefs.length > 0) {
      for (let i = 0; i < eventConfig.rewardSourceRefs.length; i++) {
        const sourceRef = eventConfig.rewardSourceRefs[i];
        rewards.push({
          sourceId: `event_${eventConfig.id}_reward_${i}`,
          sourceType: 'dungeon_event',
          dropTableRefs: [sourceRef],
          rewardPoolRefs: [],
          context: {
            playerId: context.playerId,
            correlationId: context.correlationId,
            metadata: {
              eventId: eventConfig.id,
              eventCategory: eventConfig.category,
            },
          },
        });
      }
    }

    // 发布 DUNGEON_EVENT_RESOLVED
    const resolvedEvent = this._publishEvent(
      DomainEventType.DUNGEON_EVENT_RESOLVED,
      {
        eventId: eventConfig.id,
        category: eventConfig.category,
        rewardCount: rewards.length,
      },
      eventConfig.id,
      context.playerId,
    );

    // 发布 DUNGEON_EVENT_REWARD_GRANTED
    const rewardEvent = this._publishEvent(
      DomainEventType.DUNGEON_EVENT_REWARD_GRANTED,
      {
        eventId: eventConfig.id,
        rewardSourceRefs: eventConfig.rewardSourceRefs ?? [],
      },
      eventConfig.id,
      context.playerId,
    );

    const completedAt = Date.now();

    const result: EventResult = {
      eventId: eventConfig.id,
      rewards,
      emittedEvents: [resolvedEvent, rewardEvent],
      nextEventIds: eventConfig.nextEventRefs,
      completedAt,
    };

    // 记录事件历史
    this._recordHistory(eventConfig.id, context, []);

    return result;
  }

  // ==================== 核心 API：validateEvent ====================

  /**
   * 校验事件配置的合法性。
   *
   * 检查项：
   * - ID 非空
   * - category 合法
   * - weight 有效
   * - 条件结构完整
   *
   * @param eventConfig  事件配置
   * @returns            校验结果
   */
  validateEvent(eventConfig: EventConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!eventConfig || !eventConfig.id) {
      errors.push('事件 ID 为空');
      return { valid: false, errors };
    }

    const validCategories = [
      'reward', 'battle', 'shop', 'blessing',
      'curse', 'story', 'boss', 'special',
    ];
    if (!validCategories.includes(eventConfig.category)) {
      errors.push(`无效的事件类别: ${eventConfig.category}`);
    }

    if (typeof eventConfig.weight !== 'number' || eventConfig.weight < 0) {
      errors.push(`权重无效: ${eventConfig.weight}`);
    }

    if (eventConfig.conditions) {
      for (const condition of eventConfig.conditions) {
        const validConditionTypes = [
          'minLevel', 'maxLevel', 'minPower', 'hasHero',
          'hasItem', 'dungeonClear', 'previousEventResolved', 'custom',
        ];
        if (!validConditionTypes.includes(condition.type)) {
          errors.push(`无效的条件类型: ${condition.type}`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  // ==================== 事件历史 API ====================

  /**
   * 获取所有事件历史记录。
   */
  getEventHistory(): EventHistoryRecord[] {
    return [...this._eventHistory];
  }

  /**
   * 按 runId 查询事件历史。
   */
  getEventHistoryByRun(runId: string): EventHistoryRecord[] {
    return this._eventHistory.filter((r) => r.runId === runId);
  }

  /**
   * 按 eventId 查询事件历史。
   */
  getEventHistoryByEvent(eventId: string): EventHistoryRecord[] {
    return this._eventHistory.filter((r) => r.eventId === eventId);
  }

  /**
   * 将内存中的事件历史同步到 DungeonRunState。
   *
   * @param runState  运行状态（原地修改）
   */
  syncEventHistoryToRunState(runState: DungeonRunState): void {
    if (!runState.eventHistory) {
      runState.eventHistory = [];
    }

    const runHistories = this._eventHistory.filter((r) => r.runId === runState.runId);
    for (const record of runHistories) {
      if (!runState.eventHistory.find((r) => r.id === record.id)) {
        runState.eventHistory.push(record);
      }
    }
  }

  /**
   * 从 DungeonRunState 恢复事件历史到内存。
   *
   * @param runState  运行状态
   */
  restoreEventHistoryFromRunState(runState: DungeonRunState): void {
    if (runState.eventHistory) {
      for (const record of runState.eventHistory) {
        if (!this._eventHistory.find((r) => r.id === record.id)) {
          this._eventHistory.push(record);
        }
      }
    }
  }

  // ==================== 图联动 API ====================

  /**
   * 检查并触发分叉关联事件。
   *
   * NodeFork.forkTriggerEvent 非空时，触发对应事件。
   *
   * @param forkTriggerEvent  分叉关联事件 ID（可为空）
   * @param context           解析上下文
   * @returns                 事件结果；无触发事件时返回 null
   */
  triggerForkEvent(
    forkTriggerEvent: string | undefined,
    context: EventResolveContext,
  ): EventResult | null {
    if (!forkTriggerEvent) return null;

    const config = this._eventConfigMap.get(forkTriggerEvent);
    if (!config) {
      console.warn(`[DungeonEventManager] 分叉触发事件不存在: ${forkTriggerEvent}`);
      return null;
    }

    return this.resolveEvent(config, context);
  }

  /**
   * 检查并触发分支选择关联事件。
   *
   * BranchPath.branchSelectedEvent 非空时，触发对应事件。
   *
   * @param branchSelectedEvent  分支选择关联事件 ID（可为空）
   * @param context              解析上下文
   * @returns                    事件结果；无触发事件时返回 null
   */
  triggerBranchSelectedEvent(
    branchSelectedEvent: string | undefined,
    context: EventResolveContext,
  ): EventResult | null {
    if (!branchSelectedEvent) return null;

    const config = this._eventConfigMap.get(branchSelectedEvent);
    if (!config) {
      console.warn(`[DungeonEventManager] 分支选择事件不存在: ${branchSelectedEvent}`);
      return null;
    }

    return this.resolveEvent(config, context);
  }

  /**
   * 检查并触发楼层转换关联事件。
   *
   * FloorTransition.floorTransitionEvent 非空时，触发对应事件。
   *
   * @param floorTransitionEvent  楼层转换关联事件 ID（可为空）
   * @param context               解析上下文
   * @returns                     事件结果；无触发事件时返回 null
   */
  triggerFloorTransitionEvent(
    floorTransitionEvent: string | undefined,
    context: EventResolveContext,
  ): EventResult | null {
    if (!floorTransitionEvent) return null;

    const config = this._eventConfigMap.get(floorTransitionEvent);
    if (!config) {
      console.warn(`[DungeonEventManager] 楼层转换事件不存在: ${floorTransitionEvent}`);
      return null;
    }

    return this.resolveEvent(config, context);
  }

  // ==================== 内部方法 ====================

  /**
   * 加权随机抽取。
   *
   * 所有候选事件的 totalWeight 为分母，每个事件的 weight / totalWeight 为选中概率。
   */
  private _weightedRandomSelect(candidates: EventConfig[]): EventConfig {
    const totalWeight = candidates.reduce((sum, c) => sum + Math.max(0, c.weight), 0);

    if (totalWeight <= 0) {
      // 所有权重为 0，等概率随机选择
      const index = Math.floor(Math.random() * candidates.length);
      return candidates[index];
    }

    let roll = Math.random() * totalWeight;

    for (const candidate of candidates) {
      roll -= Math.max(0, candidate.weight);
      if (roll <= 0) {
        return candidate;
      }
    }

    // 浮点数精度兜底：返回最后一个
    return candidates[candidates.length - 1];
  }

  /**
   * 检查事件触发条件。
   */
  private _checkConditions(
    conditions: import('../data/event_types').EventCondition[],
    context: EventResolveContext,
  ): boolean {
    for (const condition of conditions) {
      switch (condition.type) {
        case 'minLevel': {
          const minLevel = Number(condition.params.level ?? 0);
          // 简化：检查上下文中的玩家等级
          if (minLevel > 0) {
            // 实际实现需要从 runState 或 player data 读取等级
            // 此处保留接口，真实校验由调用方提供 level
            const playerLevel = Number(condition.params._playerLevel ?? 1);
            if (playerLevel < minLevel) return false;
          }
          break;
        }
        case 'previousEventResolved': {
          const requiredEventId = String(condition.params.eventId ?? '');
          if (requiredEventId && !context.runState.resolvedEventIds.includes(requiredEventId)) {
            return false;
          }
          break;
        }
        case 'dungeonClear': {
          const dungeonId = String(condition.params.dungeonId ?? '');
          // 简化：如果指定了 dungeonId，检查是否已通关该地牢
          // 实际实现需要从存档数据读取
          if (dungeonId) {
            // 占位：由上层提供
          }
          break;
        }
        default:
          // 其他条件类型默认通过（由上层提供实际校验逻辑）
          break;
      }
    }

    return true;
  }

  /**
   * 记录事件历史。
   */
  private _recordHistory(
    eventId: string,
    context: EventResolveContext,
    rewards: RewardGrant[],
  ): EventHistoryRecord {
    const record: EventHistoryRecord = {
      id: generateEventHistoryId(),
      runId: context.runState.runId,
      eventId,
      nodeId: context.runState.currentNodeId,
      layerId: context.runState.currentLayerId,
      correlationId: context.correlationId,
      rewards,
      createdAt: Date.now(),
    };

    this._eventHistory.push(record);

    // 发布历史记录领域事件
    this._publishEvent(
      DomainEventType.DUNGEON_EVENT_HISTORY_RECORDED,
      {
        historyId: record.id,
        eventId,
        runId: context.runState.runId,
      },
      eventId,
      context.playerId,
    );

    return record;
  }

  /**
   * 发布领域事件的内部便捷方法。
   */
  private _publishEvent<T>(
    type: string,
    payload: T,
    aggregateId: string,
    playerId: string,
  ): DomainEvent<T> {
    return this._eventBus.publish(
      type,
      payload,
      aggregateId,
      playerId,
      this._activeCorrelationId ?? undefined,
    );
  }

  /** 清除所有数据 */
  clearAll(): void {
    this._eventConfigMap.clear();
    this._eventPoolMap.clear();
    this._eventHistory = [];
    this._eventBus.clearBuffer();
    this._activeCorrelationId = null;
  }
}
