// ============================================================
// AnalyticsSystem — Phase9-Step10 本地埋点系统
// 职责：事件记录 / 会话统计 / 本地缓存 / 快照生成
// 位置：analytics/ 层
// 边界：
//   · 不修改 BattleSystem / HeroSystem / SkillSystem / FormationSystem / SaveManager 核心逻辑
//   · 仅读取 SaveManager 提供的 analytics 读写接口
//   · 通过 EventManager 监听外部事件实现自动统计
// 规范：零 any / 所有数值走配置 / 遵循 BaseManager 模式
// ============================================================

import { BaseManager } from '../core/BaseManager';
import { EventManager } from '../core/EventManager';
import {
  AnalyticsEventType,
  createDefaultAnalyticsEvent,
  createDefaultAnalyticsSession,
  createEmptyAnalyticsSnapshot,
} from './AnalyticsTypes';
import type {
  AnalyticsEvent,
  AnalyticsSession,
  AnalyticsSnapshot,
  AnalyticsSystemConfig,
} from './AnalyticsTypes';
import { createDefaultAnalyticsSystemConfig } from './AnalyticsTypes';
import type { AnalyticsSaveData } from './AnalyticsSaveData';
import { createDefaultAnalyticsSaveData } from './AnalyticsSaveData';
import { BattleEvent } from '../battle/BattleSystem';
import type { BattleEndedEvent } from '../battle/BattleSystem';
import { BattleResultType } from '../battle/BattleTypes';
import { ChapterSystem } from '../chapter/ChapterSystem';
import { TutorialSystem } from '../tutorial/TutorialSystem';

// ==================== AnalyticsSystem ====================

export class AnalyticsSystem extends BaseManager {

  // ==================== 内部状态 ====================

  /** 系统配置 */
  private _config: AnalyticsSystemConfig = createDefaultAnalyticsSystemConfig();

  /** 当前会话 */
  private _currentSession: AnalyticsSession | null = null;

  /** 内存事件缓存 */
  private _events: AnalyticsEvent[] = [];

  /** 持久化统计数据 */
  private _saveData: AnalyticsSaveData = createDefaultAnalyticsSaveData();

  /** 是否已初始化 */
  private _initialized = false;

  /** 是否已启用存档集成 */
  private _saveEnabled = false;

  /** 保存回调（由外部注入，避免循环依赖） */
  private _onSave: (() => void) | null = null;

  /** 已注册的事件监听回调引用（用于 destroy 时清理） */
  private _battleEndedHandler: ((payload: BattleEndedEvent) => void) | null = null;
  private _battleStartedHandler: ((payload: unknown) => void) | null = null;
  private _chapterCompletedHandler: ((payload: unknown) => void) | null = null;
  private _tutorialCompletedHandler: ((payload: unknown) => void) | null = null;

  // ==================== 生命周期 ====================

  /**
   * 初始化分析系统。
   *
   * 流程：
   * 1. 应用配置
   * 2. 从存档恢复累计数据（如有）
   * 3. 创建新会话
   * 4. 注册自动事件监听
   * 5. 发射 GAME_START 事件
   *
   * @param config  可选的配置覆盖
   * @returns       初始化是否成功
   */
  initialize(config?: Partial<AnalyticsSystemConfig>): boolean {
    if (this._initialized) {
      console.warn('[AnalyticsSystem] 已初始化，跳过重复 initialize');
      return true;
    }

    // Step 1: 合并配置
    if (config) {
      this._config = { ...this._config, ...config };
    }

    // Step 2: 如果未从外部 restore，使用默认保存数据
    if (!this._saveData || this._saveData.totalSessions === 0 && this._saveData.recentSessions.length === 0) {
      // 保持已 restore 的数据不变
    }

    // Step 3: 创建新会话
    this._currentSession = createDefaultAnalyticsSession();
    this._saveData.totalSessions += 1;

    // Step 4: 注册自动事件监听
    if (this._config.autoListenEnabled) {
      this._registerAutoListeners();
    }

    // Step 5: 发射 GAME_START 事件
    const event = createDefaultAnalyticsEvent(
      AnalyticsEventType.GAME_START,
      this._currentSession.sessionId,
    );
    this._addEvent(event);

    this._initialized = true;

    console.log(
      `[AnalyticsSystem] 初始化完成, sessionId=${this._currentSession.sessionId}, ` +
      `totalSessions=${this._saveData.totalSessions}`,
    );

    return true;
  }

