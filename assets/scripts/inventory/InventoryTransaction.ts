// ============================================================
// InventoryTransaction.ts — 资产变更事务
// 职责：资产增删查 / 幂等 transactionId / claimState / rollback / 批处理
// 位置：inventory/ 层
// 边界：不依赖 UI / 不生成随机词条 / 不计算战斗属性
// 规范：同一个 transactionId 不得重复发奖 / 提交失败不更新 claimState
//        Analytics 失败不得回滚资产 / 重复请求应返回已处理结果
// ============================================================

import type {
  StackItem,
  InstanceItem,
  InventorySource,
  InventoryChangeReason,
} from './InventoryDomain';
import { canStackMerge, generateUniqueId } from './InventoryDomain';
import { InventoryRepository } from './InventoryRepository';
import type {
  InventorySaveData,
  InventoryClaimStateEntry,
  InventoryTransactionSummary,
  InventoryRewardSnapshot,
} from './InventorySaveData';
import {
  createDefaultInventorySaveData,
  buildCurrencyIndex,
  trimTransactions,
  trimSnapshots,
} from './InventorySaveData';

// ==================== 事务结果类型 ====================

/** 事务错误码 */
export type TransactionErrorCode =
  | 'SUCCESS'
  | 'DUPLICATE_TRANSACTION'
  | 'INSUFFICIENT_ITEMS'
  | 'ITEM_NOT_STACKABLE'
  | 'ITEM_NOT_FOUND'
  | 'INSTANCE_NOT_FOUND'
  | 'INSTANCE_LOCKED'
  | 'VALIDATION_FAILED'
  | 'ROLLBACK_FAILED';

/** 单条资产变更记录 */
export interface AssetChangeEntry {
  itemId: string;
  delta: number;
  after: number;
  category: string;
}

/** 事务执行结果 */
export interface TransactionResult {
  /** 是否成功 */
  success: boolean;
  /** 错误码 */
  errorCode: TransactionErrorCode;
  /** 事务 ID */
  transactionId: string;
  /** 变更摘要 */
  changes: AssetChangeEntry[];
  /** 是否为重复请求（幂等返回） */
  isDuplicate: boolean;
  /** 额外信息 */
  message: string;
  /** [Phase10-Step5-Final-Fix] 本次事务创建的实例 uniqueId 列表（用于 Snapshot 精确追踪） */
  createdUniqueIds?: string[];
}

/** 批量添加资产请求 */
export interface AddAssetRequest {
  itemId: string;
  count: number;
  category?: string;
  subType?: string;
  quality?: number;
  source?: InventorySource;
  reason?: InventoryChangeReason;
}

/** 批量消耗资产请求 */
export interface ConsumeAssetRequest {
  itemId: string;
  count: number;
  uniqueId?: string; // 实例化资产必须指定
  reason?: InventoryChangeReason;
}

// ==================== 工厂函数 ====================

function successResult(
  transactionId: string,
  changes: AssetChangeEntry[],
  message: string = '成功',
): TransactionResult {
  return {
    success: true,
    errorCode: 'SUCCESS',
    transactionId,
    changes,
    isDuplicate: false,
    message,
  };
}

function duplicateResult(
  transactionId: string,
  changes: AssetChangeEntry[],
  message: string = '重复请求，已返回已处理结果',
): TransactionResult {
  return {
    success: true,
    errorCode: 'DUPLICATE_TRANSACTION',
    transactionId,
    changes,
    isDuplicate: true,
    message,
  };
}

function errorResult(
  code: TransactionErrorCode,
  transactionId: string,
  message: string,
): TransactionResult {
  return {
    success: false,
    errorCode: code,
    transactionId,
    changes: [],
    isDuplicate: false,
    message,
  };
}

// ==================== InventoryTransaction ====================

export class InventoryTransaction {
  /** 当前操作的存档数据引用（由 InventoryService 注入） */
  private _saveData: InventorySaveData;

  /** 事务前的数据快照（用于 rollback） */
  private _rollbackSnapshot: InventorySaveData | null = null;

  /** 当前事务 ID */
  private _currentTransactionId: string = '';

  /** 已处理的事务 ID 集合（内存缓存，防重复） */
  private _processedTransactionIds: Set<string> = new Set();

