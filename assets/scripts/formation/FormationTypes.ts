// ============================================================
// FormationTypes.ts — Phase9 FormationSystem 核心类型定义
// 职责：定义阵容模式、槽位、预设、存档与 TeamSnapshot
// 规范：零 any / 联合类型约束模式 / 所有数值可序列化
// ============================================================

import type { HeroSnapshot } from '../hero/HeroTypes';
import type { SkillRuntimeSnapshot } from '../skill/SkillTypes';

// ==================== 枚举类型 ====================

/**
 * 阵容模式。
 *
 * 核心模式（Phase9 实现）：
 * - pve:      PVE 推图阵容
 * - dungeon:  Dungeon 副本阵容
 * - roguelike: Roguelike 阵容
 * - boss:     Boss 战阵容
 *
 * 预留模式（Phase9-Step6+ 实现）：
 * - pvp_attack:  PVP 进攻阵容
 * - pvp_defense: PVP 防守阵容
 * - world_boss:  世界 Boss 阵容
 * - guild_boss:  公会 Boss 阵容
 */
export type FormationMode =
  | 'pve'
  | 'dungeon'
  | 'roguelike'
  | 'boss'
  | 'pvp_attack'
  | 'pvp_defense'
  | 'world_boss'
  | 'guild_boss';

/** 核心阵容模式（Phase9 当前实现） */
export const CORE_FORMATION_MODES: FormationMode[] = [
  'pve',
  'dungeon',
  'roguelike',
  'boss',
];

/** 预留阵容模式 */
export const RESERVED_FORMATION_MODES: FormationMode[] = [
  'pvp_attack',
  'pvp_defense',
  'world_boss',
  'guild_boss',
];

/** 阵容总槽位数（前排 2 + 后排 3） */
export const FORMATION_SLOT_COUNT = 5;

/** 前排槽位索引范围 */
export const FRONT_ROW_START = 0;
export const FRONT_ROW_END = 1;

/** 后排槽位索引范围 */
export const BACK_ROW_START = 2;
export const BACK_ROW_END = 4;

// ==================== 阵容槽位 ====================

/**
 * 阵容槽位。
 *
 * 5 个槽位：索引 0-1 为前排，索引 2-4 为后排。
 * heroId 为 null 表示空槽位。
 */
export interface FormationSlot {
  /** 槽位索引 (0–4) */
  slotIndex: number;
  /** 英雄 ID，空槽位为 null */
  heroId: string | null;
}

// ==================== 阵容预设 ====================

/**
 * 阵容预设。
 *
 * 存储一个特定模式下的阵容配置。
 * 每个模式可以有多个预设（如 "主线推图"、"速刷队"）。
 */
export interface FormationPreset {
  /** 预设唯一 ID（如 "default_pve"） */
  id: string;
  /** 预设名称（玩家可自定义） */
  name: string;
  /** 阵容模式 */
  mode: FormationMode;
  /** 5 个槽位 */
  slots: FormationSlot[];
  /** 阵容总战力（缓存值，由 TeamSnapshotBuilder 计算） */
  teamPower: number;
  /** 创建时间戳（Unix ms） */
  createdAt: number;
  /** 最后更新时间戳 */
  updatedAt: number;
}

// ==================== 阵容快照 ====================

/**
 * 阵容快照。
 *
 * 在战斗前由 TeamSnapshotBuilder 生成，包含阵容完整状态。
 * 供 BattleUnitFactory / BattleManager / ChapterSystem 等消费者使用。
 *
 * 要求：可序列化、可用于战斗层、不依赖 UI。
 */
export interface TeamSnapshot {
  /** 阵容模式 */
  mode: FormationMode;
  /** 来源预设 ID */
  presetId: string;
  /** 上场英雄 ID 列表（仅非空槽位） */
  heroIds: string[];
  /** 英雄快照列表 */
  heroSnapshots: HeroSnapshot[];
  /** 技能快照列表（所有上场英雄装备的技能） */
  skillSnapshots: SkillRuntimeSnapshot[];
  /** 阵容总战力 */
  teamPower: number;
  /** 快照生成时间戳 */
  capturedAt: number;
}

// ==================== 校验结果 ====================

/**
 * 阵容校验结果。
 */
export interface FormationValidationResult {
  /** 是否通过校验 */
  valid: boolean;
  /** 错误信息列表 */
  errors: string[];
  /** 警告信息列表 */
  warnings: string[];
}

// ==================== 工厂函数 ====================

/** 创建空阵容槽位 */
export function createEmptySlots(): FormationSlot[] {
  const slots: FormationSlot[] = [];
  for (let i = 0; i < FORMATION_SLOT_COUNT; i++) {
    slots.push({ slotIndex: i, heroId: null });
  }
  return slots;
}

/** 创建默认阵容预设 */
export function createDefaultFormationPreset(
  id: string,
  name: string,
  mode: FormationMode,
): FormationPreset {
  return {
    id,
    name,
    mode,
    slots: createEmptySlots(),
    teamPower: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/** 创建空校验结果 */
export function createEmptyValidationResult(): FormationValidationResult {
  return {
    valid: true,
    errors: [],
    warnings: [],
  };
}

/** 判断是否为有效的前排槽位索引 */
export function isFrontRowSlot(slotIndex: number): boolean {
  return slotIndex >= FRONT_ROW_START && slotIndex <= FRONT_ROW_END;
}

/** 判断是否为有效的后排槽位索引 */
export function isBackRowSlot(slotIndex: number): boolean {
  return slotIndex >= BACK_ROW_START && slotIndex <= BACK_ROW_END;
}

/** 判断是否为有效槽位索引 */
export function isValidSlotIndex(slotIndex: number): boolean {
  return slotIndex >= 0 && slotIndex < FORMATION_SLOT_COUNT;
}

/** 判断阵容模式是否为核心模式 */
export function isCoreFormationMode(mode: FormationMode): boolean {
  return CORE_FORMATION_MODES.includes(mode);
}
