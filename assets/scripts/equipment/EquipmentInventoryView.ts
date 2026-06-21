// ============================================================
// EquipmentInventoryView.ts — 装备背包查询视图
// 职责：组合 Inventory 实例 + 装备配置 + 穿戴状态 → UI ViewModel
// 位置：equipment/ 层
// 边界：只读查询，不修改装备状态、不独立保存装备背包、不创建装备实例
// ============================================================

import type { InstanceItem } from '../inventory/InventoryDomain';
import type { EquipmentConfigRepository } from './EquipmentConfigRepository';
import type { EquipmentSaveDataV2 } from './EquipmentLoadoutData';
import { findEquipmentWearer } from './EquipmentLoadoutData';
import { calculatePower } from './EquipmentPowerCalculator';
import type { EquipmentSlotId } from './EquipmentTypes';
import { CORE_SLOT_IDS, SLOT_NAME_MAP } from './EquipmentTypes';

// ==================== ViewModel 类型 ====================

/**
 * 装备背包条目 ViewModel。
 */
export interface EquipmentViewModel {
  /** 装备实例 uniqueId */
  uniqueId: string;
  /** 物品 ID */
  itemId: string;
  /** 装备名称 */
  name: string;
  /** 槽位类型 */
  slotType: EquipmentSlotId;
  /** 品质 */
  quality: number;
  /** 品质名称 */
  qualityName: string;
  /** 等级 */
  level: number;
  /** 强化等级 */
  enhanceLevel: number;
  /** 战力 */
  power: number;
  /** 是否已被穿戴 */
  isEquipped: boolean;
  /** 穿戴者英雄 ID */
  equippedHeroId: string | null;
  /** 穿戴槽位 ID */
  equippedSlotId: string | null;
  /** 是否锁定 */
  isLocked: boolean;
  /** 绑定状态 */
  bindState: string;
  /** 基础属性（来自配置） */
  baseHp: number;
  baseAtk: number;
  baseDef: number;
}

/**
 * 单个槽位 ViewModel。
 */
export interface SlotViewModel {
  /** 槽位 ID */
  slotId: EquipmentSlotId;
  /** 槽位名称 */
  slotName: string;
  /** 已穿戴装备（null = 空槽位） */
  equippedItem: EquipmentViewModel | null;
  /** 是否为空槽位 */
  isEmpty: boolean;
}

/**
 * 英雄装备面板 ViewModel。
 */
export interface HeroEquipmentViewModel {
  /** 英雄 ID */
  heroId: string;
  /** 所有槽位详情 */
  slots: SlotViewModel[];
  /** 装备总战力 */
  totalEquipmentPower: number;
}

// ==================== 查询过滤器 ====================

/**
 * 装备背包查询过滤器。
 */
export interface EquipmentViewFilter {
  /** 按槽位类型过滤 */
  slotType?: EquipmentSlotId;
  /** 最低品质 */
  minQuality?: number;
  /** 最高品质 */
  maxQuality?: number;
  /** 仅显示未穿戴 */
  onlyUnequipped?: boolean;
  /** 仅显示可分解 */
  onlyDecomposable?: boolean;
  /** 按名称模糊搜索 */
  nameSearch?: string;
}

// ==================== EquipmentInventoryView 类 ====================

/**
 * 装备背包查询视图。
 *
 * 非单例：每次查询可创建新实例。
 * 不修改装备状态，不独立保存装备背包，不创建装备实例。
 */
export class EquipmentInventoryView {
  /** 所有装备实例（来自 InventoryService） */
  private _allInstances: InstanceItem[];
  /** 装备穿戴关系存档 */
  private _loadouts: EquipmentSaveDataV2;
  /** 配置仓库 */
  private _configRepo: EquipmentConfigRepository;

  constructor(
    allInstances: InstanceItem[],
    loadouts: EquipmentSaveDataV2,
    configRepo: EquipmentConfigRepository,
  ) {
    this._allInstances = allInstances;
    this._loadouts = loadouts;
    this._configRepo = configRepo;
  }

  // ==================== 装备背包查询 ====================

  /**
   * 获取装备背包列表。
   *
   * 查询 Inventory InstanceItem（category=Equipment）+ 组合配置 + 穿戴状态。
   *
   * @param filter  可选过滤器
   * @returns       EquipmentViewModel[]
   */
  getEquipmentList(filter?: EquipmentViewFilter): EquipmentViewModel[] {
    let list: EquipmentViewModel[] = [];

    for (const instance of this._allInstances) {
      if (instance.category !== 'Equipment') continue;

      const viewModel = this._instanceToViewModel(instance);
      if (!viewModel) continue;

      // 应用过滤
      if (filter) {
        if (
          filter.slotType &&
          viewModel.slotType !== filter.slotType
        ) {
          continue;
        }
        if (
          filter.minQuality !== undefined &&
          viewModel.quality < filter.minQuality
        ) {
          continue;
        }
        if (
          filter.maxQuality !== undefined &&
          viewModel.quality > filter.maxQuality
        ) {
          continue;
        }
        if (filter.onlyUnequipped && viewModel.isEquipped) {
          continue;
        }
        if (
          filter.nameSearch &&
          !viewModel.name.toLowerCase().includes(filter.nameSearch.toLowerCase())
        ) {
          continue;
        }
      }

      list.push(viewModel);
    }

    return list;
  }

