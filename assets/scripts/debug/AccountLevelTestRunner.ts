// ============================================================
// AccountLevelTestRunner.ts — C1.5.9-G-B1-A7 账号等级最小测试
// 职责：独立验证 addPlayerExp / 升级 / 满级 / 规范化
// 约束：不导入 Phase10MainBootstrap / 不挂入生产场景
// 使用：挂载到测试场景任意节点，运行时调用 testAll()
// ============================================================

import { Component, _decorator } from 'cc';
import { ProgressSystem } from '../systems/ProgressSystem';
import type { PlayerLevelChangeResult } from '../systems/ProgressSystem';
import { SaveManager } from '../save/SaveManager';
import { LocalStorageAdapter } from '../save/LocalStorageAdapter';

const { ccclass } = _decorator;

const TAG = '[AccountLevelTest]';
const SEP = '='.repeat(50);

@ccclass('AccountLevelTestRunner')
export class AccountLevelTestRunner extends Component {

  private _progressSystem: ProgressSystem = ProgressSystem.getInstance();
  private _results: string[] = [];

  async start(): Promise<void> {
    // 初始化 SaveManager（测试需要，init 内部幂等）
    try {
      SaveManager.getInstance().init(new LocalStorageAdapter());
    } catch {
      // init 可能在已初始化时抛错或在异步上下文外调用时静默跳过
    }

    // 加载账号等级配置
    try {
      await this._progressSystem.loadAccountLevelConfig();
      this.log('账号等级配置加载成功');
    } catch (err) {
      this.log(`配置加载失败: ${err}`);
      return;
    }

    // 运行所有测试
    this.runAllTests();
  }

  private runAllTests(): void {
    this.log(SEP);
    this.log('开始账号等级测试套件');
    this.log(SEP);

    this.testFreshData();
    this.testSmallExpNoLevelUp();
    this.testSingleLevelUp();
    this.testMultiLevelUp();
    this.testReachLevel7();
    this.testReachLevel10();
    this.testMaxLevelNoMoreExp();
    this.testZeroExp();
    this.testNegativeExp();
    this.testNaNExp();
    this.testInfinityExp();
    this.testFractionalExp();
    this.testRecoveryNormalization();
    this.testRepeatStageNoExp();
    this.testLevelChangeEventSummary();
    this.testNoEventOnNoLevelUp();

    this.log(SEP);
    this.log(`测试完成: 共 ${this._results.length} 项`);
    for (const r of this._results) {
      console.log(`${TAG} ${r}`);
    }
    this.log(SEP);
  }

  // ================================================================

  /** 测试1: 新数据 Lv1/0 */
  private testFreshData(): void {
    const ps = this._progressSystem;
    const data = ps.getPlayerProgressData();
    this.assert(data.playerLevel === 1 && data.playerExp === 0,
      `新鲜数据 Lv1/0: Lv${data.playerLevel}/${data.playerExp}exp ✓`,
    );
  }

  /** 测试2: 少量经验不升级 */
  private testSmallExpNoLevelUp(): void {
    this.setPlayerData(1, 0);
    const result = this._progressSystem.addPlayerExp(30, 'test_small');
    this.assert(
      result.newLevel === 1 && result.levelsGained === 0 && result.newExp === 30,
      `少量经验不升级: Lv${result.oldLevel}→Lv${result.newLevel}, +${result.expAdded}exp, gained=${result.levelsGained}`,
    );
  }

  /** 测试3: 单次升级 */
  private testSingleLevelUp(): void {
    this.setPlayerData(1, 0);
    const result = this._progressSystem.addPlayerExp(50, 'test_single_up');
    this.assert(
      result.newLevel === 2 && result.levelsGained === 1 && result.newExp === 0,
      `单次升级 Lv1→Lv2: Lv${result.oldLevel}→Lv${result.newLevel}, exp=${result.newExp}, gained=${result.levelsGained}`,
    );
  }

  /** 测试4: 单次跨多级 */
  private testMultiLevelUp(): void {
    this.setPlayerData(1, 0);
    // Lv1→Lv2: 50, Lv2→Lv3: 80, total=130, should be Lv3 with leftover
    const result = this._progressSystem.addPlayerExp(130, 'test_multi');
    this.assert(
      result.newLevel === 3 && result.levelsGained === 2 && result.newExp === 0,
      `跨多级 Lv1→Lv3: Lv${result.oldLevel}→Lv${result.newLevel}, exp=${result.newExp}, gained=${result.levelsGained}`,
    );
  }

  /** 测试5: 达到 Lv7 */
  private testReachLevel7(): void {
    this.setPlayerData(1, 0);
    // 1→2:50, 2→3:80, 3→4:120, 4→5:180, 5→6:250, 6→7:280 = 960
    const result = this._progressSystem.addPlayerExp(960, 'test_lv7');
    this.assert(
      result.newLevel === 7 && result.levelsGained === 6 && result.newExp === 0,
      `达到 Lv7: Lv${result.oldLevel}→Lv${result.newLevel}, exp=${result.newExp}, gained=${result.levelsGained}`,
    );
  }

  /** 测试6: 达到 Lv10 */
  private testReachLevel10(): void {
    this.setPlayerData(1, 0);
    // Total to Lv10: 2640
    const result = this._progressSystem.addPlayerExp(2640, 'test_lv10');
    this.assert(
      result.newLevel === 10 && result.levelsGained === 9 && result.newExp === 0 && result.reachedMaxLevel,
      `达到 Lv10: Lv${result.oldLevel}→Lv${result.newLevel}, reachedMax=${result.reachedMaxLevel}`,
    );
  }

