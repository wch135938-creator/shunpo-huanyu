// ============================================================
// DropDebugRunner.ts — Phase6-Step2 掉落系统集成测试
// 职责：验证 DropSystem 全链路（权重掉落/固定掉落/多表/领取/历史/校验）
// 约束：不接入战斗 / 不实现 UI
// ============================================================

import { Component, _decorator } from 'cc';
import { EventManager } from '../core/EventManager';
import { SaveManager } from '../save/SaveManager';
import { LocalStorageAdapter } from '../save/LocalStorageAdapter';
import { DropSystem } from '../systems/DropSystem';
import { EquipmentSystem } from '../systems/EquipmentSystem';
import { ProgressSystem } from '../systems/ProgressSystem';
import type { DropResultData, DropHistoryEntry, DropClaimResult } from '../data/drop_types';
import type { DropRolledEventData, DropClaimedEventData } from '../systems/DropSystem';
import type { HeroProgressData, PlayerProgressData } from '../data/hero_progress_data';

const { ccclass } = _decorator;

const TAG = '[DropTest]';
const SEP = '='.repeat(60);
const SEP_MIN = '-'.repeat(60);
const SOURCE_DUNGEON = 'dungeon_test';
const SOURCE_MULTI = 'multi_table_test';
const TEST_PLAYER_ID = 'player_001';

interface TestResult {
  id: number;
  name: string;
  pass: boolean;
  detail: string;
}

@ccclass('DropDebugRunner')
export class DropDebugRunner extends Component {
  private _eventManager!: EventManager;
  private _dropSystem!: DropSystem;
  private _saveManager!: SaveManager;

  private _results: TestResult[] = [];

  // 事件标志
  private _eventFlags = {
    rolled: false,
    claimed: false,
    lastRolled: null as DropRolledEventData | null,
    lastClaimed: null as DropClaimedEventData | null,
  };

  // 事件回调引用
  private _onRolled: ((...args: unknown[]) => void) | null = null;
  private _onClaimed: ((...args: unknown[]) => void) | null = null;

  // ==================== Cocos 生命周期 ====================

  start(): void {
    console.log('[DropDebugRunner] start');
    this._eventManager = EventManager.getInstance();
    this._dropSystem = DropSystem.getInstance();
    this._saveManager = SaveManager.getInstance();

    this._run()
      .catch((err: unknown) => {
        console.error(`${TAG} 集成测试异常`, err);
        this._printSummary(false);
      });
  }

  onDestroy(): void {
    this._cleanupListeners();
  }

  // ==================== 主流程 ====================

  private async _run(): Promise<void> {
    console.log(`${TAG} ${SEP}`);
    console.log(`${TAG} Phase6-Step2 掉落系统集成测试开始`);
    console.log(`${TAG} ${SEP_MIN}`);

    // 初始化
    this._initializeSaveManager();
    this._registerListeners();
    await this._loadConfigs();
    this._initializeTestData();

    // 执行测试
    this._results = [];

    this._results.push(await this._test01ConfigLoad());
    this._results.push(this._test02RollSingleTable());
    this._results.push(this._test03RollFixedDrop());
    this._results.push(this._test04RollRandomDrop());
    this._results.push(this._test05RollMultiTable());
    this._results.push(this._test06ClaimDrop());
    this._results.push(this._test07DuplicateClaim());
    this._results.push(this._test08GetDropHistory());
    this._results.push(this._test09ValidateDrop());
    this._results.push(this._test10ValidateInvalidDrops());
    this._results.push(this._test11EventDispatch());
    this._results.push(this._test12EdgeCases());

    // 输出
    this._printSummary(this._allPassed());
    this._cleanupListeners();
  }

  // ==================== 初始化 ====================

  private _initializeSaveManager(): void {
    const hasSave = this._saveManager.init(new LocalStorageAdapter());
    console.log(`${TAG} SaveManager 初始化完成, hasSave=${hasSave}`);
  }

