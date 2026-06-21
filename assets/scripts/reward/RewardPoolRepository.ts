// ============================================================
// RewardPoolRepository.ts — 奖励池仓库
// 职责：加载/缓存/权重抽取 reward_pool_config
// 位置：reward/ 层
// 依赖：ConfigManager, RewardTypes, SeededRandom
// 规范：零 any / 支持确定性种子 / 配置合法性校验
// ============================================================

import { BaseManager } from '../core/BaseManager';
import { ConfigManager } from '../core/ConfigManager';
import { SeededRandom, buildRewardSeed } from './SeededRandom';
import type { SeededRandomSnapshot } from './SeededRandom';
import type {
  RewardPoolConfig,
  RewardPoolItem,
  RewardPoolEntry,
  RewardPoolMode,
  RewardEntry,
  PoolValidationResult,
} from './RewardTypes';

// ==================== 配置路径常量 ====================

const REWARD_POOL_PATH = 'config/reward/reward_pool_config';

// ==================== 校验常量 ====================

/** 奖励池条目权重上限（防止极端值） */
const MAX_ENTRY_WEIGHT = 1000000;

/** 奖励池条目数量上限 */
const MAX_ENTRIES_PER_POOL = 1000;

/** 单池最大抽取次数（weighted_many 防无限） */
const MAX_DRAW_COUNT = 100;

// ==================== 抽取上下文 ====================

/**
 * 奖励池抽取上下文。
 *
 * 承载本次抽取的所有元数据，用于生成确定性种子和快照。
 */
export interface RollContext {
  /** 玩家 ID */
  playerId?: string;
  /** 来源类型 */
  sourceType: string;
  /** 来源标识 */
  sourceId: string;
  /** 尝试索引（同一来源多次抽取时递增） */
  attemptIndex?: number;
  /** 配置版本号 */
  configVersion?: string;
}

// ==================== RewardPoolRepository ====================

export class RewardPoolRepository extends BaseManager {
  // ===== 单例 =====

  static getInstance(): RewardPoolRepository {
    return super.getInstance<RewardPoolRepository>();
  }

  // ===== 依赖 =====

  private _configManager: ConfigManager;

  // ===== 内部状态 =====

  private _pools: Map<string, RewardPoolItem> = new Map();
  /** totalWeight 缓存：poolId → totalWeight */
  private _totalWeightCache: Map<string, number> = new Map();
  private _loaded: boolean = false;

  // ===== 构造 =====

  constructor() {
    super();
    this._configManager = ConfigManager.getInstance();
  }

  // ================================================================
  // 公共接口
  // ================================================================

  // ===== 加载 =====

  /**
   * 加载奖励池配置（幂等 — 已加载时直接返回）
   *
   * @returns Promise<void>
   */
  async load(): Promise<void> {
    if (this._loaded) return;

    try {
      await this._configManager.loadConfig(REWARD_POOL_PATH);
      this._buildCache();
      this._loaded = true;
      console.log(`[RewardPoolRepository] 加载完成: ${this._pools.size} 个奖励池`);
    } catch (err) {
      console.error('[RewardPoolRepository] load() 失败:', err);
      throw err;
    }
  }

  /** 是否已加载 */
  isLoaded(): boolean {
    return this._loaded;
  }

  // ==================== 配置校验 ====================

  /**
   * 校验所有已加载奖励池配置的合法性。
   *
   * 校验项：
   * - 空池（entries 为空）
   * - 全零权重
   * - 负权重
   * - 非法 count
   * - 非法 itemId
   * - 权重超出上限
   * - 条目数超出上限
   *
   * @returns 校验结果列表
   */
  validateAllConfigs(): PoolValidationResult[] {
    const results: PoolValidationResult[] = [];
    for (const [poolId, pool] of this._pools) {
      results.push(this.validatePoolConfig(poolId, pool));
    }
    return results;
  }

