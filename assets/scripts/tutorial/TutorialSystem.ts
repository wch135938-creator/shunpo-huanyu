// ============================================================
// TutorialSystem — Phase9-Step9 新手引导系统
// 职责：引导状态管理 / 步骤推进 / 完成记录 / 跳过管理 / 快照生成
// 边界：不直接操作 UI / 不修改其他系统运行时状态
//
// 事件：
//   tutorial:started       — 引导开始
//   tutorial:stepCompleted — 步骤完成
//   tutorial:completed     — 引导组完成
//   tutorial:skipped       — 引导组跳过
// ============================================================

import { BaseSystem } from '../core/BaseSystem';
import { EventManager } from '../core/EventManager';
import { SaveManager } from '../save/SaveManager';
import { TutorialRepository } from './TutorialRepository';
import type {
  TutorialGroup,
  TutorialStep,
  TutorialProgress,
  TutorialSnapshot,
  TutorialStepResult,
} from './TutorialTypes';
import {
  createDefaultTutorialProgress,
  createSnapshotFromProgress,
  restoreProgressFromSnapshot,
} from './TutorialTypes';
import type { TutorialSaveData } from '../save/TutorialSaveData';

// ==================== 事件数据类型 ====================

/** tutorial:started 事件数据 */
export interface TutorialStartedEventData {
  groupId: string;
  stepId: string;
  totalSteps: number;
}

/** tutorial:stepCompleted 事件数据 */
export interface TutorialStepCompletedEventData {
  groupId: string;
  stepId: string;
  completedCount: number;
  totalSteps: number;
}

/** tutorial:completed 事件数据 */
export interface TutorialCompletedEventData {
  groupId: string;
  totalSteps: number;
}

/** tutorial:skipped 事件数据 */
export interface TutorialSkippedEventData {
  groupId: string;
  reason: string;
}

export class TutorialSystem extends BaseSystem {
  // ==================== 事件常量 ====================

  static readonly TUTORIAL_STARTED = 'tutorial:started';
  static readonly TUTORIAL_STEP_COMPLETED = 'tutorial:stepCompleted';
  static readonly TUTORIAL_COMPLETED = 'tutorial:completed';
  static readonly TUTORIAL_SKIPPED = 'tutorial:skipped';

  // ==================== 内部状态 ====================

  /** 引导配置仓库 */
  private _repository: TutorialRepository;

  /** 当前引导进度（运行时内存） */
  private _progress: TutorialProgress;

  /** 是否已完成初始化 */
  private _initialized = false;

  // ==================== 构造 ====================

  constructor() {
    super();
    this._repository = new TutorialRepository();
    this._progress = createDefaultTutorialProgress();
  }

  // ==================== 初始化 ====================

  /**
   * 初始化引导系统。
   *
   * 流程：
   * 1. 加载引导配置
   * 2. 从存档恢复引导进度
   * 3. 如果没有存档进度，自动检测并开始优先级最高的引导
   *
   * @param autoStart  是否自动开始引导（默认 false）
   */
  async initialize(autoStart: boolean = false): Promise<void> {
    if (this._initialized) {
      console.warn('[TutorialSystem] 已初始化，跳过重复 init');
      return;
    }

    // 1. 加载配置
    await this._repository.loadConfig();
    console.log('[TutorialSystem] 配置加载完成');

    // 2. 从存档恢复
    this._restore();

    // 3. 自动开始（可选）
    if (autoStart && !this._progress.isComplete && !this._progress.currentGroupId) {
      const group = this._repository.getFirstAvailableGroup(
        this._progress.completedGroupIds,
        this._progress.skippedGroupIds,
      );
      if (group) {
        this.startTutorial(group.groupId);
      }
    }

    this._initialized = true;
    console.log('[TutorialSystem] 初始化完成');
  }

  /** 是否已完成初始化 */
  isInitialized(): boolean {
    return this._initialized;
  }

  // ==================== 引导控制 ====================

