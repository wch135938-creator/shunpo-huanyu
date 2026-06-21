// ============================================================
// EquipmentPowerCalculator.ts — 装备战力计算器
// 职责：纯计算模块（config + instance → attributeBonus + equipmentPower）
// 位置：equipment/ 层
// 边界：不读写存档、不调用外部服务、不发事件
// 规范：所有函数为纯函数（静态方法），仅依赖输入参数
// ============================================================

import type { InstanceItem } from '../inventory/InventoryDomain';
import type {
  EquipmentAttributeBonus,
  EquipmentPowerResult,
  EquipmentBattleContribution,
} from './EquipmentTypes';
import type { EquipmentConfigRepository } from './EquipmentConfigRepository';
import type { EquipmentSaveDataV2 } from './EquipmentLoadoutData';

// ==================== 计算配置 ====================

/**
 * 属性权重（用于将属性折算为战力）。
 */
const STAT_WEIGHTS = {
  hp: 0.5,
  atk: 2.0,
  def: 1.0,
  speed: 0.3,
  critRate: 5.0,
  critDamage: 3.0,
};

/**
 * 每级等级成长倍率（装备等级对属性的提升系数）。
 *
 * 基础属性 × (1 + (level - 1) × levelGrowthRate)
 */
const LEVEL_GROWTH_RATE = 0.05;

/**
 * 每级强化成长倍率。
 *
 * 基础属性 × (1 + enhanceLevel × enhanceGrowthRate)
 */
const ENHANCE_GROWTH_RATE = 0.08;

// ==================== 计算入口 ====================

/**
 * 计算单个装备的战力。
 *
 * @param config       装备配置
 * @param instance     装备实例
 * @param configRepo   配置仓库（可选，用于获取品质倍率）
 * @returns            EquipmentPowerResult
 */
export function calculatePower(
  config: {
    hp: number;
    attack: number;
    defense: number;
    power: number;
    quality?: number;
  },
  instance: InstanceItem,
  configRepo?: EquipmentConfigRepository,
): EquipmentPowerResult {
  const quality = config.quality ?? instance.quality ?? 0;
  const level = instance.level;
  const enhanceLevel =
    (instance.extraData?.enhanceLevel as number) ?? 0;

  // 等级成长
  const levelMultiplier = 1 + (level - 1) * LEVEL_GROWTH_RATE;

  // 强化成长
  const enhanceMultiplier = 1 + enhanceLevel * ENHANCE_GROWTH_RATE;

  // 品质倍率
  const qualityMultiplier = configRepo
    ? configRepo.getQualityPowerMultiplier(quality)
    : getDefaultQualityMultiplier(quality);

  // 词条加成（如有）
  const affixBonus = extractAffixAttributeBonus(instance.affix);

  // 计算属性加成
  const baseHp = (config.hp ?? 0) * levelMultiplier * enhanceMultiplier;
  const baseAtk = (config.attack ?? 0) * levelMultiplier * enhanceMultiplier;
  const baseDef = (config.defense ?? 0) * levelMultiplier * enhanceMultiplier;

  const attributeBonus: EquipmentAttributeBonus = {
    hp: baseHp + (affixBonus.hp ?? 0),
    atk: baseAtk + (affixBonus.atk ?? 0),
    def: baseDef + (affixBonus.def ?? 0),
  };

  // 添加词条中的 speed/crit 加成
  if (affixBonus.speed) attributeBonus.speed = affixBonus.speed;
  if (affixBonus.critRate) attributeBonus.critRate = affixBonus.critRate;
  if (affixBonus.critDamage) attributeBonus.critDamage = affixBonus.critDamage;

  // 计算总战力
  const attrPower =
    (attributeBonus.hp ?? 0) * STAT_WEIGHTS.hp +
    (attributeBonus.atk ?? 0) * STAT_WEIGHTS.atk +
    (attributeBonus.def ?? 0) * STAT_WEIGHTS.def +
    (attributeBonus.speed ?? 0) * STAT_WEIGHTS.speed +
    (attributeBonus.critRate ?? 0) * STAT_WEIGHTS.critRate +
    (attributeBonus.critDamage ?? 0) * STAT_WEIGHTS.critDamage;

  // 基础战力 + 属性战力
  const basePower = (config.power ?? 0) * (1 + (level - 1) * 0.1) * (1 + enhanceLevel * 0.05);
  const totalPower = basePower * qualityMultiplier + attrPower;

  return {
    totalPower: Math.round(totalPower),
    attributeBonus,
    breakdown: {
      basePower: Math.round(basePower * qualityMultiplier),
      attrPower: Math.round(attrPower),
      qualityMultiplier,
      levelMultiplier,
      enhanceMultiplier,
    },
  };
}

/**
 * 计算英雄的装备战斗贡献快照。
 *
 * 汇总该英雄所有已穿戴装备的属性加成。
 *
 * @param heroId       英雄 ID
 * @param loadouts     所有穿戴关系
 * @param allInstances 所有装备实例（来自 InventoryService）
 * @param configRepo   配置仓库
 * @returns            EquipmentBattleContribution | null
 */
