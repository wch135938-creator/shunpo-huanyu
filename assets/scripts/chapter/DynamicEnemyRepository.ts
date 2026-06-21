// ============================================================
// DynamicEnemyRepository — Phase10-Step3 动态敌人配置仓库
// 职责：加载/缓存 dynamic_enemy_config.json，提供同步查询
// 边界：不包含业务逻辑、不修改配置、不涉及运行时状态
// ============================================================

import { BaseSystem } from '../core/BaseSystem';
import { ConfigManager } from '../core/ConfigManager';
import type {
  DynamicEnemyConfig,
  DynamicEnemyConfigList,
} from './ChapterEventTypes';

export class DynamicEnemyRepository extends BaseSystem {

  // ==================== 配置路径常量 ====================

  /** dynamic_enemy_config.json 路径（相对 resources/，不含扩展名） */
  static readonly CONFIG_PATH = `${ConfigManager.CONFIG_ROOT}/chapter/dynamic_enemy_config`;

  // ==================== 内部状态 ====================

  /** 动态敌人配置缓存：enemyId → DynamicEnemyConfig */
  private _enemyMap: Map<string, DynamicEnemyConfig> = new Map();

  /** 配置是否已加载 */
  private _loaded = false;

  // ==================== 单例 ====================

  static getInstance(): DynamicEnemyRepository {
    return super.getInstance<DynamicEnemyRepository>();
  }

  // ==================== 初始化 ====================

  /**
   * 加载 dynamic_enemy_config.json 配置。
   *
   * 调用方应在使用 DynamicEnemyRepository 前执行一次。
   * 重复调用会复用 ConfigManager 缓存。
   */
  async load(): Promise<void> {
    if (this._loaded) {
      console.warn('[DynamicEnemyRepository] 已加载，跳过重复 load');
      return;
    }

    const configManager = ConfigManager.getInstance();
    const data = await configManager.loadConfig<DynamicEnemyConfigList>(
      DynamicEnemyRepository.CONFIG_PATH,
    );

    this._buildMap(data);
    this._loaded = true;
    console.log(
      `[DynamicEnemyRepository] 加载完成，共 ${this._enemyMap.size} 个动态敌人配置`,
    );
  }

  /** 是否已加载配置 */
  isLoaded(): boolean {
    return this._loaded;
  }

  // ==================== 查询接口 ====================

  /**
   * 获取指定动态敌人配置。
   *
   * @param enemyId  动态敌人 ID
   * @returns        动态敌人配置，不存在时返回 null
   */
  getEnemy(enemyId: string): DynamicEnemyConfig | null {
    return this._enemyMap.get(enemyId) ?? null;
  }

  /**
   * 获取所有动态敌人配置列表。
   *
   * @returns  动态敌人配置数组
   */
  getAll(): DynamicEnemyConfig[] {
    return Array.from(this._enemyMap.values());
  }

  /**
   * 获取已缓存的动态敌人配置数量。
   */
  getCount(): number {
    return this._enemyMap.size;
  }

  // ==================== 内部方法 ====================

  /** 从 DynamicEnemyConfigList 构建配置映射 */
  private _buildMap(data: DynamicEnemyConfigList): void {
    const map = new Map<string, DynamicEnemyConfig>();

    if (!data.enemies || !Array.isArray(data.enemies)) {
      console.warn('[DynamicEnemyRepository] dynamic_enemy_config.json 数据为空');
      this._enemyMap = map;
      return;
    }

    for (const entry of data.enemies) {
      const cloned: DynamicEnemyConfig = {
        id: entry.id,
        baseEnemyId: entry.baseEnemyId,
        nameSuffix: entry.nameSuffix,
        hpMultiplier: entry.hpMultiplier,
        atkMultiplier: entry.atkMultiplier,
        defMultiplier: entry.defMultiplier,
        speedMultiplier: entry.speedMultiplier,
        levelBonus: entry.levelBonus,
        dropGroupOverride: entry.dropGroupOverride,
      };
      map.set(entry.id, cloned);
    }

    this._enemyMap = map;
  }
}
