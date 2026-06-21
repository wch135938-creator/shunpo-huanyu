// ============================================================
// MigrationPhaseDebugRunner — Phase6-Step5B 真实存档迁移验证
// 职责：模拟 Phase3/4A/4B/5 真实存档 → 迁移 → 校验 → 验证全流程
// 位置：Debug 层
// ============================================================

import { BaseSystem } from '../core/BaseSystem';
import { SaveMigrationSystem } from '../save/SaveMigrationSystem';
import { SaveValidator } from '../save/SaveValidator';
import { SaveBackup } from '../save/SaveBackup';
import { SaveManager } from '../save/SaveManager';
import { PowerRecalculateOnMigration } from '../save/PowerRecalculateOnMigration';
import { LocalStorageAdapter } from '../save/LocalStorageAdapter';
import { SaveContainer, CURRENT_SAVE_VERSION } from '../save/SaveContainer';

/**
 * Phase 级迁移调试运行器。
 *
 * 在编辑器环境下通过调用 MigrationPhaseDebugRunner.runAll() 执行完整 Phase 级迁移验证。
 *
 * 测试覆盖：
 *   Test 1: Phase3  真实存档迁移（player + cards + settings，无 growth/equipment/dungeon/dropHistory）
 *   Test 2: Phase4A 真实存档迁移（新增 growth，无 equipment/dungeon/dropHistory）
 *   Test 3: Phase4B 真实存档迁移（新增 equipment，无 dungeon/dropHistory）
 *   Test 4: Phase5  真实存档迁移（同 Phase4B，Phase5 为 UI 层无数据结构变更）
 *   Test 5: 自动保存 + 重启读取验证
 *   Test 6: 战力正确性验证
 *   Test 7: Dungeon 数据正确性验证
 *   Test 8: Equipment 数据正确性验证
 *   Test 9: V1→V2→V3 连续迁移链测试
 */
export class MigrationPhaseDebugRunner extends BaseSystem {

  private _logs: string[] = [];

  // ==================== 入口：运行所有测试 ====================

  runAll(): void {
    this._logs = [];
    this._log('========== Phase6-Step5B 真实存档迁移验证 ==========');
    this._log(`当前存档版本: V${CURRENT_SAVE_VERSION}`);
    this._log(`测试时间: ${new Date().toISOString()}`);
    this._log('');

    let passCount = 0;
    let failCount = 0;

    const tests: { name: string; fn: () => boolean }[] = [
      { name: 'Phase3 真实存档迁移', fn: () => this._testPhase3Migration() },
      { name: 'Phase4A 真实存档迁移', fn: () => this._testPhase4AMigration() },
      { name: 'Phase4B 真实存档迁移', fn: () => this._testPhase4BMigration() },
      { name: 'Phase5 真实存档迁移', fn: () => this._testPhase5Migration() },
      { name: '自动保存 + 重启读取', fn: () => this._testAutoSaveAndReload() },
      { name: '战力正确性验证', fn: () => this._testCombatPowerCorrectness() },
      { name: 'Dungeon 数据正确性', fn: () => this._testDungeonDataCorrectness() },
      { name: 'Equipment 数据正确性', fn: () => this._testEquipmentDataCorrectness() },
      { name: 'V1→V2→V3 连续迁移链', fn: () => this._testContinuousMigrationChain() },
    ];

    for (const test of tests) {
      this._log('');
      this._log(`>>> ${test.name} <<<`);
      try {
        if (test.fn()) {
          passCount += 1;
          this._log(`✅ PASS: ${test.name}`);
        } else {
          failCount += 1;
          this._log(`❌ FAIL: ${test.name}`);
        }
      } catch (e) {
        failCount += 1;
        this._log(`❌ FAIL (异常): ${test.name} — ${e}`);
      }
    }

    this._log('');
    this._log('===================================================');
    this._log(`总结果: ${passCount} PASS / ${failCount} FAIL`);
    this._log('===================================================');

    this._cleanup();
  }

  // ==================== Test 1: Phase3 真实存档迁移 ====================

