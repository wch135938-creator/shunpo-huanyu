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
/** 装备配置 JSON 顶层结构 */
interface EquipmentConfigData {
  version: string | number;
  name: string;
  growth?: EquipmentGrowthConfigData;
  data: EquipmentConfigEntry[];
}

/** 单项成长消耗规则。 */
interface EquipmentGrowthCostRuleData {
  itemId: string;
  baseCount: number;
  countPerLevel: number;
  startLevel: number;
}

/** equipment_config.json 中的成长配置。 */
interface EquipmentGrowthConfigData {
  maxLevel: number;
  maxEnhanceLevel: number;
  upgradeCostRules: Record<string, EquipmentGrowthCostRuleData[]>;
  enhanceCostRules: Record<string, EquipmentGrowthCostRuleData[]>;
  decomposeStoneReturnRatio: Record<string, number>;
}

const QUALITY_CONFIG_KEYS: Record<number, string> = {
  0: 'Common',
  1: 'Rare',
  2: 'Epic',
  3: 'Legendary',
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

  /** 装备成长配置。缺失时升级/强化安全阻断。 */
  private _growthConfig: EquipmentGrowthConfigData | null = null;

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
          const itemId = this._configIdToItemId(entry.id, entry.type);
          this._itemIdToConfigIdMap.set(itemId, entry.id);
          this._configIdToItemIdMap.set(entry.id, itemId);
        }

        this._growthConfig = eqData.growth ?? null;
        if (!this._growthConfig) {
          console.error('[EquipmentConfigRepository] equipment growth config missing');
        }

        this._configVersion = `${eqData.version}`;
        console.log(
          `[EquipmentConfigRepository] Loaded ${eqData.data.length} equipment configs, version=${this._configVersion}, growth=${this._growthConfig ? 'ready' : 'missing'}`,
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

    const qualityKey = this._getQualityConfigKey(config.quality);
    const rules = this._growthConfig?.upgradeCostRules[qualityKey] ?? [];
    return this._calculateGrowthCosts(rules, fromLevel, toLevel);
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

    const qualityKey = this._getQualityConfigKey(config.quality);
    const rules = this._growthConfig?.enhanceCostRules[qualityKey] ?? [];
    return this._calculateGrowthCosts(rules, fromEnhanceLv, toEnhanceLv);
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
    const qualityKey = this._getQualityConfigKey(quality);
    const ratio = this._growthConfig?.decomposeStoneReturnRatio[qualityKey] ?? 0;
    const rules = this._growthConfig?.upgradeCostRules[qualityKey] ?? [];
    const stoneCost = this._calculateGrowthCosts(rules, 1, level)
      .find((entry) => entry.itemId === 'ITEM_EQUIPMENT_STONE')?.count ?? 0;
    const returnCount = Math.floor(stoneCost * ratio);
    return returnCount > 0
      ? [{ itemId: 'ITEM_EQUIPMENT_STONE', count: returnCount }]
      : [];
  }

  // ==================== 限制查询 ====================

  /** 获取最大装备等级 */
  getMaxLevel(): number {
    return this._growthConfig?.maxLevel ?? 0;
  }

  /** 获取最大强化等级 */
  getMaxEnhanceLevel(): number {
    return this._growthConfig?.maxEnhanceLevel ?? 0;
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
  private _configIdToItemId(configId: string, equipmentType?: string): string {
    // 格式：type_number → TYPE_NUMBER
    const parts = configId.split('_');
    const type = (equipmentType ?? parts[0] ?? 'UNKNOWN').toUpperCase();
    const num = parts[1] ?? '001';
    return `ITEM_EQ_${type}_${num}`;
  }

  /** 同时兼容历史数值品质和 JSON 中的字符串品质。 */
  private _getQualityConfigKey(quality: unknown): string {
    if (typeof quality === 'string' && quality.length > 0) {
      return quality;
    }
    return QUALITY_CONFIG_KEYS[Number(quality)] ?? QUALITY_CONFIG_KEYS[0];
  }

  /** 按等级区间汇总多种资源成本。 */
  private _calculateGrowthCosts(
    rules: EquipmentGrowthCostRuleData[],
    fromLevel: number,
    toLevel: number,
  ): CostEntry[] {
    const totals = new Map<string, number>();
    for (let level = fromLevel; level < toLevel; level++) {
      for (const rule of rules) {
        if (level < rule.startLevel) continue;
        const count = Math.floor(
          rule.baseCount + (level - rule.startLevel) * rule.countPerLevel,
        );
        if (count <= 0) continue;
        totals.set(rule.itemId, (totals.get(rule.itemId) ?? 0) + count);
      }
    }
    return Array.from(totals, ([itemId, count]) => ({ itemId, count }));
  }
}
