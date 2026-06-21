// ============================================================
// dungeon_data.ts — Phase6 地牢运行时数据结构定义
// 职责：定义地牢实例、运行记录、奖励数据结构
// 规范：仅定义数据结构，不包含业务逻辑
// ============================================================

import type { EquipmentInstanceData } from './equipment_data';

// ---- 奖励相关 ----

/** 单条掉落物品数据 */
export interface DungeonItemData {
  /** 物品 ID */
  itemId: string;
  /** 物品名称 */
  itemName: string;
  /** 数量 */
  count: number;
}

/** 地牢通关/失败奖励数据 */
export interface DungeonRewardData {
  /** 金币数量 */
  gold: number;
  /** 经验数量 */
  exp: number;
  /** 装备实例列表 */
  equipmentList: EquipmentInstanceData[];
  /** 物品列表 */
  itemList: DungeonItemData[];
}

// ---- 地牢实例 ----

/** 单个地牢的玩家进度数据 */
export interface DungeonInstanceData {
  /** 地牢 ID */
  dungeonId: number;
  /** 当前进度层数（0 = 未进入） */
  currentLayer: number;
  /** 已完成的层数列表 */
  completedLayers: number[];
  /** 本次挑战已掉落奖励（未领取时暂存） */
  droppedRewards: DungeonRewardData[];
}

// ---- 运行记录 ----

/** 单次地牢挑战运行记录 */
export interface DungeonRunData {
  /** 玩家 ID */
  playerId: string;
  /** 地牢 ID */
  dungeonId: number;
  /** 开始时间戳 */
  startTime: number;
  /** 结束时间戳（0 = 未结束） */
  endTime: number;
  /** 是否通关 */
  isCleared: boolean;
  /** 失败原因（仅失败时有值） */
  failReason?: string;
  /** 奖励是否已结算 */
  rewardSettled: boolean;
}

// ---- 玩家地牢总数据 ----

/** 玩家地牢总数据（存档根） */
export interface PlayerDungeonData {
  /** 各地牢实例数据 */
  instances: Record<number, DungeonInstanceData>;
  /** 运行历史记录 */
  runHistory: DungeonRunData[];
  /** 各地牢今日挑战次数 */
  todayAttempts: Record<number, number>;
  /** 上次挑战日期（用于每日重置），格式 YYYY-MM-DD */
  lastAttemptDate: string;
  /** 当前体力 */
  currentStamina: number;
  /** 最大体力 */
  maxStamina: number;
}

// ---- 工厂函数 ----

/** 创建默认地牢实例数据 */
export function createDefaultDungeonInstanceData(dungeonId: number): DungeonInstanceData {
  return {
    dungeonId,
    currentLayer: 0,
    completedLayers: [],
    droppedRewards: [],
  };
}

/** 创建默认玩家地牢总数据 */
export function createDefaultPlayerDungeonData(): PlayerDungeonData {
  return {
    instances: {},
    runHistory: [],
    todayAttempts: {},
    lastAttemptDate: '',
    currentStamina: 100,
    maxStamina: 100,
  };
}

/** 创建空地牢奖励数据 */
export function createEmptyDungeonRewardData(): DungeonRewardData {
  return {
    gold: 0,
    exp: 0,
    equipmentList: [],
    itemList: [],
  };
}

/** 创建 DungeonRunData 的快照副本 */
export function cloneDungeonRunData(data: DungeonRunData): DungeonRunData {
  return {
    ...data,
    failReason: data.failReason,
  };
}
