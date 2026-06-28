// ============================================================
// EquipmentService.ts — 装备领域服务（唯一写入口）
// 职责：装备穿戴/卸下/升级/强化/分解/查询
// 位置：equipment/ 层
// 边界：
//   · 所有穿戴关系写入 equipmentData
//   · 所有装备实例查询走 InventoryService
//   · 所有消耗/返还/销毁走 InventoryTransaction
//   · 所有战力变化标记 dirty
//   · 所有关键操作发射事件
// ============================================================

import { BaseManager } from '../core/BaseManager';
import { EventManager } from '../core/EventManager';
import { SaveManager } from '../save/SaveManager';
import { InventoryService } from '../inventory/InventoryService';
import type { InstanceItem, InventorySource } from '../inventory/InventoryDomain';
import type { ConsumeAssetRequest, AddAssetRequest } from '../inventory/InventoryTransaction';
import { EquipmentConfigRepository } from './EquipmentConfigRepository';
import {
  type EquipmentSaveDataV2,
  createDefaultEquipmentSaveDataV2,
  findLoadoutEntry,
  ensureLoadoutEntry,
  findEquipmentWearer,
  getAllEquippedUniqueIds,
} from './EquipmentLoadoutData';
import {
  type EquipmentLoadout,
  type EquipmentBattleContribution,
  type EquipmentEquipResult,
  type EquipmentUnequipResult,
  type EquipmentUpgradeResult,
  type EquipmentEnhanceResult,
  type EquipmentDecomposeResult,
  type EquipmentInventoryEntry,
  EquipmentOperationError,
  CORE_SLOT_IDS,
  SLOT_NAME_MAP,
  QUALITY_NAME_MAP,
} from './EquipmentTypes';
import { canEquip, canUnequip, canUpgrade, canEnhance, canDecompose } from './EquipmentSlotRules';
import { calculatePower, calculateBattleContribution, calculateUpgradePreview, calculateEnhancePreview } from './EquipmentPowerCalculator';
import { EquipmentAnalyticsBridge } from './EquipmentAnalyticsBridge';

// ==================== 事件常量 ====================

export const EquipmentEvent = {
  EQUIP: 'equipment:equip',
  UNEQUIP: 'equipment:unequip',
  UPGRADE: 'equipment:upgrade',
  ENHANCE: 'equipment:enhance',
  DECOMPOSE: 'equipment:decompose',
  LOADOUT_CHANGED: 'equipment:loadoutChanged',
} as const;

// ==================== 单例 ====================

export class EquipmentService extends BaseManager {
  private static _instance: EquipmentService | null = null;

  static getInstance(): EquipmentService {
    if (!this._instance) {
      this._instance = new EquipmentService();
    }
    return this._instance;
  }

  // ==================== 依赖 ====================

  private _inventoryService: InventoryService | null = null;
  private _saveManager: SaveManager | null = null;
  private _eventManager: EventManager | null = null;
  private _configRepo: EquipmentConfigRepository | null = null;
  private _analyticsBridge: EquipmentAnalyticsBridge | null = null;
  private _initialized: boolean = false;

  // ==================== 内存数据 ====================

  /** 装备穿戴关系存档数据 */
  private _equipmentData: EquipmentSaveDataV2 = createDefaultEquipmentSaveDataV2();

  constructor() {
    super();
  }

  // ==================== 初始化 ====================

  /**
   * 初始化装备服务。
   *
   * 必须在 InventoryService 和 SaveManager 初始化之后调用。
   */
  initialize(): void {
    if (this._initialized) return;

    this._inventoryService = InventoryService.getInstance();
    this._saveManager = SaveManager.getInstance();
    this._eventManager = EventManager.getInstance();
    this._configRepo = EquipmentConfigRepository.getInstance();
    this._analyticsBridge = EquipmentAnalyticsBridge.getInstance();

    // 从 SaveV2 恢复或创建默认数据
    const loaded = this._saveManager.loadEquipmentDataV2();
    if (loaded) {
      this._equipmentData = loaded;
    } else {
      this._equipmentData = createDefaultEquipmentSaveDataV2();
      this._saveManager.saveEquipmentDataV2(this._equipmentData);
    }

    this._initialized = true;
    console.log('[EquipmentService] 初始化完成');
  }

