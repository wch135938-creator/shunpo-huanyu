// ============================================================
// InventoryService.ts — 统一资产操作入口
// 职责：查询/增加/消耗/检查 / 调用 InventoryTransaction / 对接 RewardSystem / Analytics / SaveV2
// 位置：inventory/ 层
// 边界：不得决定奖励掉落 / 不得决定装备属性 / 不得决定活动规则
// 规范：RewardSystem → InventoryService → SaveV2
// ============================================================

import { BaseManager } from '../core/BaseManager';
import { ConfigManager } from '../core/ConfigManager';
import { EventManager } from '../core/EventManager';
import { SaveManager } from '../save/SaveManager';
import type { SaveContainerV8 } from '../save/SaveContainerV8';
import { InventoryRepository } from './InventoryRepository';
import { InventoryTransaction } from './InventoryTransaction';
import { InventoryAnalyticsBridge } from './InventoryAnalyticsBridge';
import type { AnalyticsEventCallback } from './InventoryAnalyticsBridge';
import type {
  StackItem,
  InstanceItem,
  InventorySource,
  InventoryChangeReason,
  InventoryQueryFilter,
} from './InventoryDomain';
import type {
  InventorySaveData,
  InventoryRewardSnapshot,
} from './InventorySaveData';
import {
  createDefaultInventorySaveData,
  buildCurrencyIndex,
  trimTransactions,
  trimSnapshots,
} from './InventorySaveData';
import {
  INITIAL_EQUIPMENT_ACCESSORY_ITEM_ID,
  INITIAL_EQUIPMENT_ARMOR_ITEM_ID,
  INITIAL_EQUIPMENT_ITEM_IDS,
  INITIAL_EQUIPMENT_WEAPON_ITEM_ID,
} from './InventoryDomain';
import type {
  TransactionResult,
  AddAssetRequest,
  ConsumeAssetRequest,
} from './InventoryTransaction';
import type {
  AggregatedReward,
  RewardEntry,
  RewardSourceType,
} from '../reward/RewardTypes';
import { RewardEvent, type RewardGrantedEvent } from '../reward/RewardSystem';
import type { GlobalConstConfig, GlobalPlayerEntry } from '../config/global_config';

// ==================== 事件名常量 ====================

export const InventoryEvent = {
  /** 资产变更完成 */
  INVENTORY_CHANGED: 'inventory:changed',
  /** 堆叠资产更新 */
  STACK_CHANGED: 'inventory:stackChanged',
  /** 实例资产更新 */
  INSTANCE_CHANGED: 'inventory:instanceChanged',
  /** 货币变更 */
  CURRENCY_CHANGED: 'inventory:currencyChanged',
  /** 事务完成 */
  TRANSACTION_COMPLETE: 'inventory:transactionComplete',
} as const;

const LEGACY_QINGFENG_REPAIR_TRANSACTION_ID = 'txn_initial_equipment_weapon_repair_v1';
const QINGFENG_FINAL_REPAIR_TRANSACTION_ID = 'txn_initial_equipment_weapon_repair_v2';

// ==================== 事件载荷 ====================

export interface InventoryChangedEvent {
  transactionId: string;
  changes: Array<{ itemId: string; delta: number; after: number; category: string }>;
  reason: string;
}

// ==================== InventoryService ====================

export class InventoryService extends BaseManager {
  // ===== 单例 =====

  static getInstance(): InventoryService {
    return super.getInstance<InventoryService>();
  }

  // ===== 依赖 =====

  private _eventManager: EventManager;
  private _saveManager: SaveManager;
  private _repository: InventoryRepository;
  private _transaction: InventoryTransaction;
  private _analyticsBridge: InventoryAnalyticsBridge;

  // ===== 内部状态 =====

  private _initialized = false;
  private _saveData: InventorySaveData = createDefaultInventorySaveData();
  private _initialEconomyGrantPromise: Promise<void> | null = null;

  constructor() {
    super();
    this._eventManager = EventManager.getInstance();
    this._saveManager = SaveManager.getInstance();
    this._repository = InventoryRepository.getInstance();
    this._transaction = new InventoryTransaction();
    this._analyticsBridge = InventoryAnalyticsBridge.getInstance();
  }