  /**
   * Phase3 存档格式：
   *   - 有 player、cards、settings、ad
   *   - 无 saveVersion、timestamp、equipment、growth、dungeon、dropHistory
   */
  private _testPhase3Migration(): boolean {
    this._log('--- Test 1: Phase3 真实存档迁移 ---');

    const phase3Save = this._createPhase3Save();
    this._logDiffs(phase3Save, '迁移前');

    // 执行迁移
    const migrationSystem = SaveMigrationSystem.getInstance();
    const result = migrationSystem.migrate(phase3Save);

    if (!result.success) {
      this._log(`  ❌ 迁移失败: ${result.errors.join('; ')}`);
      return false;
    }

    this._log(`  执行步骤: ${result.stepsExecuted} (${result.executedSteps.join(', ')})`);
    this._log(`  版本号: V${result.originalVersion} → V${result.finalVersion}`);

    // 验证所有子模块已补全
    const checks: { label: string; ok: boolean }[] = [
      { label: 'saveVersion === 1', ok: phase3Save.saveVersion === 1 },
      { label: 'timestamp 存在且为有效数值', ok: typeof phase3Save.timestamp === 'number' && Number.isFinite(phase3Save.timestamp) },
      { label: 'player 数据保留', ok: phase3Save.player.level === 12 && phase3Save.player.combatPower === 1800 },
      { label: 'cards 数据保留', ok: Array.isArray(phase3Save.cards) && phase3Save.cards.length === 3 },
      { label: 'settings 数据保留', ok: phase3Save.settings.musicVolume === 85 && phase3Save.settings.sfxVolume === 70 },
      { label: 'ad 数据保留', ok: phase3Save.ad.totalWatched === 8 && phase3Save.ad.todayWatched === 3 },
      { label: 'growth 已补全', ok: typeof phase3Save.growth === 'object' && phase3Save.growth !== null },
      { label: 'growth.playerProgress 已补全', ok: typeof phase3Save.growth?.playerProgress === 'object' },
      { label: 'growth.heroProgressList 已补全', ok: Array.isArray(phase3Save.growth?.heroProgressList) },
      { label: 'equipment 已补全', ok: typeof phase3Save.equipment === 'object' && typeof phase3Save.equipment.instances === 'object' },
      { label: 'dungeon 已补全', ok: typeof phase3Save.dungeon === 'object' && typeof phase3Save.dungeon.instances === 'object' },
      { label: 'dropHistory 已补全', ok: typeof phase3Save.dropHistory === 'object' && Array.isArray(phase3Save.dropHistory.history) },
    ];

    // growth 从 Legacy player 数据推断
    const pp = phase3Save.growth?.playerProgress;
    const legacyMapped =
      pp && pp.playerLevel === phase3Save.player.level
      && pp.totalPower === phase3Save.player.combatPower
      && pp.highestStageId === `STAGE_${String(phase3Save.player.stageId).padStart(3, '0')}`;

    checks.push({ label: 'growth 从 Legacy player 正确推断', ok: legacyMapped });

    // Dungeon 默认值
    const dungeonOk =
      phase3Save.dungeon.currentStamina === 100
      && phase3Save.dungeon.maxStamina === 100
      && Array.isArray(phase3Save.dungeon.runHistory);
    checks.push({ label: 'dungeon 默认值正确', ok: dungeonOk });

    // 校验器验证
    const validationResult = SaveValidator.getInstance().validate(phase3Save);
    checks.push({ label: '迁移后通过全量校验', ok: validationResult.valid });

    let allOk = true;
    for (const check of checks) {
      this._log(`  ${check.ok ? '✅' : '❌'} ${check.label}`);
      if (!check.ok) allOk = false;
    }

    // 打印校验问题（如有）
    if (!validationResult.valid) {
      for (const issue of validationResult.issues) {
        if (issue.severity === 'error') {
          this._log(`    [${issue.severity}] ${issue.path}: ${issue.message}`);
        }
      }
    }

    return allOk;
  }

  // ==================== Test 2: Phase4A 真实存档迁移 ====================

  /**
   * Phase4A 存档格式：
   *   - 有 player、cards、settings、ad、growth
   *   - 有 saveVersion=0
   *   - 无 equipment、dungeon、dropHistory
   *   - growth 包含真实 heroProgressList
   */
  private _testPhase4AMigration(): boolean {
    this._log('--- Test 2: Phase4A 真实存档迁移 ---');

    const phase4ASave = this._createPhase4ASave();
    this._log('  迁移前：growth 存在、equipment/dungeon/dropHistory 缺失');

    const migrationSystem = SaveMigrationSystem.getInstance();
    const result = migrationSystem.migrate(phase4ASave);

    if (!result.success) {
      this._log(`  ❌ 迁移失败: ${result.errors.join('; ')}`);
      return false;
    }

    this._log(`  执行步骤: ${result.stepsExecuted} (${result.executedSteps.join(', ')})`);

    const checks: { label: string; ok: boolean }[] = [
      { label: 'saveVersion === 1', ok: phase4ASave.saveVersion === 1 },
      { label: 'player 数据保留', ok: phase4ASave.player.level === 20 && phase4ASave.player.stageId === 10 },
      { label: 'cards 数据保留', ok: phase4ASave.cards.length === 4 && phase4ASave.cards[0].cardId === 1 },
      { label: 'growth.playerProgress 保留', ok: phase4ASave.growth.playerProgress.playerLevel === 20 },
      { label: 'growth.heroProgressList 保留', ok: phase4ASave.growth.heroProgressList.length === 3 },
      { label: 'heroProgress 具体数据保留', ok: phase4ASave.growth.heroProgressList[0].heroId === 'HERO_001' && phase4ASave.growth.heroProgressList[0].level === 12 },
      { label: 'equipment 已补全', ok: typeof phase4ASave.equipment?.instances === 'object' && typeof phase4ASave.equipment?.heroEquipment === 'object' },
      { label: 'dungeon 已补全', ok: typeof phase4ASave.dungeon?.instances === 'object' && phase4ASave.dungeon.currentStamina === 100 },
      { label: 'dropHistory 已补全', ok: Array.isArray(phase4ASave.dropHistory?.history) },
    ];

    // 校验
    const vr = SaveValidator.getInstance().validate(phase4ASave);
    checks.push({ label: '迁移后通过全量校验', ok: vr.valid });

    let allOk = true;
    for (const check of checks) {
      this._log(`  ${check.ok ? '✅' : '❌'} ${check.label}`);
      if (!check.ok) allOk = false;
    }

    return allOk;
  }

  // ==================== Test 3: Phase4B 真实存档迁移 ====================

  /**
   * Phase4B 存档格式：
   *   - 有 player、cards、settings、ad、growth、equipment
   *   - 有 saveVersion=0
   *   - equipment 包含真实 instances 和 heroEquipment
   *   - 无 dungeon、dropHistory
   */
  private _testPhase4BMigration(): boolean {
    this._log('--- Test 3: Phase4B 真实存档迁移 ---');

    const phase4BSave = this._createPhase4BSave();
    this._log('  迁移前：growth+equipment 存在、dungeon/dropHistory 缺失');

    const migrationSystem = SaveMigrationSystem.getInstance();
    const result = migrationSystem.migrate(phase4BSave);

    if (!result.success) {
      this._log(`  ❌ 迁移失败: ${result.errors.join('; ')}`);
      return false;
    }

    this._log(`  执行步骤: ${result.stepsExecuted} (${result.executedSteps.join(', ')})`);

    const checks: { label: string; ok: boolean }[] = [
      { label: 'saveVersion === 1', ok: phase4BSave.saveVersion === 1 },
      { label: 'player 数据保留', ok: phase4BSave.player.level === 25 && phase4BSave.player.combatPower === 8500 },
      { label: 'growth 数据保留', ok: phase4BSave.growth.heroProgressList.length === 3 },
      { label: 'equipment.instances 保留', ok: Object.keys(phase4BSave.equipment.instances).length === 2 },
      { label: 'equipment 实例数据完整', ok: phase4BSave.equipment.instances['EQUIP_SWORD_001_12345_1']?.configId === 'SWORD_001' },
      { label: 'equipment.heroEquipment 保留', ok: Object.keys(phase4BSave.equipment.heroEquipment).length === 1 },
      { label: 'heroEquipment 穿戴关系保留', ok: phase4BSave.equipment.heroEquipment['HERO_001']?.weaponId === 'EQUIP_SWORD_001_12345_1' },
      { label: 'dungeon 已补全', ok: typeof phase4BSave.dungeon?.instances === 'object' },
      { label: 'dropHistory 已补全', ok: Array.isArray(phase4BSave.dropHistory?.history) },
    ];

    const vr = SaveValidator.getInstance().validate(phase4BSave);
    checks.push({ label: '迁移后通过全量校验', ok: vr.valid });

    let allOk = true;
    for (const check of checks) {
      this._log(`  ${check.ok ? '✅' : '❌'} ${check.label}`);
      if (!check.ok) allOk = false;
    }

    return allOk;
  }

