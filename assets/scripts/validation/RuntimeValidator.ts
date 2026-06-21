// ============================================================
// RuntimeValidator — Phase7 运行时校验器
// 职责：对结算结果、地牢推进、经验更新等运行时操作进行领域约束校验
// 边界：只读，不修改数据，不依赖配置加载状态
// ============================================================

import { BaseSystem } from '../core/BaseSystem';
import type {
  DungeonRunState,
  RewardSource,
  RewardGrant,
  BranchPath,
  FloorTransition,
  HeroProgressStateV2,
  ProgressTrackState,
  PowerFormulaConfigV2,
} from '../data/roguelike_types';
import type { EventConfig, EventResult, EventHistoryRecord } from '../data/event_types';
import type { DropHistoryRecord, PitySnapshot } from '../data/drop_types';
import type { HeroPowerResult, TeamPowerResult, PowerRecalculateBatchResult } from '../data/power_types';
import type { ArtifactState } from '../data/artifact_types';
import type { LiveOpsState } from '../data/liveops_types';
import type { SpecialEventState } from '../data/specialevent_types';
import type { ValidationResult, ValidationIssue, ValidationSeverity } from '../save/SaveValidator';

// ---- 常量 ----

/** 单次结算最大金幣 */
const MAX_SETTLE_GOLD = 999999;
/** 单次结算最大经验 */
const MAX_SETTLE_EXP = 999999;
/** 单次结算最大装备数 */
const MAX_SETTLE_EQUIPMENT = 50;
/** 单次经验更新最大经验 */
const MAX_EXP_PER_UPDATE = 999999;
/** 合理等级范围 */
const MIN_LEVEL = 1;
const MAX_LEVEL = 1000;

export class RuntimeValidator extends BaseSystem {

  // ==================== 结算校验 ====================

  /**
   * 校验一次结算结果是否满足领域约束。
   *
   * 检查项：
   * - 奖励来源非空
   * - 各项奖励数值在合理范围内
   * - 奖励来源类型与内容匹配
   *
   * @param rewards  待发放的奖励列表
   * @param source   奖励来源
   * @returns        校验结果
   */
  validateSettlement(rewards: RewardGrant[], source: RewardSource): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (!rewards || rewards.length === 0) {
      return this._result(issues); // 空奖励不报错
    }

    if (!source) {
      issues.push(this._issue('source', 'error', '奖励来源为空'));
      return this._result(issues);
    }

    if (!source.sourceId) {
      issues.push(this._issue('source.sourceId', 'error', '来源 ID 为空'));
    }

    // 逐项校验
    let totalGold = 0;
    let totalExp = 0;
    let equipmentCount = 0;

    for (let i = 0; i < rewards.length; i++) {
      const reward = rewards[i];
      const base = `rewards[${i}]`;

      if (!reward.rewardId) {
        issues.push(this._issue(`${base}.rewardId`, 'error', '奖励 ID 为空'));
      }

      if (typeof reward.quantity !== 'number' || reward.quantity <= 0) {
        issues.push(this._issue(`${base}.quantity`, 'error', `奖励数量无效: ${reward.quantity}`));
      }

      switch (reward.rewardType) {
        case 'gold':
          totalGold += reward.quantity;
          break;
        case 'exp':
          totalExp += reward.quantity;
          break;
        case 'equipment':
          equipmentCount += reward.quantity;
          break;
        case 'item':
        case 'currency':
          break;
        default:
          issues.push(this._issue(
            `${base}.rewardType`,
            'warning',
            `未知奖励类型: ${reward.rewardType}`,
          ));
      }
    }

    // 上限检查
    if (totalGold > MAX_SETTLE_GOLD) {
      issues.push(this._issue('rewards.gold', 'warning', `金币总量 ${totalGold} 超过建议上限`));
    }
    if (totalExp > MAX_SETTLE_EXP) {
      issues.push(this._issue('rewards.exp', 'warning', `经验总量 ${totalExp} 超过建议上限`));
    }
    if (equipmentCount > MAX_SETTLE_EQUIPMENT) {
      issues.push(this._issue('rewards.equipment', 'warning', `装备数量 ${equipmentCount} 超过建议上限`));
    }

