// ============================================================
// EquipmentSlotRules.ts — 装备规则校验
// 职责：纯校验函数（canEquip / canUnequip / canUpgrade / canEnhance / canDecompose）
// 位置：equipment/ 层
// 边界：不读写存档、不调用外部服务、不修改数据
// 规范：所有函数返回 { allowed, errorCode }，不抛异常
// ============================================================

import type { InstanceItem } from '../inventory/InventoryDomain';
import type { EquipmentLoadoutSaveEntry, EquipmentSaveDataV2 } from './EquipmentLoadoutData';
import { findEquipmentWearer } from './EquipmentLoadoutData';
import type { EquipmentConfigEntry, CostEntry, EquipmentSlotId } from './EquipmentTypes';
import { EquipmentOperationError, CORE_SLOT_IDS } from './EquipmentTypes';
import type { EquipmentConfigRepository } from './EquipmentConfigRepository';

// ==================== 校验结果 ====================

interface RuleCheckResult {
  allowed: boolean;
  errorCode: EquipmentOperationError;
}

interface CostCheckResult {
  allowed: boolean;
  errorCode: EquipmentOperationError;
  cost?: CostEntry[];
}

interface DecomposeCheckResult {
  allowed: boolean;
  errorCode: EquipmentOperationError;
  returns?: CostEntry[];
}

// ==================== 槽位映射 ====================

/**
 * InstanceItem.subType → EquipmentSlotId 映射。
 */
const SUBTYPE_TO_SLOT: Record<string, EquipmentSlotId> = {
  Weapon: 'Weapon',
  Armor: 'Armor',
  Accessory: 'Accessory',
};

/**
 * 检查实例的 subType 是否与目标槽位兼容。
 */
function isSubTypeCompatible(
  instance: InstanceItem,
  slotId: EquipmentSlotId,
): boolean {
  const expectedSlot = SUBTYPE_TO_SLOT[instance.subType];
  if (!expectedSlot) {
    return false;
  }
  return expectedSlot === slotId;
}

// ==================== 穿戴校验 ====================

/**
 * 校验是否可以穿戴装备。
 *
 * @param heroId       英雄 ID
 * @param slotId       目标槽位 ID
 * @param instance     装备 InstanceItem
 * @param heroLevel    英雄等级（用于等级需求检查）
 * @param heroProfession 英雄职业（可选，用于职业限制）
 * @param heroFaction  英雄阵营（可选，用于阵营限制）
 * @param configRepo   配置仓库（可选）
 * @param allLoadouts  所有穿戴关系（可选，用于重复穿戴检查）
 * @returns            { allowed, errorCode }
 */
export function canEquip(
  heroId: string,
  slotId: EquipmentSlotId,
  instance: InstanceItem,
  heroLevel: number = 1,
  heroProfession?: string,
  heroFaction?: string,
  configRepo?: EquipmentConfigRepository,
  allLoadouts?: EquipmentSaveDataV2,
): RuleCheckResult {
  // 0. 参数校验
  if (!heroId) {
    return { allowed: false, errorCode: EquipmentOperationError.HERO_NOT_FOUND };
  }
  if (!instance || !instance.uniqueId) {
    return {
      allowed: false,
      errorCode: EquipmentOperationError.INSTANCE_NOT_FOUND,
    };
  }

  // 1. 必须是装备类别
  if (instance.category !== 'Equipment') {
    return {
      allowed: false,
      errorCode: EquipmentOperationError.NOT_EQUIPMENT_CATEGORY,
    };
  }

  // 2. 槽位兼容性检查
  if (!isSubTypeCompatible(instance, slotId)) {
    return {
      allowed: false,
      errorCode: EquipmentOperationError.SLOT_NOT_COMPATIBLE,
    };
  }

  // 3. 槽位合法性检查
  if (!CORE_SLOT_IDS.includes(slotId)) {
    return {
      allowed: false,
      errorCode: EquipmentOperationError.SLOT_NOT_COMPATIBLE,
    };
  }

  // 4. 等级需求检查
  if (configRepo) {
    const config = configRepo.getEquipmentConfigByItemId(instance.itemId);
    if (config && config.levelRequirement > heroLevel) {
      return {
        allowed: false,
        errorCode: EquipmentOperationError.LEVEL_REQUIREMENT_NOT_MET,
      };
    }

    // 5. 职业限制检查
    if (config?.professionRestriction && heroProfession) {
      const allowedProfessions = config.professionRestriction.split(',').map((s) => s.trim());
      if (!allowedProfessions.includes(heroProfession)) {
        return {
          allowed: false,
          errorCode: EquipmentOperationError.CLASS_RESTRICTED,
        };
      }
    }

    // 6. 阵营限制检查
    if (config?.factionRestriction && heroFaction) {
      const allowedFactions = config.factionRestriction.split(',').map((s) => s.trim());
      if (!allowedFactions.includes(heroFaction)) {
        return {
          allowed: false,
          errorCode: EquipmentOperationError.FACTION_RESTRICTED,
        };
      }
    }
  }

  // 7. 是否已被同一英雄穿戴（同一槽位重复穿戴？由上层处理自动替换）
  // 此处不阻止，由 EquipmentService 决定替换策略

  // 8. 是否已被其他英雄穿戴
  if (allLoadouts) {
    const wearer = findEquipmentWearer(allLoadouts, instance.uniqueId);
    if (wearer.equipped && wearer.heroId !== heroId) {
      return {
        allowed: false,
        errorCode: EquipmentOperationError.ALREADY_EQUIPPED_BY_OTHER_HERO,
      };
    }
  }

  return { allowed: true, errorCode: EquipmentOperationError.SUCCESS };
}