  /**
   * 开始一个引导组。
   *
   * 前置条件：
   * - 引导组存在
   * - 引导组未被跳过
   * - 引导组未完成
   * - 依赖已满足
   * - 当前没有进行中的引导
   *
   * @param groupId  引导组 ID
   * @returns        是否成功开始
   */
  startTutorial(groupId: string): boolean {
    this._requireInitialized();

    const group = this._repository.getGroup(groupId);
    if (!group) {
      console.error(`[TutorialSystem] 引导组不存在: ${groupId}`);
      return false;
    }

    if (this._progress.skippedGroupIds.includes(groupId)) {
      console.warn(`[TutorialSystem] 引导组已被跳过: ${groupId}`);
      return false;
    }

    if (this._progress.completedGroupIds.includes(groupId)) {
      console.warn(`[TutorialSystem] 引导组已完成: ${groupId}`);
      return false;
    }

    // 检查依赖
    if (group.dependencies && group.dependencies.length > 0) {
      for (const depId of group.dependencies) {
        if (!this._progress.completedGroupIds.includes(depId)) {
          console.error(
            `[TutorialSystem] 引导组 ${groupId} 的前置依赖 ${depId} 未完成`,
          );
          return false;
        }
      }
    }

    // 如果当前有进行中的引导，先终止
    if (this._progress.currentGroupId) {
      console.warn(
        `[TutorialSystem] 终止当前引导 ${this._progress.currentGroupId}，开始新引导 ${groupId}`,
      );
    }

    // 获取第一个步骤
    const firstStep = this._repository.getFirstStep(groupId);
    if (!firstStep) {
      console.error(`[TutorialSystem] 引导组 ${groupId} 无步骤`);
      return false;
    }

    const totalSteps = this._repository.getGroupSteps(groupId).length;

    this._progress.currentGroupId = groupId;
    this._progress.currentStepId = firstStep.stepId;

    // 发射事件
    EventManager.getInstance().emit(TutorialSystem.TUTORIAL_STARTED, {
      groupId,
      stepId: firstStep.stepId,
      totalSteps,
    } as TutorialStartedEventData);

    // 保存
    this._save();

    console.log(`[TutorialSystem] 引导开始: ${groupId}, 共 ${totalSteps} 步`);
    return true;
  }

  /**
   * 完成当前步骤。
   *
   * 行为：
   * 1. 记录当前步骤完成
   * 2. 尝试推进到下一步
   * 3. 如果当前组所有步骤完成，标记组完成
   * 4. 发射相应事件
   *
   * @returns  步骤完成结果
   */
  completeStep(): TutorialStepResult | null {
    this._requireInitialized();

    const groupId = this._progress.currentGroupId;
    const stepId = this._progress.currentStepId;

    if (!groupId || !stepId) {
      console.warn('[TutorialSystem] 无进行中的引导步骤');
      return null;
    }

    const currentStep = this._repository.getStep(stepId);
    if (!currentStep) {
      console.error(`[TutorialSystem] 步骤不存在: ${stepId}`);
      return null;
    }

    const totalSteps = this._repository.getGroupSteps(groupId).length;

    // 记录完成
    if (!this._progress.completedStepIds.includes(stepId)) {
      this._progress.completedStepIds.push(stepId);
    }

    const completedCount = this._progress.completedStepIds.filter(
      (id) => id.startsWith(groupId),
    ).length;

    // 发射步骤完成事件
    EventManager.getInstance().emit(TutorialSystem.TUTORIAL_STEP_COMPLETED, {
      groupId,
      stepId,
      completedCount,
      totalSteps,
    } as TutorialStepCompletedEventData);

    // 尝试推进到下一步
    const nextStep = this._repository.getNextStep(groupId, currentStep.order);

    let groupCompleted = false;
    let allCompleted = false;

    if (nextStep) {
      // 还有下一步
      this._progress.currentStepId = nextStep.stepId;
    } else {
      // 当前组完成
      groupCompleted = true;
      this._progress.currentGroupId = '';
      this._progress.currentStepId = '';

      if (!this._progress.completedGroupIds.includes(groupId)) {
        this._progress.completedGroupIds.push(groupId);
      }

      // 发射引导组完成事件
      EventManager.getInstance().emit(TutorialSystem.TUTORIAL_COMPLETED, {
        groupId,
        totalSteps,
      } as TutorialCompletedEventData);

      // 检查是否全部引导完成
      const allGroups = this._repository.getAllGroups();
      const allIds = allGroups.map((g) => g.groupId);
      allCompleted = allIds.every(
        (id) =>
          this._progress.completedGroupIds.includes(id) ||
          this._progress.skippedGroupIds.includes(id),
      );

      if (allCompleted) {
        this._progress.isComplete = true;
        console.log('[TutorialSystem] 全部引导完成！');
      }

      console.log(`[TutorialSystem] 引导组完成: ${groupId}, 共 ${totalSteps} 步`);
    }

    // 保存
    this._save();

    return {
      stepId,
      groupId,
      groupCompleted,
      allCompleted,
      nextStepId: nextStep ? nextStep.stepId : null,
    };
  }