  /** 是否已初始化 */
  isInitialized(): boolean {
    return this._initialized;
  }

  // ==================== 加载配置 ====================

  /**
   * 加载装备相关配置文件。
   */
  async loadConfigs(): Promise<void> {
    if (!this._configRepo) {
      this._configRepo = EquipmentConfigRepository.getInstance();
    }
    await this._configRepo.loadConfigs();
  }

  // ==================== 穿戴 ====================

  /**
   * 穿戴装备。
   *
   * 流程：
   * 1. 从 Inventory 查询装备实例
   * 2. 校验 hero/slot/category/subType/等级/职业/阵营/锁定/重复穿戴
   * 3. 同槽自动替换（卸下旧装备）
   * 4. 更新 equipmentData.loadouts
   * 5. 标记战力脏
   * 6. 发射事件
   *
   * @param heroId            英雄 ID
   * @param slotId            目标槽位 ID
   * @param equipmentUniqueId 装备实例 uniqueId
   * @param heroLevel         英雄等级（可选，默认 1）
   * @param heroProfession    英雄职业（可选）
   * @param heroFaction       英雄阵营（可选）
   * @returns                 EquipmentEquipResult
   */
  equip(
    heroId: string,
    slotId: string,
    equipmentUniqueId: string,
    heroLevel: number = 1,
    heroProfession?: string,
    heroFaction?: string,
  ): EquipmentEquipResult {
    if (!this._ensureReady()) {
      return {
        success: false,
        errorCode: EquipmentOperationError.INTERNAL_ERROR,
        message: 'EquipmentService 未初始化',
      };
    }

    // 1. 从 Inventory 查询装备实例
    const instance = this._inventoryService!.getInstanceByUniqueId(equipmentUniqueId);
    if (!instance) {
      return {
        success: false,
        errorCode: EquipmentOperationError.INSTANCE_NOT_FOUND,
        message: `装备实例未找到: ${equipmentUniqueId}`,
      };
    }

    // 2. 校验
    const check = canEquip(
      heroId,
      slotId as any,
      instance,
      heroLevel,
      heroProfession,
      heroFaction,
      this._configRepo ?? undefined,
      this._equipmentData,
    );

    if (!check.allowed) {
      return {
        success: false,
        errorCode: check.errorCode,
        message: `穿戴校验失败: ${check.errorCode}`,
      };
    }

    // 3. 同槽自动替换
    const entry = ensureLoadoutEntry(this._equipmentData, heroId);
    const oldUniqueId = entry.slots[slotId] ?? null;

    // 4. 更新 loadout
    entry.slots[slotId] = equipmentUniqueId;
    this._equipmentData.meta.updatedAt = Date.now();
    this._equipmentData.meta.dirtyFlags[heroId] = true;

    // 5. 持久化
    this._saveEquipmentData();
    this._saveManager!.markDirty();

    // 6. 发射事件
    this._eventManager!.emit(EquipmentEvent.EQUIP, {
      heroId,
      slotId,
      equipmentUniqueId,
      replacedUniqueId: oldUniqueId,
    });
    this._eventManager!.emit(EquipmentEvent.LOADOUT_CHANGED, { heroId });

    // 7. Analytics
    if (this._analyticsBridge) {
      this._analyticsBridge.trackEquip(
        heroId,
        slotId,
        equipmentUniqueId,
        instance.itemId,
        instance.quality,
        instance.source,
        oldUniqueId,
      );
    }

    return {
      success: true,
      errorCode: EquipmentOperationError.SUCCESS,
      replacedUniqueId: oldUniqueId,
    };
  }

  // ==================== 卸下 ====================

