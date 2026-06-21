// ============================================================
// ChapterRepository — Phase9 章节配置仓库
// 职责：通过 ConfigManager 加载/缓存 chapter_data.json，提供同步查询
// 边界：不包含业务逻辑、不修改配置、不涉及运行时状态
// ============================================================

import { BaseSystem } from '../core/BaseSystem';
import { ConfigManager } from '../core/ConfigManager';
import type { ChapterConfig, ChapterDataList, StageConfig } from './ChapterTypes';

export class ChapterRepository extends BaseSystem {

  // ==================== 配置路径常量 ====================

  /** chapter_data.json 路径（相对 resources/，不含扩展名） */
  static readonly CHAPTER_DATA_PATH = `${ConfigManager.CONFIG_ROOT}/chapters/chapter_data`;

  // ==================== 内部状态 ====================

  /** 章节配置缓存：chapterId → ChapterConfig */
  private _chapterMap: Map<string, ChapterConfig> = new Map();

  /** 关卡配置缓存：stageId → StageConfig（展开所有章节的 stages） */
  private _stageMap: Map<string, StageConfig> = new Map();

  /** 配置是否已加载 */
  private _loaded = false;

  // ==================== 初始化 ====================

  /**
   * 加载 chapter_data.json 配置。
   *
   * 调用方应在使用 ChapterRepository 前执行一次。
   * 重复调用会复用 ConfigManager 缓存。
   */
  async loadConfig(): Promise<void> {
    const configManager = ConfigManager.getInstance();
    const data = await configManager.loadConfig<ChapterDataList>(
      ChapterRepository.CHAPTER_DATA_PATH,
    );

    this._buildMaps(data);
    this._loaded = true;
  }

  /** 是否已加载配置 */
  isLoaded(): boolean {
    return this._loaded;
  }

  // ==================== 章节查询 ====================

  /**
   * 获取单个章节配置。
   *
   * @param chapterId  章节 ID
   * @returns          章节配置，不存在时返回 null
   */
  getChapter(chapterId: string): ChapterConfig | null {
    return this._chapterMap.get(chapterId) ?? null;
  }

  /**
   * 获取所有章节配置列表（按 chapterIndex 升序）。
   *
   * @returns  章节配置数组
   */
  getAllChapters(): ChapterConfig[] {
    return Array.from(this._chapterMap.values()).sort(
      (a, b) => a.chapterIndex - b.chapterIndex,
    );
  }

  /**
   * 获取所有章节 ID 列表（按 chapterIndex 升序）。
   *
   * @returns  章节 ID 数组
   */
  getAllChapterIds(): string[] {
    return this.getAllChapters().map((c) => c.id);
  }

  /**
   * 判断章节配置是否存在。
   *
   * @param chapterId  章节 ID
   * @returns          是否存在对应配置
   */
  hasChapter(chapterId: string): boolean {
    return this._chapterMap.has(chapterId);
  }

  // ==================== 关卡查询 ====================

  /**
   * 获取单个关卡配置。
   *
   * @param stageId  关卡 ID
   * @returns        关卡配置，不存在时返回 null
   */
  getStage(stageId: string): StageConfig | null {
    return this._stageMap.get(stageId) ?? null;
  }

  /**
   * 获取某章节的所有关卡配置（按 stageIndex 升序）。
   *
   * @param chapterId  章节 ID
   * @returns          关卡配置数组
   */
  getStagesByChapter(chapterId: string): StageConfig[] {
    const chapter = this._chapterMap.get(chapterId);
    if (!chapter) return [];
    return [...chapter.stages].sort((a, b) => a.stageIndex - b.stageIndex);
  }

  /**
   * 获取某章节的关卡数量。
   *
   * @param chapterId  章节 ID
   * @returns          关卡数量
   */
  getStageCount(chapterId: string): number {
    const chapter = this._chapterMap.get(chapterId);
    return chapter ? chapter.stages.length : 0;
  }

  /**
   * 获取某章节的第一个关卡配置。
   *
   * @param chapterId  章节 ID
   * @returns          首个关卡配置
   */
  getFirstStageOfChapter(chapterId: string): StageConfig | null {
    const stages = this.getStagesByChapter(chapterId);
    return stages.length > 0 ? stages[0] : null;
  }

  /**
   * 获取某章节的最后一个关卡配置。
   *
   * @param chapterId  章节 ID
   * @returns          最后一个关卡配置
   */
  getLastStageOfChapter(chapterId: string): StageConfig | null {
    const stages = this.getStagesByChapter(chapterId);
    return stages.length > 0 ? stages[stages.length - 1] : null;
  }

  /**
   * 获取某关卡的下一个关卡配置（同章节内）。
   *
   * @param stageId  当前关卡 ID
   * @returns        下一关卡配置，已是最后一关时返回 null
   */
  getNextStage(stageId: string): StageConfig | null {
    const current = this._stageMap.get(stageId);
    if (!current) return null;

    const stages = this.getStagesByChapter(current.chapterId);
    const nextIndex = stages.findIndex((s) => s.id === stageId);
    if (nextIndex < 0 || nextIndex >= stages.length - 1) return null;

    return stages[nextIndex + 1];
  }

  /**
   * 获取章节推荐的最高战力（取所有关卡推荐战力最大值）。
   *
   * @param chapterId  章节 ID
   * @returns          推荐战力
   */
  getChapterRecommendedPower(chapterId: string): number {
    const chapter = this._chapterMap.get(chapterId);
    if (!chapter || chapter.stages.length === 0) return 0;

    let maxPower = 0;
    for (const stage of chapter.stages) {
      if (stage.recommendedPower > maxPower) {
        maxPower = stage.recommendedPower;
      }
    }
    return maxPower;
  }

  /**
   * 获取已缓存章节配置数量。
   */
  getChapterCount(): number {
    return this._chapterMap.size;
  }

  /**
   * 获取已缓存关卡配置总数。
   */
  getTotalStageCount(): number {
    return this._stageMap.size;
  }

  // ==================== 内部方法 ====================

  /** 从 ChapterDataList 构建配置映射 */
  private _buildMaps(data: ChapterDataList): void {
    const chapterMap = new Map<string, ChapterConfig>();
    const stageMap = new Map<string, StageConfig>();

    for (const chapterEntry of data.data) {
      // 深拷贝 stages 数组及其奖励
      const stages: StageConfig[] = [];
      for (const stage of chapterEntry.stages) {
        const clonedStage: StageConfig = {
          ...stage,
          rewards: stage.rewards.map((r) => ({ ...r })),
          unlockCondition: { ...stage.unlockCondition },
        };
        stages.push(clonedStage);
        stageMap.set(stage.id, clonedStage);
      }

      const clonedChapter: ChapterConfig = {
        ...chapterEntry,
        unlockCondition: { ...chapterEntry.unlockCondition },
        stages,
      };
      chapterMap.set(chapterEntry.id, clonedChapter);
    }

    if (chapterMap.size === 0) {
      throw new Error('[ChapterRepository] chapter_data.json 未包含任何章节配置');
    }

    this._chapterMap = chapterMap;
    this._stageMap = stageMap;
  }
}
