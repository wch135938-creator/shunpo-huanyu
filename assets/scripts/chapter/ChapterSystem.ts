// ============================================================
// ChapterSystem — Phase9 主线章节系统
// 职责：章节解锁 / 关卡解锁 / 关卡完成 / 进度追踪 / 快照生成
// 边界：不修改 BattleSystem / DungeonSystem / DropSystem / Roguelike / UI Prefab
//       仅读取配置与存档，发出事件
// ============================================================

import { BaseSystem } from '../core/BaseSystem';
import { EventManager } from '../core/EventManager';
import { ChapterRepository } from './ChapterRepository';
import type { ChapterSaveData } from '../save/ChapterSaveData';
import type {
  ChapterConfig,
  StageConfig,
  ChapterProgress,
  ChapterSnapshot,
} from './ChapterTypes';
import {
  createDefaultChapterProgress,
  createEmptyChapterSnapshot,
} from './ChapterTypes';

// ==================== 事件数据接口 ====================

/** 章节解锁事件数据 */
export interface ChapterUnlockedEventData {
  chapterId: string;
}

/** 关卡解锁事件数据 */
export interface StageUnlockedEventData {
  chapterId: string;
  stageId: string;
}

/** 关卡完成事件数据 */
export interface StageCompletedEventData {
  chapterId: string;
  stageId: string;
  isChapterComplete: boolean;
}

/** 章节完成事件数据 */
export interface ChapterCompletedEventData {
  chapterId: string;
}

export class ChapterSystem extends BaseSystem {

  // ==================== 事件常量 ====================

  static readonly CHAPTER_UNLOCKED = 'chapter:unlocked';
  static readonly STAGE_UNLOCKED = 'stage:unlocked';
  static readonly STAGE_COMPLETED = 'stage:completed';
  static readonly CHAPTER_COMPLETED = 'chapter:completed';

  // ==================== 内部状态 ====================

  /** 章节进度映射：chapterId → ChapterProgress */
  private _progressMap: Map<string, ChapterProgress> = new Map();

  /** 是否已初始化 */
  private _initialized = false;

  // ==================== 生命周期 ====================

  /**
   * 初始化 ChapterSystem。
   *
   * 流程：
   * 1. 确保 ChapterRepository 配置已加载
   * 2. 为所有配置中的章节创建默认进度
   * 3. 自动解锁第一个章节及其第一个关卡（无前置条件者）
   *
   * @returns 初始化是否成功
   */
  async initialize(): Promise<boolean> {
    if (this._initialized) {
      console.warn('[ChapterSystem] 已初始化，跳过重复 initialize');
      return true;
    }

    const repository = ChapterRepository.getInstance();
    if (!repository.isLoaded()) {
      await repository.loadConfig();
    }

    // 为配置中存在但尚未创建进度的章节补充默认进度
    for (const chapterId of repository.getAllChapterIds()) {
      if (!this._progressMap.has(chapterId)) {
        this._progressMap.set(chapterId, createDefaultChapterProgress(chapterId));
      }
    }

    // 自动解锁首个章节（无前置条件的第一个章节）
    const firstChapterId = this._findFirstChapterId();
    if (firstChapterId) {
      const progress = this._progressMap.get(firstChapterId);
      if (progress && progress.status === 'locked') {
        this._unlockChapterInternal(firstChapterId);
      }
    }

    this._initialized = true;
    console.log(`[ChapterSystem] 初始化完成，共 ${this._progressMap.size} 个章节`);
    return true;
  }

  /**
   * 从存档数据恢复章节进度。
   *
   * @param saveData  章节存档数据
   */
  restore(saveData: ChapterSaveData): void {
    this._requireInitialized();

    if (!saveData || !saveData.chapterProgress) {
      console.warn('[ChapterSystem] restore: saveData 为空，跳过恢复');
      return;
    }

    for (const [chapterId, progress] of Object.entries(saveData.chapterProgress)) {
      this._progressMap.set(chapterId, {
        ...progress,
        completedStageIds: [...progress.completedStageIds],
      });
    }

    console.log(
      `[ChapterSystem] 恢复完成，从存档恢复 ` +
      `${Object.keys(saveData.chapterProgress).length} 个章节进度`,
    );
  }