  /**
   * 卸下装备。
   *
   * 只修改穿戴关系，不销毁资产。
   *
   * @param heroId  英雄 ID
   * @param slotId  槽位 ID
   * @returns       EquipmentUnequipResult
   */
  unequip(
    heroId: string,
    slotId: string,
  ): EquipmentUnequipResult {
    if (!this._ensureReady()) {
      return {
        success: false,
        errorCode: EquipmentOperationError.INTERNAL_ERROR,
        message: 'EquipmentService 未初始化',
      };
    }

    // 校验
    const check = canUnequip(heroId, slotId as any, this._equipmentData);
    if (!check.allowed) {
      return {
        success: false,
        errorCode: check.errorCode,
        message: `卸下校验失败: ${check.errorCode}`,
      };
    }

    // 读取旧装备 uniqueId
    const entry = findLoadoutEntry(this._equipmentData, heroId);
    const oldUniqueId = entry!.slots[slotId]!;
    const instance = this._inventoryService!.getInstanceByUniqueId(oldUniqueId);

    // 清空槽位
    entry!.slots[slotId] = null;
    this._equipmentData.meta.updatedAt = Date.now();
    this._equipmentData.meta.dirtyFlags[heroId] = true;

    // 持久化
    this._saveEquipmentData();
    this._saveManager!.markDirty();

    // 发射事件
    this._eventManager!.emit(EquipmentEvent.UNEQUIP, {
      heroId,
      slotId,
      equipmentUniqueId: oldUniqueId,
    });
    this._eventManager!.emit(EquipmentEvent.LOADOUT_CHANGED, { heroId });

    // Analytics
    if (this._analyticsBridge && instance) {
      this._analyticsBridge.trackUnequip(
        heroId,
        slotId,
        oldUniqueId,
        instance.itemId,
      );
    }

    return {
      success: true,
      errorCode: EquipmentOperationError.SUCCESS,
      unequippedUniqueId: oldUniqueId,
    };
  }

  // ==================== 交换槽位 ====================

  /**
   * 交换同一英雄的两个槽位中的装备。
   *
   * @param heroId      英雄 ID
   * @param fromSlotId  源槽位
   * @param toSlotId    目标槽位
   * @returns           { success, errorCode? }
   */
  swap(
    heroId: string,
    fromSlotId: string,
    toSlotId: string,
  ): { success: boolean; errorCode?: EquipmentOperationError } {
    if (!this._ensureReady()) {
      return {
        success: false,
        errorCode: EquipmentOperationError.INTERNAL_ERROR,
      };
    }

    if (fromSlotId === toSlotId) {
      return { success: true };
    }

    const entry = ensureLoadoutEntry(this._equipmentData, heroId);
    const fromUniqueId = entry.slots[fromSlotId];
    const toUniqueId = entry.slots[toSlotId];

    // 交换
    entry.slots[fromSlotId] = toUniqueId ?? null;
    entry.slots[toSlotId] = fromUniqueId ?? null;
    this._equipmentData.meta.updatedAt = Date.now();
    this._equipmentData.meta.dirtyFlags[heroId] = true;

    this._saveEquipmentData();
    this._saveManager!.markDirty();
    this._eventManager!.emit(EquipmentEvent.LOADOUT_CHANGED, { heroId });

    return { success: true };
  }

  // ==================== 升级 ====================

