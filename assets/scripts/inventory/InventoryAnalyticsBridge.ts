// ============================================================
// InventoryAnalyticsBridge.ts — 资产变更 → Analytics 事件桥接
// 职责：将 Inventory 变更转换为标准化 Analytics 事件 / 控制日志粒度
// 位置：inventory/ 层
// 边界：不得修改资产 / 不得参与事务成功判断 / 不得作为资产真实来源
// 规范：Analytics 失败不影响资产提交
// ============================================================

import type { TransactionResult, AssetChangeEntry } from './InventoryTransaction';
import type { InventoryChangeReason } from './InventoryDomain';
import { InventoryRepository } from './InventoryRepository';

// ==================== 经济日志字段 ====================

/** 标准化经济日志字段 */
export interface InventoryEventPayload {
  /** 事件名 */
  event: string;
  /** 事务 ID */
  transactionId: string;
  /** 变更类型 */
  changeType: 'gain' | 'consume' | 'adjust';
  /** 变更原因 */
  reason: string;
  /** 资产变更摘要 */
  changes: Array<{
    itemId: string;
    delta: number;
    after: number;
    category: string;
  }>;
  /** 是否为高价值资产 */
  isHighValue: boolean;
  /** 时间戳 */
  timestamp: number;
}

/** Analytics 事件名常量 */
export const InventoryAnalyticsEvent = {
  /** 资产获得 */
  INVENTORY_GAIN: 'inventory_gain',
  /** 资产消耗 */
  INVENTORY_CONSUME: 'inventory_consume',
  /** 资产调整 */
  INVENTORY_ADJUST: 'inventory_adjust',
  /** 事务提交 */
  TRANSACTION_COMMIT: 'inventory_transaction_commit',
  /** 事务拒绝 */
  TRANSACTION_REJECT: 'inventory_transaction_reject',
  /** 实例创建 */
  ITEM_INSTANCE_CREATE: 'item_instance_create',
  /** 实例销毁 */
  ITEM_INSTANCE_DESTROY: 'item_instance_destroy',
  /** 堆叠合并 */
  ITEM_STACK_MERGE: 'item_stack_merge',
  /** 资产过期 */
  ITEM_EXPIRE: 'item_expire',
  /** 奖励领取成功 */
  REWARD_CLAIM_SUCCESS: 'reward_claim_success',
  /** 奖励重复领取 */
  REWARD_CLAIM_DUPLICATE: 'reward_claim_duplicate',
  /** 奖励领取失败 */
  REWARD_CLAIM_FAILED: 'reward_claim_failed',
  // ---- 商业化预留 ----
  PREMIUM_CURRENCY_GAIN: 'premium_currency_gain',
  PREMIUM_CURRENCY_CONSUME: 'premium_currency_consume',
  PAID_PACK_REWARD_CLAIM: 'paid_pack_reward_claim',
  LIVEOPS_COMPENSATION_CLAIM: 'liveOps_compensation_claim',
  ACTIVITY_TOKEN_GAIN: 'activity_token_gain',
  ACTIVITY_TOKEN_CONSUME: 'activity_token_consume',
  // ---- 成长预留 ----
  EQUIPMENT_ACQUIRE: 'equipment_acquire',
  EQUIPMENT_CONSUME: 'equipment_consume',
  ARTIFACT_ACQUIRE: 'artifact_acquire',
  RUNE_ACQUIRE: 'rune_acquire',
  PET_ACQUIRE: 'pet_acquire',
} as const;

/** 高价值资产大类（通过 Repository 的 category 判断） */
const HIGH_VALUE_CATEGORIES: Set<string> = new Set([
  'Equipment',
  'Artifact',
  'Rune',
  'Pet',
]);

// ==================== 事件回调类型 ====================

/** Analytics 事件回调（由 InventoryService 注入） */
export type AnalyticsEventCallback = (eventName: string, payload: Record<string, unknown>) => void;

// ==================== InventoryAnalyticsBridge ====================

export class InventoryAnalyticsBridge {
  // ===== 单例 =====

  private static instance: InventoryAnalyticsBridge;

  static getInstance(): InventoryAnalyticsBridge {
    if (!this.instance) {
      this.instance = new InventoryAnalyticsBridge();
    }
    return this.instance;
  }

  // ===== 内部状态 =====

