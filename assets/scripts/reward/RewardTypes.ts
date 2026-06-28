// ============================================================
// RewardTypes.ts — 奖励系统类型定义
// 职责：定义所有奖励相关接口/类型/枚举
// 位置：reward/ 层
// 规范：零 any / 仅接口定义 / 不实现逻辑
// 依赖：drop_config (ItemType)
// ============================================================

import type { ItemType } from '../config/drop_config';

// ==================== 奖励来源 ====================

/** 奖励来源标识（Step4 内部） */
export type RewardSourceType =
  | 'chapter'
  | 'event'
  | 'enemy'
  | 'battle'
  | 'pool'
  | 'mail'
  | 'redeem'
  | 'login';

// ==================== Phase7 兼容类型 ====================

/**
 * Phase7 RewardSource.sourceType → Step4 RewardSourceType 映射。
 *
 * Phase7 的 sourceType 为完整字符串（如 "dungeon_boss", "dungeon_event"），
 * Step4 的 RewardSourceType 为简写形式（如 "enemy", "event"）。
 *
 * 此映射表确保两条链路可互操作，避免奖励系统分叉。
 */
export const Phase7ToStep4SourceTypeMap: Record<string, RewardSourceType> = {
  dungeon_boss: 'enemy',
  dungeon_event: 'event',
  dungeon_node: 'battle',
  quest: 'chapter',
  achievement: 'chapter',
  shop: 'pool',
  compensation: 'pool',
  season: 'chapter',
};

/**
 * Step4 RewardSourceType → Phase7 sourceType 反向映射。
 */
export const Step4ToPhase7SourceTypeMap: Record<RewardSourceType, string> = {
  battle: 'dungeon_node',
  chapter: 'dungeon_node',
  event: 'dungeon_event',
  enemy: 'dungeon_boss',
  pool: 'dungeon_node',
  mail: 'compensation',
  redeem: 'compensation',
  login: 'season',
};

/**
 * 将 Phase7 奖励来源类型字符串映射到 Step4 RewardSourceType。
 *
 * @param phase7SourceType — Phase7 的 sourceType（如 "dungeon_boss"）
 * @returns Step4 RewardSourceType，未知时返回 'battle'
 */
export function mapPhase7SourceType(phase7SourceType: string): RewardSourceType {
  return Phase7ToStep4SourceTypeMap[phase7SourceType] ?? 'battle';
}

/**
 * 将 Step4 RewardSourceType 反向映射到 Phase7 来源类型字符串。
 *
 * @param step4SourceType — Step4 的 RewardSourceType
 * @returns Phase7 sourceType 字符串
 */
export function mapStep4ToPhase7SourceType(step4SourceType: RewardSourceType): string {
  return Step4ToPhase7SourceTypeMap[step4SourceType] ?? 'dungeon_node';
}

// ==================== 奖励条目 ====================

/**
 * 单条奖励
 *
 * 所有奖励发放的原子单元。
 * 由 RewardSystem / RewardSettlement 聚合产生。
 */
export interface RewardEntry {
  /** 物品 ID */
  itemId: string;
  /** 物品类型 */
  itemType: ItemType;
  /** 获得数量 */
  count: number;
  /** 奖励来源 */
  source: RewardSourceType;
  /** 来源标识（chapterId / eventId / enemyId / stageId） */
  sourceId: string;
}

// ==================== 奖励记录 ====================

/**
 * 奖励历史记录
 *
 * 记录每次奖励发放的完整信息，供 RewardHistoryPanel 展示。
 *
 * Phase10-Step4-Fix: 新增 poolId / seed / configVersion / transactionId 审计字段。
 */
export interface RewardHistoryRecord {
  /** 记录 ID（时间戳 + 事务 ID） */
  recordId: string;
  /** 奖励来源 */
  source: RewardSourceType;
  /** 来源标识 */
  sourceId: string;
  /** 奖励条目列表 */
  rewards: RewardEntry[];
  /** 发放时间戳（Unix ms） */
  grantedAt: number;
  /** [新增] 奖励池 ID（随机池发奖时填充） */
  poolId?: string;
  /** [新增] 随机种子（可复现抽取结果） */
  seed?: string;
  /** [新增] 配置文件版本号 */
  configVersion?: string;
  /** [新增] 发奖事务 ID（幂等性关键字段） */
  transactionId?: string;
}

// ==================== 存档数据类型 ====================

/**
 * 单条领取状态记录。
 *
 * Key = `${sourceType}:${sourceId}`（如 "chapter:CH_001"）
 */
export interface RewardClaimStateEntry {
  /** 是否已领取 */
  claimed: boolean;
  /** 领取时间戳（Unix ms） */
  claimedAt: number;
  /** 领取时的事务 ID */
  transactionId: string;
}

/**
 * 单条奖励快照（随机奖励复盘用）。
 *
 * 记录随机奖励抽取时的完整上下文，支持配置变更后的结果复盘。
 */
export interface RewardSnapshotEntry {
  /** 快照唯一 ID */
  snapshotId: string;
  /** 奖励来源类型 */
  sourceType: RewardSourceType;
  /** 来源标识 */
  sourceId: string;
  /** 奖励池 ID */
  poolId: string;
  /** 使用的随机种子 */
  seed: string;
  /** 配置文件版本号 */
  configVersion: string;
  /** 抽取结果 */
  rewards: RewardEntry[];
  /** 快照创建时间戳（Unix ms） */
  createdAt: number;
  /** 关联的事务 ID */
  transactionId: string;
}

/**
 * 奖励系统存档数据（SaveV2 可选字段）
 *
 * 自动补全，不触发迁移，不升级版本号。
 *
 * Phase10-Step4-Fix: 新增 claimState / rewardSnapshots / lastTransactionId 字段。
 */
