// ============================================================
// EquipmentUIPresenter.ts — Phase10-Step7 UI Presenter
// 职责：UI 与 EquipmentService 之间的桥接层
//   · 构建 ViewModel（通过 EquipmentInventoryView）
//   · 调用 EquipmentService 写操作
//   · 提供预览/校验接口（委托 EquipmentSlotRules / EquipmentPowerCalculator）
//   · 统一刷新调度（markDirty + onRefreshCallback）
// 位置：ui/ 层
// 边界：
//   · 不持有 UI 引用（刷新通过回调通知 Mediator）
//   · 不直接修改存档
//   · 不直接修改 Inventory
// ============================================================

import { EventManager } from '../core/EventManager';
import { EquipmentService, EquipmentEvent } from '../equipment/EquipmentService';
import { InventoryService } from '../inventory/InventoryService';
import type { InstanceItem } from '../inventory/InventoryDomain';
import { EquipmentConfigRepository } from '../equipment/EquipmentConfigRepository';
import { EquipmentInventoryView } from '../equipment/EquipmentInventoryView';
import type { HeroContextProvider } from '../equipment/HeroContextProvider';
import type {
  EquipmentViewModel,
  SlotViewModel,
  HeroEquipmentViewModel,
  EquipmentViewFilter,
} from '../equipment/EquipmentInventoryView';
import type {
  EquipmentSlotId,
  EquipmentEquipResult,
  EquipmentUnequipResult,
  EquipmentUpgradeResult,
  EquipmentEnhanceResult,
  EquipmentDecomposeResult,
  EquipmentPowerResult,
  EquipmentOperationError,
  CostEntry,
} from '../equipment/EquipmentTypes';
import { SLOT_NAME_MAP, QUALITY_NAME_MAP, CORE_SLOT_IDS } from '../equipment/EquipmentTypes';
import { canEquip, canUnequip, canUpgrade, canEnhance, canDecompose } from '../equipment/EquipmentSlotRules';
import {
  calculatePower,
  calculateUpgradePreview,
  calculateEnhancePreview,
} from '../equipment/EquipmentPowerCalculator';

// ==================== Detail ViewModel ====================

/**
 * 装备详情面板 ViewModel。
 * 组合 EquipmentViewModel + 操作可用性 + 预览数据。
 */
export interface EquipmentDetailViewModel {
  /** 基础装备数据 */
  equipment: EquipmentViewModel;
  /** 是否可以装备到当前英雄 */
  canEquipToHero: boolean;
  /** 是否可以卸下 */
  canUnequip: boolean;
  /** 是否可以升级 */
  canUpgrade: boolean;
  /** 是否可以强化 */
  canEnhance: boolean;
  /** 是否可以分解 */
  canDecompose: boolean;
  /** Equip 不可用的错误码 */
  equipBlockReason: EquipmentOperationError | null;
  /** Unequip 不可用的错误码 */
  unequipBlockReason: EquipmentOperationError | null;
  /** 升级预览（null = 不可用） */
  upgradePreview: EquipmentPowerResult | null;
  /** 强化预览（null = 不可用） */
  enhancePreview: EquipmentPowerResult | null;
  /** 分解返还材料 */
  decomposeReturns: CostEntry[];
  /** 升级消耗 */
  upgradeCost: CostEntry[];
  /** 强化消耗 */
  enhanceCost: CostEntry[];
  /** 升级前战力 */
  currentPower: number;
  /** 升级后战力（升级预览中的） */
  upgradePowerAfter: number;
  /** 强化后战力（强化预览中的） */
  enhancePowerAfter: number;
  /** 是否已穿戴（由当前英雄穿戴） */
  isEquippedByCurrentHero: boolean;
  /** 是否穿戴在其他英雄上 */
  isEquippedByOtherHero: boolean;
  /** 材料是否足够升级 */
  upgradeMaterialSufficient: boolean;
  /** 材料是否足够强化 */
  enhanceMaterialSufficient: boolean;
}

// ==================== 品质颜色映射 ====================

const QUALITY_COLOR_MAP: Record<number, string> = {
  0: '#9CA3AF',  // Common 灰色
  1: '#3B82F6',  // Rare 蓝色
  2: '#8B5CF6',  // Epic 紫色
  3: '#F59E0B',  // Legendary 金色
};

