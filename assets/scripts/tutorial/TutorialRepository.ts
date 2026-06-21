// ============================================================
// TutorialRepository — Phase9-Step9 新手引导配置仓库
// 职责：加载 tutorial_data.json / 提供引导组 & 步骤查询
// 边界：不操作存档 / 不修改运行时状态 / 不发射事件
// ============================================================

import { ConfigManager } from '../core/ConfigManager';
import type {
  TutorialConfigData,
  TutorialGroup,
  TutorialStep,
} from './TutorialTypes';

export class TutorialRepository {
  // ==================== 静态常量 ====================

  /** 引导配置路径（相对 resources/） */
  static readonly CONFIG_PATH = 'config/tutorial/tutorial_data';

  // ==================== 内部状态 ====================

  /** 已加载的引导配置 */
  private _config: TutorialConfigData | null = null;

  /** groupId → TutorialGroup 快速索引 */
  private _groupMap: Map<string, TutorialGroup> = new Map();

  /** stepId → TutorialStep 快速索引 */
  private _stepMap: Map<string, TutorialStep> = new Map();

  /** 按优先级降序排列的引导组列表（缓存） */
  private _sortedGroups: TutorialGroup[] = [];

  // ==================== 配置加载 ====================

  /**
   * 加载引导配置。
   *
   * 调用时机：TutorialSystem.initialize() 中调用。
   * 加载成功后构建 groupMap、stepMap、sortedGroups 索引。
   */
  async loadConfig(): Promise<void> {
    const configManager = ConfigManager.getInstance();
    const config = await configManager.loadConfig<TutorialConfigData>(
      TutorialRepository.CONFIG_PATH,
    );

    this._config = config;
    this._buildIndexes(config);
  }

  /** 是否已完成配置加载 */
  isConfigLoaded(): boolean {
    return this._config !== null;
  }

  /** 获取配置版本号 */
  getConfigVersion(): number {
    return this._config?.version ?? 0;
  }

  // ==================== 引导组查询 ====================

  /**
   * 获取指定引导组。
   *
   * @param groupId  引导组 ID
   * @returns        引导组，不存在时返回 null
   */
  getGroup(groupId: string): TutorialGroup | null {
    return this._groupMap.get(groupId) ?? null;
  }

  /**
   * 获取所有引导组（按优先级降序排序）。
   */
  getAllGroups(): TutorialGroup[] {
    return this._sortedGroups;
  }

  /**
   * 获取第一个引导组（优先级最高、无依赖或依赖已满足的）。
   *
   * @param completedGroupIds  已完成的引导组 ID 列表
   * @param skippedGroupIds    已跳过的引导组 ID 列表
   * @returns                  第一个可开始的引导组，无可用时返回 null
   */
  getFirstAvailableGroup(
    completedGroupIds: string[],
    skippedGroupIds: string[],
  ): TutorialGroup | null {
    const unavailable = new Set([...completedGroupIds, ...skippedGroupIds]);

    for (const group of this._sortedGroups) {
      if (unavailable.has(group.groupId)) {
        continue;
      }

      // 检查依赖是否已满足
      if (group.dependencies && group.dependencies.length > 0) {
        const depsMet = group.dependencies.every((depId) =>
          completedGroupIds.includes(depId),
        );
        if (!depsMet) {
          continue;
        }
      }

      return group;
    }

    return null;
  }

  /**
   * 检查引导组是否存在。
   */
  hasGroup(groupId: string): boolean {
    return this._groupMap.has(groupId);
  }

  /** 获取引导组总数 */
  getGroupCount(): number {
    return this._groupMap.size;
  }

  // ==================== 引导步骤查询 ====================

  /**
   * 获取指定步骤。
   *
   * @param stepId  步骤 ID
   * @returns       步骤，不存在时返回 null
   */
  getStep(stepId: string): TutorialStep | null {
    return this._stepMap.get(stepId) ?? null;
  }

  /**
   * 获取引导组的所有步骤（按 order 升序排序）。
   *
   * @param groupId  引导组 ID
   * @returns        步骤列表
   */
  getGroupSteps(groupId: string): TutorialStep[] {
    const group = this._groupMap.get(groupId);
    if (!group) {
      return [];
    }
    return [...group.steps].sort((a, b) => a.order - b.order);
  }

  /**
   * 获取引导组的下一个步骤。
   *
   * @param groupId      引导组 ID
   * @param currentOrder  当前步骤的 order
   * @returns             下一步骤，无剩余步骤时返回 null
   */
  getNextStep(groupId: string, currentOrder: number): TutorialStep | null {
    const steps = this.getGroupSteps(groupId);
    for (const step of steps) {
      if (step.order > currentOrder) {
        return step;
      }
    }
    return null;
  }

  /**
   * 获取引导组的第一个步骤。
   */
  getFirstStep(groupId: string): TutorialStep | null {
    const steps = this.getGroupSteps(groupId);
    return steps.length > 0 ? steps[0] : null;
  }

  /**
   * 获取引导组的最后一个步骤。
   */
  getLastStep(groupId: string): TutorialStep | null {
    const steps = this.getGroupSteps(groupId);
    return steps.length > 0 ? steps[steps.length - 1] : null;
  }

  /** 获取所有步骤总数 */
  getTotalStepCount(): number {
    return this._stepMap.size;
  }

  // ==================== 内部方法 ====================

  /**
   * 构建快速索引。
   */
  private _buildIndexes(config: TutorialConfigData): void {
    this._groupMap.clear();
    this._stepMap.clear();
    this._sortedGroups = [];

    if (!config.groups || config.groups.length === 0) {
      console.warn('[TutorialRepository] 配置中无引导组数据');
      return;
    }

    for (const group of config.groups) {
      // 校验必填字段
      if (!group.groupId || typeof group.groupId !== 'string') {
        console.warn(`[TutorialRepository] 跳过无效引导组: groupId 缺失`);
        continue;
      }

      // 校验步骤
      if (!group.steps || !Array.isArray(group.steps)) {
        console.warn(`[TutorialRepository] 引导组 ${group.groupId} 无步骤，跳过`);
        continue;
      }

      this._groupMap.set(group.groupId, group);

      // 索引步骤
      for (const step of group.steps) {
        if (!step.stepId || typeof step.stepId !== 'string') {
          console.warn(`[TutorialRepository] 跳过无效步骤: groupId=${group.groupId}`);
          continue;
        }
        this._stepMap.set(step.stepId, step);
      }
    }

    // 按优先级降序排序
    this._sortedGroups = Array.from(this._groupMap.values()).sort(
      (a, b) => b.priority - a.priority,
    );

    console.log(
      `[TutorialRepository] 配置加载完成: ` +
      `${this._groupMap.size} 引导组, ${this._stepMap.size} 步骤`,
    );
  }
}
