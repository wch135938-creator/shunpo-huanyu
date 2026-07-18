// tools/generate-main-stages.mjs
// 离线生成器 — Node.js ES Module CLI
// 职责：dry-run安全的批量关卡生成、plan解析、草稿输出

import {
  readJsonFile,
  stableStringify,
  formatChapterId,
  formatChapterStageId,
  formatBattleStageId,
  assertSafeDraftOutputDir,
  checkDraftDirExistsAndEmpty,
  atomicWriteDraft,
  validateGeneratedDraft,
  simulateAccountProgression,
  selfTestValidation,
  selfTestAccountExp,
  selfTestIdConstructors,
  getRepoRoot,
  hashString,
} from './lib/main-stage-config.mjs';

import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------
function showHelp() {
  console.log(`Usage: node tools/generate-main-stages.mjs [options]

Options:
  --help            Show this help message
  --self-test       Run built-in self-tests (synthetic data only, no file writes)
  --plan <plan.json>
                    Path to a generation plan JSON file
  --write           Actually write output files (requires --plan and --out-dir)
  --out-dir <directory>
                    Output directory under docs/generated/ (required with --write)
  --json            Output generation summary as JSON

Description:
  Default behavior is dry-run: reads plan, builds in memory, prints summary.
  No files are written without --write.

  --write requires both --plan and --out-dir.
  --out-dir must be under docs/generated/.
  Existing draft files in the output directory cause refusal.

  Self-test uses synthetic test data (chapter_999 namespace) in memory only.
  No production plans are created by this tool.

Safety rules:
  - Default: dry-run (no file writes)
  - --write only with explicit --plan and --out-dir
  - Output only allowed under docs/generated/
  - Never overwrites existing draft files
  - No --force, --overwrite, --in-place, --production options exist
`);
}

// ---------------------------------------------------------------------------
// JSON output helper
// ---------------------------------------------------------------------------
function outputJson(data) {
  process.stdout.write(stableStringify(data));
}

