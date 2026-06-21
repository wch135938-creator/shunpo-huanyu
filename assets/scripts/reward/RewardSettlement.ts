// ============================================================
// RewardSettlement.ts — 奖励结算器
// 职责：战斗/章节/事件/动态敌人 各自独立结算入口
//       Phase7 兼容桥接 / 幂等防重 / 结算预览与确认分离
// 位置：reward/ 层
// 依赖：RewardRepository, RewardPoolRepository, RewardSystem, RewardTypes
// 规范：零 any / 幂等发放 / 支持事务 ID / Phase7 兼容
// ============================================================

import { BaseManager } from '../core/BaseManager';
import { RewardRepository } from './RewardRepository';
import { RewardPoolRepository, type RollContext } from './RewardPoolRepository';
import { RewardSystem } from './RewardSystem';
import type { BattleResult, BattleReward } from '../battle/BattleResult';
import type {
  RewardEntry,
  AggregatedReward,
  ChapterRewardEntry,
  EventRewardEntry,
  EnemyRewardEntry,
  RewardSourceType,
  RewardSettleResult,
} from './RewardTypes';
import {
  generateTransactionId,
  mapPhase7SourceType,
} from './RewardTypes';
import type { SeededRandomSnapshot } from './SeededRandom';

// ==================== 结算选项 ====================

/**
 * 结算选项。
 */
export interface SettlementOptions {
  /** 是否包含奖励池抽取（默认 true） */
  includePool?: boolean;
  /** 玩家 ID（用于种子生成） */
  playerId?: string;
  /** 尝试索引（同一来源多次结算时递增） */
  attemptIndex?: number;
  /** 配置版本号 */
  configVersion?: string;
}

// ==================== RewardSettlement ====================

export class RewardSettlement extends BaseManager {
  // ===== 单例 =====

  static getInstance(): RewardSettlement {
    return super.getInstance<RewardSettlement>();
  }

  // ===== 依赖 =====

  private _rewardRepo: RewardRepository;
  private _poolRepo: RewardPoolRepository;
  private _rewardSystem: RewardSystem;

  // ===== 构造 =====

  constructor() {
    super();
    this._rewardRepo = RewardRepository.getInstance();
    this._poolRepo = RewardPoolRepository.getInstance();
    this._rewardSystem = RewardSystem.getInstance();
  }

  // ================================================================
  // 公共接口
  // ================================================================

  // ===== 战斗奖励结算 =====

  /**
   * 结算战斗奖励（从 BattleResult 提取奖励并发放）。
   *
   * 规则：
   * - 仅胜利时发放奖励。
   * - 失败战斗即使 rewards 非空也不发放。
   *
   * @param battleResult — 战斗结算结果
   * @param options      — 结算选项（可选）
   * @returns 结算结果
   */
  settleBattleReward(
    battleResult: BattleResult,
    options?: SettlementOptions,
  ): RewardSettleResult {
    // 仅胜利时发放奖励
    if (!battleResult.isVictory) {
      return {
        success: false,
        aggregated: null,
        transactionId: '',
        isDuplicate: false,
        reason: '战斗未胜利，不发放奖励',
      };
    }

    if (battleResult.rewards.length === 0) {
      return {
        success: false,
        aggregated: null,
        transactionId: '',
        isDuplicate: false,
        reason: '无奖励条目',
      };
    }

    const transactionId = generateTransactionId('battle', battleResult.stageId);

    const entries: RewardEntry[] = [];

    // 转换 BattleReward → RewardEntry
    for (const br of battleResult.rewards) {
      entries.push({
        itemId: br.itemId,
        itemType: br.itemType,
        count: br.count,
        source: 'battle',
        sourceId: battleResult.stageId,
      });
    }

    const aggregated = this._rewardSystem.buildReward(
      'battle',
      battleResult.stageId,
      entries,
    );

    this._rewardSystem.grantRewardWithTransaction(aggregated, transactionId);

    return {
      success: true,
      aggregated,
      transactionId,
      isDuplicate: false,
    };
  }