  /**
   * 销毁分析系统。
   *
   * 流程：
   * 1. 发射 GAME_EXIT 事件
   * 2. 结束当前会话
   * 3. 注销所有事件监听
   * 4. 触发存档落盘
   */
  destroy(): void {
    if (!this._initialized) return;

    // Step 1: 发射 GAME_EXIT 事件
    if (this._currentSession) {
      const event = createDefaultAnalyticsEvent(
        AnalyticsEventType.GAME_EXIT,
        this._currentSession.sessionId,
      );
      this._addEvent(event);
    }

    // Step 2: 结束当前会话
    this._endCurrentSession();

    // Step 3: 注销事件监听
    this._unregisterAutoListeners();

    // Step 4: 触发存档
    this._triggerSave();

    this._initialized = false;

    console.log('[AnalyticsSystem] 已销毁');
  }

  // ==================== 事件追踪 ====================

  /**
   * 追踪一个自定义或指定类型的事件。
   *
   * @param type  事件类型
   * @param data  事件负载
   * @returns     创建的 AnalyticsEvent
   */
  trackEvent(
    type: AnalyticsEventType,
    data?: Record<string, unknown>,
  ): AnalyticsEvent {
    if (!this._initialized) {
      console.warn('[AnalyticsSystem] trackEvent 失败：未初始化');
      return createDefaultAnalyticsEvent(type, '', data);
    }

    const sessionId = this._currentSession?.sessionId ?? '';
    const event = createDefaultAnalyticsEvent(type, sessionId, data);
    this._addEvent(event);

    // 特殊事件处理：game_exit 需要结束会话
    if (type === AnalyticsEventType.GAME_EXIT) {
      this._endCurrentSession();
      this._triggerSave();
    }

    return event;
  }

  /**
   * 追踪战斗相关事件。
   *
   * @param type        AnalyticsEventType.BATTLE_START 或 BATTLE_END
   * @param stageId     关卡 ID
   * @param resultType  终局类型（BATTLE_END 时有效）
   * @param elapsedMs   战斗耗时（ms）
   * @param round       总回合数
   * @param isVictory   是否胜利
   * @param killedCount 击杀敌人数量
   */
  trackBattle(params: {
    type: AnalyticsEventType.BATTLE_START | AnalyticsEventType.BATTLE_END;
    stageId: string;
    resultType?: string;
    elapsedMs?: number;
    round?: number;
    isVictory?: boolean;
    killedCount?: number;
  }): AnalyticsEvent {
    const data: Record<string, unknown> = {
      stageId: params.stageId,
    };

    if (params.type === AnalyticsEventType.BATTLE_END) {
      data.resultType = params.resultType ?? '';
      data.elapsedMs = params.elapsedMs ?? 0;
      data.round = params.round ?? 0;
      data.isVictory = params.isVictory ?? false;
      data.killedCount = params.killedCount ?? 0;

      // 更新会话统计数据
      if (this._currentSession) {
        this._currentSession.battleCount += 1;
        if (params.isVictory) {
          this._currentSession.battlesWon += 1;
        }
      }

      // 更新累计统计数据
      this._saveData.totalBattles += 1;
      if (params.isVictory) {
        this._saveData.totalBattlesWon += 1;
      }
    }

    return this.trackEvent(params.type, data);
  }