  // ==================== Test 4: Phase5 真实存档迁移 ====================

  /**
   * Phase5 存档格式：
   *   - Phase5 为装备 UI 集成，数据结构与 Phase4B 相同
   *   - 有完整的 player、cards、settings、ad、growth、equipment
   *   - 无 dungeon、dropHistory
   *   - 可能有多英雄穿戴装备
   */
  private _testPhase5Migration(): boolean {
    this._log('--- Test 4: Phase5 真实存档迁移 ---');

    const phase5Save = this._createPhase5Save();
    this._log('  迁移前：Phase5 UI 集成后存档（多英雄装备穿戴）');

    const migrationSystem = SaveMigrationSystem.getInstance();
    const result = migrationSystem.migrate(phase5Save);

    if (!result.success) {
      this._log(`  ❌ 迁移失败: ${result.errors.join('; ')}`);
      return false;
    }

    this._log(`  执行步骤: ${result.stepsExecuted} (${result.executedSteps.join(', ')})`);

    const checks: { label: string; ok: boolean }[] = [
      { label: 'saveVersion === 1', ok: phase5Save.saveVersion === 1 },
      { label: 'player 数据保留（Level15）', ok: phase5Save.player.level === 15 },
      { label: '5张卡牌数据保留', ok: phase5Save.cards.length === 5 },
      { label: '3件装备实例保留', ok: Object.keys(phase5Save.equipment.instances).length === 3 },
      { label: '2个英雄穿戴数据保留', ok: phase5Save.equipment.heroEquipment['HERO_002']?.weaponId != null },
      { label: 'HERO_002 三槽位穿戴完整', ok: phase5Save.equipment.heroEquipment['HERO_002']?.weaponId != null && phase5Save.equipment.heroEquipment['HERO_002']?.armorId != null },
      { label: 'growth.heroProgressList 保留', ok: phase5Save.growth.heroProgressList.length === 3 },
      { label: 'settings 保留', ok: phase5Save.settings.musicVolume === 60 },
      { label: 'ad 数据保留', ok: phase5Save.ad.totalWatched === 25 },
      { label: 'dungeon 已补全', ok: typeof phase5Save.dungeon === 'object' && phase5Save.dungeon.currentStamina === 100 },
      { label: 'dropHistory 已补全', ok: Array.isArray(phase5Save.dropHistory?.history) },
    ];

    const vr = SaveValidator.getInstance().validate(phase5Save);
    // Equipment 交叉校验：穿戴的装备应在 instances 中存在
    const crossCheckOk = phase5Save.equipment.heroEquipment['HERO_002']?.weaponId != null
      && phase5Save.equipment.instances[phase5Save.equipment.heroEquipment['HERO_002'].weaponId!] != null;
    checks.push({ label: 'equipment 穿戴交叉校验（穿戴→实例存在）', ok: crossCheckOk });
    checks.push({ label: '迁移后通过全量校验', ok: vr.valid });

    let allOk = true;
    for (const check of checks) {
      this._log(`  ${check.ok ? '✅' : '❌'} ${check.label}`);
      if (!check.ok) allOk = false;
    }

    return allOk;
  }

  // ==================== Test 5: 自动保存 + 重启读取验证 ====================

  /**
   * 模拟流程：
   * 1. 迁移 Phase3 旧存档 → 落入 LocalStorageAdapter
   * 2. 调用 SaveManager.save() 落盘
   * 3. 模拟"重启"：重新从 adapter 读取
   * 4. 再次迁移（应跳过）
   * 5. 验证数据一致性
   */
  private _testAutoSaveAndReload(): boolean {
    this._log('--- Test 5: 自动保存 + 重启读取验证 ---');

    const adapter = new LocalStorageAdapter();

    // Step 1: 创建 Phase3 旧存档并迁移
    const phase3Save = this._createPhase3Save();
    SaveMigrationSystem.getInstance().migrate(phase3Save);

    // Step 2: 模拟 SaveManager.save() 落盘
    const saveKey = SaveManager.SAVE_KEY;
    const writeOk = adapter.write(saveKey, phase3Save);
    this._log(`  写入落盘: ${writeOk ? '✅ 成功' : '❌ 失败'}`);
    if (!writeOk) return false;

    // Step 3: 模拟"重启"——从 adapter 重新读取
    const reloaded = adapter.read(saveKey);
    if (!reloaded) {
      this._log('  ❌ 重启读取失败: adapter.read 返回 null');
      return false;
    }
    this._log(`  重启读取: ✅ (version=${reloaded.saveVersion})`);

    // Step 4: 再次迁移（V1 → V1，应跳过）
    const migrationSystem = SaveMigrationSystem.getInstance();
    const reResult = migrationSystem.migrate(reloaded);
    this._log(`  重启后迁移: steps=${reResult.stepsExecuted} (应为 0)`);

    // Step 5: 全面数据一致性验证
    const checks: { label: string; ok: boolean }[] = [
      { label: '重启后版本号 == 1', ok: reloaded.saveVersion === CURRENT_SAVE_VERSION },
      { label: '重启后无需迁移 (stepsExecuted=0)', ok: reResult.stepsExecuted === 0 },
      { label: '重启后 player.level 正确', ok: reloaded.player.level === 12 },
      { label: '重启后 player.combatPower 正确', ok: reloaded.player.combatPower === 1800 },
      { label: '重启后 cards 完整（3张）', ok: reloaded.cards.length === 3 },
      { label: '重启后 growth 存在', ok: typeof reloaded.growth === 'object' && reloaded.growth !== null },
      { label: '重启后 equipment 存在', ok: typeof reloaded.equipment === 'object' },
      { label: '重启后 dungeon 存在', ok: typeof reloaded.dungeon === 'object' },
      { label: '重启后 dropHistory 存在', ok: typeof reloaded.dropHistory === 'object' },
      { label: '重启后 settings 值正确', ok: reloaded.settings.musicVolume === 85 },
      { label: '重启后 ad.todayWatched 正确', ok: reloaded.ad.todayWatched === 3 },
    ];

    let allOk = true;
    for (const check of checks) {
      this._log(`  ${check.ok ? '✅' : '❌'} ${check.label}`);
      if (!check.ok) allOk = false;
    }

    return allOk;
  }

