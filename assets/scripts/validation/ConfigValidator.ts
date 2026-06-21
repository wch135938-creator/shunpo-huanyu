// ============================================================
// ConfigValidator — Phase7 配置校验器
// 职责：对地牢图、掉落表、奖励池、成长曲线、战力公式配置进行静态校验
// 边界：只读，不修改数据，不依赖运行时系统状态
// ============================================================

import { BaseSystem } from '../core/BaseSystem';
import type {
  DungeonConfigV2,
  DungeonLayerConfig,
  DungeonNodeConfig,
  RewardPoolConfigV2,
  DropTableConfigV2,
  GrowthCurveConfig,
  PowerFormulaConfigV2,
} from '../data/roguelike_types';
import type { EventPool, EventConfig } from '../data/event_types';
import type { PityRule } from '../data/drop_types';
import type { ProgressTrackConfig } from '../data/progress_types';
import type { ArtifactConfig } from '../data/artifact_types';
import { VALID_ARTIFACT_RARITIES } from '../data/artifact_types';
import type { LiveOpsConfig } from '../data/liveops_types';
import type { SpecialEventConfig } from '../data/specialevent_types';
import { VALID_TRIGGER_TYPES } from '../data/specialevent_types';
import type { ValidationResult, ValidationIssue, ValidationSeverity } from '../save/SaveValidator';

// ---- 常量 ----

/** 最大层数上限 */
const MAX_LAYERS = 100;
/** 最大节点数（单层） */
const MAX_NODES_PER_LAYER = 50;
/** 最大奖励池嵌套深度 */
const MAX_POOL_NESTING_DEPTH = 10;

export class ConfigValidator extends BaseSystem {

  // ==================== 地牢图校验 ====================

  /**
   * 校验地牢配置图的完整性。
   *
   * 检查项：
   * - 层数组非空
   * - 每层有入口节点（没有其他节点指向它的第一个节点，或显式标记）
   * - 每层有出口节点（completionRules 可达）
   * - 节点图无非法断链（nextNodeIds 指向不存在的节点）
   * - 所有节点可达（从入口 BFS）
   * - Boss 引用有效（bossRef 在 bossRefs 中存在）
   *
   * @param config  地牢配置
   * @returns       校验结果
   */
  validateDungeonGraph(config: DungeonConfigV2): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (!config) {
      return this._fail('root', 'DungeonConfigV2 为 null');
    }

    // 层数组非空
    if (!config.layers || config.layers.length === 0) {
      issues.push(this._issue('layers', 'error', '地牢层数组为空'));
      return this._result(issues);
    }

    if (config.layers.length > MAX_LAYERS) {
      issues.push(this._issue('layers', 'warning', `层数 ${config.layers.length} 超过建议上限 ${MAX_LAYERS}`));
    }

    // 逐层校验
    for (const layer of config.layers) {
      const layerIssues = this._validateLayer(layer, config);
      issues.push(...layerIssues);
    }

    // Boss 引用有效性
    if (config.bossRefs && config.bossRefs.length > 0) {
      for (const bossRef of config.bossRefs) {
        // 检查至少有一个节点引用了这个 Boss
        let found = false;
        for (const layer of config.layers) {
          for (const node of layer.nodeGraph) {
            if (node.bossRef === bossRef) {
              found = true;
              break;
            }
          }
          if (found) break;
        }
        if (!found) {
          issues.push(this._issue(
            `bossRefs.${bossRef}`,
            'warning',
            `Boss 引用 ${bossRef} 未被任何节点使用`,
          ));
        }
      }
    }

    // 版本号校验
    if (typeof config.version !== 'number' || config.version < 1) {
      issues.push(this._issue('version', 'error', `配置版本号无效: ${config.version}`));
    }