  /**
   * 追踪章节完成事件。
   *
   * @param chapterId    章节 ID
   * @param chapterIndex 章节序号
   */
  trackChapter(chapterId: string, chapterIndex: number): AnalyticsEvent {
    const event = this.trackEvent(AnalyticsEventType.CHAPTER_COMPLETE, {
      chapterId,
      chapterIndex,
    });

    // 更新统计数据
    if (this._currentSession) {
      this._currentSession.chaptersCompleted += 1;
    }
    this._saveData.totalChaptersCompleted += 1;

    return event;
  }

  /**
   * 追踪地牢完成事件。
   *
   * @param dungeonId  地牢 ID
   * @param completed   是否完成
   * @param floorCount  通过层数
   */
  trackDungeon(
    dungeonId: string,
    completed: boolean,
    floorCount?: number,
  ): AnalyticsEvent {
    const event = this.trackEvent(AnalyticsEventType.DUNGEON_COMPLETE, {
      dungeonId,
      completed,
      floorCount: floorCount ?? 0,
    });

    if (completed) {
      if (this._currentSession) {
        this._currentSession.dungeonsCompleted += 1;
      }
      this._saveData.totalDungeonsCompleted += 1;
    }

    return event;
  }

  /**
   * 追踪广告观看事件。
   *
   * @param adType     广告类型（如 'rewarded' / 'interstitial'）
   * @param rewardType 奖励类型描述
   */
  trackAd(adType: string, rewardType?: string): AnalyticsEvent {
    const event = this.trackEvent(AnalyticsEventType.AD_WATCH, {
      adType,
      rewardType: rewardType ?? '',
    });

    if (this._currentSession) {
      this._currentSession.adsWatched += 1;
    }
    this._saveData.totalAdsWatched += 1;

    return event;
  }

  /**
   * 追踪新手引导完成事件。
   *
   * @param groupId 完成的引导组 ID
   */
  trackTutorial(groupId: string): AnalyticsEvent {
    return this.trackEvent(AnalyticsEventType.TUTORIAL_COMPLETE, {
      groupId,
    });
  }

  // ==================== 快照生成 ====================

  /**
   * 生成当前分析快照。
   *
   * 快照包含累计统计 + 当前会话 + 最近会话 + 事件类型分布。
   *
   * @returns AnalyticsSnapshot
   */
  generateSnapshot(): AnalyticsSnapshot {
    const snapshot = createEmptyAnalyticsSnapshot();

    // 累计统计
    snapshot.totalSessions = this._saveData.totalSessions;
    snapshot.totalPlayTimeMs = this._saveData.totalPlayTimeMs;
    snapshot.totalBattles = this._saveData.totalBattles;
    snapshot.totalBattlesWon = this._saveData.totalBattlesWon;
    snapshot.totalChaptersCompleted = this._saveData.totalChaptersCompleted;
    snapshot.totalDungeonsCompleted = this._saveData.totalDungeonsCompleted;
    snapshot.totalAdsWatched = this._saveData.totalAdsWatched;

    // 当前会话
    snapshot.currentSession = this._currentSession
      ? { ...this._currentSession }
      : null;

    // 最近会话
    snapshot.recentSessions = this._saveData.recentSessions.map((s) => ({ ...s }));

    // 事件类型计数
    snapshot.eventCountByType = { ...this._saveData.eventCountByType };

    // 加上内存中未统计的事件
    for (const evt of this._events) {
      const key = evt.type;
      snapshot.eventCountByType[key] = (snapshot.eventCountByType[key] ?? 0) + 1;
    }

    snapshot.generatedAt = Date.now();

    return snapshot;
  }

  // ==================== 事件缓存管理 ====================

  /**
   * 清空内存中的事件缓存。
   */
  clearEvents(): void {
    this._events = [];
  }

  /**
   * 获取内存中的事件列表（只读）。
   */
  getEvents(): ReadonlyArray<AnalyticsEvent> {
    return this._events;
  }

  /**
   * 获取当前会话（只读）。
   */
  getCurrentSession(): AnalyticsSession | null {
    return this._currentSession;
  }

  // ==================== 存档集成 ====================