  /**
   * 跳过指定引导组。
   *
   * 如果正在进行的引导组被跳过，会清除当前进度。
   *
   * @param groupId  引导组 ID
   * @param reason   跳过原因（可选）
   * @returns        是否成功跳过
   */
  skipTutorial(groupId: string, reason: string = ''): boolean {
    this._requireInitialized();

    const group = this._repository.getGroup(groupId);
    if (!group) {
      console.error(`[TutorialSystem] 引导组不存在: ${groupId}`);
      return false;
    }

    if (this._progress.completedGroupIds.includes(groupId)) {
      console.warn(`[TutorialSystem] 引导组已完成，无法跳过: ${groupId}`);
      return false;
    }

    if (this._progress.skippedGroupIds.includes(groupId)) {
      console.warn(`[TutorialSystem] 引导组已跳过: ${groupId}`);
      return false;
    }

    // 标记跳过
    this._progress.skippedGroupIds.push(groupId);

    // 如果当前正在此引导组中，清除当前进度
    if (this._progress.currentGroupId === groupId) {
      this._progress.currentGroupId = '';
      this._progress.currentStepId = '';
    }

    // 发射跳过事件
    EventManager.getInstance().emit(TutorialSystem.TUTORIAL_SKIPPED, {
      groupId,
      reason: reason || 'manual_skip',
    } as TutorialSkippedEventData);

    // 检查全部引导是否完成
    this._checkAllComplete();

    // 保存
    this._save();

    console.log(`[TutorialSystem] 引导跳过: ${groupId}, reason: ${reason || 'manual_skip'}`);
    return true;
  }

  /** 跳过所有未完成的引导 */
  skipAll(reason: string = 'skip_all'): number {
    this._requireInitialized();

    const allGroups = this._repository.getAllGroups();
    let skippedCount = 0;

    for (const group of allGroups) {
      if (
        !this._progress.completedGroupIds.includes(group.groupId) &&
        !this._progress.skippedGroupIds.includes(group.groupId)
      ) {
        this._progress.skippedGroupIds.push(group.groupId);
        skippedCount += 1;
      }
    }

    if (skippedCount > 0) {
      this._progress.currentGroupId = '';
      this._progress.currentStepId = '';
      this._progress.isComplete = true;
      this._save();

      console.log(`[TutorialSystem] 跳过全部引导: ${skippedCount} 组`);
    }

    return skippedCount;
  }

  // ==================== 查询 ====================

  /**
   * 检查引导组是否已完成。
   *
   * @param groupId  引导组 ID
   */
  isCompleted(groupId: string): boolean {
    return this._progress.completedGroupIds.includes(groupId);
  }

  /**
   * 检查引导组是否已跳过。
   */
  isSkipped(groupId: string): boolean {
    return this._progress.skippedGroupIds.includes(groupId);
  }

  /**
   * 检查引导组是否有进行中的引导。
   */
  isInProgress(): boolean {
    return !!this._progress.currentGroupId && !!this._progress.currentStepId;
  }

  /**
   * 检查是否全部引导已完成。
   */
  isAllComplete(): boolean {
    return this._progress.isComplete;
  }