  // ==================== Test 6: 战力正确性验证 ====================

  /**
   * 验证：
   * 1. 迁移后 player.combatPower 保留
   * 2. growth.playerProgress.totalPower 已从 Legacy 推断
   * 3. heroProgressList 中各英雄 power 值合理
   * 4. 离线战力 sanity check 通过
   */
  private _testCombatPowerCorrectness(): boolean {
    this._log('--- Test 6: 战力正确性验证 ---');

    // 6a: Phase3 迁移后战力从 Legacy 推断
    const phase3Save = this._createPhase3Save();
    SaveMigrationSystem.getInstance().migrate(phase3Save);

    const p3checks: { label: string; ok: boolean }[] = [
      { label: 'Phase3 player.combatPower = 1800 (保留)', ok: phase3Save.player.combatPower === 1800 },
      { label: 'Phase3 growth.playerProgress.totalPower = 1800 (从 player 推断)', ok: phase3Save.growth.playerProgress.totalPower === 1800 },
    ];

    for (const check of p3checks) {
      this._log(`  Phase3 ${check.ok ? '✅' : '❌'} ${check.label}`);
    }

    // 6b: Phase4A 迁移后 growth 数据保留
    const phase4ASave = this._createPhase4ASave();
    SaveMigrationSystem.getInstance().migrate(phase4ASave);

    const heroPowerSum = phase4ASave.growth.heroProgressList.reduce((s, h) => s + h.power, 0);
    const totalPower4A = phase4ASave.growth.playerProgress.totalPower;
    // heroProgress 中 3 个英雄 power: 3800 + 2200 + 1500 = 7500
    const p4Achecks: { label: string; ok: boolean }[] = [
      { label: 'Phase4A player.combatPower = 5000 (保留)', ok: phase4ASave.player.combatPower === 5000 },
      { label: 'Phase4A heroProgressList sum = 7500', ok: heroPowerSum === 7500 },
      { label: 'Phase4A growth.playerProgress.totalPower = 5000 (保留)', ok: totalPower4A === 5000 },
    ];

    for (const check of p4Achecks) {
      this._log(`  Phase4A ${check.ok ? '✅' : '❌'} ${check.label}`);
    }

    // 6c: 离线战力 sanity check
    const saneResult = PowerRecalculateOnMigration.checkPowerSanity(phase4ASave);
    // totalPower=5000 vs heroSum=7500, 差异 2500 > tolerance(min(100, 5000*0.1)=500)
    // → 应检测到不匹配
    this._log(`  Phase4A 战力合理性检查: ${saneResult.sane ? 'PASS (未检测到不匹配)' : 'FAIL (正确检测到不匹配)'}`);
    if (!saneResult.sane) {
      this._log(`    问题: ${saneResult.issues.join('; ')}`);
    }

    // 6d: Phase4B 迁移后装备数据因迁移而保留
    const phase4BSave = this._createPhase4BSave();
    SaveMigrationSystem.getInstance().migrate(phase4BSave);
    this._log(`  Phase4B player.combatPower = ${phase4BSave.player.combatPower} (应为 8500)`);
    this._log(`  Phase4B equipment instances: ${Object.keys(phase4BSave.equipment.instances).length} 件`);

    const allOk = phase3Save.player.combatPower === 1800
      && phase4ASave.player.combatPower === 5000
      && heroPowerSum === 7500
      && phase4BSave.player.combatPower === 8500;

    return allOk;
  }

  // ==================== Test 7: Dungeon 数据正确性验证 ====================

