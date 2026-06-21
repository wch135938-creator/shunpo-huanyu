// ============================================================
// SpecialEventManager — Phase7-Step7 特殊事件管理器
// 职责：管理特殊事件触发 / 完成 / 状态查询 / 校验
// 边界：逻辑层，不操作 UI、Canvas、Camera
// ============================================================

import { BaseSystem } from '../core/BaseSystem';
import type {
  SpecialEventConfig,
  SpecialEventState,
  SpecialEventCondition,
  EventTriggerType,
} from '../data/specialevent_types';
import { createDefaultSpecialEventState, VALID_TRIGGER_TYPES } from '../data/specialevent_types';
import type { ValidationResult, ValidationIssue, ValidationSeverity } from '../save/SaveValidator';

/** 特殊事件管理器接口 */
export interface ISpecialEventManager {
  /** 触发事件 */
  triggerEvent(eventId: string, triggerType: EventTriggerType): SpecialEventState | null;
  /** 完成事件 */
  completeEvent(eventId: string): SpecialEventState | null;
  /** 获取事件状态 */
  getEventState(eventId: string): SpecialEventState | null;
  /** 获取所有事件状态 */
  getAllEventStates(): SpecialEventState[];
  /** 校验事件状态 */
  validateSpecialEventState(eventId: string): ValidationResult;
  /** 校验事件配置 */
  validateSpecialEventConfigs(configs: SpecialEventConfig[]): ValidationResult;
}

export class SpecialEventManager extends BaseSystem implements ISpecialEventManager {
  // ==================== 内部状态 ====================

  /** 事件状态列表 */
  private _eventStates: SpecialEventState[] = [];

  /** 事件配置缓存 */
  private _configCache: Map<string, SpecialEventConfig> = new Map();

  // ==================== 构造 ====================

  constructor() {
    super();
  }

  // ==================== 初始化 ====================

  /** 加载存档中的事件状态 */
  loadStates(states: SpecialEventState[]): void {
    if (!Array.isArray(states)) {
      this._eventStates = [];
      return;
    }
    this._eventStates = states.map((s) => ({ ...s }));
  }

  /** 导出存档数据 */
  getStates(): SpecialEventState[] {
    return this._eventStates.map((s) => ({ ...s }));
  }

  /** 加载事件配置 */
  loadConfigs(configs: SpecialEventConfig[]): void {
    this._configCache.clear();
    for (const config of configs) {
      this._configCache.set(config.id, config);
    }
  }

  // ==================== 事件管理 ====================

  /** 触发事件（创建或获取事件状态） */
  triggerEvent(eventId: string, triggerType: EventTriggerType): SpecialEventState | null {
    if (!eventId) {
      console.error('[SpecialEventManager] triggerEvent: eventId 为空');
      return null;
    }

    const config = this._configCache.get(eventId);
    if (config && config.triggerType !== triggerType) {
      console.warn(
        `[SpecialEventManager] 事件 ${eventId} 的触发类型 (${config.triggerType}) 与请求类型 (${triggerType}) 不匹配`,
      );
    }

    // 检查是否已存在
    const existing = this._findEventState(eventId);
    if (existing) {
      return { ...existing };
    }

    // 创建新状态
    const state = createDefaultSpecialEventState(eventId);
    this._eventStates.push(state);
    return { ...state };
  }

  /** 完成事件 */
  completeEvent(eventId: string): SpecialEventState | null {
    const existing = this._findEventState(eventId);
    if (!existing) {
      console.error(`[SpecialEventManager] completeEvent: 事件 ${eventId} 不存在`);
      return null;
    }

    if (existing.completed) {
      console.warn(`[SpecialEventManager] 事件 ${eventId} 已完成，跳过`);
      return { ...existing };
    }

    existing.completed = true;
    existing.completedAt = Date.now();
    return { ...existing };
  }