  /**
   * 校验单个奖励池配置。
   *
   * @param poolId — 池 ID
   * @param pool   — 池配置（可选，不传时从缓存查找）
   * @returns 校验结果
   */
  validatePoolConfig(poolId: string, pool?: RewardPoolItem): PoolValidationResult {
    const target = pool ?? this._pools.get(poolId);
    const issues: string[] = [];

    if (!target) {
      return { valid: false, poolId, issues: [`奖励池不存在: ${poolId}`] };
    }

    // 空池检查
    if (!target.entries || target.entries.length === 0) {
      issues.push('entries 为空');
    }

    // 条目数上限
    if (target.entries && target.entries.length > MAX_ENTRIES_PER_POOL) {
      issues.push(`entries 数量 ${target.entries.length} 超过上限 ${MAX_ENTRIES_PER_POOL}`);
    }

    // 逐条目校验
    if (target.entries) {
      let totalWeight = 0;
      for (let i = 0; i < target.entries.length; i++) {
        const entry = target.entries[i];

        // 权重校验
        if (typeof entry.weight !== 'number' || !Number.isFinite(entry.weight)) {
          issues.push(`entry[${i}] weight 类型错误或非有限值: ${entry.weight}`);
        } else if (entry.weight < 0) {
          issues.push(`entry[${i}] weight 为负数: ${entry.weight}`);
        } else if (entry.weight > MAX_ENTRY_WEIGHT) {
          issues.push(`entry[${i}] weight 超出上限: ${entry.weight} > ${MAX_ENTRY_WEIGHT}`);
        } else {
          totalWeight += entry.weight;
        }

        // count 校验
        if (typeof entry.count !== 'number' || !Number.isFinite(entry.count)) {
          issues.push(`entry[${i}] count 类型错误或非有限值: ${entry.count}`);
        } else if (entry.count <= 0) {
          issues.push(`entry[${i}] count 为非正数: ${entry.count}`);
        }

        // itemId 校验
        if (!entry.itemId || typeof entry.itemId !== 'string') {
          issues.push(`entry[${i}] itemId 为空或无效`);
        }

        // itemType 校验
        if (!entry.itemType || typeof entry.itemType !== 'string') {
          issues.push(`entry[${i}] itemType 为空或无效`);
        }
      }

      // weight 相关模式的额外检查
      if ((target.mode === 'weighted_one' || target.mode === 'weighted_many') && totalWeight <= 0) {
        issues.push(`weight 模式为 ${target.mode} 但 totalWeight = ${totalWeight}（≤0 会导致无产出或除零）`);
      }
    }

    return {
      valid: issues.length === 0,
      poolId,
      issues,
    };
  }

  // ===== 查询 =====

  /**
   * 根据池 ID 获取奖励池配置
   *
   * @param poolId — 池 ID
   * @returns 奖励池配置，未找到时返回 null
   */
  getPool(poolId: string): RewardPoolItem | null {
    return this._pools.get(poolId) ?? null;
  }

  /** 获取所有池 */
  getAllPools(): RewardPoolItem[] {
    return Array.from(this._pools.values());
  }

  /** 池数量 */
  getPoolCount(): number {
    return this._pools.size;
  }

  /** 获取指定池的缓存总权重 */
  getPoolTotalWeight(poolId: string): number {
    return this._totalWeightCache.get(poolId) ?? 0;
  }

  // ===== 抽取（无种子 — 向后兼容） =====

  /**
   * 按权重从池中抽取奖励（使用 Math.random()，向后兼容）。
   *
   * @deprecated 推荐使用 rollRewardWithSeed() 以支持确定性复盘。
   *
   * @param poolId   — 奖励池 ID
   * @param sourceId — 来源标识
   * @returns 奖励条目列表，池不存在时返回空数组
   */
  rollReward(poolId: string, sourceId: string): RewardEntry[] {
    const pool = this._pools.get(poolId);
    if (!pool) {
      console.warn(`[RewardPoolRepository] 奖励池不存在: ${poolId}`);
      return [];
    }

    return this._rollByMode(pool.mode, pool.entries, sourceId, null);
  }