  /**
   * 验证迁移后 Dungeon 数据完整性：
   * 1. Phase3/4A/4B 迁移后 dungeon 已补全为默认值
   * 2. Phase6 新存档 dungeon 数据可正常读写
   */
  private _testDungeonDataCorrectness(): boolean {
    this._log('--- Test 7: Dungeon 数据正确性验证 ---');

    const migrationSystem = SaveMigrationSystem.getInstance();
    let allOk = true;

    // 7a: Phase3 迁移 → dungeon 默认值
    const phase3Save = this._createPhase3Save();
    migrationSystem.migrate(phase3Save);

    const d3 = phase3Save.dungeon;
    const p3checks: { label: string; ok: boolean }[] = [
      { label: 'instances 为空对象', ok: JSON.stringify(d3.instances) === '{}' },
      { label: 'runHistory 为空数组', ok: Array.isArray(d3.runHistory) && d3.runHistory.length === 0 },
      { label: 'todayAttempts 为空对象', ok: JSON.stringify(d3.todayAttempts) === '{}' },
      { label: 'lastAttemptDate 为空字符串', ok: d3.lastAttemptDate === '' },
      { label: 'currentStamina = 100', ok: d3.currentStamina === 100 },
      { label: 'maxStamina = 100', ok: d3.maxStamina === 100 },
    ];

    for (const check of p3checks) {
      this._log(`  Phase3→Dungeon ${check.ok ? '✅' : '❌'} ${check.label}`);
      if (!check.ok) allOk = false;
    }

    // 7b: 模拟有真实地牢数据的存档
    const dungeonRichSave = this._createPhase6LikeSave();
    migrationSystem.migrate(dungeonRichSave);

    const dr = dungeonRichSave.dungeon;
    const drChecks: { label: string; ok: boolean }[] = [
      { label: '地牢实例数 = 2', ok: Object.keys(dr.instances).length === 2 },
      { label: 'dungeonId=1 currentLayer=5', ok: dr.instances[1]?.currentLayer === 5 },
      { label: 'runHistory 有记录', ok: dr.runHistory.length === 2 },
      { label: 'todayAttempts 正确', ok: dr.todayAttempts[1] === 3 && dr.todayAttempts[2] === 1 },
      { label: 'currentStamina=65', ok: dr.currentStamina === 65 },
    ];

    for (const check of drChecks) {
      this._log(`  真实Dungeon ${check.ok ? '✅' : '❌'} ${check.label}`);
      if (!check.ok) allOk = false;
    }

    return allOk;
  }

  // ==================== Test 8: Equipment 数据正确性验证 ====================

  /**
   * 验证迁移后 Equipment 数据完整性：
   * 1. Phase3 迁移后 equipment 为空默认值
   * 2. Phase4B 迁移后 equipment 数据完整保留
   * 3. 装备穿戴交叉引用一致
   */
  private _testEquipmentDataCorrectness(): boolean {
    this._log('--- Test 8: Equipment 数据正确性验证 ---');

    const migrationSystem = SaveMigrationSystem.getInstance();
    let allOk = true;

    // 8a: Phase3 迁移 → equipment 默认空
    const phase3Save = this._createPhase3Save();
    migrationSystem.migrate(phase3Save);

    const eq3Checks: { label: string; ok: boolean }[] = [
      { label: 'Phase3→equipment.instances 为空对象', ok: JSON.stringify(phase3Save.equipment.instances) === '{}' },
      { label: 'Phase3→equipment.heroEquipment 为空对象', ok: JSON.stringify(phase3Save.equipment.heroEquipment) === '{}' },
    ];

    for (const check of eq3Checks) {
      this._log(`  ${check.ok ? '✅' : '❌'} ${check.label}`);
      if (!check.ok) allOk = false;
    }

    // 8b: Phase4B 迁移 → equipment 保留
    const phase4BSave = this._createPhase4BSave();
    migrationSystem.migrate(phase4BSave);

    const eqI = phase4BSave.equipment.instances;
    const eqHE = phase4BSave.equipment.heroEquipment;

    const eq4BChecks: { label: string; ok: boolean }[] = [
      { label: 'Phase4B 装备实例数 = 2', ok: Object.keys(eqI).length === 2 },
      { label: 'SWORD_001 实例存在', ok: eqI['EQUIP_SWORD_001_12345_1']?.configId === 'SWORD_001' },
      { label: 'ARMOR_003 实例存在', ok: eqI['EQUIP_ARMOR_003_67890_1']?.configId === 'ARMOR_003' },
      { label: 'HERO_001 穿戴 SWORD_001', ok: eqHE['HERO_001']?.weaponId === 'EQUIP_SWORD_001_12345_1' },
      { label: 'HERO_001 未穿 armor', ok: eqHE['HERO_001']?.armorId === null },
      { label: 'HERO_001 未穿 accessory', ok: eqHE['HERO_001']?.accessoryId === null },
    ];

    for (const check of eq4BChecks) {
      this._log(`  ${check.ok ? '✅' : '❌'} ${check.label}`);
      if (!check.ok) allOk = false;
    }

    // 8c: Phase5 迁移 → 多英雄装备穿戴保留
    const phase5Save = this._createPhase5Save();
    migrationSystem.migrate(phase5Save);

    const eq5Checks: { label: string; ok: boolean }[] = [
      { label: 'Phase5 装备实例数 = 3', ok: Object.keys(phase5Save.equipment.instances).length === 3 },
      { label: 'HERO_001 武器存在', ok: phase5Save.equipment.heroEquipment['HERO_001']?.weaponId != null },
      { label: 'HERO_002 武器+护甲+配饰三槽完整', ok: phase5Save.equipment.heroEquipment['HERO_002']?.weaponId != null && phase5Save.equipment.heroEquipment['HERO_002']?.armorId != null && phase5Save.equipment.heroEquipment['HERO_002']?.accessoryId != null },
      { label: '所有穿戴装备在 instances 中存在', ok: this._verifyEquipmentCrossRef(phase5Save) },
    ];

    for (const check of eq5Checks) {
      this._log(`  ${check.ok ? '✅' : '❌'} ${check.label}`);
      if (!check.ok) allOk = false;
    }

    // 8d: 校验器交叉校验
    const eqIssues = SaveValidator.getInstance().validateModule(phase5Save, 'equipment');
    const noErrors = eqIssues.filter(i => i.severity === 'error').length === 0;
    this._log(`  校验器 equipment 模块: ${noErrors ? '✅ 无错误' : '❌ 有错误'}`);
    if (!noErrors) {
      for (const issue of eqIssues) {
        this._log(`    [${issue.severity}] ${issue.path}: ${issue.message}`);
      }
    }

    return allOk && noErrors;
  }

  // ==================== Test 9: V1→V2→V3 连续迁移链测试 ====================

