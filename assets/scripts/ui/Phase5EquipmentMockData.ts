// ============================================================
// Phase5EquipmentMockData.ts — 装备 UI Mock 数据
// 职责：提供不依赖 ConfigManager / SaveManager 的独立 Mock 数据
// 用途：编辑器预览 / UI 组件开发联调
// 规范：所有数据模拟 EquipmentSystem 真实返回值结构
// ============================================================

import { EquipmentType, EquipmentQuality, EquipmentSlot } from '../data/equipment_types';
import type { EquipmentConfig } from '../data/equipment_config';
import type { EquipmentInstanceData } from '../data/equipment_data';
import type {
  EquipmentListEntry,
  EquipmentInstanceDetail,
  HeroEquipmentUIData,
  HeroSlotDetails,
} from '../data/equipment_ui_types';
import type { PowerAttributeBonus } from '../systems/PowerSystem';

// ==================== 品质颜色映射 ====================

/** 品质 → 颜色 hex（后续移入 UI 配置表） */
export const QUALITY_COLOR_MAP: Record<EquipmentQuality, string> = {
  [EquipmentQuality.Common]: '#9CA3AF',    // 灰色
  [EquipmentQuality.Rare]: '#3B82F6',      // 蓝色
  [EquipmentQuality.Epic]: '#8B5CF6',      // 紫色
  [EquipmentQuality.Legendary]: '#F59E0B', // 金色
};

/** 品质 → 中文标签 */
export const QUALITY_LABEL_MAP: Record<EquipmentQuality, string> = {
  [EquipmentQuality.Common]: '普通',
  [EquipmentQuality.Rare]: '稀有',
  [EquipmentQuality.Epic]: '史诗',
  [EquipmentQuality.Legendary]: '传说',
};

/** 槽位 → 中文标签 */
export const SLOT_LABEL_MAP: Record<EquipmentSlot, string> = {
  [EquipmentSlot.Weapon]: '武器',
  [EquipmentSlot.Armor]: '护甲',
  [EquipmentSlot.Accessory]: '饰品',
};

// ==================== Mock 装备配置 ====================

const MOCK_CONFIGS: EquipmentConfig[] = [
  {
    id: 'weapon_001', name: '青锋剑', type: EquipmentType.Weapon,
    quality: EquipmentQuality.Common, levelRequirement: 1,
    hp: 0, attack: 20, defense: 0, power: 40,
  },
  {
    id: 'weapon_002', name: '寒铁重剑', type: EquipmentType.Weapon,
    quality: EquipmentQuality.Rare, levelRequirement: 5,
    hp: 0, attack: 55, defense: 0, power: 120,
  },
  {
    id: 'weapon_003', name: '紫电仙剑', type: EquipmentType.Weapon,
    quality: EquipmentQuality.Epic, levelRequirement: 10,
    hp: 30, attack: 120, defense: 0, power: 300,
  },
  {
    id: 'weapon_004', name: '盘古开天斧', type: EquipmentType.Weapon,
    quality: EquipmentQuality.Legendary, levelRequirement: 20,
    hp: 100, attack: 280, defense: 0, power: 800,
  },
  {
    id: 'armor_001', name: '布衣', type: EquipmentType.Armor,
    quality: EquipmentQuality.Common, levelRequirement: 1,
    hp: 80, attack: 0, defense: 10, power: 30,
  },
  {
    id: 'armor_002', name: '玄铁护甲', type: EquipmentType.Armor,
    quality: EquipmentQuality.Rare, levelRequirement: 5,
    hp: 220, attack: 0, defense: 28, power: 100,
  },
  {
    id: 'armor_003', name: '天蚕宝甲', type: EquipmentType.Armor,
    quality: EquipmentQuality.Epic, levelRequirement: 10,
    hp: 500, attack: 0, defense: 60, power: 260,
  },
  {
    id: 'armor_004', name: '不灭金身', type: EquipmentType.Armor,
    quality: EquipmentQuality.Legendary, levelRequirement: 20,
    hp: 1200, attack: 0, defense: 150, power: 700,
  },
  {
    id: 'acc_001', name: '铜戒', type: EquipmentType.Accessory,
    quality: EquipmentQuality.Common, levelRequirement: 1,
    hp: 40, attack: 8, defense: 4, power: 35,
  },
  {
    id: 'acc_002', name: '灵玉坠', type: EquipmentType.Accessory,
    quality: EquipmentQuality.Rare, levelRequirement: 5,
    hp: 110, attack: 22, defense: 11, power: 110,
  },
  {
    id: 'acc_003', name: '凤凰翎', type: EquipmentType.Accessory,
    quality: EquipmentQuality.Epic, levelRequirement: 10,
    hp: 250, attack: 50, defense: 25, power: 280,
  },
  {
    id: 'acc_004', name: '混沌珠', type: EquipmentType.Accessory,
    quality: EquipmentQuality.Legendary, levelRequirement: 20,
    hp: 600, attack: 120, defense: 60, power: 750,
  },
];