// ==================== 卸下校验 ====================

/**
 * 校验是否可以卸下装备。
 *
 * @param heroId    英雄 ID
 * @param slotId    槽位 ID
 * @param loadouts  所有穿戴关系存档
 * @returns         { allowed, errorCode }
 */
export function canUnequip(
  heroId: string,
  slotId: EquipmentSlotId,
  loadouts: EquipmentSaveDataV2,
): RuleCheckResult {
  if (!heroId) {
    return { allowed: false, errorCode: EquipmentOperationError.HERO_NOT_FOUND };
  }

  const entry = loadouts.loadouts.find((e) => e.heroId === heroId);
  if (!entry) {
    return { allowed: false, errorCode: EquipmentOperationError.SLOT_EMPTY };
  }

  const equippedId = entry.slots[slotId];
  if (!equippedId) {
    return { allowed: false, errorCode: EquipmentOperationError.SLOT_EMPTY };
  }

  return { allowed: true, errorCode: EquipmentOperationError.SUCCESS };
}

// ==================== 升级校验 ====================

/**
 * 校验是否可以升级装备。
 *
 * @param instance   装备 InstanceItem
 * @param configRepo 配置仓库
 * @returns          { allowed, errorCode, cost? }
 */
export function canUpgrade(
  instance: InstanceItem,
  configRepo: EquipmentConfigRepository,
): CostCheckResult {
  if (!instance || !instance.uniqueId) {
    return {
      allowed: false,
      errorCode: EquipmentOperationError.INSTANCE_NOT_FOUND,
    };
  }

  if (instance.category !== 'Equipment') {
    return {
      allowed: false,
      errorCode: EquipmentOperationError.NOT_EQUIPMENT_CATEGORY,
    };
  }

  const configId = configRepo.itemIdToConfigId(instance.itemId);
  if (!configId) {
    return {
      allowed: false,
      errorCode: EquipmentOperationError.CONFIG_NOT_LOADED,
    };
  }

  const currentLevel = instance.level;
  const maxLevel = configRepo.getMaxLevel();
  if (currentLevel >= maxLevel) {
    return {
      allowed: false,
      errorCode: EquipmentOperationError.MAX_LEVEL_REACHED,
    };
  }

  const cost = configRepo.getUpgradeCost(configId, currentLevel, currentLevel + 1);
  if (!cost || cost.length === 0) {
    return {
      allowed: false,
      errorCode: EquipmentOperationError.UPGRADE_COST_NOT_FOUND,
    };
  }

  return {
    allowed: true,
    errorCode: EquipmentOperationError.SUCCESS,
    cost,
  };
}

// ==================== 强化校验 ====================

/**
 * 校验是否可以强化装备。
 *
 * @param instance   装备 InstanceItem
 * @param configRepo 配置仓库
 * @returns          { allowed, errorCode, cost? }
 */
