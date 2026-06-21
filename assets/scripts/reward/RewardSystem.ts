// ============================================================
// RewardSystem.ts — 统一奖励系统
// 职责：统一奖励入口 / 奖励汇总 / 奖励发放 / 奖励记录 / 幂等防重
// 位置：reward/ 层
// 依赖：EventManager, SaveManager, RewardTypes, SeededRandom
// 规范：零 any / 所有发放走此入口 / 记录所有历史 / 支持幂等
//
// ClaimState 双源策略（Phase10-Step5-Fix）：
//   - 主真相源（PRIMARY）：InventorySaveData.claimStates[transactionId]
//     由 InventoryTransaction 在资产变更时原子写入，是"玩家是否收到资产"的权威记录。
//   - 从缓存源（SECONDARY）：RewardSaveData.claimState[sourceType:sourceId]
//     由 RewardSystem 在发放前写入，是"此来源是否已触发过发放"的便捷缓存。
//     不直接代表资产到账状态。
//   - isClaimed() 同时检查两个源，以 Inventory 为准。
//   - markClaimed() 写入两个源，但 Inventory 是唯一真相。
// ============================================================

import { BaseManager } from '../core/BaseManager';
import { EventManager } from '../core/EventManager';
import { SaveManager } from '../save/SaveManager';
import type { SaveContainerV8 } from '../save/SaveContainerV8';
import { createDefaultInventorySaveData } from '../inventory/InventorySaveData';
import type {
  RewardEntry,
  RewardHistoryRecord,
  RewardSaveData,
  AggregatedReward,
  RewardSourceType,
  RewardSnapshotEntry,
  RewardClaimStateEntry,
  RewardSettleResult,
} from './RewardTypes';
import {
  createDefaultRewardSaveData,
  generateTransactionId,
  buildClaimStateKey,
} from './RewardTypes';
import type { SeededRandomSnapshot } from './SeededRandom';

// ==================== 事件名常量 ====================

export const RewardEvent = {
  /** 奖励发放完成 */
  REWARD_GRANTED: 'reward:granted',
  /** 奖励历史已更新 */
  REWARD_HISTORY_UPDATED: 'reward:historyUpdated',
  /** 奖励领取状态已更新 */
  REWARD_CLAIM_STATE_UPDATED: 'reward:claimStateUpdated',
} as const;

// ==================== 事件载荷 ====================

export interface RewardGrantedEvent {
  aggregated: AggregatedReward;
  source: RewardSourceType;
  sourceId: string;
  transactionId: string;
}

// ==================== 常量 ====================

/** 最大历史记录数（展示用） */
const MAX_HISTORY = 50;

/** 最大快照数（审计用） */
const MAX_SNAPSHOTS = 100;

// ==================== RewardSystem ====================

export class RewardSystem extends BaseManager {
  // ===== 单例 =====

  static getInstance(): RewardSystem {
    return super.getInstance<RewardSystem>();
  }

  // ===== 依赖 =====

  private _eventManager: EventManager;
  private _saveManager: SaveManager;

  // ===== 内部状态 =====

  private _lastReward: AggregatedReward | null = null;
  private _initialized: boolean = false;

  // ===== 构造 =====

  constructor() {
    super();
    this._eventManager = EventManager.getInstance();
    this._saveManager = SaveManager.getInstance();
  }

  // ================================================================
  // 公共接口
  // ================================================================

  // ===== 初始化 =====

  /**
   * 初始化奖励系统
   *
   * 确保 SaveV2 中 rewardData 字段存在（旧存档自动补全）。
   */
  initialize(): void {
    if (this._initialized) return;

    const v8 = this._saveManager.getData() as SaveContainerV8 | null;
    if (v8 && !v8.rewardData) {
      v8.rewardData = createDefaultRewardSaveData();
      this._saveManager.markDirty();
    }

    // 确保 claimState 子字段补全
    if (v8?.rewardData && !v8.rewardData.claimState) {
      v8.rewardData.claimState = {};
    }
    if (v8?.rewardData && !v8.rewardData.rewardSnapshots) {
      v8.rewardData.rewardSnapshots = [];
    }

    this._initialized = true;
    console.log('[RewardSystem] 初始化完成');
  }