  /**
   * 按权重从池中抽取奖励（使用确定性 RNG）。
   *
   * @param poolId  — 奖励池 ID
   * @param context — 抽取上下文（playerId, sourceType, sourceId, configVersion 等）
   * @returns 奖励条目列表和 RNG 快照
   */
  rollRewardWithSeed(
    poolId: string,
    context: RollContext,
  ): { entries: RewardEntry[]; seed: string; snapshot: SeededRandomSnapshot } {
    const pool = this._pools.get(poolId);
    if (!pool) {
      console.warn(`[RewardPoolRepository] 奖励池不存在: ${poolId}`);
      return { entries: [], seed: '', snapshot: { initialSeed: 0, state: 0, callCount: 0 } };
    }

    const seed = buildRewardSeed({
      playerId: context.playerId,
      sourceType: context.sourceType,
      sourceId: context.sourceId,
      poolId,
      attemptIndex: context.attemptIndex,
      configVersion: context.configVersion,
    });

    const rng = SeededRandom.fromSeed(seed);
    const entries = this._rollByModeWithRng(pool.mode, pool.entries, context.sourceId, rng);

    return {
      entries,
      seed,
      snapshot: rng.exportSnapshot(),
    };
  }

  /**
   * 从指定池中按权重抽取单个奖励条目
   *
   * @param poolId   — 奖励池 ID
   * @param sourceId — 来源标识
   * @returns 单条奖励，无可用时返回 null
   */
  rollOneReward(poolId: string, sourceId: string): RewardEntry | null {
    const pool = this._pools.get(poolId);
    if (!pool || pool.entries.length === 0) return null;

    return this._weightedPick(pool.entries, sourceId, null);
  }

  /**
   * 从指定池中按权重抽取单个奖励条目（确定性版本）。
   *
   * @param poolId  — 奖励池 ID
   * @param context — 抽取上下文
   * @returns 单条奖励及种子信息
   */
  rollOneRewardWithSeed(
    poolId: string,
    context: RollContext,
  ): { entry: RewardEntry | null; seed: string; snapshot: SeededRandomSnapshot } {
    const pool = this._pools.get(poolId);
    if (!pool || pool.entries.length === 0) {
      return { entry: null, seed: '', snapshot: { initialSeed: 0, state: 0, callCount: 0 } };
    }

    const seed = buildRewardSeed({
      playerId: context.playerId,
      sourceType: context.sourceType,
      sourceId: context.sourceId,
      poolId,
      attemptIndex: context.attemptIndex,
      configVersion: context.configVersion,
    });

    const rng = SeededRandom.fromSeed(seed);
    const entry = this._weightedPickWithRng(pool.entries, context.sourceId, rng);

    return {
      entry,
      seed,
      snapshot: rng.exportSnapshot(),
    };
  }

  // ================================================================
  // 内部 — 缓存构建
  // ================================================================

  private _buildCache(): void {
    const cfg = this._configManager.getConfig<RewardPoolConfig>(REWARD_POOL_PATH);
    if (cfg?.pools) {
      for (const pool of cfg.pools) {
        this._pools.set(pool.id, pool);
        // 预计算 totalWeight 缓存
        if (pool.entries && pool.entries.length > 0) {
          const totalWeight = pool.entries.reduce((sum, e) => sum + (e.weight > 0 ? e.weight : 0), 0);
          this._totalWeightCache.set(pool.id, totalWeight);
        }
      }
    }

    // 配置加载后自动校验
    const validationResults = this.validateAllConfigs();
    const failedPools = validationResults.filter((r) => !r.valid);
    if (failedPools.length > 0) {
      console.warn(
        `[RewardPoolRepository] 配置校验: ${failedPools.length} 个池存在 ${failedPools.reduce((s, r) => s + r.issues.length, 0)} 个问题`,
      );
      for (const result of failedPools) {
        console.warn(`  [${result.poolId}] ${result.issues.join('; ')}`);
      }
    }
  }

  // ================================================================
  // 内部 — 抽取逻辑（Math.random 路径，向后兼容）
  // ================================================================

