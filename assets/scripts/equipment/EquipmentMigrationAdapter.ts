// ============================================================
// EquipmentMigrationAdapter.ts — 旧装备系统数据迁移适配器
// 职责：将旧 EquipmentSaveData → Inventory InstanceItem + EquipmentSaveDataV2
// 位置：equipment/ 层
// 边界：迁移必须幂等 / 同一旧 uid 不得重复生成多个 uniqueId
//
// 旧数据结构：
//   EquipmentSaveData {
//     instances: Record<string, EquipmentInstanceData>  // uid → { uid, configId }
//     heroEquipment: Record<string, HeroEquipmentData>   // heroId → { heroId, weaponId, armorId, accessoryId }
//   }
//
// 新数据结构：
//   InventorySaveData.instanceItems: InstanceItem[]       // uniqueId（inst_Equipment_...）
//   EquipmentSaveDataV2.loadouts: LoadoutSaveEntry[]      // heroId → slotId → uniqueId
// ============================================================

import type { EquipmentSaveData } from '../save/EquipmentSaveData';
import type { EquipmentSaveDataV2 } from './EquipmentLoadoutData';
import { ensureLoadoutEntry, createDefaultEquipmentSaveMetaV2 } from './EquipmentLoadoutData';
import type { InstanceItem } from '../inventory/InventoryDomain';
import type { AddAssetRequest } from '../inventory/InventoryTransaction';
import type { InventorySource } from '../inventory/InventoryDomain';
import { CORE_SLOT_IDS } from './EquipmentTypes';

// ==================== 迁移结果 ====================

export interface MigrationResult {
  success: boolean;
  /** 创建的 InstanceItem 数量 */
  instancesCreated: number;
  /** 迁移的穿戴关系数量 */
  loadoutsMigrated: number;
  /** 跳过的实例（已存在） */
  instancesSkipped: number;
  /** 错误列表 */
  errors: string[];
}

export interface MigrationAddAssetCallback {
  (transactionId: string, requests: AddAssetRequest[]): Promise<{
    success: boolean;
    createdUniqueIds?: string[];
    error?: string;
  }>;
}

// ==================== 迁移元数据存储 key ====================

/**
 * 旧 uid → 新 uniqueId 映射持久化 key。
 *
 * 存储在 EquipmentSaveDataV2.meta 的扩展字段中。
 */
const MIGRATED_UID_MAP_KEY = '_migratedUidMap';

// ==================== 工具函数 ====================

/**
 * 从旧 uid 推算 Inventory itemId。
 *
 * 旧 uid 格式: EQUIP_{configId}_{timestamp}_{counter}
 *   例: EQUIP_weapon_001_1718000000000_1
 *
 * configId 格式: weapon_001
 *   推算 itemId: ITEM_EQ_WEAPON_001
 */
function oldUidToItemId(uid: string): string | null {
  // 匹配: EQUIP_{configId}_{timestamp}_{counter}
  const match = uid.match(/^EQUIP_(.+)_\d+_\d+$/);
  if (!match) return null;

  const configId = match[1]; // e.g. "weapon_001"
  const parts = configId.split('_');
  const type = parts[0]?.toUpperCase() ?? 'UNKNOWN';
  const num = parts[1] ?? '001';
  return `ITEM_EQ_${type}_${num}`;
}

/**
 * 从旧 configId 推算 Inventory itemId。
 *
 * configId: "weapon_001" → itemId: "ITEM_EQ_WEAPON_001"
 */
function configIdToItemId(configId: string): string {
  const parts = configId.split('_');
  const type = parts[0]?.toUpperCase() ?? 'UNKNOWN';
  const num = parts[1] ?? '001';
  return `ITEM_EQ_${type}_${num}`;
}

/**
 * 从旧 uid 推算 configId。
 *
 * uid: EQUIP_weapon_001_1718000000000_1 → configId: weapon_001
 */
function oldUidToConfigId(uid: string): string | null {
  const match = uid.match(/^EQUIP_(.+)_\d+_\d+$/);
  if (!match) return null;
  return match[1];
}

/**
 * 从旧 subType（Weapon/Armor/Accessory）推断槽位 ID。
 */
