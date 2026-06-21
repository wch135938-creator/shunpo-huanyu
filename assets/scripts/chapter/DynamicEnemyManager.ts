// ============================================================
// DynamicEnemyManager — Phase10-Step3 动态敌人管理器
// 职责：生成动态敌人 / 计算倍率 / 生成战斗敌人快照
// 边界：只读取配置，输出 DynamicEnemySnapshot（供 BattleUnitFactory 消费）
//       不修改 BattleSystem / EnemySystem / FormationSystem
// ============================================================

import { BaseSystem } from '../core/BaseSystem';
import { ConfigManager } from '../core/ConfigManager';
import { DynamicEnemyRepository } from './DynamicEnemyRepository';
import { StageExtensionRepository } from './StageExtensionRepository';
import type { DynamicEnemySnapshot } from './ChapterEventTypes';

// ==================== 新 enemy_data.json 格式的轻量类型 ====================

/** 基础敌人属性（嵌套在 baseStats 中） */
interface EnemyBaseStats {
  hp: number;
  atk: number;
  def: number;
  speed: number;
  critRate?: number;
  critDamage?: number;
}

/** 新 enemy_data.json 的单条敌人（使用 baseStats 嵌套） */
interface EnemyDataEntryV2 {
  id: string;
  name: string;
  element: string;
  faction: string;
  quality: string;
  level: number;
  baseStats: EnemyBaseStats;
  skillIds: string[];
  dropGroup: string;
}

/** 新 enemy_data.json 的顶层结构 */
interface EnemyDataConfigV2 {
  version: number | string;
  name: string;
  data: EnemyDataEntryV2[];
}

/** 计算后的敌方属性 */
export interface CalculatedEnemyStats {
  hp: number;
  attack: number;
  defense: number;
  speed: number;
  level: number;
}

// ==================== 配置路径常量 ====================

/** 新 enemy_data.json 配置路径（不含扩展名） */
const ENEMY_DATA_PATH = `${ConfigManager.CONFIG_ROOT}/enemies/enemy_data`;

export class DynamicEnemyManager extends BaseSystem {

  // ==================== 单例 ====================

  static getInstance(): DynamicEnemyManager {
    return super.getInstance<DynamicEnemyManager>();
  }

  // ==================== 内部状态 ====================

  /** 基础敌人缓存：enemyId → EnemyDataEntryV2 */
  private _baseEnemyMap: Map<string, EnemyDataEntryV2> = new Map();

  /** 是否已初始化 */
  private _initialized = false;

  // ==================== 生命周期 ====================

  /**
   * 初始化 DynamicEnemyManager。
   *
   * 加载 enemy_data.json 和 dynamic_enemy_config.json。
   *
   * @returns 初始化是否成功
   */
  async initialize(): Promise<boolean> {
    if (this._initialized) {
      console.warn('[DynamicEnemyManager] 已初始化，跳过重复 initialize');
      return true;
    }

    // 加载基础敌人数据
    const configManager = ConfigManager.getInstance();
    try {
      const enemyData = await configManager.loadConfig<EnemyDataConfigV2>(ENEMY_DATA_PATH);
      this._buildBaseEnemyMap(enemyData);
    } catch (e) {
      console.error(`[DynamicEnemyManager] 加载 enemy_data.json 失败: ${e}`);
      return false;
    }

    // 加载动态敌人配置
    const dynRepo = DynamicEnemyRepository.getInstance();
    if (!dynRepo.isLoaded()) {
      await dynRepo.load();
    }

    // 确保 StageExtensionRepository 也已加载
    const extRepo = StageExtensionRepository.getInstance();
    if (!extRepo.isLoaded()) {
      await extRepo.load();
    }

    this._initialized = true;
    console.log(
      `[DynamicEnemyManager] 初始化完成，` +
      `基础敌人 ${this._baseEnemyMap.size} 个，` +
      `动态敌人 ${dynRepo.getCount()} 个`,
    );
    return true;
  }

  // ==================== 敌人生成 ====================

  /**
   * 根据动态敌人 ID 构建敌人快照。
   *
   * 流程：
   * 1. 从 DynamicEnemyRepository 获取动态敌人配置（含倍率）
   * 2. 从基础敌人 Map 获取基础敌人数据
   * 3. 应用倍率计算最终属性
   * 4. 生成 DynamicEnemySnapshot
   *
   * @param dynamicEnemyId  动态敌人配置 ID
   * @returns               DynamicEnemySnapshot，失败时返回 null
   */
  buildEnemy(dynamicEnemyId: string): DynamicEnemySnapshot | null {
    this._requireInitialized();

    const dynRepo = DynamicEnemyRepository.getInstance();
    const dynConfig = dynRepo.getEnemy(dynamicEnemyId);
    if (!dynConfig) {
      console.error(
        `[DynamicEnemyManager] buildEnemy: 动态敌人配置不存在 id=${dynamicEnemyId}`,
      );
      return null;
    }

    const baseEnemy = this._baseEnemyMap.get(dynConfig.baseEnemyId);
    if (!baseEnemy) {
      console.error(
        `[DynamicEnemyManager] buildEnemy: 基础敌人不存在 baseEnemyId=${dynConfig.baseEnemyId}`,
      );
      return null;
    }

    const stats = this.calculateEnemyStats(
      baseEnemy.baseStats,
      baseEnemy.level,
      {
        hpMultiplier: dynConfig.hpMultiplier,
        atkMultiplier: dynConfig.atkMultiplier,
        defMultiplier: dynConfig.defMultiplier,
        speedMultiplier: dynConfig.speedMultiplier,
        levelBonus: dynConfig.levelBonus,
      },
    );

    const enemyType = this._determineEnemyType(baseEnemy.quality);

    return {
      dynamicEnemyId: dynConfig.id,
      baseEnemyId: baseEnemy.id,
      name: `${baseEnemy.name}${dynConfig.nameSuffix}`,
      enemyType,
      faction: baseEnemy.faction,
      element: baseEnemy.element,
      level: stats.level,
      hp: stats.hp,
      attack: stats.attack,
      defense: stats.defense,
      speed: stats.speed,
      skillIds: [...baseEnemy.skillIds],
      dropId: dynConfig.dropGroupOverride || baseEnemy.dropGroup,
      isBoss: enemyType === 'boss',
    };
  }

