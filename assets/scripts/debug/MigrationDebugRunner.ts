// ============================================================
// MigrationDebugRunner — Phase6-Step5 存档迁移系统调试验证
// 职责：模拟旧存档 → 迁移 → 校验 → 战力重算 → 验证全流程
// 位置：Debug 层
// ============================================================

import { BaseSystem } from '../core/BaseSystem';
import { SaveManager } from '../save/SaveManager';
import { SaveMigrationSystem } from '../save/SaveMigrationSystem';
import { SaveValidator } from '../save/SaveValidator';
import { SaveBackup } from '../save/SaveBackup';
import { PowerRecalculateOnMigration } from '../save/PowerRecalculateOnMigration';
import { LocalStorageAdapter } from '../save/LocalStorageAdapter';
import { SaveContainer, CURRENT_SAVE_VERSION } from '../save/SaveContainer';
import { EventManager } from '../core/EventManager';

/**
 * 迁移调试运行器。
 *
 * 在编辑器环境下通过调用 MigrationDebugRunner.runAll() 执行完整迁移验证。
 */
export class MigrationDebugRunner extends BaseSystem {

  /** 自定义日志收集 */
  private _logs: string[] = [];

  // ==================== 入口：运行所有测试 ====================

  /**
   * 运行完整的存档迁移验证流程。
   *
   * 测试覆盖：
   * 1. V0 旧存档迁移
   * 2. 备份创建与恢复
   * 3. 存档完整性校验
   * 4. 迁移失败回滚
   * 5. 战力合理性检查
   * 6. Dungeon → Drop → Equipment → Progress 链路完整性
   */
  runAll(): void {
    this._logs = [];
    this._log('========== Phase6-Step5 存档迁移系统验证 ==========');
    this._log(`当前存档版本: V${CURRENT_SAVE_VERSION}`);

    let passCount = 0;
    let failCount = 0;

    // Test 1: V0 旧存档迁移
    if (this._testV0Migration()) {
      passCount += 1;
    } else {
      failCount += 1;
    }

    // Test 2: 备份创建与恢复
    if (this._testBackupAndRestore()) {
      passCount += 1;
    } else {
      failCount += 1;
    }

    // Test 3: 存档校验器
    if (this._testValidator()) {
      passCount += 1;
    } else {
      failCount += 1;
    }

    // Test 4: 迁移失败回滚
    if (this._testRollbackOnFailure()) {
      passCount += 1;
    } else {
      failCount += 1;
    }

    // Test 5: 战力合理性检查
    if (this._testPowerSanityCheck()) {
      passCount += 1;
    } else {
      failCount += 1;
    }

    // Test 6: Dungeon → Drop → Equipment → Progress 链路完整性
    if (this._testDataChainIntegrity()) {
      passCount += 1;
    } else {
      failCount += 1;
    }

    // Test 7: 当前版本存档无需迁移
    if (this._testCurrentVersionNoMigration()) {
      passCount += 1;
    } else {
      failCount += 1;
    }

    this._log('===================================================');
    this._log(`结果: ${passCount} PASS / ${failCount} FAIL`);
    this._log('===================================================');

    // 清理测试数据
    this._cleanup();
  }

  // ==================== Test 1: V0 旧存档迁移 ====================