    return this._result(issues);
  }

  // ==================== 地牢推进校验 ====================

  /**
   * 校验地牢推进操作的合法性。
   *
   * 检查项：
   * - 运行状态非空且处于活跃状态
   * - 节点遍历合法性（当前节点 -> 目标节点是否在 nextNodeIds 中）
   * - 重复访问检测（非恶意场景不抛错，仅警告）
   *
   * @param state         当前运行状态
   * @param targetNodeId  目标节点 ID
   * @param validNextIds  合法的下一节点 ID 列表（由 RoguelikeSystem 提供）
   * @returns             校验结果
   */
  validateDungeonProgress(
    state: DungeonRunState,
    targetNodeId: string,
    validNextIds: string[],
  ): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (!state) {
      issues.push(this._issue('state', 'error', '运行状态为空'));
      return this._result(issues);
    }

    // 检查运行是否活跃
    if (state.startedAt <= 0) {
      issues.push(this._issue('state.startedAt', 'error', '运行未开始或已结束'));
    }

    // 检查目标节点是否合法
    if (!targetNodeId) {
      issues.push(this._issue('targetNodeId', 'error', '目标节点 ID 为空'));
      return this._result(issues);
    }

    if (validNextIds.length === 0) {
      issues.push(this._issue('validNextIds', 'warning', '没有可用的下一节点'));
    } else if (!validNextIds.includes(targetNodeId)) {
      issues.push(this._issue(
        'targetNodeId',
        'error',
        `目标节点 ${targetNodeId} 不在合法路径中（合法: ${validNextIds.join(', ')}）`,
      ));
    }

    // 检查重复访问
    if (state.visitedNodeIds.includes(targetNodeId)) {
      issues.push(this._issue(
        'targetNodeId',
        'warning',
        `节点 ${targetNodeId} 已被访问过`,
      ));
    }

    // 检查运行时长（防止异常长时间运行）
    const elapsed = Date.now() - state.startedAt;
    const MAX_RUN_DURATION_MS = 24 * 60 * 60 * 1000; // 24 小时
    if (elapsed > MAX_RUN_DURATION_MS) {
      issues.push(this._issue('state.startedAt', 'warning', '运行时间超过 24 小时'));
    }

    return this._result(issues);
  }

  // ==================== 经验更新校验 ====================

  /**
   * 校验经验更新操作。
   *
   * 检查项：
   * - 经验值非负且不超过上限
   * - 等级在合理范围内
   *
   * @param heroId   英雄 ID
   * @param expGain  经验增量
   * @param oldLevel 更新前等级
   * @param newLevel 更新后等级
   * @returns        校验结果
   */
  validateExpUpdate(
    heroId: string,
    expGain: number,
    oldLevel: number,
    newLevel: number,
  ): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (!heroId) {
      issues.push(this._issue('heroId', 'error', '英雄 ID 为空'));
    }

    if (typeof expGain !== 'number' || !Number.isFinite(expGain)) {
      issues.push(this._issue('expGain', 'error', `经验增量无效: ${expGain}`));
    } else if (expGain < 0) {
      issues.push(this._issue('expGain', 'error', `经验增量为负数: ${expGain}`));
    } else if (expGain > MAX_EXP_PER_UPDATE) {
      issues.push(this._issue('expGain', 'warning', `经验增量 ${expGain} 超过建议上限`));
    }

    if (oldLevel < MIN_LEVEL || oldLevel > MAX_LEVEL) {
      issues.push(this._issue('oldLevel', 'error', `更新前等级超出范围: ${oldLevel}`));
    }

    if (newLevel < MIN_LEVEL || newLevel > MAX_LEVEL) {
      issues.push(this._issue('newLevel', 'error', `更新后等级超出范围: ${newLevel}`));
    }

    if (newLevel < oldLevel && expGain >= 0) {
      issues.push(this._issue('levelChange', 'warning', `等级下降: ${oldLevel} → ${newLevel}`));
    }

    return this._result(issues);
  }

  // ==================== 奖励来源校验 ====================

  /**
   * 校验奖励来源合法性。
   *
   * @param source  奖励来源
   * @returns       校验结果
   */
  validateRewardSource(source: RewardSource): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (!source) {
      issues.push(this._issue('source', 'error', '奖励来源为空'));
      return this._result(issues);
    }

    if (!source.sourceId) {
      issues.push(this._issue('source.sourceId', 'error', '来源 ID 为空'));
    }

    const validSourceTypes = [
      'dungeon_node', 'dungeon_boss', 'dungeon_event',
      'quest', 'achievement', 'shop', 'compensation', 'season',
    ];
    if (!validSourceTypes.includes(source.sourceType)) {
      issues.push(this._issue(
        'source.sourceType',
        'error',
        `无效的来源类型: ${source.sourceType}`,
      ));
    }

    if ((!source.dropTableRefs || source.dropTableRefs.length === 0)
      && (!source.rewardPoolRefs || source.rewardPoolRefs.length === 0)) {
      issues.push(this._issue(
        'source',
        'warning',
        '奖励来源既无 dropTableRefs 也无 rewardPoolRefs，不会产生任何奖励',
      ));
    }

    return this._result(issues);
  }

  // ==================== Phase7-Step2: 分支路径校验 ====================

  /**
   * 校验分支路径选择的合法性。
   *
   * 检查项：
   * - 分支路径存在且有效
   * - chosenNodeId 不为空
   * - forkNodeId 不为空
   * - skippedNodeIds 数量合理
   *
   * @param branchPath  分支路径
   * @returns           校验结果
   */
  validateBranchPath(branchPath: BranchPath): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (!branchPath) {
      issues.push(this._issue('branchPath', 'error', '分支路径为空'));
      return this._result(issues);
    }

    if (!branchPath.forkNodeId) {
      issues.push(this._issue('branchPath.forkNodeId', 'error', '分叉节点 ID 为空'));
    }

    if (!branchPath.chosenNodeId) {
      issues.push(this._issue('branchPath.chosenNodeId', 'error', '选择的节点 ID 为空'));
    }

    if (branchPath.chosenNodeId === branchPath.forkNodeId) {
      issues.push(this._issue(
        'branchPath.chosenNodeId',
        'error',
        `选择的节点 ${branchPath.chosenNodeId} 不能与分叉节点相同`,
      ));
    }

    if (!branchPath.skippedNodeIds || branchPath.skippedNodeIds.length === 0) {
      issues.push(this._issue(
        'branchPath.skippedNodeIds',
        'warning',
        '跳过的节点列表为空（非分叉选择，可能是直路）',
      ));
    }

    if (branchPath.skippedNodeIds && branchPath.skippedNodeIds.length > 10) {
      issues.push(this._issue(
        'branchPath.skippedNodeIds',
        'warning',
        `跳过的节点数量 (${branchPath.skippedNodeIds.length}) 过多`,
      ));
    }

    if (typeof branchPath.chosenAt !== 'number' || branchPath.chosenAt <= 0) {
      issues.push(this._issue('branchPath.chosenAt', 'error', '选择时间戳无效'));
    }

    return this._result(issues);
  }

  /**
   * 校验楼层转换的合法性。
   *
   * 检查项：
   * - 转换记录完整
   * - fromLayerId/toLayerId 不同
   * - 方向有效
   * - 原因有效
   * - 时间戳合理
   *
   * @param transition  楼层转换记录
   * @param maxLayers   地牢总层数（用于边界检查）
   * @returns           校验结果
   */
  validateFloorTransition(
    transition: FloorTransition,
    maxLayers?: number,
  ): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (!transition) {
      issues.push(this._issue('transition', 'error', '楼层转换为空'));
      return this._result(issues);
    }

    if (!transition.transitionId) {
      issues.push(this._issue('transition.transitionId', 'error', '转换 ID 为空'));
    }

    if (!transition.fromLayerId) {
      issues.push(this._issue('transition.fromLayerId', 'error', '出发层 ID 为空'));
    }

    if (!transition.toLayerId) {
      issues.push(this._issue('transition.toLayerId', 'error', '目标层 ID 为空'));
    }

    if (transition.fromLayerId === transition.toLayerId) {
      issues.push(this._issue(
        'transition.toLayerId',
        'error',
        `出发层与目标层相同: ${transition.fromLayerId}`,
      ));
    }

    if (!transition.fromNodeId || !transition.toNodeId) {
      issues.push(this._issue('transition', 'warning', '转换的节点 ID 不完整'));
    }

    const validDirections: FloorTransition['direction'][] = ['forward', 'backward', 'warp'];
    if (!validDirections.includes(transition.direction)) {
      issues.push(this._issue(
        'transition.direction',
        'error',
        `无效的转换方向: ${transition.direction}`,
      ));
    }

    const validReasons: FloorTransition['reason'][] = [
      'layerComplete', 'bossDefeated', 'warpItem', 'debug',
    ];
    if (!validReasons.includes(transition.reason)) {
      issues.push(this._issue(
        'transition.reason',
        'error',
        `无效的转换原因: ${transition.reason}`,
      ));
    }

    if (typeof transition.transitionedAt !== 'number' || transition.transitionedAt <= 0) {
      issues.push(this._issue('transition.transitionedAt', 'error', '转换时间戳无效'));
    }

    // 检查时间戳不会过于久远
    const MAX_TRANSITION_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
    if (transition.transitionedAt > 0 && (Date.now() - transition.transitionedAt) > MAX_TRANSITION_AGE_MS) {
      issues.push(this._issue(
        'transition.transitionedAt',
        'warning',
        '楼层转换记录超过 24 小时，可能属于异常存档',
      ));
    }

    return this._result(issues);
  }

  // ==================== Phase7-Step3: 事件解析校验 ====================

  /**
   * 校验事件解析结果的合法性。
   *
   * 检查项：
   * - 事件配置存在且有效
   * - 奖励来源合法性
   * - 领域事件完整性
   * - 后续事件引用有效
   *
   * @param result  事件解析结果
   * @param config  事件配置（用于交叉校验）
   * @returns       校验结果
   */
  validateEventResolution(result: EventResult, config?: EventConfig): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (!result) {
      issues.push(this._issue('result', 'error', '事件解析结果为空'));
      return this._result(issues);
    }

    if (!result.eventId) {
      issues.push(this._issue('result.eventId', 'error', '事件 ID 为空'));
    }

    if (!result.emittedEvents || result.emittedEvents.length === 0) {
      issues.push(this._issue('result.emittedEvents', 'warning', '事件解析未产生领域事件'));
    }

    // 检查每个领域事件都有 correlationId
    for (let i = 0; i < result.emittedEvents.length; i++) {
      const evt = result.emittedEvents[i];
      if (!evt.correlationId) {
        issues.push(this._issue(
          `result.emittedEvents[${i}].correlationId`,
          'error',
          '领域事件缺少 correlationId',
        ));
      }
    }

    // 奖励来源校验
    if (result.rewards && result.rewards.length > 0) {
      for (let i = 0; i < result.rewards.length; i++) {
        const reward = result.rewards[i];
        const rewardIssues = this.validateRewardSource(reward).issues;
        for (const issue of rewardIssues) {
          issues.push({
            ...issue,
            path: `result.rewards[${i}].${issue.path}`,
          });
        }
      }
    }

    // 与 config 交叉校验
    if (config) {
      if (result.eventId !== config.id) {
        issues.push(this._issue(
          'result.eventId',
          'warning',
          `事件结果 ID (${result.eventId}) 与配置 ID (${config.id}) 不匹配`,
        ));
      }

      if (config.rewardSourceRefs && config.rewardSourceRefs.length > 0) {
        if (!result.rewards || result.rewards.length === 0) {
          issues.push(this._issue(
            'result.rewards',
            'warning',
            `事件配置有 ${config.rewardSourceRefs.length} 个奖励来源，但解析结果为空`,
          ));
        }
      }
    }

    if (typeof result.completedAt !== 'number' || result.completedAt <= 0) {
      issues.push(this._issue('result.completedAt', 'error', '事件完成时间戳无效'));
    }

    return this._result(issues);
  }

  // ==================== Phase7-Step3: 事件历史校验 ====================

  /**
   * 校验事件历史记录的完整性。
   *
   * 检查项：
   * - runId 非空
   * - eventId 非空
   * - nodeId 非空
   * - layerId 非空
   * - correlationId 非空
   * - createdAt 有效
   * - rewards 奖励结构合法
   *
   * @param record  事件历史记录
   * @returns       校验结果
   */
  validateEventHistory(record: EventHistoryRecord): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (!record) {
      issues.push(this._issue('record', 'error', '事件历史记录为空'));
      return this._result(issues);
    }

    if (!record.id) {
      issues.push(this._issue('record.id', 'error', '记录 ID 为空'));
    }

    if (!record.runId) {
      issues.push(this._issue('record.runId', 'error', '运行 ID 为空'));
    }

    if (!record.eventId) {
      issues.push(this._issue('record.eventId', 'error', '事件 ID 为空'));
    }

    if (!record.nodeId) {
      issues.push(this._issue('record.nodeId', 'error', '节点 ID 为空'));
    }

    if (!record.layerId) {
      issues.push(this._issue('record.layerId', 'error', '层 ID 为空'));
    }

    if (!record.correlationId) {
      issues.push(this._issue('record.correlationId', 'error', '关联 ID 为空'));
    }

    if (typeof record.createdAt !== 'number' || record.createdAt <= 0) {
      issues.push(this._issue('record.createdAt', 'error', '创建时间戳无效'));
    }

    // 检查时间戳合理性（不超过未来 5 分钟）
    if (record.createdAt > Date.now() + 5 * 60 * 1000) {
      issues.push(this._issue('record.createdAt', 'warning', '创建时间戳在未来 5 分钟以外'));
    }

    // 检查奖励结构
    if (record.rewards) {
      for (let i = 0; i < record.rewards.length; i++) {
        const reward = record.rewards[i];
        if (!reward.rewardId) {
          issues.push(this._issue(`record.rewards[${i}].rewardId`, 'error', '奖励 ID 为空'));
        }
        if (typeof reward.quantity !== 'number' || reward.quantity <= 0) {
          issues.push(this._issue(
            `record.rewards[${i}].quantity`,
            'warning',
            `奖励数量无效: ${reward.quantity}`,
          ));
        }
      }
    }

    return this._result(issues);
  }

  // ==================== Phase7-Step4: 掉落历史校验 ====================

  /**
   * 校验 DropHistoryRecord 的完整性。
   *
   * 检查项：
   * - 记录非空、ID 非空
   * - playerId / sourceId / sourceType 非空
   * - dropTableVersion > 0
   * - seed 非空
   * - rewards 数组结构与数量合理性
   * - pityBefore / pityAfter 非空
   * - createdAt 有效
   *
   * @param record  掉落历史记录
   * @returns       校验结果
   */
  validateDropHistory(record: DropHistoryRecord): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (!record) {
      issues.push(this._issue('record', 'error', '掉落历史记录为空'));
      return this._result(issues);
    }

    // 基础字段
    if (!record.id) {
      issues.push(this._issue('record.id', 'error', '记录 ID 为空'));
    }

    if (!record.playerId) {
      issues.push(this._issue('record.playerId', 'error', '玩家 ID 为空'));
    }

    if (!record.sourceId) {
      issues.push(this._issue('record.sourceId', 'error', '来源 ID 为空'));
    }

    if (!record.sourceType) {
      issues.push(this._issue('record.sourceType', 'error', '来源类型为空'));
    }

    // 版本号
    if (typeof record.dropTableVersion !== 'number' || record.dropTableVersion <= 0) {
      issues.push(this._issue('record.dropTableVersion', 'error', `掉落表版本号无效: ${record.dropTableVersion}`));
    }

    // 种子
    if (!record.seed) {
      issues.push(this._issue('record.seed', 'warning', '随机种子为空'));
    }

    // 奖励列表
    if (!Array.isArray(record.rewards)) {
      issues.push(this._issue('record.rewards', 'error', '奖励列表不是数组'));
    } else {
      const MAX_REWARDS_PER_RECORD = 200;
      if (record.rewards.length > MAX_REWARDS_PER_RECORD) {
        issues.push(this._issue(
          'record.rewards',
          'warning',
          `单次结算奖励数量 (${record.rewards.length}) 超过建议上限 ${MAX_REWARDS_PER_RECORD}`,
        ));
      }

      // 逐项校验奖励
      for (let i = 0; i < record.rewards.length; i++) {
        const reward = record.rewards[i];
        if (!reward.rewardId) {
          issues.push(this._issue(`record.rewards[${i}].rewardId`, 'error', '奖励 ID 为空'));
        }
        if (!reward.rewardType) {
          issues.push(this._issue(`record.rewards[${i}].rewardType`, 'error', '奖励类型为空'));
        }
        if (typeof reward.quantity !== 'number' || reward.quantity <= 0) {
          issues.push(this._issue(
            `record.rewards[${i}].quantity`,
            'warning',
            `奖励数量无效: ${reward.quantity}`,
          ));
        }
      }
    }

    // 保底快照
    if (!record.pityBefore) {
      issues.push(this._issue('record.pityBefore', 'error', '结算前保底快照缺失'));
    } else {
      const pityIssues = this.validatePitySnapshot(record.pityBefore, 'record.pityBefore').issues;
      issues.push(...pityIssues);
    }

    if (!record.pityAfter) {
      issues.push(this._issue('record.pityAfter', 'error', '结算后保底快照缺失'));
    } else {
      const pityIssues = this.validatePitySnapshot(record.pityAfter, 'record.pityAfter').issues;
      issues.push(...pityIssues);
    }

    // 时间戳
    if (typeof record.createdAt !== 'number' || record.createdAt <= 0) {
      issues.push(this._issue('record.createdAt', 'error', '创建时间戳无效'));
    } else if (record.createdAt > Date.now() + 5 * 60 * 1000) {
      issues.push(this._issue('record.createdAt', 'warning', '创建时间戳在未来 5 分钟以外'));
    }

    return this._result(issues);
  }

  // ==================== Phase7-Step4: 保底快照校验 ====================

  /**
   * 校验 PitySnapshot 的完整性。
   *
   * 检查项：
   * - 快照非空
   * - pityCounters 为有效对象
   * - 所有计数器值非负
   * - lastResetAt 有效
   *
   * @param snapshot  保底快照
   * @param path      快照在父结构中的路径（用于错误定位）
   * @returns         校验结果
   */
  validatePitySnapshot(snapshot: PitySnapshot, path: string = 'snapshot'): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (!snapshot) {
      issues.push(this._issue(path, 'error', '保底快照为空'));
      return this._result(issues);
    }

    // 计数器对象
    if (!snapshot.pityCounters || typeof snapshot.pityCounters !== 'object') {
      issues.push(this._issue(`${path}.pityCounters`, 'error', '保底计数器缺失或类型错误'));
    } else {
      for (const [key, count] of Object.entries(snapshot.pityCounters)) {
        if (typeof count !== 'number' || !Number.isFinite(count)) {
          issues.push(this._issue(
            `${path}.pityCounters.${key}`,
            'error',
            `计数器值无效: ${count}`,
          ));
        } else if (count < 0) {
          issues.push(this._issue(
            `${path}.pityCounters.${key}`,
            'warning',
            `计数器值为负: ${count}`,
          ));
        } else if (count > 10000) {
          issues.push(this._issue(
            `${path}.pityCounters.${key}`,
            'warning',
            `计数器值异常偏高: ${count}`,
          ));
        }
      }
    }

    // 重置时间戳
    if (typeof snapshot.lastResetAt !== 'number' || !Number.isFinite(snapshot.lastResetAt)) {
      issues.push(this._issue(`${path}.lastResetAt`, 'warning', '重置时间戳无效'));
    } else if (snapshot.lastResetAt < 0) {
      issues.push(this._issue(`${path}.lastResetAt`, 'warning', '重置时间戳为负数'));
    }

    return this._result(issues);
  }

  // ==================== Phase7-Step5: 英雄多轨成长状态校验 ====================

  /**
   * 校验英雄多轨成长状态。
   *
   * 检查项：
   * - heroId 非空
   * - tracks 对象存在且每个轨道 trackId 唯一
   * - 每个轨道的 level 在合理范围内（≥ 1）
   * - 每个轨道的 exp ≥ 0
   * - unlockedMilestoneIds 无重复
   * - version > 0
   * - totalExpReceived ≥ 0
   * - updatedAt 有效（非负数，非未来时间）
   *
   * @param heroState  英雄成长状态（V2）
   * @param maxLevels  trackId → maxLevel 映射（用于范围校验，可选）
   * @returns          校验结果
   */
  validateHeroProgressState(
    heroState: HeroProgressStateV2,
    maxLevels?: Record<string, number>,
  ): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (!heroState) {
      issues.push(this._issue('heroState', 'error', '英雄成长状态为空'));
      return this._result(issues);
    }

    // heroId
    if (!heroState.heroId || typeof heroState.heroId !== 'string') {
      issues.push(this._issue('heroState.heroId', 'error', 'heroId 缺失或类型错误'));
    }

    // tracks
    if (!heroState.tracks || typeof heroState.tracks !== 'object') {
      issues.push(this._issue('heroState.tracks', 'error', 'tracks 缺失或类型错误'));
    } else {
      const trackEntries = Object.entries(heroState.tracks);

      if (trackEntries.length === 0) {
        issues.push(this._issue('heroState.tracks', 'warning', 'tracks 为空（英雄无成长轨道）'));
      }

      // 检查是否有重复的 trackId（Record 天然去重，但做防御检查）
      const trackIdsInState = new Set<string>();

      for (const [trackId, trackState] of trackEntries) {
        const base = `heroState.tracks.${trackId}`;

        if (trackIdsInState.has(trackId)) {
          issues.push(this._issue(base, 'error', `轨道 ID 重复: ${trackId}`));
        }
        trackIdsInState.add(trackId);

        if (!trackState) {
          issues.push(this._issue(base, 'error', `轨道状态为空`));
          continue;
        }

        // trackId 一致性
        if (trackState.trackId !== trackId) {
          issues.push(this._issue(
            `${base}.trackId`,
            'error',
            `轨道 key (${trackId}) 与 trackState.trackId (${trackState.trackId}) 不一致`,
          ));
        }

        // level
        if (typeof trackState.level !== 'number' || !Number.isFinite(trackState.level)) {
          issues.push(this._issue(`${base}.level`, 'error', `level 无效: ${trackState.level}`));
        } else if (trackState.level < 1) {
          issues.push(this._issue(`${base}.level`, 'error', `level 不能小于 1: ${trackState.level}`));
        } else if (trackState.level > 1000) {
          issues.push(this._issue(`${base}.level`, 'warning', `level 超过合理上限: ${trackState.level}`));
        }

        // level 与 maxLevel 交叉校验
        if (maxLevels && trackState.level > 1) {
          const maxLevel = maxLevels[trackId];
          if (maxLevel !== undefined && trackState.level > maxLevel) {
            issues.push(this._issue(
              `${base}.level`,
              'error',
              `level (${trackState.level}) 超过配置的 maxLevel (${maxLevel})`,
            ));
          }
        }

        // exp
        if (typeof trackState.exp !== 'number' || !Number.isFinite(trackState.exp)) {
          issues.push(this._issue(`${base}.exp`, 'error', `exp 无效: ${trackState.exp}`));
        } else if (trackState.exp < 0) {
          issues.push(this._issue(`${base}.exp`, 'error', `exp 不能为负数: ${trackState.exp}`));
        } else if (trackState.exp > 99999999) {
          issues.push(this._issue(`${base}.exp`, 'warning', `exp 超过合理上限: ${trackState.exp}`));
        }

        // unlockedMilestoneIds
        if (!Array.isArray(trackState.unlockedMilestoneIds)) {
          issues.push(this._issue(
            `${base}.unlockedMilestoneIds`,
            'error',
            'unlockedMilestoneIds 不是数组',
          ));
        } else {
          // 检查重复 milestone ID
          const milestoneSet = new Set<string>();
          for (const mId of trackState.unlockedMilestoneIds) {
            if (milestoneSet.has(mId)) {
              issues.push(this._issue(
                `${base}.unlockedMilestoneIds`,
                'warning',
                `重复的里程碑 ID: ${mId}`,
              ));
            }
            milestoneSet.add(mId);
          }

          if (trackState.unlockedMilestoneIds.length > 500) {
            issues.push(this._issue(
              `${base}.unlockedMilestoneIds`,
              'warning',
              `里程碑数量过多: ${trackState.unlockedMilestoneIds.length}`,
            ));
          }
        }

        // version
        if (typeof trackState.version !== 'number' || !Number.isFinite(trackState.version)) {
          issues.push(this._issue(`${base}.version`, 'error', `version 无效: ${trackState.version}`));
        } else if (trackState.version < 1) {
          issues.push(this._issue(`${base}.version`, 'error', `version 不能小于 1: ${trackState.version}`));
        }
      }
    }

    // totalExpReceived
    if (typeof heroState.totalExpReceived !== 'number' || !Number.isFinite(heroState.totalExpReceived)) {
      issues.push(this._issue(
        'heroState.totalExpReceived',
        'error',
        `totalExpReceived 无效: ${heroState.totalExpReceived}`,
      ));
    } else if (heroState.totalExpReceived < 0) {
      issues.push(this._issue(
        'heroState.totalExpReceived',
        'error',
        `totalExpReceived 不能为负数: ${heroState.totalExpReceived}`,
      ));
    }

    // updatedAt
    if (typeof heroState.updatedAt !== 'number' || !Number.isFinite(heroState.updatedAt)) {
      issues.push(this._issue('heroState.updatedAt', 'error', `updatedAt 无效: ${heroState.updatedAt}`));
    } else if (heroState.updatedAt < 0) {
      issues.push(this._issue('heroState.updatedAt', 'error', `updatedAt 为负数: ${heroState.updatedAt}`));
    } else if (heroState.updatedAt > Date.now() + 5 * 60 * 1000) {
      issues.push(this._issue('heroState.updatedAt', 'warning', 'updatedAt 在未来 5 分钟以外'));
    }

    // 交叉校验：totalExpReceived 与各轨道 exp 之和的一致性
    let totalTrackExp = 0;
    if (heroState.tracks) {
      for (const trackState of Object.values(heroState.tracks)) {
        if (trackState && typeof trackState.exp === 'number' && trackState.exp > 0) {
          totalTrackExp += trackState.exp;
        }
      }
    }
    // totalExpReceived 是累计值（含已消费的 exp），所以应该 ≥ 各轨道当前 exp 之和
    if (heroState.totalExpReceived < totalTrackExp) {
      issues.push(this._issue(
        'heroState.totalExpReceived',
        'warning',
        `totalExpReceived (${heroState.totalExpReceived}) 小于各轨道 exp 之和 (${totalTrackExp})`,
      ));
    }

    return this._result(issues);
  }

  // ==================== Phase7-Step6: 战力计算校验 ====================

  /**
   * 校验战力计算结果。
   *
   * 检查项：
   * - heroId 非空
   * - power ≥ 0
   * - formulaVersion > 0 且与当前公式一致（如提供）
   * - inputSummary 结构完整
   * - outputSummary 结构完整
   * - delta 合理（如存在）
   *
   * @param result            战力计算结果
   * @param activeFormulaVersion  当前活跃公式版本（可选，用于一致性校验）
   * @returns                 校验结果
   */
  validatePowerCalculation(
    result: HeroPowerResult,
    activeFormulaVersion?: number,
  ): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (!result) {
      issues.push(this._issue('result', 'error', '战力计算结果为空'));
      return this._result(issues);
    }

    // heroId
    if (!result.heroId || typeof result.heroId !== 'string') {
      issues.push(this._issue('result.heroId', 'error', 'heroId 缺失或类型错误'));
    }

    // power ≥ 0
    if (typeof result.power !== 'number' || !Number.isFinite(result.power)) {
      issues.push(this._issue('result.power', 'error', `power 无效: ${result.power}`));
    } else if (result.power < 0) {
      issues.push(this._issue('result.power', 'error', `power 为负数: ${result.power}`));
    } else if (result.power > 99999999) {
      issues.push(this._issue('result.power', 'warning', `power 超出合理上限: ${result.power}`));
    }

    // formulaVersion
    if (typeof result.formulaVersion !== 'number' || !Number.isFinite(result.formulaVersion)) {
      issues.push(this._issue(
        'result.formulaVersion',
        'error',
        `formulaVersion 无效: ${result.formulaVersion}`,
      ));
    } else if (result.formulaVersion < 1) {
      issues.push(this._issue(
        'result.formulaVersion',
        'error',
        `formulaVersion 必须 > 0: ${result.formulaVersion}`,
      ));
    } else if (
      activeFormulaVersion !== undefined &&
      result.formulaVersion !== activeFormulaVersion
    ) {
      issues.push(this._issue(
        'result.formulaVersion',
        'warning',
        `formulaVersion (${result.formulaVersion}) 与活跃版本 (${activeFormulaVersion}) 不一致`,
      ));
    }

    // inputSummary 结构完整
    if (!result.inputSummary || typeof result.inputSummary !== 'object') {
      issues.push(this._issue('result.inputSummary', 'error', 'inputSummary 缺失或类型错误'));
    } else if (Object.keys(result.inputSummary).length === 0) {
      issues.push(this._issue('result.inputSummary', 'warning', 'inputSummary 为空'));
    } else {
      for (const [stat, value] of Object.entries(result.inputSummary)) {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          issues.push(this._issue(
            `result.inputSummary.${stat}`,
            'error',
            `输入属性 ${stat} 值无效: ${value}`,
          ));
        } else if (value < 0) {
          issues.push(this._issue(
            `result.inputSummary.${stat}`,
            'warning',
            `输入属性 ${stat} 为负数: ${value}`,
          ));
        }
      }
    }

    // outputSummary 结构完整
    if (!result.outputSummary || typeof result.outputSummary !== 'object') {
      issues.push(this._issue('result.outputSummary', 'error', 'outputSummary 缺失或类型错误'));
    } else if (Object.keys(result.outputSummary).length === 0) {
      issues.push(this._issue('result.outputSummary', 'warning', 'outputSummary 为空'));
    } else {
      for (const [stat, value] of Object.entries(result.outputSummary)) {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          issues.push(this._issue(
            `result.outputSummary.${stat}`,
            'error',
            `输出属性 ${stat} 值无效: ${value}`,
          ));
        }
      }
    }

    // delta 合理性
    if (result.delta !== undefined) {
      if (typeof result.delta !== 'number' || !Number.isFinite(result.delta)) {
        issues.push(this._issue('result.delta', 'error', `delta 无效: ${result.delta}`));
      } else if (Math.abs(result.delta) > 10000000) {
        issues.push(this._issue(
          'result.delta',
          'warning',
          `delta 异常偏大: ${result.delta}`,
        ));
      }
    }

    return this._result(issues);
  }

  /**
   * 校验团队战力计算结果。
   *
   * @param result              团队战力计算结果
   * @param activeFormulaVersion 活跃公式版本（可选）
   * @returns                   校验结果
   */
  validateTeamPowerCalculation(
    result: TeamPowerResult,
    activeFormulaVersion?: number,
  ): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (!result) {
      issues.push(this._issue('result', 'error', '团队战力计算结果为空'));
      return this._result(issues);
    }

    // correlationId
    if (!result.correlationId) {
      issues.push(this._issue('result.correlationId', 'error', 'correlationId 缺失'));
    }

    // totalPower ≥ 0
    if (typeof result.totalPower !== 'number' || !Number.isFinite(result.totalPower)) {
      issues.push(this._issue('result.totalPower', 'error', `totalPower 无效: ${result.totalPower}`));
    } else if (result.totalPower < 0) {
      issues.push(this._issue('result.totalPower', 'error', `totalPower 为负数: ${result.totalPower}`));
    }

    // 各英雄计算结果校验
    if (!Array.isArray(result.individualResults)) {
      issues.push(this._issue('result.individualResults', 'error', 'individualResults 不是数组'));
    } else {
      let sumPower = 0;
      for (let i = 0; i < result.individualResults.length; i++) {
        const heroResult = result.individualResults[i];
        const heroIssues = this.validatePowerCalculation(heroResult, activeFormulaVersion).issues;
        for (const issue of heroIssues) {
          issues.push({
            ...issue,
            path: `result.individualResults[${i}].${issue.path}`,
          });
        }
        if (heroResult.power > 0) {
          sumPower += heroResult.power;
        }
      }

      // 交叉校验：totalPower 与各英雄 power 之和是否一致
      if (result.individualResults.length > 0 && result.totalPower >= 0) {
        const tolerance = Math.max(100, result.totalPower * 0.05);
        if (Math.abs(result.totalPower - sumPower) > tolerance) {
          issues.push(this._issue(
            'result.totalPower',
            'warning',
            `totalPower (${result.totalPower}) 与各英雄战力之和 (${sumPower}) 差异过大`,
          ));
        }
      }
    }

    return this._result(issues);
  }

  /**
   * 校验批量战力重算结果。
   *
   * @param result  批量重算结果
   * @returns       校验结果
   */
  validateBatchRecalculation(result: PowerRecalculateBatchResult): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (!result) {
      issues.push(this._issue('result', 'error', '批量重算结果为空'));
      return this._result(issues);
    }

    // correlationId
    if (!result.correlationId) {
      issues.push(this._issue('result.correlationId', 'error', 'correlationId 缺失'));
    }

    // heroCount 与实际结果数一致
    if (result.heroCount !== result.heroResults.length) {
      issues.push(this._issue(
        'result.heroCount',
        'warning',
        `heroCount (${result.heroCount}) 与 heroResults 长度 (${result.heroResults.length}) 不一致`,
      ));
    }

    // newTotalPower ≥ 0
    if (typeof result.newTotalPower !== 'number' || !Number.isFinite(result.newTotalPower)) {
      issues.push(this._issue('result.newTotalPower', 'error', `newTotalPower 无效`));
    } else if (result.newTotalPower < 0) {
      issues.push(this._issue('result.newTotalPower', 'error', `newTotalPower 为负数`));
    }

    // totalPowerDelta 合理性
    if (result.totalPowerDelta !== undefined) {
      if (typeof result.totalPowerDelta !== 'number' || !Number.isFinite(result.totalPowerDelta)) {
        issues.push(this._issue('result.totalPowerDelta', 'error', `totalPowerDelta 无效`));
      } else if (Math.abs(result.totalPowerDelta) > 100000000) {
        issues.push(this._issue(
          'result.totalPowerDelta',
          'warning',
          `totalPowerDelta 异常偏大: ${result.totalPowerDelta}`,
        ));
      }
    }

    // formulaVersion > 0
    if (typeof result.formulaVersion !== 'number' || result.formulaVersion < 1) {
      issues.push(this._issue('result.formulaVersion', 'error', `formulaVersion 无效`));
    }

    // 检查错误与跳过数量一致性
    if (result.errors.length > 0 && result.skippedCount === 0) {
      issues.push(this._issue('result', 'warning', '有错误记录但 skippedCount=0'));
    }

    return this._result(issues);
  }

  // ==================== Phase7-Step7: 神器状态校验 ====================

  /**
   * 校验神器运行时状态。
   *
   * 检查项：
   * - artifactId 非空
   * - level ≥ 1
   * - obtainedAt 有效
   *
   * @param state  神器状态
   * @returns      校验结果
   */
  validateArtifactState(state: ArtifactState): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (!state) {
      issues.push(this._issue('artifactState', 'error', '神器状态为空'));
      return this._result(issues);
    }

    if (!state.artifactId || typeof state.artifactId !== 'string') {
      issues.push(this._issue('artifactState.artifactId', 'error', 'artifactId 缺失或类型错误'));
    }

    if (typeof state.level !== 'number' || !Number.isFinite(state.level) || state.level < 1) {
      issues.push(this._issue('artifactState.level', 'error', `level 无效: ${state.level}`));
    } else if (state.level > 1000) {
      issues.push(this._issue('artifactState.level', 'warning', `level 异常偏高: ${state.level}`));
    }

    if (typeof state.obtainedAt !== 'number' || state.obtainedAt <= 0) {
      issues.push(this._issue('artifactState.obtainedAt', 'error', `obtainedAt 无效: ${state.obtainedAt}`));
    } else if (state.obtainedAt > Date.now() + 5 * 60 * 1000) {
      issues.push(this._issue('artifactState.obtainedAt', 'warning', 'obtainedAt 在未来 5 分钟以外'));
    }

    return this._result(issues);
  }

  // ==================== Phase7-Step7: 运营活动状态校验 ====================

  /**
   * 校验运营活动运行时状态。
   *
   * 检查项：
   * - activeEventIds 为有效数组
   * - lastRefreshAt ≥ 0
   * - 所有活动 ID 格式合法
   *
   * @param state  运营活动状态
   * @returns      校验结果
   */
  validateLiveOpsState(state: LiveOpsState): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (!state) {
      issues.push(this._issue('liveOpsState', 'error', '运营活动状态为空'));
      return this._result(issues);
    }

    if (!Array.isArray(state.activeEventIds)) {
      issues.push(this._issue('liveOpsState.activeEventIds', 'error', 'activeEventIds 不是数组'));
    } else {
      for (let i = 0; i < state.activeEventIds.length; i++) {
        const id = state.activeEventIds[i];
        if (!id || typeof id !== 'string') {
          issues.push(this._issue(
            `liveOpsState.activeEventIds[${i}]`,
            'error',
            `无效的活动 ID: ${id}`,
          ));
        }
      }

      if (state.activeEventIds.length > 100) {
        issues.push(this._issue(
          'liveOpsState.activeEventIds',
          'warning',
          `活跃活动数量 (${state.activeEventIds.length}) 超过建议上限 100`,
        ));
      }
    }

    if (typeof state.lastRefreshAt !== 'number' || !Number.isFinite(state.lastRefreshAt)) {
      issues.push(this._issue('liveOpsState.lastRefreshAt', 'error', `lastRefreshAt 无效: ${state.lastRefreshAt}`));
    } else if (state.lastRefreshAt < 0) {
      issues.push(this._issue('liveOpsState.lastRefreshAt', 'error', 'lastRefreshAt 为负数'));
    } else if (state.lastRefreshAt > Date.now() + 5 * 60 * 1000) {
      issues.push(this._issue('liveOpsState.lastRefreshAt', 'warning', 'lastRefreshAt 在未来 5 分钟以外'));
    }

    return this._result(issues);
  }

  // ==================== Phase7-Step7: 特殊事件状态校验 ====================

  /**
   * 校验特殊事件运行时状态。
   *
   * 检查项：
   * - eventId 非空
   * - completed 为 boolean
   * - completedAt 在合理范围内（如果已完成）
   *
   * @param state  特殊事件状态
   * @returns      校验结果
   */
  validateSpecialEventState(state: SpecialEventState): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (!state) {
      issues.push(this._issue('specialEventState', 'error', '特殊事件状态为空'));
      return this._result(issues);
    }

    if (!state.eventId || typeof state.eventId !== 'string') {
      issues.push(this._issue('specialEventState.eventId', 'error', 'eventId 缺失或类型错误'));
    }

    if (typeof state.completed !== 'boolean') {
      issues.push(this._issue('specialEventState.completed', 'error', 'completed 类型错误'));
    }

    if (state.completed) {
      if (state.completedAt !== undefined && typeof state.completedAt !== 'number') {
        issues.push(this._issue('specialEventState.completedAt', 'error', `completedAt 类型错误: ${state.completedAt}`));
      } else if (typeof state.completedAt === 'number' && state.completedAt <= 0) {
        issues.push(this._issue('specialEventState.completedAt', 'warning', 'completedAt 为无效时间戳'));
      } else if (typeof state.completedAt === 'number' && state.completedAt > Date.now() + 5 * 60 * 1000) {
        issues.push(this._issue('specialEventState.completedAt', 'warning', 'completedAt 在未来 5 分钟以外'));
      }
    }

    return this._result(issues);
  }

  // ==================== 内部辅助 ====================

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
