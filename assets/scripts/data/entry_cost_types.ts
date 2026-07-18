// ============================================================
// entry_cost_types.ts — 副本/活动入口消耗通用类型定义
// 职责：定义入口消耗类型、校验、归一化
// 状态：C1.6-B2-D-P1-R3 非激活预留（未接入实际消费）
// ============================================================

// ---- 入口消耗类型枚举 ----

/** 入口消耗类型 */
export type EntryCostType =
  | 'none'
  | 'spiritual_power'
  | 'challenge_ticket'
  | 'item';

// ---- 入口消耗配置 ----

/** 通用入口消耗配置 */
export interface EntryCostConfig {
  /** 消耗类型 */
  costType: EntryCostType;
  /** 消耗数量 */
  costAmount: number;
  /** 资源 ID（challenge_ticket / item 时必填） */
  resourceId?: string;
}

// ---- 默认值 ----

/** 默认入口消耗（免费） */
export const DEFAULT_ENTRY_COST: EntryCostConfig = {
  costType: 'none',
  costAmount: 0,
};

// ---- 归一化 ----

/**
 * 归一化入口消耗配置。
 *
 * 规则：
 * - config 为 undefined/null → 返回默认免费入口
 * - config 缺少字段 → 补默认值
 * - 字段类型不合法 → 安全回退为默认值
 *
 * @param config  原始入口消耗配置（可能缺失）
 * @returns       归一化后的入口消耗配置
 */
export function normalizeEntryCost(config?: Partial<EntryCostConfig> | null): EntryCostConfig {
  if (!config) {
    return { ...DEFAULT_ENTRY_COST };
  }

  const costType = config.costType;
  if (!isValidCostType(costType)) {
    return { ...DEFAULT_ENTRY_COST };
  }

  const costAmount = typeof config.costAmount === 'number'
    && Number.isFinite(config.costAmount)
    && Number.isInteger(config.costAmount)
    ? config.costAmount
    : 0;

  const result: EntryCostConfig = {
    costType,
    costAmount,
  };

  if (config.resourceId !== undefined && typeof config.resourceId === 'string') {
    result.resourceId = config.resourceId;
  }

  return result;
}

// ---- 类型校验 ----

/** 校验是否为合法的 EntryCostType */
function isValidCostType(value: unknown): value is EntryCostType {
  return value === 'none'
    || value === 'spiritual_power'
    || value === 'challenge_ticket'
    || value === 'item';
}

/**
 * 校验 resourceId 格式安全。
 *
 * 只允许：小写英文字母、数字、下划线。
 * 禁止：空字符串、纯空格、路径分隔符、点号、中文、特殊符号、换行。
 *
 * @param id  待校验的 resourceId
 * @returns   是否格式安全
 */
export function isValidResourceId(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  if (id.trim() !== id) return false;
  if (id.length === 0) return false;
  // 只允许 [a-z][0-9][_]
  return /^[a-z0-9_]+$/.test(id);
}

/**
 * 校验 resourceId 并返回具体错误信息。
 *
 * @returns 错误描述字符串，合法时返回空字符串
 */
export function validateResourceId(id: string): string {
  if (!id || typeof id !== 'string') {
    return 'resourceId 必须为非空字符串';
  }
  if (id.trim() !== id) {
    return `resourceId 包含首尾空格: "${id}"`;
  }
  if (id.length === 0) {
    return 'resourceId 不能为空字符串';
  }
  if (!/^[a-z0-9_]+$/.test(id)) {
    return `resourceId 格式不安全: "${id}"（只允许小写字母、数字、下划线）`;
  }
  return '';
}

// ---- 校验结果 ----

/** 入口消耗校验结果 */
export interface EntryCostValidationResult {
  /** 是否通过 */
  valid: boolean;
  /** 错误信息列表 */
  errors: string[];
}

/**
 * 校验入口消耗配置的合法性。
 *
 * 规则：
 * - costType=none 时 costAmount 必须为 0
 * - costType!=none 时 costAmount 必须 > 0 且为整数
 * - spiritual_power 的 resourceId 只能为空或 'spiritual_power'
 * - challenge_ticket 必须提供 resourceId
 * - item 必须提供 resourceId
 * - resourceId 不能为空字符串
 *
 * @param config  入口消耗配置
 * @returns       校验结果
 */
export function validateEntryCostConfig(config: EntryCostConfig): EntryCostValidationResult {
  const errors: string[] = [];

  // 校验 costType
  if (!isValidCostType(config.costType)) {
    errors.push(`未知的 costType: "${config.costType}"，合法值为 none | spiritual_power | challenge_ticket | item`);
    return { valid: false, errors };
  }

  // 校验 costAmount 为整数
  if (typeof config.costAmount !== 'number' || !Number.isFinite(config.costAmount) || !Number.isInteger(config.costAmount)) {
    errors.push(`costAmount 必须为整数，当前值: ${config.costAmount}`);
  }

  // 校验 costAmount 不为负数
  if (config.costAmount < 0) {
    errors.push(`costAmount 不能为负数，当前值: ${config.costAmount}`);
  }

  // costType-specific 规则
  switch (config.costType) {
    case 'none': {
      if (config.costAmount !== 0) {
        errors.push(`costType=none 时 costAmount 必须为 0，当前值: ${config.costAmount}`);
      }
      break;
    }
    case 'spiritual_power': {
      if (config.costAmount <= 0) {
        errors.push(`costType=spiritual_power 时 costAmount 必须大于 0，当前值: ${config.costAmount}`);
      }
      if (config.resourceId !== undefined && config.resourceId !== 'spiritual_power') {
        errors.push(`costType=spiritual_power 时 resourceId 只能为空或 'spiritual_power'，当前值: "${config.resourceId}"`);
      }
      break;
    }
    case 'challenge_ticket': {
      if (config.costAmount <= 0) {
        errors.push(`costType=challenge_ticket 时 costAmount 必须大于 0，当前值: ${config.costAmount}`);
      }
      if (!config.resourceId || config.resourceId.trim() === '') {
        errors.push('costType=challenge_ticket 时必须提供 resourceId');
      }
      break;
    }
    case 'item': {
      if (config.costAmount <= 0) {
        errors.push(`costType=item 时 costAmount 必须大于 0，当前值: ${config.costAmount}`);
      }
      if (!config.resourceId || config.resourceId.trim() === '') {
        errors.push('costType=item 时必须提供 resourceId');
      }
      break;
    }
  }

  // 校验 resourceId 格式安全（C1.6-B2-D-P1-R3-R1：收紧为只允许 [a-z0-9_]）
  if (config.resourceId !== undefined && config.resourceId !== null) {
    if (typeof config.resourceId !== 'string') {
      errors.push(`resourceId 必须为字符串，当前类型: ${typeof config.resourceId}`);
    } else {
      const ridError = validateResourceId(config.resourceId);
      if (ridError) {
        errors.push(ridError);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ---- 未来消费接口边界（只定义类型，不接入真实执行） ----

/** 入口消耗检查结果 */
export interface EntryCostCheckResult {
  /** 是否可以消耗 */
  canConsume: boolean;
  /** 阻断原因（不可消耗时） */
  blockReason?: string;
}

/**
 * 入口消耗消费者接口（预留，未接入真实执行）。
 *
 * C1.6-B2-D-P1-R3 状态：仅类型定义，不创建实例。
 */
export interface EntryCostConsumer {
  /** 检查是否可以消耗指定入口资源 */
  canConsume(cost: EntryCostConfig): EntryCostCheckResult;
  /** 执行消耗（预留，未实现） */
  consume(cost: EntryCostConfig): { success: boolean; error?: string };
}
