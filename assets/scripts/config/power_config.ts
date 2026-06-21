// ============================================================
// power_config.ts — power_config.json 的 TypeScript 类型定义
// 职责：定义 Phase4A 战力计算权重配置
// 规范：仅定义配置结构，不包含战力计算逻辑
// ============================================================

import type { Quality } from './hero_config';

/**
 * 单组战力权重配置。
 */
export interface PowerConfig {
  /** 配置组 ID */
  id: string;
  /** Phase7 配置版本号（可选，用于迁移兼容性追踪） */
  configVersion?: number;
  /** 生命权重 */
  hpWeight: number;
  /** 攻击权重 */
  atkWeight: number;
  /** 防御权重 */
  defWeight: number;
  /** 速度权重 */
  speedWeight: number;
  /** 品质战力倍率 */
  qualityMultiplier: Record<Quality, number>;
  /** 装备品质战力倍率（Phase4B），key 为 EquipmentQuality */
  equipmentQualityMultiplier: Record<string, number>;
}

/**
 * power_config.json 的顶层结构（三层：version / name / data[]）。
 */
export interface PowerConfigData {
  /** 配置格式版本号 */
  version: string;
  /** 配置表名称（调试用） */
  name: string;
  /** 战力权重配置数组 */
  data: PowerConfig[];
}
