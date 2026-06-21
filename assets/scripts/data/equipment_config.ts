// ============================================================
// equipment_config.ts — equipment_config.json 的 TypeScript 类型定义
// 职责：定义 Phase4B 装备配置模板结构
// 规范：仅定义配置结构，不包含装备实例或穿戴逻辑
// ============================================================

import type { EquipmentType, EquipmentQuality } from './equipment_types';

/**
 * 单条装备配置模板（对应 equipment_config.json data[] 中每一项）。
 */
export interface EquipmentConfig {
  /** 装备配置 ID，如 "weapon_001" */
  id: string;
  /** 装备名称 */
  name: string;
  /** 装备类型 */
  type: EquipmentType;
  /** 装备品质 */
  quality: EquipmentQuality;
  /** 穿戴等级需求 */
  levelRequirement: number;
  /** 生命加成 */
  hp: number;
  /** 攻击加成 */
  attack: number;
  /** 防御加成 */
  defense: number;
  /** 独立战力值（直接累加到英雄战力） */
  power: number;
}

/**
 * equipment_config.json 的顶层结构（三层：version / name / data[]）。
 */
export interface EquipmentConfigData {
  /** 配置格式版本号 */
  version: string;
  /** 配置表名称（调试用） */
  name: string;
  /** 装备配置数组 */
  data: EquipmentConfig[];
}