  /** Analytics 事件发射回调 */
  private _emitCallback: AnalyticsEventCallback | null = null;

  /** 是否启用详细日志 */
  private _verboseEnabled = false;

  /** 是否聚合普通材料事件 */
  private _aggregateMaterials = true;

  private constructor() {}

  // ===== 配置 =====

  /** 注入 Analytics 事件回调 */
  setEmitCallback(callback: AnalyticsEventCallback): void {
    this._emitCallback = callback;
  }

  /** 启用/关闭详细日志 */
  setVerbose(enabled: boolean): void {
    this._verboseEnabled = enabled;
  }

  /** 启用/关闭普通材料聚合 */
  setAggregateMaterials(enabled: boolean): void {
    this._aggregateMaterials = enabled;
  }

  // ===== 事件生成 =====

  /**
   * 根据事务结果生成经济日志事件。
   *
   * 一次事务至少一条 summary 事件。
   * 高价值资产记录明细，普通材料可聚合。
   *
   * @param result  事务执行结果
   * @param reason  变更原因
   * @param source  资产来源（gain 时有效）
   */
  emitTransactionEvents(
    result: TransactionResult,
    reason: string,
    source?: string,
  ): void {
    if (!this._emitCallback) return;

    const timestamp = Date.now();

    // 判断事件类型
    if (!result.success) {
      // 事务失败事件
      this._emit(InventoryAnalyticsEvent.TRANSACTION_REJECT, {
        transactionId: result.transactionId,
        reason,
        errorCode: result.errorCode,
        message: result.message,
        timestamp,
      });
      return;
    }

    if (result.isDuplicate) {
      // 重复领取事件
      this._emit(InventoryAnalyticsEvent.REWARD_CLAIM_DUPLICATE, {
        transactionId: result.transactionId,
        reason,
        timestamp,
      });
      return;
    }

    // 分离高价值和普通资产
    const highValueChanges: AssetChangeEntry[] = [];
    const normalChanges: AssetChangeEntry[] = [];

    for (const change of result.changes) {
      if (this._isHighValue(change.itemId)) {
        highValueChanges.push(change);
      } else {
        normalChanges.push(change);
      }
    }

    // 确定变更类型
    const changeType = this._determineChangeType(result);

    // 事务提交 summary（总是发送）
    this._emit(InventoryAnalyticsEvent.TRANSACTION_COMMIT, {
      transactionId: result.transactionId,
      changeType,
      reason,
      source: source ?? '',
      totalChanges: result.changes.length,
      highValueCount: highValueChanges.length,
      normalCount: normalChanges.length,
      timestamp,
    });

    // 经济日志主事件
    if (changeType === 'gain') {
      this._emit(InventoryAnalyticsEvent.INVENTORY_GAIN, {
        transactionId: result.transactionId,
        reason,
        source: source ?? '',
        changes: result.changes,
        isHighValue: highValueChanges.length > 0,
        timestamp,
      });

      // 成功领取
      this._emit(InventoryAnalyticsEvent.REWARD_CLAIM_SUCCESS, {
        transactionId: result.transactionId,
        reason,
        source: source ?? '',
        timestamp,
      });
    } else if (changeType === 'consume') {
      this._emit(InventoryAnalyticsEvent.INVENTORY_CONSUME, {
        transactionId: result.transactionId,
        reason,
        changes: result.changes,
        isHighValue: highValueChanges.length > 0,
        timestamp,
      });
    }

    // 高价值资产明细事件
    for (const change of highValueChanges) {
      this._emitHighValueDetail(change, result.transactionId, reason, source, changeType);
    }

    // 普通材料聚合（如果启用）
    if (this._aggregateMaterials && normalChanges.length > 0 && this._verboseEnabled) {
      // 聚合为一个事件
      this._emit(InventoryAnalyticsEvent.ITEM_STACK_MERGE, {
        transactionId: result.transactionId,
        reason,
        aggregatedItems: normalChanges.map((c) => c.itemId),
        totalCount: normalChanges.reduce((sum, c) => sum + Math.abs(c.delta), 0),
        timestamp,
      });
    }

    // 实例创建/销毁事件
    for (const change of result.changes) {
      if (change.delta > 0 && this._isInstanceType(change.itemId)) {
        this._emit(InventoryAnalyticsEvent.ITEM_INSTANCE_CREATE, {
          transactionId: result.transactionId,
          itemId: change.itemId,
          category: change.category,
          timestamp,
        });
      } else if (change.delta < 0 && this._isInstanceType(change.itemId)) {
        this._emit(InventoryAnalyticsEvent.ITEM_INSTANCE_DESTROY, {
          transactionId: result.transactionId,
          itemId: change.itemId,
          category: change.category,
          timestamp,
        });
      }
    }

    // 成长预留事件
    this._emitGrowthEvents(result, reason, source, timestamp);
  }

