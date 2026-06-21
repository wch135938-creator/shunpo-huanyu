// ============================================================
// EquipmentSaveData — Phase4B 装备存档数据结构
// 职责：定义装备相关的持久化字段
// 位置：Save 层
// ============================================================

import type { EquipmentInstanceData } from '../data/equipment_data';
import type { HeroEquipmentData } from '../data/equipment_data';

/**
 * 装备存档数据。
 *
 * 说明：
 * - instances 保存所有装备实例（uid → 实例数据）。
 * - heroEquipment 保存每个英雄的穿戴状态（heroId → HeroEquipmentData）。
 */
export interface EquipmentSaveData {
  /** 装备实例映射 */
  instances: Record<string, EquipmentInstanceData>;
  /** 英雄穿戴状态映射 */
  heroEquipment: Record<string, HeroEquipmentData>;
}

/** 创建默认装备存档数据 */
export function createDefaultEquipmentSaveData(): EquipmentSaveData {
  return {
    instances: {},
    heroEquipment: {},
  };
}
