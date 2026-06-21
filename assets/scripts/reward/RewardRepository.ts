// ============================================================
// RewardRepository.ts — 奖励配置仓库
// 职责：加载/缓存/查询 chapter_reward / event_reward / enemy_reward 配置
// 位置：reward/ 层
// 依赖：ConfigManager, RewardTypes
// 规范：零 any / 所有查询走缓存 / 缺失返回 null
// ============================================================

import { BaseManager } from '../core/BaseManager';
import { ConfigManager } from '../core/ConfigManager';
import type {
  ChapterRewardConfig,
  ChapterRewardEntry,
  EventRewardConfig,
  EventRewardEntry,
  EnemyRewardConfig,
  EnemyRewardEntry,
} from './RewardTypes';

// ==================== 配置路径常量 ====================

const CHAPTER_REWARD_PATH = 'config/reward/chapter_reward_config';
const EVENT_REWARD_PATH = 'config/reward/event_reward_config';
const ENEMY_REWARD_PATH = 'config/reward/enemy_reward_config';

const ALL_REWARD_PATHS = [CHAPTER_REWARD_PATH, EVENT_REWARD_PATH, ENEMY_REWARD_PATH];

// ==================== RewardRepository ====================

export class RewardRepository extends BaseManager {
  // ===== 单例 =====

  static getInstance(): RewardRepository {
    return super.getInstance<RewardRepository>();
  }

  // ===== 依赖 =====

  private _configManager: ConfigManager;

  // ===== 内部状态 =====

  private _chapterRewards: Map<string, ChapterRewardEntry> = new Map();
  private _eventRewards: Map<string, EventRewardEntry> = new Map();
  private _enemyRewards: Map<string, EnemyRewardEntry> = new Map();
  private _loaded: boolean = false;

  // ===== 构造 =====

  constructor() {
    super();
    this._configManager = ConfigManager.getInstance();
  }

  // ================================================================
  // 公共接口
  // ================================================================

  // ===== 加载 =====

  /**
   * 加载所有奖励配置（幂等 — 已加载时直接返回）
   *
   * @returns Promise<void>
   */
  async load(): Promise<void> {
    if (this._loaded) return;

    try {
      await this._configManager.loadConfigs(ALL_REWARD_PATHS);
      this._buildCaches();
      this._loaded = true;
      console.log(
        `[RewardRepository] 配置加载完成: 章节=${this._chapterRewards.size}, ` +
        `事件=${this._eventRewards.size}, 敌人=${this._enemyRewards.size}`,
      );
    } catch (err) {
      console.error('[RewardRepository] load() 失败:', err);
      throw err;
    }
  }

  /** 是否已加载 */
  isLoaded(): boolean {
    return this._loaded;
  }

  // ===== 章节奖励查询 =====

  /**
   * 根据章节 ID 查询章节奖励配置
   *
   * @param chapterId — 章节 ID
   * @returns 章节奖励配置条目，未找到时返回 null
   */
  getChapterReward(chapterId: string): ChapterRewardEntry | null {
    return this._chapterRewards.get(chapterId) ?? null;
  }

  /** 获取所有章节奖励配置 */
  getAllChapterRewards(): ChapterRewardEntry[] {
    return Array.from(this._chapterRewards.values());
  }

  /** 章节奖励数量 */
  getChapterRewardCount(): number {
    return this._chapterRewards.size;
  }

  // ===== 事件奖励查询 =====

  /**
   * 根据事件 ID 查询事件奖励配置
   *
   * @param eventId — 事件 ID
   * @returns 事件奖励配置条目，未找到时返回 null
   */
  getEventReward(eventId: string): EventRewardEntry | null {
    return this._eventRewards.get(eventId) ?? null;
  }

  /** 获取所有事件奖励配置 */
  getAllEventRewards(): EventRewardEntry[] {
    return Array.from(this._eventRewards.values());
  }

  /** 事件奖励数量 */
  getEventRewardCount(): number {
    return this._eventRewards.size;
  }

  // ===== 敌人奖励查询 =====

  /**
   * 根据动态敌人 ID 查询敌人奖励配置
   *
   * @param enemyId — 动态敌人 ID
   * @returns 敌人奖励配置条目，未找到时返回 null
   */
  getEnemyReward(enemyId: string): EnemyRewardEntry | null {
    return this._enemyRewards.get(enemyId) ?? null;
  }

  /** 获取所有敌人奖励配置 */
  getAllEnemyRewards(): EnemyRewardEntry[] {
    return Array.from(this._enemyRewards.values());
  }

  /** 敌人奖励数量 */
  getEnemyRewardCount(): number {
    return this._enemyRewards.size;
  }

  // ================================================================
  // 内部 — 缓存构建
  // ================================================================

  private _buildCaches(): void {
    // 章节奖励
    const chapterCfg = this._configManager.getConfig<ChapterRewardConfig>(CHAPTER_REWARD_PATH);
    if (chapterCfg?.rewards) {
      for (const entry of chapterCfg.rewards) {
        this._chapterRewards.set(entry.chapterId, entry);
      }
    }

    // 事件奖励
    const eventCfg = this._configManager.getConfig<EventRewardConfig>(EVENT_REWARD_PATH);
    if (eventCfg?.rewards) {
      for (const entry of eventCfg.rewards) {
        this._eventRewards.set(entry.eventId, entry);
      }
    }

    // 敌人奖励
    const enemyCfg = this._configManager.getConfig<EnemyRewardConfig>(ENEMY_REWARD_PATH);
    if (enemyCfg?.rewards) {
      for (const entry of enemyCfg.rewards) {
        this._enemyRewards.set(entry.enemyId, entry);
      }
    }
  }
}