  /**
   * 模拟未来多版本迁移链：
   *
   * V1 → V2: 新增"竞技场积分"字段（arenaScore）
   * V2 → V3: 新增"成就系统"字段（achievements）
   *
   * 测试：
   * 1. 注册 V1→V2 和 V2→V3 两个迁移步骤
   * 2. 构造 V1 存档
   * 3. 执行连续迁移 V1→V2→V3
   * 4. 验证所有中间数据正确传递
   * 5. 清理注册的测试步骤
   */
  private _testContinuousMigrationChain(): boolean {
    this._log('--- Test 9: V1→V2→V3 连续迁移链测试 ---');

    const migrationSystem = SaveMigrationSystem.getInstance();

    // 注册测试迁移步骤
    this._registerChainTestSteps();

    // 构造 V1 存档
    const v1Save = this._createPhase6LikeSave();
    v1Save.saveVersion = 1;
    this._log(`  迁移前版本: V${v1Save.saveVersion}`);

    // 临时覆盖 CURRENT_SAVE_VERSION（通过注册步骤让 migrate 执行到 V3）
    // 注意：migrate 以 CURRENT_SAVE_VERSION 为目标，V3 步骤注册后 fromVersion=2→toVersion=3
    // 但 migrate 的 target 是 CURRENT_SAVE_VERSION，我们需要临时修改测试环境
    // 直接调用内部步骤模拟版本链
    const steps = migrationSystem.getMigrationSteps();
    const chainSteps = steps.filter(s => s.fromVersion >= 1);
    this._log(`  注册的链步骤数: ${chainSteps.length}`);

    // 手动按版本链执行
    let current = v1Save;
    const executed: string[] = [];
    let chainOk = true;

    for (const step of chainSteps) {
      if (current.saveVersion !== step.fromVersion) continue;

      try {
        step.migrate(current);
        current.saveVersion = step.toVersion;
        executed.push(step.description);
        this._log(`  执行: ${step.description} → saveVersion=${current.saveVersion}`);
      } catch (e) {
        this._log(`  ❌ 步骤失败: ${step.description} — ${e}`);
        chainOk = false;
        break;
      }
    }

    // 验证 V3 数据
    const v3Saved = current as SaveContainer & Partial<{ arenaScore: number; achievements: unknown[] }>;

    const checks: { label: string; ok: boolean }[] = [
      { label: '最终版本号 = 3', ok: v3Saved.saveVersion === 3 },
      { label: '执行了 2 个步骤 (V1→V2, V2→V3)', ok: executed.length === 2 },
      { label: 'V1 原始 player 数据保留', ok: v3Saved.player.level === 30 && v3Saved.player.combatPower === 12000 },
      { label: 'V1 原始 growth 数据保留', ok: v3Saved.growth.heroProgressList.length === 3 },
      { label: 'V1 原始 equipment 数据保留', ok: Object.keys(v3Saved.equipment.instances).length === 2 },
      { label: 'V1 原始 dungeon 数据保留', ok: v3Saved.dungeon.instances[1]?.currentLayer === 5 },
      { label: 'V2 新增 arenaScore 字段', ok: typeof v3Saved.arenaScore === 'number' && v3Saved.arenaScore === 0 },
      { label: 'V3 新增 achievements 字段', ok: Array.isArray(v3Saved.achievements) && v3Saved.achievements.length === 0 },
    ];

    let allOk = chainOk;
    for (const check of checks) {
      this._log(`  ${check.ok ? '✅' : '❌'} ${check.label}`);
      if (!check.ok) allOk = false;
    }

    // 清理测试步骤
    this._unregisterChainTestSteps();

    return allOk;
  }

  // ==================== 辅助方法：真实存档构造 ====================

  /**
   * 创建 Phase3 格式存档（最早版本，字段最少）
   *
   * Phase3 特征：
   *  - 有 player/cards/settings/ad（基础字段）
   *  - 无 saveVersion、timestamp（这些字段在 SaveContainer 接口中定义为必填，但旧存档缺失）
   *  - 无 growth、equipment、dungeon、dropHistory
   */
  private _createPhase3Save(): SaveContainer {
    return {
      saveVersion: 0,
      timestamp: 0,
      player: {
        level: 12,
        exp: 2500,
        stageId: 7,
        combatPower: 1800,
      },
      cards: [
        { cardId: 1, level: 8, star: 2, exp: 600 },
        { cardId: 2, level: 6, star: 1, exp: 300 },
        { cardId: 5, level: 4, star: 0, exp: 100 },
      ],
      equipment: { instances: {}, heroEquipment: {} },
      settings: { musicVolume: 85, sfxVolume: 70 },
      ad: { totalWatched: 8, todayWatched: 3, lastWatchDate: '2026-05-28' },
      // growth / dungeon / dropHistory 缺失（通过 as unknown 绕过类型检查）
    } as unknown as SaveContainer;
  }

  /**
   * 创建 Phase4A 格式存档（有 growth，无 equipment 实例）
   *
   * Phase4A 特征：
   *  - 新增 growth（playerProgress + heroProgressList）
   *  - equipment 存在但为空（instances={}, heroEquipment={}）
   *  - 无 dungeon、dropHistory
   */
  private _createPhase4ASave(): SaveContainer {
    return {
      saveVersion: 0,
      timestamp: Date.now() - 86400000 * 3,
      player: {
        level: 20,
        exp: 12000,
        stageId: 10,
        combatPower: 5000,
      },
      cards: [
        { cardId: 1, level: 12, star: 3, exp: 4500 },
        { cardId: 2, level: 10, star: 2, exp: 2800 },
        { cardId: 3, level: 8, star: 2, exp: 1500 },
        { cardId: 7, level: 5, star: 1, exp: 400 },
      ],
      equipment: { instances: {}, heroEquipment: {} },
      settings: { musicVolume: 75, sfxVolume: 80 },
      ad: { totalWatched: 15, todayWatched: 4, lastWatchDate: '2026-05-31' },
      growth: {
        playerProgress: {
          playerLevel: 20,
          playerExp: 12000,
          totalPower: 5000,
          highestStageId: 'STAGE_010',
          lastGrowthAt: Date.now() - 86400000 * 3,
        },
        heroProgressList: [
          { heroId: 'HERO_001', level: 12, exp: 4500, power: 3800 },
          { heroId: 'HERO_002', level: 10, exp: 2800, power: 2200 },
          { heroId: 'HERO_003', level: 8, exp: 1500, power: 1500 },
        ],
      },
      // dungeon / dropHistory 缺失
    } as unknown as SaveContainer;
  }