  /**
   * 升级装备（提升等级，消耗材料）。
   *
   * 流程：
   * 1. 校验（等级上限、材料需求）
   * 2. 检查材料是否充足
   * 3. 消耗材料（InventoryTransaction）
   * 4. 更新等级
   * 5. 发射事件 + Analytics
   *
   * @param equipmentUniqueId  装备实例 uniqueId
   * @returns                  EquipmentUpgradeResult
   */
  upgrade(equipmentUniqueId: string): EquipmentUpgradeResult {
    if (!this._ensureReady()) {
      return {
        success: false,
        errorCode: EquipmentOperationError.INTERNAL_ERROR,
        message: 'EquipmentService 未初始化',
      };
    }

    // 1. 查询实例
    const instance = this._inventoryService!.getInstanceByUniqueId(equipmentUniqueId);
    if (!instance) {
      return {
        success: false,
        errorCode: EquipmentOperationError.INSTANCE_NOT_FOUND,
        message: `装备实例未找到: ${equipmentUniqueId}`,
      };
    }

    // 2. 校验
    if (!this._configRepo) {
      return {
        success: false,
        errorCode: EquipmentOperationError.CONFIG_NOT_LOADED,
      };
    }
    const check = canUpgrade(instance, this._configRepo);
    if (!check.allowed) {
      return {
        success: false,
        errorCode: check.errorCode,
        message: `升级校验失败: ${check.errorCode}`,
      };
    }

    // 3. 预检查材料是否充足
    if (check.cost) {
      for (const cost of check.cost) {
        if (!this._inventoryService!.checkSufficient(cost.itemId, cost.count)) {
          const current = this._inventoryService!.getStackCount(cost.itemId);
          console.warn('[EquipmentService][BLOCK] 资源不足');
          return {
            success: false,
            errorCode: EquipmentOperationError.INSUFFICIENT_MATERIALS,
            message: `资源不足: ${cost.itemId} 需要 ${cost.count}, 当前 ${current}`,
          };
        }
      }
    }

    // 4. 计算战力变化
    const levelBefore = instance.level;
    let powerBefore = 0;
    let statBefore = 'HP 0 / ATK 0 / DEF 0';
    const config = this._configRepo.getEquipmentConfigByItemId(instance.itemId);
    if (config) {
      const powerResultBefore = calculatePower(config, instance, this._configRepo);
      powerBefore = powerResultBefore.totalPower;
      statBefore = this._formatPowerStats(powerResultBefore);
    }
    const wearer = findEquipmentWearer(this._equipmentData, instance.uniqueId);
    const contributionPowerBefore = wearer.equipped && wearer.heroId
      ? this.getHeroEquipmentContribution(wearer.heroId)?.equipmentPower ?? 0
      : null;

    // 5. 消耗材料
    const transactionId = this._generateTransactionId('upgrade', equipmentUniqueId);
    const consumeRequests: ConsumeAssetRequest[] = (check.cost ?? []).map((c) => ({
      itemId: c.itemId,
      count: c.count,
      reason: 'equipment_upgrade_cost' as any,
    }));
    if (consumeRequests.length > 0) {
      const consumeResult = this._inventoryService!.consumeAssets(
        transactionId,
        consumeRequests,
        'equipment_upgrade_cost',
      );
      if (!consumeResult.success) {
        return {
          success: false,
          errorCode: EquipmentOperationError.TRANSACTION_FAILED,
          message: `材料消耗失败: ${consumeResult.message}`,
          costItems: check.cost,
        };
      }
    }

    // 6. 更新等级
    const levelAfter = levelBefore + 1;
    instance.level = levelAfter;

    // 7. 战力计算
    let powerAfter = 0;
    let statAfter = statBefore;
    if (config) {
      const preview = calculateUpgradePreview(instance, levelAfter, this._configRepo);
      powerAfter = preview?.totalPower ?? 0;
      statAfter = this._formatPowerStats(preview);
    }
    const powerDelta = powerAfter - powerBefore;
    const contributionPowerAfter = wearer.equipped && wearer.heroId
      ? this.getHeroEquipmentContribution(wearer.heroId)?.equipmentPower ?? 0
      : null;

    // 8. 持久化
    this._markHeroDirty(instance);
    this._saveManager!.markDirty();

    // 9. 发射事件
    console.log(
      `[EquipmentService][UPGRADE] ${equipmentUniqueId} level ${levelBefore} -> ${levelAfter}, ` +
      `power ${powerBefore} -> ${powerAfter} (${powerDelta >= 0 ? '+' : ''}${powerDelta}), ` +
      `stats ${statBefore} -> ${statAfter}`,
    );
    if (wearer.equipped && wearer.heroId) {
      console.log(
        `[EquipmentService][POWER_REFRESH] hero=${wearer.heroId} equipmentPower ` +
        `${contributionPowerBefore ?? 0} -> ${contributionPowerAfter ?? 0}`,
      );
    }
    this._eventManager!.emit(EquipmentEvent.UPGRADE, {
      uniqueId: equipmentUniqueId,
      levelBefore,
      levelAfter,
      powerDelta,
    });
    console.log('[EquipmentService][LOADOUT_CHANGED]');
    this._eventManager!.emit(EquipmentEvent.LOADOUT_CHANGED, { heroId: wearer.heroId ?? '' });

    // 10. Analytics
    if (this._analyticsBridge) {
      this._analyticsBridge.trackUpgrade(
        transactionId,
        equipmentUniqueId,
        instance.itemId,
        instance.quality,
        levelBefore,
        levelAfter,
        check.cost ?? [],
        powerDelta,
      );
    }

    return {
      success: true,
      errorCode: EquipmentOperationError.SUCCESS,
      levelBefore,
      levelAfter,
      powerDelta,
      costItems: check.cost,
    };
  }

