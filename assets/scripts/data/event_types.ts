// ============================================================
// event_types.ts — Phase7-Step3 Dungeon Event 类型定义
// 职责：定义 EventPool / EventConfig / EventResult / EventHistory 等核心类型
// 规范：仅定义数据结构，不包含业务逻辑；所有字段兼容 Phase6/Phase7 已有接口
// ============================================================

import type { RewardSource, RewardGrant, DomainEvent } from './roguelike_types';

// ---- EventCondition ----

/** 事件触发条件 */
export interface EventCondition {
  /** 条件类型 */
  type:
    | 'minLevel'
    | 'maxLevel'
    | 'minPower'
    | 'hasHero'
    | 'hasItem'
    | 'dungeonClear'
    | 'previousEventResolved'
    | 'custom';
  /** 条件参数 */
  params: Record<string, number | string>;
}

// ---- EventConfig ----

/**
 * 地牢事件配置。
 *
 * 设计原则：
 * - category 决定事件在 UI 端的展示方式和选择逻辑。
 * - weight 为被抽取的权重（非概率），实际概率 = weight / totalPoolWeight。
 * - rewardSourceRefs 指向 RewardSource 的 sourceId，由 DropSystem 统一结算。
 * - conditions 为额外触发条件（可选），不满足时跳过该事件。
 */
export interface EventConfig {
  /** 事件唯一 ID */
  id: string;
  /** 配置版本号 */
  version: number;
  /** 多语言名称 Key */
  nameKey: string;
  /** 多语言描述 Key */
  descriptionKey: string;

  /**
   * 事件分类。
   *
   * - reward:   奖励事件（免费拿）
   * - battle:   战斗事件（额外战斗）
   * - shop:     商店事件（消耗货币购买）
   * - blessing: 祝福事件（增益）
   * - curse:    诅咒事件（负面效果 + 补偿奖励）
   * - story:    剧情事件（多选项、分支）
   * - boss:     Boss 事件
   * - special:  特殊事件（节日限定、隐藏事件等）
   */
  category:
    | 'reward'
    | 'battle'
    | 'shop'
    | 'blessing'
    | 'curse'
    | 'story'
    | 'boss'
    | 'special';

  /** 抽取权重（≥ 0，默认 10） */
  weight: number;

  /** 奖励来源引用列表（指向 RewardSource.sourceId） */
  rewardSourceRefs?: string[];

  /** 后续事件引用（该事件完成后可触发的下一个事件池） */
  nextEventRefs?: string[];

  /** 标签（用于分组过滤） */
  tags?: string[];

  /** 触发条件列表（全部满足才可触发） */
  conditions?: EventCondition[];
}

// ---- EventPool ----

/**
 * 事件池。
 *
 * 事件池允许多层引用：
 * - DungeonConfigV2.eventPoolRefs → EventPool.id
 * - DungeonLayerConfig 中各节点通过 eventRefs 直接或间接触发
 *
 * 支持多事件池串联：
 *   eventPoolRefs: ['POOL_EVENT_TIER1', 'POOL_EVENT_TIER2']
 */
export interface EventPool {
  /** 池子唯一 ID */
  id: string;
  /** 配置版本号 */
  version: number;
  /** 多语言名称 Key */
  nameKey: string;
  /** 池中事件 ID 列表（指向 EventConfig.id） */
  eventPoolRefs: string[];
}

// ---- EventResult ----

/**
 * 事件解析结果。
 *
 * 事件解析后的统一产出：
 * - rewards: 强制通过 RewardSource 发放，禁止 Event 直接发奖。
 * - emittedEvents: 本次解析产生的领域事件。
 * - nextEventIds: 可选的后续事件链。
 */
export interface EventResult {
  /** 触发的事件配置 ID */
  eventId: string;

  /** 事件奖励来源（由 DropSystem 统一结算） */
  rewards: RewardSource[];

  /** 本次事件产生的领域事件 */
  emittedEvents: DomainEvent[];

  /** 可选的后续事件链 */
  nextEventIds?: string[];

  /** 事件解决时间戳 */
  completedAt: number;
}

// ---- EventHistoryRecord ----

/**
 * 事件历史记录。
 *
 * 用途：
 * - 审计：追踪玩家在单次 run 中各节点遇到了哪些事件。
 * - 补偿：如果奖励发放异常，可追溯完整事件链路。
 * - 统计：分析玩家事件偏好、选择模式。
 * - 运营分析：哪些事件触发的奖励吸引玩家？哪些事件被跳过较多？
 */
export interface EventHistoryRecord {
  /** 记录唯一 ID */
  id: string;

  /** 所属运行 ID */
  runId: string;

  /** 触发的事件 ID */
  eventId: string;

  /** 所在节点 ID */
  nodeId: string;

  /** 所在层 ID */
  layerId: string;

  /** 关联 ID（与同批次事件串联） */
  correlationId: string;

  /** 本次事件发放的奖励列表 */
  rewards: RewardGrant[];

  /** 记录创建时间戳 */
  createdAt: number;
}

// ---- 工厂函数 ----

/** 生成事件历史记录唯一 ID */
export function generateEventHistoryId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 10);
  return `evh_${ts}_${rand}`;
}

/** 创建空的 EventHistoryRecord 数组 */
export function createDefaultEventHistory(): EventHistoryRecord[] {
  return [];
}