export interface RewardSaveData {
  /** 最近一次奖励发放时间戳（Unix ms） */
  lastRewardTime: number;
  /** 最近奖励历史（最多保留 50 条） */
  recentRewards: RewardHistoryRecord[];
  /** [新增] 奖励领取状态（key = "sourceType:sourceId"） */
  claimState?: Record<string, RewardClaimStateEntry>;
  /** [新增] 随机奖励快照（最多保留 100 条，用于审计复盘） */
  rewardSnapshots?: RewardSnapshotEntry[];
  /** [新增] 最近一次奖励事务 ID（冗余字段，与 SaveMetaV2 同步） */
  lastTransactionId?: string;
}

/** 创建默认奖励存档数据 */
export function createDefaultRewardSaveData(): RewardSaveData {
  return {
    lastRewardTime: 0,
    recentRewards: [],
    claimState: {},
    rewardSnapshots: [],
    lastTransactionId: '',
  };
}

// ==================== 配置数据类型 ====================

/**
 * 物品奖励条目（配置层）
 */
export interface ItemRewardEntry {
  itemId: string;
  count: number;
}

/**
 * 章节奖励配置条目
 */
export interface ChapterRewardEntry {
  chapterId: string;
  gold: number;
  exp: number;
  itemRewards: ItemRewardEntry[];
}

/**
 * 章节奖励配置容器
 */
export interface ChapterRewardConfig {
  version: number;
  name: string;
  rewards: ChapterRewardEntry[];
}

/**
 * 事件奖励配置条目
 */
export interface EventRewardEntry {
  eventId: string;
  gold: number;
  exp: number;
  itemRewards: ItemRewardEntry[];
}

/**
 * 事件奖励配置容器
 */
export interface EventRewardConfig {
  version: number;
  name: string;
  rewards: EventRewardEntry[];
}

/**
 * 动态敌人奖励配置条目
 */
export interface EnemyRewardEntry {
  enemyId: string;
  gold: number;
  exp: number;
}

/**
 * 动态敌人奖励配置容器
 */
export interface EnemyRewardConfig {
  version: number;
  name: string;
  rewards: EnemyRewardEntry[];
}

/**
 * 奖励池模式
 *
 * weighted_one  — 按权重抽 1 个
 * weighted_many — 按权重抽多个（每个条目独立按 weight/totalWeight 概率判定）
 *                 注意：这不是保底掉落，各条目独立判定，可能导致 0~N 个产出。
 * all           — 全部产出
 */
export type RewardPoolMode = 'weighted_one' | 'weighted_many' | 'all';

/**
 * 奖励池条目
 */
export interface RewardPoolEntry {
  itemId: string;
  itemType: string;
  count: number;
  weight: number;
}

/**
 * 奖励池配置
 */
export interface RewardPoolItem {
  id: string;
  mode: RewardPoolMode;
  entries: RewardPoolEntry[];
}

/**
 * 奖励池配置容器
 */
export interface RewardPoolConfig {
  version: number;
  name: string;
  pools: RewardPoolItem[];
}

// ==================== 聚合奖励 ====================

/**
 * 聚合后的奖励摘要
 *
 * 由 RewardSystem.buildReward() 产出，
 * 将多条 RewardEntry 按 itemId 合并。
 */
export interface AggregatedReward {
  /** itemId → 总数量 */
  items: Record<string, number>;
  /** 总金币 */
  totalGold: number;
  /** 总经验 */
  totalExp: number;
  /** 原始奖励列表 */
  rawRewards: RewardEntry[];
}

// ==================== 事务/幂等类型 ====================

/**
 * 奖励发放事务 ID。
 *
 * 格式：txn_{sourceType}_{sourceId}_{timestamp}_{random}
 * 示例：txn_chapter_CH_001_1717000000000_a3f2
 */
export type RewardTransactionId = string;

/**
 * 生成奖励事务 ID。
 *
 * @param sourceType — 奖励来源类型
 * @param sourceId   — 来源标识
 * @returns 唯一事务 ID
 */
export function generateTransactionId(
  sourceType: RewardSourceType,
  sourceId: string,
): RewardTransactionId {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `txn_${sourceType}_${sourceId}_${ts}_${rand}`;
}

/**
 * 构建领取状态 Key。
 *
 * @param sourceType — 奖励来源类型
 * @param sourceId   — 来源标识
 * @returns 领取状态 Key（如 "chapter:CH_001"）
 */
export function buildClaimStateKey(sourceType: RewardSourceType, sourceId: string): string {
  return `${sourceType}:${sourceId}`;
}

// ==================== 结算结果类型 ====================

/**
 * 奖励结算结果（区分预览与确认发放）。
 *
 * Phase10-Step4-Fix: 将 settle* 方法的返回值从单纯的 AggregatedReward | null
 * 升级为结构化结果，包含事务 ID 和幂等信息。
 */
export interface RewardSettleResult {
  /** 是否成功 */
  success: boolean;
  /** 聚合后的奖励摘要 */
  aggregated: AggregatedReward | null;
  /** 发奖事务 ID（成功时总是存在） */
  transactionId: string;
  /** 是否重复领取（幂等拦截） */
  isDuplicate: boolean;
  /** 额外信息（如拦截原因） */
  reason?: string;
}

// ==================== 配置校验结果 ====================

/**
 * 奖励池配置校验结果。
 */
export interface PoolValidationResult {
  /** 是否通过 */
  valid: boolean;
  /** 池 ID */
  poolId: string;
  /** 问题列表 */
  issues: string[];
}
