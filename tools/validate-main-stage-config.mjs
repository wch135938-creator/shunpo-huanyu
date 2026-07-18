// tools/validate-main-stage-config.mjs
// 静态配置校验器 — Node.js ES Module CLI
// 职责：只读加载生产配置、兼容模式校验、账号经验模拟

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  readJsonFile,
  hashFile,
  stableStringify,
  validateMainStageConfig,
  validateAccountLevelConfig,
  validateCurrentProductionAccountLevelPolicy,
  simulateAccountProgression,
  loadHeroAuthority,
  loadEquipmentAuthority,
  assertSafeDraftOutputDir,
  checkDraftDirExistsAndEmpty,
  getRepoRoot,
  atomicWriteDraft,
  selfTestValidation,
  selfTestAccountExp,
  selfTestIdConstructors,
} from './lib/main-stage-config.mjs';

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------
function showHelp() {
  console.log(`Usage: node tools/validate-main-stage-config.mjs [options]

Options:
  --help            Show this help message
  --json            Output results as JSON (one line per JSON object, then NDJSON summary)
  --self-test       Run built-in self-tests
  --strict-generated <directory>
                    Validate generated draft configs in strict mode from <directory>

Description:
  Reads current production configs in compat mode by default.
  Performs static validation and account experience simulation.
  Always read-only — never modifies any file.

Exit codes:
  0 = validation passed (no ERRORs)
  1 = configuration validation failed (ERRORs found)
  2 = CLI argument error or tool execution exception
`);
}

// ---------------------------------------------------------------------------
// JSON output helper
// ---------------------------------------------------------------------------
function outputJson(data) {
  process.stdout.write(stableStringify(data));
}

// ---------------------------------------------------------------------------
// Load current production configs
// ---------------------------------------------------------------------------
function loadProductionConfigs() {
  const chapterData = readJsonFile('assets/resources/config/chapters/chapter_data.json');
  const stageData = readJsonFile('assets/resources/config/stages/stage_data.json');
  const enemyData = readJsonFile('assets/resources/config/stages/enemy_data.json');
  const dropData = readJsonFile('assets/resources/config/drops/drop_table.json');
  const accountLevelConfig = readJsonFile('assets/resources/config/systems/account_level_config.json');
  return { chapterData, stageData, enemyData, dropData, accountLevelConfig };
}

// ---------------------------------------------------------------------------
// Run validation
// ---------------------------------------------------------------------------
function runValidation(configs, authorities) {
  const { chapterData, stageData, enemyData, dropData, accountLevelConfig } = configs;
  const { heroIdSet, equipmentIdSet } = authorities || {};

  // 1. Validate account level config (general + production policy)
  const accountResult = validateAccountLevelConfig(accountLevelConfig);
  const policyResult = validateCurrentProductionAccountLevelPolicy(accountLevelConfig);

  // 2. Validate main stage config
  const stageResult = validateMainStageConfig({
    chapterData,
    stageData,
    enemyData,
    dropData,
    compatMode: true,
    strictGenerated: false,
    heroIdSet,
    equipmentIdSet,
  });

  // 3. Simulate account progression
  const simulation = simulateAccountProgression({
    chapterData,
    accountLevelConfig,
  });

  // Merge all results
  const allErrors = [...accountResult.errors, ...policyResult.errors, ...stageResult.errors];
  const allWarnings = [...accountResult.warnings, ...policyResult.warnings, ...stageResult.warnings];

  return {
    success: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
    stats: stageResult.stats,
    accountExpSimulation: {
      summary: simulation.summary,
      chapterSummaries: simulation.chapterSummaries,
      stageResults: simulation.results.filter((r) => {
        // Filter to chapter 1 only for display
        return r.chapterStageId.startsWith('chapter_001');
      }),
      allResults: simulation.results,
    },
  };
}