const QUALITY_LABEL_MAP: Record<number, string> = {
  0: '普通',
  1: '稀有',
  2: '史诗',
  3: '传说',
};

// ==================== EquipmentUIPresenter ====================

/**
 * UI Presenter — 纯逻辑类，不由 Cocos Component 管理。
 * 由 EquipmentMediator 创建、持有和销毁。
 */
export class EquipmentUIPresenter {
  // ==================== 依赖 ====================

  private _equipmentService: EquipmentService;
  private _inventoryService: InventoryService;
  private _configRepo: EquipmentConfigRepository;
  private _eventManager: EventManager;

  // ==================== 状态 ====================

  private _currentHeroId: string = '';
  private _dirty: boolean = false;
  private _refreshCallback: (() => void) | null = null;
  private _initialized: boolean = false;
  private _heroContext: HeroContextProvider | null = null;

  /** 筛选缓存：key=JSON.stringify(filter) → items */
  private _filterCache: Map<string, EquipmentViewModel[]> = new Map();

  // ==================== 生命周期 ====================

  constructor() {
    this._equipmentService = EquipmentService.getInstance();
    this._inventoryService = InventoryService.getInstance();
    this._configRepo = EquipmentConfigRepository.getInstance();
    this._eventManager = EventManager.getInstance();
  }

  /**
   * 初始化 Presenter。
   * 注册事件监听，确保 EquipmentService 已初始化。
   */
  initialize(): void {
    if (this._initialized) return;

    if (!this._equipmentService.isInitialized()) {
      this._equipmentService.initialize();
    }

    // 注册事件监听
    this._eventManager.on(EquipmentEvent.LOADOUT_CHANGED, this._onLoadoutChanged, this);
    this._eventManager.on(EquipmentEvent.UPGRADE, this._onItemChanged, this);
    this._eventManager.on(EquipmentEvent.ENHANCE, this._onItemChanged, this);
    this._eventManager.on(EquipmentEvent.DECOMPOSE, this._onDecompose, this);

    this._initialized = true;
    console.log('[EquipmentUIPresenter] 初始化完成');
  }

  /** 销毁 Presenter，移除事件监听 */
  destroy(): void {
    this._eventManager.off(EquipmentEvent.LOADOUT_CHANGED, this._onLoadoutChanged, this);
    this._eventManager.off(EquipmentEvent.UPGRADE, this._onItemChanged, this);
    this._eventManager.off(EquipmentEvent.ENHANCE, this._onItemChanged, this);
    this._eventManager.off(EquipmentEvent.DECOMPOSE, this._onDecompose, this);
    this._initialized = false;
    this._filterCache.clear();
  }

  /** 是否已初始化 */
  isInitialized(): boolean {
    return this._initialized;
  }

  // ==================== 刷新回调 ====================

  /** 注册刷新回调（由 Mediator 设置） */
  setRefreshCallback(callback: (() => void) | null): void {
    this._refreshCallback = callback;
  }

  /** 标记脏数据 */
  markDirty(): void {
    this._dirty = true;
  }

  /** 立即刷新 */
  refreshNow(): void {
    this._dirty = false;
    this._filterCache.clear();
    if (this._refreshCallback) {
      this._refreshCallback();
    }
  }

  /** 清除筛选缓存 */
  invalidateFilterCache(): void {
    this._filterCache.clear();
  }

  // ==================== 当前英雄 ====================

  setCurrentHero(heroId: string): void {
    this._currentHeroId = heroId;
  }

  getCurrentHeroId(): string {
    return this._currentHeroId;
  }

  /**
   * 设置英雄上下文提供者。
   *
   * 由 Mediator 或系统 Bootstrap 在 HeroSystem 就绪后注入。
   * 未设置时，装备校验使用安全默认值（level=1, profession=undefined, faction=undefined）。
   */
  setHeroContext(provider: HeroContextProvider | null): void {
    this._heroContext = provider;
  }

  // ==================== Query：构建 ViewModel ====================

