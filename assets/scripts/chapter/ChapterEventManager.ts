// ============================================================
// ChapterEventManager — Phase10-Step3 章节事件管理器
// 职责：章节事件抽取（权重计算）/ 事件触发 / 事件记录 / 存档同步
// 边界：只读取配置与存档，不修改 BattleSystem / ChapterSystem / DropSystem
//       不直接操作 UI（通过 EventManager 发出事件）
// ============================================================

import { BaseSystem } from '../core/BaseSystem';
import { EventManager } from '../core/EventManager';
import { ChapterEventRepository } from './ChapterEventRepository';
import { StageExtensionRepository } from './StageExtensionRepository';
import type {
  ChapterEventConfig,
  ChapterEventRecord,
  ChapterEventSaveData,
  ChapterEventType,
} from './ChapterEventTypes';
import { createDefaultChapterEventSaveData } from './ChapterEventTypes';

// ==================== 事件数据接口 ====================

/** 事件触发事件数据 */
export interface ChapterEventTriggeredData {
  eventId: string;
  eventName: string;
  eventType: ChapterEventType;
  chapterId: string;
}

/** 事件抽取事件数据 */
export interface ChapterEventRolledData {
  eventId: string;
  chapterId: string;
  stageId: string;
}

export class ChapterEventManager extends BaseSystem {

  // ==================== 事件常量 ====================

  static readonly CHAPTER_EVENT_ROLLED = 'chapterEvent:rolled';
  static readonly CHAPTER_EVENT_TRIGGERED = 'chapterEvent:triggered';

  // ==================== 单例 ====================

  static getInstance(): ChapterEventManager {
    return super.getInstance<ChapterEventManager>();
  }

  // ==================== 内部状态 ====================

  /** 最后触发的事件 ID */
  private _lastEventId: string = '';

  /** 事件触发历史记录 */
  private _eventHistory: ChapterEventRecord[] = [];

  /** 是否已初始化 */
  private _initialized = false;

  // ==================== 生命周期 ====================

  /**
   * 初始化 ChapterEventManager。
   *
   * 确保 ChapterEventRepository 和 StageExtensionRepository 配置已加载。
   *
   * @returns 初始化是否成功
   */
  async initialize(): Promise<boolean> {
    if (this._initialized) {
      console.warn('[ChapterEventManager] 已初始化，跳过重复 initialize');
      return true;
    }

    const eventRepo = ChapterEventRepository.getInstance();
    if (!eventRepo.isLoaded()) {
      await eventRepo.load();
    }

    const extRepo = StageExtensionRepository.getInstance();
    if (!extRepo.isLoaded()) {
      await extRepo.load();
    }

    this._initialized = true;
    console.log('[ChapterEventManager] 初始化完成');
    return true;
  }

  /**
   * 从存档数据恢复章节事件状态。
   *
   * @param saveData  章节事件存档数据
   */
  restore(saveData: ChapterEventSaveData): void {
    if (!saveData) return;

    if (saveData.lastEventId !== undefined) {
      this._lastEventId = saveData.lastEventId;
    }

    if (saveData.eventHistory && Array.isArray(saveData.eventHistory)) {
      this._eventHistory = saveData.eventHistory.map((r) => ({ ...r }));
    }
  }

  /**
   * 导出当前章节事件存档数据。
   *
   * @returns  当前完整的章节事件存档数据
   */
  save(): ChapterEventSaveData {
    return {
      lastEventId: this._lastEventId,
      eventHistory: this._eventHistory.map((r) => ({ ...r })),
      saveVersion: 1,
      updatedAt: Date.now(),
    };
  }

  // ==================== 事件抽取 ====================

  /**
   * 为指定章节抽取一个事件（基于权重）。
   *
   * 流程：
   * 1. 从 StageExtensionRepository 获取该章节所有关卡的 eventPool
   * 2. 从 ChapterEventRepository 查找对应事件配置
   * 3. 按权重加权随机抽取一个事件
   *
   * @param chapterId  章节 ID
   * @param stageType  关卡类型（用于过滤 bossOnlyStages 条件）
   * @returns          抽中的事件配置，无可用事件时返回 null
   */
  rollEvent(chapterId: string, stageType: string = 'normal'): ChapterEventConfig | null {
    this._requireInitialized();

    const eventRepo = ChapterEventRepository.getInstance();

    // 获取该章节的所有可用事件
    const chapterEvents = eventRepo.getEventsByChapter(chapterId);
    if (chapterEvents.length === 0) {
      console.log(`[ChapterEventManager] rollEvent: 章节 ${chapterId} 无可用事件`);
      return null;
    }

    // 构建候选事件列表（含权重）
    const candidates: { event: ChapterEventConfig; weight: number }[] = [];

    for (const event of chapterEvents) {
      // 过滤：bossOnlyStages 条件检查
      if (event.triggerCondition.bossOnlyStages && stageType !== 'boss') {
        continue;
      }

      // 权重为 0 的事件跳过
      if (event.weight <= 0) {
        continue;
      }

      candidates.push({ event, weight: event.weight });
    }

    if (candidates.length === 0) {
      console.log(
        `[ChapterEventManager] rollEvent: 章节 ${chapterId} 无符合条件的候选事件`,
      );
      return null;
    }

    // 加权随机抽取
    const selected = this._weightedRandom(candidates);

    // 发射事件抽取事件
    EventManager.getInstance().emit(ChapterEventManager.CHAPTER_EVENT_ROLLED, {
      eventId: selected.id,
      chapterId: selected.chapterId,
      stageId: '',
    } satisfies ChapterEventRolledData);

    return selected;
  }