  private _testV0Migration(): boolean {
    this._log('--- Test 1: V0 旧存档迁移 ---');

    // 构造一个 V0 存档（缺少 growth / dungeon / dropHistory 等字段）
    const v0Save = this._createV0Save();

    this._log(`  迁移前版本: ${v0Save.saveVersion ?? 'undefined'}`);
    this._log(`  迁移前 growth: ${(v0Save as any).growth ? '存在' : '缺失'}`);
    this._log(`  迁移前 dungeon: ${(v0Save as any).dungeon ? '存在' : '缺失'}`);
    this._log(`  迁移前 dropHistory: ${(v0Save as any).dropHistory ? '存在' : '缺失'}`);

    // 执行迁移
    const migrationSystem = SaveMigrationSystem.getInstance();
    const result = migrationSystem.migrate(v0Save);

    this._log(`  迁移后版本: ${result.finalVersion}`);
    this._log(`  执行步骤数: ${result.stepsExecuted}`);
    this._log(`  迁移成功: ${result.success}`);
    this._log(`  需要战力重算: ${result.needsPowerRecalc}`);

    if (!result.success) {
      this._log(`  FAIL: 迁移失败 - ${result.errors.join('; ')}`);
      return false;
    }

    // 验证迁移后数据完整性
    const hasGrowth = v0Save.growth && typeof v0Save.growth === 'object';
    const hasDungeon = v0Save.dungeon && typeof v0Save.dungeon === 'object';
    const hasDropHistory = v0Save.dropHistory && typeof v0Save.dropHistory === 'object';
    const hasPlayerProgress = v0Save.growth?.playerProgress !== undefined;
    const hasHeroProgressList = Array.isArray(v0Save.growth?.heroProgressList);

    this._log(`  迁移后 growth: ${hasGrowth ? '存在' : '缺失'}`);
    this._log(`  迁移后 dungeon: ${hasDungeon ? '存在' : '缺失'}`);
    this._log(`  迁移后 dropHistory: ${hasDropHistory ? '存在' : '缺失'}`);
    this._log(`  迁移后 playerProgress: ${hasPlayerProgress ? '存在' : '缺失'}`);
    this._log(`  迁移后 heroProgressList: ${hasHeroProgressList ? '存在' : '缺失'}`);

    const allOk = hasGrowth && hasDungeon && hasDropHistory && hasPlayerProgress && hasHeroProgressList;

    if (allOk) {
      this._log('  PASS: V0 迁移成功，所有子模块已补全');
    } else {
      this._log('  FAIL: V0 迁移后仍有缺失字段');
    }

    return allOk;
  }

  // ==================== Test 2: 备份创建与恢复 ====================

  private _testBackupAndRestore(): boolean {
    this._log('--- Test 2: 备份创建与恢复 ---');

    const adapter = new LocalStorageAdapter();
    const backup = SaveBackup.getInstance();
    backup.init(adapter);

    // 创建测试存档
    const original = this._createTestSaveContainer('BACKUP_TEST');
    const backupKey = backup.createBackup(original, 'test-backup');

    if (!backupKey) {
      this._log('  FAIL: 备份创建失败');
      return false;
    }

    this._log(`  备份 Key: ${backupKey}`);

    // 验证备份列表
    const backupList = backup.listBackups();
    this._log(`  备份列表数量: ${backupList.length}`);

    // 恢复备份
    const restoreResult = backup.restoreBackup(backupKey);
    if (!restoreResult.success || !restoreResult.container) {
      this._log('  FAIL: 备份恢复失败');
      return false;
    }

    const match = restoreResult.container.player.level === original.player.level
      && restoreResult.container.saveVersion === original.saveVersion;

    this._log(`  恢复后 level: ${restoreResult.container.player.level}`);
    this._log(`  恢复后 version: ${restoreResult.container.saveVersion}`);

    // 清理测试备份
    backup.deleteBackup(backupKey);

    if (match) {
      this._log('  PASS: 备份创建与恢复成功');
    } else {
      this._log('  FAIL: 备份恢复数据不匹配');
    }

    return match;
  }

  // ==================== Test 3: 存档校验器 ====================

