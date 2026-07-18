// tools/lib/main-stage-config.mjs
// 配置生产公共库 — Node.js ES Module
// 职责：JSON读取、稳定序列化、文件哈希、ID构造、安全输出目录、原子写入、配置校验、账号经验模拟

import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// 仓库根目录解析
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

export function getRepoRoot() {
  return REPO_ROOT;
}

// ---------------------------------------------------------------------------
// 9.1 JSON 读取
// ---------------------------------------------------------------------------
export function readJsonFile(filePath) {
  const resolved = path.resolve(REPO_ROOT, filePath);
  let raw;
  try {
    raw = fs.readFileSync(resolved, 'utf8');
  } catch (err) {
    throw new Error(`Failed to read file: ${resolved}\n${err.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse JSON in file: ${resolved}\n${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// 9.2 稳定序列化
// ---------------------------------------------------------------------------
export function stableStringify(obj) {
  return JSON.stringify(obj, null, 2) + '\n';
}

// ---------------------------------------------------------------------------
// 9.3 文件哈希 (SHA-256)
// ---------------------------------------------------------------------------
export function hashFile(filePath) {
  const resolved = path.resolve(REPO_ROOT, filePath);
  const raw = fs.readFileSync(resolved, 'utf8');
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

export function hashString(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// 9.4 ID 构造函数
// ---------------------------------------------------------------------------
export function formatChapterId(chapterIndex) {
  if (!Number.isInteger(chapterIndex) || chapterIndex < 1) {
    throw new Error(`formatChapterId: chapterIndex must be a positive integer, got ${chapterIndex}`);
  }
  return `chapter_${String(chapterIndex).padStart(3, '0')}`;
}

export function formatChapterStageId(chapterIndex, stageIndex) {
  if (!Number.isInteger(chapterIndex) || chapterIndex < 1) {
    throw new Error(`formatChapterStageId: chapterIndex must be a positive integer, got ${chapterIndex}`);
  }
  if (!Number.isInteger(stageIndex) || stageIndex < 1) {
    throw new Error(`formatChapterStageId: stageIndex must be a positive integer, got ${stageIndex}`);
  }
  const ch = String(chapterIndex).padStart(3, '0');
  const st = String(stageIndex).padStart(2, '0');
  return `chapter_${ch}_stage_${st}`;
}

export function formatBattleStageId(chapterIndex, stageIndex) {
  if (!Number.isInteger(chapterIndex) || chapterIndex < 1) {
    throw new Error(`formatBattleStageId: chapterIndex must be a positive integer, got ${chapterIndex}`);
  }
  if (!Number.isInteger(stageIndex) || stageIndex < 1) {
    throw new Error(`formatBattleStageId: stageIndex must be a positive integer, got ${stageIndex}`);
  }
  const ch = String(chapterIndex).padStart(3, '0');
  const st = String(stageIndex).padStart(3, '0');
  return `STAGE_MAIN_${ch}_${st}`;
}

// ---------------------------------------------------------------------------
// 9.5 安全输出目录检查
// ---------------------------------------------------------------------------
const SAFE_DRAFT_ROOT = 'docs/generated';

export function getSafeDraftRoot() {
  return path.join(REPO_ROOT, SAFE_DRAFT_ROOT);
}

export function assertSafeDraftOutputDir(outputDir) {
  const resolved = path.resolve(REPO_ROOT, outputDir);
  const safeRoot = path.resolve(REPO_ROOT, SAFE_DRAFT_ROOT);

  // 禁止 .. 逃逸
  const relative = path.relative(safeRoot, resolved);
  if (relative.startsWith('..')) {
    throw new Error(
      `Unsafe output directory: "${outputDir}" resolves outside allowed root "${SAFE_DRAFT_ROOT}"`
    );
  }
  if (path.isAbsolute(relative)) {
    throw new Error(
      `Unsafe output directory: "${outputDir}" is not under "${SAFE_DRAFT_ROOT}"`
    );
  }

  // 禁止输出到 assets/, tools/, .git/, 项目根目录
  const forbiddenPrefixes = [
    path.resolve(REPO_ROOT, 'assets'),
    path.resolve(REPO_ROOT, 'tools'),
    path.resolve(REPO_ROOT, '.git'),
    REPO_ROOT,
  ];
  for (const forbidden of forbiddenPrefixes) {
    if (resolved === forbidden || resolved.startsWith(forbidden + path.sep)) {
      // Allow SAFE_DRAFT_ROOT itself
      if (resolved.startsWith(safeRoot + path.sep) || resolved === safeRoot) {
        continue;
      }
      throw new Error(
        `Unsafe output directory: "${outputDir}" resolves to forbidden location "${forbidden}"`
      );
    }
  }

  // Symlink/junction escape detection via realpath
  // Even if the path string looks safe, a junction/symlink could redirect outside
  try {
    const realPath = fs.realpathSync(resolved);
    const realRelative = path.relative(safeRoot, realPath);
    if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
      throw new Error(
        `Unsafe output directory: "${outputDir}" real path "${realPath}" is outside allowed root "${SAFE_DRAFT_ROOT}" (possible symlink/junction escape)`
      );
    }
  } catch (e) {
    // ENOENT: directory doesn't exist yet — normal for new drafts
    if (e.code !== 'ENOENT') {
      throw e;
    }
    // For non-existent paths, walk up to find first existing ancestor and check its realpath
    let checkPath = resolved;
    while (checkPath !== REPO_ROOT && checkPath !== path.dirname(checkPath)) {
      checkPath = path.dirname(checkPath);
      try {
        const realAncestor = fs.realpathSync(checkPath);
        const realResolved = path.join(realAncestor, path.relative(checkPath, resolved));
        const realRelative = path.relative(safeRoot, realResolved);
        if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
          throw new Error(
            `Unsafe output directory: "${outputDir}" real path would be "${realResolved}" which is outside allowed root "${SAFE_DRAFT_ROOT}" (possible symlink/junction escape)`
          );
        }
        break; // found first existing ancestor and it's safe
      } catch (ancestorErr) {
        if (ancestorErr.code !== 'ENOENT') {
          throw ancestorErr;
        }
        // ancestor also doesn't exist — continue walking up
        continue;
      }
    }
  }

  return resolved;
}

export function checkDraftDirExistsAndEmpty(outputDir) {
  const resolved = assertSafeDraftOutputDir(outputDir);
  if (fs.existsSync(resolved)) {
    const entries = fs.readdirSync(resolved);
    // Check for any .json or .draft.json files
    const draftFiles = entries.filter(
      (e) => e.endsWith('.json') || e.endsWith('.draft.json')
    );
    if (draftFiles.length > 0) {
      throw new Error(
        `Draft output directory "${outputDir}" already contains files: ${draftFiles.join(', ')}. Refusing to overwrite.`
      );
    }
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// 9.6 原子草稿写入
// ---------------------------------------------------------------------------
export async function atomicWriteDraft(outputDir, fileName, content) {
  const resolvedDir = assertSafeDraftOutputDir(outputDir);

  // 确保目录存在
  await fsPromises.mkdir(resolvedDir, { recursive: true });

  const targetPath = path.join(resolvedDir, fileName);

  // 拒绝覆盖已有文件
  if (fs.existsSync(targetPath)) {
    throw new Error(
      `Refusing to overwrite existing draft file: ${targetPath}`
    );
  }

  // 原子写入：先写临时文件，成功后再 rename
  const tmpPath = targetPath + '.tmp.' + crypto.randomBytes(8).toString('hex');
  try {
    await fsPromises.writeFile(tmpPath, content, 'utf8');
    await fsPromises.rename(tmpPath, targetPath);
  } catch (err) {
    // 清理临时文件
    try { await fsPromises.unlink(tmpPath); } catch (_) { /* ignore */ }
    throw new Error(`atomicWriteDraft failed for ${targetPath}: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// 9.0 权威数据加载器
// ---------------------------------------------------------------------------

/**
 * 从 hero_data.json 加载英雄 ID 权威集合。
 * 运行时权威链：HeroRepository.HERO_DATA_PATH → config/heroes/hero_data → hero_data.data[].id
 */
export function loadHeroAuthority() {
  const heroData = readJsonFile('assets/resources/config/heroes/hero_data.json');

  if (!heroData || !Array.isArray(heroData.data)) {
    throw new Error(
      'hero_data.json is missing, malformed, or data is not an array — hero authority unavailable'
    );
  }

  if (heroData.data.length === 0) {
    throw new Error(
      'hero_data.json data array is empty — hero authority unavailable'
    );
  }

  const idSet = new Set();
  for (const entry of heroData.data) {
    if (entry.id) idSet.add(entry.id);
  }

  if (idSet.size === 0) {
    throw new Error(
      'hero_data.json contains no valid non-empty hero IDs — hero authority unavailable'
    );
  }

  return idSet;
}

/**
 * 从 equipment_config.json 加载装备配置 ID 权威集合。
 * 运行时权威链：EquipmentConfigRepository.CONFIG_PATH_EQUIPMENT → config/systems/equipment_config → data[].id
 */
export function loadEquipmentAuthority() {
  const eqData = readJsonFile('assets/resources/config/systems/equipment_config.json');
  const idSet = new Set();
  if (eqData && Array.isArray(eqData.data)) {
    for (const entry of eqData.data) {
      if (entry.id) idSet.add(entry.id);
    }
  }
  return idSet;
}

// ---------------------------------------------------------------------------
// 9.7.1 账号等级配置校验
// ---------------------------------------------------------------------------
export function validateAccountLevelConfig(config) {
  const errors = [];
  const warnings = [];

  if (!config || !Array.isArray(config.levels)) {
    errors.push('account_level_config.levels must be an array');
    return { errors, warnings };
  }

  const levels = config.levels;
  const seen = new Set();

  // 从 Lv1 开始
  if (levels.length === 0 || levels[0].level !== 1) {
    errors.push('account_level_config must start from level 1');
  }

  for (let i = 0; i < levels.length; i++) {
    const entry = levels[i];
    const lv = entry.level;

    // 重复检查
    if (seen.has(lv)) {
      errors.push(`account_level_config: duplicate level ${lv}`);
    }
    seen.add(lv);

    // 连续检查
    if (i > 0 && lv !== levels[i - 1].level + 1) {
      errors.push(
        `account_level_config: level ${lv} is not consecutive after level ${levels[i - 1].level}`
      );
    }

    // 最后一级 requiredExpToNext 必须为 0
    if (i === levels.length - 1) {
      if (entry.requiredExpToNext !== 0) {
        errors.push(
          `account_level_config: last level ${lv} must have requiredExpToNext=0`
        );
      }
    } else {
      // 非最后一级 requiredExpToNext 必须为正整数
      if (
        !Number.isInteger(entry.requiredExpToNext) ||
        entry.requiredExpToNext <= 0
      ) {
        errors.push(
          `account_level_config: level ${lv} requires positive integer for requiredExpToNext, got ${entry.requiredExpToNext}`
        );
      }
    }
  }

  return { errors, warnings };
}

// ---------------------------------------------------------------------------
// 9.7.1b 当前生产账号等级策略专用校验
// ---------------------------------------------------------------------------
export function validateCurrentProductionAccountLevelPolicy(config) {
  const errors = [];
  const warnings = [];

  if (!config || !Array.isArray(config.levels)) {
    errors.push('PRODUCTION_POLICY: account_level_config.levels must be an array');
    return { errors, warnings };
  }

  const levels = config.levels;
  const EXPECTED = [
    { level: 1, requiredExpToNext: 50 },
    { level: 2, requiredExpToNext: 80 },
    { level: 3, requiredExpToNext: 120 },
    { level: 4, requiredExpToNext: 180 },
    { level: 5, requiredExpToNext: 260 },
    { level: 6, requiredExpToNext: 280 },
    { level: 7, requiredExpToNext: 320 },
    { level: 8, requiredExpToNext: 360 },
    { level: 9, requiredExpToNext: 990 },
    { level: 10, requiredExpToNext: 0 },
  ];

  const EXPECTED_TOTAL = 2640;

  // 恰好10条
  if (levels.length !== 10) {
    errors.push(
      `PRODUCTION_POLICY: expected exactly 10 levels, got ${levels.length}`
    );
  }

  // 最高等级恰好Lv10
  if (levels.length > 0) {
    const maxLv = levels[levels.length - 1].level;
    if (maxLv !== 10) {
      errors.push(
        `PRODUCTION_POLICY: expected max level 10, got ${maxLv}`
      );
    }
  }

  // 不允许Lv11+
  for (const entry of levels) {
    if (entry.level > 10) {
      errors.push(
        `PRODUCTION_POLICY: level ${entry.level} exceeds max 10 — forbidden`
      );
    }
  }

  // 逐级精确比对
  for (let i = 0; i < Math.min(levels.length, EXPECTED.length); i++) {
    const actual = levels[i];
    const expected = EXPECTED[i];
    if (actual.level !== expected.level) {
      errors.push(
        `PRODUCTION_POLICY: level index ${i} expected level=${expected.level}, got ${actual.level}`
      );
    }
    if (actual.requiredExpToNext !== expected.requiredExpToNext) {
      errors.push(
        `PRODUCTION_POLICY: Lv${actual.level} expected requiredExpToNext=${expected.requiredExpToNext}, got ${actual.requiredExpToNext}`
      );
    }
  }

  // 总需求恰好2640
  const totalExp = levels.reduce((sum, e) => sum + (e.requiredExpToNext || 0), 0);
  if (totalExp !== EXPECTED_TOTAL) {
    errors.push(
      `PRODUCTION_POLICY: total requiredExpToNext expected ${EXPECTED_TOTAL}, got ${totalExp}`
    );
  }

  return { errors, warnings };
}

// ---------------------------------------------------------------------------
// 9.7.2 主线章节配置校验
// ---------------------------------------------------------------------------
export function validateMainStageConfig(options = {}) {
  const {
    chapterData,
    stageData,
    enemyData,
    dropData,
    accountLevelConfig,
    strictGenerated = false,
    compatMode = true,
  } = options;

  const errors = [];
  const warnings = [];

  // ---- 顶层结构检查 ----
  if (!chapterData || !Array.isArray(chapterData.data)) {
    errors.push('chapter_data.data must be an array');
  }
  if (!stageData || !Array.isArray(stageData.data)) {
    errors.push('stage_data.data must be an array');
  }
  if (!enemyData || !Array.isArray(enemyData.data)) {
    errors.push('enemy_data.data must be an array');
  }
  if (!dropData || !Array.isArray(dropData.data)) {
    errors.push('drop_table.data must be an array');
  }

  // 如果顶层结构已经失败，无法继续检查
  if (errors.length > 0) {
    return { errors, warnings, stats: {} };
  }

  const chapters = chapterData.data;
  const battleStages = stageData.data;
  const enemies = enemyData.data;
  const drops = dropData.data;

  // ---- ID 唯一性检查 ----
  const chapterIds = new Set();
  const chapterStageIds = new Set();
  const battleStageIds = new Set();
  const enemyIds = new Set();
  const dropIds = new Set();

  for (const ch of chapters) {
    if (chapterIds.has(ch.id)) {
      errors.push(`Duplicate chapter id: ${ch.id}`);
    }
    chapterIds.add(ch.id);

    if (!Array.isArray(ch.stages)) continue;
    for (const st of ch.stages) {
      if (chapterStageIds.has(st.id)) {
        errors.push(`Duplicate chapter stage id: ${st.id}`);
      }
      chapterStageIds.add(st.id);
    }
  }

  for (const bs of battleStages) {
    if (battleStageIds.has(bs.id)) {
      errors.push(`Duplicate battle stage id: ${bs.id}`);
    }
    battleStageIds.add(bs.id);
  }

  for (const en of enemies) {
    if (enemyIds.has(en.id)) {
      errors.push(`Duplicate enemy id: ${en.id}`);
    }
    enemyIds.add(en.id);
  }

  for (const dp of drops) {
    if (dropIds.has(dp.id)) {
      errors.push(`Duplicate drop id: ${dp.id}`);
    }
    dropIds.add(dp.id);
  }

  // ---- battleStageId 引用检查 ----
  for (const ch of chapters) {
    if (!Array.isArray(ch.stages)) continue;
    for (const st of ch.stages) {
      if (!st.battleStageId || st.battleStageId === '') {
        if (strictGenerated) {
          errors.push(`${st.id}: missing battleStageId (strict mode)`);
        } else if (compatMode) {
          warnings.push(`${st.id}: missing battleStageId (compat WARNING — chapter 2/3 not yet fully wired)`);
        }
        continue;
      }
      if (!battleStageIds.has(st.battleStageId)) {
        errors.push(
          `${st.id}: battleStageId "${st.battleStageId}" not found in stage_data`
        );
      }
    }
  }

  // ---- enemyIds 引用检查 ----
  for (const bs of battleStages) {
    if (!Array.isArray(bs.enemyIds) || bs.enemyIds.length === 0) {
      errors.push(`${bs.id}: enemyIds must be a non-empty array`);
      continue;
    }
    for (const eid of bs.enemyIds) {
      if (typeof eid !== 'string' || eid === '') {
        errors.push(`${bs.id}: enemyIds contains empty or non-string entry`);
        continue;
      }
      if (!enemyIds.has(eid)) {
        errors.push(`${bs.id}: enemyId "${eid}" not found in enemy_data`);
      }
    }
  }

  // ---- 掉落引用检查 ----
  for (const bs of battleStages) {
    if (bs.dropId) {
      if (!dropIds.has(bs.dropId)) {
        errors.push(`${bs.id}: dropId "${bs.dropId}" not found in drop_table`);
      }
    } else {
      errors.push(`${bs.id}: missing dropId`);
    }

    if (bs.firstDropId) {
      if (!dropIds.has(bs.firstDropId)) {
        errors.push(
          `${bs.id}: firstDropId "${bs.firstDropId}" not found in drop_table`
        );
      }
    } else {
      errors.push(`${bs.id}: missing firstDropId`);
    }
  }

  // ---- chapter 奖励引用检查 ----
  const knownRewardTypes = new Set(['gold', 'exp', 'hero', 'equipment', 'item', 'material']);
  // 内建 ID
  const BUILTIN_GOLD_ID = 'currency_gold';
  const BUILTIN_EXP_ID = 'player_exp';
  // 权威集合（由调用方注入）
  const heroIdSet = options.heroIdSet || null;
  const equipmentIdSet = options.equipmentIdSet || null;

  for (const ch of chapters) {
    if (!Array.isArray(ch.stages)) continue;
    for (const st of ch.stages) {
      if (!Array.isArray(st.rewards)) continue;
      for (const reward of st.rewards) {
        if (!knownRewardTypes.has(reward.type)) {
          warnings.push(
            `${st.id}: unknown reward type "${reward.type}" — UNRESOLVED_REFERENCE_DOMAIN`
          );
          continue;
        }

        // ---- gold 严格校验 ----
        if (reward.type === 'gold') {
          if (reward.id !== BUILTIN_GOLD_ID) {
            errors.push(
              `${st.id}: gold reward has wrong id "${reward.id}", expected "${BUILTIN_GOLD_ID}"`
            );
          }
          continue;
        }

        // ---- exp 严格校验 ----
        if (reward.type === 'exp') {
          if (reward.id !== BUILTIN_EXP_ID) {
            errors.push(
              `${st.id}: exp reward has wrong id "${reward.id}", expected "${BUILTIN_EXP_ID}"`
            );
          }
          continue;
        }

        // ---- 反向检查：builtin ID 被错误类型使用 ----
        if (reward.id === BUILTIN_GOLD_ID && reward.type !== 'gold') {
          errors.push(
            `${st.id}: reward id "${BUILTIN_GOLD_ID}" should have type "gold", got "${reward.type}"`
          );
        }
        if (reward.id === BUILTIN_EXP_ID && reward.type !== 'exp') {
          errors.push(
            `${st.id}: reward id "${BUILTIN_EXP_ID}" should have type "exp", got "${reward.type}"`
          );
        }

        // ---- hero 权威校验 ----
        if (reward.type === 'hero') {
          if (!(heroIdSet instanceof Set) || heroIdSet.size === 0) {
            errors.push(
              `${st.id}: hero authority unavailable or empty; cannot validate hero reward id "${reward.id}"`
            );
            continue;
          }

          if (!heroIdSet.has(reward.id)) {
            errors.push(
              `${st.id}: hero reward id "${reward.id}" not found in hero_data.json authority`
            );
          }

          continue;
        }

        // ---- equipment 权威校验 ----
        if (reward.type === 'equipment') {
          if (equipmentIdSet && equipmentIdSet.size > 0) {
            if (!equipmentIdSet.has(reward.id)) {
              warnings.push(
                `${st.id}: equipment reward id "${reward.id}" — UNRESOLVED_REFERENCE_DOMAIN (not found in equipment_config.json data[].id)`
              );
            }
            // present in authority → silent PASS
          } else {
            warnings.push(
              `${st.id}: equipment reward id "${reward.id}" — UNRESOLVED_REFERENCE_DOMAIN (equipment authority not loaded)`
            );
          }
          continue;
        }

        // ---- item / material ----
        if (reward.type === 'item' || reward.type === 'material') {
          warnings.push(
            `${st.id}: ${reward.type} reward id "${reward.id}" — UNRESOLVED_REFERENCE_DOMAIN (no item/material authority table found)`
          );
        }
      }
    }
  }

  // ---- StageType 规则检查 ----
  for (const ch of chapters) {
    if (!Array.isArray(ch.stages)) continue;
    for (const st of ch.stages) {
      const stageIdx = st.stageIndex;

      // 第5关和第10关检查
      if (stageIdx === 5) {
        if (st.type !== 'mini_boss') {
          if (strictGenerated) {
            errors.push(
              `${st.id}: stage 5 must be "mini_boss" in strict mode, got "${st.type}"`
            );
          } else if (compatMode) {
            warnings.push(
              `${st.id}: stage 5 should be "mini_boss", got "${st.type}" (LEGACY_WARNING — chapter 1 stage 5 is historical config)`
            );
          }
        }
      }

      if (stageIdx === 10) {
        if (st.type !== 'boss') {
          errors.push(
            `${st.id}: stage 10 must be "boss", got "${st.type}"`
          );
        }
      }

      // isBossStage 一致性 (仅对有 battleStageId 的)
      if (st.battleStageId && battleStageIds.has(st.battleStageId)) {
        // 找到对应的 battle stage
        const bs = battleStages.find((b) => b.id === st.battleStageId);
        if (bs) {
          if (st.type === 'boss' && bs.isBossStage !== true) {
            errors.push(
              `${st.id}: chapter stage type=boss but battle stage ${bs.id} has isBossStage=${bs.isBossStage}`
            );
          }
          if (st.type === 'mini_boss' && bs.isBossStage !== false) {
            errors.push(
              `${st.id}: chapter stage type=mini_boss but battle stage ${bs.id} has isBossStage=${bs.isBossStage}`
            );
          }

          // 类型交叉一致性
          const typeMap = {
            normal: 'normal',
            elite: 'elite',
            mini_boss: 'mini_boss',
            boss: 'boss',
          };
          if (bs.stageType && typeMap[st.type] && bs.stageType !== typeMap[st.type]) {
            if (strictGenerated) {
              errors.push(
                `${st.id}: chapter type "${st.type}" does not match battle stage ${bs.id} stageType "${bs.stageType}"`
              );
            } else if (compatMode) {
              // Check for specific legacy exceptions
              // STAGE_MAIN_001_005 maps to chapter_001_stage_05 (type=normal) and has stageType=normal — OK
              // STAGE_001 through STAGE_004 map to stages 1-4
              // STAGE_005 is orphan (not referenced) — skip
              warnings.push(
                `${st.id}: chapter type "${st.type}" vs battle stage ${bs.id} stageType "${bs.stageType}" (LEGACY_WARNING — cross-reference discrepancy)`
              );
            }
          }
        }
      }

      // 遗留字段检查
      if (st.enemyGroupId !== undefined) {
        if (strictGenerated) {
          errors.push(
            `${st.id}: legacy field "enemyGroupId" is forbidden in new drafts`
          );
        } else if (compatMode) {
          if (st.enemyGroupId !== '') {
            warnings.push(
              `${st.id}: legacy field "enemyGroupId" present (LEGACY_WARNING — not authoritative for battle)`
            );
          }
        }
      }

      if (st.bossId !== undefined) {
        if (strictGenerated) {
          errors.push(
            `${st.id}: legacy field "bossId" is forbidden in new drafts`
          );
        } else if (compatMode) {
          if (st.bossId !== '') {
            warnings.push(
              `${st.id}: legacy field "bossId" present (LEGACY_WARNING — not authoritative for battle)`
            );
          }
        }
      }
    }
  }

  // ---- 生成 stats ----
  const stats = {
    chapterCount: chapters.length,
    chapterStageCount: chapters.reduce((sum, ch) => sum + (Array.isArray(ch.stages) ? ch.stages.length : 0), 0),
    battleStageCount: battleStages.length,
    enemyCount: enemies.length,
    dropCount: drops.length,
    chaptersWithBattleStageId: 0,
    chaptersMissingBattleStageId: 0,
  };

  for (const ch of chapters) {
    if (!Array.isArray(ch.stages)) continue;
    let hasAny = false;
    let hasAll = true;
    for (const st of ch.stages) {
      if (st.battleStageId && st.battleStageId !== '') hasAny = true;
      else hasAll = false;
    }
    if (hasAll) stats.chaptersWithBattleStageId++;
    if (!hasAll) stats.chaptersMissingBattleStageId++;
  }

  return { errors, warnings, stats };
}

// ---------------------------------------------------------------------------
// 9.7.3 生成草稿校验（严格模式）
// ---------------------------------------------------------------------------
export function validateGeneratedDraft(options) {
  return validateMainStageConfig({
    ...options,
    strictGenerated: true,
    compatMode: false,
  });
}

// ---------------------------------------------------------------------------
// 9.8 账号经验模拟
// ---------------------------------------------------------------------------
export function simulateAccountProgression(options = {}) {
  const {
    chapterData,
    accountLevelConfig,
    maxChapterIndex = null, // null = all chapters, or specific chapter index
  } = options;

  const levels = accountLevelConfig.levels;
  const maxLevel = levels[levels.length - 1].level;

  // 构建等级→所需经验映射
  const expMap = new Map();
  for (const entry of levels) {
    expMap.set(entry.level, entry.requiredExpToNext);
  }

  const results = [];
  const chapterSummaries = [];
  const clearedStages = new Set();

  let currentLevel = 1;
  let currentExp = 0;
  let acceptedTotalExp = 0;
  let droppedTotalExp = 0;
  let rewardTotalExp = 0;
  let postMaxAdditionalInputExp = 0;
  let postMaxDroppedExp = 0;
  let reachedMaxAtStage = null; // first stage index where max level was hit

  const chapters = chapterData.data;

  for (const ch of chapters) {
    if (maxChapterIndex !== null && ch.chapterIndex > maxChapterIndex) continue;
    if (!Array.isArray(ch.stages)) continue;

    let chRewardTotalExp = 0;
    let chAcceptedTotalExp = 0;
    let chDroppedTotalExp = 0;
    const chStartLevel = currentLevel;
    const chStartExp = currentExp;

    for (const st of ch.stages) {
      // 记录处理前状态
      const oldLevel = currentLevel;
      const oldExp = currentExp;
      const alreadyMax = currentLevel >= maxLevel;

      // 提取 exp 奖励
      let rewardExp = 0;
      if (Array.isArray(st.rewards)) {
        for (const r of st.rewards) {
          if (r.type === 'exp' && r.id === 'player_exp') {
            rewardExp += (r.amount || 0);
          }
        }
      }

      chRewardTotalExp += rewardExp;
      rewardTotalExp += rewardExp;

      const stageId = st.id;
      const isDuplicate = clearedStages.has(stageId);
      clearedStages.add(stageId);

      let acceptedExp = 0;
      let droppedExp = 0;

      if (isDuplicate) {
        // 重复首通不发放经验
        acceptedExp = 0;
        droppedExp = 0;
      } else {
        // 首次通关：发放经验
        let remaining = rewardExp;

        while (remaining > 0 && currentLevel < maxLevel) {
          const needed = expMap.get(currentLevel) || 0;
          if (needed === 0) {
            // 满级，丢弃剩余
            droppedExp += remaining;
            remaining = 0;
            break;
          }

          const space = needed - currentExp;
          if (remaining < space) {
            // 不会升级 (not enough to reach threshold)
            currentExp += remaining;
            acceptedExp += remaining;
            remaining = 0;
          } else {
            // 升级 (reached or exceeded threshold)
            const consumed = space;
            currentExp = 0;
            currentLevel++;
            acceptedExp += consumed;
            remaining -= consumed;
          }
        }

        // 如果已经满级，丢弃剩余
        if (remaining > 0 && currentLevel >= maxLevel) {
          droppedExp += remaining;
          currentExp = 0;
        }
      }

      // 满级后处理：累积 postMax 计数
      if (alreadyMax) {
        postMaxAdditionalInputExp += rewardExp;
        postMaxDroppedExp += (acceptedExp + droppedExp);
      }

      acceptedTotalExp += acceptedExp;
      droppedTotalExp += droppedExp;
      chAcceptedTotalExp += acceptedExp;
      chDroppedTotalExp += droppedExp;

      results.push({
        chapterStageId: stageId,
        chapterIndex: ch.chapterIndex,
        rewardExp,
        oldLevel,
        oldExp,
        acceptedExp,
        droppedExp,
        newLevel: currentLevel,
        newExp: currentExp,
        reachedMaxLevel: currentLevel >= maxLevel,
        duplicateClear: isDuplicate,
      });
    }

    // 每章小结
    chapterSummaries.push({
      chapterId: ch.id,
      chapterIndex: ch.chapterIndex,
      rewardTotalExp: chRewardTotalExp,
      acceptedTotalExp: chAcceptedTotalExp,
      droppedTotalExp: chDroppedTotalExp,
      startLevel: chStartLevel,
      startExp: chStartExp,
      endLevel: currentLevel,
      endExp: currentExp,
      reachedMaxLevel: currentLevel >= maxLevel,
    });
  }

  return {
    results,
    chapterSummaries,
    summary: {
      rewardTotalExp,
      acceptedTotalExp,
      droppedTotalExp,
      finalLevel: currentLevel,
      finalExp: currentExp,
      reachedMaxLevel: currentLevel >= maxLevel,
      maxLevel,
      totalStagesProcessed: results.length,
      postMaxAdditionalInputExp,
      postMaxDroppedExp,
    },
  };
}

// ---------------------------------------------------------------------------
// 自我测试工具
// ---------------------------------------------------------------------------
export function selfTestValidation() {
  const failures = [];

  function assert(condition, msg) {
    if (!condition) failures.push(msg);
  }

  // Test: duplicate chapter ID
  {
    const chapterData = {
      data: [
        { id: 'chapter_001', chapterIndex: 1, stages: [] },
        { id: 'chapter_001', chapterIndex: 1, stages: [] },
      ],
    };
    const r = validateMainStageConfig({
      chapterData,
      stageData: { data: [] },
      enemyData: { data: [] },
      dropData: { data: [] },
    });
    assert(
      r.errors.some((e) => e.includes('Duplicate chapter id')),
      'TEST FAIL: duplicate chapter ID should be rejected'
    );
  }

  // Test: duplicate chapter stage ID
  {
    const chapterData = {
      data: [{
        id: 'chapter_001', chapterIndex: 1,
        stages: [
          { id: 'dup_stage', stageIndex: 1 },
          { id: 'dup_stage', stageIndex: 2 },
        ],
      }],
    };
    const r = validateMainStageConfig({
      chapterData,
      stageData: { data: [] },
      enemyData: { data: [] },
      dropData: { data: [] },
    });
    assert(
      r.errors.some((e) => e.includes('Duplicate chapter stage id')),
      'TEST FAIL: duplicate chapter stage ID should be rejected'
    );
  }

  // Test: duplicate battle stage ID
  {
    const r = validateMainStageConfig({
      chapterData: { data: [] },
      stageData: { data: [{ id: 'STAGE_001' }, { id: 'STAGE_001' }] },
      enemyData: { data: [] },
      dropData: { data: [] },
    });
    assert(
      r.errors.some((e) => e.includes('Duplicate battle stage id')),
      'TEST FAIL: duplicate battle stage ID should be rejected'
    );
  }

  // Test: duplicate enemy ID
  {
    const r = validateMainStageConfig({
      chapterData: { data: [] },
      stageData: { data: [] },
      enemyData: { data: [{ id: 'ENEMY_099' }, { id: 'ENEMY_099' }] },
      dropData: { data: [] },
    });
    assert(
      r.errors.some((e) => e.includes('Duplicate enemy id')),
      'TEST FAIL: duplicate enemy ID should be rejected'
    );
  }

  // Test: duplicate drop ID
  {
    const r = validateMainStageConfig({
      chapterData: { data: [] },
      stageData: { data: [] },
      enemyData: { data: [] },
      dropData: { data: [{ id: 'DROP_099' }, { id: 'DROP_099' }] },
    });
    assert(
      r.errors.some((e) => e.includes('Duplicate drop id')),
      'TEST FAIL: duplicate drop ID should be rejected'
    );
  }

  // Test: battleStageId reference missing
  {
    const chapterData = {
      data: [{
        id: 'chapter_001', chapterIndex: 1,
        stages: [{ id: 'ch_001_st_01', stageIndex: 1, battleStageId: 'STAGE_MISSING' }],
      }],
    };
    const r = validateMainStageConfig({
      chapterData,
      stageData: { data: [{ id: 'STAGE_EXISTS' }] },
      enemyData: { data: [] },
      dropData: { data: [] },
    });
    assert(
      r.errors.some((e) => e.includes('not found in stage_data')),
      'TEST FAIL: missing battleStageId reference should be rejected'
    );
  }

  // Test: enemyIds empty array rejected
  {
    const r = validateMainStageConfig({
      chapterData: { data: [] },
      stageData: { data: [{ id: 'STAGE_001', dropId: 'DROP_X', firstDropId: 'DROP_Y' }] },
      enemyData: { data: [] },
      dropData: { data: [{ id: 'DROP_X' }, { id: 'DROP_Y' }] },
    });
    assert(
      r.errors.some((e) => e.includes('enemyIds must be a non-empty array')),
      'TEST FAIL: empty enemyIds should be rejected'
    );
  }

  // Test: enemyId empty string rejected
  {
    const r = validateMainStageConfig({
      chapterData: { data: [] },
      stageData: { data: [{ id: 'STAGE_001', enemyIds: [''], dropId: 'DROP_X', firstDropId: 'DROP_Y' }] },
      enemyData: { data: [] },
      dropData: { data: [{ id: 'DROP_X' }, { id: 'DROP_Y' }] },
    });
    assert(
      r.errors.some((e) => e.includes('empty or non-string')),
      'TEST FAIL: empty string enemyId should be rejected'
    );
  }

  // Test: enemyId not found rejected
  {
    const r = validateMainStageConfig({
      chapterData: { data: [] },
      stageData: { data: [{ id: 'STAGE_001', enemyIds: ['ENEMY_MISSING'], dropId: 'DROP_X', firstDropId: 'DROP_Y' }] },
      enemyData: { data: [{ id: 'ENEMY_001' }] },
      dropData: { data: [{ id: 'DROP_X' }, { id: 'DROP_Y' }] },
    });
    assert(
      r.errors.some((e) => e.includes('not found in enemy_data')),
      'TEST FAIL: missing enemyId should be rejected'
    );
  }

  // Test: enemyIds duplicate references ARE allowed
  {
    const r = validateMainStageConfig({
      chapterData: { data: [] },
      stageData: { data: [{ id: 'STAGE_001', enemyIds: ['ENEMY_001', 'ENEMY_001', 'ENEMY_002'], dropId: 'DROP_X', firstDropId: 'DROP_Y' }] },
      enemyData: { data: [{ id: 'ENEMY_001' }, { id: 'ENEMY_002' }] },
      dropData: { data: [{ id: 'DROP_X' }, { id: 'DROP_Y' }] },
    });
    const enemyErrors = r.errors.filter((e) => e.includes('enemyId'));
    assert(
      enemyErrors.length === 0,
      `TEST FAIL: duplicate enemyId references should be allowed, got ${enemyErrors.length} errors: ${enemyErrors.join('; ')}`
    );
  }

  // Test: dropId missing rejected
  {
    const r = validateMainStageConfig({
      chapterData: { data: [] },
      stageData: { data: [{ id: 'STAGE_001', enemyIds: ['ENEMY_001'], firstDropId: 'DROP_Y' }] },
      enemyData: { data: [{ id: 'ENEMY_001' }] },
      dropData: { data: [{ id: 'DROP_Y' }] },
    });
    assert(
      r.errors.some((e) => e.includes('missing dropId')),
      'TEST FAIL: missing dropId should be rejected'
    );
  }

  // Test: firstDropId missing rejected
  {
    const r = validateMainStageConfig({
      chapterData: { data: [] },
      stageData: { data: [{ id: 'STAGE_001', enemyIds: ['ENEMY_001'], dropId: 'DROP_X' }] },
      enemyData: { data: [{ id: 'ENEMY_001' }] },
      dropData: { data: [{ id: 'DROP_X' }] },
    });
    assert(
      r.errors.some((e) => e.includes('missing firstDropId')),
      'TEST FAIL: missing firstDropId should be rejected'
    );
  }

  // Test: stage 5 not mini_boss in strict mode rejected
  {
    const chapterData = {
      data: [{
        id: 'chapter_001', chapterIndex: 1,
        stages: [{ id: 'ch_001_st_05', stageIndex: 5, type: 'normal' }],
      }],
    };
    const r = validateGeneratedDraft({
      chapterData,
      stageData: { data: [] },
      enemyData: { data: [] },
      dropData: { data: [] },
    });
    assert(
      r.errors.some((e) => e.includes('stage 5 must be "mini_boss"')),
      'TEST FAIL: stage 5 not mini_boss in strict mode should be rejected'
    );
  }

  // Test: stage 10 not boss in strict mode rejected
  {
    const chapterData = {
      data: [{
        id: 'chapter_001', chapterIndex: 1,
        stages: [{ id: 'ch_001_st_10', stageIndex: 10, type: 'normal' }],
      }],
    };
    const r = validateGeneratedDraft({
      chapterData,
      stageData: { data: [] },
      enemyData: { data: [] },
      dropData: { data: [] },
    });
    assert(
      r.errors.some((e) => e.includes('stage 10 must be "boss"')),
      'TEST FAIL: stage 10 not boss in strict mode should be rejected'
    );
  }

  // Test: mini_boss + isBossStage=true rejected
  {
    const chapterData = {
      data: [{
        id: 'chapter_001', chapterIndex: 1,
        stages: [{ id: 'ch_001_st_05', stageIndex: 5, type: 'mini_boss', battleStageId: 'STAGE_005' }],
      }],
    };
    const r = validateGeneratedDraft({
      chapterData,
      stageData: { data: [{ id: 'STAGE_005', enemyIds: ['ENEMY_001'], stageType: 'mini_boss', isBossStage: true, dropId: 'DROP_X', firstDropId: 'DROP_Y' }] },
      enemyData: { data: [{ id: 'ENEMY_001' }] },
      dropData: { data: [{ id: 'DROP_X' }, { id: 'DROP_Y' }] },
    });
    assert(
      r.errors.some((e) => e.includes('type=mini_boss but battle stage') && e.includes('isBossStage=true')),
      'TEST FAIL: mini_boss + isBossStage=true should be rejected'
    );
  }

  // Test: boss + isBossStage=false rejected
  {
    const chapterData = {
      data: [{
        id: 'chapter_001', chapterIndex: 1,
        stages: [{ id: 'ch_001_st_10', stageIndex: 10, type: 'boss', battleStageId: 'STAGE_010' }],
      }],
    };
    const r = validateGeneratedDraft({
      chapterData,
      stageData: { data: [{ id: 'STAGE_010', enemyIds: ['ENEMY_001'], stageType: 'boss', isBossStage: false, dropId: 'DROP_X', firstDropId: 'DROP_Y' }] },
      enemyData: { data: [{ id: 'ENEMY_001' }] },
      dropData: { data: [{ id: 'DROP_X' }, { id: 'DROP_Y' }] },
    });
    assert(
      r.errors.some((e) => e.includes('type=boss but battle stage') && e.includes('isBossStage=false')),
      'TEST FAIL: boss + isBossStage=false should be rejected'
    );
  }

  // Test: chapter type vs battle stage type inconsistency rejected in strict mode
  {
    const chapterData = {
      data: [{
        id: 'chapter_001', chapterIndex: 1,
        stages: [{ id: 'ch_001_st_01', stageIndex: 1, type: 'elite', battleStageId: 'STAGE_001' }],
      }],
    };
    const r = validateGeneratedDraft({
      chapterData,
      stageData: { data: [{ id: 'STAGE_001', enemyIds: ['ENEMY_001'], stageType: 'normal', isBossStage: false, dropId: 'DROP_X', firstDropId: 'DROP_Y' }] },
      enemyData: { data: [{ id: 'ENEMY_001' }] },
      dropData: { data: [{ id: 'DROP_X' }, { id: 'DROP_Y' }] },
    });
    assert(
      r.errors.some((e) => e.includes('does not match')),
      'TEST FAIL: chapter/battle stage type inconsistency should be rejected in strict mode'
    );
  }

  // Test: new draft with enemyGroupId rejected
  {
    const chapterData = {
      data: [{
        id: 'chapter_001', chapterIndex: 1,
        stages: [{ id: 'ch_001_st_01', stageIndex: 1, type: 'normal', enemyGroupId: 'enemy_group_001' }],
      }],
    };
    const r = validateGeneratedDraft({
      chapterData,
      stageData: { data: [] },
      enemyData: { data: [] },
      dropData: { data: [] },
    });
    assert(
      r.errors.some((e) => e.includes('enemyGroupId')),
      'TEST FAIL: new draft with enemyGroupId should be rejected'
    );
  }

  // Test: new draft with bossId rejected
  {
    const chapterData = {
      data: [{
        id: 'chapter_001', chapterIndex: 1,
        stages: [{ id: 'ch_001_st_10', stageIndex: 10, type: 'boss', bossId: 'boss_001' }],
      }],
    };
    const r = validateGeneratedDraft({
      chapterData,
      stageData: { data: [] },
      enemyData: { data: [] },
      dropData: { data: [] },
    });
    assert(
      r.errors.some((e) => e.includes('bossId')),
      'TEST FAIL: new draft with bossId should be rejected'
    );
  }

  // Test: unsafe output directory rejected
  {
    let caught = false;
    try {
      assertSafeDraftOutputDir('assets/config');
    } catch (e) {
      caught = true;
    }
    assert(caught, 'TEST FAIL: unsafe output directory should be rejected');
  }

  // Test: safe output directory passes
  {
    let caught = false;
    try {
      assertSafeDraftOutputDir('docs/generated/test-batch');
    } catch (e) {
      caught = true;
    }
    assert(!caught, 'TEST FAIL: safe output directory should pass');
  }

  // Test: stable stringify
  {
    const obj = { b: 2, a: 1 };
    const s1 = stableStringify(obj);
    const s2 = stableStringify(obj);
    assert(s1 === s2, 'TEST FAIL: stableStringify should produce identical output for same input');
  }

  // ---- 修订一：Hero 权威校验自测 ----
  // Test: valid hero ID (hero_002) → PASS
  {
    const heroIdSet = new Set(['hero_001', 'hero_002', 'hero_003', 'hero_004', 'hero_005']);
    const chapterData = {
      data: [{
        id: 'chapter_001', chapterIndex: 1,
        stages: [{ id: 'ch_001_st_01', stageIndex: 1, type: 'normal',
          rewards: [{ type: 'hero', id: 'hero_002', amount: 1 }] }],
      }],
    };
    const r = validateMainStageConfig({
      chapterData, stageData: { data: [] }, enemyData: { data: [] }, dropData: { data: [] },
      heroIdSet,
    });
    assert(
      r.errors.length === 0,
      `TEST FAIL: valid hero_002 should PASS, got errors: ${r.errors.join('; ')}`
    );
    const heroWarnings = r.warnings.filter((w) => w.includes('hero') && w.includes('UNRESOLVED'));
    assert(
      heroWarnings.length === 0,
      `TEST FAIL: hero_002 should not produce UNRESOLVED_REFERENCE_DOMAIN, got ${heroWarnings.length}`
    );
  }

  // Test: invalid hero ID (hero_999) → ERROR
  {
    const heroIdSet = new Set(['hero_001', 'hero_002', 'hero_003', 'hero_004', 'hero_005']);
    const chapterData = {
      data: [{
        id: 'chapter_001', chapterIndex: 1,
        stages: [{ id: 'ch_001_st_01', stageIndex: 1, type: 'normal',
          rewards: [{ type: 'hero', id: 'hero_999', amount: 1 }] }],
      }],
    };
    const r = validateMainStageConfig({
      chapterData, stageData: { data: [] }, enemyData: { data: [] }, dropData: { data: [] },
      heroIdSet,
    });
    assert(
      r.errors.some((e) => e.includes('hero_999') && e.includes('not found in hero_data.json')),
      'TEST FAIL: invalid hero_999 should produce ERROR'
    );
  }

  // Test: non-existent hero ID (hero_not_exists) → ERROR (explicit name-based test)
  {
    const heroIdSet = new Set(['hero_001', 'hero_002', 'hero_003', 'hero_004', 'hero_005']);
    const chapterData = {
      data: [{
        id: 'chapter_001', chapterIndex: 1,
        stages: [{ id: 'ch_001_st_01', stageIndex: 1, type: 'normal',
          rewards: [{ type: 'hero', id: 'hero_not_exists', amount: 1 }] }],
      }],
    };
    const r = validateMainStageConfig({
      chapterData, stageData: { data: [] }, enemyData: { data: [] }, dropData: { data: [] },
      heroIdSet,
    });
    const heroErr = r.errors.find((e) => e.includes('hero_not_exists') && e.includes('hero'));
    assert(
      heroErr !== undefined,
      `TEST FAIL: non-existent hero_not_exists should produce ERROR, got ${r.errors.length} errors: ${r.errors.join('; ')}`
    );
    // Error must locate: reward position, reward type hero, the specific non-existent hero ID
    assert(
      heroErr && heroErr.includes('hero reward id'),
      `TEST FAIL: error should mention "hero reward id", got: ${heroErr || 'undefined'}`
    );
    assert(
      heroErr && heroErr.includes('not found in hero_data.json'),
      `TEST FAIL: error should mention "not found in hero_data.json", got: ${heroErr || 'undefined'}`
    );
  }

  // Test: heroIdSet = null → ERROR (authority unavailable, fail-closed)
  {
    const chapterData = {
      data: [{
        id: 'chapter_001', chapterIndex: 1,
        stages: [{ id: 'ch_001_st_01', stageIndex: 1, type: 'normal',
          rewards: [{ type: 'hero', id: 'hero_002', amount: 1 }] }],
      }],
    };
    const r = validateMainStageConfig({
      chapterData, stageData: { data: [] }, enemyData: { data: [] }, dropData: { data: [] },
      heroIdSet: null,
    });
    const heroErr = r.errors.find((e) => e.includes('hero authority unavailable') || (e.includes('hero') && e.includes('unavailable')));
    assert(
      heroErr !== undefined,
      `TEST FAIL: heroIdSet=null should produce ERROR (hero authority unavailable), got ${r.errors.length} errors: ${r.errors.join('; ')}`
    );
    assert(
      heroErr && heroErr.includes('hero authority unavailable'),
      `TEST FAIL: error should mention "hero authority unavailable", got: ${heroErr || 'undefined'}`
    );
    const heroWarnings = r.warnings.filter((w) => w.includes('hero') && w.includes('UNRESOLVED'));
    assert(
      heroWarnings.length === 0,
      `TEST FAIL: heroIdSet=null should NOT produce UNRESOLVED_REFERENCE_DOMAIN, got ${heroWarnings.length}`
    );
  }

  // Test: heroIdSet = empty Set → ERROR (authority empty, fail-closed)
  {
    const chapterData = {
      data: [{
        id: 'chapter_001', chapterIndex: 1,
        stages: [{ id: 'ch_001_st_01', stageIndex: 1, type: 'normal',
          rewards: [{ type: 'hero', id: 'hero_002', amount: 1 }] }],
      }],
    };
    const r = validateMainStageConfig({
      chapterData, stageData: { data: [] }, enemyData: { data: [] }, dropData: { data: [] },
      heroIdSet: new Set(),
    });
    const heroErr = r.errors.find((e) => e.includes('hero authority unavailable') || (e.includes('hero') && e.includes('empty')));
    assert(
      heroErr !== undefined,
      `TEST FAIL: heroIdSet=empty Set should produce ERROR (hero authority unavailable or empty), got ${r.errors.length} errors: ${r.errors.join('; ')}`
    );
    assert(
      heroErr && (heroErr.includes('hero authority unavailable') || heroErr.includes('empty')),
      `TEST FAIL: error should mention "hero authority unavailable or empty", got: ${heroErr || 'undefined'}`
    );
    const heroWarnings = r.warnings.filter((w) => w.includes('hero') && w.includes('UNRESOLVED'));
    assert(
      heroWarnings.length === 0,
      `TEST FAIL: heroIdSet=empty Set should NOT produce UNRESOLVED_REFERENCE_DOMAIN, got ${heroWarnings.length}`
    );
  }

  // ---- 修订三：Gold/Exp 内建 ID 严格校验自测 ----
  // Test: gold + currency_gold → PASS
  {
    const chapterData = {
      data: [{
        id: 'chapter_001', chapterIndex: 1,
        stages: [{ id: 'ch_001_st_01', stageIndex: 1, type: 'normal',
          rewards: [{ type: 'gold', id: 'currency_gold', amount: 100 }] }],
      }],
    };
    const r = validateMainStageConfig({
      chapterData, stageData: { data: [] }, enemyData: { data: [] }, dropData: { data: [] },
    });
    const goldErrors = r.errors.filter((e) => e.includes('gold'));
    assert(goldErrors.length === 0, `TEST FAIL: valid gold+currency_gold should PASS, got: ${goldErrors.join('; ')}`);
    const goldWarnings = r.warnings.filter((w) => w.includes('gold') && w.includes('UNRESOLVED'));
    assert(goldWarnings.length === 0, `TEST FAIL: gold should not produce UNRESOLVED_REFERENCE_DOMAIN, got ${goldWarnings.length}`);
  }

  // Test: exp + player_exp → PASS
  {
    const chapterData = {
      data: [{
        id: 'chapter_001', chapterIndex: 1,
        stages: [{ id: 'ch_001_st_01', stageIndex: 1, type: 'normal',
          rewards: [{ type: 'exp', id: 'player_exp', amount: 50 }] }],
      }],
    };
    const r = validateMainStageConfig({
      chapterData, stageData: { data: [] }, enemyData: { data: [] }, dropData: { data: [] },
    });
    const expErrors = r.errors.filter((e) => e.includes('exp'));
    assert(expErrors.length === 0, `TEST FAIL: valid exp+player_exp should PASS, got: ${expErrors.join('; ')}`);
    const expWarnings = r.warnings.filter((w) => w.includes('exp') && w.includes('UNRESOLVED'));
    assert(expWarnings.length === 0, `TEST FAIL: exp should not produce UNRESOLVED_REFERENCE_DOMAIN, got ${expWarnings.length}`);
  }

  // Test: gold with wrong id → ERROR
  {
    const chapterData = {
      data: [{
        id: 'chapter_001', chapterIndex: 1,
        stages: [{ id: 'ch_001_st_01', stageIndex: 1, type: 'normal',
          rewards: [{ type: 'gold', id: 'wrong_gold_id', amount: 100 }] }],
      }],
    };
    const r = validateMainStageConfig({
      chapterData, stageData: { data: [] }, enemyData: { data: [] }, dropData: { data: [] },
    });
    assert(
      r.errors.some((e) => e.includes('gold') && e.includes('wrong id')),
      'TEST FAIL: gold with wrong id should produce ERROR'
    );
  }

  // Test: exp with wrong id → ERROR
  {
    const chapterData = {
      data: [{
        id: 'chapter_001', chapterIndex: 1,
        stages: [{ id: 'ch_001_st_01', stageIndex: 1, type: 'normal',
          rewards: [{ type: 'exp', id: 'wrong_exp_id', amount: 50 }] }],
      }],
    };
    const r = validateMainStageConfig({
      chapterData, stageData: { data: [] }, enemyData: { data: [] }, dropData: { data: [] },
    });
    assert(
      r.errors.some((e) => e.includes('exp') && e.includes('wrong id')),
      'TEST FAIL: exp with wrong id should produce ERROR'
    );
  }

  // ---- 修订四：当前生产账号等级策略自测 ----
  const PROD_LEVELS = [
    { level: 1, requiredExpToNext: 50 },
    { level: 2, requiredExpToNext: 80 },
    { level: 3, requiredExpToNext: 120 },
    { level: 4, requiredExpToNext: 180 },
    { level: 5, requiredExpToNext: 260 },
    { level: 6, requiredExpToNext: 280 },
    { level: 7, requiredExpToNext: 320 },
    { level: 8, requiredExpToNext: 360 },
    { level: 9, requiredExpToNext: 990 },
    { level: 10, requiredExpToNext: 0 },
  ];

  // Valid production config → PASS
  {
    const r = validateCurrentProductionAccountLevelPolicy({ levels: PROD_LEVELS });
    assert(r.errors.length === 0, `TEST FAIL: exact production policy should PASS, got: ${r.errors.join('; ')}`);
  }

  // Historical regression: Lv5 requiredExpToNext 260 → 250 must be rejected
  {
    const modified = JSON.parse(JSON.stringify(PROD_LEVELS));
    modified[4].requiredExpToNext = 250;

    const result = validateCurrentProductionAccountLevelPolicy({
      levels: modified,
    });

    assert(
      result.errors.some(
        (error) =>
          error.includes('Lv5') &&
          error.includes('expected requiredExpToNext=260') &&
          error.includes('got 250'),
      ),
      `TEST FAIL: historical Lv5 260→250 regression must be rejected: ${result.errors.join('; ')}`,
    );

    assert(
      result.errors.some(
        (error) =>
          error.includes('total requiredExpToNext expected 2640') &&
          error.includes('got 2630'),
      ),
      `TEST FAIL: Lv5 260→250 total must become 2630: ${result.errors.join('; ')}`,
    );
  }

  // Lv6 280→250 changed → ERROR
  {
    const modified = JSON.parse(JSON.stringify(PROD_LEVELS));
    modified[5].requiredExpToNext = 250; // Lv6: 280→250
    const r = validateCurrentProductionAccountLevelPolicy({ levels: modified });
    assert(r.errors.length > 0, 'TEST FAIL: Lv6 changed to 250 should produce ERROR');
  }

  // 9→10 changed to 1000 → ERROR
  {
    const modified = JSON.parse(JSON.stringify(PROD_LEVELS));
    modified[8].requiredExpToNext = 1000; // Lv9: 990→1000
    const r = validateCurrentProductionAccountLevelPolicy({ levels: modified });
    assert(r.errors.length > 0, 'TEST FAIL: Lv9 changed to 1000 should produce ERROR');
  }

  // Add Lv11 → ERROR
  {
    const modified = JSON.parse(JSON.stringify(PROD_LEVELS));
    modified.push({ level: 11, requiredExpToNext: 500 });
    const r = validateCurrentProductionAccountLevelPolicy({ levels: modified });
    assert(r.errors.length > 0, 'TEST FAIL: adding Lv11 should produce ERROR');
  }

  // Delete one level → ERROR
  {
    const modified = JSON.parse(JSON.stringify(PROD_LEVELS));
    modified.pop();
    const r = validateCurrentProductionAccountLevelPolicy({ levels: modified });
    assert(r.errors.length > 0, 'TEST FAIL: deleting level should produce ERROR');
  }

  // Swap Lv5 and Lv6 order → ERROR (even though each entry's level field is correct)
  {
    const swapped = JSON.parse(JSON.stringify(PROD_LEVELS));
    // Swap positions 4 and 5 (Lv5 ↔ Lv6)
    const tmp = swapped[4];
    swapped[4] = swapped[5];
    swapped[5] = tmp;
    const r = validateCurrentProductionAccountLevelPolicy({ levels: swapped });
    assert(
      r.errors.length > 0,
      `TEST FAIL: swapped Lv5/Lv6 order should produce ERROR, got ${r.errors.length} errors: ${r.errors.join('; ')}`
    );
  }

  // ---- 修订六：输出目录安全补测 ----
  // Project root rejected
  {
    let caught = false;
    try { assertSafeDraftOutputDir('.'); } catch (e) { caught = true; }
    assert(caught, 'TEST FAIL: project root "." should be rejected');
  }
  // assets directory rejected
  {
    let caught = false;
    try { assertSafeDraftOutputDir('assets'); } catch (e) { caught = true; }
    assert(caught, 'TEST FAIL: assets directory should be rejected');
  }
  // tools directory rejected
  {
    let caught = false;
    try { assertSafeDraftOutputDir('tools'); } catch (e) { caught = true; }
    assert(caught, 'TEST FAIL: tools directory should be rejected');
  }
  // .git directory rejected
  {
    let caught = false;
    try { assertSafeDraftOutputDir('.git'); } catch (e) { caught = true; }
    assert(caught, 'TEST FAIL: .git directory should be rejected');
  }
  // .. path escape rejected
  {
    let caught = false;
    try { assertSafeDraftOutputDir('docs/../../etc'); } catch (e) { caught = true; }
    assert(caught, 'TEST FAIL: .. path escape should be rejected');
  }

  return failures;
}

export function selfTestAccountExp() {
  const failures = [];

  function assert(condition, msg) {
    if (!condition) failures.push(msg);
  }

  // Build synthetic chapter data for chapter 1 with actual exp values
  const accountLevelConfig = {
    levels: [
      { level: 1, requiredExpToNext: 50 },
      { level: 2, requiredExpToNext: 80 },
      { level: 3, requiredExpToNext: 120 },
      { level: 4, requiredExpToNext: 180 },
      { level: 5, requiredExpToNext: 260 },
      { level: 6, requiredExpToNext: 280 },
      { level: 7, requiredExpToNext: 320 },
      { level: 8, requiredExpToNext: 360 },
      { level: 9, requiredExpToNext: 990 },
      { level: 10, requiredExpToNext: 0 },
    ],
  };

  const chapterData = {
    data: [{
      id: 'chapter_001', chapterIndex: 1,
      stages: [
        { id: 'chapter_001_stage_01', stageIndex: 1, rewards: [{ type: 'exp', id: 'player_exp', amount: 50 }] },
        { id: 'chapter_001_stage_02', stageIndex: 2, rewards: [{ type: 'exp', id: 'player_exp', amount: 80 }] },
        { id: 'chapter_001_stage_03', stageIndex: 3, rewards: [{ type: 'exp', id: 'player_exp', amount: 120 }] },
        { id: 'chapter_001_stage_04', stageIndex: 4, rewards: [{ type: 'exp', id: 'player_exp', amount: 180 }] },
        { id: 'chapter_001_stage_05', stageIndex: 5, rewards: [{ type: 'exp', id: 'player_exp', amount: 250 }] },
        { id: 'chapter_001_stage_06', stageIndex: 6, rewards: [{ type: 'exp', id: 'player_exp', amount: 280 }] },
        { id: 'chapter_001_stage_07', stageIndex: 7, rewards: [{ type: 'exp', id: 'player_exp', amount: 320 }] },
        { id: 'chapter_001_stage_08', stageIndex: 8, rewards: [{ type: 'exp', id: 'player_exp', amount: 360 }] },
        { id: 'chapter_001_stage_09', stageIndex: 9, rewards: [{ type: 'exp', id: 'player_exp', amount: 400 }] },
        { id: 'chapter_001_stage_10', stageIndex: 10, rewards: [{ type: 'exp', id: 'player_exp', amount: 600 }] },
      ],
    }],
  };

  // Test 22: Chapter 1 2640 exp simulation reaches Lv10/0
  {
    const sim = simulateAccountProgression({ chapterData, accountLevelConfig });
    const s = sim.summary;
    assert(
      s.acceptedTotalExp === 2640,
      `TEST FAIL: chapter 1 total accepted exp should be 2640, got ${s.acceptedTotalExp}`
    );
    assert(
      s.finalLevel === 10,
      `TEST FAIL: chapter 1 final level should be 10, got ${s.finalLevel}`
    );
    assert(
      s.finalExp === 0,
      `TEST FAIL: chapter 1 final exp should be 0, got ${s.finalExp}`
    );
  }

  // Test 23: Lv9 900+200 only accepts 90
  {
    // Build a custom config where the player is already at Lv9 with 900 exp
    const levels = [
      { level: 1, requiredExpToNext: 50 },
      { level: 2, requiredExpToNext: 80 },
      { level: 3, requiredExpToNext: 120 },
      { level: 4, requiredExpToNext: 180 },
      { level: 5, requiredExpToNext: 260 },
      { level: 6, requiredExpToNext: 280 },
      { level: 7, requiredExpToNext: 320 },
      { level: 8, requiredExpToNext: 360 },
      { level: 9, requiredExpToNext: 990 },
      { level: 10, requiredExpToNext: 0 },
    ];

    // Simulate: already at Lv9, 900 exp, receive 200 exp
    let lv = 9, exp = 900;
    let accepted = 0, dropped = 0;
    let input = 200;

    while (input > 0 && lv < 10) {
      const entry = levels.find((l) => l.level === lv);
      const needed = entry ? entry.requiredExpToNext : 0;
      if (needed === 0) {
        dropped += input;
        input = 0;
        break;
      }
      const space = needed - exp;
      if (input <= space) {
        exp += input;
        accepted += input;
        input = 0;
      } else {
        accepted += space;
        input -= space;
        lv++;
        exp = 0;
      }
    }

    if (input > 0 && lv >= 10) {
      dropped += input;
      exp = 0;
    }

    assert(
      accepted === 90,
      `TEST FAIL: Lv9 900+200 should accept 90, got ${accepted}`
    );
    assert(
      dropped === 110,
      `TEST FAIL: Lv9 900+200 should drop 110, got ${dropped}`
    );
    assert(lv === 10, `TEST FAIL: Lv9+should reach Lv10, got ${lv}`);
    assert(exp === 0, `TEST FAIL: at max level exp should be 0, got ${exp}`);
  }

  // Test 24: duplicate first clear does not repeat account exp
  {
    const dupLevels = [
      { level: 1, requiredExpToNext: 50 },
      { level: 2, requiredExpToNext: 80 },
      { level: 3, requiredExpToNext: 120 },
      { level: 4, requiredExpToNext: 180 },
      { level: 5, requiredExpToNext: 260 },
      { level: 6, requiredExpToNext: 280 },
      { level: 7, requiredExpToNext: 320 },
      { level: 8, requiredExpToNext: 360 },
      { level: 9, requiredExpToNext: 990 },
      { level: 10, requiredExpToNext: 0 },
    ];
    // Simulate with the same stage appearing twice (duplicate clear)
    const dupData = {
      data: [{
        id: 'chapter_001', chapterIndex: 1,
        stages: [
          { id: 'chapter_001_stage_01', stageIndex: 1, rewards: [{ type: 'exp', id: 'player_exp', amount: 50 }] },
        ],
      }, {
        id: 'chapter_001_dup', chapterIndex: 1,
        stages: [
          { id: 'chapter_001_stage_01', stageIndex: 1, rewards: [{ type: 'exp', id: 'player_exp', amount: 50 }] },
        ],
      }],
    };
    const sim = simulateAccountProgression({ chapterData: dupData, accountLevelConfig: { levels: dupLevels } });
    const firstClear = sim.results[0];
    const secondClear = sim.results[1];
    assert(
      firstClear.acceptedExp === 50,
      `TEST FAIL: first clear should accept 50 exp, got ${firstClear.acceptedExp}`
    );
    assert(
      secondClear.acceptedExp === 0,
      `TEST FAIL: duplicate clear should accept 0 exp, got ${secondClear.acceptedExp}`
    );
    assert(
      secondClear.duplicateClear === true,
      `TEST FAIL: duplicate clear should be marked, got ${secondClear.duplicateClear}`
    );
  }

  // Test 25: Chapter 1 summary fields (rewardTotalExp, acceptedTotalExp, droppedTotalExp, finalLevel, finalExp)
  {
    const sim = simulateAccountProgression({ chapterData, accountLevelConfig });
    const ch1 = sim.chapterSummaries.find((cs) => cs.chapterIndex === 1);
    assert(ch1 !== undefined, 'TEST FAIL: chapter 1 summary should exist');
    assert(
      ch1.rewardTotalExp === 2640,
      `TEST FAIL: chapter 1 rewardTotalExp should be 2640, got ${ch1.rewardTotalExp}`
    );
    assert(
      ch1.acceptedTotalExp === 2640,
      `TEST FAIL: chapter 1 acceptedTotalExp should be 2640, got ${ch1.acceptedTotalExp}`
    );
    assert(
      ch1.droppedTotalExp === 0,
      `TEST FAIL: chapter 1 droppedTotalExp should be 0, got ${ch1.droppedTotalExp}`
    );
    assert(
      ch1.endLevel === 10,
      `TEST FAIL: chapter 1 finalLevel should be 10, got ${ch1.endLevel}`
    );
    assert(
      ch1.endExp === 0,
      `TEST FAIL: chapter 1 finalExp should be 0, got ${ch1.endExp}`
    );
    // Summary-level fields
    assert(
      sim.summary.rewardTotalExp === 2640,
      `TEST FAIL: summary rewardTotalExp should be 2640, got ${sim.summary.rewardTotalExp}`
    );
    // Chapter 1 doesn't hit max before it; postMax fields should be 0
    assert(
      sim.summary.postMaxAdditionalInputExp === 0,
      `TEST FAIL: chapter 1 only: postMaxAdditionalInputExp should be 0, got ${sim.summary.postMaxAdditionalInputExp}`
    );
    assert(
      sim.summary.postMaxDroppedExp === 0,
      `TEST FAIL: chapter 1 only: postMaxDroppedExp should be 0, got ${sim.summary.postMaxDroppedExp}`
    );
  }

  // Test 26: Multi-chapter post-max tracking
  {
    const multiChData = {
      data: [
        {
          id: 'chapter_001', chapterIndex: 1,
          stages: [
            { id: 'chapter_001_stage_01', stageIndex: 1, rewards: [{ type: 'exp', id: 'player_exp', amount: 50 }] },
            { id: 'chapter_001_stage_02', stageIndex: 2, rewards: [{ type: 'exp', id: 'player_exp', amount: 80 }] },
            { id: 'chapter_001_stage_03', stageIndex: 3, rewards: [{ type: 'exp', id: 'player_exp', amount: 120 }] },
            { id: 'chapter_001_stage_04', stageIndex: 4, rewards: [{ type: 'exp', id: 'player_exp', amount: 180 }] },
            { id: 'chapter_001_stage_05', stageIndex: 5, rewards: [{ type: 'exp', id: 'player_exp', amount: 250 }] },
            { id: 'chapter_001_stage_06', stageIndex: 6, rewards: [{ type: 'exp', id: 'player_exp', amount: 280 }] },
            { id: 'chapter_001_stage_07', stageIndex: 7, rewards: [{ type: 'exp', id: 'player_exp', amount: 320 }] },
            { id: 'chapter_001_stage_08', stageIndex: 8, rewards: [{ type: 'exp', id: 'player_exp', amount: 360 }] },
            { id: 'chapter_001_stage_09', stageIndex: 9, rewards: [{ type: 'exp', id: 'player_exp', amount: 400 }] },
            { id: 'chapter_001_stage_10', stageIndex: 10, rewards: [{ type: 'exp', id: 'player_exp', amount: 600 }] },
          ],
        },
        {
          id: 'chapter_002', chapterIndex: 2,
          stages: [
            { id: 'chapter_002_stage_01', stageIndex: 1, rewards: [{ type: 'exp', id: 'player_exp', amount: 300 }] },
            { id: 'chapter_002_stage_02', stageIndex: 2, rewards: [{ type: 'exp', id: 'player_exp', amount: 380 }] },
          ],
        },
      ],
    };
    const sim = simulateAccountProgression({ chapterData: multiChData, accountLevelConfig });
    // Chapter 2 should be post-max
    const ch2 = sim.chapterSummaries.find((cs) => cs.chapterIndex === 2);
    assert(ch2 !== undefined, 'TEST FAIL: chapter 2 summary should exist');
    assert(ch2.reachedMaxLevel === true, 'TEST FAIL: chapter 2 should have reachedMaxLevel=true');
    // postMax fields
    assert(
      sim.summary.postMaxAdditionalInputExp === 680,
      `TEST FAIL: postMaxAdditionalInputExp should be 680 (300+380), got ${sim.summary.postMaxAdditionalInputExp}`
    );
    assert(
      sim.summary.postMaxDroppedExp === 680,
      `TEST FAIL: postMaxDroppedExp should be 680, got ${sim.summary.postMaxDroppedExp}`
    );
  }

  return failures;
}

// ---------------------------------------------------------------------------
// ID构造函数自测
// ---------------------------------------------------------------------------
export function selfTestIdConstructors() {
  const failures = [];

  function assert(condition, msg) {
    if (!condition) failures.push(msg);
  }

  assert(formatChapterId(2) === 'chapter_002', 'formatChapterId(2) should be chapter_002');
  assert(formatChapterStageId(1, 5) === 'chapter_001_stage_05', 'formatChapterStageId(1,5) should be chapter_001_stage_05');
  assert(formatBattleStageId(1, 10) === 'STAGE_MAIN_001_010', 'formatBattleStageId(1,10) should be STAGE_MAIN_001_010');
  assert(formatBattleStageId(2, 1) === 'STAGE_MAIN_002_001', 'formatBattleStageId(2,1) should be STAGE_MAIN_002_001');

  // Reject non-positive integers
  try { formatChapterId(0); assert(false, 'formatChapterId(0) should throw'); } catch (_) {}
  try { formatChapterId(-1); assert(false, 'formatChapterId(-1) should throw'); } catch (_) {}
  try { formatChapterId(1.5); assert(false, 'formatChapterId(1.5) should throw'); } catch (_) {}

  return failures;
}