  private async _loadConfigs(): Promise<void> {
    await Promise.all([
      this._dropSystem.loadConfig(),
      EquipmentSystem.getInstance().loadConfig(),
      ProgressSystem.getInstance().loadConfig(),
    ]);
    console.log(`${TAG} 配置加载完成`);
    console.log(`${TAG}   dropSystem.loaded=${this._dropSystem.isConfigLoaded()}`);
    console.log(`${TAG}   equipmentSystem.loaded=${EquipmentSystem.getInstance().isConfigLoaded()}`);
  }

  private _initializeTestData(): void {
    // 初始化测试英雄数据
    const testHero: HeroProgressData = {
      heroId: 'hero_301',
      level: 5,
      exp: 0,
      power: 100,
    };
    const testPlayer: PlayerProgressData = {
      playerLevel: 1,
      playerExp: 0,
      totalPower: 100,
      highestStageId: 'STAGE_001',
      lastGrowthAt: 0,
    };
    ProgressSystem.getInstance().clearProgress();
    ProgressSystem.getInstance().setHeroProgress(testHero);
    ProgressSystem.getInstance().setPlayerProgressData(testPlayer);
    EquipmentSystem.getInstance().clearData();
    console.log(`${TAG} 测试数据初始化完成`);
  }

  // ==================== 事件监听 ====================

  private _registerListeners(): void {
    this._onRolled = (...args: unknown[]): void => {
      this._eventFlags.rolled = true;
      this._eventFlags.lastRolled = args[0] as DropRolledEventData;
      console.log(`${TAG} 📡 drop:rolled — sourceId=${this._eventFlags.lastRolled.sourceId}, gold=${this._eventFlags.lastRolled.gold}`);
    };
    this._eventManager.on(DropSystem.DROP_ROLLED, this._onRolled, this);

    this._onClaimed = (...args: unknown[]): void => {
      this._eventFlags.claimed = true;
      this._eventFlags.lastClaimed = args[0] as DropClaimedEventData;
      console.log(`${TAG} 📡 drop:claimed — sourceId=${this._eventFlags.lastClaimed.sourceId}`);
    };
    this._eventManager.on(DropSystem.DROP_CLAIMED, this._onClaimed, this);
  }

  private _resetEventFlags(): void {
    this._eventFlags = {
      rolled: false,
      claimed: false,
      lastRolled: null,
      lastClaimed: null,
    };
  }

  // ==================== Test 01: 配置加载 ====================

  private async _test01ConfigLoad(): Promise<TestResult> {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 01: 配置加载`);

    try {
      const entries = this._dropSystem.getAllDropEntries();
      const checks: string[] = [];
      let pass = true;

      if (!this._dropSystem.isConfigLoaded()) {
        pass = false;
        checks.push('isConfigLoaded 返回 false');
      }
      if (entries.length < 5) {
        pass = false;
        checks.push(`掉落表数量不足: ${entries.length}`);
      } else {
        checks.push(`已加载 ${entries.length} 个掉落表`);
      }

      // 验证各类型掉落表
      const types = [...new Set(entries.map((e) => e.dropType))];
      checks.push(`掉落类型: ${types.join(', ')}`);

      const detail = pass ? checks.join('; ') : checks.join(' | ');
      console.log(`${TAG}   → ${pass ? '✅ PASS' : '❌ FAIL'}: ${detail}`);
      return { id: 1, name: '配置加载', pass, detail };
    } catch (e) {
      console.log(`${TAG}   → ❌ FAIL: ${e}`);
      return { id: 1, name: '配置加载', pass: false, detail: String(e) };
    }
  }

  // ==================== Test 02: 单表掉落 ====================

  private _test02RollSingleTable(): TestResult {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 02: 单表掉落 (DROP_001)`);
    this._resetEventFlags();

