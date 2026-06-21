// ============================================================
// EnemyTypes.ts — Phase9 EnemySystem 核心类型定义
// 职责：定义敌人配置、敌人组配置、Boss配置、EnemySnapshot
// 规范：零 any / 联合类型约束 / 所有数值可序列化
// ============================================================

import type { Faction } from '../config/hero_config';
import type { Element } from '../config/enemy_config';

// ==================== 枚举类型 ====================

/**
 * 敌人品质。
 *
 * normal  — 普通怪（常规战斗）
 * elite   — 精英怪（高难度战斗）
 * boss    — Boss（Boss 战斗 / 章节 Boss）
 */
export type EnemyQuality = 'normal' | 'elite' | 'boss';

// ==================== 基础属性 ====================

/**
 * 敌人基础属性（配置表初始值）。
 *
 * Boss/精英可额外配置 critRate/critDamage，
 * 普通怪默认不留这两个字段。
 */
export interface EnemyBaseStats {
  /** 生命值 */
  hp: number;
  /** 攻击力 */
  atk: number;
  /** 防御力 */
  def: number;
  /** 速度 */
  speed: number;
  /** 暴击率 (0.0–1.0)，可选 */
  critRate?: number;
  /** 暴击倍率，可选 */
  critDamage?: number;
}

// ==================== 敌人配置 ====================

/**
 * 敌人配置（对应 enemy_data.json 中 data[] 每一项）。
 *
 * 与旧版 config/stages/enemy_data.json 的 EnemyEntry 不同：
 *   - 使用 EnemyBaseStats 嵌套结构统一属性
 *   - 使用 quality 字段统一表示 normal/elite/boss
 *   - 使用 dropGroup 代替 dropId（支持多掉落表组合）
 */
export interface EnemyConfig {
  /** 敌人唯一 ID，如 enemy_001 */
  id: string;
  /** 敌人显示名称 */
  name: string;
  /** 元素属性：火 / 冰 / 雷 / 毒 / 光 / 暗 */
  element: Element;
  /** 阵营：青龙 / 白虎 / 朱雀 / 玄武 / 混沌 */
  faction: Faction;
  /** 敌人品质：normal / elite / boss */
  quality: EnemyQuality;
  /** 敌人等级 */
  level: number;
  /** 基础属性 */
  baseStats: EnemyBaseStats;
  /** 技能 ID 列表（第一个通常为普攻） */
  skillIds: string[];
  /** 掉落组 ID（引用掉落配置） */
  dropGroup: string;
}

/** enemy_data.json 顶层结构 */
export interface EnemyDataList {
  /** 配置格式版本号 */
  version: number;
  /** 配置表名称 */
  name: string;
  /** 敌人数据数组 */
  data: EnemyConfig[];
}

// ==================== Boss 配置 ====================

/**
 * Boss 配置（对应 boss_data.json 中 data[] 每一项）。
 *
 * 与旧版 config/systems/boss_config.json 的 BossConfig 不同：
 *   - 使用 EnemyBaseStats 嵌套结构统一属性
 *   - 使用 name 代替 nameKey（非本地化纯文本）
 *   - 使用 skillIds[] 代替 skills: BossSkillEntry[]
 *   - 使用 dropGroup 代替 drops: BossDropEntry[]
 */
export interface BossConfig {
  /** Boss 唯一 ID，如 boss_001 */
  id: string;
  /** Boss 显示名称 */
  name: string;
  /** 元素属性 */
  element: Element;
  /** 阵营 */
  faction: Faction;
  /** 等级 */
  level: number;
  /** 基础属性（含 boss 专属的 critRate/critDamage） */
  baseStats: EnemyBaseStats;
  /** 技能 ID 列表 */
  skillIds: string[];
  /** 掉落组 ID */
  dropGroup: string;
  /** 所属地牢/关卡 ID 列表 */
  dungeonRefs: string[];
}

/** boss_data.json 顶层结构 */
export interface BossDataList {
  /** 配置格式版本号 */
  version: number;
  /** 配置表名称 */
  name: string;
  /** Boss 数据数组 */
  data: BossConfig[];
}

// ==================== 敌人组配置 ====================

/**
 * 敌人组配置。
 *
 * 定义一波/一组敌人的组合，包含多个敌人 ID 和阵型信息。
 * 供 ChapterSystem / DungeonSystem / Roguelike 使用。
 */
export interface EnemyGroupConfig {
  /** 敌人组唯一 ID，如 group_001 */
  id: string;
  /** 敌人组名称（调试用） */
  name: string;
  /** 敌人 ID 列表 */
  enemyIds: string[];
  /** 阵型：5 个位置对应的敌人 ID 索引（-1 表示空位） */
  formation: number[];
}

// ==================== 敌人快照 ====================

/**
 * 敌人快照。
 *
 * 在战斗前由 EnemySystem 从 EnemyConfig 生成。
 * 包含战斗系统所需的所有信息，可序列化。
 * 供 BattleManager / BattleUnitFactory 使用。
 */
export interface EnemySnapshot {
  /** 敌人 ID（对应 EnemyConfig.id） */
  enemyId: string;
  /** 敌人显示名称 */
  name: string;
  /** 元素属性 */
  element: Element;
  /** 阵营 */
  faction: Faction;
  /** 敌人品质 */
  quality: EnemyQuality;
  /** 等级 */
  level: number;
  /** 基础属性 */
  baseStats: EnemyBaseStats;
  /** 技能 ID 列表 */
  skillIds: string[];
  /** 掉落组 ID */
  dropGroup: string;
  /** 快照生成时间戳 */
  capturedAt: number;
}

// ==================== 工厂函数 ====================

/** 创建默认 EnemyBaseStats */
export function createDefaultEnemyBaseStats(): EnemyBaseStats {
  return { hp: 100, atk: 20, def: 10, speed: 50 };
}

/** 创建默认 EnemyBaseStats（含暴击字段） */
export function createDefaultEliteBaseStats(): EnemyBaseStats {
  return { hp: 300, atk: 40, def: 20, speed: 60, critRate: 0.05, critDamage: 1.5 };
}

/** 创建默认 EnemyBaseStats（Boss 级别） */
export function createDefaultBossBaseStats(): EnemyBaseStats {
  return { hp: 1000, atk: 80, def: 40, speed: 80, critRate: 0.1, critDamage: 2.0 };
}

/** 创建默认 EnemyGroupConfig */
export function createDefaultEnemyGroupConfig(id: string, name: string): EnemyGroupConfig {
  return {
    id,
    name,
    enemyIds: [],
    formation: [-1, -1, -1, -1, -1],
  };
}