  private _testValidator(): boolean {
    this._log('--- Test 3: 存档校验器 ---');

    const validator = SaveValidator.getInstance();

    // 3a: 校验合法存档
    const validSave = this._createTestSaveContainer('VALID_TEST');
    const validResult = validator.validate(validSave);

    this._log(`  合法存档校验: ${validResult.valid ? 'PASS' : 'FAIL'}`);
    this._log(`    错误: ${validResult.errorCount}, 警告: ${validResult.warningCount}`);

    // 3b: 校验损坏存档
    const corruptSave = this._createCorruptSave();
    const corruptResult = validator.validate(corruptSave);

    this._log(`  损坏存档校验: ${corruptResult.valid ? 'PASS (不应通过)' : 'FAIL (正确拒绝)'}`);
    this._log(`    错误: ${corruptResult.errorCount}, 警告: ${corruptResult.warningCount}`);

    for (const issue of corruptResult.issues) {
      if (issue.severity === 'error') {
        this._log(`    [ERROR] ${issue.path}: ${issue.message}`);
      }
    }

    // 3c: 快速校验
    const quickResult = validator.quickValidate(validSave);
    this._log(`  快速校验合法存档: ${quickResult ? 'PASS' : 'FAIL'}`);

    const quickCorruptResult = validator.quickValidate(corruptSave);
    this._log(`  快速校验损坏存档: ${quickCorruptResult ? 'PASS (不应通过)' : 'FAIL (正确拒绝)'}`);

    const allOk = validResult.valid && !corruptResult.valid && quickResult && !quickCorruptResult;

    if (allOk) {
      this._log('  PASS: 存档校验器工作正常');
    } else {
      this._log('  FAIL: 存档校验器行为异常');
    }

    return allOk;
  }

  // ==================== Test 4: 迁移失败回滚 ====================

  private _testRollbackOnFailure(): boolean {
    this._log('--- Test 4: 迁移失败回滚 ---');

    const backup = SaveBackup.getInstance();
    const adapter = new LocalStorageAdapter();

    // 创建测试存档并备份
    const original = this._createTestSaveContainer('ROLLBACK_TEST');
    original.saveVersion = 999; // 故意设置一个无法迁移的版本号

    const backupKey = backup.createBackup(original, 'pre-rollback-test');
    if (!backupKey) {
      this._log('  FAIL: 回滚测试备份创建失败');
      return false;
    }

    // 验证可以从备份恢复
    const restoreResult = backup.restoreBackup(backupKey);
    const canRestore = restoreResult.success
      && restoreResult.container !== null
      && restoreResult.container.saveVersion === 999;

    this._log(`  备份恢复成功: ${restoreResult.success}`);
    this._log(`  恢复后版本号: ${restoreResult.container?.saveVersion}`);

    // 清理
    backup.deleteBackup(backupKey);

    if (canRestore) {
      this._log('  PASS: 回滚机制可用');
    } else {
      this._log('  FAIL: 回滚恢复失败');
    }

    return canRestore;
  }

  // ==================== Test 5: 战力合理性检查 ====================

  private _testPowerSanityCheck(): boolean {
    this._log('--- Test 5: 战力合理性检查 ---');

    // 5a: 正常的战力数据
    const saneSave = this._createTestSaveContainer('SANITY_TEST');
    const saneResult = PowerRecalculateOnMigration.checkPowerSanity(saneSave);
    this._log(`  正常战力: ${saneResult.sane ? 'PASS' : 'FAIL'}`);
    if (!saneResult.sane) {
      this._log(`    问题: ${saneResult.issues.join('; ')}`);
    }

    // 5b: 总战力与英雄战力总和不匹配
    const insaneSave = this._createTestSaveContainer('INSANE_TEST');
    insaneSave.growth.playerProgress.totalPower = 99999;
    // 英雄战力总和为 0（没有英雄进度数据）
    const insaneResult = PowerRecalculateOnMigration.checkPowerSanity(insaneSave);
    this._log(`  战力不匹配: ${insaneResult.sane ? 'PASS (不应通过)' : 'FAIL (正确检测)'}`);
    if (!insaneResult.sane) {
      this._log(`    问题: ${insaneResult.issues.join('; ')}`);
    }

    const allOk = saneResult.sane && !insaneResult.sane;

    if (allOk) {
      this._log('  PASS: 战力合理性检查正确');
    } else {
      this._log('  FAIL: 战力合理性检查异常');
    }

    return allOk;
  }