  /** 是否已初始化 */
  isInitialized(): boolean {
    return this._initialized;
  }

  // ===== 奖励构建 =====

  /**
   * 构建奖励列表（不发放，仅聚合）。
   *
   * 注意：不会原地修改传入的 entries；返回新对象。
   *
   * @param source   — 奖励来源类型
   * @param sourceId — 来源标识
   * @param entries  — 奖励条目列表
   * @returns 聚合后的奖励摘要
   */
  buildReward(
    source: RewardSourceType,
    sourceId: string,
    entries: RewardEntry[],
  ): AggregatedReward {
    const items: Record<string, number> = {};
    let totalGold = 0;
    let totalExp = 0;

    // 创建副本，保留原始 pool source 不被覆盖
    const normalizedEntries: RewardEntry[] = entries.map((e) => ({
      ...e,
      source: e.source === 'pool' ? 'pool' : source,
      sourceId: e.sourceId || sourceId,
    }));

    for (const entry of normalizedEntries) {
      // 汇总 itemId
      items[entry.itemId] = (items[entry.itemId] || 0) + entry.count;

      // 汇总金币
      if (entry.itemId === 'ITEM_GOLD' || entry.itemType === 'gold') {
        totalGold += entry.count;
      }

      // 汇总经验
      if (entry.itemId === 'ITEM_EXP' || entry.itemType === 'exp') {
        totalExp += entry.count;
      }
    }

    return {
      items,
      totalGold,
      totalExp,
      rawRewards: normalizedEntries,
    };
  }

  // ===== 奖励发放（基础版 — 向后兼容） =====

  /**
   * 发放奖励（自动生成事务 ID）。
   *
   * 流程：
   *   1. 校验并生成事务 ID
   *   2. 保存奖励记录到 SaveV2
   *   3. 写入 lastRewardTransactionId 到 saveMetaV2
   *   4. 更新 lastRewardTime
   *   5. 发射 REWARD_GRANTED 事件（供 Inventory / Analytics 消费）
   *   6. 更新 _lastReward
   *
   * @param aggregated — 聚合后的奖励摘要
   * @returns 事务 ID
   */
  grantReward(aggregated: AggregatedReward): string {
    if (aggregated.rawRewards.length === 0) return '';

    // 确保初始化
    if (!this._initialized) {
      this.initialize();
    }

    const firstEntry = aggregated.rawRewards[0];
    const transactionId = generateTransactionId(firstEntry.source, firstEntry.sourceId);

    return this._doGrantReward(aggregated, transactionId, null, null);
  }

  // ===== 奖励发放（幂等版 — 支持事务 ID 和 seed） =====

  /**
   * 发放奖励（带事务 ID、种子快照 — 推荐使用）。
   *
   * 与 grantReward() 的区别：
   * - 接受外部传入的 transactionId，支持幂等防重
   * - 接受 seed 和 rngSnapshot，保存到 RewardSnapshotEntry 用于审计
   * - 接受 poolId / configVersion，补充审计信息
   *
   * @param aggregated    — 聚合后的奖励摘要
   * @param transactionId — 奖励事务 ID（由调用方生成）
   * @param poolId        — 奖励池 ID（随机池奖励时传入）
   * @param seed          — 随机种子（随机池奖励时传入）
   * @param rngSnapshot   — RNG 状态快照（随机池奖励时传入）
   * @param configVersion — 配置版本号
   * @returns 事务 ID
   */
  grantRewardWithTransaction(
    aggregated: AggregatedReward,
    transactionId: string,
    poolId?: string,
    seed?: string,
    rngSnapshot?: SeededRandomSnapshot,
    configVersion?: string,
  ): string {
    if (aggregated.rawRewards.length === 0) return '';

    if (!this._initialized) {
      this.initialize();
    }

    return this._doGrantReward(
      aggregated,
      transactionId,
      poolId ?? null,
      seed ?? null,
      rngSnapshot ?? null,
      configVersion ?? null,
    );
  }

  // ===== 领取状态管理 =====