  // ===== 上限 =====

  private static readonly MAX_PROCESSED_IDS = 500;

  constructor() {
    this._saveData = createDefaultInventorySaveData();
  }

  // ===== 数据绑定 =====

  /** 绑定当前操作的存档数据 */
  bindData(data: InventorySaveData): void {
    this._saveData = data;
  }

  /** 获取当前绑定的存档数据（只读） */
  getData(): Readonly<InventorySaveData> {
    return this._saveData;
  }

  // ===== 幂等检查 =====

  /** 检查交易 ID 是否已处理 */
  isTransactionProcessed(transactionId: string): boolean {
    // 检查内存缓存
    if (this._processedTransactionIds.has(transactionId)) {
      return true;
    }

    // 检查 claimState
    return this._saveData.claimStates[transactionId]?.claimed === true;
  }

  /** 标记交易 ID 为已处理 */
  private _markTransactionProcessed(transactionId: string): void {
    this._processedTransactionIds.add(transactionId);

    // 裁剪内存缓存
    if (this._processedTransactionIds.size > InventoryTransaction.MAX_PROCESSED_IDS) {
      const entries = Array.from(this._processedTransactionIds);
      this._processedTransactionIds = new Set(entries.slice(-InventoryTransaction.MAX_PROCESSED_IDS / 2));
    }
  }

  // ===== 核心操作 =====