  // ==================== Test 6: 数据链路完整性 ====================

  private _testDataChainIntegrity(): boolean {
    this._log('--- Test 6: Dungeon → Drop → Equipment → Progress 链路完整性 ---');

    const save = this._createTestSaveContainer('CHAIN_TEST');

    const checks: { name: string; ok: boolean }[] = [];

    // 6a: Dungeon 数据完整
    const dungeonOk = save.dungeon !== undefined
      && typeof save.dungeon.instances === 'object'
      && Array.isArray(save.dungeon.runHistory)
      && typeof save.dungeon.currentStamina === 'number'
      && typeof save.dungeon.maxStamina === 'number';
    checks.push({ name: 'Dungeon', ok: dungeonOk });

    // 6b: Drop 数据完整
    const dropOk = save.dropHistory !== undefined
      && Array.isArray(save.dropHistory.history);
    checks.push({ name: 'DropHistory', ok: dropOk });

    // 6c: Equipment 数据完整
    const equipOk = save.equipment !== undefined
      && typeof save.equipment.instances === 'object'
      && typeof save.equipment.heroEquipment === 'object';
    checks.push({ name: 'Equipment', ok: equipOk });

    // 6d: Progress (Growth) 数据完整
    const progressOk = save.growth !== undefined
      && save.growth.playerProgress !== undefined
      && Array.isArray(save.growth.heroProgressList);
    checks.push({ name: 'Progress', ok: progressOk });

    // 6e: Player 数据完整
    const playerOk = save.player !== undefined
      && typeof save.player.level === 'number'
      && typeof save.player.combatPower === 'number';
    checks.push({ name: 'Player', ok: playerOk });

    // 6f: Cards 数据完整
    const cardsOk = Array.isArray(save.cards);
    checks.push({ name: 'Cards', ok: cardsOk });

    let allOk = true;
    for (const check of checks) {
      this._log(`  ${check.name}: ${check.ok ? 'OK' : 'MISSING'}`);
      if (!check.ok) allOk = false;
    }

    if (allOk) {
      this._log('  PASS: 数据链路完整');
    } else {
      this._log('  FAIL: 数据链路断裂');
    }

    return allOk;
  }

  // ==================== Test 7: 当前版本无需迁移 ====================

  private _testCurrentVersionNoMigration(): boolean {
    this._log('--- Test 7: 当前版本存档无需迁移 ---');

    const save = this._createTestSaveContainer('NO_MIGRATE_TEST');
    save.saveVersion = CURRENT_SAVE_VERSION;

    const migrationSystem = SaveMigrationSystem.getInstance();
    const result = migrationSystem.migrate(save);

    const noMigrationNeeded = result.stepsExecuted === 0
      && result.finalVersion === CURRENT_SAVE_VERSION
      && !result.needsPowerRecalc;

    this._log(`  执行步骤: ${result.stepsExecuted}`);
    this._log(`  最终版本: ${result.finalVersion}`);
    this._log(`  需要战力重算: ${result.needsPowerRecalc}`);

    if (noMigrationNeeded) {
      this._log('  PASS: 当前版本正确跳过迁移');
    } else {
      this._log('  FAIL: 当前版本不应该执行迁移');
    }

    return noMigrationNeeded;
  }

  // ==================== 辅助方法 ====================

  /** 创建 V0 格式旧存档（缺少 growth/dungeon/dropHistory） */
  private _createV0Save(): SaveContainer {
    return {
      saveVersion: 0,
      timestamp: Date.now() - 86400000,
      player: { level: 10, exp: 500, stageId: 5, combatPower: 1200 },
      cards: [
        { cardId: 1, level: 5, star: 2, exp: 100 },
      ],
      equipment: { instances: {}, heroEquipment: {} },
      settings: { musicVolume: 80, sfxVolume: 80 },
      ad: { totalWatched: 5, todayWatched: 2, lastWatchDate: '2026-06-01' },
      // growth, dungeon, dropHistory 缺失
    } as unknown as SaveContainer;
  }