  private _rollByMode(
    mode: RewardPoolMode,
    entries: RewardPoolEntry[],
    sourceId: string,
    _rng: SeededRandom | null,
  ): RewardEntry[] {
    switch (mode) {
      case 'all':
        return entries.map((e) => this._toRewardEntry(e, sourceId));

      case 'weighted_one': {
        const picked = this._weightedPick(entries, sourceId, null);
        return picked ? [picked] : [];
      }

      case 'weighted_many': {
        const totalWeight = this._getTotalWeightForEntries(entries);
        if (totalWeight <= 0) {
          console.warn(`[RewardPoolRepository] weighted_many: totalWeight=0，无产出`);
          return [];
        }
        const results: RewardEntry[] = [];
        for (const entry of entries) {
          if (entry.weight > 0 && Math.random() < entry.weight / totalWeight) {
            results.push(this._toRewardEntry(entry, sourceId));
          }
        }
        return results;
      }

      default:
        return [];
    }
  }

  // ================================================================
  // 内部 — 抽取逻辑（Deterministic RNG 路径）
  // ================================================================

  private _rollByModeWithRng(
    mode: RewardPoolMode,
    entries: RewardPoolEntry[],
    sourceId: string,
    rng: SeededRandom,
  ): RewardEntry[] {
    switch (mode) {
      case 'all':
        return entries.map((e) => this._toRewardEntry(e, sourceId));

      case 'weighted_one': {
        const picked = this._weightedPickWithRng(entries, sourceId, rng);
        return picked ? [picked] : [];
      }

      case 'weighted_many': {
        const totalWeight = this._getTotalWeightForEntries(entries);
        if (totalWeight <= 0) {
          console.warn(`[RewardPoolRepository] weighted_many(seed): totalWeight=0，无产出`);
          return [];
        }
        const results: RewardEntry[] = [];
        for (const entry of entries) {
          if (entry.weight > 0 && rng.next() < entry.weight / totalWeight) {
            results.push(this._toRewardEntry(entry, sourceId));
          }
        }
        return results;
      }

      default:
        return [];
    }
  }

  /** 权重抽取单个条目（Math.random 版本） */
  private _weightedPick(
    entries: RewardPoolEntry[],
    sourceId: string,
    _rng: SeededRandom | null,
  ): RewardEntry | null {
    if (entries.length === 0) return null;

    const totalWeight = entries.reduce((sum, e) => sum + (e.weight > 0 ? e.weight : 0), 0);
    if (totalWeight <= 0) return null;

    let roll = Math.random() * totalWeight;
    for (const entry of entries) {
      if (entry.weight <= 0) continue;
      roll -= entry.weight;
      if (roll <= 0) {
        return this._toRewardEntry(entry, sourceId);
      }
    }

    // 浮点兜底：返回最后一个有效权重的条目
    for (let i = entries.length - 1; i >= 0; i--) {
      if (entries[i].weight > 0) {
        return this._toRewardEntry(entries[i], sourceId);
      }
    }
    return null;
  }

  /** 权重抽取单个条目（Deterministic RNG 版本） */
  private _weightedPickWithRng(
    entries: RewardPoolEntry[],
    sourceId: string,
    rng: SeededRandom,
  ): RewardEntry | null {
    if (entries.length === 0) return null;

    const totalWeight = entries.reduce((sum, e) => sum + (e.weight > 0 ? e.weight : 0), 0);
    if (totalWeight <= 0) return null;

    let roll = rng.next() * totalWeight;
    for (const entry of entries) {
      if (entry.weight <= 0) continue;
      roll -= entry.weight;
      if (roll <= 0) {
        return this._toRewardEntry(entry, sourceId);
      }
    }

    // 浮点兜底：返回最后一个有效权重的条目
    for (let i = entries.length - 1; i >= 0; i--) {
      if (entries[i].weight > 0) {
        return this._toRewardEntry(entries[i], sourceId);
      }
    }
    return null;
  }

  /** 获取条目的总权重（优先从缓存读取） */
  private _getTotalWeightForEntries(entries: RewardPoolEntry[]): number {
    // entries 可能来自缓存池，直接计算（单次 reduce 成本可控）
    return entries.reduce((sum, e) => sum + (e.weight > 0 ? e.weight : 0), 0);
  }

  /** 将配置条目转为运行时 RewardEntry */
  private _toRewardEntry(entry: RewardPoolEntry, sourceId: string): RewardEntry {
    return {
      itemId: entry.itemId,
      itemType: entry.itemType as RewardEntry['itemType'],
      count: entry.count,
      source: 'pool',
      sourceId,
    };
  }
}
