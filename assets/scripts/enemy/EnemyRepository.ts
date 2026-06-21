// ============================================================
// EnemyRepository — Phase9 敌人配置仓库
// 职责：通过 ConfigManager 加载/缓存 enemy_data.json 和 boss_data.json，
//       提供同步查询接口
// 边界：不包含业务逻辑、不修改配置、不涉及运行时状态
// 参考：HeroRepository (hero/ 层)
// ============================================================

import { BaseSystem } from '../core/BaseSystem';
import { ConfigManager } from '../core/ConfigManager';
import { EventManager } from '../core/EventManager';
import type {
  EnemyConfig,
  EnemyDataList,
  BossConfig,
  BossDataList,
} from './EnemyTypes';

export class EnemyRepository extends BaseSystem {

  // ==================== 配置路径常量 ====================

  /** enemy_data.json 路径（相对 resources/，不含扩展名） */
  static readonly ENEMY_DATA_PATH = `${ConfigManager.CONFIG_ROOT}/enemies/enemy_data`;

  /** boss_data.json 路径（相对 resources/，不含扩展名） */
  static readonly BOSS_DATA_PATH = `${ConfigManager.CONFIG_ROOT}/enemies/boss_data`;

  // ==================== 内部状态 ====================

  /** 敌人配置缓存：enemyId → EnemyConfig */
  private _enemyMap: Map<string, EnemyConfig> = new Map();

  /** Boss 配置缓存：bossId → BossConfig */
  private _bossMap: Map<string, BossConfig> = new Map();

  /** 敌人配置是否已加载 */
  private _enemyLoaded = false;

  /** Boss 配置是否已加载 */
  private _bossLoaded = false;

  // ==================== 初始化 ====================

  /**
   * 加载 enemy_data.json 配置。
   *
   * 调用方应在使用 EnemyRepository 前执行一次。
   * 重复调用会复用 ConfigManager 缓存。
   */
  async loadEnemyConfig(): Promise<void> {
    const configManager = ConfigManager.getInstance();
    const data = await configManager.loadConfig<EnemyDataList>(
      EnemyRepository.ENEMY_DATA_PATH,
    );

    this._enemyMap = this._buildEnemyMap(data);
    this._enemyLoaded = true;

    EventManager.getInstance().emit('enemy:loaded', {
      count: this._enemyMap.size,
    });

    console.log(
      `[EnemyRepository] enemy_data 加载完成，共 ${this._enemyMap.size} 个敌人`,
    );
  }

  /**
   * 加载 boss_data.json 配置。
   */
  async loadBossConfig(): Promise<void> {
    const configManager = ConfigManager.getInstance();
    const data = await configManager.loadConfig<BossDataList>(
      EnemyRepository.BOSS_DATA_PATH,
    );

    this._bossMap = this._buildBossMap(data);
    this._bossLoaded = true;

    EventManager.getInstance().emit('boss:loaded', {
      count: this._bossMap.size,
    });

    console.log(
      `[EnemyRepository] boss_data 加载完成，共 ${this._bossMap.size} 个 Boss`,
    );
  }

  /**
   * 加载所有敌人配置（enemy_data + boss_data）。
   *
   * 调用方应在使用 EnemyRepository 前执行一次。
   */
  async loadAllConfigs(): Promise<void> {
    await Promise.all([
      this.loadEnemyConfig(),
      this.loadBossConfig(),
    ]);
  }

  /** 敌人配置是否已加载 */
  isEnemyLoaded(): boolean {
    return this._enemyLoaded;
  }

  /** Boss 配置是否已加载 */
  isBossLoaded(): boolean {
    return this._bossLoaded;
  }

  /** 所有配置是否已加载 */
  isLoaded(): boolean {
    return this._enemyLoaded && this._bossLoaded;
  }

  // ==================== 敌人查询 ====================

  /**
   * 获取单个敌人配置。
   *
   * @param enemyId  敌人 ID
   * @returns        敌人配置，不存在时返回 null
   */
  getEnemy(enemyId: string): EnemyConfig | null {
    return this._enemyMap.get(enemyId) ?? null;
  }

  /**
   * 获取所有敌人配置列表。
   *
   * @returns  敌人配置数组
   */
  getAllEnemies(): EnemyConfig[] {
    return Array.from(this._enemyMap.values());
  }

  /**
   * 获取所有敌人 ID 列表。
   *
   * @returns  敌人 ID 数组
   */
  getAllEnemyIds(): string[] {
    return Array.from(this._enemyMap.keys());
  }

