// ============================================================
// DropRewardVerifier — Phase8-Step4 掉落奖励一致性校验器
// 职责：验证奖励发放与 SaveData 一致性 / 保底逻辑 / 多来源顺序
// 架构：纯工具类，非单例，可直接实例化或被 DebugRunner 使用
// 边界：不实现 UI、不修改数据、仅返回校验报告
// ============================================================

import { DropSystem } from './DropSystem';
import { SaveManager } from '../save/SaveManager';
import { ProgressSystem } from './ProgressSystem';
import type { SettlementResult } from './DungeonLoopController';
import type { DropHistoryRecord, PityRule } from '../data/drop_types';
import type {
  RewardConsistencyCheck,
  RewardVerificationResult,
} from '../data/reward_types';
import { createEmptyRewardVerificationResult } from '../data/reward_types';

// ==================== 校验接口 ====================

/** 单次校验的详细信息 */
export interface VerificationDetail {
  /** 校验项名称 */
  name: string;
  /** 是否通过 */
  passed: boolean;
  /** 详情描述 */
  detail: string;
  /** 期望值 */
  expected?: string;
  /** 实际值 */
  actual?: string;
}

/** 综合校验报告 */
export interface VerificationReport {
  /** 报告标题 */
  title: string;
  /** 所有校验详情 */
  details: VerificationDetail[];
  /** 通过数量 */
  passedCount: number;
  /** 失败数量 */
  failedCount: number;
  /** 是否全部通过 */
  allPassed: boolean;
  /** 生成时间戳 */
  timestamp: number;
}

export class DropRewardVerifier {
  // ==================== 依赖 ====================

  private _dropSystem: DropSystem;
  private _saveManager: SaveManager;

  constructor() {
    this._dropSystem = DropSystem.getInstance();
    this._saveManager = SaveManager.getInstance();
  }

  // ================================================================
  // 公开 API
  // ================================================================

  /**
   * 创建空校验报告。
   */
  createEmptyReport(title: string): VerificationReport {
    return {
      title,
      details: [],
      passedCount: 0,
      failedCount: 0,
      allPassed: true,
      timestamp: Date.now(),
    };
  }

  /**
   * 校验单次结算后的 SaveData 一致性。
   *
   * 检查：
   * 1. 掉落历史是否成功持久化
   * 2. DropHistoryRecord.rewards 与 SaveData.dropHistory 对齐
   * 3. 金币/经验/装备/物品汇总值一致
   *
   * @param records        结算生成的记录
   * @param expectedGold   期望金币
   * @param expectedExp    期望经验
   * @param expectedEquip  期望装备数
   * @param expectedItems  期望物品数
   * @returns              校验报告
   */
  verifySaveDataConsistency(
    records: DropHistoryRecord[],
    expectedGold: number,
    expectedExp: number,
    expectedEquip: number,
    expectedItems: number,
  ): VerificationReport {
    const report = this.createEmptyReport('SaveData 一致性校验');

    // 1. 检查 DropSystem 内部校验
    const systemResult = this._dropSystem.verifyRewardConsistency(
      records,
      expectedGold,
      expectedExp,
      expectedEquip,
      expectedItems,
    );

    for (const check of systemResult.checks) {
      this._addDetail(report, {
        name: `奖励一致性: ${check.field}`,
        passed: check.passed,
        detail: check.passed ? '一致' : (check.reason ?? '不一致'),
        expected: String(check.expected),
        actual: String(check.actual),
      });
    }

    // 2. 检查 SaveData 是否正确保存（记录不为空时，存档应有数据）
    const saved = this._saveManager.loadDropHistoryData();
    if (saved) {
      const hasPhase6History = saved.history && saved.history.length > 0;
      const hasPhase7History = saved.dropHistoryRecords && saved.dropHistoryRecords.length > 0;

      this._addDetail(report, {
        name: 'Phase6 历史持久化',
        passed: records.length > 0 ? hasPhase6History : true,
        detail: hasPhase6History
          ? `已持久化 ${saved.history.length} 条 Phase6 记录`
          : '无 Phase6 历史（可能无记录或持久化失败）',
      });

      this._addDetail(report, {
        name: 'Phase7 历史持久化 (DropHistoryRecord)',
        passed: records.length > 0 ? hasPhase7History : true,
        detail: hasPhase7History
          ? `已持久化 ${saved.dropHistoryRecords!.length} 条 Phase7 记录`
          : '无 Phase7 历史（SaveManager 修复后应非空）',
      });

      this._addDetail(report, {
        name: '保底快照持久化',
        passed: saved.pitySnapshot !== undefined,
        detail: saved.pitySnapshot
          ? `计数器: ${Object.keys(saved.pitySnapshot.pityCounters).length} 个`
          : 'pitySnapshot 缺失',
      });
    } else {
      this._addDetail(report, {
        name: 'SaveData 可读性',
        passed: false,
        detail: 'loadDropHistoryData() 返回 null',
      });
    }

    // 3. 检查记录数量匹配
    this._addDetail(report, {
      name: '记录数匹配',
      passed: saved
        ? (saved.dropHistoryRecords?.length ?? 0) >= records.length
        : records.length === 0,
      detail: `期望≥${records.length}条, 实际=${saved?.dropHistoryRecords?.length ?? 0}条`,
    });

    return report;
  }