  // ===== 章节奖励结算 =====

  /**
   * 结算章节完成奖励（幂等）。
   *
   * 流程：
   *   1. 检查是否已领取 → 已领取则返回 isDuplicate=true
   *   2. 从 RewardRepository 查询章节奖励配置
   *   3. 构建 RewardEntry 列表
   *   4. 可选附加奖励池抽取（使用确定性 RNG）
   *   5. 通过 RewardSystem 发放
   *   6. 标记已领取
   *
   * @param chapterId  — 章节 ID
   * @param options    — 结算选项（includePool 默认 true）
   * @returns 结算结果
   */
  settleChapterReward(
    chapterId: string,
    options?: SettlementOptions,
  ): RewardSettleResult {
    const includePool = options?.includePool ?? true;

    // 幂等检查
    if (this._rewardSystem.isClaimed('chapter', chapterId)) {
      const existingState = this._rewardSystem.getClaimState('chapter', chapterId);
      console.log(`[RewardSettlement] 章节奖励已领取: ${chapterId}, txn=${existingState?.transactionId}`);
      return {
        success: false,
        aggregated: null,
        transactionId: existingState?.transactionId ?? '',
        isDuplicate: true,
        reason: `章节奖励已领取: ${chapterId}`,
      };
    }

    const chapterReward = this._rewardRepo.getChapterReward(chapterId);
    if (!chapterReward) {
      console.warn(`[RewardSettlement] 章节奖励配置不存在: ${chapterId}`);
      return {
        success: false,
        aggregated: null,
        transactionId: '',
        isDuplicate: false,
        reason: `章节奖励配置不存在: ${chapterId}`,
      };
    }

    const entries = this._chapterRewardToEntries(chapterReward);
    const transactionId = generateTransactionId('chapter', chapterId);
    let poolId: string | undefined;
    let seed: string | undefined;
    let rngSnapshot: SeededRandomSnapshot | undefined;

    // 附加奖励池抽取（确定性 RNG）
    if (includePool) {
      poolId = 'REWARD_POOL_CHAPTER_BONUS';
      const rollCtx = this._buildRollContext('chapter', chapterId, poolId, options);
      const rollResult = this._poolRepo.rollRewardWithSeed(poolId, rollCtx);
      if (rollResult.entries.length > 0) {
        entries.push(...rollResult.entries);
        seed = rollResult.seed;
        rngSnapshot = rollResult.snapshot;
      }
    }

    if (entries.length === 0) {
      return {
        success: false,
        aggregated: null,
        transactionId: '',
        isDuplicate: false,
        reason: '无奖励条目（配置奖励和池奖励均为空）',
      };
    }

    const aggregated = this._rewardSystem.buildReward('chapter', chapterId, entries);
    this._rewardSystem.grantRewardWithTransaction(
      aggregated,
      transactionId,
      poolId,
      seed,
      rngSnapshot,
      options?.configVersion,
    );

    // 标记已领取
    this._rewardSystem.markClaimed('chapter', chapterId, transactionId);

    return {
      success: true,
      aggregated,
      transactionId,
      isDuplicate: false,
    };
  }

  // ===== 事件奖励结算 =====

