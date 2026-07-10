// ============================================================
// skill_config.ts — skill_data.json 的 TypeScript 类型定义
// 职责：与 config/skills/skill_data.json 字段严格一一对应
// 规范：零 any / 联合类型约束 / 禁止硬编码
// ============================================================

// ==================== 枚举类型 ====================

/** 技能类型 */
export type SkillType = '普攻' | '主动' | '被动' | '终极';

/** 目标类型 */
export type TargetType = '单体' | '群体' | '自身';

/** 伤害类型 */
export type DamageType = '物理' | '法术' | '真实' | '治疗';

// ==================== 效果条目（C1.5.8-D） ====================

/**
 * 单个技能效果（对应 skill_data.json effects[] 中每一项）
 *
 * skill_data.json 中技能倍率通过 effects[].baseValue 存储，
 * 而非顶层 powerMultiplier。本接口用于兼容两套配置方案。
 */
export interface SkillEffect {
  /** 效果唯一 ID */
  effectId: string;
  /** 效果类型：damage | dot | heal | shield | buff | debuff */
  effectType: string;
  /** 基础数值（伤害倍率 / 治疗量等，1.0 = 100%） */
  baseValue: number;
  /** 每级成长值 */
  valuePerLevel?: number;
  /** 持续时间（毫秒，瞬时效果为 0） */
  durationMs?: number;
}

// ==================== 技能条目 ====================

/**
 * 单条技能配置（对应 skill_data.json data[] 中每一项）
 *
 * 调用示例：
 *   const cfg = ConfigManager.getInstance()
 *     .getConfig<SkillDataConfig>('config/skills/skill_data');
 *   const skills: SkillConfig[] = cfg.data;
 */
export interface SkillConfig {
  /** 技能唯一 ID，格式 SKILL_NNN / SKILL_NNNp(被动) / SKILL_NNNu(终极) */
  id: string;
  /** 技能名称 */
  name: string;
  /** 技能描述 */
  description: string;
  /** 技能类型 */
  type: SkillType;
  /** 目标类型 */
  targetType: TargetType;
  /** 伤害类型 */
  damageType: DamageType;
  /** 伤害/治疗倍率（1.0 = 100%，被动技能填 0） */
  powerMultiplier: number;
  /** 冷却时间（毫秒，普攻和被动填 0） */
  cooldownMs: number;
  /** 效果列表（skill_data.json effects[]，C1.5.8-D 倍率兼容解析） */
  effects?: SkillEffect[];
  /** 能量消耗（普攻和被动填 0） */
  energyCost: number;
  /** 施加的 Buff/Debuff ID 列表（无效果时空数组 []） */
  effectIds: string[];
  /** 效果持续时间（毫秒，瞬时效果或被动填 0） */
  durationMs: number;
  /** 是否被动技能 */
  isPassive: boolean;
  /** 技能最大等级（1–10） */
  maxLevel: number;
  /** 名称本地化 key */
  nameKey: string;
  /** 描述本地化 key */
  descKey: string;
}

// ==================== 顶层结构 ====================

/**
 * skill_data.json 的顶层结构（三层：version / name / data[]）
 * 用于 ConfigManager.getConfig 的类型参数
 */
export interface SkillDataConfig {
  /** 配置格式版本号 */
  version: string;
  /** 配置表名称（调试用） */
  name: string;
  /** 技能数据数组 */
  data: SkillConfig[];
}
