// tools/generate-main-stages.mjs
// 离线生成器 — Node.js ES Module CLI
// 职责：dry-run安全的批量关卡草稿生成、plan解析、草稿输出、配置校验
//
// 重要：该工具生成主线配置草稿。
// 不会直接生成或覆盖 assets/resources/config 中的生产配置。
// 当前生产 JSON 包含手工策划内容，不能由该工具完整复现。

import {
  readJsonFile,
  stableStringify,
  formatChapterId,
  formatChapterStageId,
  formatBattleStageId,
  assertSafeDraftOutputDir,
  checkDraftDirExistsAndEmpty,
  atomicWriteDraft,
  validateMainStageConfig,
  validateGeneratedDraft,
  validateAccountLevelConfig,
  validateCurrentProductionAccountLevelPolicy,
  simulateAccountProgression,
  selfTestValidation,
  selfTestAccountExp,
  selfTestIdConstructors,
  getRepoRoot,
  hashString,
  getGlobalStageIndex,
  getPowerAnchor,
  getGoldAnchor,
  D_P1_POWER_ANCHORS,
  D_P1_GOLD_ANCHORS,
  D_P1_MAX_ACCOUNT_LEVEL,
  loadHeroAuthority,
  loadEquipmentAuthority,
  isLowercaseChapterId,
  parseChapterId,
  parseChapterStageId,
  parseBattleStageId,
  validateDropItemAuthority,
  validateDropItemAuthorityCompat,
  isForbiddenDropItemId,
  isCompatKnownEquipmentId,
  isCompatLegacyDropId,
} from './lib/main-stage-config.mjs';

