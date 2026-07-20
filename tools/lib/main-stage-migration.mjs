// tools/lib/main-stage-migration.mjs
// 旧ID纯迁移契约 — Node.js ES Module
// 职责：旧Battle Stage ID到正式位置的静态映射、查询、校验
// 所有函数均为纯函数，无文件写入，无环境依赖，不读取玩家存档

// ---------------------------------------------------------------------------
// 旧 Battle Stage ID → 正式位置 静态映射
// ---------------------------------------------------------------------------
// 该映射不代表旧Boss自动成为新第10关Boss。
// 仅用于历史位置、安全恢复和防重复奖励契约。
const LEGACY_BATTLE_STAGE_MAP = Object.freeze({
  // 第2章：旧STAGE_006～010 → 正式第2章01～05关
  'STAGE_006': { targetId: 'STAGE_MAIN_002_001', reason: 'Chapter 2 stage 1 → legacy battle index migration', isBossSlot: false, isBoss10Slot: false },
  'STAGE_007': { targetId: 'STAGE_MAIN_002_002', reason: 'Chapter 2 stage 2 → legacy battle index migration', isBossSlot: false, isBoss10Slot: false },
  'STAGE_008': { targetId: 'STAGE_MAIN_002_003', reason: 'Chapter 2 stage 3 → legacy battle index migration', isBossSlot: false, isBoss10Slot: false },
  'STAGE_009': { targetId: 'STAGE_MAIN_002_004', reason: 'Chapter 2 stage 4 → legacy battle index migration', isBossSlot: false, isBoss10Slot: false },
  'STAGE_010': { targetId: 'STAGE_MAIN_002_005', reason: 'Chapter 2 stage 5 → legacy battle index migration (NOT boss slot 10)', isBossSlot: false, isBoss10Slot: false },

  // 第3章：旧STAGE_011～015 → 正式第3章01～05关
  'STAGE_011': { targetId: 'STAGE_MAIN_003_001', reason: 'Chapter 3 stage 1 → legacy battle index migration', isBossSlot: false, isBoss10Slot: false },
  'STAGE_012': { targetId: 'STAGE_MAIN_003_002', reason: 'Chapter 3 stage 2 → legacy battle index migration', isBossSlot: false, isBoss10Slot: false },
  'STAGE_013': { targetId: 'STAGE_MAIN_003_003', reason: 'Chapter 3 stage 3 → legacy battle index migration', isBossSlot: false, isBoss10Slot: false },
  'STAGE_014': { targetId: 'STAGE_MAIN_003_004', reason: 'Chapter 3 stage 4 → legacy battle index migration', isBossSlot: false, isBoss10Slot: false },
  'STAGE_015': { targetId: 'STAGE_MAIN_003_005', reason: 'Chapter 3 stage 5 → legacy battle index migration (NOT boss slot 10)', isBossSlot: false, isBoss10Slot: false },
});

// 现有Chapter Stage稳定ID列表（旧6关制占位）
const LEGACY_CHAPTER_STAGE_IDS = Object.freeze([
  'chapter_002_stage_01', 'chapter_002_stage_02', 'chapter_002_stage_03',
  'chapter_002_stage_04', 'chapter_002_stage_05', 'chapter_002_stage_06',
  'chapter_003_stage_01', 'chapter_003_stage_02', 'chapter_003_stage_03',
  'chapter_003_stage_04', 'chapter_003_stage_05', 'chapter_003_stage_06',
]);

// ---------------------------------------------------------------------------
// 查询函数
// ---------------------------------------------------------------------------

/**
 * 判断给定的 Battle Stage ID 是否为历史 ID。
 * @param {string} id - Battle Stage ID
 * @returns {boolean}
 */
export function isLegacyBattleId(id) {
  return id in LEGACY_BATTLE_STAGE_MAP;
}

/**
 * 查询历史 Battle ID 对应的正式位置 ID。
 * @param {string} legacyId - 旧 Battle Stage ID
 * @returns {{ targetId: string, reason: string, isBossSlot: boolean, isBoss10Slot: boolean } | null}
 */
export function getMigrationTarget(legacyId) {
  const entry = LEGACY_BATTLE_STAGE_MAP[legacyId];
  if (!entry) return null;
  return { ...entry };
}