  // ===== 初始化 =====

  /**
   * 初始化 InventoryService。
   *
   * 流程：
   * 1. 初始化 InventoryRepository（加载分类规则）
   * 2. 从 SaveV2 恢复或创建默认 InventorySaveData
   * 3. 将数据绑定到 InventoryTransaction
   * 4. 注册 RewardSystem 事件监听
   * 5. 注入 Analytics 事件回调
   */
  initialize(): void {
    if (this._initialized) return;

    console.log('[InventoryInit] initialize start');

    // Step 1: 初始化 Repository
    this._repository.initialize();

    // Step 2: 从 SaveV2 恢复或创建默认数据
    const v8 = this._saveManager.getData() as SaveContainerV8 | null;
    if (v8) {
      if (!v8.inventoryData) {
        // 旧存档自动补全
        v8.inventoryData = createDefaultInventorySaveData();
        this._saveManager.markDirty();
      } else {
        // 确保所有子字段存在
        this._ensureInventoryDataFields(v8.inventoryData);
      }
      this._saveData = v8.inventoryData;
    } else {
      this._saveData = createDefaultInventorySaveData();
    }

    // Step 3: 绑定数据到 Transaction
    this._transaction.bindData(this._saveData);

    // Phase10-Step11AC: 标记初始化完成（必须在 _grantInitialEquipment 之前，
    // 防止 addAssets() / consumeAssets() 的懒初始化触发递归 initialize()）。
    this._initialized = true;

    // Step 4: 注入 Analytics 回调
    this._analyticsBridge.setEmitCallback(this._analyticsEmitHandler);

    // Step 5: 注册 RewardSystem 事件监听
    this._registerRewardListener();

    // Phase10-Step11AA: 首次初始化时发放初始装备
    // 注意：必须在 _initialized = true 之后调用（addAssets 会检查 isInitialized）
    if (!this._saveData.meta.initialEquipmentGranted && this._saveData.instanceItems.length === 0) {
      console.log('[InventoryInit] grant initial equipment');
      this._grantInitialEquipment();
    }
    this._repairMissingInitialWeapon();
    this._scheduleInitialEconomyGrant();

    console.log(
      `[InventoryInit] initialize completed, instanceItems=${this._saveData.instanceItems.length}, initialized=${this._initialized}`,
    );
  }

  /** 是否已初始化 */
  isInitialized(): boolean {
    return this._initialized;
  }

  // ===== 内部数据完整性保证 =====

  private _ensureInventoryDataFields(data: InventorySaveData): void {
    if (!data.stackItems) data.stackItems = [];
    if (!data.instanceItems) data.instanceItems = [];
    if (!data.currencies) data.currencies = { gold: 0, spiritStone: 0, diamond: 0 };
    if (!data.claimStates) data.claimStates = {};
    if (!data.transactions) data.transactions = [];
    if (!data.snapshots) data.snapshots = [];
    if (!data.meta) {
      data.meta = {
        version: 1,
        updatedAt: Date.now(),
        nextCleanupAt: Date.now() + 86400000,
        cleanedUp: false,
        initialEquipmentGranted: false,
        initialEquipmentMaterialsGranted: false,
      };
    }
    const hasInitialWeapon = data.instanceItems.some(
      (item) => item.itemId === INITIAL_EQUIPMENT_WEAPON_ITEM_ID,
    );
    const hasInitialArmor = data.instanceItems.some(
      (item) => item.itemId === INITIAL_EQUIPMENT_ARMOR_ITEM_ID,
    );
    const hasInitialAccessory = data.instanceItems.some(
      (item) => item.itemId === INITIAL_EQUIPMENT_ACCESSORY_ITEM_ID,
    );
    const shouldNormalizeInitialGrantState =
      data.meta.initialEquipmentGranted === undefined
      || (!data.meta.initialEquipmentGranted && hasInitialArmor && hasInitialAccessory);
    if (shouldNormalizeInitialGrantState) {
      data.meta.initialEquipmentGranted = hasInitialWeapon || (hasInitialArmor && hasInitialAccessory);
      this._saveManager.markDirty();
      console.log(
        `[Step12A-C1.4][InventoryInit] initialEquipmentGranted normalized to ${data.meta.initialEquipmentGranted}, ` +
        `initialEquipInInventory=[${data.instanceItems.filter((i) => INITIAL_EQUIPMENT_ITEM_IDS.indexOf(i.itemId) >= 0).map((i) => i.itemId).join(', ')}]`,
      );
    }
    if (data.meta.initialEquipmentMaterialsGranted === undefined) {
      data.meta.initialEquipmentMaterialsGranted = false;
    }
  }

