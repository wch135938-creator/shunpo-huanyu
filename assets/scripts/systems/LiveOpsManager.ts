// ============================================================
// LiveOpsManager — Phase7-Step7 运营活动管理器
// 职责：管理运营活动刷新 / 激活查询 / 时间校验
// 边界：逻辑层，不操作 UI、Canvas、Camera
// ============================================================

import { BaseSystem } from '../core/BaseSystem';
import type { LiveOpsConfig, LiveOpsState } from '../data/liveops_types';
import { createDefaultLiveOpsState } from '../data/liveops_types';
import type { ValidationResult, ValidationIssue, ValidationSeverity } from '../save/SaveValidator';

/** 运营活动管理器接口 */
export interface ILiveOpsManager {
  /** 刷新活动列表 */
  refreshEvents(configs: LiveOpsConfig[]): void;
  /** 获取当前活跃的活动 ID 列表 */
  getActiveEvents(): string[];
  /** 检查指定活动是否活跃 */
  isEventActive(eventId: string): boolean;
  /** 获取所有活动配置 */
  getAllConfigs(): LiveOpsConfig[];
  /** 校验运营活动状态 */
  validateLiveOpsState(): ValidationResult;
  /** 校验运营活动配置 */
  validateLiveOpsConfigs(configs: LiveOpsConfig[]): ValidationResult;
}

export class LiveOpsManager extends BaseSystem implements ILiveOpsManager {
  // ==================== 内部状态 ====================

  /** 运营活动状态 */
  private _state: LiveOpsState;

  /** 已加载的活动配置缓存 */
  private _configCache: Map<string, LiveOpsConfig> = new Map();

  // ==================== 构造 ====================

  constructor() {
    super();
    this._state = createDefaultLiveOpsState();
  }

  // ==================== 初始化 ====================

  /** 加载存档中的运营活动状态 */
  loadState(state: LiveOpsState): void {
    if (!state || !Array.isArray(state.activeEventIds)) {
      this._state = createDefaultLiveOpsState();
      return;
    }
    this._state = {
      activeEventIds: [...state.activeEventIds],
      lastRefreshAt: state.lastRefreshAt ?? 0,
    };
  }

  /** 导出存档数据 */
  getState(): LiveOpsState {
    return {
      activeEventIds: [...this._state.activeEventIds],
      lastRefreshAt: this._state.lastRefreshAt,
    };
  }

  /** 加载活动配置 */
  loadConfigs(configs: LiveOpsConfig[]): void {
    this._configCache.clear();
    for (const config of configs) {
      this._configCache.set(config.id, config);
    }
  }

  // ==================== 活动管理 ====================

  /** 刷新活动列表（根据当前时间过滤已过期的活动） */
  refreshEvents(configs?: LiveOpsConfig[]): void {
    if (configs) {
      this.loadConfigs(configs);
    }

    const now = Date.now();
    const activeIds: string[] = [];

    for (const [id, config] of this._configCache) {
      if (this._isWithinTimeRange(config, now)) {
        activeIds.push(id);
      }
    }

    this._state.activeEventIds = activeIds;
    this._state.lastRefreshAt = now;
  }

  /** 获取当前活跃的活动 ID 列表 */
  getActiveEvents(): string[] {
    return [...this._state.activeEventIds];
  }

  /** 检查指定活动是否活跃 */
  isEventActive(eventId: string): boolean {
    return this._state.activeEventIds.includes(eventId);
  }

  /** 获取所有活动配置 */
  getAllConfigs(): LiveOpsConfig[] {
    return Array.from(this._configCache.values());
  }

  /** 获取指定活动配置 */
  getConfig(eventId: string): LiveOpsConfig | null {
    return this._configCache.get(eventId) ?? null;
  }

  // ==================== 校验 ====================

