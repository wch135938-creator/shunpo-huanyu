// ============================================================
// EquipmentLoadoutData.ts — 装备穿戴关系存档结构
// 职责：定义 equipmentData? 的持久化字段
// 位置：equipment/ 层 → SaveContainerV8.equipmentData?
// 边界：只保存穿戴关系，不保存完整装备实例
//
// 数据主权：
//   装备实例存在性 → Inventory V2 instanceItems
//   装备穿戴关系   → 此结构
// ============================================================

import type { EquipmentLoadout } from './EquipmentTypes';
import { CORE_SLOT_IDS } from './EquipmentTypes';

// ==================== 存档类型 ====================

/**
 * 单个英雄的穿戴关系存档条目。
 *
 * slots: slotId → equipmentUniqueId | null
 * 只存储 Inventory InstanceItem.uniqueId 引用。
 */
export interface EquipmentLoadoutSaveEntry {
  /** 英雄 ID */
  heroId: string;
  /** 槽位 → 装备 UniqueId（null = 空槽位） */
  slots: Record<string, string | null>;
}

/**
 * EquipmentData 元数据。
 */
export interface EquipmentSaveMetaV2 {
  /** 数据格式版本 */
  version: number;
  /** 最后更新时间戳（Unix ms） */
  updatedAt: number;
  /** 脏标记：heroId → true（需要重新计算战力） */
  dirtyFlags: Record<string, boolean>;
  /** 配置版本追踪 */
  configVersion: string;
  /** 是否已完成旧装备数据迁移 */
  migrationCompleted: boolean;
  /** 迁移完成时间戳（Unix ms） */
  migrationCompletedAt?: number;
}

/**
 * Equipment SaveData V2 — 装备穿戴关系存档。
 *
 * 只保存：
 *   - heroId → slotId → equipmentUniqueId
 *   - 元数据（版本、时间戳、脏标记、配置版本、迁移状态）
 *
 * 禁止保存：
 *   - 完整装备实例（属于 Inventory V2 instanceItems）
 *   - 材料消耗历史（属于 InventoryTransaction）
 *   - Analytics 明细（属于 Analytics 层）
 *   - Reward 快照（属于 Reward 层）
 */
export interface EquipmentSaveDataV2 {
  /** 数据格式版本 */
  version: number;
  /** 所有英雄的穿戴关系 */
  loadouts: EquipmentLoadoutSaveEntry[];
  /** 元数据 */
  meta: EquipmentSaveMetaV2;
}

// ==================== 工厂函数 ====================

/** 当前 EquipmentSaveDataV2 数据格式版本 */
export const EQUIPMENT_SAVE_DATA_VERSION = 1;

/** 创建默认 EquipmentSaveMetaV2 */
export function createDefaultEquipmentSaveMetaV2(): EquipmentSaveMetaV2 {
  return {
    version: EQUIPMENT_SAVE_DATA_VERSION,
    updatedAt: Date.now(),
    dirtyFlags: {},
    configVersion: '',
    migrationCompleted: false,
  };
}

/** 创建默认 EquipmentSaveDataV2 */
export function createDefaultEquipmentSaveDataV2(): EquipmentSaveDataV2 {
  return {
    version: EQUIPMENT_SAVE_DATA_VERSION,
    loadouts: [],
    meta: createDefaultEquipmentSaveMetaV2(),
  };
}

// ==================== 查询工具函数 ====================

/**
 * 查找指定英雄的 Loadout 存档条目。
 *
 * @param data     EquipmentSaveDataV2
 * @param heroId   英雄 ID
 * @returns        找到的条目，或 null
 */
export function findLoadoutEntry(
  data: EquipmentSaveDataV2,
  heroId: string,
): EquipmentLoadoutSaveEntry | null {
  return data.loadouts.find((e) => e.heroId === heroId) ?? null;
}

/**
 * 确保指定英雄的 Loadout 存档条目存在。
 *
 * 如果不存在则创建并追加到 loadouts 数组。
 * 返回已存在的条目或新创建的条目。
 *
 * @param data     EquipmentSaveDataV2（会被原地修改）
 * @param heroId   英雄 ID
 * @returns        已存在的或新创建的条目
 */
export function ensureLoadoutEntry(
  data: EquipmentSaveDataV2,
  heroId: string,
): EquipmentLoadoutSaveEntry {
  const existing = findLoadoutEntry(data, heroId);
  if (existing) {
    return existing;
  }
  const slots: Record<string, string | null> = {};
  for (const slotId of CORE_SLOT_IDS) {
    slots[slotId] = null;
  }
  const entry: EquipmentLoadoutSaveEntry = { heroId, slots };
  data.loadouts.push(entry);
  return entry;
}

/**
 * 将存档条目转换为运行时 Loadout 对象。
 */
export function loadoutEntryToLoadout(
  entry: EquipmentLoadoutSaveEntry,
): EquipmentLoadout {
  return {
    heroId: entry.heroId,
    slots: { ...entry.slots },
    updatedAt: Date.now(),
  };
}

/**
 * 检查指定 uniqueId 是否被任何英雄穿戴。
 *
 * @param data     EquipmentSaveDataV2
 * @param uniqueId 装备 uniqueId
 * @returns        { equipped, heroId?, slotId? }
 */
export function findEquipmentWearer(
  data: EquipmentSaveDataV2,
  uniqueId: string,
): { equipped: boolean; heroId?: string; slotId?: string } {
  for (const entry of data.loadouts) {
    for (const [slotId, equippedId] of Object.entries(entry.slots)) {
      if (equippedId === uniqueId) {
        return { equipped: true, heroId: entry.heroId, slotId };
      }
    }
  }
  return { equipped: false };
}

/**
 * 获取所有已穿戴的装备 uniqueId 集合。
 */
export function getAllEquippedUniqueIds(
  data: EquipmentSaveDataV2,
): Set<string> {
  const ids = new Set<string>();
  for (const entry of data.loadouts) {
    for (const equippedId of Object.values(entry.slots)) {
      if (equippedId !== null) {
        ids.add(equippedId);
      }
    }
  }
  return ids;
}
