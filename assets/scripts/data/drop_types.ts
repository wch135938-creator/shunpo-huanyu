// ============================================================
// drop_types.ts — Phase6-Step2 掉落系统运行时数据结构定义
// 职责：定义 DropResultData、DropHistoryEntry、DropClaimResult
// Phase7-Step4: 新增 DropHistoryRecord、PitySnapshot、PityRule、RewardConfig 类型
// 规范：仅定义数据结构，不包含业务逻辑
// ============================================================

import type { EquipmentInstanceData } from './equipment_data';
import type { RewardGrant } from './roguelike_types';

// ---- 枚举 ----

/** 掉落结果物品类型 */
export enum DropResultItemType {
  Gold = 'Gold',
  Exp = 'Exp',
  Equipment = 'Equipment',
  Item = 'Item',
}

// ---- 掉落结果 ----

/** 单条掉落结果条目（非装备类物品） */
export interface DropResultItemEntry {
  /** 物品 ID */
  itemId: string;
  /** 物品类型 */
  itemType: DropResultItemType;
  /** 数量 */
  quantity: number;
}

/**
 * 单次掉落完整结果。
 *
 * 说明：
 * - gold / exp 为数值型奖励汇总。
 * - equipmentList 包含已创建的装备实例（uid 有效）。
 * - itemList 包含非装备类物品（材料、抽卡碎片、钻石等）。
 * - claimStatus 表示是否已领取；false 时奖励尚未发放到玩家账户。
 * - rollDrop() 生成时 claimStatus = false；claimDrop() 后变为 true。
 */
export interface DropResultData {
  /** 金币数量 */
  gold: number;
  /** 经验数量 */
  exp: number;
  /** 装备实例列表（已通过 EquipmentSystem 创建） */
  equipmentList: EquipmentInstanceData[];
  /** 非装备物品列表 */
  itemList: DropResultItemEntry[];
  /** 掉落来源标识（如 "dungeon_1"、"event_boss_3"） */
  dropSourceId: string;
  /** 是否已领取 */
  claimStatus: boolean;
  /** 掉落生成时间戳（Date.now()） */
  timestamp: number;
}

// ---- 掉落历史 ----

/** 掉落历史记录（用于存档与查询） */
export interface DropHistoryEntry {
  /** 玩家 ID */
  playerId: string;
  /** 掉落表 ID（批量时为逗号分隔） */
  dropTableIds: string;
  /** 掉落来源标识 */
  sourceId: string;
  /** 掉落结果 */
  result: DropResultData;
}

// ---- 领取结果 ----

/** claimDrop 返回结果 */
export interface DropClaimResult {
  /** 是否领取成功 */
  success: boolean;
  /** 失败原因 */
  reason?: string;
  /** 本次领取的金币 */
  goldClaimed: number;
  /** 本次领取的经验（按英雄平分） */
  expClaimed: number;
  /** 本次记录的装备实例数 */
  equipmentCount: number;
  /** 本次记录的物品数 */
  itemCount: number;
}

// ---- Phase7-Step4: 掉落历史与保底类型 ----

/**
 * 保底奖励配置。
 *
 * 用于 PityRule 中定义保底触发时的额外奖励。
 */
export interface RewardConfig {
  /** 奖励类型 */
  rewardType: 'gold' | 'exp' | 'equipment' | 'item' | 'currency';
  /** 物品/装备 ID（equipment/item/currency 类型时必填） */
  itemId?: string;
  /** 数量 */
  quantity: number;
}

/**
 * 保底规则。
 *
 * 每个来源类型可以有独立的保底规则。
 * - sourceType: 对应 RewardSource.sourceType
 * - guaranteeThreshold: 触发保底所需次数
 * - extraReward: 保底触发时发放的额外奖励
 */