  // ==================== 强化 ====================

  /**
   * 强化装备（提升强化等级，消耗材料）。
   *
   * 强化等级存储在 InstanceItem.extraData.enhanceLevel 中。
   *
   * @param equipmentUniqueId  装备实例 uniqueId
   * @returns                  EquipmentEnhanceResult
   */
  enhance(equipmentUniqueId: string): EquipmentEnhanceResult {
    if (!this._ensureReady()) {
      return {
        success: false,
        errorCode: EquipmentOperationError.INTERNAL_ERROR,
        message: 'EquipmentService 未初始化',
      };
    }

    // 1. 查询实例
    const instance = this._inventoryService!.getInstanceByUniqueId(equipmentUniqueId);
    if (!instance) {
      return {
        success: false,
        errorCode: EquipmentOperationError.INSTANCE_NOT_FOUND,
        message: `装备实例未找到: ${equipmentUniqueId}`,
      };
    }

    // 2. 校验
    if (!this._configRepo) {
      return {
        success: false,
        errorCode: EquipmentOperationError.CONFIG_NOT_LOADED,
      };
    }
    const check = canEnhance(instance, this._configRepo);
    if (!check.allowed) {
      return {
        success: false,
        errorCode: check.errorCode,
        message: `强化校验失败: ${check.errorCode}`,
      };
    }

    // 3. 预检查材料
    if (check.cost) {
      for (const cost of check.cost) {
        if (!this._inventoryService!.checkSufficient(cost.itemId, cost.count)) {
          const current = this._inventoryService!.getStackCount(cost.itemId);
          console.warn('[EquipmentService][BLOCK] 资源不足');
          return {
            success: false,
            errorCode: EquipmentOperationError.INSUFFICIENT_MATERIALS,
            message: `资源不足: ${cost.itemId} 需要 ${cost.count}, 当前 ${current}`,
          };
        }
      }
    }

    // 4. 战力 before
    const enhanceLevelBefore = (instance.extraData?.enhanceLevel as number) ?? 0;
    let powerBefore = 0;
    let statBefore = 'HP 0 / ATK 0 / DEF 0';
    const config = this._configRepo.getEquipmentConfigByItemId(instance.itemId);
    if (config) {
      const powerResultBefore = calculatePower(config, instance, this._configRepo);
      powerBefore = powerResultBefore.totalPower;
      statBefore = this._formatPowerStats(powerResultBefore);
    }
    const wearer = findEquipmentWearer(this._equipmentData, instance.uniqueId);
    const contributionPowerBefore = wearer.equipped && wearer.heroId
      ? this.getHeroEquipmentContribution(wearer.heroId)?.equipmentPower ?? 0
      : null;

    // 5. 消耗材料
    const transactionId = this._generateTransactionId('enhance', equipmentUniqueId);
    const consumeRequests: ConsumeAssetRequest[] = (check.cost ?? []).map((c) => ({
      itemId: c.itemId,
      count: c.count,
      reason: 'equipment_upgrade_cost' as any,
    }));
    if (consumeRequests.length > 0) {
      const consumeResult = this._inventoryService!.consumeAssets(
        transactionId,
        consumeRequests,
        'equipment_upgrade_cost',
      );
      if (!consumeResult.success) {
        return {
          success: false,
          errorCode: EquipmentOperationError.TRANSACTION_FAILED,
          message: `材料消耗失败: ${consumeResult.message}`,
          costItems: check.cost,
        };
      }
    }

    // 6. 更新强化等级
    const enhanceLevelAfter = enhanceLevelBefore + 1;
    if (!instance.extraData) {
      instance.extraData = {};
    }
    instance.extraData.enhanceLevel = enhanceLevelAfter;

    // 7. 战力 after
    let powerAfter = 0;
    let statAfter = statBefore;
    if (config) {
      const preview = calculateEnhancePreview(instance, enhanceLevelAfter, this._configRepo);
      powerAfter = preview?.totalPower ?? 0;
      statAfter = this._formatPowerStats(preview);
    }
    const powerDelta = powerAfter - powerBefore;
    const contributionPowerAfter = wearer.equipped && wearer.heroId
      ? this.getHeroEquipmentContribution(wearer.heroId)?.equipmentPower ?? 0
      : null;

    // 8. 持久化
    this._markHeroDirty(instance);
    this._saveManager!.markDirty();

    // 9. 事件
    console.log(
      `[EquipmentService][ENHANCE] ${equipmentUniqueId} enhance ${enhanceLevelBefore} -> ${enhanceLevelAfter}, ` +
      `power ${powerBefore} -> ${powerAfter} (${powerDelta >= 0 ? '+' : ''}${powerDelta}), ` +
      `stats ${statBefore} -> ${statAfter}`,
    );
    if (wearer.equipped && wearer.heroId) {
      console.log(
        `[EquipmentService][POWER_REFRESH] hero=${wearer.heroId} equipmentPower ` +
        `${contributionPowerBefore ?? 0} -> ${contributionPowerAfter ?? 0}`,
      );
    }
    this._eventManager!.emit(EquipmentEvent.ENHANCE, {
      uniqueId: equipmentUniqueId,
      enhanceLevelBefore,
      enhanceLevelAfter,
      powerDelta,
    });
    console.log('[EquipmentService][LOADOUT_CHANGED]');
    this._eventManager!.emit(EquipmentEvent.LOADOUT_CHANGED, { heroId: wearer.heroId ?? '' });

    // 10. Analytics
    if (this._analyticsBridge) {
      this._analyticsBridge.trackEnhance(
        transactionId,
        equipmentUniqueId,
        instance.itemId,
        instance.quality,
        enhanceLevelBefore,
        enhanceLevelAfter,
        check.cost ?? [],
        powerDelta,
      );
    }

    return {
      success: true,
      errorCode: EquipmentOperationError.SUCCESS,
      enhanceLevelBefore,
      enhanceLevelAfter,
      powerDelta,
      costItems: check.cost,
    };
  }