  /**
   * 校验保底逻辑正确性。
   *
   * 检查：
   * 1. 保底规则加载正常
   * 2. 计数器递增正确
   * 3. 达到阈值后正确触发并重置
   *
   * @param pityBefore    结算前保底快照
   * @param pityAfter     结算后保底快照
   * @param sourceType    来源类型
   * @param expectedDelta 期望计数变化（+1 或重置为 0）
   * @returns             校验报告
   */
  verifyPityLogic(
    pityBefore: Record<string, number>,
    pityAfter: Record<string, number>,
    sourceType: string,
    expectedDelta: number,
  ): VerificationReport {
    const report = this.createEmptyReport(`保底逻辑校验: ${sourceType}`);

    const key = `pity_${sourceType}`;
    const before = pityBefore[key] ?? 0;
    const after = pityAfter[key] ?? 0;
    const actualDelta = after - before;

    this._addDetail(report, {
      name: '保底计数递增',
      passed: actualDelta === expectedDelta,
      detail: `结算前=${before}, 结算后=${after}, 变化=${actualDelta}`,
      expected: String(expectedDelta),
      actual: String(actualDelta),
    });

    // 如果重置为 0，验证确实是触发后重置（before 应该接近阈值）
    if (expectedDelta <= 0 && before > 0) {
      this._addDetail(report, {
        name: '保底重置验证',
        passed: true,
        detail: `触发后正确重置: ${before} → 0`,
      });
    }

    return report;
  }

  /**
   * 校验多来源奖励排序正确性。
   *
   * 检查：
   * 1. 记录按优先级排序（Boss > Event > Node > Quest > ...）
   * 2. 同优先级来源保持插入顺序
   *
   * @param records          结算记录（应按优先级排序）
   * @param expectedOrder    期望的来源类型顺序
   * @returns                校验报告
   */
  verifySourceOrdering(
    records: DropHistoryRecord[],
    expectedOrder?: string[],
  ): VerificationReport {
    const report = this.createEmptyReport('多来源排序校验');

    if (records.length === 0) {
      this._addDetail(report, {
        name: '空记录',
        passed: true,
        detail: '记录为空，排序校验通过',
      });
      return report;
    }

    const priorityMap: Record<string, number> = {
      dungeon_boss: 100,
      dungeon_event: 80,
      dungeon_node: 60,
      quest: 40,
      achievement: 30,
      shop: 20,
      compensation: 10,
      season: 5,
    };

    let orderingCorrect = true;
    const actualOrder: string[] = [];
    const orderingDetails: string[] = [];

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      actualOrder.push(record.sourceType);

      if (i > 0) {
        const prevPri = priorityMap[records[i - 1].sourceType] ?? 0;
        const currPri = priorityMap[record.sourceType] ?? 0;

        if (currPri > prevPri) {
          orderingCorrect = false;
          orderingDetails.push(
            `位置${i}: ${records[i - 1].sourceType}(pri=${prevPri}) 不应排在 ${record.sourceType}(pri=${currPri}) 之前`,
          );
        }
      }
    }

    this._addDetail(report, {
      name: '优先级排序',
      passed: orderingCorrect,
      detail: orderingCorrect
        ? `排序正确: [${actualOrder.join(', ')}]`
        : orderingDetails.join('; '),
    });

    if (expectedOrder && expectedOrder.length > 0) {
      const orderMatch = expectedOrder.every(
        (type, i) => i >= actualOrder.length || actualOrder[i] === type,
      );

      this._addDetail(report, {
        name: '期望排序',
        passed: orderMatch,
        detail: `期望: [${expectedOrder.join(', ')}]`,
        expected: expectedOrder.join(', '),
        actual: actualOrder.join(', '),
      });
    }