function oldSubTypeToSlotId(equipmentType: string): string {
  const map: Record<string, string> = {
    Weapon: 'Weapon',
    Armor: 'Armor',
    Accessory: 'Accessory',
  };
  return map[equipmentType] ?? 'Accessory';
}

// ==================== 迁移适配器 ====================

export class EquipmentMigrationAdapter {
  /**
   * 检查是否需要迁移。
   *
   * @param equipmentDataV2  新 EquipmentSaveDataV2
   * @returns                true 表示需要迁移
   */
  static isMigrationNeeded(equipmentDataV2: EquipmentSaveDataV2): boolean {
    return !equipmentDataV2.meta.migrationCompleted;
  }

  /**
   * 检查旧存档是否有数据需要迁移。
   *
   * @param oldEquipmentData  旧 EquipmentSaveData
   * @returns                 true 表示有数据
   */
  static hasLegacyData(oldEquipmentData: EquipmentSaveData): boolean {
    const hasInstances =
      oldEquipmentData.instances &&
      Object.keys(oldEquipmentData.instances).length > 0;
    const hasHeroEquipment =
      oldEquipmentData.heroEquipment &&
      Object.keys(oldEquipmentData.heroEquipment).length > 0;
    return hasInstances || hasHeroEquipment;
  }

  /**
   * 构建旧 uid → 新 uniqueId 的映射。
   *
   * 供外部在迁移前建立映射引用。
   *
   * @param oldInstances  旧 instances 记录
   * @returns             Map<oldUid, newUniqueId>
   */
  static buildLegacyUidToUniqueIdMap(
    oldInstances: Record<string, { uid: string; configId: string }>,
  ): Map<string, string> {
    const map = new Map<string, string>();
    let counter = 0;
    for (const oldUid of Object.keys(oldInstances)) {
      const ts = Date.now() + counter;
      const rand = Math.random().toString(36).slice(2, 8);
      const newUniqueId = `inst_Equipment_${ts}_${rand}_${counter + 1}`;
      map.set(oldUid, newUniqueId);
      counter++;
    }
    return map;
  }