  // ==================== 分解 ====================

  /**
   * 分解装备。
   *
   * 销毁装备实例 + 返还材料，通过 InventoryTransaction 原子执行。
   *
   * 前置校验：
   *   - 装备未穿戴
   *   - 装备未锁定
   *   - 装备可分解
   *
   * @param equipmentUniqueId  装备实例 uniqueId
   * @returns                  EquipmentDecomposeResult
   */
  decompose(equipmentUniqueId: string): EquipmentDecomposeResult {
    if (!this._ensureReady()) {
      return {
        success: false,
        errorCode: EquipmentOperationError.INTERNAL_ERROR,
        message: 'EquipmentService 未初始化',
      };
    }
    if (!equipmentUniqueId) {
      return {
        success: false,
        errorCode: EquipmentOperationError.INSTANCE_NOT_FOUND,
        message: '装备实例未找到: empty uniqueId',
      };
    }

    // 1. 查询实例
    const instance = this._inventoryService!.getInstanceByUniqueId(equipmentUniqueId);
    if (!instance) {
      return {
        success: false,
        errorCode: EquipmentOperationError.INSTANCE_NOT_FOUND,
      };
    }

    // 2. 校验
    if (!this._configRepo) {
      return {
        success: false,
        errorCode: EquipmentOperationError.CONFIG_NOT_LOADED,
      };
    }
    const check = canDecompose(instance, this._equipmentData, this._configRepo);
    if (!check.allowed) {
      return {
        success: false,
        errorCode: check.errorCode,
        message: `分解校验失败: ${check.errorCode}`,
      };
    }

    // 3. 执行分解事务
    const transactionId = this._generateTransactionId('decompose', equipmentUniqueId);

    // 先销毁装备实例
    const consumeRequests: ConsumeAssetRequest[] = [{
      itemId: instance.itemId,
      count: 1,
      uniqueId: equipmentUniqueId,
      reason: 'equipment_decompose',
    }];
    const consumeResult = this._inventoryService!.consumeAssets(
      transactionId,
      consumeRequests,
      'equipment_decompose',
    );
    if (!consumeResult.success) {
      return {
        success: false,
        errorCode: EquipmentOperationError.TRANSACTION_FAILED,
        message: `装备销毁失败: ${consumeResult.message}`,
      };
    }

    // 返还材料
    const clearedHeroIds = this._clearLoadoutRefs(equipmentUniqueId);
    const returnItems = check.returns ?? [];
    if (returnItems.length > 0) {
      const addRequests: AddAssetRequest[] = returnItems.map((r) => ({
        itemId: r.itemId,
        count: r.count,
        source: 'system_default' as InventorySource,
        reason: 'reward_grant' as any,
      }));
      this._inventoryService!.addAssets(
        `${transactionId}_return`,
        addRequests,
        'reward_grant',
        'system_default',
      );
    }

    // 4. 持久化
    if (clearedHeroIds.length > 0) {
      this._saveEquipmentData();
    }
    this._saveManager!.markDirty();

    // 5. 发射事件
    this._eventManager!.emit(EquipmentEvent.DECOMPOSE, {
      uniqueId: equipmentUniqueId,
      itemId: instance.itemId,
      returnItems,
    });
    console.log('[EquipmentService][LOADOUT_CHANGED]');
    if (clearedHeroIds.length > 0) {
      for (const heroId of clearedHeroIds) {
        this._eventManager!.emit(EquipmentEvent.LOADOUT_CHANGED, { heroId });
      }
    } else {
      this._eventManager!.emit(EquipmentEvent.LOADOUT_CHANGED, { heroId: '' });
    }

    // 6. Analytics（注意：equipment_consume 由 InventoryAnalyticsBridge 自动发射）
    if (this._analyticsBridge) {
      this._analyticsBridge.trackDecompose(
        transactionId,
        equipmentUniqueId,
        instance.itemId,
        instance.quality,
        instance.level,
        returnItems,
        instance.source,
      );
    }

    return {
      success: true,
      errorCode: EquipmentOperationError.SUCCESS,
      returnItems,
      decomposedUniqueId: equipmentUniqueId,
    };
  }