    return this._result(issues);
  }

  /**
   * 校验单层节点图。
   */
  private _validateLayer(layer: DungeonLayerConfig, config: DungeonConfigV2): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const base = `layers[${layer.order}]`;

    if (!layer.nodeGraph || layer.nodeGraph.length === 0) {
      issues.push(this._issue(`${base}.nodeGraph`, 'error', '节点图为空'));
      return issues;
    }

    if (layer.nodeGraph.length > MAX_NODES_PER_LAYER) {
      issues.push(this._issue(
        `${base}.nodeGraph`, 'warning',
        `节点数 ${layer.nodeGraph.length} 超过建议上限 ${MAX_NODES_PER_LAYER}`,
      ));
    }

    // 构建节点 ID 集合
    const nodeIdSet = new Set(layer.nodeGraph.map((n) => n.id));

    // 检查重复 ID
    if (nodeIdSet.size !== layer.nodeGraph.length) {
      issues.push(this._issue(`${base}.nodeGraph`, 'error', '存在重复的节点 ID'));
    }

    // 检查节点引用完整性
    for (const node of layer.nodeGraph) {
      const nodeBase = `${base}.${node.id}`;

      // 检查 nextNodeIds 引用的节点是否存在
      for (const nextId of node.nextNodeIds) {
        if (!nodeIdSet.has(nextId)) {
          issues.push(this._issue(
            `${nodeBase}.nextNodeIds`,
            'error',
            `引用了不存在的节点: ${nextId}`,
          ));
        }
      }

      // 检查 Boss 引用
      if (node.bossRef) {
        if (!config.bossRefs || !config.bossRefs.includes(node.bossRef)) {
          issues.push(this._issue(
            `${nodeBase}.bossRef`,
            'error',
            `Boss 引用 ${node.bossRef} 不在 dungeonConfig.bossRefs 中`,
          ));
        }
      }

      // 检查 type 对应的必填引用
      if (node.type === 'boss' && !node.bossRef) {
        issues.push(this._issue(
          `${nodeBase}.type`,
          'warning',
          'Boss 节点缺少 bossRef 引用',
        ));
      }

      if (node.type === 'event' && (!node.eventRefs || node.eventRefs.length === 0)) {
        issues.push(this._issue(
          `${nodeBase}.type`,
          'warning',
          '事件节点缺少 eventRefs 引用',
        ));
      }
    }

    // 检查可达性（从入口 BFS 遍历）
    const entryNodeIds = this._findEntryNodes(layer.nodeGraph);
    if (entryNodeIds.length === 0) {
      issues.push(this._issue(`${base}`, 'error', '无法找到入口节点（没有节点被引用或没有未被引用的起始节点）'));
    } else {
      const reachable = this._bfs(nodeIdSet, layer.nodeGraph, entryNodeIds);
      if (reachable.size < nodeIdSet.size) {
        const unreachable = [...nodeIdSet].filter((id) => !reachable.has(id));
        issues.push(this._issue(
          `${base}.nodeGraph`,
          'warning',
          `存在不可达节点: ${unreachable.join(', ')}`,
        ));
      }
    }

    // 检查出口：至少存在一个 completion Rule 可达
    if (!layer.completionRules || layer.completionRules.length === 0) {
      issues.push(this._issue(`${base}.completionRules`, 'warning', '缺少层完成规则'));
    }

    return issues;
  }

  /**
   * 寻找层的入口节点。
   *
   * 入口节点 = 没有被任何其他节点通过 nextNodeIds 指向的节点。
   */
  private _findEntryNodes(nodeGraph: DungeonNodeConfig[]): string[] {
    const allNodeIds = new Set(nodeGraph.map((n) => n.id));
    const pointedTo = new Set<string>();

    for (const node of nodeGraph) {
      for (const nextId of node.nextNodeIds) {
        pointedTo.add(nextId);
      }
    }

    const entryNodes = [...allNodeIds].filter((id) => !pointedTo.has(id));

    // 没有未被引用的节点时，使用第一个节点作为入口
    if (entryNodes.length === 0 && nodeGraph.length > 0) {
      return [nodeGraph[0].id];
    }

    return entryNodes;
  }

  /**
   * BFS 遍历节点图，返回所有可从入口到达的节点 ID 集合。
   */
  private _bfs(
    nodeIdSet: Set<string>,
    nodeGraph: DungeonNodeConfig[],
    startIds: string[],
  ): Set<string> {
    const visited = new Set<string>();
    const queue = [...startIds];

    // 构建邻接表
    const adjacency = new Map<string, string[]>();
    for (const node of nodeGraph) {
      adjacency.set(node.id, node.nextNodeIds.filter((nid) => nodeIdSet.has(nid)));
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      const neighbors = adjacency.get(current) ?? [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          queue.push(neighbor);
        }
      }
    }

    return visited;
  }

  // ==================== Phase7-Step2: 节点图拓扑校验 ====================

  /**
   * 校验节点图的分支拓扑结构。
   *
   * 检查项：
   * - 每个节点至少有一个可到达的出口路径（除非是终节点）
   * - 终节点数量合理（每层至少一个出口）
   * - 分支深度限制（防止无限分叉）
   * - nextNodeIds 中的分支节点不会环回当前路径
   *
   * @param config  地牢配置
   * @returns       校验结果
   */
  validateGraphTopology(config: DungeonConfigV2): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (!config || !config.layers || config.layers.length === 0) {
      return this._result(issues);
    }

    for (const layer of config.layers) {
      const layerBase = `layers[${layer.order}]`;

      // 统计每种节点类型的数量
      const typeCount = new Map<string, number>();
      for (const node of layer.nodeGraph) {
        typeCount.set(node.type, (typeCount.get(node.type) ?? 0) + 1);
      }

      // 警告：分支节点过多可能影响平衡
      const forkCount = layer.nodeGraph.filter(
        (n) => n.nextNodeIds.length > 1,
      ).length;

      if (forkCount > layer.nodeGraph.length * 0.5) {
        issues.push(this._issue(
          `${layerBase}`,
          'warning',
          `分叉节点数量 (${forkCount}) 超过总节点数 (${layer.nodeGraph.length}) 的 50%，分支过于密集`,
        ));
      }

      // 检查每个节点
      for (const node of layer.nodeGraph) {
        const nodeBase = `${layerBase}.${node.id}`;

        // 终节点检查（nextNodeIds 为空但类型不是 boss/reward/event）
        if (node.nextNodeIds.length === 0) {
          if (node.type === 'battle' || node.type === 'empty') {
            issues.push(this._issue(
              `${nodeBase}.nextNodeIds`,
              'warning',
              `节点 ${node.id} 是终节点但类型为 ${node.type}（建议改为 boss/reward/event 类型）`,
            ));
          }
        }

        // 分支数限制（单节点最多 5 个分支）
        if (node.nextNodeIds.length > 5) {
          issues.push(this._issue(
            `${nodeBase}.nextNodeIds`,
            'warning',
            `节点 ${node.id} 有 ${node.nextNodeIds.length} 个分支（超过建议上限 5）`,
          ));
        }

        // 检测自引用
        if (node.nextNodeIds.includes(node.id)) {
          issues.push(this._issue(
            `${nodeBase}.nextNodeIds`,
            'error',
            `节点 ${node.id} 引用了自身作为后继节点`,
          ));
        }
      }

      // 检查是否有入口节点和出口节点
      const entryNodes = this._findEntryNodes(layer.nodeGraph);
      const exitNodes = layer.nodeGraph.filter((n) => n.nextNodeIds.length === 0);

      if (exitNodes.length === 0) {
        issues.push(this._issue(
          `${layerBase}`,
          'warning',
          '该层没有终节点（出口），可能导致无法完成',
        ));
      }
    }

    return this._result(issues);
  }

  /**
   * 校验层间转换的合法性。
   *
   * 检查项：
   * - 相邻层之间的转换链条完整
   * - 层顺序正确（order 递增）
   * - 每层都有有效的入口节点
   *
   * @param config  地牢配置
   * @returns       校验结果
   */
  validateLayerTransitions(config: DungeonConfigV2): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (!config || !config.layers || config.layers.length <= 1) {
      return this._result(issues); // 单层地牢无需检查层间转换
    }

    // 检查层顺序
    let prevOrder = -1;
    for (const layer of config.layers) {
      if (layer.order !== prevOrder + 1) {
        issues.push(this._issue(
          `layers[${layer.order}].order`,
          'warning',
          `层顺序不连续: 期望 ${prevOrder + 1}，实际 ${layer.order}`,
        ));
      }
      prevOrder = layer.order;

      // 检查入口节点是否有效
      const entryNodes = this._findEntryNodes(layer.nodeGraph);
      if (entryNodes.length === 0) {
        issues.push(this._issue(
          `layers[${layer.order}]`,
          'error',
          `层 ${layer.id} 没有入口节点`,
        ));
      }
    }

    // 检查相邻层之间的连接（通过 completionRules 间接关联）
    for (let i = 0; i < config.layers.length - 1; i++) {
      const currentLayer = config.layers[i];
      const nextLayer = config.layers[i + 1];

      // 当前层必须能到达终节点（通过 completionRules）
      if (!currentLayer.completionRules || currentLayer.completionRules.length === 0) {
        issues.push(this._issue(
          `layers[${currentLayer.order}].completionRules`,
          'warning',
          `层 ${currentLayer.id} 缺少完成规则，系统将使用默认规则（清除所有节点）`,
        ));
      }
    }

    return this._result(issues);
  }

  // ==================== 奖励池校验 ====================

  /**
   * 校验奖励池配置。
   *
   * 检查项：
   * - 无循环引用
   * - 权重为正数
   * - ID 唯一
   *
   * @param pools  奖励池配置数组
   * @returns      校验结果
   */
  validateRewardPools(pools: RewardPoolConfigV2[]): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (!pools || pools.length === 0) {
      return this._result([]); // 空池子不是错误
    }

    // 检查 ID 唯一性
    const idSet = new Set<string>();
    for (const pool of pools) {
      if (idSet.has(pool.id)) {
        issues.push(this._issue(`pool.${pool.id}`, 'error', '奖励池 ID 重复'));
      }
      idSet.add(pool.id);
    }

    // 检查循环引用
    for (const pool of pools) {
      const cycleIssues = this._detectPoolCircularRefs(pool.id, pools, new Set(), 0);
      issues.push(...cycleIssues);
    }

    // 检查 mode 有效性
    for (const pool of pools) {
      const validModes = ['all', 'weighted_one', 'weighted_many', 'sequence'];
      if (!validModes.includes(pool.mode)) {
        issues.push(this._issue(
          `pool.${pool.id}.mode`,
          'error',
          `无效的奖励池模式: ${pool.mode}（有效值: ${validModes.join(', ')}）`,
        ));
      }
    }

    return this._result(issues);
  }

  /**
   * 检测奖励池循环引用。
   */
  private _detectPoolCircularRefs(
    poolId: string,
    allPools: RewardPoolConfigV2[],
    visited: Set<string>,
    depth: number,
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    if (depth > MAX_POOL_NESTING_DEPTH) {
      issues.push(this._issue(
        `pool.${poolId}`,
        'error',
        `奖励池引用深度超过上限 ${MAX_POOL_NESTING_DEPTH}，可能存在循环引用`,
      ));
      return issues;
    }

    if (visited.has(poolId)) {
      issues.push(this._issue(
        `pool.${poolId}`,
        'error',
        `奖励池存在循环引用，涉及池: ${[...visited, poolId].join(' → ')}`,
      ));
      return issues;
    }

    visited.add(poolId);

    const pool = allPools.find((p) => p.id === poolId);
    if (pool && pool.tableRefs) {
      for (const refId of pool.tableRefs) {
        // 检查 tableRef 是否也是一个 pool（以 POOL_ 前缀判断）
        if (refId.startsWith('POOL_')) {
          const subIssues = this._detectPoolCircularRefs(refId, allPools, new Set(visited), depth + 1);
          issues.push(...subIssues);
        }
      }
    }

    return issues;
  }

  // ==================== 掉落表校验 ====================

  /**
   * 校验掉落表配置。
   *
   * 检查项：
   * - 权重为正数
   * - 数量范围合法（min ≤ max）
   * - 保底规则完整
   *
   * @param tables  掉落表配置数组
   * @returns       校验结果
   */
  validateDropTables(tables: DropTableConfigV2[]): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (!tables || tables.length === 0) {
      return this._result([]);
    }

    // 检查 ID 唯一性
    const idSet = new Set<string>();
    for (const table of tables) {
      if (idSet.has(table.id)) {
        issues.push(this._issue(`table.${table.id}`, 'error', '掉落表 ID 重复'));
      }
      idSet.add(table.id);
    }

    // 检查条目合法性
    for (const table of tables) {
      if (!table.entries || table.entries.length === 0) {
        issues.push(this._issue(`table.${table.id}.entries`, 'warning', '掉落表为空'));
        continue;
      }

      for (let i = 0; i < table.entries.length; i++) {
        const entry = table.entries[i];
        const base = `table.${table.id}.entries[${i}]`;

        if (typeof entry.weight !== 'number' || entry.weight < 0) {
          issues.push(this._issue(`${base}.weight`, 'error', `权重无效: ${entry.weight}`));
        }

        if (!entry.quantity || entry.quantity.min < 0) {
          issues.push(this._issue(`${base}.quantity.min`, 'error', `最小数量无效`));
        }

        if (!entry.quantity || entry.quantity.max < entry.quantity.min) {
          issues.push(this._issue(
            `${base}.quantity`,
            'error',
            `max (${entry.quantity?.max}) < min (${entry.quantity?.min})`,
          ));
        }

        if (!entry.rewardRef || typeof entry.rewardRef !== 'string') {
          issues.push(this._issue(`${base}.rewardRef`, 'error', '缺少奖励引用'));
        }
      }

      // 检查保底规则
      if (table.pityRules) {
        for (const rule of table.pityRules) {
          if (rule.threshold <= 0) {
            issues.push(this._issue(
              `table.${table.id}.pityRules.${rule.id}`,
              'error',
              `保底阈值无效: ${rule.threshold}`,
            ));
          }
        }
      }
    }

    return this._result(issues);
  }

  // ==================== 保底规则校验 ====================

  /**
   * Phase7-Step4: 校验保底规则配置。
   *
   * 检查项：
   * - 规则 ID 唯一
   * - sourceType 非空且合法
   * - guaranteeThreshold > 0
   * - extraReward 结构完整（rewardType 合法，quantity > 0）
   *
   * @param rules  保底规则配置数组
   * @returns      校验结果
   */
  validatePityRules(rules: PityRule[]): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (!rules || rules.length === 0) {
      return this._result([]); // 无保底规则不报错
    }

    // 检查 ID 唯一性
    const idSet = new Set<string>();
    for (const rule of rules) {
      if (!rule.id) {
        issues.push(this._issue('pityRule', 'error', '保底规则缺少 id'));
        continue;
      }
      if (idSet.has(rule.id)) {
        issues.push(this._issue(`pityRule.${rule.id}`, 'error', '保底规则 ID 重复'));
      }
      idSet.add(rule.id);
    }

    // 逐条校验
    const validSourceTypes = [
      'dungeon_node', 'dungeon_boss', 'dungeon_event',
      'quest', 'achievement', 'shop', 'compensation', 'season',
    ];
    const validRewardTypes = ['gold', 'exp', 'equipment', 'item', 'currency'];

    for (const rule of rules) {
      if (!rule.id) continue;
      const base = `pityRule.${rule.id}`;

      // sourceType 合法性
      if (!rule.sourceType) {
        issues.push(this._issue(`${base}.sourceType`, 'error', '来源类型为空'));
      } else if (!validSourceTypes.includes(rule.sourceType)) {
        issues.push(this._issue(
          `${base}.sourceType`,
          'warning',
          `未知来源类型: ${rule.sourceType}（有效值: ${validSourceTypes.join(', ')}）`,
        ));
      }

      // 阈值合法性
      if (typeof rule.guaranteeThreshold !== 'number' || !Number.isFinite(rule.guaranteeThreshold)) {
        issues.push(this._issue(`${base}.guaranteeThreshold`, 'error', `阈值无效: ${rule.guaranteeThreshold}`));
      } else if (rule.guaranteeThreshold <= 0) {
        issues.push(this._issue(`${base}.guaranteeThreshold`, 'error', `阈值必须 > 0: ${rule.guaranteeThreshold}`));
      } else if (rule.guaranteeThreshold > 1000) {
        issues.push(this._issue(`${base}.guaranteeThreshold`, 'warning', `阈值过大: ${rule.guaranteeThreshold}（可能影响体验）`));
      }

      // extraReward 结构校验
      if (rule.extraReward) {
        const er = rule.extraReward;
        if (!er.rewardType || !validRewardTypes.includes(er.rewardType)) {
          issues.push(this._issue(
            `${base}.extraReward.rewardType`,
            'error',
            `无效的奖励类型: ${er.rewardType}`,
          ));
        }
        if (typeof er.quantity !== 'number' || er.quantity <= 0) {
          issues.push(this._issue(
            `${base}.extraReward.quantity`,
            'error',
            `奖励数量无效: ${er.quantity}`,
          ));
        }
        if ((er.rewardType === 'equipment' || er.rewardType === 'item' || er.rewardType === 'currency')
          && !er.itemId) {
          issues.push(this._issue(
            `${base}.extraReward.itemId`,
            'warning',
            `奖励类型 ${er.rewardType} 建议提供 itemId`,
          ));
        }
      }
    }

    return this._result(issues);
  }

  // ==================== 成长曲线校验 ====================

  /**
   * 校验成长曲线配置。
   *
   * 检查项：
   * - 轨道 ID 唯一
   * - 等级上限一致
   * - 经验表/公式引用有效
   *
   * @param curves  成长曲线配置数组
   * @returns       校验结果
   */
  validateGrowthCurves(curves: GrowthCurveConfig[]): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (!curves || curves.length === 0) {
      return this._result([]);
    }

    // 检查轨道唯一性
    const trackSet = new Set<string>();
    for (const curve of curves) {
      if (trackSet.has(curve.track)) {
        issues.push(this._issue(
          `curve.${curve.id}`,
          'error',
          `成长轨道 ${curve.track} 重复定义`,
        ));
      }
      trackSet.add(curve.track);

      if (curve.maxLevel < 1) {
        issues.push(this._issue(`curve.${curve.id}.maxLevel`, 'error', `最大等级无效: ${curve.maxLevel}`));
      }

      // 必须至少有一类驱动（表或公式）
      if (!curve.expTableRef && !curve.formulaRef) {
        issues.push(this._issue(
          `curve.${curve.id}`,
          'warning',
          `缺少 expTableRef 或 formulaRef 引用`,
        ));
      }
    }

    return this._result(issues);
  }

  // ==================== 战力公式校验 ====================

  /**
   * 校验战力公式配置（Phase7-Step6 增强版）。
   *
   * 检查项：
   * - 字段完整（id, version, statWeights, rounding）
   * - 权重合法性（statWeights 中所有值 ≥ 0）
   * - 版本可追踪（version > 0，版本号唯一）
   * - effectiveFromSaveVersion 合法性（≥ 0，与存档版本一致性）
   * - modifiers 规则合法性（type 为 flat/multiply/cap，value 有效）
   * - rounding 为合法值
   *
   * @param formulas           战力公式配置数组
   * @param currentSaveVersion 当前存档版本（用于校验 effectiveFromSaveVersion，可选）
   * @returns                  校验结果
   */
  validatePowerFormulas(
    formulas: PowerFormulaConfigV2[],
    currentSaveVersion?: number,
  ): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (!formulas || formulas.length === 0) {
      return this._result([]);
    }

    // 检查版本唯一性
    const versionSet = new Set<number>();
    const idSet = new Set<string>();
    const validModifierTypes = ['flat', 'multiply', 'cap'];
    const validRoundings = ['floor', 'round', 'ceil'];
    const knownStats = ['hp', 'atk', 'def', 'speed', 'critRate', 'critDamage'];

    for (const formula of formulas) {
      const base = `formula.${formula.id}`;

      // ---- ID 唯一性 ----
      if (idSet.has(formula.id)) {
        issues.push(this._issue(`${base}`, 'error', `公式配置 ID 重复: ${formula.id}`));
      }
      idSet.add(formula.id);

      // ---- ID 有效性 ----
      if (!formula.id || typeof formula.id !== 'string') {
        issues.push(this._issue(`${base}.id`, 'error', `公式配置 ID 无效`));
      }

      // ---- 版本唯一性 ----
      if (versionSet.has(formula.version)) {
        issues.push(this._issue(`${base}.version`, 'error', `公式版本号 ${formula.version} 重复`));
      }
      versionSet.add(formula.version);

      // ---- 版本号合法性 ----
      if (typeof formula.version !== 'number' || !Number.isFinite(formula.version)) {
        issues.push(this._issue(`${base}.version`, 'error', `公式版本号无效: ${formula.version}`));
      } else if (formula.version < 1) {
        issues.push(this._issue(`${base}.version`, 'error', `公式版本号必须 > 0: ${formula.version}`));
      }

      // ---- effectiveFromSaveVersion 合法性 ----
      if (typeof formula.effectiveFromSaveVersion !== 'number' || !Number.isFinite(formula.effectiveFromSaveVersion)) {
        issues.push(this._issue(
          `${base}.effectiveFromSaveVersion`,
          'error',
          `effectiveFromSaveVersion 无效: ${formula.effectiveFromSaveVersion}`,
        ));
      } else if (formula.effectiveFromSaveVersion < 0) {
        issues.push(this._issue(
          `${base}.effectiveFromSaveVersion`,
          'error',
          `effectiveFromSaveVersion 不能为负数: ${formula.effectiveFromSaveVersion}`,
        ));
      } else if (currentSaveVersion !== undefined && formula.effectiveFromSaveVersion > currentSaveVersion) {
        issues.push(this._issue(
          `${base}.effectiveFromSaveVersion`,
          'warning',
          `effectiveFromSaveVersion (${formula.effectiveFromSaveVersion}) 超过当前存档版本 (${currentSaveVersion})，公式暂不生效`,
        ));
      }

      // ---- statWeights 合法性 ----
      if (!formula.statWeights || typeof formula.statWeights !== 'object') {
        issues.push(this._issue(`${base}.statWeights`, 'error', '缺少属性权重配置'));
      } else {
        const statEntries = Object.entries(formula.statWeights);
        if (statEntries.length === 0) {
          issues.push(this._issue(`${base}.statWeights`, 'error', '属性权重配置为空'));
        }

        for (const [stat, weight] of statEntries) {
          if (typeof weight !== 'number' || !Number.isFinite(weight)) {
            issues.push(this._issue(
              `${base}.statWeights.${stat}`,
              'error',
              `属性 ${stat} 权重无效: ${weight}`,
            ));
          } else if (weight < 0) {
            issues.push(this._issue(
              `${base}.statWeights.${stat}`,
              'error',
              `属性 ${stat} 权重为负数: ${weight}`,
            ));
          } else if (weight > 100) {
            issues.push(this._issue(
              `${base}.statWeights.${stat}`,
              'warning',
              `属性 ${stat} 权重异常偏高: ${weight}`,
            ));
          }

          // 未知属性警告
          if (!knownStats.includes(stat)) {
            issues.push(this._issue(
              `${base}.statWeights.${stat}`,
              'warning',
              `未知属性: ${stat}（已知属性: ${knownStats.join(', ')}）`,
            ));
          }
        }
      }

      // ---- modifiers 合法性 ----
      if (formula.modifiers && Array.isArray(formula.modifiers)) {
        for (let i = 0; i < formula.modifiers.length; i++) {
          const mod = formula.modifiers[i];
          const modBase = `${base}.modifiers[${i}]`;

          if (!mod.type || !validModifierTypes.includes(mod.type)) {
            issues.push(this._issue(
              `${modBase}.type`,
              'error',
              `无效的修正类型: ${mod.type}（有效值: ${validModifierTypes.join(', ')}）`,
            ));
          }

          if (!mod.stat || typeof mod.stat !== 'string') {
            issues.push(this._issue(`${modBase}.stat`, 'error', '修正规则缺少 stat 字段'));
          }

          if (typeof mod.value !== 'number' || !Number.isFinite(mod.value)) {
            issues.push(this._issue(`${modBase}.value`, 'error', `修正值无效: ${mod.value}`));
          }
        }

        // 检查修饰符数量
        if (formula.modifiers.length > 50) {
          issues.push(this._issue(
            `${base}.modifiers`,
            'warning',
            `修正规则数量 (${formula.modifiers.length}) 超过建议上限 50`,
          ));
        }
      } else if (formula.modifiers !== undefined && !Array.isArray(formula.modifiers)) {
        issues.push(this._issue(`${base}.modifiers`, 'error', 'modifiers 不是数组'));
      }

      // ---- rounding 合法性 ----
      if (!formula.rounding || !validRoundings.includes(formula.rounding)) {
        issues.push(this._issue(
          `${base}.rounding`,
          'error',
          `无效的取整方式: ${formula.rounding}（有效值: ${validRoundings.join(', ')}）`,
        ));
      }
    }

    // 全局检查：至少有一个公式版本
    if (versionSet.size === 0) {
      issues.push(this._issue('formulas', 'error', '没有任何有效的公式版本'));
    }

    // 全局检查：版本号连续性（warning）
    const sortedVersions = [...versionSet].sort((a, b) => a - b);
    if (sortedVersions.length > 1) {
      const expectedMax = sortedVersions[0] + sortedVersions.length - 1;
      if (sortedVersions[sortedVersions.length - 1] !== expectedMax) {
        issues.push(this._issue(
          'formulas',
          'warning',
          `公式版本号不连续: ${sortedVersions.join(', ')}`,
        ));
      }
    }

    return this._result(issues);
  }

  /**
   * 校验战力公式配置（Phase7-Step6 别名，语义更明确的入口）。
   *
   * @param formulas           战力公式配置数组
   * @param currentSaveVersion 当前存档版本
   * @returns                  校验结果
   */
  validatePowerFormulaConfig(
    formulas: PowerFormulaConfigV2[],
    currentSaveVersion?: number,
  ): ValidationResult {
    return this.validatePowerFormulas(formulas, currentSaveVersion);
  }

  // ==================== 事件池校验 ====================

  /**
   * 校验事件池配置。
   *
   * 检查项：
   * - 事件池 ID 唯一
   * - eventPoolRefs 非空
   * - 引用的事件 ID 存在（需要同时传入 eventConfigs 进行交叉校验）
   * - 无循环引用（池 A 引用池 B 引用池 A，通过嵌套池检测）
   *
   * @param pools         事件池配置数组
   * @param eventConfigs  事件配置数组（用于交叉校验引用有效性）
   * @returns             校验结果
   */
  validateEventPools(pools: EventPool[], eventConfigs?: EventConfig[]): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (!pools || pools.length === 0) {
      return this._result([]); // 空池子不是错误
    }

    // 检查 ID 唯一性
    const idSet = new Set<string>();
    for (const pool of pools) {
      if (idSet.has(pool.id)) {
        issues.push(this._issue(`eventPool.${pool.id}`, 'error', '事件池 ID 重复'));
      }
      idSet.add(pool.id);
    }

    // 检查池子内容
    const validEventIds = eventConfigs ? new Set(eventConfigs.map((c) => c.id)) : null;

    for (const pool of pools) {
      const base = `eventPool.${pool.id}`;

      // eventPoolRefs 非空
      if (!pool.eventPoolRefs || pool.eventPoolRefs.length === 0) {
        issues.push(this._issue(base, 'warning', `事件池 ${pool.id} 的事件引用列表为空`));
        continue;
      }

      // 引用有效性
      if (validEventIds) {
        for (const refId of pool.eventPoolRefs) {
          if (!validEventIds.has(refId)) {
            // 检查是否为嵌套池引用
            const isNestedPool = pools.some((p) => p.id === refId);
            if (!isNestedPool) {
              issues.push(this._issue(
                `${base}.eventPoolRefs`,
                'error',
                `引用了不存在的事件 ID: ${refId}（既非 EventConfig 也非 EventPool）`,
              ));
            }
          }
        }
      }

      // 版本号校验
      if (typeof pool.version !== 'number' || pool.version < 1) {
        issues.push(this._issue(`${base}.version`, 'error', `事件池版本号无效: ${pool.version}`));
      }

      // 检查嵌套深度（防止过多层级的池中池）
      const nestingDepth = this._detectEventPoolNesting(pool.id, pools, new Set(), 0);
      if (nestingDepth > 5) {
        issues.push(this._issue(
          base,
          'warning',
          `事件池嵌套深度 ${nestingDepth} 超过建议上限 5`,
        ));
      }
    }

    // 检查循环引用
    const cycleIssues = this._detectEventPoolCycles(pools);
    issues.push(...cycleIssues);

    return this._result(issues);
  }

  // ==================== 事件配置校验 ====================

  /**
   * 校验事件配置。
   *
   * 检查项：
   * - 事件 ID 唯一
   * - category 合法
   * - weight 合法（≥ 0）
   * - 条件类型合法
   * - rewardSourceRefs 引用存在
   * - nameKey / descriptionKey 有效
   *
   * @param configs  事件配置数组
   * @returns        校验结果
   */
  validateEventConfigs(configs: EventConfig[]): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (!configs || configs.length === 0) {
      return this._result([]);
    }

    // 检查 ID 唯一性
    const idSet = new Set<string>();
    for (const config of configs) {
      if (idSet.has(config.id)) {
        issues.push(this._issue(`eventConfig.${config.id}`, 'error', '事件配置 ID 重复'));
      }
      idSet.add(config.id);
    }

    // 逐条校验
    const validCategories = [
      'reward', 'battle', 'shop', 'blessing',
      'curse', 'story', 'boss', 'special',
    ];

    for (const config of configs) {
      const base = `eventConfig.${config.id}`;

      // category 合法性
      if (!config.category || !validCategories.includes(config.category)) {
        issues.push(this._issue(
          `${base}.category`,
          'error',
          `无效的事件类别: ${config.category}（有效值: ${validCategories.join(', ')}）`,
        ));
      }

      // weight 合法性
      if (typeof config.weight !== 'number' || !Number.isFinite(config.weight) || config.weight < 0) {
        issues.push(this._issue(`${base}.weight`, 'error', `权重无效: ${config.weight}`));
      }

      // 版本号
      if (typeof config.version !== 'number' || config.version < 1) {
        issues.push(this._issue(`${base}.version`, 'error', `事件配置版本号无效: ${config.version}`));
      }

      // nameKey
      if (!config.nameKey || typeof config.nameKey !== 'string') {
        issues.push(this._issue(`${base}.nameKey`, 'warning', '缺少名称 Key'));
      }

      // descriptionKey
      if (!config.descriptionKey || typeof config.descriptionKey !== 'string') {
        issues.push(this._issue(`${base}.descriptionKey`, 'warning', '缺少描述 Key'));
      }

      // conditions
      if (config.conditions) {
        const validConditionTypes = [
          'minLevel', 'maxLevel', 'minPower', 'hasHero',
          'hasItem', 'dungeonClear', 'previousEventResolved', 'custom',
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

      // nextEventRefs 引用自身检查
      if (config.nextEventRefs) {
        for (const refId of config.nextEventRefs) {
          if (refId === config.id) {
            issues.push(this._issue(
              `${base}.nextEventRefs`,
              'error',
              'nextEventRefs 引用了自身（可能导致事件死循环）',
            ));
          }
        }
      }
    }

    return this._result(issues);
  }

  // ==================== Phase7-Step5: 进度轨道配置校验 ====================

  /**
   * 校验成长轨道配置。
   *
   * 检查项：
   * - trackId 非空、唯一
   * - maxLevel > 0 且在合理范围内
   * - expTable 结构合法（每个 level 的 requiredExp > 0）
   * - formula 引用有效（如果提供）
   * - statModifiers 结构完整
   * - version > 0
   *
   * @param configs  成长轨道配置列表
   * @returns        校验结果
   */
  validateProgressTrackConfigs(configs: ProgressTrackConfig[]): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (!configs || configs.length === 0) {
      issues.push(this._issue('trackConfigs', 'warning', '轨道配置列表为空'));
      return this._result(issues);
    }

    // 检查 trackId 唯一性
    const trackIdSet = new Set<string>();
    for (const config of configs) {
      if (!config.trackId) {
        issues.push(this._issue('trackConfig', 'error', '轨道配置缺少 trackId'));
        continue;
      }
      if (trackIdSet.has(config.trackId)) {
        issues.push(this._issue(
          `trackConfig.${config.trackId}`,
          'error',
          `轨道 ID 重复: ${config.trackId}`,
        ));
      }
      trackIdSet.add(config.trackId);
    }

    // 合法轨道类型
    const validTracks = ['level', 'skill', 'bond', 'awakening', 'equipment'];

    // 逐条校验
    for (const config of configs) {
      if (!config.trackId) continue;
      const base = `trackConfig.${config.trackId}`;

      // trackId 是否合法类型
      if (!validTracks.includes(config.trackId) && !config.trackId.includes('.')) {
        issues.push(this._issue(
          `${base}.trackId`,
          'warning',
          `轨道 ID '${config.trackId}' 不在标准类型列表中 (${validTracks.join(', ')})`,
        ));
      }

      // maxLevel
      if (typeof config.maxLevel !== 'number' || !Number.isFinite(config.maxLevel)) {
        issues.push(this._issue(`${base}.maxLevel`, 'error', `maxLevel 无效: ${config.maxLevel}`));
      } else if (config.maxLevel < 1) {
        issues.push(this._issue(`${base}.maxLevel`, 'error', `maxLevel 必须 > 0`));
      } else if (config.maxLevel > 1000) {
        issues.push(this._issue(`${base}.maxLevel`, 'warning', `maxLevel 超过建议上限: ${config.maxLevel}`));
      }

      // expTable 结构
      if (!config.expTable || typeof config.expTable !== 'object') {
        issues.push(this._issue(`${base}.expTable`, 'error', 'expTable 缺失或类型错误'));
      } else {
        const expTableKeys = Object.keys(config.expTable).map(Number);
        const hasInvalidExp = expTableKeys.some((level) => {
          const requiredExp = config.expTable[level];
          return typeof requiredExp !== 'number' || !Number.isFinite(requiredExp) || requiredExp <= 0;
        });

        if (hasInvalidExp) {
          issues.push(this._issue(`${base}.expTable`, 'error', 'expTable 包含无效的经验值'));
        }

        // 检查经验表是否覆盖全部等级范围
        if (expTableKeys.length > 0) {
          const minKey = Math.min(...expTableKeys);
          const maxKey = Math.max(...expTableKeys);
          if (minKey > 1) {
            issues.push(this._issue(`${base}.expTable`, 'warning', `expTable 起始等级为 ${minKey}（建议从 1 开始）`));
          }
          if (maxKey < config.maxLevel) {
            issues.push(this._issue(
              `${base}.expTable`,
              'warning',
              `expTable 最高等级 ${maxKey} 小于 maxLevel ${config.maxLevel}`,
            ));
          }
        }
      }

      // formula（可选）
      if (config.formula !== undefined && typeof config.formula !== 'string') {
        issues.push(this._issue(`${base}.formula`, 'error', `formula 类型错误`));
      }

      // statModifiers
      if (!Array.isArray(config.statModifiers)) {
        issues.push(this._issue(`${base}.statModifiers`, 'error', 'statModifiers 缺失或不是数组'));
      } else if (config.statModifiers.length === 0) {
        issues.push(this._issue(`${base}.statModifiers`, 'warning', 'statModifiers 为空（不会产生属性变化）'));
      } else {
        const validStats = ['hp', 'atk', 'def', 'speed', 'critRate', 'critDamage'];
        const validModifierTypes = ['flat', 'multiply', 'percent'];

        for (let i = 0; i < config.statModifiers.length; i++) {
          const mod = config.statModifiers[i];
          const modBase = `${base}.statModifiers[${i}]`;

          if (!mod.stat || !validStats.includes(mod.stat)) {
            issues.push(this._issue(
              `${modBase}.stat`,
              'error',
              `无效的 stat: ${mod.stat}（有效值: ${validStats.join(', ')}）`,
            ));
          }

          if (!mod.modifierType || !validModifierTypes.includes(mod.modifierType)) {
            issues.push(this._issue(
              `${modBase}.modifierType`,
              'error',
              `无效的 modifierType: ${mod.modifierType}`,
            ));
          }

          if (typeof mod.value !== 'number' || !Number.isFinite(mod.value)) {
            issues.push(this._issue(`${modBase}.value`, 'error', `value 无效: ${mod.value}`));
          }
        }
      }

      // version
      if (typeof config.version !== 'number' || !Number.isFinite(config.version) || config.version < 1) {
        issues.push(this._issue(`${base}.version`, 'error', `version 无效: ${config.version}`));
      }
    }

    return this._result(issues);
  }

  // ==================== Phase7-Step7: 神器配置校验 ====================

  /**
   * 校验神器配置。
   *
   * 检查项：
   * - ID 唯一
   * - rarity 合法（common/rare/epic/legendary）
   * - effectRefs 合法（非空，每个引用为有效字符串）
   * - version > 0
   * - nameKey 有效
   *
   * @param configs  神器配置数组
   * @returns        校验结果
   */
  validateArtifactConfigs(configs: ArtifactConfig[]): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (!configs || configs.length === 0) {
      return this._result([]);
    }

    // ID 唯一性
    const idSet = new Set<string>();
    for (const config of configs) {
      if (idSet.has(config.id)) {
        issues.push(this._issue(`artifactConfig.${config.id}`, 'error', '神器配置 ID 重复'));
      }
      idSet.add(config.id);
    }

    // 逐条校验
    for (const config of configs) {
      const base = `artifactConfig.${config.id}`;

      // rarity 合法性
      if (!config.rarity || !VALID_ARTIFACT_RARITIES.includes(config.rarity)) {
        issues.push(this._issue(
          `${base}.rarity`,
          'error',
          `无效的稀有度: ${config.rarity}（有效值: ${VALID_ARTIFACT_RARITIES.join(', ')}）`,
        ));
      }

      // effectRefs 合法性
      if (!config.effectRefs || !Array.isArray(config.effectRefs) || config.effectRefs.length === 0) {
        issues.push(this._issue(`${base}.effectRefs`, 'warning', 'effectRefs 为空'));
      } else {
        for (let i = 0; i < config.effectRefs.length; i++) {
          const ref = config.effectRefs[i];
          if (!ref || typeof ref !== 'string') {
            issues.push(this._issue(`${base}.effectRefs[${i}]`, 'error', `无效的效果引用: ${ref}`));
          }
        }
      }

      // version 合法性
      if (typeof config.version !== 'number' || config.version < 1) {
        issues.push(this._issue(`${base}.version`, 'error', `version 无效: ${config.version}`));
      }

      // nameKey 合法性
      if (!config.nameKey || typeof config.nameKey !== 'string') {
        issues.push(this._issue(`${base}.nameKey`, 'warning', 'nameKey 缺失'));
      }

      // tags 合法性（可选但有则校验）
      if (config.tags && Array.isArray(config.tags)) {
        for (let i = 0; i < config.tags.length; i++) {
          if (typeof config.tags[i] !== 'string') {
            issues.push(this._issue(`${base}.tags[${i}]`, 'warning', `tag 类型错误: ${config.tags[i]}`));
          }
        }
      }
    }

    return this._result(issues);
  }

  // ==================== Phase7-Step7: 运营活动配置校验 ====================

  /**
   * 校验运营活动配置。
   *
   * 检查项：
   * - ID 唯一
   * - 时间合法（startTime ≥ 0, endTime ≥ 0, startTime ≤ endTime）
   * - rewardPoolRefs 合法
   * - eventPoolRefs 合法
   * - version > 0
   *
   * @param configs  运营活动配置数组
   * @returns        校验结果
   */
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
        typeof config.startTime === 'number' && Number.isFinite(config.startTime) &&
        typeof config.endTime === 'number' && Number.isFinite(config.endTime) &&
        config.startTime > config.endTime
      ) {
        issues.push(this._issue(
          `${base}.timeRange`,
          'error',
          `开始时间 (${config.startTime}) 晚于结束时间 (${config.endTime})`,
        ));
      }

      // 时间跨度警告（超过 30 天）
      if (
        typeof config.startTime === 'number' && Number.isFinite(config.startTime) &&
        typeof config.endTime === 'number' && Number.isFinite(config.endTime)
      ) {
        const durationDays = (config.endTime - config.startTime) / (1000 * 60 * 60 * 24);
        if (durationDays > 365) {
          issues.push(this._issue(
            `${base}.timeRange`,
            'warning',
            `活动持续时间 ${durationDays.toFixed(1)} 天超过 365 天，可能不是限时活动`,
          ));
        }
      }

      // rewardPoolRefs 合法性
      if (!config.rewardPoolRefs || !Array.isArray(config.rewardPoolRefs) || config.rewardPoolRefs.length === 0) {
        issues.push(this._issue(`${base}.rewardPoolRefs`, 'warning', 'rewardPoolRefs 为空'));
      } else {
        for (let i = 0; i < config.rewardPoolRefs.length; i++) {
          const ref = config.rewardPoolRefs[i];
          if (!ref || typeof ref !== 'string') {
            issues.push(this._issue(`${base}.rewardPoolRefs[${i}]`, 'error', `无效的奖励池引用: ${ref}`));
          }
        }
      }

      // eventPoolRefs 合法性
      if (!config.eventPoolRefs || !Array.isArray(config.eventPoolRefs) || config.eventPoolRefs.length === 0) {
        issues.push(this._issue(`${base}.eventPoolRefs`, 'warning', 'eventPoolRefs 为空'));
      } else {
        for (let i = 0; i < config.eventPoolRefs.length; i++) {
          const ref = config.eventPoolRefs[i];
          if (!ref || typeof ref !== 'string') {
            issues.push(this._issue(`${base}.eventPoolRefs[${i}]`, 'error', `无效的事件池引用: ${ref}`));
          }
        }
      }

      // version 合法性
      if (typeof config.version !== 'number' || config.version < 1) {
        issues.push(this._issue(`${base}.version`, 'error', `version 无效: ${config.version}`));
      }

      // tags 合法性（可选但有则校验）
      if (config.tags && Array.isArray(config.tags)) {
        for (let i = 0; i < config.tags.length; i++) {
          if (typeof config.tags[i] !== 'string') {
            issues.push(this._issue(`${base}.tags[${i}]`, 'warning', `tag 类型错误: ${config.tags[i]}`));
          }
        }
      }
    }

    return this._result(issues);
  }

  // ==================== Phase7-Step7: 特殊事件配置校验 ====================

  /**
   * 校验特殊事件配置。
   *
   * 检查项：
   * - ID 唯一
   * - triggerType 合法（login/battle/dungeon/boss/liveops）
   * - rewardSourceRefs 合法
   * - conditions 合法
   * - version > 0
   *
   * @param configs  特殊事件配置数组
   * @returns        校验结果
   */
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
        for (let i = 0; i < config.rewardSourceRefs.length; i++) {
          const ref = config.rewardSourceRefs[i];
          if (!ref || typeof ref !== 'string') {
            issues.push(this._issue(`${base}.rewardSourceRefs[${i}]`, 'error', `无效的奖励来源引用: ${ref}`));
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
          const condBase = `${base}.conditions[${i}]`;

          if (!condition.type || !validConditionTypes.includes(condition.type)) {
            issues.push(this._issue(
              `${condBase}.type`,
              'error',
              `无效的条件类型: ${condition.type}（有效值: ${validConditionTypes.join(', ')}）`,
            ));
          }

          if (!condition.params || typeof condition.params !== 'object') {
            issues.push(this._issue(`${condBase}.params`, 'warning', '条件参数为空'));
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

  // ==================== 内部辅助：事件池 ====================

  /**
   * 检测事件池嵌套深度。
   */
  private _detectEventPoolNesting(
    poolId: string,
    allPools: EventPool[],
    visited: Set<string>,
    depth: number,
  ): number {
    if (visited.has(poolId)) return depth;
    visited.add(poolId);

    const pool = allPools.find((p) => p.id === poolId);
    if (!pool || !pool.eventPoolRefs) return depth;

    let maxDepth = depth;
    for (const refId of pool.eventPoolRefs) {
      // 检查 refId 是否是一个池子
      if (allPools.some((p) => p.id === refId)) {
        const childDepth = this._detectEventPoolNesting(refId, allPools, new Set(visited), depth + 1);
        maxDepth = Math.max(maxDepth, childDepth);
      }
    }

    return maxDepth;
  }

  /**
   * 检测事件池之间的循环引用。
   *
   * 检查池 A 引用池 B 引用池 A 等循环链路。
   */
  private _detectEventPoolCycles(pools: EventPool[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    for (const pool of pools) {
      const cyclePath = this._findEventPoolCycle(pool.id, pools, new Set<string>(), []);
      if (cyclePath && cyclePath.length > 0) {
        issues.push(this._issue(
          `eventPool.${pool.id}`,
          'error',
          `事件池存在循环引用: ${cyclePath.join(' → ')}`,
        ));
      }
    }

    // 去重（同一循环可能从不同起点检测到）
    const uniqueMessages = new Set<string>();
    return issues.filter((issue) => {
      if (uniqueMessages.has(issue.message)) return false;
      uniqueMessages.add(issue.message);
      return true;
    });
  }

  /**
   * DFS 查找事件池循环引用路径。
   */
  private _findEventPoolCycle(
    poolId: string,
    allPools: EventPool[],
    visited: Set<string>,
    path: string[],
  ): string[] | null {
    if (visited.has(poolId)) {
      const cycleIdx = path.indexOf(poolId);
      if (cycleIdx !== -1) {
        return path.slice(cycleIdx).concat(poolId);
      }
      return null;
    }

    visited.add(poolId);
    path.push(poolId);

    const pool = allPools.find((p) => p.id === poolId);
    if (pool && pool.eventPoolRefs) {
      for (const refId of pool.eventPoolRefs) {
        // 只检查池中池引用
        if (allPools.some((p) => p.id === refId)) {
          const result = this._findEventPoolCycle(refId, allPools, visited, [...path]);
          if (result) return result;
        }
      }
    }

    return null;
  }

  // ==================== 内部辅助 ====================

  private _issue(path: string, severity: ValidationSeverity, message: string): ValidationIssue {
    return { path, severity, message };
  }

  private _fail(path: string, message: string): ValidationResult {
    return {
      valid: false,
      issues: [this._issue(path, 'error', message)],
      errorCount: 1,
      warningCount: 0,
    };
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