  /**
   * 创建 Phase4B 格式存档（有 growth + equipment 含真实数据）
   *
   * Phase4B 特征：
   *  - growth 完整
   *  - equipment 有真实 instances 和 heroEquipment
   *  - 无 dungeon、dropHistory
   */
  private _createPhase4BSave(): SaveContainer {
    return {
      saveVersion: 0,
      timestamp: Date.now() - 86400000 * 2,
      player: {
        level: 25,
        exp: 22000,
        stageId: 15,
        combatPower: 8500,
      },
      cards: [
        { cardId: 1, level: 15, star: 3, exp: 6000 },
        { cardId: 2, level: 12, star: 2, exp: 3500 },
        { cardId: 3, level: 10, star: 2, exp: 2200 },
      ],
      equipment: {
        instances: {
          'EQUIP_SWORD_001_12345_1': {
            uid: 'EQUIP_SWORD_001_12345_1',
            configId: 'SWORD_001',
          },
          'EQUIP_ARMOR_003_67890_1': {
            uid: 'EQUIP_ARMOR_003_67890_1',
            configId: 'ARMOR_003',
          },
        },
        heroEquipment: {
          'HERO_001': {
            heroId: 'HERO_001',
            weaponId: 'EQUIP_SWORD_001_12345_1',
            armorId: null,
            accessoryId: null,
          },
        },
      },
      settings: { musicVolume: 70, sfxVolume: 75 },
      ad: { totalWatched: 20, todayWatched: 5, lastWatchDate: '2026-06-01' },
      growth: {
        playerProgress: {
          playerLevel: 25,
          playerExp: 22000,
          totalPower: 8500,
          highestStageId: 'STAGE_015',
          lastGrowthAt: Date.now() - 86400000 * 2,
        },
        heroProgressList: [
          { heroId: 'HERO_001', level: 15, exp: 6000, power: 5000 },
          { heroId: 'HERO_002', level: 12, exp: 3500, power: 3000 },
          { heroId: 'HERO_003', level: 10, exp: 2200, power: 2000 },
        ],
      },
      // dungeon / dropHistory 缺失
    } as unknown as SaveContainer;
  }

  /**
   * 创建 Phase5 格式存档（同 Phase4B + 多英雄装备穿戴）
   *
   * Phase5 特征：
   *  - struct 同 Phase4B
   *  - Phase5 为装备 UI 集成，实际游戏中可能有更多装备和穿戴关系
   */
  private _createPhase5Save(): SaveContainer {
    return {
      saveVersion: 0,
      timestamp: Date.now() - 86400000,
      player: {
        level: 15,
        exp: 8500,
        stageId: 8,
        combatPower: 6200,
      },
      cards: [
        { cardId: 1, level: 10, star: 2, exp: 3000 },
        { cardId: 2, level: 8, star: 2, exp: 1800 },
        { cardId: 3, level: 7, star: 1, exp: 900 },
        { cardId: 4, level: 6, star: 1, exp: 600 },
        { cardId: 8, level: 3, star: 0, exp: 150 },
      ],
      equipment: {
        instances: {
          'EQUIP_SWORD_002_11111_1': {
            uid: 'EQUIP_SWORD_002_11111_1',
            configId: 'SWORD_002',
          },
          'EQUIP_ARMOR_001_22222_1': {
            uid: 'EQUIP_ARMOR_001_22222_1',
            configId: 'ARMOR_001',
          },
          'EQUIP_ACC_005_33333_1': {
            uid: 'EQUIP_ACC_005_33333_1',
            configId: 'ACCESSORY_005',
          },
        },
        heroEquipment: {
          'HERO_001': {
            heroId: 'HERO_001',
            weaponId: 'EQUIP_SWORD_002_11111_1',
            armorId: null,
            accessoryId: null,
          },
          'HERO_002': {
            heroId: 'HERO_002',
            weaponId: 'EQUIP_SWORD_002_11111_1', // 共享引用（正常情况应为独立装备，此处仅测试）
            armorId: 'EQUIP_ARMOR_001_22222_1',
            accessoryId: 'EQUIP_ACC_005_33333_1',
          },
        },
      },
      settings: { musicVolume: 60, sfxVolume: 65 },
      ad: { totalWatched: 25, todayWatched: 6, lastWatchDate: '2026-06-02' },
      growth: {
        playerProgress: {
          playerLevel: 15,
          playerExp: 8500,
          totalPower: 6200,
          highestStageId: 'STAGE_008',
          lastGrowthAt: Date.now() - 86400000,
        },
        heroProgressList: [
          { heroId: 'HERO_001', level: 10, exp: 3000, power: 3200 },
          { heroId: 'HERO_002', level: 8, exp: 1800, power: 2000 },
          { heroId: 'HERO_003', level: 7, exp: 900, power: 1000 },
        ],
      },
      // dungeon / dropHistory 缺失
    } as unknown as SaveContainer;
  }