  /**
   * 获取当前引导进度（只读副本）。
   */
  getProgress(): TutorialProgress {
    return {
      currentGroupId: this._progress.currentGroupId,
      currentStepId: this._progress.currentStepId,
      completedGroupIds: [...this._progress.completedGroupIds],
      completedStepIds: [...this._progress.completedStepIds],
      skippedGroupIds: [...this._progress.skippedGroupIds],
      isComplete: this._progress.isComplete,
    };
  }

  /**
   * 获取当前步骤。
   *
   * @returns  当前步骤，无进行中引导时返回 null
   */
  getCurrentStep(): TutorialStep | null {
    if (!this._progress.currentStepId) {
      return null;
    }
    return this._repository.getStep(this._progress.currentStepId);
  }

  /**
   * 获取当前引导组。
   *
   * @returns  当前引导组，无进行中引导时返回 null
   */
  getCurrentGroup(): TutorialGroup | null {
    if (!this._progress.currentGroupId) {
      return null;
    }
    return this._repository.getGroup(this._progress.currentGroupId);
  }

  /**
   * 获取当前引导组的步骤列表。
   */
  getCurrentGroupSteps(): TutorialStep[] {
    if (!this._progress.currentGroupId) {
      return [];
    }
    return this._repository.getGroupSteps(this._progress.currentGroupId);
  }

  /**
   * 获取当前步骤在组中的索引（从 0 开始）。
   */
  getCurrentStepIndex(): number {
    if (!this._progress.currentGroupId || !this._progress.currentStepId) {
      return -1;
    }
    const steps = this._repository.getGroupSteps(this._progress.currentGroupId);
    return steps.findIndex((s) => s.stepId === this._progress.currentStepId);
  }

  /**
   * 获取仓库引用（只读）。
   */
  getRepository(): TutorialRepository {
    return this._repository;
  }

  // ==================== 快照 ====================

  /**
   * 生成引导进度快照。
   *
   * @returns  当前进度的快照
   */
  generateTutorialSnapshot(): TutorialSnapshot {
    return createSnapshotFromProgress(this._progress);
  }

  // ==================== 持久化 ====================

  /**
   * 保存引导进度到存档。
   */
  private _save(): void {
    const snapshot = this.generateTutorialSnapshot();
    const data: TutorialSaveData = {
      snapshot,
      saveVersion: 1,
      updatedAt: Date.now(),
    };

    SaveManager.getInstance().saveTutorialData(data);
    // 标记存档脏数据
    SaveManager.getInstance().markDirty();
  }

  /**
   * 从存档恢复引导进度。
   */
  private _restore(): void {
    const data = SaveManager.getInstance().loadTutorialData();
    if (data && data.snapshot) {
      this._progress = restoreProgressFromSnapshot(data.snapshot);
      console.log(
        `[TutorialSystem] 从存档恢复引导进度: ` +
        `${this._progress.completedGroupIds.length} 组已完成, ` +
        `${this._progress.skippedGroupIds.length} 组已跳过`,
      );
    } else {
      this._progress = createDefaultTutorialProgress();
      console.log('[TutorialSystem] 无存档数据，使用默认引导进度');
    }
  }

  /**
   * 手动触发保存（供外部调用，例如暂停/切后台时）。
   */
  save(): void {
    this._save();
  }

  /**
   * 手动触发恢复（供外部调用，例如迁移后重新加载）。
   */
  restore(): void {
    this._restore();
  }

  // ==================== 内部方法 ====================

  /**
   * 检查是否全部引导组已处理（完成或跳过）。
   */
  private _checkAllComplete(): void {
    const allGroups = this._repository.getAllGroups();
    if (allGroups.length === 0) {
      return;
    }

    const allIds = allGroups.map((g) => g.groupId);
    const allDone = allIds.every(
      (id) =>
        this._progress.completedGroupIds.includes(id) ||
        this._progress.skippedGroupIds.includes(id),
    );

    if (allDone) {
      this._progress.isComplete = true;
      console.log('[TutorialSystem] 全部引导组已处理完毕');
    }
  }

  /**
   * 确保已初始化。
   */
  private _requireInitialized(): void {
    if (!this._initialized) {
      throw new Error('[TutorialSystem] 未初始化，请先调用 initialize()');
    }
  }
}