  /**
   * 结算事件奖励（幂等）。
   *
   * @param eventId — 事件 ID
   * @param options — 结算选项（includePool 默认 true）
   * @returns 结算结果
   */
  settleEventReward(
    eventId: string,
    options?: SettlementOptions,
  ): RewardSettleResult {
    const includePool = options?.includePool ?? true;

    // 幂等检查
    if (this._rewardSystem.isClaimed('event', eventId)) {
      const existingState = this._rewardSystem.getClaimState('event', eventId);
      console.log(`[RewardSettlement] 事件奖励已领取: ${eventId}, txn=${existingState?.transactionId}`);
      return {
        success: false,
        aggregated: null,
        transactionId: existingState?.transactionId ?? '',
        isDuplicate: true,
        reason: `事件奖励已领取: ${eventId}`,
      };
    }

    const eventReward = this._rewardRepo.getEventReward(eventId);
    if (!eventReward) {
      console.warn(`[RewardSettlement] 事件奖励配置不存在: ${eventId}`);
      return {
        success: false,
        aggregated: null,
        transactionId: '',
        isDuplicate: false,
        reason: `事件奖励配置不存在: ${eventId}`,
      };
    }

    const entries = this._eventRewardToEntries(eventReward);
    const transactionId = generateTransactionId('event', eventId);
    let poolId: string | undefined;
    let seed: string | undefined;
    let rngSnapshot: SeededRandomSnapshot | undefined;

    // 附加奖励池抽取（确定性 RNG）
    if (includePool) {
      poolId = 'REWARD_POOL_EVENT_BONUS';
      const rollCtx = this._buildRollContext('event', eventId, poolId, options);
      const rollResult = this._poolRepo.rollRewardWithSeed(poolId, rollCtx);
      if (rollResult.entries.length > 0) {
        entries.push(...rollResult.entries);
        seed = rollResult.seed;
        rngSnapshot = rollResult.snapshot;
      }
    }

    if (entries.length === 0) {
      return {
        success: false,
        aggregated: null,
        transactionId: '',
        isDuplicate: false,
        reason: '无奖励条目（配置奖励和池奖励均为空）',
      };
    }

    const aggregated = this._rewardSystem.buildReward('event', eventId, entries);
    this._rewardSystem.grantRewardWithTransaction(
      aggregated,
      transactionId,
      poolId,
      seed,
      rngSnapshot,
      options?.configVersion,
    );

    // 标记已领取
    this._rewardSystem.markClaimed('event', eventId, transactionId);

    return {
      success: true,
      aggregated,
      transactionId,
      isDuplicate: false,
    };
  }

  // ===== 动态敌人奖励结算 =====

  /**
   * 结算动态敌人击杀奖励（幂等 — 每个 enemyId 只能领取一次）。
   *
   * @param enemyId — 动态敌人 ID
   * @param options — 结算选项（includePool 默认 true）
   * @returns 结算结果
   */
  settleEnemyReward(
    enemyId: string,
    options?: SettlementOptions,
  ): RewardSettleResult {
    const includePool = options?.includePool ?? true;

    // 幂等检查
    if (this._rewardSystem.isClaimed('enemy', enemyId)) {
      const existingState = this._rewardSystem.getClaimState('enemy', enemyId);
      console.log(`[RewardSettlement] 敌人奖励已领取: ${enemyId}, txn=${existingState?.transactionId}`);
      return {
        success: false,
        aggregated: null,
        transactionId: existingState?.transactionId ?? '',
        isDuplicate: true,
        reason: `敌人奖励已领取: ${enemyId}`,
      };
    }

    const enemyReward = this._rewardRepo.getEnemyReward(enemyId);
    if (!enemyReward) {
      console.warn(`[RewardSettlement] 敌人奖励配置不存在: ${enemyId}`);
      return {
        success: false,
        aggregated: null,
        transactionId: '',
        isDuplicate: false,
        reason: `敌人奖励配置不存在: ${enemyId}`,
      };
    }

    const entries = this._enemyRewardToEntries(enemyReward);
    const transactionId = generateTransactionId('enemy', enemyId);
    let poolId: string | undefined;
    let seed: string | undefined;
    let rngSnapshot: SeededRandomSnapshot | undefined;

    // 附加奖励池抽取（确定性 RNG）
    if (includePool) {
      poolId = 'REWARD_POOL_ENEMY_BONUS';
      const rollCtx = this._buildRollContext('enemy', enemyId, poolId, options);
      const rollResult = this._poolRepo.rollRewardWithSeed(poolId, rollCtx);
      if (rollResult.entries.length > 0) {
        entries.push(...rollResult.entries);
        seed = rollResult.seed;
        rngSnapshot = rollResult.snapshot;
      }
    }

    if (entries.length === 0) {
      return {
        success: false,
        aggregated: null,
        transactionId: '',
        isDuplicate: false,
        reason: '无奖励条目（配置奖励和池奖励均为空）',
      };
    }

    const aggregated = this._rewardSystem.buildReward('enemy', enemyId, entries);
    this._rewardSystem.grantRewardWithTransaction(
      aggregated,
      transactionId,
      poolId,
      seed,
      rngSnapshot,
      options?.configVersion,
    );

    // 标记已领取
    this._rewardSystem.markClaimed('enemy', enemyId, transactionId);

    return {
      success: true,
      aggregated,
      transactionId,
      isDuplicate: false,
    };
  }