  /**
   * Phase10-Step11AC: 发放初始装备。
   *
   * 新存档首次初始化时调用，发放 Common 品质武器/护甲/饰品各一件。
   * 设置 meta.initialEquipmentGranted = true 防止重复发放。
   *
   * 防重入：检查 meta.initialEquipmentGranted 作为第二道防线，
   *         即使被意外多次调用也不会重复发放。
   */
  private _grantInitialEquipment(): void {
    // 防重入：meta flag 是最可靠的真实来源（写入发生在事务成功后）
    if (this._saveData.meta.initialEquipmentGranted) {
      console.log('[InventoryInit] grant initial equipment — already granted, skipped');
      return;
    }

    const transactionId = 'txn_initial_equipment_grant';
    const requests: AddAssetRequest[] = INITIAL_EQUIPMENT_ITEM_IDS.map((itemId) => ({
      itemId,
      count: 1,
      source: 'system_default' as InventorySource,
      reason: 'reward_grant' as InventoryChangeReason,
    }));

    const result = this.addAssets(
      transactionId,
      requests,
      'reward_grant',
      'system_default',
    );

    if (result.success) {
      this._saveData.meta.initialEquipmentGranted = true;
      console.log(
        `[InventoryService] 初始装备发放完成: ${INITIAL_EQUIPMENT_ITEM_IDS.join(', ')}`,
      );
    } else {
      console.warn(
        `[InventoryService] 初始装备发放失败: errorCode=${result.errorCode}, message=${result.message}`,
      );
    }
  }

  /**
   * 最终修复旧异常存档：布衣和铜戒仍在、青锋剑缺失时，独立补发一次。
   * v2 事务自身负责幂等；旧 v1 claim 和旧消费记录只用于诊断，避免它们
   * 永久拦截本轮针对已确认异常存档的补偿。
   */
  private _repairMissingInitialWeapon(): void {
    const TAG = '[Step12A-C1.4][QingfengRepair]';

    if (this._saveData.instanceItems.some((item) => (
      item.itemId === INITIAL_EQUIPMENT_WEAPON_ITEM_ID
    ))) {
      console.log(
        `${TAG} 跳过: ITEM_EQ_WEAPON_001 已存在, ` +
        `count=${this._saveData.instanceItems.filter((i) => i.itemId === INITIAL_EQUIPMENT_WEAPON_ITEM_ID).length}`,
      );
      return;
    }

    const hasArmor = this._saveData.instanceItems.some((item) => (
      item.itemId === INITIAL_EQUIPMENT_ARMOR_ITEM_ID
    ));
    const hasAccessory = this._saveData.instanceItems.some((item) => (
      item.itemId === INITIAL_EQUIPMENT_ACCESSORY_ITEM_ID
    ));
    if (!hasArmor || !hasAccessory) {
      console.log(
        `${TAG} 跳过: 缺少布衣(${hasArmor})或铜戒(${hasAccessory}), ` +
        `无法确认是初始装备丢失场景`,
      );
      return;
    }

    if (this._saveData.claimStates[QINGFENG_FINAL_REPAIR_TRANSACTION_ID]?.claimed) {
      console.log(`${TAG} 跳过: v2 补偿事务已领取`);
      return;
    }

    const legacyRepairClaimed = this._saveData.claimStates[LEGACY_QINGFENG_REPAIR_TRANSACTION_ID]?.claimed === true;
    const wasRemovedByPlayer = this._saveData.transactions.some((transaction) => (
      transaction.success
      && transaction.changeType === 'consume'
      && transaction.itemIds.indexOf(INITIAL_EQUIPMENT_WEAPON_ITEM_ID) >= 0
    ));

    console.log(
      `${TAG} 执行青锋剑补发: 布衣+铜戒存在，青锋剑缺失, `
      + `legacyRepairClaimed=${legacyRepairClaimed}, historicallyConsumed=${wasRemovedByPlayer}`,
    );
    const result = this.addAssets(
      QINGFENG_FINAL_REPAIR_TRANSACTION_ID,
      [{
        itemId: INITIAL_EQUIPMENT_WEAPON_ITEM_ID,
        count: 1,
        source: 'system_default',
        reason: 'reward_grant',
      }],
      'reward_grant',
      'system_default',
    );
    if (result.success && !result.isDuplicate) {
      this._saveData.meta.initialEquipmentGranted = true;
      this._saveManager.save();
      console.log(`${TAG} 青锋剑补发完成: transactionId=${QINGFENG_FINAL_REPAIR_TRANSACTION_ID}`);
    } else if (result.isDuplicate) {
      console.log(`${TAG} 青锋剑补发已幂等拦截 (duplicate transaction)`);
    } else {
      console.warn(`${TAG} 青锋剑补发失败: errorCode=${result.errorCode}, message=${result.message}`);
    }
  }

