// ============================================================
// EnemySystem — Phase9 敌人管理系统
// 职责：敌人配置管理 / 敌人组装 / Boss 查询 / EnemySnapshot 生成
// 边界：不修改 BattleSystem / DungeonSystem / DropSystem / Roguelike
//       UI Prefab 零依赖
// 参考：HeroSystem (hero/ 层)
// ============================================================

import { BaseSystem } from '../core/BaseSystem';
import { EventManager } from '../core/EventManager';
import { EnemyRepository } from './EnemyRepository';
import type {
  EnemyConfig,
  EnemyGroupConfig,
  BossConfig,
  EnemySnapshot,
  EnemyQuality,
} from './EnemyTypes';
import type { Element } from '../config/enemy_config';
import type { Faction } from '../config/hero_config';

// ==================== 事件数据接口 ====================

/** 敌人配置加载完成事件数据 */
export interface EnemyLoadedEventData {
  count: number;
}

/** Boss 配置加载完成事件数据 */
export interface BossLoadedEventData {
  count: number;
}

/** 敌人快照生成事件数据 */
export interface EnemySnapshotGeneratedEventData {
  enemyId: string;
  snapshot: EnemySnapshot;
}

export class EnemySystem extends BaseSystem {

  // ==================== 事件常量 ====================

  static readonly ENEMY_LOADED = 'enemy:loaded';
  static readonly BOSS_LOADED = 'boss:loaded';
  static readonly ENEMY_SNAPSHOT_GENERATED = 'enemy:snapshotGenerated';

  // ==================== 内部状态 ====================

  /** 是否已初始化 */
  private _initialized = false;

  // ==================== 生命周期 ====================

  /**
   * 初始化 EnemySystem。
   *
   * 流程：
   * 1. 确保 EnemyRepository 配置已加载
   *
   * @returns 初始化是否成功
   */
  async initialize(): Promise<boolean> {
    if (this._initialized) {
      console.warn('[EnemySystem] 已初始化，跳过重复 initialize');
      return true;
    }

    const repository = EnemyRepository.getInstance();
    if (!repository.isLoaded()) {
      await repository.loadAllConfigs();
    }

    this._initialized = true;
    console.log(
      `[EnemySystem] 初始化完成（敌人: ${repository.getEnemyCount()}, Boss: ${repository.getBossCount()}）`,
    );
    return true;
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
    this._initialized = false;
  }

  // ==================== 敌人查询 ====================

  /**
   * 获取单个敌人配置。
   *
   * @param enemyId  敌人 ID
   * @returns        敌人配置，不存在时返回 null
   */
  getEnemy(enemyId: string): EnemyConfig | null {
    this._requireInitialized();
    return EnemyRepository.getInstance().getEnemy(enemyId);
  }

  /**
   * 获取所有敌人配置。
   *
   * @returns  敌人配置数组
   */
  getAllEnemies(): EnemyConfig[] {
    this._requireInitialized();
    return EnemyRepository.getInstance().getAllEnemies();
  }

  /**
   * 获取所有敌人 ID。
   *
   * @returns  敌人 ID 数组
   */
  getAllEnemyIds(): string[] {
    this._requireInitialized();
    return EnemyRepository.getInstance().getAllEnemyIds();
  }

  /**
   * 判断敌人是否存在。
   *
   * @param enemyId  敌人 ID
   */
  hasEnemy(enemyId: string): boolean {
    this._requireInitialized();
    return EnemyRepository.getInstance().hasEnemy(enemyId);
  }

  /**
   * 按品质筛选敌人。
   *
   * @param quality  敌人品质
   */
  getEnemiesByQuality(quality: EnemyQuality): EnemyConfig[] {
    this._requireInitialized();
    return EnemyRepository.getInstance().getEnemiesByQuality(quality);
  }

  /**
   * 按元素筛选敌人。
   *
   * @param element  元素属性
   */
  getEnemiesByElement(element: Element): EnemyConfig[] {
    this._requireInitialized();
    return EnemyRepository.getInstance().getEnemiesByElement(element);
  }

  /**
   * 获取敌人数量。
   */
  getEnemyCount(): number {
    return EnemyRepository.getInstance().getEnemyCount();
  }

  // ==================== 敌人组查询 ====================

