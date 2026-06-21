// ============================================================
// EquipmentTypes.ts — 装备领域类型定义
// 职责：定义装备槽位、品质、穿戴关系、计算结果、操作结果类型
// 位置：equipment/ 层
// 边界：纯类型定义，不依赖 Cocos UI / Battle / Save / Inventory
// 规范：零 any / 纯类型 / 无运行时逻辑
// ============================================================

// ==================== 装备槽位 ====================

/**
 * 装备槽位 ID。
 *
 * 首期支持 Weapon / Armor / Accessory。
 * 预留 Helmet / Boots / Ring1 / Ring2 / Relic / RuneSocket / PetGear。
 */
export type EquipmentSlotId =
  | 'Weapon'
  | 'Armor'
  | 'Accessory'
  | 'Helmet'
  | 'Boots'
  | 'Ring1'
  | 'Ring2'
  | 'Relic'
  | 'RuneSocket'
  | 'PetGear';

/** 首期核心槽位 */
export const CORE_SLOT_IDS: EquipmentSlotId[] = [
  'Weapon',
  'Armor',
  'Accessory',
];

/** 所有已知槽位（包含首期与未来扩展） */
export const ALL_KNOWN_SLOT_IDS: EquipmentSlotId[] = [
  'Weapon',
  'Armor',
  'Accessory',
  'Helmet',
  'Boots',
  'Ring1',
  'Ring2',
  'Relic',
  'RuneSocket',
  'PetGear',
];

/** 槽位中文名称映射 */
export const SLOT_NAME_MAP: Record<EquipmentSlotId, string> = {
  Weapon: '武器',
  Armor: '护甲',
  Accessory: '饰品',
  Helmet: '头盔',
  Boots: '战靴',
  Ring1: '戒指1',
  Ring2: '戒指2',
  Relic: '遗物',
  RuneSocket: '符文孔',
  PetGear: '灵宠装备',
};

// ==================== 装备品质 ====================

/** 装备品质枚举（数值型，便于比较） */
export enum EquipmentQuality {
  Common = 0,
  Rare = 1,
  Epic = 2,
  Legendary = 3,
}

/** 品质中文名称映射 */
export const QUALITY_NAME_MAP: Record<number, string> = {
  [EquipmentQuality.Common]: '普通',
  [EquipmentQuality.Rare]: '稀有',
  [EquipmentQuality.Epic]: '史诗',
  [EquipmentQuality.Legendary]: '传说',
};

// ==================== 装备穿戴关系 ====================

/**
 * 单英雄装备穿戴关系。
 *
 * slots 为 slotId → equipmentUniqueId | null 的映射。
 * null 表示该槽位为空。
 */
export interface EquipmentLoadout {
  /** 英雄 ID */
  heroId: string;
  /** 槽位映射：slotId → equipmentUniqueId（null = 空槽位） */
  slots: Record<string, string | null>;
  /** 最后更新时间戳（Unix ms） */
  updatedAt: number;
}

/** 创建默认 Loadout */
export function createDefaultLoadout(heroId: string): EquipmentLoadout {
  const slots: Record<string, string | null> = {};
  for (const slotId of CORE_SLOT_IDS) {
    slots[slotId] = null;
  }
  return {
    heroId,
    slots,
    updatedAt: Date.now(),
  };
}

// ==================== 装备属性贡献 ====================

/**
 * 装备属性加成。
 *
 * 所有字段均为可选，只包含非零加成。
 */
export interface EquipmentAttributeBonus {
  hp?: number;
  atk?: number;
  def?: number;
  speed?: number;
  critRate?: number;
  critDamage?: number;
}

/**
 * 装备战斗贡献快照。
 *
 * 由 EquipmentService 生成，HeroSnapshot 组装时消费。
 * BattleSystem 不直接读取此结构。
 */
export interface EquipmentBattleContribution {
  /** 英雄 ID */
  heroId: string;
  /** 属性加成汇总 */
  attributeBonus: EquipmentAttributeBonus;
  /** 装备总战力 */
  equipmentPower: number;
  /** 贡献来源槽位列表 */
  sourceSlotIds: string[];
  /** 快照时间戳 */
  capturedAt: number;
}

// ==================== 战力计算结果 ====================

/**
 * 装备战力计算结果。
 */
export interface EquipmentPowerResult {
  /** 总战力 */
  totalPower: number;
  /** 属性加成 */
  attributeBonus: EquipmentAttributeBonus;
  /** 各维度分解 */
  breakdown: Record<string, number>;
}

// ==================== 操作结果类型 ====================