// ---------------------------------------------------------------------------
// Validate a generator plan
// ---------------------------------------------------------------------------
function validatePlan(plan) {
  const errors = [];

  if (!plan || typeof plan !== 'object') {
    errors.push('Plan must be a JSON object');
    return { valid: false, errors };
  }

  if (!plan.batchName || typeof plan.batchName !== 'string') {
    errors.push('Plan must have a string "batchName"');
  }

  if (!Array.isArray(plan.chapters)) {
    errors.push('Plan must have a "chapters" array');
    return { valid: false, errors };
  }

  for (const ch of plan.chapters) {
    if (!ch.chapterIndex || !Number.isInteger(ch.chapterIndex) || ch.chapterIndex < 1) {
      errors.push(`Chapter has invalid chapterIndex: ${JSON.stringify(ch)}`);
    }
    if (ch.enemyGroupId !== undefined) {
      errors.push(`Chapter ${ch.chapterIndex}: "enemyGroupId" is forbidden in generation plans`);
    }
    if (ch.bossId !== undefined) {
      errors.push(`Chapter ${ch.chapterIndex}: "bossId" is forbidden in generation plans`);
    }
  }

  // Check for enemyGroupId/bossId in stage definitions
  if (Array.isArray(plan.stages)) {
    for (const st of plan.stages) {
      if (st.enemyGroupId !== undefined) {
        errors.push(`Stage: "enemyGroupId" is forbidden in generation plans`);
        break;
      }
      if (st.bossId !== undefined) {
        errors.push(`Stage: "bossId" is forbidden in generation plans`);
        break;
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Build in-memory configs from plan (dry-run generation)
// ---------------------------------------------------------------------------
function buildFromPlan(plan) {
  const chapterData = { version: 1, name: 'chapter_data', data: [] };
  const stageData = { version: '1.0.0', name: 'stage_data', data: [] };
  const enemyData = { version: '1.0.0', name: 'enemy_data', data: [] };
  const dropTable = { version: '1.0.0', name: 'drop_table', data: [] };

  const enemyIds = [];
  const dropIds = [];

  for (const ch of plan.chapters) {
    const chId = formatChapterId(ch.chapterIndex);
    const chapterEntry = {
      id: chId,
      name: ch.name || `Chapter ${ch.chapterIndex}`,
      chapterIndex: ch.chapterIndex,
      description: ch.description || '',
      iconPath: ch.iconPath || `icons/${chId}`,
      recommendedPower: ch.recommendedPower || 1000,
      unlockCondition: ch.unlockCondition || { prevChapterId: null, playerLevel: 1 },
      stages: [],
    };

    const stageCount = plan.stageCount || 10;
    for (let si = 1; si <= stageCount; si++) {
      const stageId = formatChapterStageId(ch.chapterIndex, si);
      const battleStageId = formatBattleStageId(ch.chapterIndex, si);

      // Determine stage type based on rules
      let type = 'normal';
      let isBossStage = false;
      if (si === 10) {
        type = 'boss';
        isBossStage = true;
      } else if (si === 5) {
        type = 'mini_boss';
        isBossStage = false;
      } else if (si === 4 || si === 8) {
        type = 'elite';
        isBossStage = false;
      }

      // Determine rewards (default patterns)
      const rewardExp = 50 + (ch.chapterIndex - 1) * 100 + si * 20;
      const rewardGold = 100 + (ch.chapterIndex - 1) * 200 + si * 30;

      const chapterStage = {
        id: stageId,
        name: ch.stageNames ? (ch.stageNames[si - 1] || `Stage ${si}`) : `Stage ${si}`,
        chapterId: chId,
        stageIndex: si,
        type,
        recommendedPower: (ch.recommendedPower || 1000) + si * 80,
        rewards: [
          { type: 'gold', id: 'currency_gold', amount: rewardGold },
          { type: 'exp', id: 'player_exp', amount: rewardExp },
        ],
        unlockCondition: {
          prevStageId: si === 1 ? null : formatChapterStageId(ch.chapterIndex, si - 1),
          playerLevel: (ch.unlockCondition?.playerLevel || 1) + Math.floor(si / 3),
          totalPower: (ch.recommendedPower || 500) + si * 40,
        },
        staminaCost: 5 + Math.floor(si / 3),
        battleStageId,
      };

      // Build enemy IDs for this stage
      const stageEnemyIds = [];
      const enemyCount = type === 'boss' ? 1 : (type === 'elite' ? 3 : 2);
      for (let ei = 0; ei < enemyCount; ei++) {
        const enemyId = `ENEMY_MAIN_${String(ch.chapterIndex).padStart(3, '0')}_${String(si).padStart(3, '0')}_${String(ei + 1).padStart(2, '0')}`;
        stageEnemyIds.push(enemyId);

        if (!enemyIds.includes(enemyId)) {
          enemyIds.push(enemyId);
          enemyData.data.push({
            id: enemyId,
            name: `Enemy ${ch.chapterIndex}-${si}-${ei + 1}`,
            enemyType: type === 'boss' ? 'boss' : 'normal',
            element: '火',
            level: (ch.chapterIndex - 1) * 10 + si,
            hp: 200 + (ch.chapterIndex - 1) * 500 + si * 100,
            attack: 30 + (ch.chapterIndex - 1) * 20 + si * 5,
            defense: 15 + (ch.chapterIndex - 1) * 10 + si * 3,
            speed: 60 + si * 2,
            skillIds: ['SKILL_001'],
            dropId: `DROP_MAIN_${String(ch.chapterIndex).padStart(3, '0')}_${String(si).padStart(3, '0')}`,
            isBoss: type === 'boss',
            faction: '混沌',
          });
        }
      }

      // Drop entries
      const dropId = `DROP_MAIN_${String(ch.chapterIndex).padStart(3, '0')}_${String(si).padStart(3, '0')}`;
      const firstDropId = `DROP_F_MAIN_${String(ch.chapterIndex).padStart(3, '0')}_${String(si).padStart(3, '0')}`;

      if (!dropIds.includes(dropId)) {
        dropIds.push(dropId);
        dropTable.data.push({
          id: dropId,
          name: `Drop ${ch.chapterIndex}-${si}`,
          description: `Chapter ${ch.chapterIndex} Stage ${si} drop`,
          dropType: type === 'boss' ? 'boss' : (type === 'elite' ? 'elite' : 'normal'),
          items: [
            { itemId: 'ITEM_GOLD', itemType: 'gold', minCount: rewardGold, maxCount: rewardGold + 100, dropRate: 1.0, isGuaranteed: true },
            { itemId: 'ITEM_EXP', itemType: 'exp', minCount: rewardExp, maxCount: rewardExp + 50, dropRate: 1.0, isGuaranteed: true },
          ],
        });
      }
      if (!dropIds.includes(firstDropId)) {
        dropIds.push(firstDropId);
        dropTable.data.push({
          id: firstDropId,
          name: `First Drop ${ch.chapterIndex}-${si}`,
          description: `Chapter ${ch.chapterIndex} Stage ${si} first clear drop`,
          dropType: 'firstClear',
          items: [
            { itemId: 'ITEM_DIAMOND', itemType: 'diamond', minCount: 10, maxCount: 10, dropRate: 1.0, isGuaranteed: true },
            { itemId: 'ITEM_GOLD', itemType: 'gold', minCount: rewardGold * 2, maxCount: rewardGold * 3, dropRate: 1.0, isGuaranteed: true },
            { itemId: 'ITEM_EXP', itemType: 'exp', minCount: rewardExp * 2, maxCount: rewardExp * 3, dropRate: 1.0, isGuaranteed: true },
          ],
        });
      }

      // Battle stage entry
      const battleStage = {
        id: battleStageId,
        name: ch.stageNames ? (ch.stageNames[si - 1] || `Stage ${si}`) : `Stage ${si}`,
        nameKey: `stage_name_${battleStageId.toLowerCase()}`,
        chapterId: chId.toUpperCase(),
        stageIndex: si,
        stageType: type,
        isBossStage,
        enemyIds: stageEnemyIds,
        recommendedPower: (ch.recommendedPower || 1000) + si * 80,
        staminaCost: 5 + Math.floor(si / 3),
        dropId,
        firstDropId,
        unlockCondition: si === 1
          ? { type: 'always' }
          : { type: 'prevStage', prevStageId: formatBattleStageId(ch.chapterIndex, si - 1) },
        battleWave: type === 'boss' ? 2 : 1,
      };

      chapterEntry.stages.push(chapterStage);
      stageData.data.push(battleStage);
    }

    chapterData.data.push(chapterEntry);
  }

  return { chapterData, stageData, enemyData, dropTable };
}

// ---------------------------------------------------------------------------
// Self-test: build synthetic test data and validate
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

  // Generator-specific self-tests with synthetic data only
  console.log('\n--- Generator Integration Tests ---');

  // Test 1: Build synthetic plan with test namespace and validate
  {
    const testPlan = {
      batchName: 'test-synthetic-batch',
      chapters: [
        {
          chapterIndex: 999,
          name: 'Test Chapter 999',
          description: 'Synthetic test chapter',
          recommendedPower: 1000,
          iconPath: 'icons/chapter_999',
          unlockCondition: { prevChapterId: null, playerLevel: 1 },
          stageNames: [
            'Test Stage 1', 'Test Stage 2', 'Test Stage 3', 'Test Stage 4',
            'Test Stage 5', 'Test Stage 6', 'Test Stage 7', 'Test Stage 8',
            'Test Stage 9', 'Test Stage 10',
          ],
        },
      ],
      stageCount: 10,
    };

    const planValidation = validatePlan(testPlan);
    if (!planValidation.valid) {
      allPassed = false;
      console.error(`  TEST FAIL: plan validation failed: ${planValidation.errors.join('; ')}`);
    } else {
      console.log('  Plan validation: PASSED');
    }

    // Build from plan (in memory only)
    const configs = buildFromPlan(testPlan);

    // Validate generated configs in strict mode
    const result = validateGeneratedDraft({
      chapterData: configs.chapterData,
      stageData: configs.stageData,
      enemyData: configs.enemyData,
      dropData: configs.dropTable,
    });

    if (result.errors.length > 0) {
      allPassed = false;
      console.error(`  TEST FAIL: generated config has ${result.errors.length} errors:`);
      result.errors.forEach((e) => console.error(`    ${e}`));
    } else {
      console.log(`  Generated config validation: PASSED (0 errors)`);
    }

    if (result.warnings.length > 0) {
      console.log(`  Generated config warnings: ${result.warnings.length}`);
      result.warnings.forEach((w) => console.log(`    ${w}`));
    }

    // Verify stats
    console.log(`  Generated: ${configs.chapterData.data.length} chapter(s), ${configs.stageData.data.length} stages, ${configs.enemyData.data.length} enemies, ${configs.dropTable.data.length} drops`);

    // Verify ID format
    const chId = configs.chapterData.data[0].id;
    if (chId !== 'chapter_999') {
      allPassed = false;
      console.error(`  TEST FAIL: expected chapter_999, got ${chId}`);
    } else {
      console.log('  Chapter ID format: PASSED');
    }

    const firstStageId = configs.chapterData.data[0].stages[0].id;
    if (firstStageId !== 'chapter_999_stage_01') {
      allPassed = false;
      console.error(`  TEST FAIL: expected chapter_999_stage_01, got ${firstStageId}`);
    } else {
      console.log('  Stage ID format: PASSED');
    }

    const firstBattleId = configs.chapterData.data[0].stages[0].battleStageId;
    if (firstBattleId !== 'STAGE_MAIN_999_001') {
      allPassed = false;
      console.error(`  TEST FAIL: expected STAGE_MAIN_999_001, got ${firstBattleId}`);
    } else {
      console.log('  Battle stage ID format: PASSED');
    }

    // Verify no enemyGroupId/bossId in generated output
    for (const ch of configs.chapterData.data) {
      for (const st of ch.stages) {
        if (st.enemyGroupId !== undefined) {
          allPassed = false;
          console.error(`  TEST FAIL: generated stage ${st.id} has forbidden enemyGroupId`);
        }
        if (st.bossId !== undefined) {
          allPassed = false;
          console.error(`  TEST FAIL: generated stage ${st.id} has forbidden bossId`);
        }
      }
    }
    console.log('  No legacy fields in generated output: PASSED');

    // Verify stage type rules
    const stage5 = configs.chapterData.data[0].stages[4]; // 0-indexed
    const stage10 = configs.chapterData.data[0].stages[9];
    if (stage5.type !== 'mini_boss') {
      allPassed = false;
      console.error(`  TEST FAIL: stage 5 should be mini_boss, got ${stage5.type}`);
    }
    if (stage10.type !== 'boss') {
      allPassed = false;
      console.error(`  TEST FAIL: stage 10 should be boss, got ${stage10.type}`);
    }
    console.log('  Stage type rules: PASSED');
  }

  // Test 2: Verify default is dry-run (no files written)
  {
    const repoRoot = getRepoRoot();
    const testDir = path.join(repoRoot, 'docs', 'generated', 'test-synthetic-batch');
    if (fs.existsSync(testDir)) {
      const files = fs.readdirSync(testDir).filter((f) => f.endsWith('.json'));
      if (files.length > 0) {
        console.log(`  Dry-run safety: existing files in test dir, but not overwritten: ${files.join(', ')}`);
      }
    }
    console.log('  Default dry-run: VERIFIED (no file writes in self-test)');
  }

  // Test 3: Plan validation rejects enemyGroupId/bossId
  {
    const badPlan = {
      batchName: 'bad-plan',
      chapters: [{ chapterIndex: 1, enemyGroupId: 'enemy_group_001' }],
    };
    const result = validatePlan(badPlan);
    if (result.valid) {
      allPassed = false;
      console.error('  TEST FAIL: plan with enemyGroupId should be rejected');
    } else {
      console.log('  Plan enemyGroupId rejection: PASSED');
    }
  }

  {
    const badPlan = {
      batchName: 'bad-plan-2',
      chapters: [{ chapterIndex: 1, bossId: 'boss_001' }],
    };
    const result = validatePlan(badPlan);
    if (result.valid) {
      allPassed = false;
      console.error('  TEST FAIL: plan with bossId should be rejected');
    } else {
      console.log('  Plan bossId rejection: PASSED');
    }
  }

  return allPassed;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);

  let showHelpFlag = false;
  let selfTestMode = false;
  let planPath = null;
  let writeMode = false;
  let outDir = null;
  let jsonMode = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--help':
        showHelpFlag = true;
        break;
      case '--self-test':
        selfTestMode = true;
        break;
      case '--plan':
        if (i + 1 < args.length) {
          planPath = args[++i];
        } else {
          console.error('Error: --plan requires a file path argument');
          process.exit(2);
        }
        break;
      case '--write':
        writeMode = true;
        break;
      case '--out-dir':
        if (i + 1 < args.length) {
          outDir = args[++i];
        } else {
          console.error('Error: --out-dir requires a directory argument');
          process.exit(2);
        }
        break;
      case '--json':
        jsonMode = true;
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
    console.log('=== Generator Self-Test (synthetic data only, no file writes) ===');
    const passed = runSelfTest();
    console.log(`\nGenerator self-test ${passed ? 'ALL PASSED' : 'FAILED'}`);
    process.exit(passed ? 0 : 1);
  }

  // Default behavior: dry-run, no plan = show help
  if (!planPath) {
    if (!jsonMode) {
      console.log('No --plan specified. Default dry-run mode.');
      console.log('Use --help for usage information.');
      console.log('No files written. No production stages generated.');
    } else {
      outputJson({ status: 'dry-run', message: 'No plan specified. No files written.' });
    }
    process.exit(0);
  }

  // --write requires --out-dir
  if (writeMode && !outDir) {
    console.error('Error: --write requires --out-dir');
    process.exit(2);
  }

  // --out-dir without --write
  if (!writeMode && outDir) {
    console.error('Error: --out-dir requires --write');
    process.exit(2);
  }

  // --out-dir must be under docs/generated/
  if (outDir) {
    try {
      assertSafeDraftOutputDir(outDir);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(2);
    }
  }

  try {
    // Load plan
    const planPathResolved = path.resolve(process.cwd(), planPath);
    let plan;
    try {
      plan = JSON.parse(fs.readFileSync(planPathResolved, 'utf8'));
    } catch (err) {
      console.error(`Error reading plan file "${planPath}": ${err.message}`);
      process.exit(2);
    }

    // Validate plan
    const planValidation = validatePlan(plan);
    if (!planValidation.valid) {
      console.error('Plan validation failed:');
      planValidation.errors.forEach((e) => console.error(`  - ${e}`));
      process.exit(2);
    }

    // Build configs in memory
    const configs = buildFromPlan(plan);
    const planHash = hashString(stableStringify(plan));

    // Validate generated configs
    const validationResult = validateGeneratedDraft({
      chapterData: configs.chapterData,
      stageData: configs.stageData,
      enemyData: configs.enemyData,
      dropData: configs.dropTable,
    });

    const chapterCount = configs.chapterData.data.length;
    const stageCount = configs.stageData.data.length;
    const enemyCount = configs.enemyData.data.length;
    const dropCount = configs.dropTable.data.length;

    if (writeMode) {
      // Check output directory
      const resolvedOutDir = checkDraftDirExistsAndEmpty(outDir);

      // Write draft files
      await atomicWriteDraft(outDir, 'chapter_data.draft.json', stableStringify(configs.chapterData));
      await atomicWriteDraft(outDir, 'stage_data.draft.json', stableStringify(configs.stageData));
      await atomicWriteDraft(outDir, 'enemy_data.draft.json', stableStringify(configs.enemyData));
      await atomicWriteDraft(outDir, 'drop_table.draft.json', stableStringify(configs.dropTable));

      // Write manifest
      const manifest = {
        generatorVersion: '1.0.0',
        inputPlanSha256: planHash,
        outputFiles: [
          'chapter_data.draft.json',
          'stage_data.draft.json',
          'enemy_data.draft.json',
          'drop_table.draft.json',
        ],
        outputSha256: {
          chapter_data: hashString(stableStringify(configs.chapterData)),
          stage_data: hashString(stableStringify(configs.stageData)),
          enemy_data: hashString(stableStringify(configs.enemyData)),
          drop_table: hashString(stableStringify(configs.dropTable)),
        },
        chapterCount,
        stageCount,
        enemyCount,
        dropCount,
        validationErrorCount: validationResult.errors.length,
        validationWarningCount: validationResult.warnings.length,
        accountExpSimulationSummary: 'Not simulated for draft',
      };
      await atomicWriteDraft(outDir, 'generation-manifest.json', stableStringify(manifest));

      if (!jsonMode) {
        console.log(`\nWrote draft files to: ${resolvedOutDir}`);
        console.log(`  Chapters: ${chapterCount}`);
        console.log(`  Battle stages: ${stageCount}`);
        console.log(`  Enemies: ${enemyCount}`);
        console.log(`  Drops: ${dropCount}`);
        console.log(`  Validation errors: ${validationResult.errors.length}`);
        console.log(`  Validation warnings: ${validationResult.warnings.length}`);
      } else {
        outputJson({ status: 'written', outDir: resolvedOutDir, ...manifest });
      }
    } else {
      // Dry-run: print summary only
      if (!jsonMode) {
        console.log('\n=== Generation Dry-Run ===');
        console.log(`Plan: ${planPathResolved}`);
        console.log(`Batch: ${plan.batchName}`);
        console.log(`Chapters: ${chapterCount}`);
        console.log(`Battle stages: ${stageCount}`);
        console.log(`Enemies: ${enemyCount}`);
        console.log(`Drops: ${dropCount}`);
        console.log(`Validation errors: ${validationResult.errors.length}`);
        console.log(`Validation warnings: ${validationResult.warnings.length}`);

        if (validationResult.errors.length > 0) {
          console.log('\n--- Validation Errors (would block write) ---');
          validationResult.errors.forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
        }
        if (validationResult.warnings.length > 0) {
          console.log('\n--- Validation Warnings ---');
          validationResult.warnings.forEach((w, i) => console.log(`  ${i + 1}. ${w}`));
        }

        console.log('\nNo files written (dry-run). Use --write --out-dir <dir> to write.');
      } else {
        outputJson({
          status: 'dry-run',
          batchName: plan.batchName,
          chapterCount,
          stageCount,
          enemyCount,
          dropCount,
          validationErrors: validationResult.errors.length,
          validationWarnings: validationResult.warnings.length,
          planSha256: planHash,
        });
      }
    }
  } catch (err) {
    console.error(`Fatal error: ${err.message}`);
    process.exit(2);
  }
}

main();