  /**
   * 检查指定来源是否已领取。
   *
   * 用于章节奖励、事件奖励等一次性奖励的幂等防护。
   *
   * 双源校验（Phase10-Step5-Fix）：
   *   1. 优先检查 Inventory（主真相源）— 看是否有对应 transactionId 的 claimState
   *   2. 其次检查 Reward（从缓存源）— 看 sourceType:sourceId 是否已标记
   *   以 Inventory 为准，Reward 为 fallback。
   *
   * @param sourceType — 奖励来源类型
   * @param sourceId   — 来源标识
   * @returns 是否已领取
   */
  isClaimed(sourceType: RewardSourceType, sourceId: string): boolean {
    const v8 = this._saveManager.getData() as SaveContainerV8 | null;
    if (!v8) return false;

    // 主真相源：Inventory claimStates（按 transactionId 索引）
    // 遍历 Inventory claimStates，检查是否有匹配 sourceType:sourceId 的条目
    if (v8.inventoryData?.claimStates) {
      const key = buildClaimStateKey(sourceType, sourceId);
      for (const invClaimKey of Object.keys(v8.inventoryData.claimStates)) {
        // Inventory claimStates key = transactionId; value.claimed = boolean
        // Reward claimState key = sourceType:sourceId
        // 跨系统匹配：检查 Inventory 是否有对应的已领取事务
        // 通过 Reward 的事务映射来关联
        if (v8.inventoryData.claimStates[invClaimKey]?.claimed === true) {
          // 如果有对应关联（通过 Reward 的 claimState 建立映射）
          const rewardClaim = v8.rewardData?.claimState?.[key];
          if (rewardClaim?.transactionId === invClaimKey) {
            return true;
          }
        }
      }
    }

    // 从缓存源：Reward claimState
    if (!v8?.rewardData?.claimState) return false;
    const key = buildClaimStateKey(sourceType, sourceId);
    return v8.rewardData.claimState[key]?.claimed === true;
  }

  /**
   * 获取指定来源的领取状态详情。
   *
   * @param sourceType — 奖励来源类型
   * @param sourceId   — 来源标识
   * @returns 领取状态条目，未领取时返回 null
   */
  getClaimState(sourceType: RewardSourceType, sourceId: string): RewardClaimStateEntry | null {
    const v8 = this._saveManager.getData() as SaveContainerV8 | null;
    if (!v8?.rewardData?.claimState) return null;

    const key = buildClaimStateKey(sourceType, sourceId);
    return v8.rewardData.claimState[key] ?? null;
  }

  /**
   * 标记指定来源为已领取。
   *
   * 双写策略（Phase10-Step5-Fix）：
   *   - 写入 Reward claimState（从缓存源）
   *   - 也写入 Inventory claimStates（主真相源），确保两源一致
   *
   * @param sourceType    — 奖励来源类型
   * @param sourceId      — 来源标识
   * @param transactionId — 关联的事务 ID
   */
  markClaimed(
    sourceType: RewardSourceType,
    sourceId: string,
    transactionId: string,
  ): void {
    if (!this._initialized) {
      this.initialize();
    }

    const v8 = this._saveManager.getData() as SaveContainerV8 | null;
    if (!v8) return;

    // 确保 InventoryData 存在
    if (!v8.inventoryData) {
      // 延迟初始化：InventoryService 尚未创建数据时，由 RewardSystem 补全
      v8.inventoryData = createDefaultInventorySaveData();
    }

    // 写入主真相源（Inventory）
    if (!v8.inventoryData.claimStates) {
      v8.inventoryData.claimStates = {};
    }
    v8.inventoryData.claimStates[transactionId] = {
      claimed: true,
      claimedAt: Date.now(),
      transactionId,
      snapshotId: '',
    };

    // 写入从缓存源（Reward）
    if (!v8.rewardData) {
      v8.rewardData = createDefaultRewardSaveData();
    }
    if (!v8.rewardData.claimState) {
      v8.rewardData.claimState = {};
    }

    const key = buildClaimStateKey(sourceType, sourceId);
    v8.rewardData.claimState[key] = {
      claimed: true,
      claimedAt: Date.now(),
      transactionId,
    };

    this._saveManager.markDirty();
    this._eventManager.emit(RewardEvent.REWARD_CLAIM_STATE_UPDATED, {
      sourceType,
      sourceId,
      key,
      claimed: true,
      transactionId,
    });
  }

