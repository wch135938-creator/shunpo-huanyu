// ============================================================
// dungeon_config.ts — dungeon_config.json 的 TypeScript 类型定义
// 职责：定义地牢配置模板结构
// 规范：仅定义配置结构，不包含运行时逻辑
// ============================================================

import type { DungeonDifficulty, DungeonRewardType } from './dungeon_types';

/**
 * 单条地牢配置条目（对应 dungeon_config.json data[] 中每一项）。
 */
export interface DungeonConfigEntry {
  /** 地牢唯一 ID */
  dungeonId: number;
  /** Phase7 配置版本号（可选，用于迁移兼容性追踪） */
  configVersion?: number;
  /** 地牢名称 */
  name: string;
  /** 地牢难度 */
  difficulty: DungeonDifficulty;
  /** 体力消耗 */
  staminaCost: number;
  /** 每日最大挑战次数 */
  maxAttemptsPerDay: number;
  /** 掉落表 ID */
  dropTableId: number;
  /** 奖励类型列表 */
  rewardType: DungeonRewardType[];
  /** 总层数 */
  totalLayers: number;
  /** Boss 配置（可选） */
  bossConfig?: {
    bossId: string;
    bossName: string;
    bossLevel: number;
  };
  /** 特殊事件配置（可选） */
  specialEventConfig?: {
    eventId: string;
    eventName: string;
    triggerProbability: number;
  };
}

/**
 * dungeon_config.json 的顶层结构（三层：version / name / data[]）。
 */
export interface DungeonConfigData {
  /** 配置格式版本号 */
  version: string;
  /** 配置表名称（调试用） */
  name: string;
  /** 地牢配置数组 */
  data: DungeonConfigEntry[];
}