  /**
   * 创建 EquipmentInventoryView 实例。
   * 每次查询创建新实例，不持有状态。
   */
  private _createView(): EquipmentInventoryView {
    const allInstances = this._inventoryService.getAllInstanceItems() as InstanceItem[];
    const loadouts = this._equipmentService.getEquipmentData();
    return new EquipmentInventoryView(allInstances, loadouts, this._configRepo);
  }

  /** 获取英雄装备面板完整视图 */
  getHeroEquipmentView(heroId: string): HeroEquipmentViewModel {
    const view = this._createView();
    return view.getHeroEquipmentView(heroId);
  }

  /** 获取装备背包列表（带筛选） */
  getEquipmentList(filter?: EquipmentViewFilter): EquipmentViewModel[] {
    const cacheKey = filter ? JSON.stringify(filter) : '__all__';
    const cached = this._filterCache.get(cacheKey);
    if (cached && !this._dirty) {
      return cached;
    }

    const view = this._createView();
    const list = view.getEquipmentList(filter);

    // 缓存结果
    this._filterCache.set(cacheKey, list);
    return list;
  }

  /** 按 uniqueId 查找单个装备 ViewModel */
  getEquipmentViewModel(uniqueId: string): EquipmentViewModel | null {
    const view = this._createView();
    return view.getEquipmentViewModel(uniqueId);
  }

  /**
   * 构建详情面板 ViewModel。
   * 组合装备数据 + 操作可用性校验 + 预览数据。
   */
  getDetailViewModel(
    uniqueId: string,
    heroId: string,
  ): EquipmentDetailViewModel | null {
    const vm = this.getEquipmentViewModel(uniqueId);
    if (!vm) return null;

    const instance = this._inventoryService.getInstanceByUniqueId(uniqueId);
    if (!instance) return null;

    const config = this._configRepo.getEquipmentConfigByItemId(vm.itemId);
    const currentPower = vm.power;

    // === 操作可用性校验 ===

    // Equip 校验
    const equipCheck = canEquip(
      heroId,
      vm.slotType,
      instance,
      this._heroContext?.getHeroLevel(heroId) ?? 1,
      this._heroContext?.getHeroProfession(heroId),
      this._heroContext?.getHeroFaction(heroId),
      this._configRepo,
      this._equipmentService.getEquipmentData(),
    );
    // 如果已被同一英雄穿戴在同一槽位，视为"已穿戴"而不显示 equip
    const isEquippedByCurrentHero =
      vm.isEquipped && vm.equippedHeroId === heroId;
    const canEquipToHero = !isEquippedByCurrentHero && equipCheck.allowed;
    const equipBlockReason = equipCheck.allowed
      ? null
      : equipCheck.errorCode;

    // Unequip 校验
    const unequipCheck = canUnequip(
      heroId,
      vm.slotType,
      this._equipmentService.getEquipmentData(),
    );
    const canUnequipHere = isEquippedByCurrentHero && unequipCheck.allowed;
    const unequipBlockReason = unequipCheck.allowed
      ? null
      : unequipCheck.errorCode;

    // Upgrade 校验
    const upgradeCheck = canUpgrade(instance, this._configRepo);
    const canUpgradeHere = upgradeCheck.allowed;
    const upgradeCost = upgradeCheck.cost ?? [];

    // 检查升级材料是否充足
    let upgradeMaterialSufficient = true;
    for (const cost of upgradeCost) {
      if (!this._inventoryService.checkSufficient(cost.itemId, cost.count)) {
        upgradeMaterialSufficient = false;
        break;
      }
    }

    // Enhance 校验
    const enhanceCheck = canEnhance(instance, this._configRepo);
    const canEnhanceHere = enhanceCheck.allowed;
    const enhanceCost = enhanceCheck.cost ?? [];

    let enhanceMaterialSufficient = true;
    for (const cost of enhanceCost) {
      if (!this._inventoryService.checkSufficient(cost.itemId, cost.count)) {
        enhanceMaterialSufficient = false;
        break;
      }
    }

    // Decompose 校验
    const decomposeCheck = canDecompose(
      instance,
      this._equipmentService.getEquipmentData(),
      this._configRepo,
    );
    const canDecomposeHere = decomposeCheck.allowed;
    const decomposeReturns = decomposeCheck.returns ?? [];

    // === 预览数据 ===

    // 升级预览
    let upgradePreview: EquipmentPowerResult | null = null;
    let upgradePowerAfter = currentPower;
    if (canUpgradeHere) {
      upgradePreview = calculateUpgradePreview(
        instance,
        instance.level + 1,
        this._configRepo,
      );
      if (upgradePreview) {
        upgradePowerAfter = upgradePreview.totalPower;
      }
    }

    // 强化预览
    let enhancePreview: EquipmentPowerResult | null = null;
    let enhancePowerAfter = currentPower;
    if (canEnhanceHere) {
      const currentEnhanceLevel =
        (instance.extraData?.enhanceLevel as number) ?? 0;
      enhancePreview = calculateEnhancePreview(
        instance,
        currentEnhanceLevel + 1,
        this._configRepo,
      );
      if (enhancePreview) {
        enhancePowerAfter = enhancePreview.totalPower;
      }
    }

    return {
      equipment: vm,
      canEquipToHero,
      canUnequip: canUnequipHere,
      canUpgrade: canUpgradeHere,
      canEnhance: canEnhanceHere,
      canDecompose: canDecomposeHere,
      equipBlockReason,
      unequipBlockReason,
      upgradePreview,
      enhancePreview,
      decomposeReturns,
      upgradeCost,
      enhanceCost,
      currentPower,
      upgradePowerAfter,
      enhancePowerAfter,
      isEquippedByCurrentHero,
      isEquippedByOtherHero: vm.isEquipped && !isEquippedByCurrentHero,
      upgradeMaterialSufficient,
      enhanceMaterialSufficient,
    };
  }