  /**
   * 获取指定英雄的装备槽位视图。
   *
   * @param heroId  英雄 ID
   * @returns       SlotViewModel[]
   */
  getHeroSlotViewModels(heroId: string): SlotViewModel[] {
    const entry = this._loadouts.loadouts.find((e) => e.heroId === heroId);
    const instancesByUniqueId = new Map<string, InstanceItem>();
    for (const inst of this._allInstances) {
      instancesByUniqueId.set(inst.uniqueId, inst);
    }

    const slotIds = this._configRepo.getAllowedSlotIds();

    return slotIds.map((slotId) => {
      const equippedUniqueId = entry?.slots[slotId] ?? null;
      const instance = equippedUniqueId
        ? instancesByUniqueId.get(equippedUniqueId) ?? null
        : null;

      const equippedItem = instance
        ? this._instanceToViewModel(instance)
        : null;

      return {
        slotId,
        slotName: SLOT_NAME_MAP[slotId] ?? slotId,
        equippedItem,
        isEmpty: !equippedItem,
      };
    });
  }

  /**
   * 获取英雄装备面板完整视图。
   *
   * @param heroId  英雄 ID
   * @returns       HeroEquipmentViewModel
   */
  getHeroEquipmentView(heroId: string): HeroEquipmentViewModel {
    const slots = this.getHeroSlotViewModels(heroId);
    let totalEquipmentPower = 0;

    for (const slot of slots) {
      if (slot.equippedItem) {
        totalEquipmentPower += slot.equippedItem.power;
      }
    }

    return {
      heroId,
      slots,
      totalEquipmentPower,
    };
  }

  /**
   * 按 uniqueId 查找单个装备 ViewModel。
   */
  getEquipmentViewModel(uniqueId: string): EquipmentViewModel | null {
    const instance = this._allInstances.find(
      (inst) => inst.uniqueId === uniqueId,
    );
    if (!instance || instance.category !== 'Equipment') return null;
    return this._instanceToViewModel(instance);
  }

  // ==================== 私有方法 ====================

  /**
   * InstanceItem → EquipmentViewModel。
   */
  private _instanceToViewModel(
    instance: InstanceItem,
  ): EquipmentViewModel | null {
    const config = this._configRepo.getEquipmentConfigByItemId(instance.itemId);
    if (!config) {
      // 配置缺失时不崩溃，返回基础信息
      console.warn(
        `[EquipmentInventoryView] Config not found for itemId: ${instance.itemId}`,
      );
    }

    // 亚型到槽位映射
    const slotType = this._subTypeToSlotId(instance.subType);
    const wearer = findEquipmentWearer(
      this._loadouts,
      instance.uniqueId,
    );

    // 计算战力
    let power = 0;
    if (config) {
      const result = calculatePower(config, instance, this._configRepo);
      power = result.totalPower;
    }

    const enhanceLevel =
      (instance.extraData?.enhanceLevel as number) ?? 0;

    return {
      uniqueId: instance.uniqueId,
      itemId: instance.itemId,
      name: config?.name ?? instance.itemId,
      slotType,
      quality: instance.quality,
      qualityName: this._qualityToName(instance.quality),
      level: instance.level,
      enhanceLevel,
      power,
      isEquipped: wearer.equipped,
      equippedHeroId: wearer.heroId ?? null,
      equippedSlotId: wearer.slotId ?? null,
      isLocked: instance.lockState === 'locked' || instance.lockState === 'soft_locked',
      bindState: instance.bindState,
      baseHp: config?.hp ?? 0,
      baseAtk: config?.attack ?? 0,
      baseDef: config?.defense ?? 0,
    };
  }

  /**
   * InstanceItem.subType → EquipmentSlotId。
   */
  private _subTypeToSlotId(subType: string): EquipmentSlotId {
    const map: Record<string, EquipmentSlotId> = {
      Weapon: 'Weapon',
      Armor: 'Armor',
      Accessory: 'Accessory',
    };
    return map[subType] ?? 'Accessory';
  }

  /**
   * 品质数值 → 品质名称。
   */
  private _qualityToName(quality: number): string {
    const names: Record<number, string> = {
      0: '普通',
      1: '稀有',
      2: '史诗',
      3: '传说',
    };
    return names[quality] ?? '未知';
  }
}