// ==================== Mock 数据工厂 ====================

let _uidSeq = 0;

function nextUid(configId: string): string {
  _uidSeq += 1;
  return `MOCK_${configId}_${_uidSeq}`;
}

/** 由装备配置 ID 创建 Mock 实例 */
export function createMockInstance(configId: string): EquipmentInstanceData {
  return { uid: nextUid(configId), configId };
}

/** 获取 Mock 装备配置 */
export function getMockConfig(configId: string): EquipmentConfig | null {
  return MOCK_CONFIGS.find((c) => c.id === configId) ?? null;
}

/** 获取所有 Mock 配置 */
export function getAllMockConfigs(): EquipmentConfig[] {
  return [...MOCK_CONFIGS];
}

/** 创建装备实例完整详情（Mock） */
export function createMockInstanceDetail(configId: string): EquipmentInstanceDetail | null {
  const config = getMockConfig(configId);
  if (!config) return null;
  return { instance: createMockInstance(configId), config };
}

// ==================== Mock 场景数据 ====================

const MOCK_HERO_ID = 'CARD_301';

/**
 * 创建"英雄已穿戴三件装备"的 Mock 场景。
 *
 * 英雄 CARD_301 穿戴：
 * - Weapon: weapon_001 青锋剑 (Common)
 * - Armor:  armor_001 布衣    (Common)
 * - Accessory: acc_001  铜戒    (Common)
 *
 * 背包中额外有 6 件未穿戴装备。
 */
export interface MockFullScenario {
  /** 英雄装备 UI 数据 */
  heroEquipmentUIData: HeroEquipmentUIData;
  /** 英雄槽位详情 */
  heroSlotDetails: HeroSlotDetails;
  /** 背包列表（含已穿戴标识） */
  bagEntries: EquipmentListEntry[];
  /** 属性加成 */
  attributeBonus: PowerAttributeBonus;
  /** 装备独立战力 */
  equipmentPower: number;
}

