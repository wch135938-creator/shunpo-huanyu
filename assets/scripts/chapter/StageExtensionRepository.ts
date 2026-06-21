// ============================================================
// StageExtensionRepository — Phase10-Step3 关卡扩展配置仓库
// 职责：加载/缓存 stage_extension_config.json，提供同步查询
// 边界：不包含业务逻辑、不修改配置、不涉及运行时状态
// ============================================================

import { BaseSystem } from '../core/BaseSystem';
import { ConfigManager } from '../core/ConfigManager';
import type {
  StageExtensionConfig,
  StageExtensionConfigList,
} from './ChapterEventTypes';

export class StageExtensionRepository extends BaseSystem {

  // ==================== 配置路径常量 ====================

  /** stage_extension_config.json 路径（相对 resources/，不含扩展名） */
  static readonly CONFIG_PATH = `${ConfigManager.CONFIG_ROOT}/chapter/stage_extension_config`;

  // ==================== 内部状态 ====================

  /** 关卡扩展配置缓存：stageId → StageExtensionConfig */
  private _extensionMap: Map<string, StageExtensionConfig> = new Map();

  /** 配置是否已加载 */
  private _loaded = false;

  // ==================== 单例 ====================

  static getInstance(): StageExtensionRepository {
    return super.getInstance<StageExtensionRepository>();
  }

  // ==================== 初始化 ====================

  /**
   * 加载 stage_extension_config.json 配置。
   *
   * 调用方应在使用 StageExtensionRepository 前执行一次。
   * 重复调用会复用 ConfigManager 缓存。
   */
  async load(): Promise<void> {
    if (this._loaded) {
      console.warn('[StageExtensionRepository] 已加载，跳过重复 load');
      return;
    }

    const configManager = ConfigManager.getInstance();
    const data = await configManager.loadConfig<StageExtensionConfigList>(
      StageExtensionRepository.CONFIG_PATH,
    );

    this._buildMap(data);
    this._loaded = true;
    console.log(
      `[StageExtensionRepository] 加载完成，共 ${this._extensionMap.size} 个关卡扩展配置`,
    );
  }

  /** 是否已加载配置 */
  isLoaded(): boolean {
    return this._loaded;
  }

  // ==================== 查询接口 ====================

  /**
   * 获取指定关卡的扩展配置。
   *
   * @param stageId  关卡 ID
   * @returns        关卡扩展配置，不存在时返回 null
   */
  getStageExtension(stageId: string): StageExtensionConfig | null {
    return this._extensionMap.get(stageId) ?? null;
  }

  /**
   * 获取所有关卡扩展配置列表。
   *
   * @returns  关卡扩展配置数组
   */
  getAll(): StageExtensionConfig[] {
    return Array.from(this._extensionMap.values());
  }

  /**
   * 获取已缓存的扩展配置数量。
   */
  getCount(): number {
    return this._extensionMap.size;
  }

  // ==================== 内部方法 ====================

  /** 从 StageExtensionConfigList 构建配置映射 */
  private _buildMap(data: StageExtensionConfigList): void {
    const map = new Map<string, StageExtensionConfig>();

    if (!data.stages || !Array.isArray(data.stages)) {
      console.warn('[StageExtensionRepository] stage_extension_config.json 数据为空');
      this._extensionMap = map;
      return;
    }

    for (const entry of data.stages) {
      const cloned: StageExtensionConfig = {
        stageId: entry.stageId,
        eventPool: [...entry.eventPool],
        enemyPool: [...entry.enemyPool],
      };
      map.set(entry.stageId, cloned);
    }

    this._extensionMap = map;
  }
}