  /** 校验运营活动状态 */
  validateLiveOpsState(): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (!Array.isArray(this._state.activeEventIds)) {
      issues.push(this._issue('liveOpsState.activeEventIds', 'error', 'activeEventIds 不是数组'));
    } else {
      for (const id of this._state.activeEventIds) {
        if (!id || typeof id !== 'string') {
          issues.push(this._issue('liveOpsState.activeEventIds', 'error', `无效的活动 ID: ${id}`));
        }
      }
    }

    if (typeof this._state.lastRefreshAt !== 'number' || this._state.lastRefreshAt < 0) {
      issues.push(this._issue('liveOpsState.lastRefreshAt', 'error', 'lastRefreshAt 无效'));
    }

    return this._result(issues);
  }

  /** 校验运营活动配置 */
  validateLiveOpsConfigs(configs: LiveOpsConfig[]): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (!configs || configs.length === 0) {
      return this._result([]);
    }

    // ID 唯一性
    const idSet = new Set<string>();
    for (const config of configs) {
      if (idSet.has(config.id)) {
        issues.push(this._issue(`liveOpsConfig.${config.id}`, 'error', '活动配置 ID 重复'));
      }
      idSet.add(config.id);
    }

    // 逐条校验
    for (const config of configs) {
      const base = `liveOpsConfig.${config.id}`;

      // 时间合法性
      if (typeof config.startTime !== 'number' || !Number.isFinite(config.startTime) || config.startTime < 0) {
        issues.push(this._issue(`${base}.startTime`, 'error', `startTime 无效: ${config.startTime}`));
      }

      if (typeof config.endTime !== 'number' || !Number.isFinite(config.endTime) || config.endTime < 0) {
        issues.push(this._issue(`${base}.endTime`, 'error', `endTime 无效: ${config.endTime}`));
      }

      if (
        typeof config.startTime === 'number' &&
        typeof config.endTime === 'number' &&
        config.startTime > config.endTime
      ) {
        issues.push(this._issue(
          `${base}.timeRange`,
          'error',
          `开始时间 (${config.startTime}) 晚于结束时间 (${config.endTime})`,
        ));
      }

      // rewardPoolRefs 合法性
      if (!config.rewardPoolRefs || !Array.isArray(config.rewardPoolRefs) || config.rewardPoolRefs.length === 0) {
        issues.push(this._issue(`${base}.rewardPoolRefs`, 'warning', 'rewardPoolRefs 为空'));
      } else {
        for (const ref of config.rewardPoolRefs) {
          if (!ref || typeof ref !== 'string') {
            issues.push(this._issue(`${base}.rewardPoolRefs`, 'error', `无效的奖励池引用: ${ref}`));
          }
        }
      }

      // eventPoolRefs 合法性
      if (!config.eventPoolRefs || !Array.isArray(config.eventPoolRefs) || config.eventPoolRefs.length === 0) {
        issues.push(this._issue(`${base}.eventPoolRefs`, 'warning', 'eventPoolRefs 为空'));
      } else {
        for (const ref of config.eventPoolRefs) {
          if (!ref || typeof ref !== 'string') {
            issues.push(this._issue(`${base}.eventPoolRefs`, 'error', `无效的事件池引用: ${ref}`));
          }
        }
      }

      // version 合法性
      if (typeof config.version !== 'number' || config.version < 1) {
        issues.push(this._issue(`${base}.version`, 'error', `version 无效: ${config.version}`));
      }
    }

    return this._result(issues);
  }

  // ==================== 内部辅助 ====================

  private _isWithinTimeRange(config: LiveOpsConfig, now: number): boolean {
    return now >= config.startTime && now <= config.endTime;
  }

  private _issue(path: string, severity: ValidationSeverity, message: string): ValidationIssue {
    return { path, severity, message };
  }

  private _result(issues: ValidationIssue[]): ValidationResult {
    const errors = issues.filter((i) => i.severity === 'error');
    const warnings = issues.filter((i) => i.severity === 'warning');

    return {
      valid: errors.length === 0,
      issues,
      errorCount: errors.length,
      warningCount: warnings.length,
    };
  }
}