export interface PityRule {
  /** 保底规则唯一 ID */
  id: string;
  /** 来源类型（对应 RewardSource.sourceType） */
  sourceType: string;
  /** 保底触发阈值（累计多少次触发保底） */
  guaranteeThreshold: number;
  /** 保底触发时发放的额外奖励 */
  extraReward?: RewardConfig;
}

/**
 * 保底快照。
 *
 * 记录某个时间点的保底计数器状态。
 * - pityCounters: 按维度 Key 存储的计数（如 "pity_dungeon_boss", "pity_dungeon_event"）
 * - lastResetAt: 上次重置时间戳（用于日重置等场景）
 */
export interface PitySnapshot {
  /** 保底计数器（key → 累计次数） */
  pityCounters: Record<string, number>;
  /** 上次重置时间戳 */
  lastResetAt: number;
}

/**
 * Phase7 掉落历史记录。
 *
 * 与 Phase6 DropHistoryEntry 的区别：
 * - 增加 sourceType 区分掉落来源类型
 * - 增加 dropTableVersion / seed 用于审计与回放
 * - 增加 pityBefore / pityAfter 记录保底状态变化
 * - rewards 使用 RewardGrant[] 而非 DropResultData，实现统一奖励抽象
 */
export interface DropHistoryRecord {
  /** 记录唯一 ID */
  id: string;
  /** 玩家 ID */
  playerId: string;
  /** 来源标识 */
  sourceId: string;
  /** 来源类型（dungeon_node | dungeon_boss | dungeon_event | quest | achievement | shop | compensation | season） */
  sourceType: string;
  /** 掉落表配置版本号 */
  dropTableVersion: number;
  /** 结算随机种子 */
  seed: string;
  /** 本次结算获得的奖励列表 */
  rewards: RewardGrant[];
  /** 结算前保底状态 */
  pityBefore: PitySnapshot;
  /** 结算后保底状态（含本次更新后的计数） */
  pityAfter: PitySnapshot;
  /** 记录创建时间戳 */
  createdAt: number;
}

// ---- 工厂函数 ----

/** 创建空 DropResultData */
export function createEmptyDropResultData(sourceId: string): DropResultData {
  return {
    gold: 0,
    exp: 0,
    equipmentList: [],
    itemList: [],
    dropSourceId: sourceId,
    claimStatus: false,
    timestamp: Date.now(),
  };
}

// ---- Phase7-Step4 工厂函数 ----

/** 创建空 PitySnapshot */
export function createEmptyPitySnapshot(): PitySnapshot {
  return {
    pityCounters: {},
    lastResetAt: Date.now(),
  };
}

/** 生成 DropHistoryRecord 唯一 ID */
export function generateDropHistoryRecordId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 8);
  return `dhr_${ts}_${rand}`;
}

/**
 * 将 DropResultData 转换为 RewardGrant 列表。
 *
 * 用于 DropSystem.settleBatch 中将旧版掉落结果统一为 RewardGrant 格式。
 */
export function convertDropResultToRewardGrants(result: DropResultData): RewardGrant[] {
  const grants: RewardGrant[] = [];
  const src = result.dropSourceId;

  if (result.gold > 0) {
    grants.push({
      rewardId: `${src}_gold_${Date.now()}`,
      rewardType: 'gold',
      quantity: result.gold,
      sourceId: src,
      granted: false,
    });
  }

  if (result.exp > 0) {
    grants.push({
      rewardId: `${src}_exp_${Date.now()}`,
      rewardType: 'exp',
      quantity: result.exp,
      sourceId: src,
      granted: false,
    });
  }

  for (const equip of result.equipmentList) {
    grants.push({
      rewardId: `${src}_equip_${equip.uid}`,
      rewardType: 'equipment',
      quantity: 1,
      sourceId: src,
      granted: false,
    });
  }

  for (const item of result.itemList) {
    grants.push({
      rewardId: `${src}_item_${item.itemId}`,
      rewardType: 'item',
      quantity: item.quantity,
      sourceId: src,
      granted: false,
    });
  }

  return grants;
}