  /**
   * 为指定关卡抽取一个事件（从关卡的 eventPool 中抽取）。
   *
   * @param stageId  关卡 ID
   * @returns        抽中的事件配置，无可用事件时返回 null
   */
  rollEventByStage(stageId: string): ChapterEventConfig | null {
    this._requireInitialized();

    const extRepo = StageExtensionRepository.getInstance();
    const extension = extRepo.getStageExtension(stageId);
    if (!extension || extension.eventPool.length === 0) {
      return null;
    }

    const eventRepo = ChapterEventRepository.getInstance();
    const candidates: { event: ChapterEventConfig; weight: number }[] = [];

    for (const eventId of extension.eventPool) {
      const event = eventRepo.getEvent(eventId);
      if (event && event.weight > 0) {
        candidates.push({ event, weight: event.weight });
      }
    }

    if (candidates.length === 0) {
      return null;
    }

    const selected = this._weightedRandom(candidates);

    EventManager.getInstance().emit(ChapterEventManager.CHAPTER_EVENT_ROLLED, {
      eventId: selected.id,
      chapterId: selected.chapterId,
      stageId,
    } satisfies ChapterEventRolledData);

    return selected;
  }

  // ==================== 事件触发 ====================

  /**
   * 触发指定事件。
   *
   * 流程：
   * 1. 验证事件配置存在
   * 2. 记录事件历史
   * 3. 更新 lastEventId
   * 4. 发射事件触发事件（供 UI / Analytics 消费）
   *
   * @param eventId  事件 ID
   * @returns        是否成功触发
   */
  triggerEvent(eventId: string): boolean {
    this._requireInitialized();

    const eventRepo = ChapterEventRepository.getInstance();
    const event = eventRepo.getEvent(eventId);
    if (!event) {
      console.error(`[ChapterEventManager] triggerEvent: 事件不存在 eventId=${eventId}`);
      return false;
    }

    // 记录历史（最多保留 50 条）
    const record: ChapterEventRecord = {
      eventId: event.id,
      chapterId: event.chapterId,
      eventName: event.name,
      eventType: event.type,
      triggeredAt: Date.now(),
    };

    this._eventHistory.push(record);
    if (this._eventHistory.length > 50) {
      this._eventHistory = this._eventHistory.slice(-50);
    }

    this._lastEventId = event.id;

    // 发射事件触发事件
    EventManager.getInstance().emit(ChapterEventManager.CHAPTER_EVENT_TRIGGERED, {
      eventId: event.id,
      eventName: event.name,
      eventType: event.type,
      chapterId: event.chapterId,
    } satisfies ChapterEventTriggeredData);

    return true;
  }

  // ==================== 查询 ====================

  /**
   * 获取最后触发的事件记录。
   *
   * @returns  最后触发的事件记录，无历史时返回 null
   */
  getLastEvent(): ChapterEventRecord | null {
    if (this._eventHistory.length === 0) {
      return null;
    }
    return { ...this._eventHistory[this._eventHistory.length - 1] };
  }

  /**
   * 获取最后触发的事件 ID。
   *
   * @returns  事件 ID，无历史时返回空字符串
   */
  getLastEventId(): string {
    return this._lastEventId;
  }

  /**
   * 获取事件触发历史记录（按时间升序）。
   *
   * @param limit  最大返回条数（默认 20）
   * @returns      事件记录数组
   */
  getEventHistory(limit: number = 20): ChapterEventRecord[] {
    const start = Math.max(0, this._eventHistory.length - limit);
    return this._eventHistory.slice(start).map((r) => ({ ...r }));
  }

  /**
   * 获取事件触发历史总数。
   */
  getEventHistoryCount(): number {
    return this._eventHistory.length;
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
    this._lastEventId = '';
    this._eventHistory = [];
    this._initialized = false;
  }

  // ==================== 内部方法 ====================

  /** 加权随机抽取 */
  private _weightedRandom(
    candidates: { event: ChapterEventConfig; weight: number }[],
  ): ChapterEventConfig {
    const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);

    // 防御：所有权重为 0
    if (totalWeight <= 0) {
      return candidates[0].event;
    }

    let roll = Math.random() * totalWeight;

    for (const candidate of candidates) {
      roll -= candidate.weight;
      if (roll <= 0) {
        return candidate.event;
      }
    }

    // 浮点精度 fallback：返回最后一个
    return candidates[candidates.length - 1].event;
  }

  /** 确保已初始化 */
  private _requireInitialized(): void {
    if (!this._initialized) {
      throw new Error('[ChapterEventManager] 未初始化，请先调用 initialize()');
    }
  }
}