  /**
   * 批量添加资产（幂等）。
   *
   * 同一个 transactionId 不会重复发奖。
   *
   * @param transactionId  事务 ID
   * @param requests        要添加的资产请求列表
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
    // 幂等检查
    if (this.isTransactionProcessed(transactionId)) {
      const existingChanges = this._getTransactionChanges(transactionId);
      return duplicateResult(transactionId, existingChanges);
    }

    this._currentTransactionId = transactionId;

    // 保存 rollback 快照
    this._rollbackSnapshot = this._deepCloneSaveData();

    const changes: AssetChangeEntry[] = [];
    const createdUniqueIds: string[] = [];

    try {
      for (const req of requests) {
        if (req.count <= 0) continue;

        // 从 Repository 获取真实分类（Fix-05：不依赖 req.category）
        const repo = InventoryRepository.getInstance();
        const realCategory = repo.getCategory(req.itemId);

        // 判断是否需要实例化
        const isInstance = this._needsInstance(req.itemId);

        if (isInstance) {
          // 实例化资产：每个 count 创建一个 InstanceItem
          for (let i = 0; i < req.count; i++) {
            const uniqueId = generateUniqueId(realCategory);
            const instance = this._createInstanceItem(
              uniqueId,
              req.itemId,
              source,
              req.quality ?? 0,
            );
            this._saveData.instanceItems.push(instance);
            createdUniqueIds.push(uniqueId);
            changes.push({
              itemId: req.itemId,
              delta: 1,
              after: this._countInstances(req.itemId),
              category: realCategory,
            });
          }
        } else {
          // 堆叠资产：合并到现有 StackItem 或新建（含完整 merge 规则 + 自动拆分）
          const delta = this._addToStack(
            req.itemId,
            req.count,
            realCategory,
            source,
            '',   // activityId — 可从请求扩展字段获取
            0,    // expireAt — 可从请求扩展字段获取
          );
          changes.push({
            itemId: req.itemId,
            delta: req.count,
            after: delta,
            category: realCategory,
          });
        }
      }

      // 更新货币索引
      this._saveData.currencies = buildCurrencyIndex(this._saveData.stackItems);

      // 标记事务已处理
      this._markTransactionProcessed(transactionId);

      // 保存 claimState
      this._saveData.claimStates[transactionId] = {
        claimed: true,
        claimedAt: Date.now(),
        transactionId,
        snapshotId: '',
      };

      // 添加事务摘要（含原始变更记录，供幂等返回）
      this._addTransactionSummary(transactionId, reason, 'gain', requests.map((r) => r.itemId), true, changes);

      this._saveData.meta.updatedAt = Date.now();
      this._rollbackSnapshot = null;

      const result = successResult(transactionId, changes);
      result.createdUniqueIds = createdUniqueIds;
      return result;
    } catch (e) {
      // rollback
      if (this._rollbackSnapshot) {
        this._rollback();
      }
      return errorResult('VALIDATION_FAILED', transactionId, `添加资产失败: ${String(e)}`);
    }
  }

  /**
   * 批量消耗资产。
   *
   * @param transactionId  事务 ID
   * @param requests        要消耗的资产请求列表
   * @param reason          变更原因
   * @returns               事务结果
   */
  consumeAssets(
    transactionId: string,
    requests: ConsumeAssetRequest[],
    reason: InventoryChangeReason,
  ): TransactionResult {
    // 幂等检查
    if (this.isTransactionProcessed(transactionId)) {
      const existingChanges = this._getTransactionChanges(transactionId);
      return duplicateResult(transactionId, existingChanges);
    }

    this._currentTransactionId = transactionId;

    // 保存 rollback 快照
    this._rollbackSnapshot = this._deepCloneSaveData();

    const changes: AssetChangeEntry[] = [];

    try {
      // 先校验所有请求是否足够
      for (const req of requests) {
        if (req.count <= 0) continue;

        if (req.uniqueId) {
          // 消耗实例化资产
          const instance = this._findInstance(req.uniqueId);
          if (!instance) {
            this._rollback();
            return errorResult('INSTANCE_NOT_FOUND', transactionId, `实例 ${req.uniqueId} 未找到`);
          }
          if (instance.lockState === 'locked') {
            this._rollback();
            return errorResult('INSTANCE_LOCKED', transactionId, `实例 ${req.uniqueId} 已锁定，不可消耗`);
          }
        } else {
          // 消耗堆叠资产
          const current = this._getStackCount(req.itemId);
          if (current < req.count) {
            this._rollback();
            return errorResult(
              'INSUFFICIENT_ITEMS',
              transactionId,
              `${req.itemId} 数量不足: 需要 ${req.count}, 当前 ${current}`,
            );
          }
        }
      }

      // 校验通过，执行消耗
      for (const req of requests) {
        if (req.count <= 0) continue;

        if (req.uniqueId) {
          // 移除实例
          this._removeInstance(req.uniqueId);
          changes.push({
            itemId: req.itemId,
            delta: -1,
            after: this._countInstances(req.itemId),
            category: 'Equipment',
          });
        } else {
          // 扣除堆叠数量
          const after = this._subtractFromStack(req.itemId, req.count);
          changes.push({
            itemId: req.itemId,
            delta: -req.count,
            after,
            category: 'Material',
          });
        }
      }

      // 更新货币索引
      this._saveData.currencies = buildCurrencyIndex(this._saveData.stackItems);

      // 标记事务已处理
      this._markTransactionProcessed(transactionId);

      // 保存 claimState
      this._saveData.claimStates[transactionId] = {
        claimed: true,
        claimedAt: Date.now(),
        transactionId,
        snapshotId: '',
      };

      // 添加事务摘要（含原始变更记录，供幂等返回）
      this._addTransactionSummary(transactionId, reason, 'consume', requests.map((r) => r.itemId), true, changes);

      this._saveData.meta.updatedAt = Date.now();
      this._rollbackSnapshot = null;

      return successResult(transactionId, changes);
    } catch (e) {
      if (this._rollbackSnapshot) {
        this._rollback();
      }
      return errorResult('VALIDATION_FAILED', transactionId, `消耗资产失败: ${String(e)}`);
    }
  }

  /**
   * 检查资产是否足够。
   *
   * @param itemId   物品 ID
   * @param count    需要的数量
   * @param uniqueId 实例化资产时指定
   * @returns        是否足够
   */
  checkSufficient(itemId: string, count: number, uniqueId?: string): boolean {
    if (uniqueId) {
      return this._findInstance(uniqueId) !== null;
    }
    const current = this._getStackCount(itemId);
    return current >= count;
  }

  // ===== 查询 =====

  /** 获取堆叠资产数量 */
  getStackCount(itemId: string): number {
    return this._getStackCount(itemId);
  }

  /** 获取实例化资产数量 */
  getInstanceCount(itemId: string): number {
    return this._countInstances(itemId);
  }

  /** 获取指定 itemId 的所有实例 */
  getInstancesByItemId(itemId: string): InstanceItem[] {
    return this._saveData.instanceItems.filter((i) => i.itemId === itemId);
  }