/**
 * 查询历史 Battle ID 对应的正式位置 ID（仅位置映射）。
 * 语义更明确：仅表示历史位置恢复参考，不等同于完成权益。
 * @param {string} legacyId - 旧 Battle Stage ID
 * @returns {{ targetId: string, reason: string, isBossSlot: boolean, isBoss10Slot: boolean } | null}
 */
export function getLegacyPositionTarget(legacyId) {
  return getMigrationTarget(legacyId);
}

/**
 * 判断旧 Battle ID 是否可以授予新 Battle 完成权益。
 * STAGE_010 和 STAGE_015 仅映射到第5关，不代表完成了第10关。
 * 完成权益只能由 ChapterProgress.completedStageIds 中的 chapterStageId 决定。
 * @param {string} legacyId
 * @returns {boolean}
 */
export function canGrantCompletionFromLegacyBattleId(legacyId) {
  // 所有旧 Battle ID 都不能自动授予新 Battle 完成权益。
  // STAGE_010 → 仅历史位置参考，不代表 STAGE_MAIN_002_010 完成。
  // STAGE_015 → 仅历史位置参考，不代表 STAGE_MAIN_003_010 完成。
  // 其他 STAGE_006～009, STAGE_011～014 同样不授予。
  return false;
}

/**
 * 判断旧 Battle ID 是否可以授予新 Battle 首通奖励已领取状态。
 * 首通幂等只能依赖 ChapterProgress 中的 chapterStageId 完成记录
 * 或未来明确迁移生成的 claim 状态。
 * @param {string} legacyId
 * @returns {boolean}
 */
export function canGrantFirstDropConsumedFromLegacyBattleId(legacyId) {
  // 所有旧 Battle ID 都不能自动标记新 Battle firstDrop 已领取。
  // STAGE_010 → 不自动标记 STAGE_MAIN_002_005 或 STAGE_MAIN_002_010 的 firstDrop。
  // STAGE_015 → 不自动标记 STAGE_MAIN_003_005 或 STAGE_MAIN_003_010 的 firstDrop。
  return false;
}

/**
 * 获取迁移原因字符串。
 * @param {string} legacyId
 * @returns {string}
 */
export function getMigrationReason(legacyId) {
  const entry = LEGACY_BATTLE_STAGE_MAP[legacyId];
  return entry ? entry.reason : 'NOT_A_LEGACY_ID';
}

/**
 * 判断旧 ID 是否可以安全直接映射（不涉及Boss槽位）。
 * @param {string} legacyId
 * @returns {boolean}
 */
export function isSafeDirectMigration(legacyId) {
  const entry = LEGACY_BATTLE_STAGE_MAP[legacyId];
  if (!entry) return false;
  return !entry.isBossSlot && !entry.isBoss10Slot;
}

/**
 * 明确 STAGE_010 / STAGE_015 不能映射为新第10关Boss完成。
 * @param {string} legacyId
 * @returns {boolean}
 */
export function isBoss10MigrationForbidden(legacyId) {
  // STAGE_010 和 STAGE_015 都不映射到 *_010
  // 任何映射的 isBoss10Slot 必须为 false
  const entry = LEGACY_BATTLE_STAGE_MAP[legacyId];
  if (!entry) return true; // 未知ID，禁止
  return entry.isBoss10Slot === true;
}

/**
 * 提供现有 Chapter Stage 稳定 ID 列表。
 * @returns {string[]}
 */
export function getLegacyChapterStageIds() {
  return [...LEGACY_CHAPTER_STAGE_IDS];
}

/**
 * 获取所有旧 Battle ID 列表。
 * @returns {string[]}
 */
export function getLegacyBattleIds() {
  return Object.keys(LEGACY_BATTLE_STAGE_MAP);
}

/**
 * 获取完整迁移表（只读副本）。
 * @returns {Record<string, object>}
 */
export function getMigrationTable() {
  return { ...LEGACY_BATTLE_STAGE_MAP };
}

// ---------------------------------------------------------------------------
// 校验函数
// ---------------------------------------------------------------------------