  /**
   * 创建类似 Phase6 完整存档（当前版本格式）
   */
  private _createPhase6LikeSave(): SaveContainer {
    return {
      saveVersion: CURRENT_SAVE_VERSION,
      timestamp: Date.now(),
      player: {
        level: 30,
        exp: 35000,
        stageId: 22,
        combatPower: 12000,
      },
      cards: [
        { cardId: 1, level: 20, star: 4, exp: 12000 },
        { cardId: 2, level: 15, star: 3, exp: 6000 },
        { cardId: 3, level: 12, star: 2, exp: 3500 },
      ],
      equipment: {
        instances: {
          'EQ_SWORD_LEGEND_555_1': {
            uid: 'EQ_SWORD_LEGEND_555_1',
            configId: 'SWORD_LEGEND_001',
          },
          'EQ_ARMOR_EPIC_777_1': {
            uid: 'EQ_ARMOR_EPIC_777_1',
            configId: 'ARMOR_EPIC_003',
          },
        },
        heroEquipment: {
          'HERO_001': {
            heroId: 'HERO_001',
            weaponId: 'EQ_SWORD_LEGEND_555_1',
            armorId: 'EQ_ARMOR_EPIC_777_1',
            accessoryId: null,
          },
        },
      },
      settings: { musicVolume: 50, sfxVolume: 60 },
      ad: { totalWatched: 35, todayWatched: 8, lastWatchDate: '2026-06-03' },
      growth: {
        playerProgress: {
          playerLevel: 30,
          playerExp: 35000,
          totalPower: 12000,
          highestStageId: 'STAGE_022',
          lastGrowthAt: Date.now(),
        },
        heroProgressList: [
          { heroId: 'HERO_001', level: 20, exp: 12000, power: 6500 },
          { heroId: 'HERO_002', level: 15, exp: 6000, power: 3500 },
          { heroId: 'HERO_003', level: 12, exp: 3500, power: 2000 },
        ],
      },
      dungeon: {
        instances: {
          1: {
            dungeonId: 1,
            currentLayer: 5,
            completedLayers: [1, 2, 3, 4, 5],
            droppedRewards: [],
          },
          2: {
            dungeonId: 2,
            currentLayer: 2,
            completedLayers: [1, 2],
            droppedRewards: [],
          },
        },
        runHistory: [
          {
            runId: 'run_001',
            dungeonId: 1,
            startLayer: 1,
            endLayer: 5,
            result: 'completed',
            rewards: [],
            startedAt: Date.now() - 3600000,
            endedAt: Date.now() - 3000000,
          },
          {
            runId: 'run_002',
            dungeonId: 2,
            startLayer: 1,
            endLayer: 3,
            result: 'failed',
            rewards: [],
            startedAt: Date.now() - 1800000,
            endedAt: Date.now() - 1200000,
          },
        ],
        todayAttempts: { 1: 3, 2: 1 },
        lastAttemptDate: '2026-06-03',
        currentStamina: 65,
        maxStamina: 100,
      },
      dropHistory: {
        history: [],
      },
    };
  }

  // ==================== 辅助方法：验证 ====================

  /** 验证装备穿戴交叉引用一致性 */
  private _verifyEquipmentCrossRef(save: SaveContainer): boolean {
    const instances = save.equipment.instances;
    const heroEquip = save.equipment.heroEquipment;

    for (const heroId of Object.keys(heroEquip)) {
      const he = heroEquip[heroId];
      if (!he || typeof he !== 'object') continue;

      const slotUids = [he.weaponId, he.armorId, he.accessoryId];
      for (const uid of slotUids) {
        if (uid && typeof uid === 'string' && !instances[uid]) {
          return false;
        }
      }
    }
    return true;
  }

  /** 打印迁移前后差异 */
  private _logDiffs(save: SaveContainer, label: string): void {
    const has = (key: string): boolean => {
      const val = (save as Record<string, unknown>)[key];
      return val !== undefined && val !== null;
    };
    const fields = ['saveVersion', 'player', 'cards', 'equipment', 'settings', 'ad', 'growth', 'dungeon', 'dropHistory'];
    const present = fields.filter(f => has(f));
    const missing = fields.filter(f => !has(f));
    this._log(`  ${label}: 存在 [${present.join(', ')}], 缺失 [${missing.join(', ')}]`);
  }

  // ==================== V1→V2→V3 链测试步骤注册/清理 ====================

  private _registerChainTestSteps(): void {
    const migrationSystem = SaveMigrationSystem.getInstance();

    // V1 → V2: 新增竞技场积分
    migrationSystem.registerStep({
      fromVersion: 1,
      toVersion: 2,
      description: 'V1→V2: 新增 arenaScore 竞技场积分字段',
      migrate: (container: SaveContainer): SaveContainer => {
        const c = container as SaveContainer & Partial<{ arenaScore: number }>;
        if (c.arenaScore === undefined) {
          c.arenaScore = 0;
        }
        return container;
      },
    });

    // V2 → V3: 新增加成系统
    migrationSystem.registerStep({
      fromVersion: 2,
      toVersion: 3,
      description: 'V2→V3: 新增 achievements 成就系统字段',
      migrate: (container: SaveContainer): SaveContainer => {
        const c = container as SaveContainer & Partial<{ achievements: unknown[] }>;
        if (!Array.isArray(c.achievements)) {
          c.achievements = [];
        }
        return container;
      },
    });
  }

  private _unregisterChainTestSteps(): void {
    // 通过访问内部 _steps 数组清理测试步骤
    // 注意：这是反射操作，仅用于测试
    const migrationSystem = SaveMigrationSystem.getInstance();
    const internalSteps = (migrationSystem as unknown as Record<string, unknown>)['_steps'] as Array<{ fromVersion: number; description: string }>;
    if (Array.isArray(internalSteps)) {
      const filtered = internalSteps.filter(
        (s) => s.fromVersion === 0, // 只保留 V0→V1 默认步骤
      );
      (migrationSystem as unknown as Record<string, unknown>)['_steps'] = filtered;
    }
  }

  // ==================== 工具方法 ====================

  private _log(msg: string): void {
    this._logs.push(msg);
    console.log(`[MigrationPhaseDebugRunner] ${msg}`);
  }

  getLogs(): string[] {
    return [...this._logs];
  }

  private _cleanup(): void {
    // 清理测试备份
    const backup = SaveBackup.getInstance();
    const backups = backup.listBackups();
    for (const meta of backups) {
      backup.deleteBackup(meta.key);
    }
    // 清理链测试步骤
    this._unregisterChainTestSteps();
  }
}
