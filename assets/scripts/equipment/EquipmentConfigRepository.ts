// ============================================================
// EquipmentConfigRepository.ts — 装备配置仓库
// 职责：读取装备配置、槽位配置、升级/强化消耗、分解返还
// 位置：equipment/ 层
// 边界：只读配置查询，不修改配置、不写入存档
// 规范：缺失配置返回安全 fallback，不崩溃
// ============================================================

import { ConfigManager } from '../core/ConfigManager';
import type { EquipmentConfigEntry, CostEntry, EquipmentSlotId } from './EquipmentTypes';
import { CORE_SLOT_IDS } from './EquipmentTypes';

// ==================== 配置路径常量 ====================

const CONFIG_PATH_EQUIPMENT = 'config/systems/equipment_config';
const CONFIG_PATH_POWER = 'config/systems/power_config';

/** 装备配置 JSON 顶层结构 */
interface EquipmentConfigData {
  version: number;
  name: string;
  data: EquipmentConfigEntry[];
}

/** 战力配置 JSON 顶层结构 */
interface PowerConfigData {
  version: number;
  data: {
    equipmentMultipliers?: Record<string, number>;
    statWeights?: Record<string, number>;
  };
}

// ==================== 升级/强化配置常量（暂无专用 JSON，落在 EquipmentConfigRepository 内） ====================

/**
 * 升级消耗配置（默认常量，未来可迁移到 JSON）。
 *
 * key: 品质, value: 每级消耗 { itemId, baseCount, countPerLevel }
 */
interface UpgradeCostRule {
  itemId: string;
  baseCount: number;
  countPerLevel: number;
}

const DEFAULT_UPGRADE_COST_RULES: Record<number, UpgradeCostRule> = {
  0: { itemId: 'ITEM_EQUIPMENT_STONE', baseCount: 10, countPerLevel: 5 },
  1: { itemId: 'ITEM_EQUIPMENT_STONE', baseCount: 20, countPerLevel: 10 },
  2: { itemId: 'ITEM_EQUIPMENT_STONE', baseCount: 40, countPerLevel: 20 },
  3: { itemId: 'ITEM_EQUIPMENT_STONE', baseCount: 80, countPerLevel: 40 },
};

/** 最大装备等级 */
const DEFAULT_MAX_EQUIPMENT_LEVEL = 50;

/** 强化消耗配置 */
const DEFAULT_ENHANCE_COST_RULES: Record<number, UpgradeCostRule> = {
  0: { itemId: 'ITEM_EQUIPMENT_STONE', baseCount: 5, countPerLevel: 2 },
  1: { itemId: 'ITEM_EQUIPMENT_STONE', baseCount: 10, countPerLevel: 5 },
  2: { itemId: 'ITEM_GOLD', baseCount: 1000, countPerLevel: 500 },
  3: { itemId: 'ITEM_GOLD', baseCount: 2000, countPerLevel: 1000 },
};

/** 最大强化等级 */
const DEFAULT_MAX_ENHANCE_LEVEL = 20;

/**
 * 分解返还比例。
 *
 * key: 品质, value: 返还比例（0~1）
 */
const DECOMPOSE_RETURN_RATIO: Record<number, number> = {
  0: 0.3,
  1: 0.5,
  2: 0.7,
  3: 0.9,
};

// ==================== 单例 ====================

export class EquipmentConfigRepository {
  private static _instance: EquipmentConfigRepository | null = null;

  static getInstance(): EquipmentConfigRepository {
    if (!this._instance) {
      this._instance = new EquipmentConfigRepository();
    }
    return this._instance;
  }

  // ==================== 内部缓存 ====================

  /** configId → EquipmentConfigEntry */
  private _equipmentConfigMap: Map<string, EquipmentConfigEntry> = new Map();

  /** itemId → configId（Inventory itemId 到装备配置 ID 的映射） */
  private _itemIdToConfigIdMap: Map<string, string> = new Map();

  /** configId → itemId（反向映射） */
  private _configIdToItemIdMap: Map<string, string> = new Map();

  /** 装备配置版本号 */
  private _configVersion: string = '';

  /** 是否已加载 */
  private _loaded: boolean = false;

  /** 允许的槽位列表（可由外部注入） */
  private _allowedSlotIds: EquipmentSlotId[] = [...CORE_SLOT_IDS];