  /**
   * 根据关卡 ID 构建该关卡所有动态敌人快照。
   *
   * 流程：
   * 1. 从 StageExtensionRepository 获取该关卡的 enemyPool
   * 2. 遍历 enemyPool 中的每个动态敌人 ID
   * 3. 依次调用 buildEnemy()
   *
   * @param stageId  关卡 ID
   * @returns        动态敌人快照数组
   */
  buildEnemyByStage(stageId: string): DynamicEnemySnapshot[] {
    this._requireInitialized();

    const extRepo = StageExtensionRepository.getInstance();
    const extension = extRepo.getStageExtension(stageId);
    if (!extension || extension.enemyPool.length === 0) {
      console.log(
        `[DynamicEnemyManager] buildEnemyByStage: 关卡 ${stageId} 无动态敌人池`,
      );
      return [];
    }

    const snapshots: DynamicEnemySnapshot[] = [];

    for (const enemyId of extension.enemyPool) {
      const snapshot = this.buildEnemy(enemyId);
      if (snapshot) {
        snapshots.push(snapshot);
      }
    }

    return snapshots;
  }

  // ==================== 属性计算 ====================

  /**
   * 根据基础属性与倍率计算最终敌人属性。
   *
   * 公式：
   * - hp      = Math.round(baseStats.hp  × hpMultiplier)
   * - attack  = Math.round(baseStats.atk × atkMultiplier)
   * - defense = Math.round(baseStats.def × defMultiplier)
   * - speed   = Math.round(baseStats.speed × speedMultiplier)
   * - level   = baseLevel + levelBonus
   *
   * @param baseStats    基础敌人属性
   * @param baseLevel    基础敌人等级
   * @param multipliers  各属性倍率
   * @returns           计算后的属性
   */
  calculateEnemyStats(
    baseStats: EnemyBaseStats,
    baseLevel: number,
    multipliers: {
      hpMultiplier: number;
      atkMultiplier: number;
      defMultiplier: number;
      speedMultiplier: number;
      levelBonus: number;
    },
  ): CalculatedEnemyStats {
    return {
      hp: Math.round(baseStats.hp * multipliers.hpMultiplier),
      attack: Math.round(baseStats.atk * multipliers.atkMultiplier),
      defense: Math.round(baseStats.def * multipliers.defMultiplier),
      speed: Math.round(baseStats.speed * multipliers.speedMultiplier),
      level: baseLevel + multipliers.levelBonus,
    };
  }

  // ==================== 查询 ====================

  /**
   * 获取基础敌人数据。
   *
   * @param enemyId  基础敌人 ID
   * @returns        基础敌人数据，不存在时返回 null
   */
  getBaseEnemy(enemyId: string): EnemyDataEntryV2 | null {
    return this._baseEnemyMap.get(enemyId) ?? null;
  }

  /**
   * 获取基础敌人缓存数量。
   */
  getBaseEnemyCount(): number {
    return this._baseEnemyMap.size;
  }

  /**
   * 判断是否已初始化。
   */
  isInitialized(): boolean {
    return this._initialized;
  }

  /**
   * 清空运行时数据（调试用）。
   */
  clearData(): void {
    this._baseEnemyMap.clear();
    this._initialized = false;
  }

  // ==================== 内部方法 ====================

  /** 从 EnemyDataConfigV2 构建基础敌人映射 */
  private _buildBaseEnemyMap(data: EnemyDataConfigV2): void {
    const map = new Map<string, EnemyDataEntryV2>();

    if (!data || !data.data || !Array.isArray(data.data)) {
      console.warn('[DynamicEnemyManager] enemy_data.json 数据为空');
      this._baseEnemyMap = map;
      return;
    }

    for (const entry of data.data) {
      map.set(entry.id, {
        id: entry.id,
        name: entry.name,
        element: entry.element,
        faction: entry.faction,
        quality: entry.quality,
        level: entry.level,
        baseStats: {
          hp: entry.baseStats.hp,
          atk: entry.baseStats.atk,
          def: entry.baseStats.def,
          speed: entry.baseStats.speed,
          critRate: entry.baseStats.critRate,
          critDamage: entry.baseStats.critDamage,
        },
        skillIds: [...entry.skillIds],
        dropGroup: entry.dropGroup,
      });
    }

    this._baseEnemyMap = map;
  }

  /** 根据 quality 字符串确定敌人类型 */
  private _determineEnemyType(quality: string): 'normal' | 'elite' | 'boss' {
    switch (quality) {
      case 'boss':
        return 'boss';
      case 'elite':
        return 'elite';
      default:
        return 'normal';
    }
  }

  /** 确保已初始化 */
  private _requireInitialized(): void {
    if (!this._initialized) {
      throw new Error('[DynamicEnemyManager] 未初始化，请先调用 initialize()');
    }
  }
}
