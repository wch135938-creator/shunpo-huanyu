// ============================================================
// SkillTypes.ts — Phase9 SkillSystem 核心类型定义
// 职责：定义技能配置、运行时状态、快照、效果配置与编译结果
// 规范：零 any / 联合类型约束技能类型 / 所有数值可序列化
// ============================================================

// ==================== 枚举类型 ====================

/** 技能类型 */
export type SkillType = '普攻' | '主动' | '被动' | '终极';

/** 目标类型 */
export type TargetType = '单体' | '群体' | '自身';

/** 伤害类型 */
export type DamageType = '物理' | '法术' | '真实' | '治疗';

/** 效果类型 */
export type EffectType = 'damage' | 'heal' | 'buff' | 'debuff' | 'dot' | 'shield';

// ==================== 技能效果配置 ====================

/**
 * 技能效果配置（来自 skill_data.json effects[] 每一项）。
 *
 * 描述一个技能效果的模板参数，由 SkillRuntimeResolver 根据技能等级
 * 编译为 CompiledSkillEffect。
 */
export interface SkillEffectConfig {
  /** 效果唯一 ID（用于引用，如 BUFF_001） */
  effectId: string;
  /** 效果类型 */
  effectType: EffectType;
  /** 基础数值 */
  baseValue: number;
  /** 每级成长数值（level=1 时为 baseValue，level=N 时为 baseValue + valuePerLevel × (N-1)） */
  valuePerLevel: number;
  /** 持续时间（毫秒，0 表示即时效果） */
  durationMs: number;
}

// ==================== 技能配置 ====================

/**
 * 技能配置（对应 skill_data.json 中 data[] 每一项）。
 */
export interface SkillConfig {
  /** 技能唯一 ID，如 skill_001 */
  id: string;
  /** 技能名称 */
  name: string;
  /** 技能类型 */
  type: SkillType;
  /** 目标类型 */
  targetType: TargetType;
  /** 伤害类型 */
  damageType: DamageType;
  /** 冷却时间（毫秒） */
  cooldownMs: number;
  /** 能量消耗 */
  energyCost: number;
  /** 最大等级 */
  maxLevel: number;
  /** 效果配置列表 */
  effects: SkillEffectConfig[];
}

/** skill_data.json 顶层结构 */
export interface SkillDataList {
  /** 配置格式版本号 */
  version: string;
  /** 配置表名称 */
  name: string;
  /** 技能数据数组 */
  data: SkillConfig[];
}

// ==================== 技能运行时状态 ====================

/**
 * 技能运行时状态。
 *
 * 持久化到存档，记录技能当前养成进度。
 */
export interface SkillRuntimeState {
  /** 技能 ID（对应 SkillConfig.id） */
  skillId: string;
  /** 当前等级 */
  level: number;
  /** 是否已解锁 */
  unlocked: boolean;
  /** 解锁时间戳（Unix ms） */
  unlockedAt: number;
  /** 最后更新时间戳 */
  updatedAt: number;
}

// ==================== 编译后的技能效果 ====================

/**
 * 编译后的技能效果。
 *
 * 由 SkillRuntimeResolver 根据 SkillEffectConfig + 技能等级计算得到。
 * 所有数值已锁定，可直接供 BattleSystem 使用。
 */
export interface CompiledSkillEffect {
  /** 效果 ID */
  effectId: string;
  /** 效果类型 */
  effectType: EffectType;
  /** 最终数值（已含等级加成） */
  value: number;
  /** 持续时间（毫秒） */
  durationMs: number;
}

// ==================== 技能运行快照 ====================

/**
 * 技能运行时快照。
 *
 * 在战斗前由 SkillRuntimeResolver 生成，包含技能完整编译结果。
 * 供 BattleUnitFactory / BattleSystem 等消费者使用。
 */
export interface SkillRuntimeSnapshot {
  /** 技能 ID */
  skillId: string;
  /** 技能名称 */
  name: string;
  /** 技能类型 */
  type: SkillType;
  /** 目标类型 */
  targetType: TargetType;
  /** 伤害类型 */
  damageType: DamageType;
  /** 当前等级 */
  level: number;
  /** 冷却时间（毫秒） */
  cooldownMs: number;
  /** 能量消耗 */
  energyCost: number;
  /** 编译后的效果列表 */
  effects: CompiledSkillEffect[];
  /** 快照生成时间戳 */
  capturedAt: number;
}

// ==================== 工厂函数 ====================

/** 创建默认 SkillRuntimeState */
export function createDefaultSkillRuntimeState(skillId: string): SkillRuntimeState {
  return {
    skillId,
    level: 1,
    unlocked: false,
    unlockedAt: 0,
    updatedAt: Date.now(),
  };
}

/** 创建默认 SkillRuntimeSnapshot（空快照） */
export function createEmptySkillSnapshot(skillId: string): SkillRuntimeSnapshot {
  return {
    skillId,
    name: '',
    type: '主动',
    targetType: '单体',
    damageType: '物理',
    level: 1,
    cooldownMs: 0,
    energyCost: 0,
    effects: [],
    capturedAt: Date.now(),
  };
}