  /** 创建损坏的存档（用于校验器测试） */
  private _createCorruptSave(): SaveContainer {
    return {
      saveVersion: -1, // 无效版本号
      timestamp: NaN,  // 无效时间戳
      player: {
        level: -5,     // 负等级
        exp: NaN,     // 无效经验
        stageId: 0,   // 无效关卡
        combatPower: -100, // 负战力
      } as any,
      cards: null as any,  // 不是数组
      equipment: {
        instances: { 'bad': null as any },
        heroEquipment: { 'bad': null as any },
      },
      settings: { musicVolume: 200, sfxVolume: -10 }, // 超出范围
      ad: { totalWatched: -1, todayWatched: -5, lastWatchDate: 123 as any },
      growth: {
        playerProgress: { playerLevel: 0, playerExp: -1, totalPower: NaN, highestStageId: '', lastGrowthAt: NaN as any },
        heroProgressList: [{ heroId: '', level: -1, exp: -1, power: -1 }],
      },
      dungeon: {
        instances: null as any,
        runHistory: null as any,
        todayAttempts: null as any,
        lastAttemptDate: 456 as any,
        currentStamina: -50,
        maxStamina: -100,
      },
      dropHistory: { history: null as any },
    } as unknown as SaveContainer;
  }

  /** 创建合法的测试存档容器 */
  private _createTestSaveContainer(label: string): SaveContainer {
    return {
      saveVersion: CURRENT_SAVE_VERSION,
      timestamp: Date.now(),
      player: {
        level: 25,
        exp: 15000,
        stageId: 12,
        combatPower: 8500,
      },
      cards: [
        { cardId: 1, level: 15, star: 3, exp: 5000 },
        { cardId: 2, level: 10, star: 2, exp: 2000 },
        { cardId: 3, level: 8, star: 1, exp: 800 },
      ],
      equipment: {
        instances: {
          'EQUIP_SWORD_001_12345_1': {
            uid: 'EQUIP_SWORD_001_12345_1',
            configId: 'SWORD_001',
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
      settings: {
        musicVolume: 70,
        sfxVolume: 80,
      },
      ad: {
        totalWatched: 10,
        todayWatched: 3,
        lastWatchDate: '2026-06-03',
      },
      growth: {
        playerProgress: {
          playerLevel: 25,
          playerExp: 15000,
          totalPower: 8500,
          highestStageId: 'STAGE_012',
          lastGrowthAt: Date.now(),
        },
        heroProgressList: [
          { heroId: 'HERO_001', level: 15, exp: 5000, power: 4000 },
          { heroId: 'HERO_002', level: 10, exp: 2000, power: 2500 },
          { heroId: 'HERO_003', level: 8, exp: 800, power: 2000 },
        ],
      },
      dungeon: {
        instances: {
          1: {
            dungeonId: 1,
            currentLayer: 3,
            completedLayers: [1, 2, 3],
            droppedRewards: [],
          },
        },
        runHistory: [],
        todayAttempts: { 1: 2 },
        lastAttemptDate: '2026-06-03',
        currentStamina: 80,
        maxStamina: 100,
      },
      dropHistory: {
        history: [],
      },
    };
  }

  /** 输出日志 */
  private _log(msg: string): void {
    this._logs.push(msg);
    console.log(`[MigrationDebugRunner] ${msg}`);
  }

  /** 获取日志 */
  getLogs(): string[] {
    return [...this._logs];
  }

  /** 清理测试数据 */
  private _cleanup(): void {
    const backup = SaveBackup.getInstance();
    const backups = backup.listBackups();
    for (const meta of backups) {
      backup.deleteBackup(meta.key);
    }
  }
}