  /**
   * 获取敌人组（按 enemyIds 组装）。
   *
   * @param enemyIds  敌人 ID 数组
   * @returns         匹配的敌人配置数组
   */
  getEnemyGroup(enemyIds: string[]): EnemyConfig[] {
    this._requireInitialized();
    return EnemyRepository.getInstance().getEnemyGroup(enemyIds);
  }

  /**
   * 获取敌人组配置（带阵型信息）。
   *
   * @param enemyIds           敌人 ID 数组
   * @param formation          阵型数组（5 个位置，-1 表示空位）
   * @param groupName          组名称（可选）
   * @returns                  EnemyGroupConfig
   */
  getEnemyGroupConfig(
    enemyIds: string[],
    formation: number[],
    groupName?: string,
  ): EnemyGroupConfig {
    this._requireInitialized();

    // 确保配置中存在这些敌人
    const validEnemyIds: string[] = [];
    for (const eid of enemyIds) {
      if (EnemyRepository.getInstance().hasEnemy(eid)) {
        validEnemyIds.push(eid);
      } else {
        console.warn(
          `[EnemySystem] getEnemyGroupConfig: 敌人不存在 enemyId=${eid}，已跳过`,
        );
      }
    }

    // 补齐 formation 数组到 5 个元素
    const safeFormation = formation.slice(0, 5);
    while (safeFormation.length < 5) {
      safeFormation.push(-1);
    }

    return {
      id: `group_${Date.now()}`,
      name: groupName ?? `enemy_group_${enemyIds.join('_')}`,
      enemyIds: validEnemyIds,
      formation: safeFormation,
    };
  }

  // ==================== Boss 查询 ====================

  /**
   * 获取单个 Boss 配置。
   *
   * @param bossId  Boss ID
   * @returns       Boss 配置，不存在时返回 null
   */
  getBoss(bossId: string): BossConfig | null {
    this._requireInitialized();
    return EnemyRepository.getInstance().getBoss(bossId);
  }

  /**
   * 获取所有 Boss 配置。
   *
   * @returns  Boss 配置数组
   */
  getAllBosses(): BossConfig[] {
    this._requireInitialized();
    return EnemyRepository.getInstance().getAllBosses();
  }

  /**
   * 获取所有 Boss ID。
   */
  getAllBossIds(): string[] {
    this._requireInitialized();
    return EnemyRepository.getInstance().getAllBossIds();
  }

  /**
   * 判断 Boss 是否存在。
   *
   * @param bossId  Boss ID
   */
  hasBoss(bossId: string): boolean {
    this._requireInitialized();
    return EnemyRepository.getInstance().hasBoss(bossId);
  }

  /**
   * 按地牢引用查询 Boss。
   *
   * @param dungeonRef  地牢/章节 ID
   */
  getBossesByDungeon(dungeonRef: string): BossConfig[] {
    this._requireInitialized();
    return EnemyRepository.getInstance().getBossesByDungeon(dungeonRef);
  }

  /**
   * 获取 Boss 数量。
   */
  getBossCount(): number {
    return EnemyRepository.getInstance().getBossCount();
  }

  // ==================== 快照生成 ====================

  /**
   * 从 EnemyConfig 生成 EnemySnapshot。
   *
   * 快照包含战斗系统所需的所有信息，可序列化。
   *
   * @param enemy  敌人配置
   * @returns      敌人快照
   */
  generateEnemySnapshot(enemy: EnemyConfig): EnemySnapshot {
    const snapshot: EnemySnapshot = {
      enemyId: enemy.id,
      name: enemy.name,
      element: enemy.element,
      faction: enemy.faction,
      quality: enemy.quality,
      level: enemy.level,
      baseStats: { ...enemy.baseStats },
      skillIds: [...enemy.skillIds],
      dropGroup: enemy.dropGroup,
      capturedAt: Date.now(),
    };

    EventManager.getInstance().emit(EnemySystem.ENEMY_SNAPSHOT_GENERATED, {
      enemyId: enemy.id,
      snapshot,
    } as EnemySnapshotGeneratedEventData);

    return snapshot;
  }