  /**
   * 导出当前章节存档数据。
   *
   * @returns  当前完整的章节存档数据
   */
  save(): ChapterSaveData {
    const chapterProgress: Record<string, ChapterProgress> = {};

    for (const [chapterId, progress] of this._progressMap.entries()) {
      chapterProgress[chapterId] = {
        ...progress,
        completedStageIds: [...progress.completedStageIds],
      };
    }

    return {
      chapterProgress,
      currentChapterId: this._findCurrentChapterId(),
      saveVersion: 1,
      updatedAt: Date.now(),
    };
  }

  // ==================== 章节解锁 ====================

  /**
   * 解锁指定章节。
   *
   * 校验：
   * 1. 章节配置存在
   * 2. 章节未解锁
   * 3. 前置章节已完成（如有）
   * 4. 玩家等级满足（由调用方保证）
   *
   * @param chapterId  章节 ID
   * @returns          是否成功解锁
   */
  unlockChapter(chapterId: string): boolean {
    this._requireInitialized();

    const repository = ChapterRepository.getInstance();
    const config = repository.getChapter(chapterId);
    if (!config) {
      console.error(`[ChapterSystem] 解锁失败：章节配置不存在 chapterId=${chapterId}`);
      return false;
    }

    const progress = this._getOrCreateProgress(chapterId);
    if (progress.status !== 'locked') {
      return false; // 已解锁或已完成
    }

    // 检查前置章节
    const prevChapterId = config.unlockCondition.prevChapterId;
    if (prevChapterId) {
      const prevProgress = this._progressMap.get(prevChapterId);
      if (!prevProgress || prevProgress.status !== 'completed') {
        console.warn(
          `[ChapterSystem] 解锁失败：前置章节未完成 chapterId=${chapterId}, prevChapterId=${prevChapterId}`,
        );
        return false;
      }
    }

    return this._unlockChapterInternal(chapterId);
  }

  /** 内部章节解锁（跳过前置校验） */
  private _unlockChapterInternal(chapterId: string): boolean {
    const progress = this._getOrCreateProgress(chapterId);
    if (progress.status !== 'locked') return false;

    progress.status = 'unlocked';
    progress.unlockedAt = Date.now();
    progress.updatedAt = Date.now();

    // 同时解锁第一个关卡
    const repository = ChapterRepository.getInstance();
    const firstStage = repository.getFirstStageOfChapter(chapterId);
    if (firstStage) {
      progress.currentStageId = firstStage.id;
    }

    this._emit(ChapterSystem.CHAPTER_UNLOCKED, {
      chapterId,
    } as ChapterUnlockedEventData);

    // 发射首个关卡解锁事件
    if (firstStage) {
      this._emit(ChapterSystem.STAGE_UNLOCKED, {
        chapterId,
        stageId: firstStage.id,
      } as StageUnlockedEventData);
    }

    return true;
  }

  // ==================== 关卡解锁 ====================