  // ===== Analytics 回调 =====

  /**
   * 初始经济资源依赖 global_const，配置尚未就绪时主动等待加载完成。
   * 事务 ID 保证每份存档只发放一次；v3 用于修复旧启动时序下“日志成功但 UI 资产为 0”的测试存档。
   */
  private _scheduleInitialEconomyGrant(): void {
    if (this._initialEconomyGrantPromise) return;

    const configManager = ConfigManager.getInstance();
    const cachedConfig = configManager.getConfig<GlobalConstConfig>(
      'config/systems/global_const',
    );
    if (cachedConfig) {
      this._grantInitialEconomyFromConfig(cachedConfig);
      this._initialEconomyGrantPromise = Promise.resolve();
      return;
    }

    this._initialEconomyGrantPromise = configManager
      .loadConfig<GlobalConstConfig>('config/systems/global_const')
      .then((config) => {
        this._grantInitialEconomyFromConfig(config);
      })
      .catch((error: unknown) => {
        console.warn('[InventoryService] 初始经济配置加载失败:', error);
      });
  }

  /** 将 global_const 的初始强化石、金币、钻石统一写入 Inventory 真相源。 */
  private _grantInitialEconomyFromConfig(globalConfig: GlobalConstConfig): void {
    const playerConfig = this._getInitialPlayerConfig(globalConfig);
    if (!playerConfig) {
      console.warn('[InventoryService] GLOBAL_PLAYER 未找到，无法发放初始经济资源');
      return;
    }

    const configuredAssets = [
      {
        itemId: 'ITEM_EQUIPMENT_STONE',
        targetCount: playerConfig.initialEquipmentStone,
      },
      {
        itemId: 'ITEM_GOLD',
        targetCount: playerConfig.initialGold,
      },
      {
        itemId: 'ITEM_DIAMOND',
        targetCount: playerConfig.initialDiamond,
      },
    ];
    const before = configuredAssets.map(
      (asset) => `${asset.itemId}=${this.getStackCount(asset.itemId)}`,
    );
    const requests: AddAssetRequest[] = configuredAssets
      .map((asset) => ({
        itemId: asset.itemId,
        count: Math.max(0, asset.targetCount - this.getStackCount(asset.itemId)),
        source: 'system_default' as InventorySource,
        reason: 'reward_grant' as InventoryChangeReason,
      }))
      .filter((request) => request.count > 0);

    const result = this.addAssets(
      'txn_initial_player_economy_v3',
      requests,
      'reward_grant',
      'system_default',
    );
    const after = configuredAssets.map(
      (asset) => `${asset.itemId}=${this.getStackCount(asset.itemId)}`,
    );

    if (result.success && !result.isDuplicate) {
      console.log(
        `[InventoryService] 初始经济资源发放完成: before=${before.join(', ')} after=${after.join(', ')}`,
      );
    } else if (!result.success) {
      console.warn(
        `[InventoryService] 初始经济资源发放失败: errorCode=${result.errorCode}, message=${result.message}`,
      );
    }
  }