  /**
   * 注册存档保存回调。
   *
   * 由 SaveManager 在 init 时调用，AnalyticsSystem 在需要落盘时通过此回调触发。
   *
   * @param onSave  保存回调
   */
  registerSaveCallback(onSave: () => void): void {
    this._onSave = onSave;
    this._saveEnabled = true;
  }

  /**
   * 从存档恢复分析数据。
   *
   * 由 SaveManager 在 init 时调用，传入已保存的 AnalyticsSaveData。
   *
   * @param data  存档中的分析数据
   */
  restore(data: AnalyticsSaveData): void {
    if (!data) return;

    this._saveData = {
      totalSessions: data.totalSessions ?? 0,
      totalPlayTimeMs: data.totalPlayTimeMs ?? 0,
      totalBattles: data.totalBattles ?? 0,
      totalBattlesWon: data.totalBattlesWon ?? 0,
      totalChaptersCompleted: data.totalChaptersCompleted ?? 0,
      totalDungeonsCompleted: data.totalDungeonsCompleted ?? 0,
      totalAdsWatched: data.totalAdsWatched ?? 0,
      recentSessions: Array.isArray(data.recentSessions)
        ? data.recentSessions.map((s) => ({ ...s }))
        : [],
      eventCountByType: data.eventCountByType
        ? { ...data.eventCountByType }
        : {},
      saveVersion: data.saveVersion ?? 1,
      updatedAt: data.updatedAt ?? Date.now(),
    };

    console.log(
      `[AnalyticsSystem] 从存档恢复, ` +
      `totalSessions=${this._saveData.totalSessions}, ` +
      `totalBattles=${this._saveData.totalBattles}`,
    );
  }

  /**
   * 获取当前可用于存档的数据。
   *
   * 由 SaveManager 在 save / autoSave 时调用。
   *
   * @returns AnalyticsSaveData
   */
  getSaveData(): AnalyticsSaveData {
    // 先同步：更新 totalPlayTimeMs
    this._syncPlayTime();

    return {
      totalSessions: this._saveData.totalSessions,
      totalPlayTimeMs: this._saveData.totalPlayTimeMs,
      totalBattles: this._saveData.totalBattles,
      totalBattlesWon: this._saveData.totalBattlesWon,
      totalChaptersCompleted: this._saveData.totalChaptersCompleted,
      totalDungeonsCompleted: this._saveData.totalDungeonsCompleted,
      totalAdsWatched: this._saveData.totalAdsWatched,
      recentSessions: this._saveData.recentSessions.map((s) => ({ ...s })),
      eventCountByType: { ...this._saveData.eventCountByType },
      saveVersion: 1,
      updatedAt: Date.now(),
    };
  }

  // ==================== 配置 ====================

  /**
   * 获取当前配置（只读）。
   */
  getConfig(): Readonly<AnalyticsSystemConfig> {
    return this._config;
  }

  /**
   * 是否已初始化。
   */
  isInitialized(): boolean {
    return this._initialized;
  }

  // ==================== 私有方法 ====================

  /**
   * 添加事件到内存缓存。
   *
   * 自动裁剪超出 maxEventBuffer 的旧事件。
   * 更新 eventCountByType 计数。
   */
  private _addEvent(event: AnalyticsEvent): void {
    this._events.push(event);

    // 裁剪超出上限的旧事件
    while (this._events.length > this._config.maxEventBuffer) {
      this._events.shift();
    }

    // 更新会话事件计数
    if (this._currentSession) {
      this._currentSession.eventCount += 1;
    }

    // 更新持久化事件类型计数
    const key = event.type;
    this._saveData.eventCountByType[key] =
      (this._saveData.eventCountByType[key] ?? 0) + 1;
  }

  /**
   * 结束当前会话。
   *
   * 计算 durationMs，将会话添加到 recentSessions。
   */
  private _endCurrentSession(): void {
    if (!this._currentSession) return;

    const session = this._currentSession;
    session.endTime = Date.now();
    session.durationMs = session.endTime - session.startTime;

    // 更新累计游玩时长
    this._saveData.totalPlayTimeMs += session.durationMs;

    // 添加到最近会话列表
    this._saveData.recentSessions.push({ ...session });

    // 裁剪最近会话列表
    while (this._saveData.recentSessions.length > this._config.maxRecentSessions) {
      this._saveData.recentSessions.shift();
    }

    this._currentSession = null;
  }