  /**
   * 解锁指定关卡。
   *
   * 校验：
   * 1. 所属章节已解锁
   * 2. 关卡配置存在
   * 3. 前置关卡已完成（如有）
   * 4. 玩家等级满足
   * 5. 总战力满足
   *
   * @param stageId      关卡 ID
   * @param playerLevel  当前玩家等级
   * @param totalPower   当前总战力
   * @returns            是否成功解锁
   */
  unlockStage(stageId: string, playerLevel: number, totalPower: number): boolean {
    this._requireInitialized();

    const repository = ChapterRepository.getInstance();
    const stageConfig = repository.getStage(stageId);
    if (!stageConfig) {
      console.error(`[ChapterSystem] 解锁失败：关卡配置不存在 stageId=${stageId}`);
      return false;
    }

    // 检查章节是否已解锁
    const chapterProgress = this._progressMap.get(stageConfig.chapterId);
    if (!chapterProgress || chapterProgress.status === 'locked') {
      console.warn(`[ChapterSystem] 关卡解锁失败：章节未解锁 stageId=${stageId}`);
      return false;
    }

    // 检查前置关卡
    const prevStageId = stageConfig.unlockCondition.prevStageId;
    if (prevStageId) {
      if (!chapterProgress.completedStageIds.includes(prevStageId)) {
        return false; // 前置关卡未完成，静默返回 false
      }
    }

    // 检查等级要求
    if (playerLevel < stageConfig.unlockCondition.playerLevel) {
      return false;
    }

    // 检查战力要求
    if (totalPower < stageConfig.unlockCondition.totalPower) {
      return false;
    }

    // 更新当前可挑战的关卡（如果此关比当前记录的更靠前）
    const existingStageIndex = this._getStageIndexInChapter(
      stageConfig.chapterId,
      chapterProgress.currentStageId,
    );
    const newStageIndex = this._getStageIndexInChapter(
      stageConfig.chapterId,
      stageId,
    );

    if (
      chapterProgress.currentStageId === '' ||
      newStageIndex < existingStageIndex ||
      (existingStageIndex < 0 && newStageIndex >= 0)
    ) {
      chapterProgress.currentStageId = stageId;
    }

    chapterProgress.updatedAt = Date.now();

    this._emit(ChapterSystem.STAGE_UNLOCKED, {
      chapterId: stageConfig.chapterId,
      stageId,
    } as StageUnlockedEventData);

    return true;
  }

  // ==================== 关卡完成 ====================

  /**
   * 完成指定关卡。
   *
   * 流程：
   * 1. 标记关卡为已完成
   * 2. 自动解锁下一关卡
   * 3. 如果是章节最后一关，完成章节并解锁下一章节
   *
   * @param stageId  关卡 ID
   * @returns        是否成功完成
   */
  completeStage(stageId: string): boolean {
    this._requireInitialized();

    const repository = ChapterRepository.getInstance();
    const stageConfig = repository.getStage(stageId);
    if (!stageConfig) {
      console.error(`[ChapterSystem] 完成失败：关卡配置不存在 stageId=${stageId}`);
      return false;
    }

    const progress = this._progressMap.get(stageConfig.chapterId);
    if (!progress || progress.status === 'locked') {
      console.error(`[ChapterSystem] 完成失败：章节未解锁 stageId=${stageId}`);
      return false;
    }

    // 幂等性：已完成的关卡不重复处理
    if (progress.completedStageIds.includes(stageId)) {
      return false;
    }

    // 记录完成
    progress.completedStageIds.push(stageId);
    progress.updatedAt = Date.now();

    // 自动解锁下一关卡
    const nextStage = repository.getNextStage(stageId);
    if (nextStage) {
      progress.currentStageId = nextStage.id;

      this._emit(ChapterSystem.STAGE_UNLOCKED, {
        chapterId: stageConfig.chapterId,
        stageId: nextStage.id,
      } as StageUnlockedEventData);
    } else {
      // 没有下一关 → 章节全部完成
      progress.currentStageId = stageId;
    }

    // 检查章节是否全部完成
    const allStages = repository.getStagesByChapter(stageConfig.chapterId);
    const isChapterComplete = allStages.every((s) =>
      progress.completedStageIds.includes(s.id),
    );

    // 发射关卡完成事件
    this._emit(ChapterSystem.STAGE_COMPLETED, {
      chapterId: stageConfig.chapterId,
      stageId,
      isChapterComplete,
    } as StageCompletedEventData);

    // 章节完成 → 解锁下一章节
    if (isChapterComplete && progress.status !== 'completed') {
      progress.status = 'completed';
      progress.completedAt = Date.now();

      this._emit(ChapterSystem.CHAPTER_COMPLETED, {
        chapterId: stageConfig.chapterId,
      } as ChapterCompletedEventData);

      // 查找并解锁下一章节
      const chapterConfig = repository.getChapter(stageConfig.chapterId);
      if (chapterConfig) {
        const allChapters = repository.getAllChapters();
        const nextChapter = allChapters.find(
          (c) => c.unlockCondition.prevChapterId === stageConfig.chapterId,
        );
        if (nextChapter) {
          this._unlockChapterInternal(nextChapter.id);
        }
      }
    }

    return true;
  }