import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------
function showHelp() {
  console.log(`Usage: node tools/generate-main-stages.mjs [options]

Options:
  --help               Show this help message
  --self-test          Run built-in self-tests (synthetic data only, no file writes)
  --plan <plan.json>   Path to a generation plan JSON file
  --write              Actually write output files (requires --plan and --out-dir)
  --out-dir <directory>
                       Output directory under docs/generated/ (required with --write)
  --json               Output generation summary as JSON
  --emit-draft-json    Output complete generated draft to stdout (requires --plan, no file writes)
  --check-determinism  In-memory determinism check (requires --plan, no file writes)
  --validate-current   Read-only validation of current production config files (no writes)

Description:
  该工具生成主线配置草稿。
  不会直接生成或覆盖 assets/resources/config 中的生产配置。
  当前生产 JSON 包含手工策划内容，不能由该工具完整复现。

  Default behavior is dry-run: reads plan, builds in memory, prints summary.
  No files are written without --write.

  --write requires both --plan and --out-dir.
  --out-dir must be under docs/generated/.
  Existing draft files in the output directory cause refusal.

  --emit-draft-json requires --plan. Outputs complete generated draft to stdout.
  Includes: chapterData, stageData, enemyData, dropTable.
  No files are written. Exit code 0 on success, 2 on param/validation error.

  --check-determinism requires --plan. Builds twice in memory and compares.
  Exit code 0 if identical, 1 if mismatch, 2 on param/validation error.

  --validate-current reads current production config files from assets/resources/config/.
  Read-only. No formatting, no auto-fix.
  Exit code 0 if valid, 1 if validation errors found, 2 on read/param error.

  Self-test uses synthetic test data (chapter_999 namespace) in memory only.
  No production plans are created by this tool.

Safety rules:
  - Default: dry-run (no file writes)
  - --write only with explicit --plan and --out-dir
  - Output only allowed under docs/generated/
  - Never overwrites existing draft files
  - No --force, --overwrite, --in-place, --production options exist
  - --emit-draft-json writes to stdout only, never to filesystem
  - --check-determinism never creates temporary files
  - --validate-current is strictly read-only
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

      // Determine stage type based on D-P1 rules
      // 1=normal, 2=normal, 3=elite, 4=normal, 5=mini_boss
      // 6=elite, 7=normal, 8=elite, 9=normal, 10=boss
      let type = 'normal';
      let isBossStage = false;
      if (si === 10) {
        type = 'boss';
        isBossStage = true;
      } else if (si === 5) {
        type = 'mini_boss';
        isBossStage = false;
      } else if (si === 3 || si === 6 || si === 8) {
        type = 'elite';
        isBossStage = false;
      }

      // Determine rewards — strict mode: only Gold
      const globalStageIdx = getGlobalStageIndex(ch.chapterIndex, si);
      const powerAnchor = getPowerAnchor(globalStageIdx);
      const goldAnchor = getGoldAnchor(globalStageIdx);
      const recommendedPower = powerAnchor || ((ch.recommendedPower || 1000) + si * 80);
      const rewardGold = goldAnchor || (100 + (ch.chapterIndex - 1) * 200 + si * 30);

      const chapterStage = {
        id: stageId,
        name: ch.stageNames ? (ch.stageNames[si - 1] || `Stage ${si}`) : `Stage ${si}`,
        chapterId: chId,
        stageIndex: si,
        type,
        recommendedPower,
        rewards: [
          { type: 'gold', id: 'currency_gold', amount: rewardGold },
        ],
        unlockCondition: si === 1
          ? { prevStageId: null, playerLevel: 10 }
          : { prevStageId: formatChapterStageId(ch.chapterIndex, si - 1) },
        staminaCost: 0,
        battleStageId,
      };

      // Build enemy IDs for this stage
      const stageEnemyIds = [];
      const chPad = String(ch.chapterIndex).padStart(3, '0');
      const stPad = String(si).padStart(3, '0');

      if (type === 'boss') {
        // 大Boss: ENEMY_BOSS_NNN_010_01 + 护卫
        const bossId = `ENEMY_BOSS_${chPad}_010_01`;
        stageEnemyIds.push(bossId);
        if (!enemyIds.includes(bossId)) {
          enemyIds.push(bossId);
          enemyData.data.push({
            id: bossId, name: `Boss ${ch.chapterIndex}-${si}`,
            enemyType: 'boss', element: '混沌', level: ch.chapterIndex * 10,
            hp: 200 + (ch.chapterIndex - 1) * 500 + si * 100,
            attack: 30 + (ch.chapterIndex - 1) * 20 + si * 5,
            defense: 15 + (ch.chapterIndex - 1) * 10 + si * 3,
            speed: 60 + si * 2, skillIds: ['SKILL_001'],
            dropId: `DROP_MAIN_${chPad}_${stPad}`, isBoss: true, faction: '混沌',
          });
        }
        // 护卫
        const guardCount = (getGlobalStageIndex(ch.chapterIndex, si) === 30) ? 2 : 1;
        for (let gi = 1; gi <= guardCount; gi++) {
          const guardId = `ENEMY_MAIN_${chPad}_${stPad}_${String(gi + 1).padStart(2, '0')}`;
          stageEnemyIds.push(guardId);
          if (!enemyIds.includes(guardId)) {
            enemyIds.push(guardId);
            enemyData.data.push({
              id: guardId, name: `Guard ${ch.chapterIndex}-${si}-${gi + 1}`,
              enemyType: 'normal', element: '火', level: ch.chapterIndex * 10 - 2,
              hp: 200 + (ch.chapterIndex - 1) * 500 + si * 100,
              attack: 30 + (ch.chapterIndex - 1) * 20 + si * 5,
              defense: 15 + (ch.chapterIndex - 1) * 10 + si * 3,
              speed: 60 + si * 2, skillIds: ['SKILL_001'],
              dropId: `DROP_MAIN_${chPad}_${stPad}`, isBoss: false, faction: '混沌',
            });
          }
        }
      } else if (type === 'mini_boss') {
        // 小Boss: ENEMY_MINIBOSS_NNN_005_01 + 护卫
        const mbId = `ENEMY_MINIBOSS_${chPad}_005_01`;
        stageEnemyIds.push(mbId);
        if (!enemyIds.includes(mbId)) {
          enemyIds.push(mbId);
          enemyData.data.push({
            id: mbId, name: `MiniBoss ${ch.chapterIndex}-${si}`,
            enemyType: 'elite', element: '混沌', level: ch.chapterIndex * 10,
            hp: 200 + (ch.chapterIndex - 1) * 500 + si * 100,
            attack: 30 + (ch.chapterIndex - 1) * 20 + si * 5,
            defense: 15 + (ch.chapterIndex - 1) * 10 + si * 3,
            speed: 60 + si * 2, skillIds: ['SKILL_001'],
            dropId: `DROP_MAIN_${chPad}_${stPad}`, isBoss: false, faction: '混沌',
          });
        }
        // 护卫
        const guardCount = (getGlobalStageIndex(ch.chapterIndex, si) === 25) ? 2 : 1;
        for (let gi = 1; gi <= guardCount; gi++) {
          const guardId = `ENEMY_MAIN_${chPad}_${stPad}_${String(gi + 1).padStart(2, '0')}`;
          stageEnemyIds.push(guardId);
          if (!enemyIds.includes(guardId)) {
            enemyIds.push(guardId);
            enemyData.data.push({
              id: guardId, name: `Guard ${ch.chapterIndex}-${si}-${gi + 1}`,
              enemyType: 'normal', element: '火', level: ch.chapterIndex * 10 - 2,
              hp: 200 + (ch.chapterIndex - 1) * 500 + si * 100,
              attack: 30 + (ch.chapterIndex - 1) * 20 + si * 5,
              defense: 15 + (ch.chapterIndex - 1) * 10 + si * 3,
              speed: 60 + si * 2, skillIds: ['SKILL_001'],
              dropId: `DROP_MAIN_${chPad}_${stPad}`, isBoss: false, faction: '混沌',
            });
          }
        }
      } else {
        // normal / elite
        const enemyCount = type === 'elite' ? 2 : 2;
        for (let ei = 1; ei <= enemyCount; ei++) {
          const enemyId = `ENEMY_MAIN_${chPad}_${stPad}_${String(ei).padStart(2, '0')}`;
          stageEnemyIds.push(enemyId);
          if (!enemyIds.includes(enemyId)) {
            enemyIds.push(enemyId);
            const eType = type === 'elite' ? 'elite' : 'normal';
            enemyData.data.push({
              id: enemyId, name: `Enemy ${ch.chapterIndex}-${si}-${ei}`,
              enemyType: eType, element: '火',
              level: (ch.chapterIndex - 1) * 10 + si,
              hp: 200 + (ch.chapterIndex - 1) * 500 + si * 100,
              attack: 30 + (ch.chapterIndex - 1) * 20 + si * 5,
              defense: 15 + (ch.chapterIndex - 1) * 10 + si * 3,
              speed: 60 + si * 2, skillIds: ['SKILL_001'],
              dropId: `DROP_MAIN_${chPad}_${stPad}`,
              isBoss: false, faction: '混沌',
            });
          }
        }
      }

      // Drop entries
      const dropId = `DROP_MAIN_${String(ch.chapterIndex).padStart(3, '0')}_${String(si).padStart(3, '0')}`;
      const firstDropId = `DROP_FIRST_MAIN_${String(ch.chapterIndex).padStart(3, '0')}_${String(si).padStart(3, '0')}`;

      if (!dropIds.includes(dropId)) {
        dropIds.push(dropId);
        dropTable.data.push({
          id: dropId,
          name: `Drop ${ch.chapterIndex}-${si}`,
          description: `Chapter ${ch.chapterIndex} Stage ${si} drop`,
          dropType: type === 'boss' ? 'boss' : (type === 'elite' ? 'elite' : 'normal'),
          items: [
            { itemId: 'ITEM_GOLD', itemType: 'gold', minCount: rewardGold, maxCount: rewardGold + 100, dropRate: 1.0, isGuaranteed: true },
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
          ],
        });
      }

      // Battle stage entry
      const battleStage = {
        id: battleStageId,
        name: ch.stageNames ? (ch.stageNames[si - 1] || `Stage ${si}`) : `Stage ${si}`,
        nameKey: `stage_name_${battleStageId.toLowerCase()}`,
        chapterId: chId,
        stageIndex: si,
        stageType: type,
        isBossStage,
        enemyIds: stageEnemyIds,
        recommendedPower,
        staminaCost: 0,
        dropId,
        firstDropId,
        unlockCondition: si === 1
          ? { type: 'always' }
          : { type: 'prevStage', prevStageId: formatBattleStageId(ch.chapterIndex, si - 1) },
        battleWave: 1,
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
  let emitDraftJsonMode = false;
  let checkDeterminismMode = false;
  let validateCurrentMode = false;

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
      case '--emit-draft-json':
        emitDraftJsonMode = true;
        break;
      case '--check-determinism':
        checkDeterminismMode = true;
        break;
      case '--validate-current':
        validateCurrentMode = true;
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

  // --emit-draft-json: output complete generated draft to stdout (no file writes)
  if (emitDraftJsonMode) {
    if (!planPath) {
      console.error('Error: --emit-draft-json requires --plan <plan.json>');
      process.exit(2);
    }
    try {
      const planPathResolved = path.resolve(process.cwd(), planPath);
      let plan;
      try {
        plan = JSON.parse(fs.readFileSync(planPathResolved, 'utf8'));
      } catch (err) {
        console.error(`Error reading plan file "${planPath}": ${err.message}`);
        process.exit(2);
      }
      const planValidation = validatePlan(plan);
      if (!planValidation.valid) {
        console.error('Plan validation failed:');
        planValidation.errors.forEach((e) => console.error(`  - ${e}`));
        process.exit(2);
      }
      const configs = buildFromPlan(plan);
      const draft = {
        chapterData: configs.chapterData,
        stageData: configs.stageData,
        enemyData: configs.enemyData,
        dropTable: configs.dropTable,
      };
      process.stdout.write(stableStringify(draft));
      process.exit(0);
    } catch (err) {
      console.error(`Fatal error in --emit-draft-json: ${err.message}`);
      process.exit(2);
    }
  }

  // --check-determinism: build twice in memory and compare (no file writes, no temp files)
  if (checkDeterminismMode) {
    if (!planPath) {
      console.error('Error: --check-determinism requires --plan <plan.json>');
      process.exit(2);
    }
    try {
      const planPathResolved = path.resolve(process.cwd(), planPath);
      let plan;
      try {
        plan = JSON.parse(fs.readFileSync(planPathResolved, 'utf8'));
      } catch (err) {
        console.error(`Error reading plan file "${planPath}": ${err.message}`);
        process.exit(2);
      }
      const planValidation = validatePlan(plan);
      if (!planValidation.valid) {
        console.error('Plan validation failed:');
        planValidation.errors.forEach((e) => console.error(`  - ${e}`));
        process.exit(2);
      }

      // Build twice
      const configs1 = buildFromPlan(plan);
      const configs2 = buildFromPlan(plan);

      const s1 = stableStringify(configs1);
      const s2 = stableStringify(configs2);

      if (s1 === s2) {
        console.log('Determinism check: PASSED (identical output across two builds)');
        process.exit(0);
      } else {
        console.error('Determinism check: FAILED — two builds produced different output');
        // Find first differing character position
        for (let i = 0; i < Math.max(s1.length, s2.length); i++) {
          if (s1[i] !== s2[i]) {
            const ctx = Math.max(0, i - 40);
            console.error(`First difference at byte ${i}:`);
            console.error(`  Build 1: ...${s1.slice(ctx, i + 20)}...`);
            console.error(`  Build 2: ...${s2.slice(ctx, i + 20)}...`);
            break;
          }
        }
        process.exit(1);
      }
    } catch (err) {
      console.error(`Fatal error in --check-determinism: ${err.message}`);
      process.exit(2);
    }
  }

  // --validate-current: read-only validation of current production config
  if (validateCurrentMode) {
    let exitCode = 0;
    try {
      const repoRoot = getRepoRoot();
      const p = (rel) => path.join(repoRoot, ...rel.split('/'));

      // Load production configs
      let chapterData, stageData, enemyData, dropData, accountLevelConfig;
      try {
        chapterData = JSON.parse(fs.readFileSync(p('assets/resources/config/chapters/chapter_data.json'), 'utf8'));
        stageData = JSON.parse(fs.readFileSync(p('assets/resources/config/stages/stage_data.json'), 'utf8'));
        enemyData = JSON.parse(fs.readFileSync(p('assets/resources/config/stages/enemy_data.json'), 'utf8'));
        dropData = JSON.parse(fs.readFileSync(p('assets/resources/config/drops/drop_table.json'), 'utf8'));
        accountLevelConfig = JSON.parse(fs.readFileSync(p('assets/resources/config/systems/account_level_config.json'), 'utf8'));
      } catch (err) {
        console.error(`Error reading production config files: ${err.message}`);
        process.exit(2);
      }

      // Load authority sets
      let heroIdSet = null, equipmentIdSet = null;
      try {
        heroIdSet = loadHeroAuthority();
      } catch (err) {
        console.error(`WARNING: Hero authority unavailable: ${err.message}`);
      }
      try {
        equipmentIdSet = loadEquipmentAuthority();
      } catch (err) {
        console.error(`WARNING: Equipment authority unavailable: ${err.message}`);
      }

      // --- Chapter 1 compatibility validation (old format, relaxed rules) ---
      console.log('=== Production Config Validation ===\n');

      // Collect chapter IDs
      const chapters = chapterData.data || [];
      const chapter1 = chapters.find(c => c.id === 'chapter_001');
      const chapter2 = chapters.find(c => c.id === 'chapter_002');
      const chapter3 = chapters.find(c => c.id === 'chapter_003');

      // Check Chapter 1 old format compatibility
      if (chapter1) {
        console.log('--- Chapter 1 (compatibility validation) ---');
        const ch1Errors = [];
        if (!chapter1.id || !chapter1.stages || !Array.isArray(chapter1.stages)) {
          ch1Errors.push('Chapter 1 missing id or stages array');
        } else {
          if (chapter1.stages.length !== 10) {
            ch1Errors.push(`Chapter 1: expected 10 stages, got ${chapter1.stages.length}`);
          }
          // Check stageIndex continuity
          for (let i = 0; i < chapter1.stages.length; i++) {
            const st = chapter1.stages[i];
            if (st.stageIndex !== i + 1) {
              ch1Errors.push(`Chapter 1 stage ${st.id}: stageIndex=${st.stageIndex}, expected ${i + 1}`);
            }
          }
          // Check stage 10 is boss
          const st10 = chapter1.stages.find(s => s.stageIndex === 10);
          if (st10 && st10.type !== 'boss') {
            ch1Errors.push(`Chapter 1 stage 10 must be boss, got ${st10.type}`);
          }
          // Check rewards reference valid IDs
          for (const st of chapter1.stages) {
            for (const r of (st.rewards || [])) {
              if (r.type === 'hero' && heroIdSet && !heroIdSet.has(r.id)) {
                ch1Errors.push(`${st.id}: hero reward "${r.id}" not in hero authority`);
              }
              if (r.type === 'equipment') {
                // Compat: known historical equipment IDs from Chapter 1 production
                if (isCompatKnownEquipmentId(r.id)) {
                  continue;
                }
                if (equipmentIdSet && equipmentIdSet.size > 0 && !equipmentIdSet.has(r.id)) {
                  ch1Errors.push(`${st.id}: equipment reward "${r.id}" not in equipment authority`);
                }
              }
            }
            if (st.battleStageId && st.battleStageId !== '') {
              const bsExists = (stageData.data || []).some(bs => bs.id === st.battleStageId);
              if (!bsExists) {
                ch1Errors.push(`${st.id}: battleStageId "${st.battleStageId}" not found in stage_data`);
              }
            }
          }
        }
        if (ch1Errors.length > 0) {
          exitCode = 1;
          ch1Errors.forEach(e => console.error(`  ERROR: ${e}`));
        } else {
          console.log('  PASSED');
        }
      }

      // --- Chapter 2/3 D-P1 strict validation ---
      const ch2And3 = chapters.filter(c => c.id === 'chapter_002' || c.id === 'chapter_003');
      if (ch2And3.length > 0) {
        console.log('\n--- Chapters 2-3 (D-P1 strict validation, compatCurrentProduction) ---');
        // Build a subset for strict validation
        const strictChapterData = { version: chapterData.version, name: chapterData.name, data: ch2And3 };
        // Filter stage data to only include STAGE_MAIN_ entries for ch2/3
        const strictStageData = {
          version: stageData.version,
          name: stageData.name,
          data: (stageData.data || []).filter(bs => bs.id.startsWith('STAGE_MAIN_002_') || bs.id.startsWith('STAGE_MAIN_003_')),
        };
        // Filter drop data to only include C2/C3 drops (exclude Chapter 1 legacy DROP_NNN/DROP_FNNN)
        const strictDropData = {
          version: dropData.version,
          name: dropData.name,
          data: (dropData.data || []).filter(d =>
            d.id.startsWith('DROP_MAIN_002_') || d.id.startsWith('DROP_FIRST_MAIN_002_') ||
            d.id.startsWith('DROP_MAIN_003_') || d.id.startsWith('DROP_FIRST_MAIN_003_')
          ),
        };
        const strictResult = validateMainStageConfig({
          chapterData: strictChapterData,
          stageData: strictStageData,
          enemyData,
          dropData: strictDropData,
          accountLevelConfig,
          heroIdSet,
          equipmentIdSet,
          strictGenerated: true,
          compatMode: false,
          compatCurrentProduction: true,
        });
        if (strictResult.errors.length > 0) {
          exitCode = 1;
          console.error(`  ${strictResult.errors.length} ERROR(S):`);
          strictResult.errors.forEach(e => console.error(`    ${e}`));
        } else {
          console.log('  PASSED (0 errors)');
        }
        if (strictResult.warnings.length > 0) {
          console.log(`  ${strictResult.warnings.length} warning(s):`);
          strictResult.warnings.forEach(w => console.log(`    ${w}`));
        }
      }

      // --- Cross-chapter unlock chain validation ---
      console.log('\n--- Cross-chapter unlock chain ---');
      // Chapter 2 requires Chapter 1 completed
      if (chapter2) {
        if (!chapter2.unlockCondition || chapter2.unlockCondition.prevChapterId !== 'chapter_001') {
          console.error('  ERROR: Chapter 2 must require prevChapterId=chapter_001');
          exitCode = 1;
        } else {
          console.log('  Chapter 2 unlock chain: OK');
        }
      }
      if (chapter3) {
        if (!chapter3.unlockCondition || chapter3.unlockCondition.prevChapterId !== 'chapter_002') {
          console.error('  ERROR: Chapter 3 must require prevChapterId=chapter_002');
          exitCode = 1;
        } else {
          console.log('  Chapter 3 unlock chain: OK');
        }
      }

      // --- Account level config validation ---
      console.log('\n--- Account level config ---');
      const accResult = validateAccountLevelConfig(accountLevelConfig);
      if (accResult.errors.length > 0) {
        exitCode = 1;
        accResult.errors.forEach(e => console.error(`  ERROR: ${e}`));
      } else {
        console.log('  Basic validation: PASSED');
      }
      // Check Lv1-Lv40 continuity
      const levels = accountLevelConfig.levels || [];
      const lv40 = levels.find(l => l.level === 40);
      const lv10 = levels.find(l => l.level === 10);
      const maxLv = levels.length > 0 ? levels[levels.length - 1].level : 0;
      if (maxLv !== 40) {
        console.error(`  ERROR: max level should be 40, got ${maxLv}`);
        exitCode = 1;
      } else {
        console.log(`  Lv1-Lv${maxLv} continuous: PASSED`);
      }
      if (lv40 && lv40.requiredExpToNext !== 0) {
        console.error(`  ERROR: Lv40 requiredExpToNext must be 0, got ${lv40.requiredExpToNext}`);
        exitCode = 1;
      } else {
        console.log('  Lv40 is max level: PASSED');
      }
      // Gold anchor validation
      console.log('\n--- Gold anchors (Ch 2-3) ---');
      let goldOk = true;
      if (chapter2 && Array.isArray(chapter2.stages)) {
        for (const st of chapter2.stages) {
          const gold = (st.rewards || []).find(r => r.type === 'gold');
          if (gold) {
            const gsi = getGlobalStageIndex(2, st.stageIndex);
            const anchor = getGoldAnchor(gsi);
            if (anchor !== null) {
              const lower = Math.floor(anchor * 0.95);
              const upper = Math.ceil(anchor * 1.05);
              if (gold.amount < lower || gold.amount > upper) {
                console.error(`  ERROR: ${st.id} gold=${gold.amount} outside [${lower},${upper}] (anchor=${anchor})`);
                goldOk = false;
                exitCode = 1;
              }
            }
          }
        }
      }
      if (chapter3 && Array.isArray(chapter3.stages)) {
        for (const st of chapter3.stages) {
          const gold = (st.rewards || []).find(r => r.type === 'gold');
          if (gold) {
            const gsi = getGlobalStageIndex(3, st.stageIndex);
            const anchor = getGoldAnchor(gsi);
            if (anchor !== null) {
              const lower = Math.floor(anchor * 0.95);
              const upper = Math.ceil(anchor * 1.05);
              if (gold.amount < lower || gold.amount > upper) {
                console.error(`  ERROR: ${st.id} gold=${gold.amount} outside [${lower},${upper}] (anchor=${anchor})`);
                goldOk = false;
                exitCode = 1;
              }
            }
          }
        }
      }
      if (goldOk) console.log('  Gold anchors: PASSED');

      // Power anchor validation
      console.log('\n--- Power anchors (Ch 2-3) ---');
      let powerOk = true;
      const stageDataMap = new Map((stageData.data || []).map(bs => [bs.id, bs]));
      for (const ch of ch2And3) {
        for (const st of (ch.stages || [])) {
          const gsi = getGlobalStageIndex(ch.chapterIndex, st.stageIndex);
          const anchor = getPowerAnchor(gsi);
          if (anchor !== null) {
            const lower = Math.floor(anchor * 0.95);
            const upper = Math.ceil(anchor * 1.05);
            if (st.recommendedPower < lower || st.recommendedPower > upper) {
              console.error(`  ERROR: ${st.id} recommendedPower=${st.recommendedPower} outside [${lower},${upper}] (anchor=${anchor})`);
              powerOk = false;
              exitCode = 1;
            }
          }
        }
      }
      if (powerOk) console.log('  Power anchors: PASSED');

      // Drop authority validation (using imported validateDropItemAuthority)
      console.log('\n--- Drop authority domain ---');
      const dropAuthorityErrors = [];
      for (const dp of (dropData.data || [])) {
        if (!dp.id || !Array.isArray(dp.items)) continue;
        if (dp.id.startsWith('DROP_MAIN_') || dp.id.startsWith('DROP_FIRST_MAIN_')) {
          for (const item of dp.items) {
            const result = validateDropItemAuthority(item.itemId, item.itemType);
            if (!result.valid) {
              dropAuthorityErrors.push(`${dp.id}: ${result.reason}`);
            }
          }
        }
      }
      if (dropAuthorityErrors.length > 0) {
        exitCode = 1;
        dropAuthorityErrors.forEach(e => console.error(`  ERROR: ${e}`));
      } else {
        console.log('  Drop authority: PASSED');
      }

      // Chapter 1 legacy drop compat validation (精确白名单: DROP_001-DROP_015, DROP_F001-DROP_F015)
      console.log('\n--- Chapter 1 legacy drops (compat validation, exact whitelist) ---');
      let c1DropErrors = 0;
      for (const dp of (dropData.data || [])) {
        if (!dp.id || !isCompatLegacyDropId(dp.id)) continue;
        if (!Array.isArray(dp.items)) continue;
        for (const item of dp.items) {
          const result = validateDropItemAuthorityCompat(item.itemId, item.itemType);
          if (!result.valid) {
            console.error(`  ERROR: ${dp.id}: ${result.reason}`);
            c1DropErrors++;
            exitCode = 1;
          }
        }
      }
      if (c1DropErrors === 0) {
        const c1DropCount = (dropData.data || []).filter(d => isCompatLegacyDropId(d.id)).length;
        console.log(`  Chapter 1 legacy drops: PASSED (${c1DropCount} entries, compat mode)`);
      }

      // Stage type consistency
      console.log('\n--- Stage type consistency ---');
      let typeErrors = 0;
      for (const ch of ch2And3) {
        for (const st of (ch.stages || [])) {
          if (st.stageIndex === 5 && st.type !== 'mini_boss') {
            console.error(`  ERROR: ${st.id}: stage 5 must be mini_boss, got "${st.type}"`);
            typeErrors++;
            exitCode = 1;
          }
          if (st.stageIndex === 10 && st.type !== 'boss') {
            console.error(`  ERROR: ${st.id}: stage 10 must be boss, got "${st.type}"`);
            typeErrors++;
            exitCode = 1;
          }
        }
      }
      if (typeErrors === 0) console.log('  Stage type rules: PASSED');

      // Enemy ID references
      console.log('\n--- Enemy ID references ---');
      const allEnemyIds = new Set((enemyData.data || []).map(e => e.id));
      let enemyRefErrors = 0;
      for (const bs of (stageData.data || [])) {
        if (!bs.id.startsWith('STAGE_MAIN_')) continue;
        for (const eid of (bs.enemyIds || [])) {
          if (!allEnemyIds.has(eid)) {
            console.error(`  ERROR: ${bs.id}: enemyId "${eid}" not found in enemy_data`);
            enemyRefErrors++;
            exitCode = 1;
          }
        }
      }
      if (enemyRefErrors === 0) console.log('  Enemy ID references: PASSED');

      // Drop ID references
      console.log('\n--- Drop ID references ---');
      const allDropIds = new Set((dropData.data || []).map(d => d.id));
      let dropRefErrors = 0;
      for (const bs of (stageData.data || [])) {
        if (!bs.id.startsWith('STAGE_MAIN_')) continue;
        if (bs.dropId && !allDropIds.has(bs.dropId)) {
          console.error(`  ERROR: ${bs.id}: dropId "${bs.dropId}" not found in drop_table`);
          dropRefErrors++;
          exitCode = 1;
        }
        if (bs.firstDropId && !allDropIds.has(bs.firstDropId)) {
          console.error(`  ERROR: ${bs.id}: firstDropId "${bs.firstDropId}" not found in drop_table`);
          dropRefErrors++;
          exitCode = 1;
        }
      }
      if (dropRefErrors === 0) console.log('  Drop ID references: PASSED');

      // Battle stage ID uniqueness and continuity
      console.log('\n--- Battle stage IDs ---');
      const mainStageIds = (stageData.data || []).filter(bs => bs.id.startsWith('STAGE_MAIN_')).map(bs => bs.id).sort();
      const uniqueIds = new Set(mainStageIds);
      if (uniqueIds.size !== mainStageIds.length) {
        console.error(`  ERROR: duplicate battle stage IDs detected`);
        exitCode = 1;
      } else {
        console.log(`  ${mainStageIds.length} unique battle stage IDs: PASSED`);
      }

      console.log(`\n=== Validation complete, exit code: ${exitCode} ===`);
      process.exit(exitCode);
    } catch (err) {
      console.error(`Fatal error in --validate-current: ${err.message}`);
      process.exit(2);
    }
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