  /**
   * 判断敌人配置是否存在。
   *
   * @param enemyId  敌人 ID
   * @returns        是否存在对应配置
   */
  hasEnemy(enemyId: string): boolean {
    return this._enemyMap.has(enemyId);
  }

  /**
   * 按品质筛选敌人。
   *
   * @param quality  敌人品质
   * @returns        匹配的敌人配置数组
   */
  getEnemiesByQuality(quality: string): EnemyConfig[] {
    return this.getAllEnemies().filter((e) => e.quality === quality);
  }

  /**
   * 按元素筛选敌人。
   *
   * @param element  元素属性
   * @returns        匹配的敌人配置数组
   */
  getEnemiesByElement(element: string): EnemyConfig[] {
    return this.getAllEnemies().filter((e) => e.element === element);
  }

  /**
   * 获取已缓存敌人配置数量。
   */
  getEnemyCount(): number {
    return this._enemyMap.size;
  }

  // ==================== Boss 查询 ====================

  /**
   * 获取单个 Boss 配置。
   *
   * @param bossId  Boss ID
   * @returns       Boss 配置，不存在时返回 null
   */
  getBoss(bossId: string): BossConfig | null {
    return this._bossMap.get(bossId) ?? null;
  }

  /**
   * 获取所有 Boss 配置列表。
   *
   * @returns  Boss 配置数组
   */
  getAllBosses(): BossConfig[] {
    return Array.from(this._bossMap.values());
  }

  /**
   * 获取所有 Boss ID 列表。
   *
   * @returns  Boss ID 数组
   */
  getAllBossIds(): string[] {
    return Array.from(this._bossMap.keys());
  }

  /**
   * 判断 Boss 配置是否存在。
   *
   * @param bossId  Boss ID
   * @returns       是否存在对应配置
   */
  hasBoss(bossId: string): boolean {
    return this._bossMap.has(bossId);
  }

  /**
   * 按地牢引用 ID 查询 Boss。
   *
   * @param dungeonRef  地牢/章节 ID
   * @returns           匹配的 Boss 配置数组
   */
  getBossesByDungeon(dungeonRef: string): BossConfig[] {
    return this.getAllBosses().filter((b) =>
      b.dungeonRefs.includes(dungeonRef),
    );
  }

  /**
   * 获取已缓存 Boss 配置数量。
   */
  getBossCount(): number {
    return this._bossMap.size;
  }

  // ==================== 敌人组查询 ====================

  /**
   * 获取敌人组（按 enemyIds 组装 EnemyConfig[]）。
   *
   * 缺失的 enemyId 会导致 warn + 跳过。
   *
   * @param enemyIds  敌人 ID 数组
   * @returns         匹配的敌人配置数组
   */
  getEnemyGroup(enemyIds: string[]): EnemyConfig[] {
    const group: EnemyConfig[] = [];
    for (const enemyId of enemyIds) {
      const config = this._enemyMap.get(enemyId);
      if (config) {
        group.push(config);
      } else {
        console.warn(
          `[EnemyRepository] getEnemyGroup: 敌人配置不存在 enemyId=${enemyId}`,
        );
      }
    }
    return group;
  }

  // ==================== 内部方法 ====================

  /** 从 EnemyDataList 构建配置映射 */
  private _buildEnemyMap(data: EnemyDataList): Map<string, EnemyConfig> {
    const map = new Map<string, EnemyConfig>();

    if (!data?.data || !Array.isArray(data.data)) {
      console.warn('[EnemyRepository] enemy_data.data 为空或格式错误');
      return map;
    }

    for (const entry of data.data) {
      map.set(entry.id, {
        ...entry,
        skillIds: [...entry.skillIds],
        baseStats: { ...entry.baseStats },
      });
    }

    return map;
  }

  /** 从 BossDataList 构建配置映射 */
  private _buildBossMap(data: BossDataList): Map<string, BossConfig> {
    const map = new Map<string, BossConfig>();

    if (!data?.data || !Array.isArray(data.data)) {
      console.warn('[EnemyRepository] boss_data.data 为空或格式错误');
      return map;
    }

    for (const entry of data.data) {
      map.set(entry.id, {
        ...entry,
        skillIds: [...entry.skillIds],
        baseStats: { ...entry.baseStats },
        dungeonRefs: [...entry.dungeonRefs],
      });
    }

    return map;
  }
}