  // ==================== 章节查询 ====================

  /**
   * 获取章节配置。
   *
   * @param chapterId  章节 ID
   * @returns          章节配置，不存在时返回 null
   */
  getChapter(chapterId: string): ChapterConfig | null {
    return ChapterRepository.getInstance().getChapter(chapterId);
  }

  /**
   * 获取所有章节配置（按 chapterIndex 升序）。
   */
  getAllChapters(): ChapterConfig[] {
    return ChapterRepository.getInstance().getAllChapters();
  }

  /**
   * 获取关卡配置。
   *
   * @param stageId  关卡 ID
   * @returns        关卡配置，不存在时返回 null
   */
  getStage(stageId: string): StageConfig | null {
    return ChapterRepository.getInstance().getStage(stageId);
  }

  /**
   * 获取章节进度。
   *
   * @param chapterId  章节 ID
   * @returns          章节进度副本，不存在时返回 null
   */
  getChapterProgress(chapterId: string): ChapterProgress | null {
    const progress = this._progressMap.get(chapterId);
    if (!progress) return null;
    return {
      ...progress,
      completedStageIds: [...progress.completedStageIds],
    };
  }

  /**
   * 获取所有章节进度。
   */
  getAllChapterProgress(): Map<string, ChapterProgress> {
    const result = new Map<string, ChapterProgress>();
    for (const [id, progress] of this._progressMap.entries()) {
      result.set(id, {
        ...progress,
        completedStageIds: [...progress.completedStageIds],
      });
    }
    return result;
  }

  /**
   * 获取当前活跃章节 ID。
   *
   * 优先级：
   * 1. 第一个未完成的已解锁章节
   * 2. 第一个已完成章节
   * 3. 空字符串
   */
  getCurrentChapterId(): string {
    return this._findCurrentChapterId();
  }

  /**
   * 获取当前可挑战的关卡 ID。
   *
   * 返回进度中记录的 currentStageId。
   *
   * @param chapterId  章节 ID（可选，默认取当前章节）
   * @returns          当前关卡 ID
   */
  getCurrentStage(chapterId?: string): StageConfig | null {
    const targetChapterId = chapterId || this._findCurrentChapterId();
    if (!targetChapterId) return null;

    const progress = this._progressMap.get(targetChapterId);
    if (!progress || !progress.currentStageId) return null;

    return ChapterRepository.getInstance().getStage(progress.currentStageId);
  }

  /**
   * 获取章节推荐战力。
   *
   * @param chapterId  章节 ID
   * @returns          推荐战力值
   */
  getRecommendedPower(chapterId: string): number {
    return ChapterRepository.getInstance().getChapterRecommendedPower(chapterId);
  }

  /**
   * 判断章节是否已解锁。
   */
  isChapterUnlocked(chapterId: string): boolean {
    const progress = this._progressMap.get(chapterId);
    return progress ? progress.status !== 'locked' : false;
  }

  /**
   * 判断章节是否已完成。
   */
  isChapterCompleted(chapterId: string): boolean {
    const progress = this._progressMap.get(chapterId);
    return progress ? progress.status === 'completed' : false;
  }

  /**
   * 判断关卡是否已完成。
   */
  isStageCompleted(stageId: string): boolean {
    const stageConfig = ChapterRepository.getInstance().getStage(stageId);
    if (!stageConfig) return false;

    const progress = this._progressMap.get(stageConfig.chapterId);
    return progress ? progress.completedStageIds.includes(stageId) : false;
  }

  // ==================== 快照 ====================