  /**
   * 执行迁移。
   *
   * 将旧 EquipmentSaveData 转换为：
   *   1. AddAssetRequest[] — 由外部调用 InventoryService.addAssets() 入库
   *   2. 更新的 EquipmentSaveDataV2 — 由外部保存
   *
   * 此方法为纯函数，不直接调用 InventoryService 或 SaveManager。
   *
   * @param oldEquipmentData    旧 EquipmentSaveData
   * @param existingEquipmentDataV2  当前 EquipmentSaveDataV2（原地修改）
   * @param existingInstanceUniqueIds  已存在的 InstanceItem uniqueId 集合（用于幂等检查）
   * @returns                    MigrationResult + addAssetRequests + updatedEquipmentDataV2
   */
  static buildMigration(
    oldEquipmentData: EquipmentSaveData,
    existingEquipmentDataV2: EquipmentSaveDataV2,
    existingInstanceUniqueIds: Set<string>,
  ): {
    result: MigrationResult;
    addAssetRequests: AddAssetRequest[];
    equipmentDataV2: EquipmentSaveDataV2;
  } {
    const errors: string[] = [];
    const addAssetRequests: AddAssetRequest[] = [];
    const uidMap = new Map<string, string>(); // oldUid → newUniqueId

    // 获取已有的迁移映射（幂等性）
    const migratedUidMap: Record<string, string> =
      (existingEquipmentDataV2.meta as any)[MIGRATED_UID_MAP_KEY] ?? {};

    let instancesCreated = 0;
    let instancesSkipped = 0;
    let loadoutsMigrated = 0;
    const transactionId = `eq_migration_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Step 1: 处理旧装备实例 → AddAssetRequest
    if (oldEquipmentData.instances) {
      for (const [oldUid, oldInstance] of Object.entries(
        oldEquipmentData.instances,
      )) {
        try {
          // 幂等检查：是否已经迁移过
          if (migratedUidMap[oldUid]) {
            uidMap.set(oldUid, migratedUidMap[oldUid]);
            instancesSkipped++;
            continue;
          }

          const itemId = oldUidToItemId(oldUid);
          if (!itemId) {
            errors.push(`无法解析旧 uid 为 itemId: ${oldUid}`);
            continue;
          }

          // 生成新的 uniqueId（幂等：相同 oldUid 始终生成相同的 newUniqueId）
          const newUniqueId = EquipmentMigrationAdapter._generateDeterministicUniqueId(
            oldUid,
            existingInstanceUniqueIds,
          );

          addAssetRequests.push({
            itemId,
            count: 1,
            source: 'system_default' as InventorySource,
            reason: 'reward_grant' as any,
          });

          uidMap.set(oldUid, newUniqueId);
          migratedUidMap[oldUid] = newUniqueId;
          instancesCreated++;
        } catch (error) {
          errors.push(`迁移装备实例失败: ${oldUid}, ${String(error)}`);
        }
      }
    }

    // Step 2: 处理旧穿戴关系 → Loadout
    if (oldEquipmentData.heroEquipment) {
      for (const [heroId, heroEq] of Object.entries(
        oldEquipmentData.heroEquipment,
      )) {
        try {
          const entry = ensureLoadoutEntry(existingEquipmentDataV2, heroId);

          // 映射旧硬编码槽位到新 slot-based 模型
          const oldSlotMappings: Array<{
            oldField: string;
            slotId: string;
          }> = [
            { oldField: 'weaponId', slotId: 'Weapon' },
            { oldField: 'armorId', slotId: 'Armor' },
            { oldField: 'accessoryId', slotId: 'Accessory' },
          ];

          for (const mapping of oldSlotMappings) {
            const oldEquippedUid = (heroEq as any)[mapping.oldField] as string | null;
            if (!oldEquippedUid) continue;

            // 通过 uidMap 查找新的 uniqueId
            const newUniqueId = uidMap.get(oldEquippedUid);
            if (newUniqueId) {
              // 只有在新装备系统中槽位为空时才写入
              if (!entry.slots[mapping.slotId]) {
                entry.slots[mapping.slotId] = newUniqueId;
                loadoutsMigrated++;
              }
            } else if (migratedUidMap[oldEquippedUid]) {
              // 之前已迁移的
              const existingNewId = migratedUidMap[oldEquippedUid];
              if (!entry.slots[mapping.slotId]) {
                entry.slots[mapping.slotId] = existingNewId;
                loadoutsMigrated++;
              }
            } else {
              errors.push(
                `英雄 ${heroId} 的穿戴关系引用了未找到的装备 uid: ${oldEquippedUid}`,
              );
            }
          }
        } catch (error) {
          errors.push(`迁移英雄穿戴关系失败: ${heroId}, ${String(error)}`);
        }
      }
    }

    // Step 3: 更新元数据
    existingEquipmentDataV2.meta.migrationCompleted = true;
    existingEquipmentDataV2.meta.migrationCompletedAt = Date.now();
    existingEquipmentDataV2.meta.updatedAt = Date.now();
    (existingEquipmentDataV2.meta as any)[MIGRATED_UID_MAP_KEY] = migratedUidMap;

    return {
      result: {
        success: errors.length === 0,
        instancesCreated,
        loadoutsMigrated,
        instancesSkipped,
        errors,
      },
      addAssetRequests,
      equipmentDataV2: existingEquipmentDataV2,
    };
  }

  /**
   * 生成确定性的新 uniqueId（基于旧 uid）。
   *
   * 同一旧 uid 始终生成相同的 newUniqueId，保证幂等性。
   */
  private static _generateDeterministicUniqueId(
    oldUid: string,
    existingIds: Set<string>,
  ): string {
    // 基于旧 uid 的哈希值生成稳定的新 ID
    let hash = 0;
    for (let i = 0; i < oldUid.length; i++) {
      const char = oldUid.charCodeAt(i);
      hash = (hash * 31 + char) & 0x7fffffff;
    }

    const ts = 1700000000000; // 固定时间戳保证确定性
    const rand = hash.toString(36).slice(-6).padStart(6, '0');
    let counter = 0;
    let candidate = `inst_Equipment_${ts}_${rand}_${counter}`;

    // 碰撞检查
    while (existingIds.has(candidate)) {
      counter++;
      candidate = `inst_Equipment_${ts}_${rand}_${counter}`;
    }

    return candidate;
  }
}