  /**
   * 重置指定来源的领取状态（仅用于调试/测试）。
   *
   * @param sourceType — 奖励来源类型
   * @param sourceId   — 来源标识
   */
  resetClaimState(sourceType: RewardSourceType, sourceId: string): void {
    const v8 = this._saveManager.getData() as SaveContainerV8 | null;
    if (!v8?.rewardData?.claimState) return;

    const key = buildClaimStateKey(sourceType, sourceId);
    delete v8.rewardData.claimState[key];
    this._saveManager.markDirty();
  }

  /** 获取所有领取状态 */
  getAllClaimStates(): Record<string, RewardClaimStateEntry> {
    const v8 = this._saveManager.getData() as SaveContainerV8 | null;
    return v8?.rewardData?.claimState ?? {};
  }

  // ===== 查询 =====

  /** 获取最近一次发放的奖励 */
  getLastReward(): AggregatedReward | null {
    return this._lastReward;
  }

  /** 获取最近奖励历史 */
  getRecentRewards(): RewardHistoryRecord[] {
    const v8 = this._saveManager.getData() as SaveContainerV8 | null;
    if (!v8?.rewardData?.recentRewards) return [];
    return v8.rewardData.recentRewards;
  }

  /** 获取最近奖励历史数量 */
  getRecentRewardCount(): number {
    const v8 = this._saveManager.getData() as SaveContainerV8 | null;
    return v8?.rewardData?.recentRewards?.length ?? 0;
  }

  /** 获取奖励存档数据 */
  getRewardSaveData(): RewardSaveData | null {
    const v8 = this._saveManager.getData() as SaveContainerV8 | null;
    return v8?.rewardData ?? null;
  }

  /** 获取奖励快照列表 */
  getRewardSnapshots(): RewardSnapshotEntry[] {
    const v8 = this._saveManager.getData() as SaveContainerV8 | null;
    return v8?.rewardData?.rewardSnapshots ?? [];
  }

  /** 获取最后使用的事务 ID（来自 saveMetaV2） */
  getLastTransactionId(): string {
    const v8 = this._saveManager.getData() as SaveContainerV8 | null;
    return v8?.saveMetaV2?.lastRewardTransactionId ?? '';
  }

  /** 清空最近历史 */
  clearHistory(): void {
    const v8 = this._saveManager.getData() as SaveContainerV8 | null;
    if (v8?.rewardData) {
      v8.rewardData.recentRewards = [];
      this._saveManager.markDirty();
      this._eventManager.emit(RewardEvent.REWARD_HISTORY_UPDATED, {
        count: 0,
      });
    }
  }

  // ================================================================
  // 内部 — 核心发放逻辑
  // ================================================================

  /**
   * 执行奖励发放的内部实现。
   *
   * 步骤：
   * 1. 保存奖励记录到 SaveV2（含审计字段）
   * 2. 更新 lastRewardTransactionId 到 saveMetaV2
   * 3. 保存奖励快照（如有 RNG 信息）
   * 4. 更新 lastRewardTime
   * 5. 发射 REWARD_GRANTED 事件
   * 6. 更新 _lastReward
   *
   * @returns 事务 ID
   */
  private _doGrantReward(
    aggregated: AggregatedReward,
    transactionId: string,
    poolId: string | null,
    seed: string | null,
    rngSnapshot: SeededRandomSnapshot | null = null,
    configVersion: string | null = null,
  ): string {
    // 保存到存档（含审计字段）
    this._recordReward(aggregated, transactionId, poolId, seed, configVersion);

    // 写入 saveMetaV2.lastRewardTransactionId（关闭事务防重链路）
    this._updateLastTransactionId(transactionId);

    // 保存奖励快照（随机池奖励）
    if (poolId && seed && rngSnapshot) {
      this._saveRewardSnapshot(
        aggregated,
        transactionId,
        poolId,
        seed,
        configVersion ?? 'unknown',
      );
    }

    // 更新最后发放时间
    this._updateLastRewardTime();

    // 保存 _lastReward
    this._lastReward = aggregated;

    // 发射事件
    const firstEntry = aggregated.rawRewards[0];
    this._eventManager.emit(RewardEvent.REWARD_GRANTED, {
      aggregated,
      source: firstEntry.source,
      sourceId: firstEntry.sourceId,
      transactionId,
    } satisfies RewardGrantedEvent);

    console.log(
      `[RewardSystem] 奖励发放完成: txn=${transactionId}, gold=${aggregated.totalGold}, ` +
      `exp=${aggregated.totalExp}, items=${Object.keys(aggregated.items).length}`,
    );

    return transactionId;
  }