  /**
   * 生成章节快照。
   *
   * 包含章节状态、当前关卡、完成进度等完整信息。
   *
   * @param chapterId  章节 ID（可选，默认取当前章节）
   * @returns          章节快照
   */
  generateChapterSnapshot(chapterId?: string): ChapterSnapshot | null {
    this._requireInitialized();

    const targetChapterId = chapterId || this._findCurrentChapterId();
    if (!targetChapterId) return null;

    const repository = ChapterRepository.getInstance();
    const config = repository.getChapter(targetChapterId);
    if (!config) return null;

    const progress = this._progressMap.get(targetChapterId);
    if (!progress) return null;

    const allStages = repository.getStagesByChapter(targetChapterId);
    const currentStage = progress.currentStageId
      ? repository.getStage(progress.currentStageId)
      : null;

    // 收集已解锁关卡 ID
    const unlockedStageIds: string[] = [];
    for (const stage of allStages) {
      if (stage.id === progress.currentStageId) {
        unlockedStageIds.push(stage.id);
        break; // 只到当前关卡为止
      }
      if (progress.completedStageIds.includes(stage.id)) {
        unlockedStageIds.push(stage.id);
      } else if (stage.unlockCondition.prevStageId === null) {
        // 首个关卡总是解锁的
        unlockedStageIds.push(stage.id);
      } else if (
        stage.unlockCondition.prevStageId &&
        progress.completedStageIds.includes(stage.unlockCondition.prevStageId)
      ) {
        unlockedStageIds.push(stage.id);
      }
    }

    return {
      chapterId: targetChapterId,
      chapterName: config.name,
      chapterIndex: config.chapterIndex,
      currentStageId: progress.currentStageId,
      currentStage,
      completedStageCount: progress.completedStageIds.length,
      totalStageCount: allStages.length,
      unlockedStageIds,
      recommendedPower: repository.getChapterRecommendedPower(targetChapterId),
      isCompleted: progress.status === 'completed',
      capturedAt: Date.now(),
    };
  }

  /**
   * 生成所有章节的快照列表。
   */
  generateAllChapterSnapshots(): ChapterSnapshot[] {
    const snapshots: ChapterSnapshot[] = [];
    for (const chapterId of ChapterRepository.getInstance().getAllChapterIds()) {
      const snapshot = this.generateChapterSnapshot(chapterId);
      if (snapshot) {
        snapshots.push(snapshot);
      }
    }
    return snapshots;
  }

  // ==================== 状态查询 ====================

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
    this._progressMap.clear();
    this._initialized = false;
  }

  // ==================== 内部方法 ====================

  /** 查找第一个章节 ID（chapterIndex 最小者） */
  private _findFirstChapterId(): string {
    const chapters = ChapterRepository.getInstance().getAllChapters();
    if (chapters.length === 0) return '';
    return chapters[0].id;
  }

  /** 查找当前活跃章节 ID */
  private _findCurrentChapterId(): string {
    const allChapters = ChapterRepository.getInstance().getAllChapters();

    // 第一个未完成的已解锁章节
    for (const chapter of allChapters) {
      const progress = this._progressMap.get(chapter.id);
      if (progress && progress.status === 'unlocked') {
        return chapter.id;
      }
    }

    // 回退到第一个已解锁的（可能已完成）
    for (const chapter of allChapters) {
      const progress = this._progressMap.get(chapter.id);
      if (progress && progress.status !== 'locked') {
        return chapter.id;
      }
    }

    return '';
  }

  /** 获取或创建章节进度 */
  private _getOrCreateProgress(chapterId: string): ChapterProgress {
    let progress = this._progressMap.get(chapterId);
    if (progress) return progress;

    progress = createDefaultChapterProgress(chapterId);
    this._progressMap.set(chapterId, progress);
    return progress;
  }

  /** 获取关卡在章节中的索引（-1 表示不在该章节中） */
  private _getStageIndexInChapter(chapterId: string, stageId: string): number {
    const stages = ChapterRepository.getInstance().getStagesByChapter(chapterId);
    return stages.findIndex((s) => s.id === stageId);
  }

  /** 确保已初始化 */
  private _requireInitialized(): void {
    if (!this._initialized) {
      throw new Error('[ChapterSystem] 未初始化，请先调用 initialize()');
    }
  }

  /** 发送事件 */
  private _emit(event: string, data: Record<string, unknown>): void {
    EventManager.getInstance().emit(event, data);
  }
}
