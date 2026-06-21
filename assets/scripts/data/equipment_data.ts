// ============================================================
// equipment_data.ts — Phase4B 装备运行时数据结构定义
// 职责：定义装备实例、英雄穿戴状态、玩家装备总数据
// 规范：仅定义数据结构，不包含装备逻辑或 UI
// ============================================================

import type { EquipmentSlot } from './equipment_types';

/**
 * 装备实例数据。
 *
 * 说明：
 * - uid 是实例唯一 ID（运行时生成）。
 * - configId 指向 EquipmentConfig.id。
 * - 实例与配置分离：配置定义模板，实例记录拥有关系。
 */
export interface EquipmentInstanceData {
  /** 实例唯一 ID */
  uid: string;
  /** 装备配置 ID */
  configId: string;
}

/**
 * 单个英雄的装备穿戴状态。
 *
 * 说明：
 * - 每个槽位存储装备实例 uid，null 表示该槽位为空。
 */
export interface HeroEquipmentData {
  /** 英雄 ID */
  heroId: string;
  /** 武器槽位 */
  weaponId: string | null;
  /** 护甲槽位 */
  armorId: string | null;
  /** 饰品槽位 */
  accessoryId: string | null;
}

/**
 * 玩家装备总数据（存档根）。
 *
 * 说明：
 * - instances 保存所有装备实例（uid → 实例数据）。
 * - heroEquipment 保存每个英雄的穿戴状态（heroId → HeroEquipmentData）。
 */
export interface PlayerEquipmentData {
  /** 装备实例映射 */
  instances: Record<string, EquipmentInstanceData>;
  /** 英雄穿戴状态映射 */
  heroEquipment: Record<string, HeroEquipmentData>;
}

/** 创建默认 PlayerEquipmentData */
export function createDefaultPlayerEquipmentData(): PlayerEquipmentData {
  return {
    instances: {},
    heroEquipment: {},
  };
}

/** 创建默认 HeroEquipmentData */
export function createDefaultHeroEquipmentData(heroId: string): HeroEquipmentData {
  return {
    heroId,
    weaponId: null,
    armorId: null,
    accessoryId: null,
  };
}

/** 根据 EquipmentSlot 获取 HeroEquipmentData 中对应字段的值 */
export function getEquipmentSlotValue(data: HeroEquipmentData, slot: EquipmentSlot): string | null {
  switch (slot) {
    case 'Weapon' as EquipmentSlot:
      return data.weaponId;
    case 'Armor' as EquipmentSlot:
      return data.armorId;
    case 'Accessory' as EquipmentSlot:
      return data.accessoryId;
    default:
      return null;
  }
}

/** 根据 EquipmentSlot 设置 HeroEquipmentData 中对应字段的值 */
export function setEquipmentSlotValue(
  data: HeroEquipmentData,
  slot: EquipmentSlot,
  value: string | null,
): void {
  switch (slot) {
    case 'Weapon' as EquipmentSlot:
      data.weaponId = value;
      break;
    case 'Armor' as EquipmentSlot:
      data.armorId = value;
      break;
    case 'Accessory' as EquipmentSlot:
      data.accessoryId = value;
      break;
  }
}