  /** 获取指定 uniqueId 的实例 */
  getInstanceByUniqueId(uniqueId: string): InstanceItem | null {
    return this._findInstance(uniqueId) ?? null;
  }

  /** 获取货币余额 */
  getCurrencyBalance(currencyType: 'gold' | 'spiritStone' | 'diamond'): number {
    switch (currencyType) {
      case 'gold':
        return this._saveData.currencies.gold;
      case 'spiritStone':
        return this._saveData.currencies.spiritStone;
      case 'diamond':
        return this._saveData.currencies.diamond;
      default:
        return 0;
    }
  }

  // ===== 内部 =====

  private _needsInstance(itemId: string): boolean {
    return InventoryRepository.getInstance().requiresInstance(itemId);
  }

  private _createInstanceItem(
    uniqueId: string,
    itemId: string,
    source: InventorySource,
    quality: number,
  ): InstanceItem {
    const repo = InventoryRepository.getInstance();
    const category = repo.getCategory(itemId);
    const subType = repo.getSubType(itemId);

    return {
      uniqueId,
      itemId,
      category,
      subType,
      quality,
      level: 1,
      affix: {},
      bindState: 'obtained_bind',
      lockState: 'none',
      expireAt: 0,
      source,
      createdAt: Date.now(),
      extraData: {},
    };
  }

  /**
   * 向堆叠中添加资产。
   *
   * 合并规则：
   * 1. 使用 canStackMerge() 完整匹配 itemId + bindState + expireAt + activityId + sourceTag
   * 2. 超出 maxStack 时自动拆分堆叠，不丢失资产
   *
   * @param itemId   物品 ID
   * @param count    添加数量
   * @param category 资产大类（fallback）
   * @param sourceTag 来源标签（可选）
   * @param activityId 活动 ID（可选）
   * @param expireAt  过期时间戳（可选）
   * @returns 添加后所有匹配 StackItem 的总数量
   */
  private _addToStack(
    itemId: string,
    count: number,
    category: string,
    sourceTag: string = '',
    activityId: string = '',
    expireAt: number = 0,
  ): number {
    const repo = InventoryRepository.getInstance();
    const realCategory = repo.getCategory(itemId);
    const realSubType = repo.getSubType(itemId);
    const maxStack = repo.getMaxStack(itemId);

    // 构建候选 StackItem 用于 merge 比对
    const candidate: StackItem = {
      itemId,
      category: realCategory,
      subType: realSubType,
      count: 0,
      maxStack,
      bindState: 'none',
      expireAt,
      activityId,
      sourceTag,
      quality: 0,
    };

    // 尝试合并到现有堆叠
    for (const item of this._saveData.stackItems) {
      if (!canStackMerge(item, candidate)) continue;

      const newCount = item.count + count;
      if (maxStack > 0 && newCount > maxStack) {
        // 自动拆分：填满当前堆叠，溢出部分创建新堆叠
        const overflow = newCount - maxStack;
        item.count = maxStack;

        // 溢出部分递归分配（创建新堆叠）
        this._addToStack(itemId, overflow, category, sourceTag, activityId, expireAt);
        return maxStack;
      } else {
        item.count = newCount;
        return item.count;
      }
    }

    // 没有可合并的现有堆叠，创建新 StackItem
    if (maxStack > 0 && count > maxStack) {
      // 需要拆分为多个堆叠
      let remaining = count;
      let total = 0;
      while (remaining > 0) {
        const stackCount = Math.min(remaining, maxStack);
        const newItem: StackItem = {
          itemId,
          category: realCategory,
          subType: realSubType,
          count: stackCount,
          maxStack,
          bindState: 'none',
          expireAt,
          activityId,
          sourceTag,
          quality: 0,
        };
        this._saveData.stackItems.push(newItem);
        total += stackCount;
        remaining -= stackCount;
      }
      return total;
    }

    // 创建单个新堆叠
    const newItem: StackItem = {
      itemId,
      category: realCategory,
      subType: realSubType,
      count,
      maxStack,
      bindState: 'none',
      expireAt,
      activityId,
      sourceTag,
      quality: 0,
    };
    this._saveData.stackItems.push(newItem);
    return count;
  }

