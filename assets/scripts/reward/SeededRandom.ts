// ============================================================
// SeededRandom.ts — 确定性伪随机数生成器
// 职责：提供可复现的随机数序列，支持奖励池抽取复盘/审计
// 位置：reward/ 层
// 算法：mulberry32（32-bit 高质量 PRNG）
// 规范：零 any / 纯函数 / 可序列化
// ============================================================

/**
 * 确定性伪随机数生成器。
 *
 * 基于 mulberry32 算法：
 * - 状态空间 2^32
 * - 周期 ~2^32
 * - 通过 PractRand / BigCrush 测试
 *
 * 使用模式：
 *   const rng = new SeededRandom(12345);       // 从种子创建
 *   const rng2 = SeededRandom.fromSeed('reward_pool_001|chapter_003|attempt_1');
 *   const value = rng.next();                   // [0, 1) 浮点数
 *   const int = rng.nextInt(0, 99);             // [0, 99] 整数
 */
export class SeededRandom {
  // ==================== 内部状态 ====================

  private _state: number;
  private readonly _initialSeed: number;
  private _callCount: number = 0;

  // ==================== 构造 ====================

  /**
   * @param seed — 32-bit 整数种子（负数会转为无符号）
   */
  constructor(seed: number) {
    this._initialSeed = seed >>> 0; // 转为无符号 32-bit
    this._state = this._initialSeed;
  }

  // ==================== 静态工厂 ====================

  /**
   * 从字符串种子创建 RNG。
   *
   * 使用简单 hash（djb2 变种）将任意字符串映射为 32-bit 整数。
   *
   * @param seedStr — 种子字符串（如 "poolId|sourceId|attemptIndex"）
   * @returns SeededRandom 实例
   */
  static fromSeed(seedStr: string): SeededRandom {
    let hash = 5381;
    for (let i = 0; i < seedStr.length; i++) {
      hash = ((hash << 5) + hash + seedStr.charCodeAt(i)) | 0;
    }
    return new SeededRandom(hash);
  }

  /**
   * 从多个字符串片段组合创建种子 RNG。
   *
   * 将多个部分按 '|' 拼接后 hash 为种子。
   *
   * @param parts — 种子片段数组
   * @returns SeededRandom 实例
   */
  static fromParts(parts: string[]): SeededRandom {
    return SeededRandom.fromSeed(parts.join('|'));
  }

  // ==================== 公共接口 ====================

  /**
   * 生成 [0, 1) 范围内的随机浮点数。
   *
   * @returns [0, 1) 浮点数
   */
  next(): number {
    this._callCount++;
    // mulberry32
    this._state |= 0;
    this._state = (this._state + 0x6d2b79f5) | 0;
    let t = Math.imul(this._state ^ (this._state >>> 15), 1 | this._state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * 生成 [min, max] 范围内的随机整数（两端包含）。
   *
   * @param min — 最小值
   * @param max — 最大值
   * @returns [min, max] 整数
   */
  nextInt(min: number, max: number): number {
    if (min > max) {
      [min, max] = [max, min];
    }
    const range = max - min + 1;
    return Math.floor(this.next() * range) + min;
  }

  /** 获取初始种子值 */
  getInitialSeed(): number {
    return this._initialSeed;
  }

  /** 获取当前已调用次数 */
  getCallCount(): number {
    return this._callCount;
  }

  /** 获取当前内部状态（用于序列化/复盘） */
  getState(): number {
    return this._state;
  }

  /**
   * 导出 RNG 快照（用于存档/审计）。
   *
   * @returns 可序列化的快照对象
   */
  exportSnapshot(): SeededRandomSnapshot {
    return {
      initialSeed: this._initialSeed,
      state: this._state,
      callCount: this._callCount,
    };
  }

  /**
   * 从快照恢复 RNG 状态。
   *
   * @param snapshot — 之前导出的快照
   * @returns 新的 SeededRandom 实例（状态已恢复）
   */
  static fromSnapshot(snapshot: SeededRandomSnapshot): SeededRandom {
    const rng = new SeededRandom(snapshot.initialSeed);
    rng._state = snapshot.state;
    rng._callCount = snapshot.callCount;
    return rng;
  }

  /** 重置到初始种子状态 */
  reset(): void {
    this._state = this._initialSeed;
    this._callCount = 0;
  }
}

// ==================== 快照类型 ====================

/**
 * RNG 快照数据，用于存档持久化和审计复盘。
 */
export interface SeededRandomSnapshot {
  /** 初始种子 */
  initialSeed: number;
  /** 当前状态 */
  state: number;
  /** 已调用次数 */
  callCount: number;
}

// ==================== 种子构建工具 ====================

/**
 * 构建奖励池种子字符串。
 *
 * 组合多个维度信息生成确定性种子，确保同一 player + source + pool 下结果可复现。
 *
 * @param params — 种子参数
 * @returns 种子字符串
 */
export function buildRewardSeed(params: {
  playerId?: string;
  sourceType: string;
  sourceId: string;
  poolId: string;
  attemptIndex?: number;
  configVersion?: string;
}): string {
  const parts: string[] = [
    params.playerId ?? 'default',
    params.sourceType,
    params.sourceId,
    params.poolId,
    String(params.attemptIndex ?? 0),
    params.configVersion ?? 'v1',
  ];
  return parts.join('|');
}