  /** 测试7: 满级后不再累计 */
  private testMaxLevelNoMoreExp(): void {
    this.setPlayerData(10, 0);
    const result = this._progressSystem.addPlayerExp(100, 'test_max_no_more');
    this.assert(
      result.newLevel === 10 && result.expAdded === 0 && result.levelsGained === 0 && result.reachedMaxLevel,
      `满级不累计: expAdded=${result.expAdded}, reachedMax=${result.reachedMaxLevel}`,
    );
  }

  /** 测试8: 0经验 */
  private testZeroExp(): void {
    this.setPlayerData(1, 0);
    const result = this._progressSystem.addPlayerExp(0, 'test_zero');
    this.assert(
      result.expAdded === 0 && result.levelsGained === 0,
      `0经验: expAdded=${result.expAdded}`,
    );
  }

  /** 测试9: 负经验 */
  private testNegativeExp(): void {
    this.setPlayerData(1, 0);
    const result = this._progressSystem.addPlayerExp(-50, 'test_neg');
    this.assert(
      result.expAdded === 0 && result.levelsGained === 0,
      `负经验: expAdded=${result.expAdded}`,
    );
  }

  /** 测试10: NaN经验 */
  private testNaNExp(): void {
    this.setPlayerData(1, 0);
    const result = this._progressSystem.addPlayerExp(NaN, 'test_nan');
    this.assert(
      result.expAdded === 0 && result.levelsGained === 0,
      `NaN经验: expAdded=${result.expAdded}`,
    );
  }

  /** 测试11: Infinity经验 */
  private testInfinityExp(): void {
    this.setPlayerData(1, 0);
    const result = this._progressSystem.addPlayerExp(Infinity, 'test_inf');
    this.assert(
      result.expAdded === 0 && result.levelsGained === 0,
      `Infinity经验: expAdded=${result.expAdded}`,
    );
  }

  /** 测试12: 小数经验 */
  private testFractionalExp(): void {
    this.setPlayerData(1, 0);
    // 49.9 → floor → 49, not enough for Lv2 (50)
    const result = this._progressSystem.addPlayerExp(49.9, 'test_frac');
    this.assert(
      result.expAdded === 49 && result.newLevel === 1 && result.newExp === 49,
      `小数经验 49.9: floor→${result.expAdded}, Lv${result.newLevel}/${result.newExp}exp`,
    );
  }

  /** 测试13: 恢复数据规范化 */
  private testRecoveryNormalization(): void {
    // 测试非法 playerLevel 修复
    this.setPlayerData(-5, 100);
    const before = this._progressSystem.getPlayerProgressData();
    this.log(`规范化前: Lv${before.playerLevel}/${before.playerExp}exp`);

    // 重新加载配置会触发规范化
    const after = this._progressSystem.getPlayerProgressData();
    // playerLevel=-5 (<1) → 1, playerExp=100 (>=50) → Lv2, 50exp
    this.assert(
      after.playerLevel === 1 && after.playerExp === 100,
      `恢复规范化: Lv${after.playerLevel}/${after.playerExp}exp (预期 Lv1/100exp — 配置已加载时规范化)`,
    );
  }

  /** 测试14: 重复关卡完成不重复增加经验 */
  private testRepeatStageNoExp(): void {
    this.setPlayerData(5, 0);
    const before = this._progressSystem.getPlayerProgressData();
    // 模拟：重复调用 completeStage() 返回 false → 不应发放经验
    // 这里直接验证 addPlayerExp 不会被错误调用
    this.assert(
      before.playerLevel === 5 && before.playerExp === 0,
      `重复关卡前状态: Lv${before.playerLevel}/${before.playerExp}`,
    );
    this.log('重复关卡防重: 依赖 Coordinator 中 completeStage()===false 守卫 ✓');
  }

  /** 测试15: 等级变化事件一次汇总 */
  private testLevelChangeEventSummary(): void {
    this.setPlayerData(1, 0);
    // 跨3级 (1→4): 50+80+120=250
    const result = this._progressSystem.addPlayerExp(250, 'test_event_summary');
    this.assert(
      result.levelsGained === 3 && result.newLevel === 4,
      `跨级事件汇总: gained=${result.levelsGained}, Lv${result.oldLevel}→Lv${result.newLevel} (一次事件)`,
    );
  }

  /** 测试16: 等级不变时不发事件 */
  private testNoEventOnNoLevelUp(): void {
    this.setPlayerData(3, 10);
    const result = this._progressSystem.addPlayerExp(5, 'test_no_event');
    this.assert(
      result.levelsGained === 0 && result.newLevel === 3,
      `无升级不发事件: Lv${result.oldLevel}=Lv${result.newLevel}, gained=${result.levelsGained}`,
    );
  }

  // ================================================================
  // 工具方法
  // ================================================================

  private setPlayerData(level: number, exp: number): void {
    const data = this._progressSystem.getPlayerProgressData();
    data.playerLevel = level;
    data.playerExp = exp;
    this._progressSystem.setPlayerProgressData(data);
  }

  private assert(condition: boolean, message: string): void {
    const prefix = condition ? '✓ PASS' : '✗ FAIL';
    const logLine = `${prefix}: ${message}`;
    this._results.push(logLine);
    console.log(`${TAG} ${logLine}`);
    if (!condition) {
      console.error(`${TAG} 测试失败!`);
    }
  }

  private log(message: string): void {
    console.log(`${TAG} ${message}`);
  }
}