  private _subtractFromStack(itemId: string, count: number): number {
    for (const item of this._saveData.stackItems) {
      if (item.itemId === itemId) {
        item.count -= count;
        if (item.count < 0) item.count = 0;
        return item.count;
      }
    }
    return 0;
  }

  private _getStackCount(itemId: string): number {
    for (const item of this._saveData.stackItems) {
      if (item.itemId === itemId) return item.count;
    }
    return 0;
  }

  private _countInstances(itemId: string): number {
    return this._saveData.instanceItems.filter((i) => i.itemId === itemId).length;
  }

  private _findInstance(uniqueId: string): InstanceItem | undefined {
    return this._saveData.instanceItems.find((i) => i.uniqueId === uniqueId);
  }

  private _removeInstance(uniqueId: string): void {
    const index = this._saveData.instanceItems.findIndex((i) => i.uniqueId === uniqueId);
    if (index >= 0) {
      this._saveData.instanceItems.splice(index, 1);
    }
  }

  // ===== Rollback =====

  private _rollback(): void {
    if (this._rollbackSnapshot) {
      this._saveData.stackItems = this._rollbackSnapshot.stackItems;
      this._saveData.instanceItems = this._rollbackSnapshot.instanceItems;
      this._saveData.currencies = this._rollbackSnapshot.currencies;
      this._saveData.claimStates = this._rollbackSnapshot.claimStates;
      this._saveData.transactions = this._rollbackSnapshot.transactions;
      this._saveData.snapshots = this._rollbackSnapshot.snapshots;
      this._saveData.meta = this._rollbackSnapshot.meta;
      this._rollbackSnapshot = null;
    }
  }

  private _deepCloneSaveData(): InventorySaveData {
    return {
      stackItems: this._saveData.stackItems.map((s) => ({ ...s })),
      instanceItems: this._saveData.instanceItems.map((i) => ({ ...i, affix: { ...i.affix }, extraData: { ...i.extraData } })),
      currencies: { ...this._saveData.currencies },
      claimStates: { ...this._saveData.claimStates },
      transactions: this._saveData.transactions.map((t) => ({ ...t })),
      snapshots: this._saveData.snapshots.map((s) => ({
        ...s,
        stackChanges: s.stackChanges.map((c) => ({ ...c })),
        instanceChanges: s.instanceChanges.map((c) => ({ ...c })),
      })),
      meta: { ...this._saveData.meta },
    };
  }

  private _getTransactionChanges(transactionId: string): AssetChangeEntry[] {
    // 从已保存的事务摘要中查找原始变更记录
    const summary = this._saveData.transactions.find((t) => t.transactionId === transactionId);
    if (summary?.changes && summary.changes.length > 0) {
      return summary.changes;
    }
    // fallback: 如果未存储原始变更，返回空数组（通过 isDuplicate flag 标记）
    return [];
  }

  private _addTransactionSummary(
    transactionId: string,
    reason: InventoryChangeReason,
    changeType: 'gain' | 'consume' | 'adjust',
    itemIds: string[],
    success: boolean,
    changes?: AssetChangeEntry[],
  ): void {
    const summary: InventoryTransactionSummary = {
      transactionId,
      reason,
      changeType,
      itemIds,
      summary: `${changeType}: ${itemIds.join(', ')} (${reason})`,
      executedAt: Date.now(),
      success,
      changes,
    };

    this._saveData.transactions.unshift(summary);
    this._saveData.transactions = trimTransactions(this._saveData.transactions);
  }

  // ===== 快照管理 =====

  /** 保存奖励快照 */
  saveSnapshot(snapshot: InventoryRewardSnapshot): void {
    this._saveData.snapshots.unshift(snapshot);
    this._saveData.snapshots = trimSnapshots(this._saveData.snapshots);

    // 关联 claimState
    if (this._saveData.claimStates[snapshot.transactionId]) {
      this._saveData.claimStates[snapshot.transactionId].snapshotId = snapshot.snapshotId;
    }
  }

  /** 获取快照列表 */
  getSnapshots(): InventoryRewardSnapshot[] {
    return this._saveData.snapshots;
  }

  /** 获取指定事务的快照 */
  getSnapshotByTransactionId(transactionId: string): InventoryRewardSnapshot | null {
    return this._saveData.snapshots.find((s) => s.transactionId === transactionId) ?? null;
  }
}