  private _getInitialPlayerConfig(
    globalConfig: GlobalConstConfig,
  ): GlobalPlayerEntry | null {
    return globalConfig?.data.find(
      (entry): entry is GlobalPlayerEntry => entry.id === 'GLOBAL_PLAYER',
    ) ?? null;
  }

  private _analyticsEmitHandler: AnalyticsEventCallback = (eventName, payload) => {
    // 通过 EventManager 转发给 AnalyticsSystem
    // AnalyticsSystem 监听该事件自行处理
    this._eventManager.emit(`inventory:analytics:${eventName}`, payload);
  };

  // ===== RewardSystem 集成 =====

  /**
   * 注册 RewardSystem REWARD_GRANTED 事件监听。
   *
   * 当 RewardSystem 完成奖励计算并发放时，InventoryService 自动接收
   * 并将奖励资产入库。
   */
  private _registerRewardListener(): void {
    this._eventManager.on(
      RewardEvent.REWARD_GRANTED,
      (payload: unknown) => {
        const event = payload as RewardGrantedEvent;
        if (!event || !event.aggregated) return;

        this._processRewardGrant(event.aggregated, event.transactionId, event.source);
      },
    );
  }

  /**
   * 处理 RewardSystem 发放的奖励，将资产入库。
   */
  /**
   * [Step12A-A] 经验奖励排除列表。
   * 这些 itemType / itemId 不得进入背包 stackItems / instanceItems，
   * 经验由后续 Coordinator 调用 HeroSystem.addHeroExp 处理。
   */
  private static readonly EXP_REWARD_ITEM_TYPES: ReadonlySet<string> = new Set([
    'exp',
    'hero_exp',
    'experience',
  ]);

  private static readonly EXP_REWARD_ITEM_IDS: ReadonlySet<string> = new Set([
    'ITEM_EXP',
    'ITEM_HERO_EXP',
    'ITEM_EXPERIENCE',
  ]);

  private _processRewardGrant(
    aggregated: AggregatedReward,
    transactionId: string,
    source: RewardSourceType,
  ): void {
    if (!aggregated.rawRewards || aggregated.rawRewards.length === 0) return;

    // [Step12A-A] 过滤经验类奖励，不让 exp 进入背包
    const filteredRewards = aggregated.rawRewards.filter((entry) => {
      const isExpType = InventoryService.EXP_REWARD_ITEM_TYPES.has(entry.itemType);
      const isExpId = InventoryService.EXP_REWARD_ITEM_IDS.has(entry.itemId);
      if (isExpType || isExpId) {
        console.log(
          `[Step12A-A][InventoryService] 经验奖励不入库: itemId=${entry.itemId}, ` +
          `itemType=${entry.itemType}, count=${entry.count}, txn=${transactionId}`,
        );
        return false;
      }
      return true;
    });

    if (filteredRewards.length === 0) {
      console.log(
        `[Step12A-A][InventoryService] 过滤后无可入库奖励: txn=${transactionId}`,
      );
      return;
    }

    // 将 RewardEntry 转为 AddAssetRequest
    const requests: AddAssetRequest[] = [];
    for (const entry of filteredRewards) {
      requests.push({
        itemId: entry.itemId,
        count: entry.count,
        quality: 0,
        source: this._mapRewardSource(source),
        reason: 'reward_grant',
      });
    }

    // 执行入库
    const result = this.addAssets(transactionId, requests, 'reward_grant', this._mapRewardSource(source));

    // 保存快照
    if (result.success && !result.isDuplicate) {
      this._saveRewardSnapshot(aggregated, transactionId, result);
    }

    // 标记脏数据
    this._saveManager.markDirty();
  }