  // ===== Phase7 兼容桥接 =====

  /**
   * 从 Phase7 RewardSource 结算单条奖励。
   *
   * Phase7 的 RewardSource.sourceType 为完整字符串（如 "dungeon_boss"），
   * 此方法将其映射为 Step4 的 RewardSourceType 后走标准结算流程。
   *
   * 这确保了 Phase7 的掉落/事件/地牢链路与 Step4 的奖励系统互通，
   * 避免两套奖励链路分叉。
   *
   * @param phase7SourceType — Phase7 来源类型（如 "dungeon_boss", "dungeon_event"）
   * @param sourceId         — 来源标识
   * @param options          — 结算选项（可选）
   * @returns 结算结果
   */
  settleFromPhase7Source(
    phase7SourceType: string,
    sourceId: string,
    options?: SettlementOptions,
  ): RewardSettleResult {
    const step4Type = mapPhase7SourceType(phase7SourceType);

    switch (step4Type) {
      case 'chapter':
        return this.settleChapterReward(sourceId, options);
      case 'event':
        return this.settleEventReward(sourceId, options);
      case 'enemy':
        return this.settleEnemyReward(sourceId, options);
      case 'battle':
        // battle 类奖励通过 settleBattleReward 发放，此处仅支持预览
        console.warn(`[RewardSettlement] Phase7 battle 类型奖励需通过 settleBattleReward 发放: ${sourceId}`);
        return {
          success: false,
          aggregated: null,
          transactionId: '',
          isDuplicate: false,
          reason: 'battle 类型奖励需通过 settleBattleReward 发放',
        };
      case 'pool':
        // pool 类直接抽取
        return this._settlePoolDirect(phase7SourceType, sourceId, options);
      default:
        return {
          success: false,
          aggregated: null,
          transactionId: '',
          isDuplicate: false,
          reason: `未识别的 Phase7 sourceType: ${phase7SourceType}`,
        };
    }
  }

  /**
   * 结算预览（不发放，仅计算）。
   *
   * 与 settle* 方法的区别：
   * - 不修改存档
   * - 不标记领取状态
   * - 不发射事件
   * - 返回构建好的 AggregatedReward（可用于 UI 预览）
   *
   * @param sourceType — 奖励来源类型
   * @param sourceId   — 来源标识
   * @returns 聚合奖励预览，无配置时返回 null
   */
  previewReward(
    sourceType: RewardSourceType,
    sourceId: string,
  ): AggregatedReward | null {
    switch (sourceType) {
      case 'chapter': {
        const cfg = this._rewardRepo.getChapterReward(sourceId);
        if (!cfg) return null;
        const entries = this._chapterRewardToEntries(cfg);
        return entries.length > 0
          ? this._rewardSystem.buildReward('chapter', sourceId, entries)
          : null;
      }
      case 'event': {
        const cfg = this._rewardRepo.getEventReward(sourceId);
        if (!cfg) return null;
        const entries = this._eventRewardToEntries(cfg);
        return entries.length > 0
          ? this._rewardSystem.buildReward('event', sourceId, entries)
          : null;
      }
      case 'enemy': {
        const cfg = this._rewardRepo.getEnemyReward(sourceId);
        if (!cfg) return null;
        const entries = this._enemyRewardToEntries(cfg);
        return entries.length > 0
          ? this._rewardSystem.buildReward('enemy', sourceId, entries)
          : null;
      }
      default:
        return null;
    }
  }

