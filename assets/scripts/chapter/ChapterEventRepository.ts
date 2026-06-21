// ============================================================
// ChapterEventRepository — Phase10-Step3 章节事件配置仓库
// 职责：加载/缓存 chapter_event_config.json，按章节/事件ID查询
// 边界：不包含业务逻辑、不修改配置、不涉及运行时状态
// ============================================================

import { BaseSystem } from '../core/BaseSystem';
import { ConfigManager } from '../core/ConfigManager';
import type {
  ChapterEventConfig,
  ChapterEventConfigList,
} from './ChapterEventTypes';

export class ChapterEventRepository extends BaseSystem {

  // ==================== 配置路径常量 ====================

  /** chapter_event_config.json 路径（相对 resources/，不含扩展名） */
  static readonly CONFIG_PATH = `${ConfigManager.CONFIG_ROOT}/chapter/chapter_event_config`;

  // ==================== 内部状态 ====================

  /** 事件配置缓存：eventId → ChapterEventConfig */
  private _eventMap: Map<string, ChapterEventConfig> = new Map();

  /** 配置是否已加载 */
  private _loaded = false;

  // ==================== 单例 ====================

  static getInstance(): ChapterEventRepository {
    return super.getInstance<ChapterEventRepository>();
  }

  // ==================== 初始化 ====================

  /**
   * 加载 chapter_event_config.json 配置。
   *
   * 调用方应在使用 ChapterEventRepository 前执行一次。
   * 重复调用会复用 ConfigManager 缓存。
   */
  async load(): Promise<void> {
    if (this._loaded) {
      console.warn('[ChapterEventRepository] 已加载，跳过重复 load');
      return;
    }

    const configManager = ConfigManager.getInstance();
    const data = await configManager.loadConfig<ChapterEventConfigList>(
      ChapterEventRepository.CONFIG_PATH,
    );

    this._buildMap(data);
    this._loaded = true;
    console.log(
      `[ChapterEventRepository] 加载完成，共 ${this._eventMap.size} 个章节事件配置`,
    );
  }

  /** 是否已加载配置 */
  isLoaded(): boolean {
    return this._loaded;
  }

  // ==================== 查询接口 ====================

  /**
   * 获取指定事件配置。
   *
   * @param eventId  事件 ID
   * @returns        事件配置，不存在时返回 null
   */
  getEvent(eventId: string): ChapterEventConfig | null {
    return this._eventMap.get(eventId) ?? null;
  }

  /**
   * 获取某章节的所有事件配置。
   *
   * @param chapterId  章节 ID
   * @returns          事件配置数组
   */
  getEventsByChapter(chapterId: string): ChapterEventConfig[] {
    const result: ChapterEventConfig[] = [];
    for (const event of this._eventMap.values()) {
      if (event.chapterId === chapterId) {
        result.push(event);
      }
    }
    return result;
  }

  /**
   * 获取所有事件配置列表。
   *
   * @returns  事件配置数组
   */
  getAll(): ChapterEventConfig[] {
    return Array.from(this._eventMap.values());
  }

  /**
   * 获取已缓存的事件配置数量。
   */
  getCount(): number {
    return this._eventMap.size;
  }

  // ==================== 内部方法 ====================

  /** 从 ChapterEventConfigList 构建配置映射 */
  private _buildMap(data: ChapterEventConfigList): void {
    const map = new Map<string, ChapterEventConfig>();

    if (!data.events || !Array.isArray(data.events)) {
      console.warn('[ChapterEventRepository] chapter_event_config.json 数据为空');
      this._eventMap = map;
      return;
    }

    for (const entry of data.events) {
      const cloned: ChapterEventConfig = {
        id: entry.id,
        chapterId: entry.chapterId,
        name: entry.name,
        description: entry.description,
        weight: entry.weight,
        type: entry.type,
        iconPath: entry.iconPath,
        triggerCondition: {
          minChapterCompletions: entry.triggerCondition.minChapterCompletions,
          bossOnlyStages: entry.triggerCondition.bossOnlyStages,
        },
      };
      map.set(entry.id, cloned);
    }

    this._eventMap = map;
  }
}