/** 装备操作错误码 */
export enum EquipmentOperationError {
  SUCCESS = 'SUCCESS',
  // 通用错误
  HERO_NOT_FOUND = 'HERO_NOT_FOUND',
  EQUIPMENT_NOT_FOUND = 'EQUIPMENT_NOT_FOUND',
  INSTANCE_NOT_FOUND = 'INSTANCE_NOT_FOUND',
  NOT_EQUIPMENT_CATEGORY = 'NOT_EQUIPMENT_CATEGORY',
  // 穿戴错误
  SLOT_NOT_COMPATIBLE = 'SLOT_NOT_COMPATIBLE',
  LEVEL_REQUIREMENT_NOT_MET = 'LEVEL_REQUIREMENT_NOT_MET',
  CLASS_RESTRICTED = 'CLASS_RESTRICTED',
  FACTION_RESTRICTED = 'FACTION_RESTRICTED',
  ALREADY_EQUIPPED_BY_SAME_HERO = 'ALREADY_EQUIPPED_BY_SAME_HERO',
  ALREADY_EQUIPPED_BY_OTHER_HERO = 'ALREADY_EQUIPPED_BY_OTHER_HERO',
  SLOT_ALREADY_OCCUPIED = 'SLOT_ALREADY_OCCUPIED',
  // 卸下错误
  SLOT_EMPTY = 'SLOT_EMPTY',
  // 升级/强化错误
  MAX_LEVEL_REACHED = 'MAX_LEVEL_REACHED',
  INSUFFICIENT_MATERIALS = 'INSUFFICIENT_MATERIALS',
  UPGRADE_COST_NOT_FOUND = 'UPGRADE_COST_NOT_FOUND',
  ENHANCE_COST_NOT_FOUND = 'ENHANCE_COST_NOT_FOUND',
  // 分解错误
  EQUIPMENT_LOCKED = 'EQUIPMENT_LOCKED',
  EQUIPMENT_EQUIPPED = 'EQUIPMENT_EQUIPPED',
  CANNOT_DECOMPOSE = 'CANNOT_DECOMPOSE',
  DECOMPOSE_RETURN_NOT_FOUND = 'DECOMPOSE_RETURN_NOT_FOUND',
  // 系统错误
  CONFIG_NOT_LOADED = 'CONFIG_NOT_LOADED',
  INVENTORY_NOT_INITIALIZED = 'INVENTORY_NOT_INITIALIZED',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

/** 装备穿戴结果 */
export interface EquipmentEquipResult {
  success: boolean;
  errorCode: EquipmentOperationError;
  message?: string;
  /** 被替换下的旧装备 uniqueId（如有） */
  replacedUniqueId?: string | null;
}

/** 装备卸下结果 */
export interface EquipmentUnequipResult {
  success: boolean;
  errorCode: EquipmentOperationError;
  message?: string;
  /** 被卸下的装备 uniqueId */
  unequippedUniqueId?: string;
}

/** 装备升级结果 */
export interface EquipmentUpgradeResult {
  success: boolean;
  errorCode: EquipmentOperationError;
  message?: string;
  /** 升级前等级 */
  levelBefore?: number;
  /** 升级后等级 */
  levelAfter?: number;
  /** 战力变化 */
  powerDelta?: number;
  /** 消耗材料列表 */
  costItems?: Array<{ itemId: string; count: number }>;
}

/** 装备强化结果 */
export interface EquipmentEnhanceResult {
  success: boolean;
  errorCode: EquipmentOperationError;
  message?: string;
  /** 强化前等级 */
  enhanceLevelBefore?: number;
  /** 强化后等级 */
  enhanceLevelAfter?: number;
  /** 战力变化 */
  powerDelta?: number;
  /** 消耗材料列表 */
  costItems?: Array<{ itemId: string; count: number }>;
}

/** 装备分解结果 */
export interface EquipmentDecomposeResult {
  success: boolean;
  errorCode: EquipmentOperationError;
  message?: string;
  /** 返还材料/货币列表 */
  returnItems?: Array<{ itemId: string; count: number }>;
  /** 被分解的装备 uniqueId */
  decomposedUniqueId?: string;
}

// ==================== 装备查询入口 ====================

/**
 * 装备背包查询条目（组合了 Inventory 实例 + 配置 + 穿戴状态）。
 */
export interface EquipmentInventoryEntry {
  /** 装备实例 uniqueId */
  uniqueId: string;
  /** 物品 ID */
  itemId: string;
  /** 装备名称（来自配置） */
  name: string;
  /** 槽位类型 */
  slotType: EquipmentSlotId;
  /** 品质 */
  quality: number;
  /** 等级 */
  level: number;
  /** 强化等级 */
  enhanceLevel: number;
  /** 战力 */
  power: number;
  /** 是否已被穿戴 */
  isEquipped: boolean;
  /** 穿戴者英雄 ID（null = 未穿戴） */
  equippedHeroId: string | null;
  /** 穿戴槽位 ID（null = 未穿戴） */
  equippedSlotId: string | null;
  /** 是否锁定 */
  isLocked: boolean;
  /** 绑定状态 */
  bindState: string;
}

// ==================== 装备配置类型（extension） ====================

/**
 * 装备配置条目（从 equipment_config.json 加载）。
 *
 * 注意：与 data/equipment_config.ts 中的 EquipmentConfig 互补。
 * 本接口用于 Equipment 域内部配置查询。
 */
export interface EquipmentConfigEntry {
  /** 配置 ID（如 "weapon_001"） */
  id: string;
  /** 装备名称 */
  name: string;
  /** 装备类型（对应槽位） */
  type: string;
  /** 品质 */
  quality: number;
  /** 等级需求 */
  levelRequirement: number;
  /** 基础生命 */
  hp: number;
  /** 基础攻击 */
  attack: number;
  /** 基础防御 */
  defense: number;
  /** 基础战力 */
  power: number;
  /** 职业限制（空 = 无限制） */
  professionRestriction?: string;
  /** 阵营限制（空 = 无限制） */
  factionRestriction?: string;
  /** 是否可分解 */
  canDecompose?: boolean;
}

/**
 * 消耗条目。
 */
export interface CostEntry {
  /** 物品 ID */
  itemId: string;
  /** 数量 */
  count: number;
}