  // ================================================================
  // 内部 — 配置条目 → RewardEntry
  // ================================================================

  private _chapterRewardToEntries(chapter: ChapterRewardEntry): RewardEntry[] {
    const entries: RewardEntry[] = [];

    if (chapter.gold > 0) {
      entries.push({
        itemId: 'ITEM_GOLD',
        itemType: 'gold',
        count: chapter.gold,
        source: 'chapter',
        sourceId: chapter.chapterId,
      });
    }

    if (chapter.exp > 0) {
      entries.push({
        itemId: 'ITEM_EXP',
        itemType: 'exp',
        count: chapter.exp,
        source: 'chapter',
        sourceId: chapter.chapterId,
      });
    }

    for (const item of chapter.itemRewards) {
      entries.push({
        itemId: item.itemId,
        itemType: 'material',
        count: item.count,
        source: 'chapter',
        sourceId: chapter.chapterId,
      });
    }

    return entries;
  }

  private _eventRewardToEntries(event: EventRewardEntry): RewardEntry[] {
    const entries: RewardEntry[] = [];

    if (event.gold > 0) {
      entries.push({
        itemId: 'ITEM_GOLD',
        itemType: 'gold',
        count: event.gold,
        source: 'event',
        sourceId: event.eventId,
      });
    }

    if (event.exp > 0) {
      entries.push({
        itemId: 'ITEM_EXP',
        itemType: 'exp',
        count: event.exp,
        source: 'event',
        sourceId: event.eventId,
      });
    }

    for (const item of event.itemRewards) {
      entries.push({
        itemId: item.itemId,
        itemType: 'material',
        count: item.count,
        source: 'event',
        sourceId: event.eventId,
      });
    }

    return entries;
  }

  private _enemyRewardToEntries(enemy: EnemyRewardEntry): RewardEntry[] {
    const entries: RewardEntry[] = [];

    if (enemy.gold > 0) {
      entries.push({
        itemId: 'ITEM_GOLD',
        itemType: 'gold',
        count: enemy.gold,
        source: 'enemy',
        sourceId: enemy.enemyId,
      });
    }

    if (enemy.exp > 0) {
      entries.push({
        itemId: 'ITEM_EXP',
        itemType: 'exp',
        count: enemy.exp,
        source: 'enemy',
        sourceId: enemy.enemyId,
      });
    }

    return entries;
  }

  // ================================================================
  // 内部 — 工具方法
  // ================================================================

  /**
   * 构建 RollContext。
   */
  private _buildRollContext(
    sourceType: string,
    sourceId: string,
    poolId: string,
    options?: SettlementOptions,
  ): RollContext {
    return {
      playerId: options?.playerId,
      sourceType,
      sourceId,
      attemptIndex: options?.attemptIndex,
      configVersion: options?.configVersion,
    };
  }

  /**
   * pool 类型直接抽取（不标记 claim state，pool 是可重复抽取的）。
   */
  private _settlePoolDirect(
    phase7SourceType: string,
    poolId: string,
    options?: SettlementOptions,
  ): RewardSettleResult {
    const transactionId = generateTransactionId('pool', poolId);
    const rollCtx = this._buildRollContext('pool', poolId, poolId, options);
    const rollResult = this._poolRepo.rollRewardWithSeed(poolId, rollCtx);

    if (rollResult.entries.length === 0) {
      return {
        success: false,
        aggregated: null,
        transactionId: '',
        isDuplicate: false,
        reason: '奖励池抽取无产出',
      };
    }

    const aggregated = this._rewardSystem.buildReward('pool', poolId, rollResult.entries);
    this._rewardSystem.grantRewardWithTransaction(
      aggregated,
      transactionId,
      poolId,
      rollResult.seed,
      rollResult.snapshot,
      options?.configVersion,
    );

    return {
      success: true,
      aggregated,
      transactionId,
      isDuplicate: false,
    };
  }
}
