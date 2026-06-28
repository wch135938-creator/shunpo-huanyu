// ============================================================
// InventorySaveData.ts — 资产存档数据结构
// 职责：定义 Inventory 持久化字段 / 工厂函数 / 大小限制
// 位置：inventory/ 层
// 边界：只定义类型与工厂函数，不包含业务逻辑
// 规范：零 any / all optional / 旧存档自动补全
// ============================================================

import type { StackItem, InstanceItem, BindState, LockState } from './InventoryDomain';

// ==================== 常量 ====================

/** 最大事务历史记录数 */
export const MAX_TRANSACTION_HISTORY = 100;

/** 最大快照保存数 */
export const MAX_SNAPSHOT_HISTORY = 50;

/** 默认 InventorySaveData 版本 */
export const INVENTORY_DATA_VERSION = 1;

// ==================== 货币索引 ====================

/** 货币快速索引（避免遍历 stackItems） */
export interface CurrencyIndex {
  /** 金币 */
  gold: number;
  /** 灵石 */
  spiritStone: number;
  /** 钻石 */
  diamond: number;
}

/** 创建默认货币索引 */
export function createDefaultCurrencyIndex(): CurrencyIndex {
  return { gold: 0, spiritStone: 0, diamond: 0 };
}

// ==================== 领取状态 ====================

/** 资产领取状态（幂等防重） */
export interface InventoryClaimStateEntry {
  /** 是否已领取 */
  claimed: boolean;
  /** 领取时间戳（Unix ms） */
  claimedAt: number;
  /** 关联的事务 ID */
  transactionId: string;
  /** 领取时的奖励快照 ID */
  snapshotId: string;
}

// ==================== 事务摘要 ====================

/** 最近事务摘要 */
export interface InventoryTransactionSummary {
  /** 事务 ID */
  transactionId: string;
  /** 变更原因 */
  reason: string;
  /** 资产变更类型 */
  changeType: 'gain' | 'consume' | 'adjust';
  /** 涉及的物品 ID 列表 */
  itemIds: string[];
  /** 变更摘要（人类可读） */
  summary: string;
  /** 执行时间戳（Unix ms） */
  executedAt: number;
  /** 是否成功 */
  success: boolean;
  /** [Phase10-Step5-Fix] 原始变更记录（用于幂等返回） */
  changes?: Array<{ itemId: string; delta: number; after: number; category: string }>;
}

// ==================== 资产快照 ====================

/** 奖励资产快照（用于追溯/补偿） */
export interface InventoryRewardSnapshot {
  /** 快照 ID */
  snapshotId: string;
  /** 事务 ID */
  transactionId: string;
  /** 来源标识 */
  source: string;
  /** 来源 ID */
  sourceId: string;
  /** 快照时的 StackItem 变更摘要 */
  stackChanges: Array<{ itemId: string; delta: number; after: number }>;
  /** 快照时的 InstanceItem 变更摘要 */
  instanceChanges: Array<{ uniqueId: string; itemId: string; action: 'created' | 'updated' | 'deleted' }>;
  /** 快照时间戳 */
  createdAt: number;
}

// ==================== 元数据 ====================

/** Inventory 元数据 */
export interface InventoryMeta {
  /** 数据版本号 */
  version: number;
  /** 最后更新时间戳 */
  updatedAt: number;
  /** 下次清理过期资产的时间戳 */
  nextCleanupAt: number;
  /** 已清理标记 */
  cleanedUp: boolean;
  /** Phase10-Step11AA: 初始装备是否已发放 */
  initialEquipmentGranted: boolean;
  /** Starter equipment growth materials have been granted. */
  initialEquipmentMaterialsGranted?: boolean;
}

/** 创建默认 InventoryMeta */
export function createDefaultInventoryMeta(): InventoryMeta {
  return {
    version: INVENTORY_DATA_VERSION,
    updatedAt: Date.now(),
    nextCleanupAt: Date.now() + 86400000, // 24h 后
    cleanedUp: false,
    initialEquipmentGranted: false,
    initialEquipmentMaterialsGranted: false,
  };
}

// ==================== InventorySaveData ====================

/**
 * Inventory 模块存档数据。
 *
 * 作为 SaveContainerV8 的 optional 字段 `inventoryData?` 存储。
 * 所有字段必须 optional 兼容旧存档。
 */
export interface InventorySaveData {
  /** 数量型资产列表 */
  stackItems: StackItem[];
  /** 实例型资产列表 */
  instanceItems: InstanceItem[];
  /** 货币快速索引 */
  currencies: CurrencyIndex;
  /** 领取状态（key = transactionId） */
  claimStates: Record<string, InventoryClaimStateEntry>;
  /** 最近事务摘要（限量 MAX_TRANSACTION_HISTORY） */
  transactions: InventoryTransactionSummary[];
  /** 必要奖励快照（限量 MAX_SNAPSHOT_HISTORY） */
  snapshots: InventoryRewardSnapshot[];
  /** 元数据 */
  meta: InventoryMeta;
}

/** 创建默认 InventorySaveData */
export function createDefaultInventorySaveData(): InventorySaveData {
  return {
    stackItems: [],
    instanceItems: [],
    currencies: createDefaultCurrencyIndex(),
    claimStates: {},
    transactions: [],
    snapshots: [],
    meta: createDefaultInventoryMeta(),
  };
}

// ==================== 货币操作工具（纯函数） ====================

/** 从 stackItems 构建货币索引快照 */
export function buildCurrencyIndex(stackItems: StackItem[]): CurrencyIndex {
  const index = createDefaultCurrencyIndex();
  for (const item of stackItems) {
    switch (item.itemId) {
      case 'ITEM_GOLD':
        index.gold += item.count;
        break;
      case 'ITEM_SPIRIT_STONE':
        index.spiritStone += item.count;
        break;
      case 'ITEM_DIAMOND':
        index.diamond += item.count;
        break;
    }
  }
  return index;
}

// ==================== 存档裁剪工具（纯函数） ====================

/** 裁剪事务历史到限额 */
export function trimTransactions(
  transactions: InventoryTransactionSummary[],
): InventoryTransactionSummary[] {
  if (transactions.length <= MAX_TRANSACTION_HISTORY) return transactions;
  return transactions.slice(0, MAX_TRANSACTION_HISTORY);
}

/** 裁剪快照到限额 */
export function trimSnapshots(
  snapshots: InventoryRewardSnapshot[],
): InventoryRewardSnapshot[] {
  if (snapshots.length <= MAX_SNAPSHOT_HISTORY) return snapshots;
  return snapshots.slice(0, MAX_SNAPSHOT_HISTORY);
}
