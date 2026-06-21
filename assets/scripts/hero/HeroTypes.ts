// ============================================================
// HeroTypes.ts — Phase9 HeroSystem 核心类型定义
// 职责：定义英雄配置、运行时状态、快照、基础/成长/战斗属性
// 规范：零 any / 枚举约束品质阵营职业元素 / 所有数值可序列化
// ============================================================

// ==================== 枚举类型 ====================
// 复用现有类型定义，避免重复维护
// 来源：hero_config.ts 定义 Quality / Faction / Profession
// 来源：enemy_config.ts 定义 Element

import type { Quality, Faction, Profession } from '../config/hero_config';
import type { Element } from '../config/enemy_config';

/** 英雄稀有度（复用 hero_config.Quality） */
export type HeroQuality = Quality;

/** 阵营（复用 hero_config.Faction） */
export type HeroFaction = Faction;

/** 职业（复用 hero_config.Profession） */
export type HeroProfession = Profession;

/** 元素属性（复用 enemy_config.Element） */
export type HeroElement = Element;

// ==================== 基础属性 ====================

/** 英雄基础属性（配置表初始值） */
export interface HeroBaseStats {
  /** 初始生命值 */
  hp: number;
  /** 初始攻击力 */
  atk: number;
  /** 初始防御力 */
  def: number;
  /** 初始速度 */
  speed: number;
}

/** 英雄成长属性（每级增加值） */
export interface HeroGrowthStats {
  /** 每级生命成长 */
  hp: number;
  /** 每级攻击成长 */
  atk: number;
  /** 每级防御成长 */
  def: number;
}

// ==================== 英雄配置 ====================

/**
 * 英雄配置（对应 hero_data.json 中 data[] 每一项）。
 *
 * 与 hero_config.ts 的 HeroConfig 不同：
 * - 使用 HeroBaseStats / HeroGrowthStats 嵌套结构
 * - 新增 element 元素字段
 * - 使用 defaultSkillIds 代替 skillIds
 * - 只保留 HeroSystem 需要的核心字段
 */
export interface HeroConfig {
  /** 英雄唯一 ID，如 hero_001 */
  id: string;
  /** 英雄名称 */
  name: string;
  /** 稀有度 */
  quality: HeroQuality;
  /** 阵营 */
  faction: HeroFaction;
  /** 职业 */
  profession: HeroProfession;
  /** 元素属性 */
  element: HeroElement;
  /** 基础属性 */
  baseStats: HeroBaseStats;
  /** 成长属性 */
  growthStats: HeroGrowthStats;
  /** 默认携带技能 ID 列表 */
  defaultSkillIds: string[];
  /** 最大等级 */
  maxLevel: number;
}

/** hero_data.json 顶层结构 */
export interface HeroDataList {
  /** 配置格式版本号 */
  version: number;
  /** 配置表名称 */
  name: string;
  /** 英雄数据数组 */
  data: HeroConfig[];
}

// ==================== 英雄运行时状态 ====================

/**
 * 英雄运行时状态。
 *
 * 持久化到存档，记录英雄当前所有养成进度。
 */
export interface HeroRuntimeState {
  /** 英雄 ID（对应 HeroConfig.id） */
  heroId: string;
  /** 当前等级 */
  level: number;
  /** 当前经验值 */
  exp: number;
  /** 当前星级 */
  star: number;
  /** 突破次数 */
  breakthrough: number;
  /** 当前战力缓存（由 PowerSystem 计算） */
  power: number;
  /** 是否已解锁 */
  unlocked: boolean;
  /** 解锁时间戳（Unix ms） */
  unlockedAt: number;
  /** 最后更新时间戳 */
  updatedAt: number;
}

// ==================== 战斗就绪属性 ====================

/**
 * 战斗就绪属性。
 *
 * 由 HeroSnapshotBuilder 整合 ProgressSystem / PowerSystem / EquipmentSystem
 * 派生出可直接用于战斗的最终属性值。
 */
export interface BattleReadyStats {
  /** 最终生命值 */
  hp: number;
  /** 最终攻击力 */
  atk: number;
  /** 最终防御力 */
  def: number;
  /** 最终速度 */
  speed: number;
  /** 最终暴击率 (0.0–1.0) */
  critRate: number;
  /** 最终暴击倍率 */
  critDamage: number;
  /** 总战力 */
  power: number;
}

// ==================== 英雄快照 ====================

/**
 * 英雄快照。
 *
 * 在战斗前生成，包含英雄完整状态与战斗就绪属性。
 * 用于战斗系统、阵容系统、章节系统等消费者。
 */
export interface HeroSnapshot {
  /** 英雄 ID */
  heroId: string;
  /** 英雄名称 */
  name: string;
  /** 稀有度 */
  quality: HeroQuality;
  /** 阵营 */
  faction: HeroFaction;
  /** 职业 */
  profession: HeroProfession;
  /** 元素属性 */
  element: HeroElement;
  /** 等级 */
  level: number;
  /** 星级 */
  star: number;
  /** 突破次数 */
  breakthrough: number;
  /** 技能 ID 列表 */
  skillIds: string[];
  /** 战斗就绪属性 */
  battleReady: BattleReadyStats;
  /** 快照生成时间戳 */
  capturedAt: number;
}

// ==================== 工厂函数 ====================

/** 创建默认 HeroBaseStats */
export function createDefaultHeroBaseStats(): HeroBaseStats {
  return { hp: 100, atk: 20, def: 10, speed: 5 };
}

/** 创建默认 HeroGrowthStats */
export function createDefaultHeroGrowthStats(): HeroGrowthStats {
  return { hp: 50, atk: 10, def: 5 };
}

/** 创建默认 HeroRuntimeState */
export function createDefaultHeroRuntimeState(heroId: string): HeroRuntimeState {
  return {
    heroId,
    level: 1,
    exp: 0,
    star: 1,
    breakthrough: 0,
    power: 0,
    unlocked: false,
    unlockedAt: 0,
    updatedAt: Date.now(),
  };
}

/** 创建默认 BattleReadyStats */
export function createDefaultBattleReadyStats(): BattleReadyStats {
  return {
    hp: 0,
    atk: 0,
    def: 0,
    speed: 0,
    critRate: 0,
    critDamage: 1.5,
    power: 0,
  };
}
