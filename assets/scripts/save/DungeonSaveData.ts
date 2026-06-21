// ============================================================
// DungeonSaveData — Phase6 地牢存档数据结构
// 职责：定义地牢相关的持久化字段
// 位置：Save 层
// ============================================================

import type { DungeonInstanceData, DungeonRunData } from '../data/dungeon_data';

/**
 * 地牢存档数据。
 *
 * 说明：
 * - instances 保存各地牢的玩家进度（dungeonId → DungeonInstanceData）。
 * - runHistory 保存所有地牢挑战记录。
 * - todayAttempts 保存今日各地牢挑战次数，用于每日限制校验。
 * - currentStamina / maxStamina 保存体力状态。
 */
export interface DungeonSaveData {
  /** 地牢实例映射 */
  instances: Record<number, DungeonInstanceData>;
  /** 运行历史记录 */
  runHistory: DungeonRunData[];
  /** 今日尝试次数 */
  todayAttempts: Record<number, number>;
  /** 上次挑战日期 YYYY-MM-DD */
  lastAttemptDate: string;
  /** 当前体力 */
  currentStamina: number;
  /** 最大体力 */
  maxStamina: number;
}

/** 创建默认地牢存档数据 */
export function createDefaultDungeonSaveData(): DungeonSaveData {
  return {
    instances: {},
    runHistory: [],
    todayAttempts: {},
    lastAttemptDate: '',
    currentStamina: 100,
    maxStamina: 100,
  };
}