  // ==================== 查询 ====================

  /**
   * 查询装备背包。
   *
   * 从 Inventory Service 查询 category=Equipment 的 InstanceItem，
   * 组合装备配置和穿戴状态。
   *
   * @param filter  可选的 category/subType 过滤
   * @returns       EquipmentInventoryEntry[]
   */
  queryInventory(filter?: {
    subType?: string;
    minQuality?: number;
  }): EquipmentInventoryEntry[] {
    if (!this._ensureReady()) return [];

    const instances = this._inventoryService!.queryInstanceItems({
      category: 'Equipment',
      ...(filter?.subType ? { subType: filter.subType } : {}),
      ...(filter?.minQuality !== undefined
        ? { minQuality: filter.minQuality }
        : {}),
    });

    const entries: EquipmentInventoryEntry[] = [];
    for (const inst of instances) {
      const config = this._configRepo?.getEquipmentConfigByItemId(inst.itemId);
      const wearer = findEquipmentWearer(this._equipmentData, inst.uniqueId);
      let power = 0;
      if (config && this._configRepo) {
        power = calculatePower(config, inst, this._configRepo).totalPower;
      }

      entries.push({
        uniqueId: inst.uniqueId,
        itemId: inst.itemId,
        name: config?.name ?? inst.itemId,
        slotType: this._subTypeToSlotId(inst.subType),
        quality: inst.quality,
        level: inst.level,
        enhanceLevel: (inst.extraData?.enhanceLevel as number) ?? 0,
        power,
        isEquipped: wearer.equipped,
        equippedHeroId: wearer.heroId ?? null,
        equippedSlotId: wearer.slotId ?? null,
        isLocked: inst.lockState === 'locked' || inst.lockState === 'soft_locked',
        bindState: inst.bindState,
      });
    }

    return entries;
  }

  /**
   * 获取英雄装备战斗贡献。
   *
   * 汇总英雄所有已穿戴装备的属性加成。
   *
   * @param heroId  英雄 ID
   * @returns       EquipmentBattleContribution | null
   */
  getHeroEquipmentContribution(
    heroId: string,
  ): EquipmentBattleContribution | null {
    if (!this._ensureReady() || !this._configRepo) return null;

    const allInstances = this._inventoryService!.getAllInstanceItems() as InstanceItem[];
    return calculateBattleContribution(
      heroId,
      this._equipmentData,
      allInstances,
      this._configRepo,
    );
  }