  private _mapRewardSource(source: RewardSourceType): InventorySource {
    const mapping: Record<RewardSourceType, InventorySource> = {
      chapter: 'chapter_reward',
      event: 'event_reward',
      enemy: 'boss_reward',
      battle: 'battle_drop',
      pool: 'activity_reward',
      mail: 'mail_compensation',
      redeem: 'activity_reward',
      login: 'activity_reward',
    };
    return mapping[source] ?? 'system_default';
  }

  // ===== 公共 API — 资产增加 =====

  /**
   * 增加资产（带事务 ID，幂等）。
   *
   * @param transactionId  事务 ID
   * @param requests        要添加的资产列表
   * @param reason          变更原因
   * @param source          资产来源
   * @returns               事务结果
   */
  addAssets(
    transactionId: string,
    requests: AddAssetRequest[],
    reason: InventoryChangeReason,
    source: InventorySource,
  ): TransactionResult {
    if (!this._initialized) {
      this.initialize();
    }

    const result = this._transaction.addAssets(transactionId, requests, reason, source);

    // 发射 Analytics 事件
    this._analyticsBridge.emitTransactionEvents(result, reason, source);

    // 发射 Inventory 变更事件
    if (result.success && !result.isDuplicate) {
      this._eventManager.emit(InventoryEvent.INVENTORY_CHANGED, {
        transactionId: result.transactionId,
        changes: result.changes,
        reason,
      } satisfies InventoryChangedEvent);

      this._eventManager.emit(InventoryEvent.TRANSACTION_COMPLETE, result);

      // 货币变更通知
      this._emitCurrencyEvents();
    }

    // 标记脏数据
    this._saveManager.markDirty();

    return result;
  }