export function createMockFullScenario(): MockFullScenario {
  // 创建背包实例
  const weapon1 = createMockInstance('weapon_001');
  const weapon2 = createMockInstance('weapon_002');
  const armor1 = createMockInstance('armor_001');
  const armor2 = createMockInstance('armor_002');
  const acc1 = createMockInstance('acc_001');
  const acc2 = createMockInstance('acc_003');
  const weapon3 = createMockInstance('weapon_003');
  const armor3 = createMockInstance('armor_003');
  const acc3 = createMockInstance('acc_004');

  // 英雄穿戴 weapon_001 / armor_001 / acc_001
  const equippedWeapon = weapon1.uid;
  const equippedArmor = armor1.uid;
  const equippedAcc = acc1.uid;

  // 构建槽位详情
  const weaponDetail: EquipmentInstanceDetail = {
    instance: weapon1,
    config: getMockConfig('weapon_001')!,
  };
  const armorDetail: EquipmentInstanceDetail = {
    instance: armor1,
    config: getMockConfig('armor_001')!,
  };
  const accDetail: EquipmentInstanceDetail = {
    instance: acc1,
    config: getMockConfig('acc_001')!,
  };

  // 属性加成：weapon_001(atk=20) + armor_001(hp=80,def=10) + acc_001(hp=40,atk=8,def=4)
  const attributeBonus: PowerAttributeBonus = {
    hp: 80 + 40,        // 120
    atk: 20 + 8,        // 28
    def: 10 + 4,        // 14
    speed: 0,
  };

  // 装备独立战力：40 + 30 + 35 = 105（品质倍率 Common ×1.0）
  const equipmentPower = 40 + 30 + 35;

  // 槽位详情
  const heroSlotDetails: HeroSlotDetails = {
    heroId: MOCK_HERO_ID,
    weapon: weaponDetail,
    armor: armorDetail,
    accessory: accDetail,
    attributeBonus,
    equipmentPower,
  };

  // 英雄装备 UI 数据
  const heroEquipmentUIData: HeroEquipmentUIData = {
    heroId: MOCK_HERO_ID,
    weaponId: equippedWeapon,
    armorId: equippedArmor,
    accessoryId: equippedAcc,
    attributeBonus,
    equipmentPower,
  };

  // 背包列表（含已穿戴标识）
  const equippedSet = new Set([equippedWeapon, equippedArmor, equippedAcc]);
  const equippedMap: Record<string, { heroId: string; slotType: EquipmentSlot }> = {
    [equippedWeapon]: { heroId: MOCK_HERO_ID, slotType: EquipmentSlot.Weapon },
    [equippedArmor]: { heroId: MOCK_HERO_ID, slotType: EquipmentSlot.Armor },
    [equippedAcc]: { heroId: MOCK_HERO_ID, slotType: EquipmentSlot.Accessory },
  };

  const allInstances = [weapon1, weapon2, weapon3, armor1, armor2, armor3, acc1, acc2, acc3];

  const bagEntries: EquipmentListEntry[] = allInstances.map((inst) => {
    const config = getMockConfig(inst.configId)!;
    const info = equippedMap[inst.uid];
    return {
      instance: inst,
      config,
      equipped: info !== undefined,
      equippedHeroId: info?.heroId ?? null,
      equippedSlot: info?.slotType ?? null,
    };
  });

  return {
    heroEquipmentUIData,
    heroSlotDetails,
    bagEntries,
    attributeBonus,
    equipmentPower,
  };
}

/**
 * 创建"空英雄装备"的 Mock 场景。
 */
export function createMockEmptyScenario(): MockFullScenario {
  const weapon1 = createMockInstance('weapon_001');
  const weapon2 = createMockInstance('weapon_002');
  const armor1 = createMockInstance('armor_001');
  const acc1 = createMockInstance('acc_001');
  const weapon3 = createMockInstance('weapon_004');
  const acc2 = createMockInstance('acc_002');

  const allInstances = [weapon1, weapon2, weapon3, armor1, acc1, acc2];

  const bagEntries: EquipmentListEntry[] = allInstances.map((inst) => ({
    instance: inst,
    config: getMockConfig(inst.configId)!,
    equipped: false,
    equippedHeroId: null,
    equippedSlot: null,
  }));

  return {
    heroEquipmentUIData: {
      heroId: MOCK_HERO_ID,
      weaponId: null,
      armorId: null,
      accessoryId: null,
      attributeBonus: { hp: 0, atk: 0, def: 0, speed: 0 },
      equipmentPower: 0,
    },
    heroSlotDetails: {
      heroId: MOCK_HERO_ID,
      weapon: null,
      armor: null,
      accessory: null,
      attributeBonus: { hp: 0, atk: 0, def: 0, speed: 0 },
      equipmentPower: 0,
    },
    bagEntries,
    attributeBonus: { hp: 0, atk: 0, def: 0, speed: 0 },
    equipmentPower: 0,
  };
}

/** 获取 Mock 英雄 ID */
export function getMockHeroId(): string {
  return MOCK_HERO_ID;
}