  // ==================== 初始化 ====================

  /**
   * 加载装备配置。
   *
   * 必须在使用其他查询方法之前调用。
   */
  async loadConfigs(): Promise<void> {
    try {
      const configManager = ConfigManager.getInstance();

      // 加载装备配置
      const eqData = await configManager.loadConfig<EquipmentConfigData>(
        CONFIG_PATH_EQUIPMENT,
      );

      if (eqData && eqData.data) {
        this._equipmentConfigMap.clear();
        this._itemIdToConfigIdMap.clear();
        this._configIdToItemIdMap.clear();

        for (const entry of eqData.data) {
          this._equipmentConfigMap.set(entry.id, entry);

          // 构建 itemId ↔ configId 映射
          // 约定：Inventory itemId = "ITEM_EQ_" + configType.toUpperCase() + "_" + qualitySuffix
          const itemId = this._configIdToItemId(entry.id);
          this._itemIdToConfigIdMap.set(itemId, entry.id);
          this._configIdToItemIdMap.set(entry.id, itemId);
        }

        this._configVersion = `${eqData.version}`;
        console.log(
          `[EquipmentConfigRepository] Loaded ${eqData.data.length} equipment configs, version=${this._configVersion}`,
        );
      }

      this._loaded = true;
    } catch (error) {
      console.error('[EquipmentConfigRepository] Failed to load equipment configs:', error);
      // 即使加载失败也标记为已加载，使用空数据 fallback
      this._loaded = true;
    }
  }

  /** 配置是否已加载 */
  isLoaded(): boolean {
    return this._loaded;
  }

  /** 获取配置版本号 */
  getConfigVersion(): string {
    return this._configVersion;
  }

  // ==================== 装备配置查询 ====================

  /**
   * 通过 configId 获取装备配置。
   *
   * @param configId  装备配置 ID（如 "weapon_001"）
   * @returns         EquipmentConfigEntry | null
   */
  getEquipmentConfig(configId: string): EquipmentConfigEntry | null {
    const result = this._equipmentConfigMap.get(configId) ?? null;
    if (!result) {
      console.warn(
        `[EquipmentConfigRepository] Equipment config not found: ${configId}`,
      );
    }
    return result;
  }

  /**
   * 通过 Inventory itemId 获取装备配置。
   *
   * @param itemId  物品 ID（如 "ITEM_EQ_WEAPON_001"）
   * @returns       EquipmentConfigEntry | null
   */
  getEquipmentConfigByItemId(itemId: string): EquipmentConfigEntry | null {
    const configId = this._itemIdToConfigIdMap.get(itemId);
    if (!configId) {
      console.warn(
        `[EquipmentConfigRepository] No configId mapping for itemId: ${itemId}`,
      );
      return null;
    }
    return this.getEquipmentConfig(configId);
  }

  /**
   * 获取所有装备配置。
   */
  getAllEquipmentConfigs(): EquipmentConfigEntry[] {
    return Array.from(this._equipmentConfigMap.values());
  }

  // ==================== 槽位配置 ====================

  /**
   * 获取允许的槽位列表。
   */
  getAllowedSlotIds(): EquipmentSlotId[] {
    return [...this._allowedSlotIds];
  }

  /**
   * 检查槽位是否在允许列表中。
   */
  isSlotAllowed(slotId: string): boolean {
    return this._allowedSlotIds.includes(slotId as EquipmentSlotId);
  }

  /**
   * 由外部注入槽位配置（如迁移适配器或未来扩展）。
   */
  setAllowedSlotIds(slotIds: EquipmentSlotId[]): void {
    this._allowedSlotIds = [...slotIds];
  }

  // ==================== 消耗配置 ====================

  /**
   * 计算装备升级消耗。
   *
   * @param configId   装备配置 ID
   * @param fromLevel  当前等级
   * @param toLevel    目标等级
   * @returns          消耗列表，配置缺失时返回空数组
   */
  getUpgradeCost(
    configId: string,
    fromLevel: number,
    toLevel: number,
  ): CostEntry[] {
    const config = this.getEquipmentConfig(configId);
    if (!config) {
      return [];
    }

    const quality = config.quality ?? 0;
    const rule = DEFAULT_UPGRADE_COST_RULES[quality] ?? DEFAULT_UPGRADE_COST_RULES[0];
    if (!rule) {
      return [];
    }

    // 计算总消耗
    let totalCount = 0;
    for (let lv = fromLevel; lv < toLevel; lv++) {
      totalCount += rule.baseCount + lv * rule.countPerLevel;
    }

    return totalCount > 0 ? [{ itemId: rule.itemId, count: totalCount }] : [];
  }

