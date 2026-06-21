// ============================================================
// PresentationTypes.ts — 战斗表现层类型定义
// 职责：定义 DamageTextType / BattleFXType / 表现层配置接口
// 位置：battlefx/ 层
// 依赖：无
// 规范：零 any / 仅类型定义 / 不实现逻辑
// ============================================================

import type { BattleUnitType } from '../battle/BattleTypes';

// ==================== 伤害飘字类型 ====================

/**
 * 伤害飘字类型
 *
 * Damage — 普通伤害（白色）
 * Crit   — 暴击伤害（金色/放大）
 * Heal   — 治疗恢复（绿色）
 */
export enum DamageTextType {
  Damage = 'Damage',
  Crit = 'Crit',
  Heal = 'Heal',
}

// ==================== 战斗特效类型 ====================

/**
 * 战斗特效类型
 *
 * Attack — 攻击方特效（挥砍/施法光效）
 * Hit    — 受击方特效（血光/震动）
 * Death  — 死亡特效（消散/破碎）
 * Crit   — 暴击特效（金色闪光）
 */
export enum BattleFXType {
  Attack = 'Attack',
  Hit = 'Hit',
  Death = 'Death',
  Crit = 'Crit',
}

// ==================== 伤害飘字配置 ====================

/**
 * 伤害飘字表现配置
 *
 * 所有数值均可配置，禁止硬编码。
 */
export interface DamageTextConfig {
  /** 普通伤害颜色，默认白色 #FFFFFF */
  damageColor: string;
  /** 暴击伤害颜色，默认金色 #FFD700 */
  critColor: string;
  /** 治疗颜色，默认绿色 #00FF00 */
  healColor: string;
  /** 浮字上升距离（像素），默认 80 */
  floatDistance: number;
  /** 浮字动画时长（秒），默认 1.0 */
  floatDuration: number;
  /** 普通伤害字体大小，默认 32 */
  damageFontSize: number;
  /** 暴击伤害字体大小，默认 42 */
  critFontSize: number;
  /** 治疗字体大小，默认 32 */
  healFontSize: number;
  /** 是否启用暴击字体缩放动画，默认 true */
  critScaleAnimation: boolean;
  /** 暴击缩放倍率，默认 1.3 */
  critScale: number;
}

// ==================== 战斗特效表现配置 ====================

/**
 * 战斗特效表现配置
 */
export interface BattleFXConfig {
  /** 攻击动画时长（秒），默认 0.2 */
  attackDuration: number;
  /** 攻击动画前冲距离（像素），默认 20 */
  attackLungeDistance: number;
  /** 受击动画时长（秒），默认 0.15 */
  hitDuration: number;
  /** 受击震动幅度（像素），默认 5 */
  hitShakeAmplitude: number;
  /** 死亡动画时长（秒），默认 0.5 */
  deathDuration: number;
  /** 是否启用攻击特效闪光，默认 true */
  enableAttackFlash: boolean;
  /** 攻击闪光颜色，默认白色 */
  attackFlashColor: string;
  /** 受击闪烁颜色，默认红色 */
  hitFlashColor: string;
  /** 受击闪烁次数，默认 3 */
  hitFlashCount: number;
  /** 受击闪烁间隔（秒），默认 0.05 */
  hitFlashInterval: number;
}

// ==================== 表现层总配置 ====================

/**
 * 战斗表现层总配置
 */
export interface BattlePresentationConfig {
  /** 伤害飘字配置 */
  damageText: DamageTextConfig;
  /** 战斗特效配置 */
  battleFX: BattleFXConfig;
  /** 对象池初始容量，默认 10 */
  poolCapacity: number;
  /** 是否启用调试日志，默认 false */
  debugLog: boolean;
}

// ==================== 默认配置 ====================

/**
 * 伤害飘字默认配置
 */
export const DEFAULT_DAMAGE_TEXT_CONFIG: DamageTextConfig = {
  damageColor: '#FFFFFF',
  critColor: '#FFD700',
  healColor: '#00FF00',
  floatDistance: 80,
  floatDuration: 1.0,
  damageFontSize: 32,
  critFontSize: 42,
  healFontSize: 32,
  critScaleAnimation: true,
  critScale: 1.3,
};

/**
 * 战斗特效默认配置
 */
export const DEFAULT_BATTLE_FX_CONFIG: BattleFXConfig = {
  attackDuration: 0.2,
  attackLungeDistance: 20,
  hitDuration: 0.15,
  hitShakeAmplitude: 5,
  deathDuration: 0.5,
  enableAttackFlash: true,
  attackFlashColor: '#FFFFFF',
  hitFlashColor: '#FF0000',
  hitFlashCount: 3,
  hitFlashInterval: 0.05,
};

/**
 * 表现层默认总配置
 */
export const DEFAULT_PRESENTATION_CONFIG: BattlePresentationConfig = {
  damageText: { ...DEFAULT_DAMAGE_TEXT_CONFIG },
  battleFX: { ...DEFAULT_BATTLE_FX_CONFIG },
  poolCapacity: 10,
  debugLog: false,
};

// ==================== 伤害飘字生成请求 ====================

/**
 * 伤害飘字生成请求
 *
 * BattleFXManager 根据此请求创建/从池中取出 DamageText 并播放
 */
export interface DamageTextSpawnRequest {
  /** 伤害/治疗值 */
  value: number;
  /** 飘字类型 */
  type: DamageTextType;
  /** 目标世界坐标位置 */
  worldPosition: { x: number; y: number; z: number };
  /** 父节点（通常是战斗场景根节点或 Canvas） */
  parentNode: Node;
}

// ==================== 特效生成请求 ====================

/**
 * 战斗特效生成请求
 */
export interface BattleFXSpawnRequest {
  /** 特效类型 */
  fxType: BattleFXType;
  /** 目标节点（动画将在此节点上执行） */
  targetNode: Node;
  /** 可选：攻击方 unitType（用于区分敌我特效颜色） */
  sourceUnitType?: BattleUnitType;
}