/**
 * 验证迁移表无重复源 ID（由 Object.keys 保证，显式检查）。
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateMigrationNoDuplicateSource() {
  const errors = [];
  const keys = Object.keys(LEGACY_BATTLE_STAGE_MAP);
  const seen = new Set();
  for (const k of keys) {
    if (seen.has(k)) {
      errors.push(`Duplicate source ID in migration table: ${k}`);
    }
    seen.add(k);
  }
  return { valid: errors.length === 0, errors };
}

/**
 * 验证迁移表无重复目标 ID。
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateMigrationNoDuplicateTarget() {
  const errors = [];
  const seen = new Set();
  for (const [src, entry] of Object.entries(LEGACY_BATTLE_STAGE_MAP)) {
    if (seen.has(entry.targetId)) {
      errors.push(`Duplicate target ID "${entry.targetId}" in migration table (source: ${src})`);
    }
    seen.add(entry.targetId);
  }
  return { valid: errors.length === 0, errors };
}

/**
 * 验证映射目标格式合法（STAGE_MAIN_XXX_XXX）。
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateMigrationTargetFormat() {
  const errors = [];
  const FORMAT_RE = /^STAGE_MAIN_\d{3}_\d{3}$/;
  for (const [src, entry] of Object.entries(LEGACY_BATTLE_STAGE_MAP)) {
    if (!FORMAT_RE.test(entry.targetId)) {
      errors.push(`Invalid target format "${entry.targetId}" for source "${src}"`);
    }
  }
  return { valid: errors.length === 0, errors };
}

/**
 * 验证映射不会生成第10关Boss完成权益。
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateMigrationNoBoss10Mapping() {
  const errors = [];
  for (const [src, entry] of Object.entries(LEGACY_BATTLE_STAGE_MAP)) {
    if (entry.isBoss10Slot === true) {
      errors.push(`Source "${src}" incorrectly maps to boss slot 10: "${entry.targetId}"`);
    }
    // 额外检查：目标ID不以_010结尾
    if (entry.targetId.endsWith('_010')) {
      errors.push(`Source "${src}" maps to stage 10 target "${entry.targetId}" — boss slot implications must be reviewed`);
    }
  }
  return { valid: errors.length === 0, errors };
}

/**
 * 验证迁移表完整性。
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateMigrationIntegrity() {
  const allErrors = [];

  const r1 = validateMigrationNoDuplicateSource();
  allErrors.push(...r1.errors);

  const r2 = validateMigrationNoDuplicateTarget();
  allErrors.push(...r2.errors);

  const r3 = validateMigrationTargetFormat();
  allErrors.push(...r3.errors);

  const r4 = validateMigrationNoBoss10Mapping();
  allErrors.push(...r4.errors);

  // 验证 STAGE_006～015 共10条
  const expectedSources = [];
  for (let i = 6; i <= 15; i++) {
    expectedSources.push(`STAGE_${String(i).padStart(3, '0')}`);
  }
  const actualSources = Object.keys(LEGACY_BATTLE_STAGE_MAP);
  for (const expected of expectedSources) {
    if (!actualSources.includes(expected)) {
      allErrors.push(`Missing migration entry for expected legacy ID: ${expected}`);
    }
  }
  // 没有超出范围的源
  for (const actual of actualSources) {
    if (!expectedSources.includes(actual)) {
      allErrors.push(`Unexpected legacy ID in migration table: ${actual}`);
    }
  }

  return { valid: allErrors.length === 0, errors: allErrors };
}

// ---------------------------------------------------------------------------
// 自测
// ---------------------------------------------------------------------------
export function selfTestMigration() {
  const failures = [];

  function assert(condition, msg) {
    if (!condition) failures.push(msg);
  }

  // Test 1: STAGE_006 → STAGE_MAIN_002_001
  {
    const t = getMigrationTarget('STAGE_006');
    assert(t !== null, 'TEST FAIL: STAGE_006 should have a migration target');
    assert(t && t.targetId === 'STAGE_MAIN_002_001',
      `TEST FAIL: STAGE_006 should map to STAGE_MAIN_002_001, got ${t && t.targetId}`);
  }

  // Test 2: STAGE_010 → 第2章第5位置 (NOT _010)
  {
    const t = getMigrationTarget('STAGE_010');
    assert(t !== null, 'TEST FAIL: STAGE_010 should have a migration target');
    assert(t && t.targetId === 'STAGE_MAIN_002_005',
      `TEST FAIL: STAGE_010 should map to STAGE_MAIN_002_005, got ${t && t.targetId}`);
    assert(t && !t.targetId.endsWith('_010'),
      'TEST FAIL: STAGE_010 must NOT map to a _010 slot');
  }

  // Test 3: STAGE_010 不得映射到 STAGE_MAIN_002_010
  {
    const t = getMigrationTarget('STAGE_010');
    assert(t && t.targetId !== 'STAGE_MAIN_002_010',
      'TEST FAIL: STAGE_010 must NOT map to STAGE_MAIN_002_010');
  }

  // Test 4: STAGE_011 → STAGE_MAIN_003_001
  {
    const t = getMigrationTarget('STAGE_011');
    assert(t !== null, 'TEST FAIL: STAGE_011 should have a migration target');
    assert(t && t.targetId === 'STAGE_MAIN_003_001',
      `TEST FAIL: STAGE_011 should map to STAGE_MAIN_003_001, got ${t && t.targetId}`);
  }

  // Test 5: STAGE_015 → 第3章第5位置 (NOT _010)
  {
    const t = getMigrationTarget('STAGE_015');
    assert(t !== null, 'TEST FAIL: STAGE_015 should have a migration target');
    assert(t && t.targetId === 'STAGE_MAIN_003_005',
      `TEST FAIL: STAGE_015 should map to STAGE_MAIN_003_005, got ${t && t.targetId}`);
    assert(t && !t.targetId.endsWith('_010'),
      'TEST FAIL: STAGE_015 must NOT map to a _010 slot');
  }

  // Test 6: STAGE_015 不得映射到 STAGE_MAIN_003_010
  {
    const t = getMigrationTarget('STAGE_015');
    assert(t && t.targetId !== 'STAGE_MAIN_003_010',
      'TEST FAIL: STAGE_015 must NOT map to STAGE_MAIN_003_010');
  }

  // Test 7: 未知旧ID返回 null
  {
    const t = getMigrationTarget('STAGE_999');
    assert(t === null, 'TEST FAIL: unknown legacy ID should return null');
  }

  // Test 8: 未知旧ID isLegacyBattleId = false
  {
    assert(isLegacyBattleId('STAGE_999') === false,
      'TEST FAIL: unknown ID should not be recognized as legacy');
    assert(isLegacyBattleId('STAGE_MAIN_002_001') === false,
      'TEST FAIL: new format ID should not be recognized as legacy');
  }

  // Test 9: 现有Chapter Stage 01～06保持原ID
  {
    const ids = getLegacyChapterStageIds();
    assert(ids.includes('chapter_002_stage_01'), 'TEST FAIL: chapter_002_stage_01 should be in legacy list');
    assert(ids.includes('chapter_002_stage_06'), 'TEST FAIL: chapter_002_stage_06 should be in legacy list');
    assert(ids.includes('chapter_003_stage_01'), 'TEST FAIL: chapter_003_stage_01 should be in legacy list');
    assert(ids.includes('chapter_003_stage_06'), 'TEST FAIL: chapter_003_stage_06 should be in legacy list');
  }

  // Test 10: 迁移表不存在重复源ID
  {
    const r = validateMigrationNoDuplicateSource();
    assert(r.valid, `TEST FAIL: migration table has duplicate sources: ${r.errors.join('; ')}`);
  }

  // Test 11: 迁移表不存在重复目标ID
  {
    const r = validateMigrationNoDuplicateTarget();
    assert(r.valid, `TEST FAIL: migration table has duplicate targets: ${r.errors.join('; ')}`);
  }

  // Test 12: isBoss10MigrationForbidden
  {
    assert(isBoss10MigrationForbidden('STAGE_010') === false,
      'TEST FAIL: STAGE_010 should NOT be boss10-forbidden (it maps correctly to 005)');
    assert(isBoss10MigrationForbidden('STAGE_015') === false,
      'TEST FAIL: STAGE_015 should NOT be boss10-forbidden (it maps correctly to 005)');
    assert(isBoss10MigrationForbidden('STAGE_999') === true,
      'TEST FAIL: unknown ID should be boss10-forbidden');
  }

  // Test 13: getMigrationReason
  {
    assert(getMigrationReason('STAGE_006').length > 0,
      'TEST FAIL: STAGE_006 should have a migration reason');
    assert(getMigrationReason('STAGE_999') === 'NOT_A_LEGACY_ID',
      'TEST FAIL: unknown ID should return NOT_A_LEGACY_ID');
  }

  // Test 14: 迁移表完整性
  {
    const r = validateMigrationIntegrity();
    assert(r.valid, `TEST FAIL: migration integrity check failed: ${r.errors.join('; ')}`);
  }

  // ---- 迁移位置与完成权益分离自测 (C1.6-B2-D-P1-R2) ----
  // Test 15: getLegacyPositionTarget — STAGE_010 → STAGE_MAIN_002_005（仅位置）
  {
    const t = getLegacyPositionTarget('STAGE_010');
    assert(t !== null, 'TEST FAIL: getLegacyPositionTarget(STAGE_010) should return a target');
    assert(t && t.targetId === 'STAGE_MAIN_002_005',
      `TEST FAIL: STAGE_010 position target should be STAGE_MAIN_002_005, got ${t && t.targetId}`);
  }

  // Test 16: getLegacyPositionTarget — STAGE_015 → STAGE_MAIN_003_005（仅位置）
  {
    const t = getLegacyPositionTarget('STAGE_015');
    assert(t !== null, 'TEST FAIL: getLegacyPositionTarget(STAGE_015) should return a target');
    assert(t && t.targetId === 'STAGE_MAIN_003_005',
      `TEST FAIL: STAGE_015 position target should be STAGE_MAIN_003_005, got ${t && t.targetId}`);
  }

  // Test 17: canGrantCompletionFromLegacyBattleId(STAGE_010) = false
  {
    const r = canGrantCompletionFromLegacyBattleId('STAGE_010');
    assert(r === false,
      'TEST FAIL: canGrantCompletionFromLegacyBattleId(STAGE_010) must be false — STAGE_010 does NOT grant completion of any new battle');
  }

  // Test 18: canGrantCompletionFromLegacyBattleId(STAGE_015) = false
  {
    const r = canGrantCompletionFromLegacyBattleId('STAGE_015');
    assert(r === false,
      'TEST FAIL: canGrantCompletionFromLegacyBattleId(STAGE_015) must be false — STAGE_015 does NOT grant completion of any new battle');
  }

  // Test 19: canGrantCompletionFromLegacyBattleId(STAGE_006) = false（全部旧ID不授予）
  {
    const r = canGrantCompletionFromLegacyBattleId('STAGE_006');
    assert(r === false,
      'TEST FAIL: canGrantCompletionFromLegacyBattleId(STAGE_006) must be false — no legacy ID grants completion');
  }

  // Test 20: canGrantFirstDropConsumedFromLegacyBattleId(STAGE_010) = false
  {
    const r = canGrantFirstDropConsumedFromLegacyBattleId('STAGE_010');
    assert(r === false,
      'TEST FAIL: canGrantFirstDropConsumedFromLegacyBattleId(STAGE_010) must be false — STAGE_010 does NOT mark firstDrop consumed');
  }

  // Test 21: canGrantFirstDropConsumedFromLegacyBattleId(STAGE_015) = false
  {
    const r = canGrantFirstDropConsumedFromLegacyBattleId('STAGE_015');
    assert(r === false,
      'TEST FAIL: canGrantFirstDropConsumedFromLegacyBattleId(STAGE_015) must be false — STAGE_015 does NOT mark firstDrop consumed');
  }

  // Test 22: getLegacyPositionTarget vs getMigrationTarget 别名一致性
  {
    const pm = getMigrationTarget('STAGE_006');
    const pp = getLegacyPositionTarget('STAGE_006');
    assert(pm && pp && pm.targetId === pp.targetId,
      'TEST FAIL: getLegacyPositionTarget must return same result as getMigrationTarget');
  }

  // Test 23: 未知ID canGrantCompletion = false（fail-closed）
  {
    assert(canGrantCompletionFromLegacyBattleId('STAGE_999') === false,
      'TEST FAIL: unknown legacy ID must be fail-closed for completion');
    assert(canGrantFirstDropConsumedFromLegacyBattleId('STAGE_999') === false,
      'TEST FAIL: unknown legacy ID must be fail-closed for firstDrop');
  }

  return failures;
}
