// ============================================================
// EquipmentAnalyticsBridge.ts — 装备玩法层 Analytics 桥接
// 职责：记录装备穿戴/卸下/升级/强化/分解等玩法事件
// 位置：equipment/ 层
// 边界：Analytics 失败不影响装备操作，所有事件通过注入回调发送
//
// 与 InventoryAnalyticsBridge 分工：
//   InventoryAnalyticsBridge:
//     equipment_acquire / equipment_consume / item_instance_create / item_instance_destroy
//   EquipmentAnalyticsBridge:
//     equipment_equip / equipment_unequip / equipment_upgrade / equipment_enhance / equipment_decompose
// ============================================================

// ==================== 事件类型常量 ====================

export const EQUIPMENT_ANALYTICS_EVENTS = {
  EQUIP: 'equipment_equip',
  UNEQUIP: 'equipment_unequip',
  UPGRADE: 'equipment_upgrade',
  ENHANCE: 'equipment_enhance',
  DECOMPOSE: 'equipment_decompose',
} as const;

// ==================== 事件负载类型 ====================

/** 穿戴事件负载 */
export interface EquipmentEquipEventData {
  heroId: string;
  slotId: string;
  uniqueId: string;
  itemId: string;
  quality: number;
  source: string;
  replacedUniqueId?: string | null;
  timestamp: number;
}

/** 卸下事件负载 */
export interface EquipmentUnequipEventData {
  heroId: string;
  slotId: string;
  uniqueId: string;
  itemId: string;
  timestamp: number;
}

/** 升级事件负载 */
export interface EquipmentUpgradeEventData {
  transactionId: string;
  uniqueId: string;
  itemId: string;
  quality: number;
  levelBefore: number;
  levelAfter: number;
  costItems: Array<{ itemId: string; count: number }>;
  powerDelta: number;
  timestamp: number;
}

/** 强化事件负载 */
export interface EquipmentEnhanceEventData {
  transactionId: string;
  uniqueId: string;
  itemId: string;
  quality: number;
  enhanceLevelBefore: number;
  enhanceLevelAfter: number;
  costItems: Array<{ itemId: string; count: number }>;
  powerDelta: number;
  timestamp: number;
}

/** 分解事件负载 */
export interface EquipmentDecomposeEventData {
  transactionId: string;
  uniqueId: string;
  itemId: string;
  quality: number;
  level: number;
  returnItems: Array<{ itemId: string; count: number }>;
  source: string;
  timestamp: number;
}

/** Analysis 事件类型联合 */
export type EquipmentAnalyticsEventData =
  | { type: 'equipment_equip'; data: EquipmentEquipEventData }
  | { type: 'equipment_unequip'; data: EquipmentUnequipEventData }
  | { type: 'equipment_upgrade'; data: EquipmentUpgradeEventData }
  | { type: 'equipment_enhance'; data: EquipmentEnhanceEventData }
  | { type: 'equipment_decompose'; data: EquipmentDecomposeEventData };

/** 外部事件发送回调签名 */
export type EquipmentAnalyticsEmitCallback = (
  event: EquipmentAnalyticsEventData,
) => void;

// ==================== 单例 ====================

export class EquipmentAnalyticsBridge {
  private static _instance: EquipmentAnalyticsBridge | null = null;

  static getInstance(): EquipmentAnalyticsBridge {
    if (!this._instance) {
      this._instance = new EquipmentAnalyticsBridge();
    }
    return this._instance;
  }

  // ==================== 内部状态 ====================

  private _emitCallback: EquipmentAnalyticsEmitCallback | null = null;
  private _initialized: boolean = false;

  // ==================== 初始化 ====================

  /**
   * 初始化分析桥接器。
   *
   * @param emitCallback  外部事件发送回调（如 AnalyticsSystem.trackEvent）
   */
  initialize(emitCallback: EquipmentAnalyticsEmitCallback): void {
    this._emitCallback = emitCallback;
    this._initialized = true;
  }

  /** 是否已初始化 */
  isInitialized(): boolean {
    return this._initialized;
  }

  // ==================== 事件追踪 ====================

  /** 装备穿戴事件 */
  trackEquip(
    heroId: string,
    slotId: string,
    uniqueId: string,
    itemId: string,
    quality: number,
    source: string,
    replacedUniqueId?: string | null,
  ): void {
    this._safeEmit({
      type: EQUIPMENT_ANALYTICS_EVENTS.EQUIP,
      data: {
        heroId,
        slotId,
        uniqueId,
        itemId,
        quality,
        source,
        replacedUniqueId,
        timestamp: Date.now(),
      },
    });
  }

  /** 装备卸下事件 */
  trackUnequip(
    heroId: string,
    slotId: string,
    uniqueId: string,
    itemId: string,
  ): void {
    this._safeEmit({
      type: EQUIPMENT_ANALYTICS_EVENTS.UNEQUIP,
      data: {
        heroId,
        slotId,
        uniqueId,
        itemId,
        timestamp: Date.now(),
      },
    });
  }

  /** 装备升级事件 */
  trackUpgrade(
    transactionId: string,
    uniqueId: string,
    itemId: string,
    quality: number,
    levelBefore: number,
    levelAfter: number,
    costItems: Array<{ itemId: string; count: number }>,
    powerDelta: number,
  ): void {
    this._safeEmit({
      type: EQUIPMENT_ANALYTICS_EVENTS.UPGRADE,
      data: {
        transactionId,
        uniqueId,
        itemId,
        quality,
        levelBefore,
        levelAfter,
        costItems,
        powerDelta,
        timestamp: Date.now(),
      },
    });
  }

  /** 装备强化事件 */
  trackEnhance(
    transactionId: string,
    uniqueId: string,
    itemId: string,
    quality: number,
    enhanceLevelBefore: number,
    enhanceLevelAfter: number,
    costItems: Array<{ itemId: string; count: number }>,
    powerDelta: number,
  ): void {
    this._safeEmit({
      type: EQUIPMENT_ANALYTICS_EVENTS.ENHANCE,
      data: {
        transactionId,
        uniqueId,
        itemId,
        quality,
        enhanceLevelBefore,
        enhanceLevelAfter,
        costItems,
        powerDelta,
        timestamp: Date.now(),
      },
    });
  }

  /** 装备分解事件 */
  trackDecompose(
    transactionId: string,
    uniqueId: string,
    itemId: string,
    quality: number,
    level: number,
    returnItems: Array<{ itemId: string; count: number }>,
    source: string,
  ): void {
    this._safeEmit({
      type: EQUIPMENT_ANALYTICS_EVENTS.DECOMPOSE,
      data: {
        transactionId,
        uniqueId,
        itemId,
        quality,
        level,
        returnItems,
        source,
        timestamp: Date.now(),
      },
    });
  }

  // ==================== 私有方法 ====================

  /**
   * 安全发送事件。
   *
   * Analytics 失败绝不抛出异常，不影响装备操作。
   */
  private _safeEmit(event: EquipmentAnalyticsEventData): void {
    try {
      if (this._emitCallback) {
        this._emitCallback(event);
      }
    } catch (_error) {
      // 静默吞下分析错误
    }
  }
}