  /**
   * 计算装备强化消耗。
   *
   * @param configId       装备配置 ID
   * @param fromEnhanceLv  当前强化等级
   * @param toEnhanceLv    目标强化等级
   * @returns              消耗列表
   */
  getEnhanceCost(
    configId: string,
    fromEnhanceLv: number,
    toEnhanceLv: number,
  ): CostEntry[] {
    const config = this.getEquipmentConfig(configId);
    if (!config) {
      return [];
    }

    const quality = config.quality ?? 0;
    const rule = DEFAULT_ENHANCE_COST_RULES[quality] ?? DEFAULT_ENHANCE_COST_RULES[0];
    if (!rule) {
      return [];
    }

    let totalCount = 0;
    for (let lv = fromEnhanceLv; lv < toEnhanceLv; lv++) {
      totalCount += rule.baseCount + lv * rule.countPerLevel;
    }

    return totalCount > 0 ? [{ itemId: rule.itemId, count: totalCount }] : [];
  }

  /**
   * 计算装备分解返还。
   *
   * @param configId  装备配置 ID
   * @param quality   装备品质
   * @param level     装备等级
   * @returns         返还材料列表
   */
  getDecomposeReturn(
    configId: string,
    quality: number,
    level: number,
  ): CostEntry[] {
    const config = this.getEquipmentConfig(configId);
    if (!config) {
      return [];
    }

    // 不可分解
    if (config.canDecompose === false) {
      return [];
    }

    // 计算升级消耗返还（按品质比例）
    const ratio = DECOMPOSE_RETURN_RATIO[quality] ?? 0.3;
    const upgradeRule = DEFAULT_UPGRADE_COST_RULES[quality] ?? DEFAULT_UPGRADE_COST_RULES[0];
    if (!upgradeRule) {
      return [];
    }

    // 总计升级到当前等级的成本
    let totalUpgradeCost = 0;
    for (let lv = 1; lv < level; lv++) {
      totalUpgradeCost += upgradeRule.baseCount + lv * upgradeRule.countPerLevel;
    }

    const returnCount = Math.floor(totalUpgradeCost * ratio);
    return returnCount > 0
      ? [{ itemId: upgradeRule.itemId, count: returnCount }]
      : [];
  }

  // ==================== 限制查询 ====================

  /** 获取最大装备等级 */
  getMaxLevel(): number {
    return DEFAULT_MAX_EQUIPMENT_LEVEL;
  }

  /** 获取最大强化等级 */
  getMaxEnhanceLevel(): number {
    return DEFAULT_MAX_ENHANCE_LEVEL;
  }

  /** 品质对应的战力倍率 */
  getQualityPowerMultiplier(quality: number): number {
    const multipliers: Record<number, number> = {
      0: 1.0,
      1: 1.5,
      2: 2.5,
      3: 4.0,
    };
    return multipliers[quality] ?? 1.0;
  }

  // ==================== 映射工具 ====================

  /** Inventory itemId → 装备 configId */
  itemIdToConfigId(itemId: string): string | null {
    return this._itemIdToConfigIdMap.get(itemId) ?? null;
  }

  /** 装备 configId → Inventory itemId */
  configIdToItemId(configId: string): string | null {
    return this._configIdToItemIdMap.get(configId) ?? null;
  }

  /** 获取所有已知装备 itemId */
  getAllEquipmentItemIds(): string[] {
    return Array.from(this._itemIdToConfigIdMap.keys());
  }

  // ==================== 私有工具 ====================

  /**
   * 从 configId 推算 Inventory itemId。
   *
   * 约定：configId 如 "weapon_001" → itemId "ITEM_EQ_WEAPON_001"
   */
  private _configIdToItemId(configId: string): string {
    // 格式：type_number → TYPE_NUMBER
    const parts = configId.split('_');
    const type = parts[0]?.toUpperCase() ?? 'UNKNOWN';
    const num = parts[1] ?? '001';
    return `ITEM_EQ_${type}_${num}`;
  }
}
