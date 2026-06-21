// ============================================================
// SaveBackup — Phase6-Step5 存档备份与回滚
// 职责：迁移前创建备份 / 迁移失败恢复备份 / 备份生命周期管理
// 边界：不包含迁移逻辑、不触碰运行时系统状态
// ============================================================

import { BaseSystem } from '../core/BaseSystem';
import { ISaveAdapter } from './ISaveAdapter';
import type { SaveContainer } from './SaveContainer';

// ---- 类型定义 ----

/** 备份元信息 */
export interface BackupMeta {
  /** 备份唯一标识 */
  key: string;
  /** 备份创建时间戳 */
  timestamp: number;
  /** 备份时的存档版本号 */
  saveVersion: number;
  /** 创建原因（如 "pre-migration"、"manual"） */
  reason: string;
}

/** 备份恢复结果 */
export interface BackupRestoreResult {
  /** 是否成功 */
  success: boolean;
  /** 恢复的存档容器 */
  container: SaveContainer | null;
  /** 错误信息 */
  error?: string;
}

// ---- 常量 ----

/** 备份存储 Key 前缀 */
const BACKUP_KEY_PREFIX = 'game_save_backup_';

/** 备份 Key 前缀（用于列表查询） */
const BACKUP_INDEX_KEY = 'game_save_backup_index';

/** 最大备份保留数 */
const MAX_BACKUP_COUNT = 5;

export class SaveBackup extends BaseSystem {

  // ==================== 内部状态 ====================

  /** 存储适配器（由 SaveManager 注入） */
  private _adapter: ISaveAdapter | null = null;

  /** 是否已初始化 */
  private _initialized = false;

  // ==================== 初始化 ====================

  /**
   * 初始化备份系统。
   *
   * @param adapter  存储适配器
   */
  init(adapter: ISaveAdapter): void {
    this._adapter = adapter;
    this._initialized = true;
  }

  /** 是否已初始化 */
  isInitialized(): boolean {
    return this._initialized;
  }

  // ==================== 备份操作 ====================

  /**
   * 创建存档备份。
   *
   * 备份以独立 Key 存储，不影响主存档。
   * Key 格式：game_save_backup_<timestamp>
   *
   * @param container  待备份的存档容器（深拷贝后存储）
   * @param reason     备份原因
   * @returns          备份 Key，失败返回空字符串
   */
  createBackup(container: SaveContainer, reason: string = 'pre-migration'): string {
    if (!this._ensureReady()) return '';

    try {
      const timestamp = Date.now();
      const backupKey = `${BACKUP_KEY_PREFIX}${timestamp}`;

      // 深拷贝存档数据（通过 JSON 序列化/反序列化）
      const backupData = this._deepClone(container);

      // 写入备份
      const ok = this._adapter!.write(backupKey, backupData);
      if (!ok) {
        console.error(`[SaveBackup] 备份写入失败: ${backupKey}`);
        return '';
      }

      // 更新备份索引
      this._updateBackupIndex(backupKey, {
        key: backupKey,
        timestamp,
        saveVersion: container.saveVersion ?? 0,
        reason,
      });

      // 清理过期备份
      this._pruneOldBackups();

      console.log(
        `[SaveBackup] 备份创建成功: ${backupKey}, version=${container.saveVersion}, reason=${reason}`,
      );

      return backupKey;
    } catch (e) {
      console.error(`[SaveBackup] 备份创建异常: ${e}`);
      return '';
    }
  }

  /**
   * 从指定备份恢复存档。
   *
   * 恢复后原始备份保留（不自动删除）。
   *
   * @param backupKey  备份 Key
   * @returns          恢复结果
   */
  restoreBackup(backupKey: string): BackupRestoreResult {
    if (!this._ensureReady()) {
      return { success: false, container: null, error: '备份系统未初始化' };
    }

    try {
      // 检查备份是否存在
      if (!this._adapter!.exists(backupKey)) {
        return {
          success: false,
          container: null,
          error: `备份不存在: ${backupKey}`,
        };
      }

      // 读取备份数据
      const container = this._adapter!.read(backupKey);
      if (!container) {
        return {
          success: false,
          container: null,
          error: `备份读取失败: ${backupKey}`,
        };
      }

      console.log(
        `[SaveBackup] 备份恢复成功: ${backupKey}, version=${container.saveVersion}`,
      );

      return { success: true, container: this._deepClone(container) };
    } catch (e) {
      const errorMsg = `备份恢复异常: ${e}`;
      console.error(`[SaveBackup] ${errorMsg}`);
      return { success: false, container: null, error: errorMsg };
    }
  }

  /**
   * 删除指定备份。
   *
   * @param backupKey  备份 Key
   * @returns          是否删除成功
   */
  deleteBackup(backupKey: string): boolean {
    if (!this._ensureReady()) return false;

    try {
      const ok = this._adapter!.delete(backupKey);
      if (ok) {
        this._removeFromBackupIndex(backupKey);
        console.log(`[SaveBackup] 备份已删除: ${backupKey}`);
      }
      return ok;
    } catch (e) {
      console.error(`[SaveBackup] 备份删除异常: ${e}`);
      return false;
    }
  }

  /**
   * 获取最新的备份存档。
   *
   * @returns  最新的 SaveContainer，无备份时返回 null
   */
  getLatestBackup(): SaveContainer | null {
    const backups = this.listBackups();
    if (backups.length === 0) return null;

    // 按时间戳倒序排列，取最新
    const latest = backups[0];
    return this._adapter!.read(latest.key);
  }