  /**
   * 直接发射自定义 Inventory 事件（不经过事务）。
   */
  emitCustomEvent(eventName: string, payload: Record<string, unknown>): void {
    if (!this._emitCallback) return;
    this._emit(eventName, { ...payload, timestamp: Date.now() });
  }

  // ===== 内部 =====

  private _emit(eventName: string, payload: Record<string, unknown>): void {
    try {
      this._emitCallback!(eventName, payload);
    } catch (e) {
      // Analytics 失败不影响资产提交 — 静默吞下
      console.warn(`[InventoryAnalyticsBridge] Analytics 事件发射失败 (${eventName}):`, e);
    }
  }

  private _isHighValue(itemId: string): boolean {
    const repo = InventoryRepository.getInstance();
    // 高价值 = 装备/神器/符文/宠物大类，或必须实例化的资产
    if (HIGH_VALUE_CATEGORIES.has(repo.getCategory(itemId))) return true;
    if (repo.mustInstance(itemId)) return true;
    // 钻石始终为高价值
    if (itemId === 'ITEM_DIAMOND') return true;
    return false;
  }

  private _isInstanceType(itemId: string): boolean {
    return InventoryRepository.getInstance().requiresInstance(itemId);
  }

  private _determineChangeType(result: TransactionResult): 'gain' | 'consume' | 'adjust' {
    if (result.changes.length === 0) return 'adjust';
    const totalDelta = result.changes.reduce((sum, c) => sum + c.delta, 0);
    if (totalDelta > 0) return 'gain';
    if (totalDelta < 0) return 'consume';
    return 'adjust';
  }

  private _emitHighValueDetail(
    change: AssetChangeEntry,
    transactionId: string,
    reason: string,
    source: string | undefined,
    changeType: string,
  ): void {
    // 根据物品类型发射对应的成长事件
    if (change.itemId.startsWith('ITEM_DIAMOND')) {
      if (changeType === 'gain') {
        this._emit(InventoryAnalyticsEvent.PREMIUM_CURRENCY_GAIN, {
          transactionId,
          itemId: change.itemId,
          amount: change.delta,
          reason,
          source: source ?? '',
        });
      } else if (changeType === 'consume') {
        this._emit(InventoryAnalyticsEvent.PREMIUM_CURRENCY_CONSUME, {
          transactionId,
          itemId: change.itemId,
          amount: Math.abs(change.delta),
          reason,
        });
      }
    }
  }

  private _emitGrowthEvents(
    result: TransactionResult,
    reason: string,
    source: string | undefined,
    timestamp: number,
  ): void {
    const repo = InventoryRepository.getInstance();

    for (const change of result.changes) {
      if (change.delta <= 0) continue;

      const category = repo.getCategory(change.itemId);
      const subType = repo.getSubType(change.itemId);

      switch (category) {
        case 'Equipment':
          this._emit(InventoryAnalyticsEvent.EQUIPMENT_ACQUIRE, {
            transactionId: result.transactionId,
            itemId: change.itemId,
            subType,
            reason,
            source: source ?? '',
            timestamp,
          });
          break;
        case 'Artifact':
          this._emit(InventoryAnalyticsEvent.ARTIFACT_ACQUIRE, {
            transactionId: result.transactionId,
            itemId: change.itemId,
            reason,
            source: source ?? '',
            timestamp,
          });
          break;
        case 'Rune':
          this._emit(InventoryAnalyticsEvent.RUNE_ACQUIRE, {
            transactionId: result.transactionId,
            itemId: change.itemId,
            reason,
            source: source ?? '',
            timestamp,
          });
          break;
        case 'Pet':
          this._emit(InventoryAnalyticsEvent.PET_ACQUIRE, {
            transactionId: result.transactionId,
            itemId: change.itemId,
            reason,
            source: source ?? '',
            timestamp,
          });
          break;
      }
    }
  }
}