  /** 获取事件状态 */
  getEventState(eventId: string): SpecialEventState | null {
    const existing = this._findEventState(eventId);
    return existing ? { ...existing } : null;
  }

  /** 获取所有事件状态 */
  getAllEventStates(): SpecialEventState[] {
    return this._eventStates.map((s) => ({ ...s }));
  }

  /** 获取已完成的事件数 */
  getCompletedCount(): number {
    return this._eventStates.filter((s) => s.completed).length;
  }

  /** 获取事件总数 */
  getEventCount(): number {
    return this._eventStates.length;
  }

  // ==================== 校验 ====================

  /** 校验单个事件状态 */
  validateSpecialEventState(eventId: string): ValidationResult {
    const issues: ValidationIssue[] = [];
    const existing = this._findEventState(eventId);

    if (!existing) {
      issues.push(this._issue('specialEventState', 'error', `事件 ${eventId} 的状态不存在`));
      return this._result(issues);
    }

    if (!existing.eventId || typeof existing.eventId !== 'string') {
      issues.push(this._issue('specialEventState.eventId', 'error', 'eventId 无效'));
    }

    if (typeof existing.completed !== 'boolean') {
      issues.push(this._issue('specialEventState.completed', 'error', 'completed 类型错误'));
    }

    if (existing.completed && typeof existing.completedAt !== 'number') {
      issues.push(this._issue('specialEventState.completedAt', 'warning', '已完成事件缺少 completedAt'));
    }

    return this._result(issues);
  }

  /** 校验特殊事件配置 */
  validateSpecialEventConfigs(configs: SpecialEventConfig[]): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (!configs || configs.length === 0) {
      return this._result([]);
    }

    // ID 唯一性
    const idSet = new Set<string>();
    for (const config of configs) {
      if (idSet.has(config.id)) {
        issues.push(this._issue(`specialEventConfig.${config.id}`, 'error', '事件配置 ID 重复'));
      }
      idSet.add(config.id);
    }

    // 逐条校验
    for (const config of configs) {
      const base = `specialEventConfig.${config.id}`;

      // triggerType 合法性
      if (!config.triggerType || !VALID_TRIGGER_TYPES.includes(config.triggerType)) {
        issues.push(this._issue(
          `${base}.triggerType`,
          'error',
          `无效的触发类型: ${config.triggerType}（有效值: ${VALID_TRIGGER_TYPES.join(', ')}）`,
        ));
      }

      // rewardSourceRefs 合法性
      if (!config.rewardSourceRefs || !Array.isArray(config.rewardSourceRefs) || config.rewardSourceRefs.length === 0) {
        issues.push(this._issue(`${base}.rewardSourceRefs`, 'warning', 'rewardSourceRefs 为空'));
      } else {
        for (const ref of config.rewardSourceRefs) {
          if (!ref || typeof ref !== 'string') {
            issues.push(this._issue(`${base}.rewardSourceRefs`, 'error', `无效的奖励来源引用: ${ref}`));
          }
        }
      }

      // conditions 合法性
      if (config.conditions && Array.isArray(config.conditions)) {
        const validConditionTypes = [
          'minLevel', 'maxLevel', 'minPower', 'hasHero',
          'hasItem', 'dungeonClear', 'loginCount', 'custom',
        ];

        for (let i = 0; i < config.conditions.length; i++) {
          const condition = config.conditions[i];
          if (!validConditionTypes.includes(condition.type)) {
            issues.push(this._issue(
              `${base}.conditions[${i}]`,
              'error',
              `无效的条件类型: ${condition.type}（有效值: ${validConditionTypes.join(', ')}）`,
            ));
          }

          if (!condition.params || typeof condition.params !== 'object') {
            issues.push(this._issue(
              `${base}.conditions[${i}].params`,
              'warning',
              '条件参数为空',
            ));
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

  private _findEventState(eventId: string): SpecialEventState | null {
    return this._eventStates.find((s) => s.eventId === eventId) ?? null;
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
