// ============================================================
// equipment_ui_types.ts — Phase5 装备 UI 查询类型定义
// 职责：定义 UI 层所需的组合查询结果类型
// 规范：仅定义类型，不包含业务逻辑；不修改存档结构
// 依赖：equipment_types / equipment_data / equipment_config / PowerSystem
// ============================================================

import type { EquipmentSlot } from './equipment_types';
import type { EquipmentInstanceData } from './equipment_data';
import type { EquipmentConfig } from './equipment_config';
import type { PowerAttributeBonus } from '../systems/PowerSystem';

/**
 * 装备实例完整详情（实例数据 + 配置模板）。
 *
 * 用途：UI 渲染单个装备时，一次性获取所有需要的信息。
 */
export interface EquipmentInstanceDetail {
  /** 装备实例运行时数据 */
  instance: EquipmentInstanceData;
  /** 装备配置模板 */
  config: EquipmentConfig;
}

/**
 * 英雄装备 UI 数据（穿戴状态 + 属性汇总）。
 *
 * 用途：装备面板顶层需要同时知道"哪个槽位穿了什么"和"总加成是多少"。
 *
 * 对应设计文档 Phase5 §3.1 的 getHeroEquipmentData 返回值：
 *   HeroEquipmentData & HeroEquipmentSummary
 */
export interface HeroEquipmentUIData {
  /** 英雄 ID */
  heroId: string;
  /** 武器槽位（装备实例 uid，null 表示空） */
  weaponId: string | null;
  /** 护甲槽位 */
  armorId: string | null;
  /** 饰品槽位 */
  accessoryId: string | null;
  /** 装备属性加成（hp/atk/def/speed） */
  attributeBonus: PowerAttributeBonus;
  /** 装备独立战力（已乘品质倍率） */
  equipmentPower: number;
}

/**
 * 单个槽位的完整展示数据。
 *
 * null 表示该槽位为空。
 */
export type EquipmentSlotDetail = EquipmentInstanceDetail | null;

/**
 * 英雄所有槽位完整详情。
 *
 * 用途：装备面板渲染三个槽位时，一次性获取所有槽位的实例+配置。
 */
export interface HeroSlotDetails {
  /** 英雄 ID */
  heroId: string;
  /** 武器槽位详情 */
  weapon: EquipmentSlotDetail;
  /** 护甲槽位详情 */
  armor: EquipmentSlotDetail;
  /** 饰品槽位详情 */
  accessory: EquipmentSlotDetail;
  /** 装备属性加成 */
  attributeBonus: PowerAttributeBonus;
  /** 装备独立战力 */
  equipmentPower: number;
}

/**
 * 背包装备列表筛选条件。
 */
export interface EquipmentListFilter {
  /** 按装备类型筛选 */
  type?: import('./equipment_types').EquipmentType;
  /** 按装备品质筛选 */
  quality?: import('./equipment_types').EquipmentQuality;
}

/**
 * 背包装备列表项（实例 + 配置 + 是否已穿戴）。
 *
 * 用途：背包列表 UI 需要知道每件装备是否已被某个英雄穿戴。
 */
export interface EquipmentListEntry {
  /** 装备实例 */
  instance: EquipmentInstanceData;
  /** 装备配置 */
  config: EquipmentConfig;
  /** 是否已被英雄穿戴（已穿戴的装备不可删除） */
  equipped: boolean;
  /** 穿戴者英雄 ID（仅 equipped=true 时有效） */
  equippedHeroId: string | null;
  /** 穿戴槽位（仅 equipped=true 时有效） */
  equippedSlot: EquipmentSlot | null;
}