  // ==================== Actions：委托 EquipmentService ====================

  equip(
    heroId: string,
    slotId: EquipmentSlotId,
    equipmentUniqueId: string,
  ): EquipmentEquipResult {
    const result = this._equipmentService.equip(
      heroId,
      slotId,
      equipmentUniqueId,
    );
    if (result.success) {
      this.markDirty();
    }
    return result;
  }

  unequip(
    heroId: string,
    slotId: EquipmentSlotId,
  ): EquipmentUnequipResult {
    const result = this._equipmentService.unequip(heroId, slotId);
    if (result.success) {
      this.markDirty();
    }
    return result;
  }

  upgrade(equipmentUniqueId: string): EquipmentUpgradeResult {
    const result = this._equipmentService.upgrade(equipmentUniqueId);
    if (result.success) {
      this.markDirty();
    }
    return result;
  }

  enhance(equipmentUniqueId: string): EquipmentEnhanceResult {
    const result = this._equipmentService.enhance(equipmentUniqueId);
    if (result.success) {
      this.markDirty();
    }
    return result;
  }

  decompose(equipmentUniqueId: string): EquipmentDecomposeResult {
    const result = this._equipmentService.decompose(equipmentUniqueId);
    if (result.success) {
      this.markDirty();
      this.invalidateFilterCache();
    }
    return result;
  }

  // ==================== 配置查询 ====================

  /** 获取当前启用的槽位列表 */
  getAllowedSlotIds(): EquipmentSlotId[] {
    return [...CORE_SLOT_IDS];
  }

  /** 获取槽位中文名称 */
  getSlotName(slotId: EquipmentSlotId): string {
    return SLOT_NAME_MAP[slotId] ?? slotId;
  }

  /** 获取品质中文名称 */
  getQualityName(quality: number): string {
    return QUALITY_LABEL_MAP[quality] ?? QUALITY_NAME_MAP[quality] ?? '未知';
  }

  /** 获取品质颜色 hex */
  getQualityColor(quality: number): string {
    return QUALITY_COLOR_MAP[quality] ?? '#9CA3AF';
  }

  // ==================== 事件处理 ====================

  private _onLoadoutChanged(): void {
    this.markDirty();
    this.refreshNow();
  }

  private _onItemChanged(): void {
    this.markDirty();
    this.refreshNow();
  }

  private _onDecompose(): void {
    this.markDirty();
    this.invalidateFilterCache();
    this.refreshNow();
  }
}