  /**
   * 从 BossConfig 生成 EnemySnapshot（Boss 级别快照）。
   *
   * @param boss  Boss 配置
   * @returns     敌人快照（quality = 'boss'）
   */
  generateBossSnapshot(boss: BossConfig): EnemySnapshot {
    const snapshot: EnemySnapshot = {
      enemyId: boss.id,
      name: boss.name,
      element: boss.element,
      faction: boss.faction,
      quality: 'boss',
      level: boss.level,
      baseStats: { ...boss.baseStats },
      skillIds: [...boss.skillIds],
      dropGroup: boss.dropGroup,
      capturedAt: Date.now(),
    };

    EventManager.getInstance().emit(EnemySystem.ENEMY_SNAPSHOT_GENERATED, {
      enemyId: boss.id,
      snapshot,
    } as EnemySnapshotGeneratedEventData);

    return snapshot;
  }

  /**
   * 根据 enemyId 生成 EnemySnapshot。
   *
   * 自动处理普通怪/精英怪和 Boss：
   *  - 先在 enemy 配置中查找，找到则生成普通快照
   *  - 再在 boss 配置中查找，找到则生成 Boss 快照
   *  - 都找不到返回 null
   *
   * @param id  敌人 ID 或 Boss ID
   * @returns  敌人快照，不存在时返回 null
   */
  generateById(id: string): EnemySnapshot | null {
    this._requireInitialized();

    const repository = EnemyRepository.getInstance();

    // 1. 尝试作为普通敌人查找
    const enemy = repository.getEnemy(id);
    if (enemy) {
      return this.generateEnemySnapshot(enemy);
    }

    // 2. 尝试作为 Boss 查找
    const boss = repository.getBoss(id);
    if (boss) {
      return this.generateBossSnapshot(boss);
    }

    console.warn(`[EnemySystem] generateById: 敌人/Boss 不存在 id=${id}`);
    return null;
  }

  /**
   * 批量生成多个敌人快照。
   *
   * @param ids  敌人 ID 数组（可混用 enemyId 和 bossId）
   * @returns    敌人快照数组（不含 null）
   */
  generateSnapshots(ids: string[]): EnemySnapshot[] {
    const snapshots: EnemySnapshot[] = [];
    for (const id of ids) {
      const snapshot = this.generateById(id);
      if (snapshot) {
        snapshots.push(snapshot);
      }
    }
    return snapshots;
  }

  /**
   * 获取所有敌人（含 Boss）的快照。
   *
   * @returns  所有敌人快照数组
   */
  generateAllSnapshots(): EnemySnapshot[] {
    this._requireInitialized();

    const repository = EnemyRepository.getInstance();
    const snapshots: EnemySnapshot[] = [];

    for (const enemy of repository.getAllEnemies()) {
      snapshots.push(this.generateEnemySnapshot(enemy));
    }

    for (const boss of repository.getAllBosses()) {
      snapshots.push(this.generateBossSnapshot(boss));
    }

    return snapshots;
  }

  /**
   * 根据品质筛选生成快照。
   *
   * @param quality  敌人品质
   */
  generateSnapshotsByQuality(quality: EnemyQuality): EnemySnapshot[] {
    const fromEnemies = EnemyRepository.getInstance()
      .getEnemiesByQuality(quality)
      .map((e) => this.generateEnemySnapshot(e));

    // boss 品质的快照从 Boss 配置生成
    const fromBosses =
      quality === 'boss'
        ? EnemyRepository.getInstance()
            .getAllBosses()
            .map((b) => this.generateBossSnapshot(b))
        : [];

    return [...fromEnemies, ...fromBosses];
  }

  // ==================== 关卡组装 ====================

  /**
   * 为指定关卡组装敌人组。
   *
   * 根据关卡配置的 enemyIds + formation 生成 EnemyGroupConfig。
   * 供 ChapterSystem / DungeonSystem 调用。
   *
   * @param enemyIds   敌人 ID 列表
   * @param formation  阵型（5 位置，-1=空）
   * @returns          EnemyGroupConfig
   */
  assembleEnemyGroupForStage(
    enemyIds: string[],
    formation: number[],
  ): EnemyGroupConfig {
    return this.getEnemyGroupConfig(enemyIds, formation);
  }

  // ==================== 内部方法 ====================

  /** 确保已初始化 */
  private _requireInitialized(): void {
    if (!this._initialized) {
      throw new Error('[EnemySystem] 未初始化，请先调用 initialize()');
    }
  }
}