  /**
   * 列出所有备份的元信息（按时间戳倒序）。
   *
   * @returns  备份元信息数组
   */
  listBackups(): BackupMeta[] {
    if (!this._ensureReady()) return [];

    try {
      const index = this._readBackupIndex();

      // 清理索引中已不存在的备份
      const validBackups: BackupMeta[] = [];
      for (const meta of index) {
        if (this._adapter!.exists(meta.key)) {
          validBackups.push(meta);
        }
      }

      // 如果索引有变化，更新索引
      if (validBackups.length !== index.length) {
        this._writeBackupIndex(validBackups);
      }

      // 按时间戳倒序排列
      validBackups.sort((a, b) => b.timestamp - a.timestamp);

      return validBackups;
    } catch (e) {
      console.error(`[SaveBackup] 列出备份异常: ${e}`);
      return [];
    }
  }

  /**
   * 删除所有备份。
   *
   * @returns  删除的备份数量
   */
  deleteAllBackups(): number {
    const backups = this.listBackups();
    let count = 0;

    for (const meta of backups) {
      if (this.deleteBackup(meta.key)) {
        count += 1;
      }
    }

    // 清空索引
    this._writeBackupIndex([]);

    return count;
  }

  // ==================== 内部方法 ====================

  /** 确保已初始化 */
  private _ensureReady(): boolean {
    if (!this._initialized) {
      console.error('[SaveBackup] 操作失败：未调用 init()');
      return false;
    }
    if (!this._adapter) {
      console.error('[SaveBackup] 操作失败：adapter 为空');
      return false;
    }
    return true;
  }

  /** 深拷贝存档容器 */
  private _deepClone(container: SaveContainer): SaveContainer {
    return JSON.parse(JSON.stringify(container)) as SaveContainer;
  }

  /** 读取备份索引 */
  private _readBackupIndex(): BackupMeta[] {
    try {
      // 使用 adapter 的 exists/read，但备份索引用特殊 Key
      // 由于 ISaveAdapter 的 write/read 是 SaveContainer 类型，这里我们用 JSON 字符串存索引
      // 实际：将索引用 SaveContainer 的 shape 包装
      const raw = (this._adapter as unknown as Record<string, unknown>)?.['_readRaw'] as
        ((key: string) => string | null) | undefined;

      // 降级方案：遍历所有已知备份 Key 来构建索引
      // 因为 ISaveAdapter 不支持读任意字符串
      return this._buildIndexFromExistingBackups();
    } catch {
      return this._buildIndexFromExistingBackups();
    }
  }

  /**
   * 通过在 adapter 中逐个检查已知 backup key 来重建索引。
   *
   * 由于 ISaveAdapter 接口仅支持 SaveContainer 类型的读写，
   * 索引通过 LocalStorageAdapter 的降级 Map 间接管理。
   */
  private _buildIndexFromExistingBackups(): BackupMeta[] {
    // 扫描可能的备份 Key（基于已知时间戳范围）
    // 这是一个简化实现：依赖内存中的 fallback map
    const result: BackupMeta[] = [];

    // 尝试从 adapter 的 fallbackMap 读取（仅编辑器/浏览器环境）
    try {
      const fallbackMap = (this._adapter as unknown as Record<string, unknown>)?.['_fallbackMap'] as
        Map<string, string> | undefined;

      if (fallbackMap) {
        for (const key of fallbackMap.keys()) {
          if (key.startsWith(BACKUP_KEY_PREFIX) && key !== BACKUP_INDEX_KEY) {
            try {
              const jsonStr = fallbackMap.get(key);
              if (jsonStr) {
                const container = JSON.parse(jsonStr) as SaveContainer;
                result.push({
                  key,
                  timestamp: container.timestamp ?? 0,
                  saveVersion: container.saveVersion ?? 0,
                  reason: this._extractReasonFromBackupKey(key),
                });
              }
            } catch {
              // 跳过损坏的备份
            }
          }
        }
      }
    } catch {
      // 无法访问内部状态时返回空
    }

    result.sort((a, b) => b.timestamp - a.timestamp);
    return result;
  }

  /** 更新备份索引（追加新备份） */
  private _updateBackupIndex(backupKey: string, meta: BackupMeta): void {
    // 索引通过内部 _fallbackMap 间接管理
    // 备份数据已通过 adapter.write 存储，索引通过扫描重建
    // 此方法保留用于未来扩展（如微信端使用独立 storage key 存储索引）
  }

  /** 从备份索引中移除指定项 */
  private _removeFromBackupIndex(backupKey: string): void {
    // 索引通过扫描重建，删除时只需确保 backup data 被移除
  }

  /** 写入备份索引 */
  private _writeBackupIndex(index: BackupMeta[]): void {
    // 当前通过扫描重建索引，此方法为未来扩展预留
  }

  /** 从备份 Key 中提取原因（用于重建索引） */
  private _extractReasonFromBackupKey(key: string): string {
    // Key 格式：game_save_backup_<timestamp>
    // 原因无法直接从 Key 推断，默认为 "unknown"
    return 'unknown';
  }

  /**
   * 清理过期备份，保留最近 MAX_BACKUP_COUNT 个。
   */
  private _pruneOldBackups(): void {
    try {
      const backups = this.listBackups();

      if (backups.length <= MAX_BACKUP_COUNT) return;

      // 删除超出限制的旧备份
      const toDelete = backups.slice(MAX_BACKUP_COUNT);
      for (const meta of toDelete) {
        this._adapter!.delete(meta.key);
        console.log(`[SaveBackup] 清理过期备份: ${meta.key}`);
      }
    } catch (e) {
      console.warn(`[SaveBackup] 清理过期备份异常: ${e}`);
    }
  }
}