    try {
      const result = this._dropSystem.rollDrop(1, SOURCE_DUNGEON, TEST_PLAYER_ID);

      const checks: string[] = [];
      let pass = true;

      if (!result) { pass = false; checks.push('rollDrop 返回 null'); }

      if (result) {
        if (result.gold <= 0) { pass = false; checks.push('金币为 0'); }
        if (result.exp <= 0) { pass = false; checks.push('经验为 0'); }
        if (result.claimStatus !== false) { pass = false; checks.push('claimStatus 应为 false'); }
        if (result.dropSourceId !== SOURCE_DUNGEON) {
          pass = false;
          checks.push(`dropSourceId 不匹配: ${result.dropSourceId}`);
        }

        checks.push(`gold=${result.gold}, exp=${result.exp}`);
        checks.push(`equipment=${result.equipmentList.length}, items=${result.itemList.length}`);
      }

      if (!this._eventFlags.rolled) { pass = false; checks.push('drop:rolled 事件未触发'); }

      if (pass) checks.push('drop:rolled 事件已触发');

      const detail = pass ? checks.join('; ') : checks.join(' | ');
      console.log(`${TAG}   → ${pass ? '✅ PASS' : '❌ FAIL'}: ${detail}`);
      return { id: 2, name: '单表掉落', pass, detail };
    } catch (e) {
      console.log(`${TAG}   → ❌ FAIL: ${e}`);
      return { id: 2, name: '单表掉落', pass: false, detail: String(e) };
    }
  }

  // ==================== Test 03: 固定掉落 ====================

  private _test03RollFixedDrop(): TestResult {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 03: 固定掉落 (Boss 表 DROP_005)`);

    try {
      // Boss 表包含大量 isGuaranteed=true 的项
      const result = this._dropSystem.rollDrop(5, 'boss_test', TEST_PLAYER_ID);

      const checks: string[] = [];
      let pass = true;

      if (!result) { pass = false; checks.push('rollDrop 返回 null'); }

      if (result) {
        // Boss 表保底: gold 500~800, exp 250~400, equip R 保底 1
        if (result.gold < 500) { pass = false; checks.push(`金币低于保底: ${result.gold} < 500`); }
        if (result.exp < 250) { pass = false; checks.push(`经验低于保底: ${result.exp} < 250`); }
        if (result.equipmentList.length < 1) {
          pass = false;
          checks.push('Boss 表应至少掉落 1 件装备');
        }

        checks.push(`gold=${result.gold}, exp=${result.exp}`);
        checks.push(`装备=${result.equipmentList.length}件, 物品=${result.itemList.length}种`);
      }

      const detail = pass ? checks.join('; ') : checks.join(' | ');
      console.log(`${TAG}   → ${pass ? '✅ PASS' : '❌ FAIL'}: ${detail}`);
      return { id: 3, name: '固定掉落', pass, detail };
    } catch (e) {
      console.log(`${TAG}   → ❌ FAIL: ${e}`);
      return { id: 3, name: '固定掉落', pass: false, detail: String(e) };
    }
  }

  // ==================== Test 04: 随机掉落 ====================

  private _test04RollRandomDrop(): TestResult {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 04: 随机掉落 (多次采样)`);

    try {
      const sampleCount = 100;
      let totalEquip = 0;
      let totalGold = 0;
      let totalExp = 0;

      for (let i = 0; i < sampleCount; i++) {
        const result = this._dropSystem.rollDrop(1, 'sample_test', TEST_PLAYER_ID);
        if (result) {
          totalGold += result.gold;
          totalExp += result.exp;
          totalEquip += result.equipmentList.length;
        }
      }

      // 验证平均值合理（gold 100~200, exp 50~100, equip 15%）
      const avgGold = totalGold / sampleCount;
      const avgExp = totalExp / sampleCount;
      const equipRate = totalEquip / sampleCount;

      const checks: string[] = [];
      let pass = true;

      if (avgGold < 100 || avgGold > 200) {
        pass = false;
        checks.push(`金币均值异常: ${avgGold.toFixed(1)} (期望 100~200)`);
      }
      if (avgExp < 50 || avgExp > 100) {
        pass = false;
        checks.push(`经验均值异常: ${avgExp.toFixed(1)} (期望 50~100)`);
      }

      checks.push(`金币均值=${avgGold.toFixed(1)}, 经验均值=${avgExp.toFixed(1)}`);
      checks.push(`装备掉落率=${(equipRate * 100).toFixed(1)}% (期望≈15%)`);

      const detail = pass ? checks.join('; ') : checks.join(' | ');
      console.log(`${TAG}   → ${pass ? '✅ PASS' : '❌ FAIL'}: ${detail}`);
      return { id: 4, name: '随机掉落', pass, detail };
    } catch (e) {
      console.log(`${TAG}   → ❌ FAIL: ${e}`);
      return { id: 4, name: '随机掉落', pass: false, detail: String(e) };
    }
  }

  // ==================== Test 05: 多表组合 ====================

  private _test05RollMultiTable(): TestResult {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 05: 多表组合掉落 (1,2,3)`);

    try {
      // 使用逗号分隔的多表 ID
      const result = this._dropSystem.rollDrop('1,2,3', SOURCE_MULTI, TEST_PLAYER_ID);

      const checks: string[] = [];
      let pass = true;

      if (!result) { pass = false; checks.push('多表 rollDrop 返回 null'); }

      if (result) {
        // 三张表汇总后应远大于单表
        if (result.gold < 300) {
          pass = false;
          checks.push(`多表金币偏低: ${result.gold} (三表汇总期望≥300)`);
        }
        if (result.exp < 150) {
          pass = false;
          checks.push(`多表经验偏低: ${result.exp} (三表汇总期望≥150)`);
        }

        checks.push(`汇总: gold=${result.gold}, exp=${result.exp}`);
        checks.push(`equipment=${result.equipmentList.length}, items=${result.itemList.length}`);
        checks.push(`sourceId=${result.dropSourceId}`);
      }

      // 也测试 rollDropMulti API
      const result2 = this._dropSystem.rollDropMulti([1, 2], 'multi_api_test', TEST_PLAYER_ID);
      if (!result2) {
        pass = false;
        checks.push('rollDropMulti 返回 null');
      } else {
        checks.push('rollDropMulti API 正常');
      }

      const detail = pass ? checks.join('; ') : checks.join(' | ');
      console.log(`${TAG}   → ${pass ? '✅ PASS' : '❌ FAIL'}: ${detail}`);
      return { id: 5, name: '多表组合', pass, detail };
    } catch (e) {
      console.log(`${TAG}   → ❌ FAIL: ${e}`);
      return { id: 5, name: '多表组合', pass: false, detail: String(e) };
    }
  }

  // ==================== Test 06: 领取奖励 ====================

  private _test06ClaimDrop(): TestResult {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 06: 领取奖励`);
    this._resetEventFlags();

    try {
      const result = this._dropSystem.rollDrop(5, 'claim_test', TEST_PLAYER_ID);
      if (!result) {
        return { id: 6, name: '领取奖励', pass: false, detail: '前置: rollDrop 返回 null' };
      }

      const claimResult = this._dropSystem.claimDrop(result, TEST_PLAYER_ID);

      const checks: string[] = [];
      let pass = true;

      if (!claimResult.success) {
        pass = false;
        checks.push(`领取失败: ${claimResult.reason}`);
      }
      if (result.claimStatus !== true) {
        pass = false;
        checks.push('claimStatus 未更新为 true');
      }
      if (!this._eventFlags.claimed) {
        pass = false;
        checks.push('drop:claimed 事件未触发');
      }

      checks.push(`领取: gold=${claimResult.goldClaimed}, exp=${claimResult.expClaimed}`);
      checks.push(`equipment=${claimResult.equipmentCount}, items=${claimResult.itemCount}`);

      const detail = pass ? checks.join('; ') : checks.join(' | ');
      console.log(`${TAG}   → ${pass ? '✅ PASS' : '❌ FAIL'}: ${detail}`);
      return { id: 6, name: '领取奖励', pass, detail };
    } catch (e) {
      console.log(`${TAG}   → ❌ FAIL: ${e}`);
      return { id: 6, name: '领取奖励', pass: false, detail: String(e) };
    }
  }

  // ==================== Test 07: 防重复领取 ====================

  private _test07DuplicateClaim(): TestResult {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 07: 防重复领取`);

    try {
      const result = this._dropSystem.rollDrop(1, 'dup_test', TEST_PLAYER_ID);
      if (!result) {
        return { id: 7, name: '防重复领取', pass: false, detail: '前置: rollDrop 返回 null' };
      }

      // 第一次领取应成功
      const claim1 = this._dropSystem.claimDrop(result, TEST_PLAYER_ID);

      // 第二次领取应被拒绝
      const claim2 = this._dropSystem.claimDrop(result, TEST_PLAYER_ID);

      const pass = claim1.success && !claim2.success;
      const detail = pass
        ? `首次领取成功, 二次领取正确拒绝: ${claim2.reason}`
        : `首次: ${claim1.success}, 二次: ${claim2.success} (${claim2.reason})`;

      console.log(`${TAG}   → ${pass ? '✅ PASS' : '❌ FAIL'}: ${detail}`);
      return { id: 7, name: '防重复领取', pass, detail };
    } catch (e) {
      console.log(`${TAG}   → ❌ FAIL: ${e}`);
      return { id: 7, name: '防重复领取', pass: false, detail: String(e) };
    }
  }

  // ==================== Test 08: 掉落历史 ====================

  private _test08GetDropHistory(): TestResult {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 08: 掉落历史`);

    try {
      // 生成并领取几条掉落（产生历史记录）
      for (let i = 0; i < 3; i++) {
        const result = this._dropSystem.rollDrop(i + 1, `history_test_${i}`, TEST_PLAYER_ID);
        if (result) {
          this._dropSystem.claimDrop(result, TEST_PLAYER_ID);
        }
      }

      // 获取全部历史
      const allHistory = this._dropSystem.getDropHistory();
      // 获取特定玩家历史
      const playerHistory = this._dropSystem.getDropHistory(TEST_PLAYER_ID);

      const checks: string[] = [];
      let pass = true;

      if (allHistory.length < 1) {
        pass = false;
        checks.push('全部历史为空');
      } else {
        checks.push(`全部历史: ${allHistory.length} 条`);
      }

      if (playerHistory.length < 1) {
        pass = false;
        checks.push('玩家历史为空');
      } else {
        checks.push(`玩家 ${TEST_PLAYER_ID} 历史: ${playerHistory.length} 条`);
      }

      // 验证历史条目结构
      const firstEntry = allHistory[0];
      if (!firstEntry.playerId || !firstEntry.result) {
        pass = false;
        checks.push('历史条目结构不完整');
      } else {
        checks.push(`最新记录: sourceId=${firstEntry.sourceId}, claimStatus=${firstEntry.result.claimStatus}`);
      }

      const detail = pass ? checks.join('; ') : checks.join(' | ');
      console.log(`${TAG}   → ${pass ? '✅ PASS' : '❌ FAIL'}: ${detail}`);
      return { id: 8, name: '掉落历史', pass, detail };
    } catch (e) {
      console.log(`${TAG}   → ❌ FAIL: ${e}`);
      return { id: 8, name: '掉落历史', pass: false, detail: String(e) };
    }
  }

  // ==================== Test 09: 合法性校验 ====================

  private _test09ValidateDrop(): TestResult {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 09: 合法性校验（正常数据）`);

    try {
      const result = this._dropSystem.rollDrop(1, 'validate_test', TEST_PLAYER_ID);
      if (!result) {
        return { id: 9, name: '合法性校验', pass: false, detail: '前置: rollDrop 返回 null' };
      }

      const validation = this._dropSystem.validateDrop(result);

      const pass = validation.valid;
      const detail = pass
        ? `校验通过: valid=${validation.valid}`
        : `校验失败: ${validation.reason}`;

      console.log(`${TAG}   → ${pass ? '✅ PASS' : '❌ FAIL'}: ${detail}`);
      return { id: 9, name: '合法性校验', pass, detail };
    } catch (e) {
      console.log(`${TAG}   → ❌ FAIL: ${e}`);
      return { id: 9, name: '合法性校验', pass: false, detail: String(e) };
    }
  }

  // ==================== Test 10: 非法数据校验 ====================

  private _test10ValidateInvalidDrops(): TestResult {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 10: 非法数据校验`);

    const subResults: string[] = [];
    let allPassed = true;

    // 10.1 空数据
    const v1 = this._dropSystem.validateDrop(null as unknown as DropResultData);
    if (v1.valid) { allPassed = false; subResults.push('❌ 10.1 null 数据应不合法'); }
    else { subResults.push('✅ 10.1 null 数据正确拒绝'); }

    // 10.2 负金币
    const badGold = this._dropSystem.rollDrop(1, 'bad_test', TEST_PLAYER_ID);
    if (badGold) {
      badGold.gold = -100;
      const v2 = this._dropSystem.validateDrop(badGold);
      if (v2.valid) { allPassed = false; subResults.push('❌ 10.2 负金币应不合法'); }
      else { subResults.push('✅ 10.2 负金币正确拒绝'); }
    }

    // 10.3 空 sourceId
    const badSource = this._dropSystem.rollDrop(1, 'bad_test2', TEST_PLAYER_ID);
    if (badSource) {
      badSource.dropSourceId = '';
      const v3 = this._dropSystem.validateDrop(badSource);
      if (v3.valid) { allPassed = false; subResults.push('❌ 10.3 空 sourceId 应不合法'); }
      else { subResults.push('✅ 10.3 空 sourceId 正确拒绝'); }
    }

    // 10.4 超大金币
    const hugeGold = this._dropSystem.rollDrop(1, 'bad_test3', TEST_PLAYER_ID);
    if (hugeGold) {
      hugeGold.gold = 9999999;
      const v4 = this._dropSystem.validateDrop(hugeGold);
      if (v4.valid) { allPassed = false; subResults.push('❌ 10.4 超大金币应不合法'); }
      else { subResults.push('✅ 10.4 超大金币正确拒绝'); }
    }

    const detail = subResults.join('; ');
    console.log(`${TAG}   → ${allPassed ? '✅ PASS' : '❌ FAIL'}`);
    for (const s of subResults) {
      console.log(`${TAG}      ${s}`);
    }
    return { id: 10, name: '非法数据校验', pass: allPassed, detail };
  }

  // ==================== Test 11: 事件派发 ====================

  private _test11EventDispatch(): TestResult {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 11: 事件派发`);
    this._resetEventFlags();

    try {
      const result = this._dropSystem.rollDrop(1, 'event_test', TEST_PLAYER_ID);

      const checks: string[] = [];
      let pass = true;

      if (!this._eventFlags.rolled) {
        pass = false;
        checks.push('rollDrop 后 drop:rolled 未触发');
      } else {
        checks.push('drop:rolled 已触发');
      }

      // 领取后应触发 drop:claimed
      if (result) {
        this._dropSystem.claimDrop(result, TEST_PLAYER_ID);
        if (!this._eventFlags.claimed) {
          pass = false;
          checks.push('claimDrop 后 drop:claimed 未触发');
        } else {
          checks.push('drop:claimed 已触发');
        }
      }

      const detail = pass ? checks.join('; ') : checks.join(' | ');
      console.log(`${TAG}   → ${pass ? '✅ PASS' : '❌ FAIL'}: ${detail}`);
      return { id: 11, name: '事件派发', pass, detail };
    } catch (e) {
      console.log(`${TAG}   → ❌ FAIL: ${e}`);
      return { id: 11, name: '事件派发', pass: false, detail: String(e) };
    }
  }

  // ==================== Test 12: 边界测试 ====================

  private _test12EdgeCases(): TestResult {
    console.log(`${TAG} ${SEP_MIN}`);
    console.log(`${TAG} Test 12: 边界测试`);

    const subResults: string[] = [];
    let allPassed = true;

    // 12.1 不存在的掉落表
    const nullResult = this._dropSystem.rollDrop(999, 'edge_test', TEST_PLAYER_ID);
    if (nullResult !== null) {
      allPassed = false;
      subResults.push('❌ 12.1 不存在掉落表应返回 null（但有保底，可能不返回 null）');
    } else {
      subResults.push('✅ 12.1 不存在掉落表返回 null（正确）');
    }

    // 12.2 空字符串 ID
    const emptyResult = this._dropSystem.rollDrop('', 'edge_test2', TEST_PLAYER_ID);
    if (emptyResult !== null) {
      allPassed = false;
      subResults.push('❌ 12.2 空 ID 应返回 null');
    } else {
      subResults.push('✅ 12.2 空 ID 返回 null（正确）');
    }

    // 12.3 字符串 ID
    try {
      const strResult = this._dropSystem.rollDrop('1', 'edge_str', TEST_PLAYER_ID);
      if (strResult && strResult.gold > 0) {
        subResults.push('✅ 12.3 字符串 "1" 正常解析');
      } else {
        allPassed = false;
        subResults.push('❌ 12.3 字符串 ID 解析失败');
      }
    } catch (e) {
      allPassed = false;
      subResults.push(`❌ 12.3 字符串 ID 异常: ${e}`);
    }

    // 12.4 空格分隔多表
    try {
      const spaceResult = this._dropSystem.rollDrop('1 2', 'edge_space', TEST_PLAYER_ID);
      if (spaceResult && spaceResult.gold > 0) {
        subResults.push('✅ 12.4 空格分隔多表正常');
      } else {
        allPassed = false;
        subResults.push('❌ 12.4 空格分隔多表失败');
      }
    } catch (e) {
      allPassed = false;
      subResults.push(`❌ 12.4 空格分隔多表异常: ${e}`);
    }

    // 12.5 首通掉落表（DROP_F001）
    try {
      const firstClear = this._dropSystem.rollDrop('F001', 'edge_fc', TEST_PLAYER_ID);
      if (firstClear && firstClear.itemList.length > 0) {
        subResults.push('✅ 12.5 首通掉落表（F001）正常');
      } else {
        allPassed = false;
        subResults.push('❌ 12.5 首通掉落表无物品产出');
      }
    } catch (e) {
      allPassed = false;
      subResults.push(`❌ 12.5 首通掉落表异常: ${e}`);
    }

    const detail = subResults.join('; ');
    console.log(`${TAG}   → ${allPassed ? '✅ PASS' : '❌ FAIL'}`);
    for (const s of subResults) {
      console.log(`${TAG}      ${s}`);
    }
    return { id: 12, name: '边界测试', pass: allPassed, detail };
  }

  // ==================== 输出 ====================

  private _allPassed(): boolean {
    return this._results.every((r) => r.pass);
  }

  private _printSummary(allPassed: boolean): void {
    console.log(`${TAG} ${SEP}`);
    console.log(`${TAG} 测试结果汇总:`);
    console.log(`${TAG} ${'─'.repeat(50)}`);
    console.log(`${TAG} | ${'#'.padEnd(3)} | ${'Test Name'.padEnd(24)} | Result |`);
    console.log(`${TAG} |${'─'.repeat(5)}|${'─'.repeat(26)}|${'─'.repeat(8)}|`);

    for (const r of this._results) {
      const status = r.pass ? 'PASS' : 'FAIL';
      console.log(`${TAG} | ${String(r.id).padEnd(3)} | ${r.name.padEnd(24)} | ${status.padEnd(6)} |`);
    }

    console.log(`${TAG} |${'─'.repeat(5)}|${'─'.repeat(26)}|${'─'.repeat(8)}|`);
    const passCount = this._results.filter((r) => r.pass).length;
    const failCount = this._results.filter((r) => !r.pass).length;
    console.log(`${TAG} |     | 合计: ${passCount}/${this._results.length} PASS, ${failCount} FAIL    |`);
    console.log(`${TAG} ${SEP}`);

    if (allPassed) {
      console.log(`${TAG} ========== Phase6-Step2 掉落系统集成测试全部通过 ✅ ==========`);
    } else {
      console.log(`${TAG} ========== Phase6-Step2 掉落系统集成测试未通过 ❌ ==========`);
      console.log(`${TAG} 失败项:`);
      for (const r of this._results) {
        if (!r.pass) {
          console.log(`${TAG}   - Test ${r.id}: ${r.name} — ${r.detail}`);
        }
      }
    }
    console.log(`${TAG} ${SEP}`);
  }

  // ==================== 清理 ====================

  private _cleanupListeners(): void {
    if (!this._eventManager) return;

    if (this._onRolled) {
      this._eventManager.off(DropSystem.DROP_ROLLED, this._onRolled, this);
      this._onRolled = null;
    }
    if (this._onClaimed) {
      this._eventManager.off(DropSystem.DROP_CLAIMED, this._onClaimed, this);
      this._onClaimed = null;
    }
  }
}