  // ================================================================
  // 内部 — 记录 & 更新
  // ================================================================

  private _recordReward(
    aggregated: AggregatedReward,
    transactionId: string,
    poolId: string | null,
    seed: string | null,
    configVersion: string | null,
  ): void {
    const v8 = this._saveManager.getData() as SaveContainerV8 | null;
    if (!v8) return;

    // 确保 rewardData 存在
    if (!v8.rewardData) {
      v8.rewardData = createDefaultRewardSaveData();
    }

    const record: RewardHistoryRecord = {
      recordId: `R_${transactionId}`,
      source: aggregated.rawRewards[0]?.source ?? 'battle',
      sourceId: aggregated.rawRewards[0]?.sourceId ?? '',
      rewards: aggregated.rawRewards,
      grantedAt: Date.now(),
      transactionId,
      ...(poolId ? { poolId } : {}),
      ...(seed ? { seed } : {}),
      ...(configVersion ? { configVersion } : {}),
    };

    // 插入到最近奖励历史（头插）
    v8.rewardData.recentRewards.unshift(record);

    // 裁剪到 MAX_HISTORY
    if (v8.rewardData.recentRewards.length > MAX_HISTORY) {
      v8.rewardData.recentRewards = v8.rewardData.recentRewards.slice(0, MAX_HISTORY);
    }

    this._saveManager.markDirty();
    this._eventManager.emit(RewardEvent.REWARD_HISTORY_UPDATED, {
      count: v8.rewardData.recentRewards.length,
    });
  }

  private _updateLastTransactionId(transactionId: string): void {
    const v8 = this._saveManager.getData() as SaveContainerV8 | null;
    if (!v8) return;

    v8.saveMetaV2.lastRewardTransactionId = transactionId;
    this._saveManager.markDirty();
  }

  private _updateLastRewardTime(): void {
    const v8 = this._saveManager.getData() as SaveContainerV8 | null;
    if (!v8) return;

    if (!v8.rewardData) {
      v8.rewardData = createDefaultRewardSaveData();
    }

    v8.rewardData.lastRewardTime = Date.now();
    this._saveManager.markDirty();
  }

  /**
   * 保存随机奖励快照。
   *
   * 快照独立于展示历史，用于审计复盘，不随 MAX_HISTORY 裁剪。
   */
  private _saveRewardSnapshot(
    aggregated: AggregatedReward,
    transactionId: string,
    poolId: string,
    seed: string,
    configVersion: string,
  ): void {
    const v8 = this._saveManager.getData() as SaveContainerV8 | null;
    if (!v8) return;

    if (!v8.rewardData) {
      v8.rewardData = createDefaultRewardSaveData();
    }
    if (!v8.rewardData.rewardSnapshots) {
      v8.rewardData.rewardSnapshots = [];
    }

    const firstEntry = aggregated.rawRewards[0];
    const snapshot: RewardSnapshotEntry = {
      snapshotId: `snap_${transactionId}`,
      sourceType: firstEntry.source,
      sourceId: firstEntry.sourceId,
      poolId,
      seed,
      configVersion,
      rewards: aggregated.rawRewards,
      createdAt: Date.now(),
      transactionId,
    };

    v8.rewardData.rewardSnapshots.unshift(snapshot);

    // 裁剪快照到 MAX_SNAPSHOTS
    if (v8.rewardData.rewardSnapshots.length > MAX_SNAPSHOTS) {
      v8.rewardData.rewardSnapshots = v8.rewardData.rewardSnapshots.slice(0, MAX_SNAPSHOTS);
    }

    this._saveManager.markDirty();
  }
}