export function calculateBattleContribution(
  heroId: string,
  loadouts: EquipmentSaveDataV2,
  allInstances: InstanceItem[],
  configRepo: EquipmentConfigRepository,
): EquipmentBattleContribution | null {
  const entry = loadouts.loadouts.find((e) => e.heroId === heroId);
  if (!entry) {
    return null;
  }

  // 建立 uniqueId → InstanceItem 索引
  const instanceMap = new Map<string, InstanceItem>();
  for (const inst of allInstances) {
    instanceMap.set(inst.uniqueId, inst);
  }

  // 汇总所有已穿戴装备
  const attributeBonus: EquipmentAttributeBonus = {};
  let equipmentPower = 0;
  const sourceSlotIds: string[] = [];

  for (const [slotId, uniqueId] of Object.entries(entry.slots)) {
    if (!uniqueId) continue;

    const instance = instanceMap.get(uniqueId);
    if (!instance) continue;

    const config = configRepo.getEquipmentConfigByItemId(instance.itemId);
    if (!config) continue;

    const result = calculatePower(config, instance, configRepo);

    // 属性累加
    if (result.attributeBonus.hp) {
      attributeBonus.hp = (attributeBonus.hp ?? 0) + result.attributeBonus.hp;
    }
    if (result.attributeBonus.atk) {
      attributeBonus.atk = (attributeBonus.atk ?? 0) + result.attributeBonus.atk;
    }
    if (result.attributeBonus.def) {
      attributeBonus.def = (attributeBonus.def ?? 0) + result.attributeBonus.def;
    }
    if (result.attributeBonus.speed) {
      attributeBonus.speed =
        (attributeBonus.speed ?? 0) + result.attributeBonus.speed;
    }
    if (result.attributeBonus.critRate) {
      attributeBonus.critRate =
        (attributeBonus.critRate ?? 0) + result.attributeBonus.critRate;
    }
    if (result.attributeBonus.critDamage) {
      attributeBonus.critDamage =
        (attributeBonus.critDamage ?? 0) + result.attributeBonus.critDamage;
    }

    equipmentPower += result.totalPower;
    sourceSlotIds.push(slotId);
  }

  return {
    heroId,
    attributeBonus,
    equipmentPower: Math.round(equipmentPower),
    sourceSlotIds,
    capturedAt: Date.now(),
  };
}

/**
 * 预览升级后的战力。
 *
 * @param instance   装备实例（不会修改）
 * @param newLevel   目标等级
 * @param configRepo 配置仓库
 * @returns          预览战力结果
 */
export function calculateUpgradePreview(
  instance: InstanceItem,
  newLevel: number,
  configRepo: EquipmentConfigRepository,
): EquipmentPowerResult | null {
  const config = configRepo.getEquipmentConfigByItemId(instance.itemId);
  if (!config) return null;

  // 创建临时实例副本
  const previewInstance: InstanceItem = {
    ...instance,
    level: newLevel,
    extraData: { ...instance.extraData },
  };

  return calculatePower(config, previewInstance, configRepo);
}

/**
 * 预览强化后的战力。
 *
 * @param instance         装备实例（不会修改）
 * @param newEnhanceLevel  目标强化等级
 * @param configRepo       配置仓库
 * @returns                预览战力结果
 */
export function calculateEnhancePreview(
  instance: InstanceItem,
  newEnhanceLevel: number,
  configRepo: EquipmentConfigRepository,
): EquipmentPowerResult | null {
  const config = configRepo.getEquipmentConfigByItemId(instance.itemId);
  if (!config) return null;

  // 创建临时实例副本
  const previewInstance: InstanceItem = {
    ...instance,
    extraData: {
      ...instance.extraData,
      enhanceLevel: newEnhanceLevel,
    },
  };

  return calculatePower(config, previewInstance, configRepo);
}

// ==================== 私有工具 ====================

/**
 * 从词条提取属性加成。
 */
function extractAffixAttributeBonus(
  affix: Record<string, unknown> | undefined,
): Partial<EquipmentAttributeBonus> {
  if (!affix) return {};

  const bonus: Partial<EquipmentAttributeBonus> = {};

  if (typeof affix.hp === 'number') bonus.hp = affix.hp;
  if (typeof affix.atk === 'number') bonus.atk = affix.atk;
  if (typeof affix.def === 'number') bonus.def = affix.def;
  if (typeof affix.speed === 'number') bonus.speed = affix.speed;
  if (typeof affix.critRate === 'number') bonus.critRate = affix.critRate;
  if (typeof affix.critDamage === 'number') bonus.critDamage = affix.critDamage;

  return bonus;
}

/**
 * 默认品质倍率（不依赖 ConfigRepository）。
 */
function getDefaultQualityMultiplier(quality: number): number {
  const multipliers: Record<number, number> = {
    0: 1.0,
    1: 1.5,
    2: 2.5,
    3: 4.0,
  };
  return multipliers[quality] ?? 1.0;
}