export function canEnhance(
  instance: InstanceItem,
  configRepo: EquipmentConfigRepository,
): CostCheckResult {
  if (!instance || !instance.uniqueId) {
    return {
      allowed: false,
      errorCode: EquipmentOperationError.INSTANCE_NOT_FOUND,
    };
  }

  if (instance.category !== 'Equipment') {
    return {
      allowed: false,
      errorCode: EquipmentOperationError.NOT_EQUIPMENT_CATEGORY,
    };
  }

  const configId = configRepo.itemIdToConfigId(instance.itemId);
  if (!configId) {
    return {
      allowed: false,
      errorCode: EquipmentOperationError.CONFIG_NOT_LOADED,
    };
  }

  const currentEnhanceLevel =
    (instance.extraData?.enhanceLevel as number) ?? 0;
  const maxEnhanceLevel = configRepo.getMaxEnhanceLevel();
  if (currentEnhanceLevel >= maxEnhanceLevel) {
    return {
      allowed: false,
      errorCode: EquipmentOperationError.MAX_LEVEL_REACHED,
    };
  }

  const cost = configRepo.getEnhanceCost(
    configId,
    currentEnhanceLevel,
    currentEnhanceLevel + 1,
  );
  if (!cost || cost.length === 0) {
    return {
      allowed: false,
      errorCode: EquipmentOperationError.ENHANCE_COST_NOT_FOUND,
    };
  }

  return {
    allowed: true,
    errorCode: EquipmentOperationError.SUCCESS,
    cost,
  };
}

// ==================== 分解校验 ====================

/**
 * 校验是否可以分解装备。
 *
 * @param instance   装备 InstanceItem
 * @param allLoadouts 所有穿戴关系
 * @param configRepo 配置仓库
 * @returns          { allowed, errorCode, returns? }
 */
export function canDecompose(
  instance: InstanceItem,
  allLoadouts: EquipmentSaveDataV2,
  configRepo: EquipmentConfigRepository,
): DecomposeCheckResult {
  if (!instance || !instance.uniqueId) {
    return {
      allowed: false,
      errorCode: EquipmentOperationError.INSTANCE_NOT_FOUND,
    };
  }

  if (instance.category !== 'Equipment') {
    return {
      allowed: false,
      errorCode: EquipmentOperationError.NOT_EQUIPMENT_CATEGORY,
    };
  }

  // 锁定检查
  if (instance.lockState === 'locked' || instance.lockState === 'soft_locked') {
    return {
      allowed: false,
      errorCode: EquipmentOperationError.EQUIPMENT_LOCKED,
    };
  }

  // 是否已被穿戴
  const wearer = findEquipmentWearer(allLoadouts, instance.uniqueId);
  if (wearer.equipped) {
    return {
      allowed: false,
      errorCode: EquipmentOperationError.EQUIPMENT_EQUIPPED,
    };
  }

  // 配置是否禁止分解
  const configId = configRepo.itemIdToConfigId(instance.itemId);
  if (configId) {
    const config = configRepo.getEquipmentConfig(configId);
    if (config?.canDecompose === false) {
      return {
        allowed: false,
        errorCode: EquipmentOperationError.CANNOT_DECOMPOSE,
      };
    }
  }

  // 计算返还
  const returns = configRepo.getDecomposeReturn(
    configId ?? '',
    instance.quality,
    instance.level,
  );

  return {
    allowed: true,
    errorCode: EquipmentOperationError.SUCCESS,
    returns,
  };
}

// ==================== 辅助查询 ====================

/**
 * 检查装备是否被指定英雄穿戴。
 */
export function isEquippedByHero(
  uniqueId: string,
  heroId: string,
  loadouts: EquipmentSaveDataV2,
): boolean {
  const entry = loadouts.loadouts.find((e) => e.heroId === heroId);
  if (!entry) return false;
  return Object.values(entry.slots).includes(uniqueId);
}

/**
 * 检查装备是否被任何英雄穿戴。
 */
export function isEquippedByAnyHero(
  uniqueId: string,
  loadouts: EquipmentSaveDataV2,
): { equipped: boolean; heroId?: string; slotId?: string } {
  return findEquipmentWearer(loadouts, uniqueId);
}