  /**
   * 获取英雄当前穿戴关系。
   *
   * @param heroId  英雄 ID
   * @returns       EquipmentLoadout | null
   */
  getHeroLoadout(heroId: string): EquipmentLoadout | null {
    const entry = findLoadoutEntry(this._equipmentData, heroId);
    if (!entry) return null;

    return {
      heroId: entry.heroId,
      slots: { ...entry.slots },
      updatedAt: this._equipmentData.meta.updatedAt,
    };
  }

  /**
   * 获取所有英雄穿戴关系。
   */
  getAllLoadouts(): EquipmentLoadout[] {
    return this._equipmentData.loadouts.map((entry) => ({
      heroId: entry.heroId,
      slots: { ...entry.slots },
      updatedAt: this._equipmentData.meta.updatedAt,
    }));
  }

  /**
   * 获取原始存档数据（用于 SaveManager / MigrationAdapter）。
   */
  getEquipmentData(): EquipmentSaveDataV2 {
    return this._equipmentData;
  }

  /**
   * 检查装备是否被任何英雄穿戴。
   */
  isEquipped(uniqueId: string): {
    equipped: boolean;
    heroId?: string;
    slotId?: string;
  } {
    return findEquipmentWearer(this._equipmentData, uniqueId);
  }

  // ==================== 私有方法 ====================

  /** 格式化装备属性日志 */
  private _formatPowerStats(
    result: { attributeBonus?: { hp?: number; atk?: number; def?: number } } | null,
  ): string {
    const bonus = result?.attributeBonus;
    const hp = Math.round(bonus?.hp ?? 0);
    const atk = Math.round(bonus?.atk ?? 0);
    const def = Math.round(bonus?.def ?? 0);
    return `HP ${hp} / ATK ${atk} / DEF ${def}`;
  }

  /** 确保服务已就绪 */
  private _ensureReady(): boolean {
    if (!this._initialized) {
      console.error('[EquipmentService] 未初始化，操作被拒绝');
      return false;
    }
    if (!this._inventoryService || !this._inventoryService.isInitialized()) {
      console.error('[EquipmentService] InventoryService 未初始化');
      return false;
    }
    return true;
  }

  /** 持久化 equipmentData 到 SaveManager */
  private _saveEquipmentData(): void {
    if (this._saveManager) {
      this._saveManager.saveEquipmentDataV2(this._equipmentData);
    }
  }

  /** 标记装备穿戴者英雄战力脏 */
  private _markHeroDirty(instance: InstanceItem): void {
    const wearer = findEquipmentWearer(
      this._equipmentData,
      instance.uniqueId,
    );
    if (wearer.equipped && wearer.heroId) {
      this._equipmentData.meta.dirtyFlags[wearer.heroId] = true;
    }
  }

  /** 生成事务 ID */
  private _clearLoadoutRefs(uniqueId: string): string[] {
    const clearedHeroIds: string[] = [];
    if (!uniqueId) return clearedHeroIds;

    for (const entry of this._equipmentData.loadouts) {
      let changed = false;
      for (const slotId of Object.keys(entry.slots)) {
        if (entry.slots[slotId] === uniqueId) {
          entry.slots[slotId] = null;
          changed = true;
        }
      }

      if (changed) {
        this._equipmentData.meta.dirtyFlags[entry.heroId] = true;
        clearedHeroIds.push(entry.heroId);
      }
    }

    if (clearedHeroIds.length > 0) {
      this._equipmentData.meta.updatedAt = Date.now();
    }

    return clearedHeroIds;
  }

  private _generateTransactionId(
    action: string,
    uniqueId: string,
  ): string {
    return `eq_${action}_${uniqueId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /** InstanceItem.subType → EquipmentSlotId */
  private _subTypeToSlotId(subType: string): import('./EquipmentTypes').EquipmentSlotId {
    const map: Record<string, import('./EquipmentTypes').EquipmentSlotId> = {
      Weapon: 'Weapon',
      Armor: 'Armor',
      Accessory: 'Accessory',
    };
    return map[subType] ?? 'Accessory';
  }
}