  /**
   * 直接增加资产（无事务，简单场景用）。
   *
   * 自动生成事务 ID。推荐使用 addAssets() 进行正式发奖。
   */
  addAssetsSimple(
    itemId: string,
    count: number,
    reason: InventoryChangeReason,
    source: InventorySource,
  ): TransactionResult {
    const transactionId = `txn_simple_${itemId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return this.addAssets(
      transactionId,
      [{ itemId, count, source, reason }],
      reason,
      source,
    );
  }

  // ===== 公共 API — 资产消耗 =====

  /**
   * 消耗资产（带事务 ID，幂等）。
   *
   * @param transactionId  事务 ID
   * @param requests        要消耗的资产列表
   * @param reason          变更原因
   * @returns               事务结果
   */
  consumeAssets(
    transactionId: string,
    requests: ConsumeAssetRequest[],
    reason: InventoryChangeReason,
  ): TransactionResult {
    if (!this._initialized) {
      this.initialize();
    }

    const result = this._transaction.consumeAssets(transactionId, requests, reason);

    // 发射 Analytics 事件
    this._analyticsBridge.emitTransactionEvents(result, reason);

    // 发射 Inventory 变更事件
    if (result.success && !result.isDuplicate) {
      this._eventManager.emit(InventoryEvent.INVENTORY_CHANGED, {
        transactionId: result.transactionId,
        changes: result.changes,
        reason,
      } satisfies InventoryChangedEvent);

      this._eventManager.emit(InventoryEvent.TRANSACTION_COMPLETE, result);

      // 货币变更通知
      this._emitCurrencyEvents();
    }

    // 标记脏数据
    this._saveManager.markDirty();

    return result;
  }

  /**
   * 直接消耗资产（无事务，简单场景用）。
   */
  consumeAssetsSimple(
    itemId: string,
    count: number,
    reason: InventoryChangeReason,
    uniqueId?: string,
  ): TransactionResult {
    const transactionId = `txn_simple_consume_${itemId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return this.consumeAssets(
      transactionId,
      [{ itemId, count, uniqueId, reason }],
      reason,
    );
  }

  // ===== 公共 API — 查询 =====

  /** 检查资产是否足够 */
  checkSufficient(itemId: string, count: number, uniqueId?: string): boolean {
    return this._transaction.checkSufficient(itemId, count, uniqueId);
  }

  /** 获取堆叠资产数量 */
  getStackCount(itemId: string): number {
    return this._transaction.getStackCount(itemId);
  }

  /** 获取实例化资产数量 */
  getInstanceCount(itemId: string): number {
    return this._transaction.getInstanceCount(itemId);
  }

  /** 获取指定 itemId 的所有实例 */
  getInstancesByItemId(itemId: string): InstanceItem[] {
    return this._transaction.getInstancesByItemId(itemId);
  }

  /** 获取指定 uniqueId 的实例 */
  getInstanceByUniqueId(uniqueId: string): InstanceItem | null {
    return this._transaction.getInstanceByUniqueId(uniqueId);
  }

  /** 获取货币余额 */
  getCurrencyBalance(currencyType: 'gold' | 'spiritStone' | 'diamond'): number {
    return this._transaction.getCurrencyBalance(currencyType);
  }

  /** 获取所有 StackItem（深拷贝只读副本 — 外部修改不影响内部数据） */
  getAllStackItems(): readonly StackItem[] {
    return this._saveData.stackItems.map((s) => ({ ...s }));
  }

  /** 获取所有 InstanceItem（深拷贝只读副本 — 外部修改不影响内部数据） */
  getAllInstanceItems(): readonly InstanceItem[] {
    return this._saveData.instanceItems.map((i) => ({
      ...i,
      affix: { ...i.affix },
      extraData: { ...i.extraData },
    }));
  }

  /** 按过滤条件查询 StackItem（深拷贝副本） */
  queryStackItems(filter: InventoryQueryFilter): StackItem[] {
    return this._saveData.stackItems
      .filter((item) => {
        if (filter.itemId && item.itemId !== filter.itemId) return false;
        if (filter.category && item.category !== filter.category) return false;
        if (filter.subType && item.subType !== filter.subType) return false;
        if (filter.minQuality !== undefined && item.quality < filter.minQuality) return false;
        if (filter.bindState && item.bindState !== filter.bindState) return false;
        if (filter.excludeExpired && item.expireAt > 0 && item.expireAt < Date.now()) return false;
        return true;
      })
      .map((s) => ({ ...s }));
  }

  /** 按过滤条件查询 InstanceItem（深拷贝副本） */
  queryInstanceItems(filter: InventoryQueryFilter): InstanceItem[] {
    return this._saveData.instanceItems
      .filter((item) => {
        if (filter.itemId && item.itemId !== filter.itemId) return false;
        if (filter.category && item.category !== filter.category) return false;
        if (filter.subType && item.subType !== filter.subType) return false;
        if (filter.minQuality !== undefined && item.quality < filter.minQuality) return false;
        if (filter.bindState && item.bindState !== filter.bindState) return false;
        if (filter.lockState && item.lockState !== filter.lockState) return false;
        if (filter.excludeLocked && item.lockState === 'locked') return false;
        if (filter.excludeExpired && item.expireAt > 0 && item.expireAt < Date.now()) return false;
        return true;
      })
      .map((i) => ({
        ...i,
        affix: { ...i.affix },
        extraData: { ...i.extraData },
      }));
  }

  /** 查询所有已处理的交易 ID */
  getClaimedTransactionIds(): string[] {
    return Object.keys(this._saveData.claimStates);
  }

  /** 查询指定交易是否已处理 */
  isTransactionClaimed(transactionId: string): boolean {
    return this._transaction.isTransactionProcessed(transactionId);
  }

  /** 获取事务摘要列表 */
  getTransactionSummaries(): ReadonlyArray<import('./InventorySaveData').InventoryTransactionSummary> {
    return this._saveData.transactions;
  }

  /** 获取快照列表 */
  getSnapshots(): ReadonlyArray<InventoryRewardSnapshot> {
    return this._transaction.getSnapshots();
  }

  // ===== 快照管理 =====

  private _saveRewardSnapshot(
    aggregated: AggregatedReward,
    transactionId: string,
    result: TransactionResult,
  ): void {
    const now = Date.now();

    // Fix-03: 使用 Transaction 直接返回的 createdUniqueIds 精确映射
    // 而非事后按 itemId 扫描（避免同一事务多个相同 itemId 时映射错误）
    const createdUniqueIds: string[] = result.createdUniqueIds ?? [];

    // 构建 instanceIdMap：按 itemId 分组 createdUniqueIds
    // 每个 created uniqueId 对应一个被创建的实例
    const instanceIdMap = new Map<string, string[]>();
    for (const uid of createdUniqueIds) {
      // 从 _saveData 查找该 uniqueId 对应的 itemId
      const inst = this._saveData.instanceItems.find((i) => i.uniqueId === uid);
      const itemIdKey = inst?.itemId ?? 'unknown';
      if (!instanceIdMap.has(itemIdKey)) {
        instanceIdMap.set(itemIdKey, []);
      }
      instanceIdMap.get(itemIdKey)!.push(uid);
    }

    const snapshot: InventoryRewardSnapshot = {
      snapshotId: `isnap_${transactionId}`,
      transactionId,
      source: aggregated.rawRewards[0]?.source ?? 'unknown',
      sourceId: aggregated.rawRewards[0]?.sourceId ?? '',
      stackChanges: result.changes
        .filter((c) => !this._isInstanceType(c.itemId))
        .map((c) => ({ itemId: c.itemId, delta: c.delta, after: c.after })),
      instanceChanges: result.changes
        .filter((c) => this._isInstanceType(c.itemId) && c.delta > 0)
        .flatMap((c) => {
          const ids = instanceIdMap.get(c.itemId) ?? [];
          if (ids.length === 0) {
            // fallback: 至少记录 itemId（事务未产生 createdUniqueIds 时）
            return [{
              uniqueId: `unknown_${c.itemId}_${now}`,
              itemId: c.itemId,
              action: 'created' as const,
            }];
          }
          return ids.map((uid) => ({
            uniqueId: uid,
            itemId: c.itemId,
            action: 'created' as const,
          }));
        }),
      createdAt: now,
    };

    this._transaction.saveSnapshot(snapshot);
  }

  private _isInstanceType(itemId: string): boolean {
    return this._repository.requiresInstance(itemId);
  }

  // ===== 货币变更事件 =====

  private _emitCurrencyEvents(): void {
    const currencies = this._saveData.currencies;
    this._eventManager.emit(InventoryEvent.CURRENCY_CHANGED, {
      gold: currencies.gold,
      spiritStone: currencies.spiritStone,
      diamond: currencies.diamond,
    });
  }

  // ===== 过期清理 =====

  /** 清理已过期资产 */
  cleanupExpired(): number {
    const now = Date.now();
    let cleaned = 0;

    // 清理过期 StackItem
    const stackBefore = this._saveData.stackItems.length;
    this._saveData.stackItems = this._saveData.stackItems.filter((item) => {
      if (item.expireAt > 0 && item.expireAt < now) {
        cleaned++;
        return false;
      }
      return true;
    });

    // 清理过期 InstanceItem
    const instBefore = this._saveData.instanceItems.length;
    this._saveData.instanceItems = this._saveData.instanceItems.filter((item) => {
      if (item.expireAt > 0 && item.expireAt < now) {
        cleaned++;
        return false;
      }
      return true;
    });

    if (cleaned > 0) {
      this._saveData.meta.cleanedUp = true;
      this._saveData.meta.nextCleanupAt = now + 86400000; // 下次 24h 后
      this._saveManager.markDirty();

      this._analyticsBridge.emitCustomEvent('item_expire', {
        cleanedCount: cleaned,
        stackCleaned: stackBefore - this._saveData.stackItems.length,
        instanceCleaned: instBefore - this._saveData.instanceItems.length,
      });
    }

    return cleaned;
  }

  // ===== GM / Debug =====

  /** 重置所有资产（仅调试用） */
  resetAll(): void {
    this._saveData.stackItems = [];
    this._saveData.instanceItems = [];
    this._saveData.currencies = { gold: 0, spiritStone: 0, diamond: 0 };
    this._saveData.claimStates = {};
    this._saveData.transactions = [];
    this._saveData.snapshots = [];
    this._saveData.meta.updatedAt = Date.now();
    this._transaction.bindData(this._saveData);
    this._saveManager.markDirty();
  }
}