  /**
   * 同步当前会话的游玩时长到 saveData。
   */
  private _syncPlayTime(): void {
    if (!this._currentSession) return;

    const now = Date.now();
    const currentDuration = now - this._currentSession.startTime;
    this._currentSession.durationMs = currentDuration;
    this._currentSession.endTime = now;
  }

  /**
   * 触发存档保存。
   */
  private _triggerSave(): void {
    if (this._onSave) {
      this._onSave();
    }
  }

  // ==================== 自动事件监听 ====================

  /**
   * 注册自动事件监听。
   *
   * 监听 BattleSystem / ChapterSystem / TutorialSystem 发出的事件，
   * 自动生成对应的分析事件。
   */
  private _registerAutoListeners(): void {
    const em = EventManager.getInstance();

    // ---- battle:started ----
    this._battleStartedHandler = (payload: unknown) => {
      const p = payload as { stageId?: string };
      if (p && p.stageId) {
        this.trackBattle({
          type: AnalyticsEventType.BATTLE_START,
          stageId: p.stageId,
        });
      }
    };
    em.on(BattleEvent.BATTLE_STARTED, this._battleStartedHandler as (...args: unknown[]) => void);

    // ---- battle:ended ----
    this._battleEndedHandler = (payload: BattleEndedEvent) => {
      if (payload && payload.executionResult) {
        const er = payload.executionResult;
        this.trackBattle({
          type: AnalyticsEventType.BATTLE_END,
          stageId: er.stageId,
          resultType: er.resultType,
          elapsedMs: er.elapsedTimeMs,
          round: er.round,
          isVictory: er.resultType === BattleResultType.Victory,
          killedCount: er.killedEnemyIds?.length ?? 0,
        });
      }
    };
    em.on(BattleEvent.BATTLE_ENDED, this._battleEndedHandler as (...args: unknown[]) => void);

    // ---- chapter:completed ----
    this._chapterCompletedHandler = (payload: unknown) => {
      const p = payload as { chapterId?: string; chapterIndex?: number };
      if (p && p.chapterId) {
        this.trackChapter(p.chapterId, p.chapterIndex ?? 0);
      }
    };
    em.on(ChapterSystem.CHAPTER_COMPLETED, this._chapterCompletedHandler as (...args: unknown[]) => void);

    // ---- tutorial:completed ----
    this._tutorialCompletedHandler = (payload: unknown) => {
      const p = payload as { groupId?: string };
      if (p && p.groupId) {
        this.trackTutorial(p.groupId);
      }
    };
    em.on(TutorialSystem.TUTORIAL_COMPLETED, this._tutorialCompletedHandler as (...args: unknown[]) => void);
  }

  /**
   * 注销所有自动事件监听。
   */
  private _unregisterAutoListeners(): void {
    const em = EventManager.getInstance();

    if (this._battleStartedHandler) {
      em.off(BattleEvent.BATTLE_STARTED, this._battleStartedHandler as (...args: unknown[]) => void);
      this._battleStartedHandler = null;
    }
    if (this._battleEndedHandler) {
      em.off(BattleEvent.BATTLE_ENDED, this._battleEndedHandler as (...args: unknown[]) => void);
      this._battleEndedHandler = null;
    }
    if (this._chapterCompletedHandler) {
      em.off(ChapterSystem.CHAPTER_COMPLETED, this._chapterCompletedHandler as (...args: unknown[]) => void);
      this._chapterCompletedHandler = null;
    }
    if (this._tutorialCompletedHandler) {
      em.off(TutorialSystem.TUTORIAL_COMPLETED, this._tutorialCompletedHandler as (...args: unknown[]) => void);
      this._tutorialCompletedHandler = null;
    }
  }
}
