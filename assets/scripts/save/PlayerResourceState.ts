// ============================================================
// PlayerResourceState — 玩家资源存档预留字段
// 职责：定义仙力/挑战次数等未来资源系统的持久化字段
// 状态：C1.6-B2-D-P1-R3 非激活预留（未启用实际消费/恢复）
// R3-R1: 新增归一化函数，处理V8同版本存档缺失/非法字段
// ============================================================

/**
 * 玩家资源状态（C1.6-B2-D-P1-R3 非激活预留）。
 *
 * 非激活语义：
 * - spiritualPowerMax=0 表示仙力系统当前未启用
 * - 不进行自动恢复
 * - 不显示 UI
 * - 不阻断现有玩法
 *
 * 默认值：所有字段为 0
 */
export interface PlayerResourceState {
  /** 当前仙力 */
  spiritualPower: number;
  /** 仙力上限（0 = 系统未启用） */
  spiritualPowerMax: number;
  /** 上次仙力恢复时间戳（Unix ms，0 = 未初始化） */
  spiritualPowerLastRecoverTime: number;
  /** 世界 Boss 挑战次数 */
  challengeTickets: number;
}

// ---- 工厂函数 ----

/** 创建默认玩家资源状态（全 0，非激活） */
export function createDefaultPlayerResourceState(): PlayerResourceState {
  return {
    spiritualPower: 0,
    spiritualPowerMax: 0,
    spiritualPowerLastRecoverTime: 0,
    challengeTickets: 0,
  };
}

// ---- 归一化函数（R3-R1 新增） ----

/**
 * 将单个数值字段安全归一化为非负整数。
 *
 * 规则：
 * - 缺失/undefined/null → 返回 0
 * - 非 number 类型 → 返回 0
 * - NaN / Infinity / -Infinity → 返回 0
 * - 小于 0 → 返回 0
 * - 非整数 → floor 后返回
 * - 合法非负值 → 原样返回
 */
function safeNonNegativeInt(raw: unknown): number {
  if (raw === undefined || raw === null) return 0;
  if (typeof raw !== 'number') return 0;
  if (!Number.isFinite(raw)) return 0;
  if (raw < 0) return 0;
  if (!Number.isInteger(raw)) return Math.floor(raw);
  return raw;
}

/**
 * 归一化玩家资源状态（纯函数，无副作用）。
 *
 * 从任意来源（存档/反序列化/未知JSON）读取的原始数据中
 * 提取合法 PlayerResourceState，确保四个字段始终存在且合法。
 *
 * 归一化规则：
 * - 缺失字段 → 补 0
 * - 非 number → 补 0
 * - NaN/Infinity → 补 0
 * - 负数 → 归零
 * - 非整数 → floor
 * - 合法非负值 → 保留原值
 * - 不读取或复制旧 currentStamina/maxStamina
 * - 不修改 raw 对象本身
 *
 * @param raw  原始数据（可能为 undefined、null、任意对象）
 * @returns    归一化后的 PlayerResourceState
 */
export function normalizePlayerResourceState(raw: unknown): PlayerResourceState {
  if (!raw || typeof raw !== 'object') {
    return createDefaultPlayerResourceState();
  }

  const obj = raw as Record<string, unknown>;

  return {
    spiritualPower: safeNonNegativeInt(obj.spiritualPower),
    spiritualPowerMax: safeNonNegativeInt(obj.spiritualPowerMax),
    spiritualPowerLastRecoverTime: safeNonNegativeInt(obj.spiritualPowerLastRecoverTime),
    challengeTickets: safeNonNegativeInt(obj.challengeTickets),
  };
}

/**
 * 确保 SaveContainerV8 的 playerResources 字段经过归一化。
 *
 * 用于 SaveManager 加载链路中的同版本兼容归一化。
 *
 * @param container  V8 存档容器（原地修改）
 * @returns         { state: 归一化后的状态, changed: 是否发生了修复 }
 */
export function ensurePlayerResourceState(
  container: { playerResources?: PlayerResourceState | null },
): { state: PlayerResourceState; changed: boolean } {
  const raw = container.playerResources;
  const normalized = normalizePlayerResourceState(raw);

  // 判断是否发生了变化（需要落盘）
  const rawObj = raw as unknown as Record<string, unknown> | null | undefined;
  const changed = !raw
    || typeof raw !== 'object'
    || normalized.spiritualPower !== rawObj?.spiritualPower
    || normalized.spiritualPowerMax !== rawObj?.spiritualPowerMax
    || normalized.spiritualPowerLastRecoverTime !== rawObj?.spiritualPowerLastRecoverTime
    || normalized.challengeTickets !== rawObj?.challengeTickets;

  if (changed) {
    container.playerResources = normalized;
  }

  return { state: normalized, changed };
}