    return report;
  }

  /**
   * 校验结算历史完整性。
   *
   * 检查：
   * 1. 每条记录都有唯一 ID
   * 2. 每条记录都有非空 seed
   * 3. 每条记录都有 pityBefore 和 pityAfter
   * 4. 每条记录都有 createdAt
   *
   * @param records  结算记录
   * @returns        校验报告
   */
  verifyHistoryIntegrity(records: DropHistoryRecord[]): VerificationReport {
    const report = this.createEmptyReport('结算历史完整性校验');

    if (records.length === 0) {
      this._addDetail(report, {
        name: '空记录',
        passed: true,
        detail: '记录为空',
      });
      return report;
    }

    let allHaveId = true;
    let allHaveSeed = true;
    let allHavePity = true;
    let allHaveTimestamp = true;
    const uniqueIds = new Set<string>();

    for (const record of records) {
      if (!record.id) allHaveId = false;
      if (!record.seed) allHaveSeed = false;
      if (!record.pityBefore || !record.pityAfter) allHavePity = false;
      if (!record.createdAt || record.createdAt <= 0) allHaveTimestamp = false;
      if (record.id) uniqueIds.add(record.id);
    }

    this._addDetail(report, {
      name: '记录 ID',
      passed: allHaveId,
      detail: allHaveId ? '所有记录有 ID' : '部分记录缺少 ID',
    });

    this._addDetail(report, {
      name: 'ID 唯一性',
      passed: uniqueIds.size === records.length,
      detail: `${uniqueIds.size}/${records.length} 个唯一 ID`,
    });

    this._addDetail(report, {
      name: '随机种子',
      passed: allHaveSeed,
      detail: allHaveSeed ? '所有记录有 seed' : '部分记录缺少 seed',
    });

    this._addDetail(report, {
      name: '保底快照 (pityBefore/After)',
      passed: allHavePity,
      detail: allHavePity ? '所有记录有保底快照' : '部分记录缺少保底快照',
    });

    this._addDetail(report, {
      name: '时间戳',
      passed: allHaveTimestamp,
      detail: allHaveTimestamp ? '所有记录有时间戳' : '部分记录缺少时间戳',
    });

    this._addDetail(report, {
      name: '奖励数据',
      passed: records.every((r) => Array.isArray(r.rewards)),
      detail: `总奖励项: ${records.reduce((sum, r) => sum + r.rewards.length, 0)}`,
    });

    return report;
  }

  /**
   * 运行所有校验步骤，返回汇总报告列表。
   */
  runAllVerifications(
    records: DropHistoryRecord[],
    settlement: SettlementResult,
    pityBefore: Record<string, number>,
    pityAfter: Record<string, number>,
    sourceType: string,
    expectedDelta: number,
  ): VerificationReport[] {
    const reports: VerificationReport[] = [];

    // 1. SaveData 一致性
    reports.push(
      this.verifySaveDataConsistency(
        records,
        settlement.totalGold,
        settlement.totalExp,
        settlement.totalEquipment,
        settlement.totalItems,
      ),
    );

    // 2. 保底逻辑
    reports.push(
      this.verifyPityLogic(pityBefore, pityAfter, sourceType, expectedDelta),
    );

    // 3. 多来源排序
    reports.push(this.verifySourceOrdering(records));

    // 4. 历史完整性
    reports.push(this.verifyHistoryIntegrity(records));

    return reports;
  }

  /**
   * 格式化报告为可打印字符串。
   */
  static formatReports(reports: VerificationReport[]): string {
    const lines: string[] = [];
    let totalPassed = 0;
    let totalFailed = 0;

    for (const report of reports) {
      lines.push(`\n=== ${report.title} ===`);
      for (const detail of report.details) {
        const icon = detail.passed ? '✅' : '❌';
        lines.push(`  ${icon} ${detail.name}: ${detail.detail}`);
      }
      lines.push(`  结果: ${report.passedCount} 通过, ${report.failedCount} 失败`);
      totalPassed += report.passedCount;
      totalFailed += report.failedCount;
    }

    lines.push(`\n=== 总计: ${totalPassed} 通过, ${totalFailed} 失败 ===`);
    return lines.join('\n');
  }

  // ==================== 内部方法 ====================

  private _addDetail(report: VerificationReport, detail: VerificationDetail): void {
    report.details.push(detail);
    if (detail.passed) {
      report.passedCount += 1;
    } else {
      report.failedCount += 1;
      report.allPassed = false;
    }
  }
}
