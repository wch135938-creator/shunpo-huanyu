// ============================================================
// equipment_types.ts — Phase4B 装备枚举定义
// 职责：定义 EquipmentType、EquipmentSlot、EquipmentQuality 枚举
// 规范：仅定义枚举，不包含业务逻辑
// ============================================================

/** 装备类型 */
export enum EquipmentType {
  Weapon = 'Weapon',
  Armor = 'Armor',
  Accessory = 'Accessory',
}

/** 装备槽位（与 EquipmentType 一一对应） */
export enum EquipmentSlot {
  Weapon = 'Weapon',
  Armor = 'Armor',
  Accessory = 'Accessory',
}

/** 装备品质 */
export enum EquipmentQuality {
  Common = 'Common',
  Rare = 'Rare',
  Epic = 'Epic',
  Legendary = 'Legendary',
}

/** EquipmentType → EquipmentSlot 映射 */
export const EQUIPMENT_TYPE_TO_SLOT: Record<EquipmentType, EquipmentSlot> = {
  [EquipmentType.Weapon]: EquipmentSlot.Weapon,
  [EquipmentType.Armor]: EquipmentSlot.Armor,
  [EquipmentType.Accessory]: EquipmentSlot.Accessory,
};
