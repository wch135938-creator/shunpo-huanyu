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

/**
 * 关卡完成时所需的解锁上下文。
 *
 * 由调用方（Coordinator）提供真实玩家等级与总战力，
 * 供 completeStage() 在校验下一章节及其首关解锁条件时使用。
 *
 * 不提供此上下文时，completeStage() 仍会完成当前关卡与章节，
 * 但不会自动解锁带额外条件的下一章节。
 */
export interface StageCompletionContext {
  /** 当前玩家等级（取自 PlayerProgressData.playerLevel） */
  playerLevel: number;
  /** 当前阵容总战力（取自 FormationSystem.getActivePreset('pve').teamPower） */
  totalPower: number;
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

  /**
   * 内部章节解锁（仅状态，不处理首关）。
   *
   * 与 _unlockChapterInternal 的区别：
   * - 不设置 currentStageId
   * - 不发射 STAGE_UNLOCKED
   * - 仅处理章节 status 变更与 CHAPTER_UNLOCKED 事件
   *
   * 用于 completeStage() 中由外部校验首关条件后再决定是否解锁首关。
   */
  private _unlockChapterStatusOnly(chapterId: string): boolean {
    const progress = this._getOrCreateProgress(chapterId);
    if (progress.status !== 'locked') return false;

    progress.status = 'unlocked';
    progress.unlockedAt = Date.now();
    progress.updatedAt = Date.now();

    this._emit(ChapterSystem.CHAPTER_UNLOCKED, {
      chapterId,
    } as ChapterUnlockedEventData);

    return true;
  }

  // ==================== 统一条件重判 ====================

  /**
   * 统一章节解锁条件重判入口。
   *
   * 按章节顺序遍历所有章节，对每个"前置章节已完成"的后续章节执行：
   * 1. locked → 检查章节自身 playerLevel 条件 → 满足则解锁章节状态
   * 2. unlocked 但首关未解锁 → 检查首关 playerLevel + totalPower → 满足则解锁首关
   *
   * 幂等保证：
   * - 不修改 completed 章节
   * - 不将 unlocked 降回 locked
   * - 不重复发射事件（依赖 _unlockChapterStatusOnly / unlockStage 的内置幂等）
   *
   * @param context  玩家等级与总战力
   * @returns        本轮是否产生了新的章节或关卡解锁
   */
  reevaluateUnlockConditions(context: StageCompletionContext): boolean {
    this._requireInitialized();

    const repository = ChapterRepository.getInstance();
    const allChapters = repository.getAllChapters();
    let anyUnlocked = false;

    for (const chapter of allChapters) {
      const progress = this._progressMap.get(chapter.id);
      if (!progress) continue;

      // 跳过已完成章节
      if (progress.status === 'completed') continue;

      // 检查前置章节是否已完成
      const prevChapterId = chapter.unlockCondition.prevChapterId;
      if (prevChapterId) {
        const prevProgress = this._progressMap.get(prevChapterId);
        if (!prevProgress || prevProgress.status !== 'completed') {
          // 前置未完成 → 此章节及之后都不处理
          continue;
        }
      }

      // ---- 情况1: 章节 locked → 尝试解锁章节状态 ----
      if (progress.status === 'locked') {
        if (context.playerLevel >= chapter.unlockCondition.playerLevel) {
          const unlocked = this._unlockChapterStatusOnly(chapter.id);
          if (unlocked) {
            anyUnlocked = true;
            console.log(
              `[ChapterSystem] 重判解锁章节: chapterId=${chapter.id}, ` +
              `playerLevel=${context.playerLevel}`,
            );
          }
        } else {
          // 等级不足，此章节之后的章节也不可能满足（chapterIndex 递增，等级要求递增）
          // 但为了安全仍继续检查（未来可能有非常规配置）
        }
      }

      // ---- 情况2: 章节 unlocked → 检查首关是否需要解锁 ----
      if (progress.status === 'unlocked') {
        const firstStage = repository.getFirstStageOfChapter(chapter.id);
        if (firstStage) {
          // 首关尚未在 currentStageId 中 → 尝试解锁
          const stageAlreadyCurrent =
            progress.currentStageId === firstStage.id &&
            progress.completedStageIds.length === 0;
          // 更稳健的判断：首关已完成 或 当前关卡已指向首关或更后的关卡
          const firstStageHandled =
            progress.completedStageIds.includes(firstStage.id) ||
            (progress.currentStageId !== '' &&
             this._getStageIndexInChapter(chapter.id, progress.currentStageId) >= 0);

          if (!firstStageHandled) {
            const stageUnlocked = this.unlockStage(
              firstStage.id,
              context.playerLevel,
              context.totalPower,
            );
            if (stageUnlocked) {
              anyUnlocked = true;
              console.log(
                `[ChapterSystem] 重判解锁首关: chapterId=${chapter.id}, ` +
                `stageId=${firstStage.id}, ` +
                `playerLevel=${context.playerLevel}, totalPower=${context.totalPower}`,
              );
            }
          }
        }
      }
    }

    return anyUnlocked;
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
   * 3. 如果是章节最后一关，完成章节
   * 4. 如果提供了 context，校验并解锁下一章节及其首关
   *
   * 无 context 时：完成当前关卡与章节，但不自动解锁带额外条件的下一章节。
   *
   * @param stageId  关卡 ID
   * @param context  可选解锁上下文（玩家等级、总战力），由 Coordinator 提供
   * @returns        是否成功完成
   */
  completeStage(stageId: string, context?: StageCompletionContext): boolean {
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

    // 章节完成 → 条件解锁后续章节（统一重判入口）
    if (isChapterComplete && progress.status !== 'completed') {
      progress.status = 'completed';
      progress.completedAt = Date.now();

      this._emit(ChapterSystem.CHAPTER_COMPLETED, {
        chapterId: stageConfig.chapterId,
      } as ChapterCompletedEventData);
    }

    // 统一条件重判：无论本章是否刚完成，有 context 时都执行全量重判
    // - 章节刚完成时：解锁后续满足条件的章节
    // - 章节已完成但后续仍有 locked 章节时：补判（例如等级变化后重打旧关）
    // - 关卡已完成（非章节完成）时：不影响已完成章节，非破坏性操作
    if (context) {
      this.reevaluateUnlockConditions(context);
    }
    // 无 context 时：不自动解锁带额外条件的下一章节
    // （debug/测试调用方不会传入 context，保持幂等安全的章节/关卡完成行为）

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