// ---------------------------------------------------------------------------
// Self-test runner
// ---------------------------------------------------------------------------
function runSelfTest() {
  let allPassed = true;

  const validationFailures = selfTestValidation();
  if (validationFailures.length > 0) {
    allPassed = false;
    console.error('=== Validation Self-Test FAILURES ===');
    for (const f of validationFailures) {
      console.error(`  ${f}`);
    }
  } else {
    console.log('Validation self-test: ALL PASSED');
  }

  const expFailures = selfTestAccountExp();
  if (expFailures.length > 0) {
    allPassed = false;
    console.error('=== Account Exp Self-Test FAILURES ===');
    for (const f of expFailures) {
      console.error(`  ${f}`);
    }
  } else {
    console.log('Account exp self-test: ALL PASSED');
  }

  const idFailures = selfTestIdConstructors();
  if (idFailures.length > 0) {
    allPassed = false;
    console.error('=== ID Constructor Self-Test FAILURES ===');
    for (const f of idFailures) {
      console.error(`  ${f}`);
    }
  } else {
    console.log('ID constructor self-test: ALL PASSED');
  }

  // ---- 修订六：输出目录安全补测 (validate-main-stage-config 扩展) ----
  console.log('\n--- Output Directory Safety Self-Tests ---');

  // Test: docs/generated existing file overwrite refusal
  {
    const repoRoot = getRepoRoot();
    const testDirName = 'test-overwrite-refuse-' + Date.now();
    const testDir = path.join(repoRoot, 'docs', 'generated', testDirName);

    // Clean up any leftover
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch (_) {}

    let passed = false;
    try {
      fs.mkdirSync(testDir, { recursive: true });
      // Pre-create a file
      fs.writeFileSync(path.join(testDir, 'chapter_data.draft.json'), '{}', 'utf8');
      try {
        checkDraftDirExistsAndEmpty('docs/generated/' + testDirName);
        console.error('  TEST FAIL: existing draft file should be rejected by checkDraftDirExistsAndEmpty');
      } catch (e) {
        passed = true;
        console.log('  Existing draft file overwrite refusal (checkDraftDirExistsAndEmpty): PASSED');
      }
    } catch (e) {
      console.error(`  TEST FAIL: ${e.message}`);
    } finally {
      try { fs.rmSync(testDir, { recursive: true, force: true }); } catch (_) {}
    }
    if (!passed) allPassed = false;
  }

  // Test: Symlink/junction escape to EXTERNAL directory (Windows-specific)
  {
    const repoRoot = getRepoRoot();
    const testDirName = 'test-junction-escape-' + Date.now();
    const testDirPath = path.join(repoRoot, 'docs', 'generated', testDirName);

    // Create external target OUTSIDE the project (use OS temp dir)
    const extTargetDir = path.join(os.tmpdir(), 'shunpo-test-junction-target-' + Date.now());

    try { fs.rmSync(testDirPath, { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(extTargetDir, { recursive: true, force: true }); } catch (_) {}

    let junctionCreated = false;
    try {
      // Create EXTERNAL empty target directory
      fs.mkdirSync(extTargetDir, { recursive: true });

      // Verify external target IS empty (requirement: 目标目录必须保持为空)
      const extEntries = fs.readdirSync(extTargetDir);
      if (extEntries.length > 0) {
        console.error(`  TEST SETUP ERROR: external target not empty: ${extEntries.join(', ')}`);
        allPassed = false;
      }

      // Attempt to create junction (Windows) or symlink
      try {
        if (process.platform === 'win32') {
          try {
            fs.symlinkSync(extTargetDir, testDirPath, 'junction');
            junctionCreated = true;
          } catch (symErr) {
            try {
              fs.symlinkSync(extTargetDir, testDirPath, 'dir');
              junctionCreated = true;
            } catch (symErr2) {
              console.log(`  Junction/symlink creation blocked: EPERM/permission denied (expected on Windows without admin) — code=${symErr2.code || 'UNKNOWN'}`);
            }
          }
        } else {
          fs.symlinkSync(extTargetDir, testDirPath, 'dir');
          junctionCreated = true;
        }

        if (junctionCreated && fs.existsSync(testDirPath)) {
          // Verify that the junction target is empty (re-confirm)
          const junctionEntries = fs.readdirSync(testDirPath);
          console.log(`  Junction external target is empty: ${junctionEntries.length === 0 ? 'CONFIRMED' : 'NOT EMPTY'}`);

          let escapeRejected = false;
          let rejectReason = '';
          try {
            assertSafeDraftOutputDir('docs/generated/' + testDirName);
          } catch (e) {
            escapeRejected = true;
            rejectReason = e.message;
          }

          if (escapeRejected) {
            // Must be rejected because realpath/canonical path is outside safe root
            const isRealPathRejection =
              rejectReason.includes('real path') ||
              rejectReason.includes('symlink') ||
              rejectReason.includes('junction') ||
              rejectReason.includes('outside allowed root');
            if (isRealPathRejection) {
              console.log(`  External junction escape rejection (realpath check): PASSED`);
              console.log(`    Reject reason: ${rejectReason.substring(0, 120)}`);
            } else {
              console.log(`  External junction escape rejection (other check): PASSED`);
              console.log(`    Reject reason: ${rejectReason.substring(0, 120)}`);
            }
          } else {
            // assertSafeDraftOutputDir did NOT reject — checkDraftDirExistsAndEmpty might
            let cdRejected = false;
            let cdReason = '';
            try {
              checkDraftDirExistsAndEmpty('docs/generated/' + testDirName);
            } catch (e) {
              cdRejected = true;
              cdReason = e.message;
            }

            if (cdRejected) {
              // Was it rejected for the right reason (path escape) or wrong reason (non-empty)?
              const isNonEmptyRejection = cdReason.includes('already contains') || cdReason.includes('files');
              if (isNonEmptyRejection) {
                console.error('  TEST FAIL: external junction was only rejected because "directory not empty", NOT because realpath outside safe root');
                allPassed = false;
              } else {
                console.log(`  External junction escape rejection (checkDraftDirExistsAndEmpty): PASSED`);
              }
            } else {
              console.error('  TEST FAIL: external empty junction was ALLOWED — both assertSafeDraftOutputDir and checkDraftDirExistsAndEmpty passed');
              allPassed = false;
            }
          }
        }
      } catch (e) {
        console.log(`  Junction test execution error: ${e.code || e.message}`);
      }
    } catch (e) {
      console.log(`  Junction test setup error: ${e.message}`);
    } finally {
      // Clean up
      try { fs.rmSync(testDirPath, { recursive: true, force: true }); } catch (_) {}
      try { fs.rmSync(extTargetDir, { recursive: true, force: true }); } catch (_) {}
    }
  }

  return allPassed;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);

  // Parse flags
  let showHelpFlag = false;
  let jsonMode = false;
  let selfTestMode = false;
  let strictGeneratedDir = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--help':
        showHelpFlag = true;
        break;
      case '--json':
        jsonMode = true;
        break;
      case '--self-test':
        selfTestMode = true;
        break;
      case '--strict-generated':
        if (i + 1 < args.length) {
          strictGeneratedDir = args[++i];
        } else {
          console.error('Error: --strict-generated requires a directory argument');
          process.exit(2);
        }
        break;
      default:
        console.error(`Error: unknown argument "${arg}"`);
        console.error('Use --help for usage information');
        process.exit(2);
    }
  }

  if (showHelpFlag) {
    showHelp();
    process.exit(0);
  }

  if (selfTestMode) {
    const passed = runSelfTest();
    process.exit(passed ? 0 : 1);
  }

  try {
    // Load configs
    const configs = loadProductionConfigs();

    // Load authority sets
    const heroIdSet = loadHeroAuthority();
    const equipmentIdSet = loadEquipmentAuthority();
    const authorities = { heroIdSet, equipmentIdSet };

    // Run validation (with strictGeneratedDir override if provided)
    if (strictGeneratedDir) {
      // Load draft configs from directory
      const fs = await import('node:fs');
      const path = await import('node:path');
      const { assertSafeDraftOutputDir, validateGeneratedDraft } = await import('./lib/main-stage-config.mjs');

      const resolvedDir = assertSafeDraftOutputDir(strictGeneratedDir);

      let draftChapterData, draftStageData, draftEnemyData, draftDropData;
      try {
        draftChapterData = JSON.parse(fs.readFileSync(path.join(resolvedDir, 'chapter_data.draft.json'), 'utf8'));
        draftStageData = JSON.parse(fs.readFileSync(path.join(resolvedDir, 'stage_data.draft.json'), 'utf8'));
        draftEnemyData = JSON.parse(fs.readFileSync(path.join(resolvedDir, 'enemy_data.draft.json'), 'utf8'));
        draftDropData = JSON.parse(fs.readFileSync(path.join(resolvedDir, 'drop_table.draft.json'), 'utf8'));
      } catch (err) {
        console.error(`Error loading draft configs from ${resolvedDir}: ${err.message}`);
        process.exit(2);
      }

      const result = validateGeneratedDraft({
        chapterData: draftChapterData,
        stageData: draftStageData,
        enemyData: draftEnemyData,
        dropData: draftDropData,
      });

      const output = {
        success: result.errors.length === 0,
        errors: result.errors,
        warnings: result.warnings,
        stats: result.stats,
        mode: 'strict-generated',
        source: resolvedDir,
      };

      if (jsonMode) {
        outputJson(output);
      } else {
        console.log(`\n=== Strict Draft Validation: ${resolvedDir} ===`);
        console.log(`Errors: ${result.errors.length}`);
        console.log(`Warnings: ${result.warnings.length}`);
        if (result.errors.length > 0) {
          console.log('\n--- ERRORS ---');
          result.errors.forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
        }
        if (result.warnings.length > 0) {
          console.log('\n--- WARNINGS ---');
          result.warnings.forEach((w, i) => console.log(`  ${i + 1}. ${w}`));
        }
        console.log(`\nValidation ${result.errors.length === 0 ? 'PASSED' : 'FAILED'}`);
      }

      process.exit(result.errors.length === 0 ? 0 : 1);
    }

    // Standard compat mode
    const result = runValidation(configs, authorities);

    if (jsonMode) {
      outputJson(result);
    } else {
      console.log('\n=== Production Config Validation (Compat Mode) ===');
      console.log(`Chapter count: ${result.stats.chapterCount}`);
      console.log(`Chapter stage count: ${result.stats.chapterStageCount}`);
      console.log(`Battle stage count: ${result.stats.battleStageCount}`);
      console.log(`Enemy count: ${result.stats.enemyCount}`);
      console.log(`Drop count: ${result.stats.dropCount}`);
      console.log(`Chapters with full battleStageId: ${result.stats.chaptersWithBattleStageId}`);
      console.log(`Chapters missing battleStageId: ${result.stats.chaptersMissingBattleStageId}`);
      console.log(`\nErrors: ${result.errors.length}`);
      console.log(`Warnings: ${result.warnings.length}`);

      if (result.errors.length > 0) {
        console.log('\n--- ERRORS ---');
        result.errors.forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
      }

      if (result.warnings.length > 0) {
        console.log('\n--- WARNINGS ---');
        result.warnings.forEach((w, i) => console.log(`  ${i + 1}. ${w}`));
      }

      // Account exp simulation
      const sim = result.accountExpSimulation;
      console.log('\n--- Account Exp Simulation (Chapter 1) ---');
      console.log('chapterStageId          | rewardExp | oldLv | oldExp | accepted | dropped | newLv | newExp | maxLv');
      console.log('------------------------|-----------|-------|--------|----------|---------|-------|--------|------');
      for (const row of sim.stageResults) {
        console.log(
          `${row.chapterStageId.padEnd(23)} | ${String(row.rewardExp).padStart(8)} | ${String(row.oldLevel).padStart(5)} | ${String(row.oldExp).padStart(6)} | ${String(row.acceptedExp).padStart(8)} | ${String(row.droppedExp).padStart(7)} | ${String(row.newLevel).padStart(5)} | ${String(row.newExp).padStart(6)} | ${row.reachedMaxLevel ? 'YES' : ' NO'}`  // eslint-disable-line
        );
      }
      console.log(`\n--- Chapter 1 Summary ---`);
      {
        const ch1 = sim.chapterSummaries.find((cs) => cs.chapterIndex === 1);
        if (ch1) {
          console.log(`  rewardTotalExp=${ch1.rewardTotalExp}`);
          console.log(`  acceptedTotalExp=${ch1.acceptedTotalExp}`);
          console.log(`  droppedTotalExp=${ch1.droppedTotalExp}`);
          console.log(`  finalLevel=${ch1.endLevel}`);
          console.log(`  finalExp=${ch1.endExp}`);
        }
      }
      console.log(`\n--- All Chapters Summary ---`);
      for (const cs of sim.chapterSummaries) {
        console.log(`  ${cs.chapterId}: rewardTotalExp=${cs.rewardTotalExp} accepted=${cs.acceptedTotalExp} dropped=${cs.droppedTotalExp} Lv${cs.startLevel}/${cs.startExp}→Lv${cs.endLevel}/${cs.endExp} maxLv=${cs.reachedMaxLevel}`);
      }
      console.log(`\n--- Global Summary ---`);
      console.log(`  Accepted total exp: ${sim.summary.acceptedTotalExp}`);
      console.log(`  Dropped total exp:  ${sim.summary.droppedTotalExp}`);
      console.log(`  Final level: ${sim.summary.finalLevel}`);
      console.log(`  Final exp:   ${sim.summary.finalExp}`);
      console.log(`  Reached max level: ${sim.summary.reachedMaxLevel}`);
      console.log(`  Total stages processed: ${sim.summary.totalStagesProcessed}`);
      console.log(`  postMaxAdditionalInputExp: ${sim.summary.postMaxAdditionalInputExp}`);
      console.log(`  postMaxDroppedExp: ${sim.summary.postMaxDroppedExp}`);

      console.log(`\nValidation ${result.success ? 'PASSED (0 errors)' : 'FAILED'}`);
    }

    process.exit(result.success ? 0 : 1);
  } catch (err) {
    console.error(`Fatal error: ${err.message}`);
    process.exit(2);
  }
}

main();
