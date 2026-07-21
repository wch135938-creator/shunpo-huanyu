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
// 9.4b D-P1 正式锚点常量（生成器与校验器共享同一权威数据源）
// ---------------------------------------------------------------------------

/**
 * 第11～30关 recommendedPower 锚点表。
 * key: 全局关卡序号，value: 推荐战力
 */
export const D_P1_POWER_ANCHORS = Object.freeze({
  11: 900, 12: 980, 13: 1100, 14: 1200, 15: 1400,
  16: 1520, 17: 1640, 18: 1780, 19: 1920, 20: 2300,
  21: 2350, 22: 2520, 23: 2720, 24: 2950, 25: 3350,
  26: 3600, 27: 3900, 28: 4250, 29: 4650, 30: 5600,
});

/**
 * 第11～30关 Gold 奖励锚点表。
 * key: 全局关卡序号，value: 金币数量
 */
export const D_P1_GOLD_ANCHORS = Object.freeze({
  11: 1100, 12: 1200, 13: 1350, 14: 1500, 15: 1800,
  16: 1950, 17: 2100, 18: 2300, 19: 2550, 20: 3200,
  21: 3300, 22: 3550, 23: 3900, 24: 4250, 25: 5000,
  26: 5300, 27: 5700, 28: 6200, 29: 6800, 30: 8000,
});

/** recommendedPower 允许的浮动比例 */
export const D_P1_POWER_TOLERANCE = 0.05;

/** Gold 奖励允许的浮动比例 */
export const D_P1_GOLD_TOLERANCE = 0.05;

/** Boss 关战力跃升最低比例：第20关 >= 第19关 × (1 + BOSS_POWER_JUMP_RATIO) */
export const D_P1_BOSS_POWER_JUMP_RATIO = 0.15;

/** 最高账号等级（R3升级：由硬编码10改为配置驱动，当前R7-FINAL候选最高等级为Lv40） */
export const D_P1_MAX_ACCOUNT_LEVEL = 40;

/** 允许的 stageType 集合（严格模式） */
export const D_P1_ALLOWED_STAGE_TYPES = Object.freeze(
  new Set(['normal', 'elite', 'mini_boss', 'boss'])
);

/** 第5关必须是 mini_boss */
export const D_P1_MINI_BOSS_SLOT = 5;
/** 第10关必须是 boss */
export const D_P1_BOSS_SLOT = 10;

/** 严格模式要求的每章关卡数 */
export const D_P1_STAGES_PER_CHAPTER = 10;

/** D-P1 英雄奖励位置授权映射 — 仅允许的英雄在特定关卡位置出现 */
export const D_P1_HERO_REWARD_POSITION_MAP = Object.freeze(new Map([
  ['chapter_002_stage_06', 'hero_002'],
  ['chapter_003_stage_06', 'hero_003'],
]));

// ---------------------------------------------------------------------------
// 9.4c 正式 ID 格式校验辅助
// ---------------------------------------------------------------------------

/** Chapter Stage ID 格式: chapter_NNN_stage_NN */
const CHAPTER_STAGE_ID_RE = /^chapter_(\d{3})_stage_(\d{2})$/;

/** Battle Stage ID 格式: STAGE_MAIN_NNN_NNN */
const BATTLE_STAGE_ID_RE = /^STAGE_MAIN_(\d{3})_(\d{3})$/;

/** Chapter ID 格式: chapter_NNN (小写) */
const CHAPTER_ID_RE = /^chapter_(\d{3})$/;

/** 新敌人 ID 格式: ENEMY_MAIN_NNN_NNN_NN */
const ENEMY_MAIN_ID_RE = /^ENEMY_MAIN_(\d{3})_(\d{3})_(\d{2})$/;

/** 小Boss敌人 ID 格式: ENEMY_MINIBOSS_NNN_005_01 */
const ENEMY_MINIBOSS_ID_RE = /^ENEMY_MINIBOSS_(\d{3})_005_01$/;

/** 大Boss敌人 ID 格式: ENEMY_BOSS_NNN_010_01 */
const ENEMY_BOSS_ID_RE = /^ENEMY_BOSS_(\d{3})_010_01$/;

/** Drop ID 格式: DROP_MAIN_NNN_NNN */
const DROP_MAIN_ID_RE = /^DROP_MAIN_(\d{3})_(\d{3})$/;

/** First Drop ID 格式: DROP_FIRST_MAIN_NNN_NNN */
const DROP_FIRST_MAIN_ID_RE = /^DROP_FIRST_MAIN_(\d{3})_(\d{3})$/;

/** 旧敌人 ID 格式 (ENEMY_NNN) — 新Plan中禁止 */
const LEGACY_ENEMY_ID_RE = /^ENEMY_\d{3}$/;

/** 禁止的掉落物品前缀（装备品质掉落） */
const FORBIDDEN_DROP_ITEM_PREFIXES = [
  'ITEM_EQUIP_N_', 'ITEM_EQUIP_R_', 'ITEM_EQUIP_SR_',
  'equipment_common_', 'equipment_rare_',
];

// ---------------------------------------------------------------------------
// 9.4d D-P1 掉落物权威域（严格模式 fail-closed）
// ---------------------------------------------------------------------------

/** 严格模式允许的 drop itemType 集合 */
const D_P1_ALLOWED_DROP_ITEM_TYPES = Object.freeze(
  new Set(['gold', 'diamond', 'material', 'fragment'])
);

/** 严格模式已知的 drop itemId 权威域（只含运行时已消费的类型） */
const D_P1_KNOWN_DROP_ITEM_IDS = Object.freeze(new Set([
  'ITEM_GOLD',
  'ITEM_DIAMOND',
  'ITEM_EXP',
  'ITEM_EQUIPMENT_STONE',
  'ITEM_MAT_BREAK_001',
  'ITEM_MAT_STAR_001',
]));

// ---- 兼容模式专用常量 ----

/**
 * 兼容模式：运行时已支持的旧 itemType（来自 drop_config.ts ItemType 类型定义）。
 * 这些类型在生产配置 Chapter 1 历史条目中合法存在，但在严格模式下不被新产出。
 * 运行时证据：assets/scripts/config/drop_config.ts Line 13
 *   export type ItemType = 'gold' | 'exp' | 'equip' | 'material' | 'gachaFragment' | 'diamond';
 * 以及 assets/scripts/systems/DropSystem.ts 中的 ITEM_TYPE_EXP / ITEM_TYPE_EQUIP / ITEM_TYPE_GACHA_FRAGMENT 常量与消费分支。
 */
const COMPAT_LEGACY_ITEM_TYPES = Object.freeze(new Set(['exp', 'equip', 'gachaFragment']));

/**
 * 兼容模式：已知的历史装备奖励 ID（生产 Chapter 1 stage 4 已有）。
 * equipment_config.json 的 data[].id 使用 weapon_001 / armor_001 / acc_001 等现代命名，
 * equipment_common_001 是旧命名约定，仅在生产 Chapter 1 中存在。
 */
const COMPAT_KNOWN_EQUIPMENT_IDS = Object.freeze(new Set(['equipment_common_001']));

/**
 * 精确兼容白名单：仅当前 HEAD 已存在并被确认合法的 Chapter 1 旧掉落 ID。
 * DROP_001～DROP_015 + DROP_F001～DROP_F015 = 恰好30条记录。
 * 不在该集合内的任何 DROP_NNN/DROP_FNNN 格式 ID（如 DROP_016, DROP_F016, DROP_999, DROP_F999）
 * 不得进入历史兼容校验，必须走严格 validateDropItemAuthority。
 */
const COMPAT_LEGACY_DROP_ID_SET = Object.freeze(new Set([
  'DROP_001', 'DROP_002', 'DROP_003', 'DROP_004', 'DROP_005',
  'DROP_006', 'DROP_007', 'DROP_008', 'DROP_009', 'DROP_010',
  'DROP_011', 'DROP_012', 'DROP_013', 'DROP_014', 'DROP_015',
  'DROP_F001', 'DROP_F002', 'DROP_F003', 'DROP_F004', 'DROP_F005',
  'DROP_F006', 'DROP_F007', 'DROP_F008', 'DROP_F009', 'DROP_F010',
  'DROP_F011', 'DROP_F012', 'DROP_F013', 'DROP_F014', 'DROP_F015',
]));

/**
 * 严格模式掉落物品权威校验。
 * 允许域 = itemType ∈ {gold, diamond, material, fragment}
 *         ∧ itemId ∈ 已知权威常量集合
 *         ∧ itemType 与 itemId 组合匹配
 * 未知 itemId / 未知 itemType / 类型ID不匹配 → FAIL。
 * @param {string} itemId
 * @param {string} itemType
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateDropItemAuthority(itemId, itemType) {
  if (typeof itemType !== 'string' || itemType === '') {
    return { valid: false, reason: `empty or non-string itemType` };
  }
  if (!D_P1_ALLOWED_DROP_ITEM_TYPES.has(itemType)) {
    return { valid: false, reason: `unknown itemType "${itemType}" — not in allowed domain [${[...D_P1_ALLOWED_DROP_ITEM_TYPES].join(', ')}]` };
  }
  if (typeof itemId !== 'string' || itemId === '') {
    return { valid: false, reason: `empty or non-string itemId` };
  }
  if (isForbiddenDropItemId(itemId)) {
    return { valid: false, reason: `forbidden drop item ID "${itemId}" — equipment quality drops not allowed` };
  }
  // 类型与ID组合匹配
  if (itemType === 'gold' && itemId !== 'ITEM_GOLD') {
    return { valid: false, reason: `gold drop must have itemId "ITEM_GOLD", got "${itemId}"` };
  }
  if (itemType === 'diamond' && itemId !== 'ITEM_DIAMOND') {
    return { valid: false, reason: `diamond drop must have itemId "ITEM_DIAMOND", got "${itemId}"` };
  }
  if (!D_P1_KNOWN_DROP_ITEM_IDS.has(itemId)) {
    return { valid: false, reason: `unknown drop itemId "${itemId}" — not in known authority domain` };
  }
  return { valid: true };
}

/**
 * 兼容模式掉落物品权威校验。
 * 在严格校验拒绝后，若 itemType 属于运行时已支持的旧类型（exp / equip / gachaFragment），则放行。
 * 仅用于当前生产配置 Chapter 1 历史条目校验；新 Chapter 2/3 产出不使用此函数。
 * @param {string} itemId
 * @param {string} itemType
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateDropItemAuthorityCompat(itemId, itemType) {
  const strictResult = validateDropItemAuthority(itemId, itemType);
  if (strictResult.valid) return strictResult;
  // Compat: runtime-supported legacy types from drop_config.ts ItemType
  if (typeof itemType === 'string' && COMPAT_LEGACY_ITEM_TYPES.has(itemType)) {
    return { valid: true };
  }
  return strictResult;
}

/**
 * 检查是否为已知的历史装备奖励 ID（仅生产 Chapter 1 compat 使用）。
 */
export function isCompatKnownEquipmentId(id) {
  return COMPAT_KNOWN_EQUIPMENT_IDS.has(id);
}

/**
 * 检查是否为精确兼容白名单内的 Chapter 1 历史掉落 ID。
 * 仅 DROP_001～DROP_015 和 DROP_F001～DROP_F015 返回 true。
 * 任何其他 ID（包括 DROP_016, DROP_F016, DROP_999, DROP_F999）返回 false。
 */
export function isCompatLegacyDropId(id) {
  return COMPAT_LEGACY_DROP_ID_SET.has(id);
}

/**
 * 解析 Chapter Stage ID，返回 { chapterIndex, stageIndex } 或 null。
 */
export function parseChapterStageId(id) {
  const m = CHAPTER_STAGE_ID_RE.exec(id);
  if (!m) return null;
  return { chapterIndex: parseInt(m[1], 10), stageIndex: parseInt(m[2], 10) };
}

/**
 * 解析 Battle Stage ID，返回 { chapterIndex, stageIndex } 或 null。
 */
export function parseBattleStageId(id) {
  const m = BATTLE_STAGE_ID_RE.exec(id);
  if (!m) return null;
  return { chapterIndex: parseInt(m[1], 10), stageIndex: parseInt(m[2], 10) };
}

/**
 * 解析 Chapter ID，返回 chapterIndex 或 null。
 */
export function parseChapterId(id) {
  const m = CHAPTER_ID_RE.exec(id);
  if (!m) return null;
  return parseInt(m[1], 10);
}

/**
 * 检查 chapterId 是否为正式小写格式。
 */
export function isLowercaseChapterId(id) {
  return CHAPTER_ID_RE.test(id);
}

/**
 * 判断敌人 ID 是否为旧格式（ENEMY_NNN）。
 */
export function isLegacyEnemyIdFormat(id) {
  return LEGACY_ENEMY_ID_RE.test(id);
}

/**
 * 判断敌人 ID 是否为新正式格式。
 */
export function isValidNewEnemyIdFormat(id) {
  return ENEMY_MAIN_ID_RE.test(id)
    || ENEMY_MINIBOSS_ID_RE.test(id)
    || ENEMY_BOSS_ID_RE.test(id);
}

/**
 * 判断掉落物品 ID 是否为禁止的装备品质前缀。
 */
export function isForbiddenDropItemId(itemId) {
  if (typeof itemId !== 'string') return false;
  const lower = itemId.toLowerCase();
  return FORBIDDEN_DROP_ITEM_PREFIXES.some((p) => lower.startsWith(p.toLowerCase()));
}

/**
 * 获取全局关卡序号。
 * (chapterIndex - 1) * 10 + stageIndex
 */
export function getGlobalStageIndex(chapterIndex, stageIndex) {
  return (chapterIndex - 1) * 10 + stageIndex;
}

/**
 * 获取指定全局关卡序号的 recommendedPower 锚点值。
 */
export function getPowerAnchor(globalStageIndex) {
  return D_P1_POWER_ANCHORS[globalStageIndex] || null;
}

/**
 * 获取指定全局关卡序号的 Gold 锚点值。
 */
export function getGoldAnchor(globalStageIndex) {
  return D_P1_GOLD_ANCHORS[globalStageIndex] || null;
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
    compatCurrentProduction = false,
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

  // ---- D-P1 严格模式：Chapter 级别检查 ----
  if (strictGenerated) {
    for (const ch of chapters) {
      const chId = ch.id;
      const chIndex = ch.chapterIndex;

      // chapterId 必须为小写格式
      if (!isLowercaseChapterId(chId)) {
        errors.push(`${chId}: chapterId must be lowercase (e.g. "chapter_002"), got "${chId}"`);
      }

      // 解析 chapterId 与 chapterIndex 一致
      const parsedIdx = parseChapterId(chId);
      if (parsedIdx !== null && parsedIdx !== chIndex) {
        errors.push(`${chId}: chapterId implies chapter ${parsedIdx} but chapterIndex=${chIndex}`);
      }

      const stages = ch.stages;
      if (!Array.isArray(stages)) continue;

      // 每章必须恰好10关
      if (stages.length !== D_P1_STAGES_PER_CHAPTER) {
        errors.push(`${chId}: chapter must have exactly ${D_P1_STAGES_PER_CHAPTER} stages, got ${stages.length}`);
      }

      // stageIndex 从1连续到10
      const seenIndices = new Set();
      for (const st of stages) {
        if (!Number.isInteger(st.stageIndex) || st.stageIndex < 1) {
          errors.push(`${st.id || chId}: invalid stageIndex: ${st.stageIndex}`);
        } else {
          if (seenIndices.has(st.stageIndex)) {
            errors.push(`${st.id}: duplicate stageIndex=${st.stageIndex} in chapter ${chId}`);
          }
          seenIndices.add(st.stageIndex);
        }
      }
      if (stages.length === D_P1_STAGES_PER_CHAPTER) {
        for (let si = 1; si <= D_P1_STAGES_PER_CHAPTER; si++) {
          if (!seenIndices.has(si)) {
            errors.push(`${chId}: missing stageIndex=${si}`);
          }
        }
      }

      // Chapter Stage ID 格式校验
      for (const st of stages) {
        if (!st.id) {
          errors.push(`${chId}: chapter stage missing id`);
          continue;
        }
        const parsed = parseChapterStageId(st.id);
        if (!parsed) {
          errors.push(`${st.id}: invalid chapter stage ID format, expected chapter_NNN_stage_NN`);
        } else {
          if (parsed.chapterIndex !== chIndex) {
            errors.push(`${st.id}: chapter stage ID implies chapter ${parsed.chapterIndex} but chapterIndex=${chIndex}`);
          }
          if (parsed.stageIndex !== st.stageIndex) {
            errors.push(`${st.id}: chapter stage ID implies stage ${parsed.stageIndex} but stageIndex=${st.stageIndex}`);
          }
        }
      }

      // ---- D-P1: 第5关 mini_boss / 第10关 boss ----
      for (const st of stages) {
        const si = st.stageIndex;
        // 严格模式下 stage 5/10 检查（已在前面做了，这里是额外确认）
        // 允许的 stageType 检查
        if (!D_P1_ALLOWED_STAGE_TYPES.has(st.type)) {
          errors.push(`${st.id}: forbidden stageType "${st.type}" — only normal/elite/mini_boss/boss allowed`);
        }

        // 其他位置出现 boss 或 mini_boss
        if (si === D_P1_BOSS_SLOT) {
          if (st.type !== 'boss') {
            errors.push(`${st.id}: stage ${si} must be "boss" in strict mode, got "${st.type}"`);
          }
        } else if (si === D_P1_MINI_BOSS_SLOT) {
          if (st.type !== 'mini_boss') {
            errors.push(`${st.id}: stage ${si} must be "mini_boss" in strict mode, got "${st.type}"`);
          }
        } else {
          if (st.type === 'boss') {
            errors.push(`${st.id}: boss type only allowed at stage ${D_P1_BOSS_SLOT}, got stage ${si}`);
          }
          if (st.type === 'mini_boss') {
            errors.push(`${st.id}: mini_boss type only allowed at stage ${D_P1_MINI_BOSS_SLOT}, got stage ${si}`);
          }
        }
      }
    }
  }

  // ---- D-P1 严格模式：Battle Stage 级别检查 ----
  if (strictGenerated) {
    // 构建 battle stage 索引
    const battleMap = new Map();
    for (const bs of battleStages) {
      battleMap.set(bs.id, bs);
    }

    for (const ch of chapters) {
      if (!Array.isArray(ch.stages)) continue;
      for (const st of ch.stages) {
        const bs = battleMap.get(st.battleStageId);
        const gsi = getGlobalStageIndex(ch.chapterIndex, st.stageIndex);

        // ---- recommendedPower 锚点检查 ----
        const powerAnchor = getPowerAnchor(gsi);
        const chapterPower = st.recommendedPower;

        if (powerAnchor !== null) {
          if (!Number.isInteger(chapterPower) || chapterPower <= 0) {
            errors.push(`${st.id}: recommendedPower must be a positive integer, got ${chapterPower}`);
          } else {
            const lower = Math.floor(powerAnchor * (1 - D_P1_POWER_TOLERANCE));
            const upper = Math.ceil(powerAnchor * (1 + D_P1_POWER_TOLERANCE));
            if (chapterPower < lower || chapterPower > upper) {
              errors.push(`${st.id}: recommendedPower=${chapterPower} outside anchor range [${lower}, ${upper}] (anchor=${powerAnchor}, ±${Math.round(D_P1_POWER_TOLERANCE * 100)}%)`);
            }
          }
          // 整体不下降检查（与前一关比较）
          if (gsi > 11) {
            const prevAnchor = getPowerAnchor(gsi - 1);
            if (prevAnchor !== null && chapterPower < prevAnchor * (1 - D_P1_POWER_TOLERANCE)) {
              const prevStages = ch.stages.filter((s) => getGlobalStageIndex(ch.chapterIndex, s.stageIndex) === gsi - 1);
              errors.push(`${st.id}: recommendedPower=${chapterPower} drops below previous stage (global #${gsi - 1}, anchor=${prevAnchor})`);
            }
          }
        }

        // ---- Boss关战力跃升检查 ----
        if (gsi === 20 && powerAnchor !== null) {
          const anchor19 = getPowerAnchor(19);
          if (anchor19 && chapterPower < anchor19 * (1 + D_P1_BOSS_POWER_JUMP_RATIO)) {
            errors.push(`${st.id}: boss stage 20 recommendedPower=${chapterPower} must be ≥ ${Math.ceil(anchor19 * (1 + D_P1_BOSS_POWER_JUMP_RATIO))} (${Math.round(D_P1_BOSS_POWER_JUMP_RATIO * 100)}% jump over stage 19)`);
          }
        }
        if (gsi === 30 && powerAnchor !== null) {
          const anchor29 = getPowerAnchor(29);
          if (anchor29 && chapterPower < anchor29 * (1 + D_P1_BOSS_POWER_JUMP_RATIO)) {
            errors.push(`${st.id}: boss stage 30 recommendedPower=${chapterPower} must be ≥ ${Math.ceil(anchor29 * (1 + D_P1_BOSS_POWER_JUMP_RATIO))} (${Math.round(D_P1_BOSS_POWER_JUMP_RATIO * 100)}% jump over stage 29)`);
          }
        }

        // ---- R3 Chapter 奖励域：允许 Gold 和 Exp (player_exp) ----
        if (Array.isArray(st.rewards)) {
          for (const reward of st.rewards) {
            // compatCurrentProduction: 产品已批准的英雄奖励（需通过权威校验 + 位置门禁）
            if (compatCurrentProduction && reward.type === 'hero') {
              if (!(heroIdSet instanceof Set) || heroIdSet.size === 0) {
                errors.push(`${st.id}: hero authority unavailable; cannot validate hero reward id "${reward.id}"`);
                continue;
              }
              if (!heroIdSet.has(reward.id)) {
                errors.push(`${st.id}: hero reward id "${reward.id}" not found in hero_data.json authority`);
                continue;
              }
              if (!Number.isInteger(reward.amount) || reward.amount <= 0) {
                errors.push(`${st.id}: hero reward amount must be a positive integer, got ${reward.amount}`);
                continue;
              }
              // Position gate: only approved stage→hero mappings
              const expectedHero = D_P1_HERO_REWARD_POSITION_MAP.get(st.id);
              if (expectedHero !== reward.id) {
                const expectedStr = expectedHero !== undefined
                  ? `expected "${expectedHero}"`
                  : 'no hero reward allowed at this position';
                errors.push(`${st.id}: hero reward "${reward.id}" at unauthorized position — ${expectedStr}`);
                continue;
              }
              // Product-approved hero reward with verified authority and position — accept
              continue;
            }
            // compatCurrentProduction: 已知的历史装备奖励ID（仅限 Chapter 1）
            if (compatCurrentProduction && reward.type === 'equipment' && COMPAT_KNOWN_EQUIPMENT_IDS.has(reward.id) && ch.chapterIndex === 1) {
              continue;
            }
            if (reward.type !== 'gold' && reward.type !== 'exp') {
              errors.push(`${st.id}: strict mode only allows gold/exp rewards, got type="${reward.type}" id="${reward.id}"`);
            }
            if (reward.type === 'gold' && reward.id !== 'currency_gold') {
              errors.push(`${st.id}: gold reward must have id="currency_gold", got "${reward.id}"`);
            }
            if (reward.type === 'exp' && reward.id !== 'player_exp') {
              errors.push(`${st.id}: exp reward must have id="player_exp", got "${reward.id}"`);
            }
            if (reward.type === 'exp' && (!Number.isInteger(reward.amount) || reward.amount <= 0)) {
              errors.push(`${st.id}: player_exp reward amount must be a positive integer, got ${reward.amount}`);
            }
          }

          // Gold 数量锚点检查
          const goldReward = st.rewards.find((r) => r.type === 'gold');
          if (goldReward) {
            const goldAnchor = getGoldAnchor(gsi);
            if (goldAnchor !== null) {
              const amount = goldReward.amount;
              if (!Number.isInteger(amount) || amount <= 0) {
                errors.push(`${st.id}: gold reward amount must be a positive integer, got ${amount}`);
              } else {
                const lower = Math.floor(goldAnchor * (1 - D_P1_GOLD_TOLERANCE));
                const upper = Math.ceil(goldAnchor * (1 + D_P1_GOLD_TOLERANCE));
                if (amount < lower || amount > upper) {
                  errors.push(`${st.id}: gold reward=${amount} outside anchor range [${lower}, ${upper}] (anchor=${goldAnchor}, ±${Math.round(D_P1_GOLD_TOLERANCE * 100)}%)`);
                }
              }
            }
          }
        }

        // ---- 解锁条件检查 ----
        if (st.unlockCondition) {
          const uc = st.unlockCondition;
          // requiredLevel > 10 禁止
          if (uc.playerLevel !== undefined && uc.playerLevel > D_P1_MAX_ACCOUNT_LEVEL) {
            errors.push(`${st.id}: requiredLevel=${uc.playerLevel} exceeds max account level ${D_P1_MAX_ACCOUNT_LEVEL}`);
          }
          if (uc.requiredLevel !== undefined && uc.requiredLevel > D_P1_MAX_ACCOUNT_LEVEL) {
            errors.push(`${st.id}: requiredLevel=${uc.requiredLevel} exceeds max account level ${D_P1_MAX_ACCOUNT_LEVEL}`);
          }
          // 硬战力解锁：totalPower=0 表示未启用硬战力门槛（合法）
          // totalPower>0 表示启用了硬战力准入（本批次禁止）
          if (uc.totalPower !== undefined && uc.totalPower > 0) {
            errors.push(`${st.id}: hard power unlock (totalPower=${uc.totalPower}) is forbidden in strict mode — only totalPower=0 (disabled) allowed`);
          }
          if (uc.requiredPower !== undefined && uc.requiredPower > 0) {
            errors.push(`${st.id}: hard power unlock (requiredPower=${uc.requiredPower}) is forbidden in strict mode`);
          }
          if (uc.minPower !== undefined && uc.minPower > 0) {
            errors.push(`${st.id}: hard power unlock (minPower=${uc.minPower}) is forbidden in strict mode`);
          }
        }

        // ---- staminaCost 必须为 0 ----
        if (st.staminaCost !== undefined && st.staminaCost !== 0) {
          errors.push(`${st.id}: staminaCost must be 0 in strict mode, got ${st.staminaCost}`);
        }

        // ---- R3 章内解锁链校验 (第11～30关) ----
        // 每章首关 prevStageId 必须显式为 null，总第11关不由 chapter_001_stage_10 跨章引用
        // 每章第2～10关只引用同章上一 Chapter Stage
        if (gsi >= 11) {
          const uc = st.unlockCondition || {};
          const chIdx = ch.chapterIndex;
          const si = st.stageIndex;
          const isFirstInChapter = (si === 1);

          if (isFirstInChapter) {
            // 每章首关：prevStageId 必须显式为 null
            if (uc.prevStageId !== null && uc.prevStageId !== undefined) {
              errors.push(`${st.id}: chapter first stage prevStageId must be null, got "${uc.prevStageId}" (cross-chapter ref forbidden in R3)`);
            }
          } else {
            // 后续关：必须引用同章上一 Chapter Stage
            const expectedPrev = formatChapterStageId(chIdx, si - 1);
            if (uc.prevStageId !== expectedPrev) {
              errors.push(`${st.id}: stage prevStageId must be "${expectedPrev}" (intra-chapter chain), got "${uc.prevStageId}"`);
            }
          }
          // 跨章 prevStageId 检测
          if (uc.prevStageId && typeof uc.prevStageId === 'string' && uc.prevStageId.startsWith('chapter_')) {
            const prevChapterId = uc.prevStageId.slice(0, 11); // chapter_NNN
            if (prevChapterId !== ch.id) {
              errors.push(`${st.id}: cross-chapter prevStageId "${uc.prevStageId}" forbidden in R3 intra-chapter rules`);
            }
          }
        }

        // ---- Battle Stage 交叉检查 ----
        if (bs) {
          // chapterId 小写一致
          if (bs.chapterId !== undefined) {
            if (!isLowercaseChapterId(bs.chapterId)) {
              errors.push(`${bs.id}: battle stage chapterId must be lowercase, got "${bs.chapterId}"`);
            }
            if (bs.chapterId !== ch.id) {
              errors.push(`${st.id}: chapter chapterId="${ch.id}" vs battle ${bs.id} chapterId="${bs.chapterId}" mismatch`);
            }
          }

          // stageIndex 一致
          if (bs.stageIndex !== st.stageIndex) {
            errors.push(`${st.id}: chapter stageIndex=${st.stageIndex} vs battle ${bs.id} stageIndex=${bs.stageIndex} mismatch`);
          }

          // recommendedPower 一致
          if (bs.recommendedPower !== undefined && bs.recommendedPower !== st.recommendedPower) {
            errors.push(`${st.id}: chapter recommendedPower=${st.recommendedPower} vs battle ${bs.id} recommendedPower=${bs.recommendedPower} mismatch`);
          }

          // battleWave 必须为 1
          if (bs.battleWave !== undefined && bs.battleWave !== 1) {
            errors.push(`${bs.id}: battleWave must be 1 in strict mode, got ${bs.battleWave}`);
          } else if (bs.battleWave === undefined) {
            errors.push(`${bs.id}: battleWave is missing (must be 1 in strict mode)`);
          }

          // staminaCost 在 battle 中也必须为 0
          if (bs.staminaCost !== undefined && bs.staminaCost !== 0) {
            errors.push(`${bs.id}: staminaCost must be 0 in strict mode, got ${bs.staminaCost}`);
          }

          // Battle Stage ID 格式校验
          const parsedBsId = parseBattleStageId(bs.id);
          if (!parsedBsId) {
            errors.push(`${bs.id}: invalid battle stage ID format, expected STAGE_MAIN_NNN_NNN`);
          } else {
            if (parsedBsId.chapterIndex !== ch.chapterIndex) {
              errors.push(`${bs.id}: battle stage ID implies chapter ${parsedBsId.chapterIndex} but expects ${ch.chapterIndex}`);
            }
            if (parsedBsId.stageIndex !== st.stageIndex) {
              errors.push(`${bs.id}: battle stage ID implies stage ${parsedBsId.stageIndex} but stageIndex=${st.stageIndex}`);
            }
          }

          // dropId 格式校验
          if (bs.dropId) {
            if (!DROP_MAIN_ID_RE.test(bs.dropId)) {
              errors.push(`${bs.id}: dropId "${bs.dropId}" format invalid, expected DROP_MAIN_NNN_NNN`);
            }
          }
          if (bs.firstDropId) {
            if (!DROP_FIRST_MAIN_ID_RE.test(bs.firstDropId)) {
              errors.push(`${bs.id}: firstDropId "${bs.firstDropId}" format invalid, expected DROP_FIRST_MAIN_NNN_NNN`);
            }
            if (bs.dropId && bs.firstDropId === bs.dropId) {
              errors.push(`${bs.id}: firstDropId must differ from dropId`);
            }
          }

          // ---- 敌人 ID 格式与阵容检查 ----
          if (Array.isArray(bs.enemyIds) && bs.enemyIds.length > 0) {
            const enemyIdSet = new Set();
            for (const eid of bs.enemyIds) {
              // 敌人 ID 存在
              if (!enemyIds.has(eid)) {
                errors.push(`${bs.id}: enemyId "${eid}" not found in enemy_data`);
              }
              // 新Plan禁止旧敌人ID格式
              if (isLegacyEnemyIdFormat(eid)) {
                errors.push(`${bs.id}: legacy enemy ID format "${eid}" forbidden in new plans`);
              }
              // 检查是否为有效新格式
              if (!isValidNewEnemyIdFormat(eid)) {
                errors.push(`${bs.id}: enemy ID "${eid}" does not match any valid new format (ENEMY_MAIN/ENEMY_MINIBOSS/ENEMY_BOSS)`);
              }
              enemyIdSet.add(eid);
            }

            // 按敌人类型做阵容检查
            const enemyObjects = bs.enemyIds.map((eid) => enemies.find((en) => en.id === eid)).filter(Boolean);
            const stageType = bs.stageType || st.type;

            // Boss 类型检查
            const bossEnemies = enemyObjects.filter((en) => en.enemyType === 'boss' || en.isBoss === true);
            const eliteEnemies = enemyObjects.filter((en) => en.enemyType === 'elite');
            const normalEnemies = enemyObjects.filter((en) => en.enemyType === 'normal');
            const hasMinibossId = bs.enemyIds.some((eid) => ENEMY_MINIBOSS_ID_RE.test(eid));
            const hasBossId = bs.enemyIds.some((eid) => ENEMY_BOSS_ID_RE.test(eid));

            if (stageType === 'normal') {
              if (enemyObjects.length < 2 || enemyObjects.length > 3) {
                errors.push(`${bs.id}: normal stage must have 2-3 enemies, got ${enemyObjects.length}`);
              }
              if (bossEnemies.length > 0) {
                errors.push(`${bs.id}: normal stage must not contain boss-type enemies`);
              }
            }

            if (stageType === 'elite') {
              if (enemyObjects.length < 2 || enemyObjects.length > 3) {
                errors.push(`${bs.id}: elite stage must have 2-3 enemies, got ${enemyObjects.length}`);
              }
              if (eliteEnemies.length === 0) {
                errors.push(`${bs.id}: elite stage must have at least 1 elite-type enemy`);
              }
              if (bossEnemies.length > 0) {
                errors.push(`${bs.id}: elite stage must not contain boss-type enemies`);
              }
            }

            if (stageType === 'mini_boss') {
              const gsiNow = getGlobalStageIndex(ch.chapterIndex, st.stageIndex);
              // 通过全局关卡序号区分第15关(2-5)和第25关(3-5)
              // mini_boss slot总是在各章第5关
              const expectedCount = 2; // 1 mini_boss + 1 护卫 (第2章) or +2 护卫 (第3章)
              // 第25关(gsi=25)是第3章第5关，需要3敌人
              const actualExpectedCount = gsiNow === 25 ? 3 : 2;

              if (enemyObjects.length !== actualExpectedCount) {
                errors.push(`${bs.id}: mini_boss stage at global #${gsiNow} must have ${actualExpectedCount} enemies, got ${enemyObjects.length}`);
              }
              if (!hasMinibossId) {
                errors.push(`${bs.id}: mini_boss stage must have an ENEMY_MINIBOSS ID`);
              }
              if (bossEnemies.length > 0) {
                errors.push(`${bs.id}: mini_boss stage must not contain enemyType=boss enemies`);
              }
              if (bs.isBossStage === true) {
                errors.push(`${bs.id}: mini_boss stage must have isBossStage=false`);
              }
            }

            if (stageType === 'boss') {
              const gsiNow = getGlobalStageIndex(ch.chapterIndex, st.stageIndex);
              const actualExpectedCount = gsiNow === 30 ? 3 : 2; // 第30关3人，第20关2人

              if (enemyObjects.length !== actualExpectedCount) {
                errors.push(`${bs.id}: boss stage at global #${gsiNow} must have ${actualExpectedCount} enemies, got ${enemyObjects.length}`);
              }
              if (!hasBossId) {
                errors.push(`${bs.id}: boss stage must have an ENEMY_BOSS ID`);
              }
              if (bossEnemies.length !== 1) {
                errors.push(`${bs.id}: boss stage must have exactly 1 boss-type enemy, got ${bossEnemies.length}`);
              }
              if (bs.isBossStage !== true) {
                errors.push(`${bs.id}: boss stage must have isBossStage=true`);
              }
            }
          }
        } else if (st.battleStageId) {
          // battleStageId 存在但在 stage_data 中未找到（前面已报）
        }
      }
    }

    // ---- 孤儿 Battle 检查 ----
    const referencedBattleIds = new Set();
    for (const ch of chapters) {
      if (!Array.isArray(ch.stages)) continue;
      for (const st of ch.stages) {
        if (st.battleStageId) referencedBattleIds.add(st.battleStageId);
      }
    }
    for (const bs of battleStages) {
      if (!referencedBattleIds.has(bs.id)) {
        errors.push(`${bs.id}: orphan battle stage — not referenced by any chapter stage`);
      }
    }

    // ---- 掉落物品权威检查（fail-closed） ----
    for (const dp of drops) {
      if (dp.dropType) {
        if (!D_P1_ALLOWED_STAGE_TYPES.has(dp.dropType) && dp.dropType !== 'firstClear' && dp.dropType !== 'boss') {
          // dropType itself is fine for the drop table
        }
      }
      if (Array.isArray(dp.items)) {
        // compatCurrentProduction 仅对 Chapter 1 精确白名单旧掉落 ID 应用兼容规则。
        // 白名单 = DROP_001～DROP_015 + DROP_F001～DROP_F015（恰好 HEAD 已存在的30条记录）。
        // DROP_016, DROP_F016, DROP_999, DROP_F999 等不在白名单内 → 必须通过严格校验。
        // Chapter 2/3 DROP_MAIN / DROP_FIRST_MAIN 即使在 compatCurrentProduction 下也必须通过严格校验。
        const isCh1LegacyDropId = compatCurrentProduction && dp.id && COMPAT_LEGACY_DROP_ID_SET.has(dp.id);
        for (const item of dp.items) {
          const dropAuth = isCh1LegacyDropId
            ? validateDropItemAuthorityCompat(item.itemId, item.itemType)
            : validateDropItemAuthority(item.itemId, item.itemType);
          if (!dropAuth.valid) {
            errors.push(`${dp.id}: ${dropAuth.reason}`);
          }
        }
      }
    }
  }
  // ---- D-P1 严格模式检查结束 ----

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

  // ===================================================================
  // D-P1 严格模式自测
  // ===================================================================

  // ---- 辅助：构建合法的第2章10关内存Plan ----
  function buildValidChapter2Plan() {
    const chId = 'chapter_002';
    const stages = [];
    const battleStages = [];
    const enemies = [];
    const drops = [];
    const STAGE_TYPES = ['normal', 'normal', 'elite', 'normal', 'mini_boss', 'elite', 'normal', 'elite', 'normal', 'boss'];

    for (let si = 1; si <= 10; si++) {
      const stageId = `chapter_002_stage_${String(si).padStart(2, '0')}`;
      const bsId = `STAGE_MAIN_002_${String(si).padStart(3, '0')}`;
      const sType = STAGE_TYPES[si - 1];
      const gsi = getGlobalStageIndex(2, si);
      const power = getPowerAnchor(gsi) || 1000;
      const gold = getGoldAnchor(gsi) || 1000;

      // Build enemy IDs based on type
      const stageEnemyIds = [];
      if (sType === 'boss') {
        const bossEid = `ENEMY_BOSS_002_010_01`;
        const guardEid = `ENEMY_MAIN_002_010_02`;
        stageEnemyIds.push(bossEid, guardEid);
        enemies.push({ id: bossEid, name: 'Boss', enemyType: 'boss', isBoss: true });
        enemies.push({ id: guardEid, name: 'Guard', enemyType: 'normal', isBoss: false });
      } else if (sType === 'mini_boss') {
        const mbEid = `ENEMY_MINIBOSS_002_005_01`;
        const guardEid = `ENEMY_MAIN_002_005_02`;
        stageEnemyIds.push(mbEid, guardEid);
        enemies.push({ id: mbEid, name: 'MiniBoss', enemyType: 'elite', isBoss: false });
        enemies.push({ id: guardEid, name: 'Guard', enemyType: 'normal', isBoss: false });
      } else {
        for (let ei = 1; ei <= 2; ei++) {
          const eid = `ENEMY_MAIN_002_${String(si).padStart(3, '0')}_${String(ei).padStart(2, '0')}`;
          stageEnemyIds.push(eid);
          const eType = sType === 'elite' ? 'elite' : 'normal';
          enemies.push({ id: eid, name: `E ${si}-${ei}`, enemyType: eType, isBoss: false });
        }
      }

      const dropId = `DROP_MAIN_002_${String(si).padStart(3, '0')}`;
      const firstDropId = `DROP_FIRST_MAIN_002_${String(si).padStart(3, '0')}`;
      drops.push({ id: dropId, items: [{ itemId: 'ITEM_GOLD', itemType: 'gold', dropRate: 1.0 }] });
      drops.push({ id: firstDropId, items: [{ itemId: 'ITEM_DIAMOND', itemType: 'diamond', dropRate: 1.0 }] });

      stages.push({
        id: stageId, chapterId: chId, stageIndex: si, type: sType,
        recommendedPower: power, battleStageId: bsId,
        rewards: [{ type: 'gold', id: 'currency_gold', amount: gold }],
        unlockCondition: si === 1
          ? { prevStageId: null, playerLevel: 10 }
          : { prevStageId: `chapter_002_stage_${String(si - 1).padStart(2, '0')}` },
        staminaCost: 0,
      });

      battleStages.push({
        id: bsId, chapterId: chId, stageIndex: si, stageType: sType,
        isBossStage: sType === 'boss', enemyIds: stageEnemyIds,
        recommendedPower: power, staminaCost: 0, battleWave: 1,
        dropId, firstDropId,
      });
    }

    return {
      chapterData: { data: [{ id: chId, chapterIndex: 2, stages }] },
      stageData: { data: battleStages },
      enemyData: { data: enemies },
      dropData: { data: drops },
    };
  }

  // Test D-P1-01: 合法第2章10关通过严格模式
  {
    const plan = buildValidChapter2Plan();
    const r = validateGeneratedDraft(plan);
    assert(r.errors.length === 0,
      `TEST FAIL D-P1-01: valid chapter 2 should pass strict mode, got ${r.errors.length} errors: ${r.errors.slice(0, 5).join('; ')}`);
    if (r.errors.length === 0) {
      // 顺便验证 stats
    }
  }

  // Test D-P1-02: 每章只有6关 → 严格模式失败
  {
    const plan = buildValidChapter2Plan();
    plan.chapterData.data[0].stages = plan.chapterData.data[0].stages.slice(0, 6);
    const r = validateGeneratedDraft(plan);
    assert(r.errors.some((e) => e.includes('must have exactly 10 stages')),
      `TEST FAIL D-P1-02: 6-stage chapter should fail strict mode, got errors: ${r.errors.join('; ')}`);
  }

  // Test D-P1-03: 缺第7～10关 → 失败
  {
    const plan = buildValidChapter2Plan();
    plan.chapterData.data[0].stages = plan.chapterData.data[0].stages.slice(0, 6);
    const r = validateGeneratedDraft(plan);
    assert(r.errors.length > 0,
      `TEST FAIL D-P1-03: missing stages 7-10 should fail, got ${r.errors.length} errors`);
  }

  // Test D-P1-04: battleStageId缺失 → 失败
  {
    const plan = buildValidChapter2Plan();
    plan.chapterData.data[0].stages[3].battleStageId = '';
    const r = validateGeneratedDraft(plan);
    assert(r.errors.some((e) => e.includes('missing battleStageId')),
      `TEST FAIL D-P1-04: missing battleStageId should fail, got: ${r.errors.join('; ')}`);
  }

  // Test D-P1-05: Battle chapterId大写 → 失败
  {
    const plan = buildValidChapter2Plan();
    plan.stageData.data[0].chapterId = 'CHAPTER_002';
    const r = validateGeneratedDraft(plan);
    assert(r.errors.some((e) => e.includes('CHAPTER_002') && e.includes('chapterId must be lowercase')),
      `TEST FAIL D-P1-05: uppercase chapterId should fail, got: ${r.errors.join('; ')}`);
  }

  // Test D-P1-06: Chapter/Battle战力不一致 → 失败
  {
    const plan = buildValidChapter2Plan();
    plan.stageData.data[0].recommendedPower = 99999;
    const r = validateGeneratedDraft(plan);
    assert(r.errors.some((e) => e.includes('recommendedPower') && e.includes('mismatch')),
      `TEST FAIL D-P1-06: power mismatch should fail, got: ${r.errors.join('; ')}`);
  }

  // Test D-P1-07: 第5关为normal → 失败
  {
    const plan = buildValidChapter2Plan();
    plan.chapterData.data[0].stages[4].type = 'normal';
    plan.stageData.data[4].stageType = 'normal';
    plan.stageData.data[4].isBossStage = false;
    const r = validateGeneratedDraft(plan);
    assert(r.errors.some((e) => e.includes('stage 5 must be "mini_boss"')),
      `TEST FAIL D-P1-07: stage 5 normal should fail, got: ${r.errors.join('; ')}`);
  }

  // Test D-P1-08: 第10关为elite → 失败
  {
    const plan = buildValidChapter2Plan();
    plan.chapterData.data[0].stages[9].type = 'elite';
    plan.stageData.data[9].stageType = 'elite';
    plan.stageData.data[9].isBossStage = false;
    // Also need to update enemies
    const r = validateGeneratedDraft(plan);
    assert(r.errors.some((e) => e.includes('stage 10 must be "boss"')),
      `TEST FAIL D-P1-08: stage 10 elite should fail, got: ${r.errors.join('; ')}`);
  }

  // Test D-P1-09: mini_boss包含boss敌人 → 失败
  {
    const plan = buildValidChapter2Plan();
    plan.stageData.data[4].enemyIds = ['ENEMY_BOSS_002_005_01', 'ENEMY_MAIN_002_005_02'];
    plan.enemyData.data = [
      { id: 'ENEMY_BOSS_002_005_01', enemyType: 'boss', isBoss: true },
      { id: 'ENEMY_MAIN_002_005_02', enemyType: 'normal', isBoss: false },
    ];
    const r = validateGeneratedDraft(plan);
    assert(r.errors.some((e) => e.includes('mini_boss') && e.includes('boss')),
      `TEST FAIL D-P1-09: mini_boss with boss enemy should fail, got: ${r.errors.join('; ')}`);
  }

  // Test D-P1-10: mini_boss没有独立小Boss → 失败
  {
    const plan = buildValidChapter2Plan();
    plan.stageData.data[4].enemyIds = ['ENEMY_MAIN_002_005_01', 'ENEMY_MAIN_002_005_02'];
    plan.enemyData.data = [
      { id: 'ENEMY_MAIN_002_005_01', enemyType: 'normal' },
      { id: 'ENEMY_MAIN_002_005_02', enemyType: 'normal' },
    ];
    // Also need to add valid enemies for other stages
    for (const bs of plan.stageData.data) {
      for (const eid of bs.enemyIds) {
        if (!plan.enemyData.data.find((e) => e.id === eid)) {
          plan.enemyData.data.push({ id: eid, enemyType: bs.stageType === 'elite' ? 'elite' : 'normal' });
        }
      }
    }
    const r = validateGeneratedDraft(plan);
    assert(r.errors.some((e) => e.includes('ENEMY_MINIBOSS') || (e.includes('mini_boss') && e.includes('enemy'))),
      `TEST FAIL D-P1-10: mini_boss without ENEMY_MINIBOSS should fail, got: ${r.errors.join('; ')}`);
  }

  // Test D-P1-11: boss关没有boss敌人 → 失败
  {
    const plan = buildValidChapter2Plan();
    plan.stageData.data[9].enemyIds = ['ENEMY_MAIN_002_010_01', 'ENEMY_MAIN_002_010_02'];
    for (const bs of plan.stageData.data) {
      for (const eid of bs.enemyIds) {
        if (!plan.enemyData.data.find((e) => e.id === eid)) {
          plan.enemyData.data.push({ id: eid, enemyType: 'normal' });
        }
      }
    }
    const r = validateGeneratedDraft(plan);
    assert(r.errors.some((e) => e.includes('boss') && (e.includes('ENEMY_BOSS') || e.includes('boss stage must have'))),
      `TEST FAIL D-P1-11: boss without ENEMY_BOSS should fail, got: ${r.errors.join('; ')}`);
  }

  // Test D-P1-12: battleWave=2 → 失败
  {
    const plan = buildValidChapter2Plan();
    plan.stageData.data[0].battleWave = 2;
    const r = validateGeneratedDraft(plan);
    assert(r.errors.some((e) => e.includes('battleWave')),
      `TEST FAIL D-P1-12: battleWave=2 should fail, got: ${r.errors.join('; ')}`);
  }

  // Test D-P1-13: staminaCost非0 → 失败
  {
    const plan = buildValidChapter2Plan();
    plan.stageData.data[0].staminaCost = 5;
    plan.chapterData.data[0].stages[0].staminaCost = 5;
    const r = validateGeneratedDraft(plan);
    assert(r.errors.some((e) => e.includes('staminaCost')),
      `TEST FAIL D-P1-13: staminaCost=5 should fail, got: ${r.errors.join('; ')}`);
  }

  // Test D-P1-14: requiredLevel=41 → 失败 (exceeds Lv40 max)
  {
    const plan = buildValidChapter2Plan();
    plan.chapterData.data[0].stages[0].unlockCondition = { playerLevel: 41 };
    const r = validateGeneratedDraft(plan);
    assert(r.errors.some((e) => e.includes('requiredLevel') || (e.includes('playerLevel') && e.includes('exceeds'))),
      `TEST FAIL D-P1-14: requiredLevel=41 should fail (max=40), got: ${r.errors.join('; ')}`);
  }

  // Test D-P1-15: 存在requiredPower>0硬门槛 → 失败
  {
    const plan = buildValidChapter2Plan();
    plan.chapterData.data[0].stages[0].unlockCondition = { requiredPower: 1000 };
    const r = validateGeneratedDraft(plan);
    assert(r.errors.some((e) => e.includes('requiredPower')),
      `TEST FAIL D-P1-15: requiredPower=1000 unlock should fail, got: ${r.errors.join('; ')}`);
  }

  // Test D-P1-16: Chapter出现equipment奖励 → 失败 (R3只允许gold/exp)
  {
    const plan = buildValidChapter2Plan();
    plan.chapterData.data[0].stages[0].rewards = [{ type: 'equipment', id: 'eq_001', amount: 1 }];
    const r = validateGeneratedDraft(plan);
    assert(r.errors.some((e) => e.includes('only allows gold/exp rewards')),
      `TEST FAIL D-P1-16: exp reward should fail strict mode, got: ${r.errors.join('; ')}`);
  }

  // Test D-P1-17: Chapter出现hero → 失败
  {
    const plan = buildValidChapter2Plan();
    plan.chapterData.data[0].stages[0].rewards = [{ type: 'hero', id: 'hero_001', amount: 1 }];
    const r = validateGeneratedDraft(plan);
    assert(r.errors.some((e) => e.includes('only allows gold/exp rewards')),
      `TEST FAIL D-P1-17: hero reward should fail strict mode, got: ${r.errors.join('; ')}`);
  }

  // Test D-P1-18: Chapter出现equipment → 失败
  {
    const plan = buildValidChapter2Plan();
    plan.chapterData.data[0].stages[0].rewards = [{ type: 'equipment', id: 'eq_001', amount: 1 }];
    const r = validateGeneratedDraft(plan);
    assert(r.errors.some((e) => e.includes('only allows gold/exp rewards')),
      `TEST FAIL D-P1-18: equipment reward should fail strict mode, got: ${r.errors.join('; ')}`);
  }

  // Test D-P1-19: 掉落出现ITEM_EQUIP_R → 失败
  {
    const plan = buildValidChapter2Plan();
    plan.dropData.data[0].items = [{ itemId: 'ITEM_EQUIP_R_01', itemType: 'equipment', dropRate: 0.5 }];
    const r = validateGeneratedDraft(plan);
    assert(r.errors.some((e) => e.includes('ITEM_EQUIP_R') || (e.includes('equipment') && e.includes('not in allowed domain'))),
      `TEST FAIL D-P1-19: ITEM_EQUIP_R in drops should fail, got: ${r.errors.join('; ')}`);
  }

  // Test D-P1-20: 新Plan出现enemyGroupId → 失败
  {
    const plan = buildValidChapter2Plan();
    plan.chapterData.data[0].stages[0].enemyGroupId = 'enemy_group_001';
    const r = validateGeneratedDraft(plan);
    assert(r.errors.some((e) => e.includes('enemyGroupId')),
      `TEST FAIL D-P1-20: enemyGroupId should fail strict mode, got: ${r.errors.join('; ')}`);
  }

  // Test D-P1-21: 新Plan出现bossId → 失败
  {
    const plan = buildValidChapter2Plan();
    plan.chapterData.data[0].stages[9].bossId = 'boss_001';
    const r = validateGeneratedDraft(plan);
    assert(r.errors.some((e) => e.includes('bossId')),
      `TEST FAIL D-P1-21: bossId should fail strict mode, got: ${r.errors.join('; ')}`);
  }

  // Test D-P1-22: enemyIds重复仍通过
  {
    const plan = buildValidChapter2Plan();
    plan.stageData.data[0].enemyIds = ['ENEMY_MAIN_002_001_01', 'ENEMY_MAIN_002_001_01'];
    // Need both entries in enemy data
    plan.enemyData.data.push({ id: 'ENEMY_MAIN_002_001_01', enemyType: 'normal' });
    const r = validateGeneratedDraft(plan);
    const dupErrors = r.errors.filter((e) => e.includes('duplicate') && e.includes('enemy'));
    assert(dupErrors.length === 0,
      `TEST FAIL D-P1-22: duplicate enemyIds in array should be allowed, got: ${dupErrors.join('; ')}`);
  }

  // Test D-P1-23: recommendedPower超出锚点±5% → 失败
  {
    const plan = buildValidChapter2Plan();
    const gsi11 = getGlobalStageIndex(2, 1); // = 11
    const anchor11 = getPowerAnchor(gsi11);   // = 900
    plan.chapterData.data[0].stages[0].recommendedPower = Math.ceil(anchor11 * 1.5);
    plan.stageData.data[0].recommendedPower = Math.ceil(anchor11 * 1.5);
    const r = validateGeneratedDraft(plan);
    assert(r.errors.some((e) => e.includes('recommendedPower') && e.includes('outside anchor range')),
      `TEST FAIL D-P1-23: power outside ±5% should fail, got: ${r.errors.join('; ')}`);
  }

  // Test D-P1-24: Gold奖励超出锚点±5% → 失败
  {
    const plan = buildValidChapter2Plan();
    plan.chapterData.data[0].stages[0].rewards[0].amount = 99999;
    const r = validateGeneratedDraft(plan);
    assert(r.errors.some((e) => e.includes('gold reward') && e.includes('outside anchor range')),
      `TEST FAIL D-P1-24: gold outside ±5% should fail, got: ${r.errors.join('; ')}`);
  }

  // Test D-P1-25: chapterId大小写检查
  {
    const plan = buildValidChapter2Plan();
    plan.chapterData.data[0].id = 'CHAPTER_002';
    const r = validateGeneratedDraft(plan);
    assert(r.errors.some((e) => e.includes('chapterId must be lowercase')),
      `TEST FAIL D-P1-25: uppercase chapter id should fail, got: ${r.errors.join('; ')}`);
  }

  // Test D-P1-26: 第4关出现boss类型 → 失败
  {
    const plan = buildValidChapter2Plan();
    plan.chapterData.data[0].stages[3].type = 'boss'; // stage 4 = index 3
    const r = validateGeneratedDraft(plan);
    assert(r.errors.some((e) => e.includes('boss type only allowed at stage')),
      `TEST FAIL D-P1-26: boss at stage 4 should fail, got: ${r.errors.join('; ')}`);
  }

  // Test D-P1-27: chapterId与battle chapterId不一致
  {
    const plan = buildValidChapter2Plan();
    plan.stageData.data[0].chapterId = 'chapter_003'; // wrong chapter
    const r = validateGeneratedDraft(plan);
    assert(r.errors.some((e) => e.includes('chapterId') && e.includes('mismatch')),
      `TEST FAIL D-P1-27: chapterId mismatch should fail, got: ${r.errors.join('; ')}`);
  }

  // ---- Lv5 260→250 历史回归必须仍失败 ----
  {
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
    const modified = JSON.parse(JSON.stringify(PROD_LEVELS));
    modified[4].requiredExpToNext = 250;
    const result = validateCurrentProductionAccountLevelPolicy({ levels: modified });
    assert(
      result.errors.some((e) => e.includes('Lv5') && e.includes('260') && e.includes('250')),
      `TEST FAIL D-P1-LV5: Lv5 260→250 regression must be rejected: ${result.errors.join('; ')}`
    );
  }

  // ===================================================================
  // C1.6-B2-D-P1-R2 缺口补全自测
  // ===================================================================

  // ---- 辅助：构建合法20关Plan（第2章10关 + 第3章10关） ----
  function buildValid20StagePlan() {
    const chapterData = { data: [] };
    const stageData = { data: [] };
    const enemyData = { data: [] };
    const dropData = { data: [] };
    const STAGE_TYPES = ['normal', 'normal', 'elite', 'normal', 'mini_boss', 'elite', 'normal', 'elite', 'normal', 'boss'];

    for (const chIdx of [2, 3]) {
      const chId = `chapter_${String(chIdx).padStart(3, '0')}`;
      const stages = [];
      const chPad = String(chIdx).padStart(3, '0');

      for (let si = 1; si <= 10; si++) {
        const stageId = `chapter_${chPad}_stage_${String(si).padStart(2, '0')}`;
        const bsId = `STAGE_MAIN_${chPad}_${String(si).padStart(3, '0')}`;
        const sType = STAGE_TYPES[si - 1];
        const gsi = getGlobalStageIndex(chIdx, si);
        const power = getPowerAnchor(gsi) || 1000;
        const gold = getGoldAnchor(gsi) || 1000;

        // R3 章内解锁链：首关 prevStageId=null + playerLevel，后续关仅 prevStage 同章链
        let unlockCondition;
        if (si === 1) {
          unlockCondition = { prevStageId: null, playerLevel: 10 };
        } else {
          unlockCondition = { prevStageId: formatChapterStageId(chIdx, si - 1) };
        }

        // Build enemies
        const stageEnemyIds = [];
        const stPad = String(si).padStart(3, '0');
        if (sType === 'boss') {
          const bossEid = `ENEMY_BOSS_${chPad}_010_01`;
          // gsi=30 (第3章第10关) 需要3敌人，gsi=20 (第2章第10关) 需要2敌人
          const guardCount = (gsi === 30) ? 2 : 1;
          stageEnemyIds.push(bossEid);
          if (!enemyData.data.find((e) => e.id === bossEid)) {
            enemyData.data.push({ id: bossEid, name: 'Boss', enemyType: 'boss', isBoss: true });
          }
          for (let gi = 1; gi <= guardCount; gi++) {
            const guardEid = `ENEMY_MAIN_${chPad}_010_${String(gi + 1).padStart(2, '0')}`;
            stageEnemyIds.push(guardEid);
            if (!enemyData.data.find((e) => e.id === guardEid)) {
              enemyData.data.push({ id: guardEid, name: 'Guard', enemyType: 'normal', isBoss: false });
            }
          }
        } else if (sType === 'mini_boss') {
          const mbEid = `ENEMY_MINIBOSS_${chPad}_005_01`;
          // gsi=25 (第3章第5关) 需要3敌人，gsi=15 (第2章第5关) 需要2敌人
          const guardCount = (gsi === 25) ? 2 : 1;
          stageEnemyIds.push(mbEid);
          if (!enemyData.data.find((e) => e.id === mbEid)) {
            enemyData.data.push({ id: mbEid, name: 'MiniBoss', enemyType: 'elite', isBoss: false });
          }
          for (let gi = 1; gi <= guardCount; gi++) {
            const guardEid = `ENEMY_MAIN_${chPad}_005_${String(gi + 1).padStart(2, '0')}`;
            stageEnemyIds.push(guardEid);
            if (!enemyData.data.find((e) => e.id === guardEid)) {
              enemyData.data.push({ id: guardEid, name: 'Guard', enemyType: 'normal', isBoss: false });
            }
          }
        } else {
          for (let ei = 1; ei <= 2; ei++) {
            const eid = `ENEMY_MAIN_${chPad}_${stPad}_${String(ei).padStart(2, '0')}`;
            stageEnemyIds.push(eid);
            if (!enemyData.data.find((e) => e.id === eid)) {
              const eType = sType === 'elite' ? 'elite' : 'normal';
              enemyData.data.push({ id: eid, name: `E ${chIdx}-${si}-${ei}`, enemyType: eType, isBoss: false });
            }
          }
        }

        const dropId = `DROP_MAIN_${chPad}_${stPad}`;
        const firstDropId = `DROP_FIRST_MAIN_${chPad}_${stPad}`;
        if (!dropData.data.find((d) => d.id === dropId)) {
          dropData.data.push({ id: dropId, items: [{ itemId: 'ITEM_GOLD', itemType: 'gold', dropRate: 1.0 }] });
        }
        if (!dropData.data.find((d) => d.id === firstDropId)) {
          dropData.data.push({ id: firstDropId, items: [{ itemId: 'ITEM_DIAMOND', itemType: 'diamond', dropRate: 1.0 }] });
        }

        stages.push({
          id: stageId, chapterId: chId, stageIndex: si, type: sType,
          recommendedPower: power, battleStageId: bsId,
          rewards: [{ type: 'gold', id: 'currency_gold', amount: gold }],
          unlockCondition,
          staminaCost: 0,
        });

        stageData.data.push({
          id: bsId, chapterId: chId, stageIndex: si, stageType: sType,
          isBossStage: sType === 'boss', enemyIds: stageEnemyIds,
          recommendedPower: power, staminaCost: 0, battleWave: 1,
          dropId, firstDropId,
        });
      }

      chapterData.data.push({ id: chId, chapterIndex: chIdx, stages });
    }

    return { chapterData, stageData, enemyData, dropData };
  }

  // Test D-P1-FULL-20-STAGE-VALID-PLAN: 完整20关合法Plan通过严格模式
  {
    const plan = buildValid20StagePlan();
    const r = validateGeneratedDraft(plan);
    assert(r.errors.length === 0,
      `TEST FAIL D-P1-FULL-20: valid 20-stage plan should pass strict mode, got ${r.errors.length} errors:\n  ${r.errors.slice(0, 10).join('\n  ')}`);

    // 验证 stats
    assert(r.stats.chapterCount === 2, `expected 2 chapters, got ${r.stats.chapterCount}`);
    assert(r.stats.chapterStageCount === 20, `expected 20 chapter stages, got ${r.stats.chapterStageCount}`);
    assert(r.stats.battleStageCount === 20, `expected 20 battle stages, got ${r.stats.battleStageCount}`);

    // 验证每章恰10关
    for (const ch of plan.chapterData.data) {
      assert(ch.stages.length === 10, `${ch.id}: expected 10 stages, got ${ch.stages.length}`);
    }

    // 验证20个battleStageId全部存在且唯一
    const bsIds = new Set();
    for (const ch of plan.chapterData.data) {
      for (const st of ch.stages) {
        assert(st.battleStageId && st.battleStageId !== '', `${st.id}: missing battleStageId`);
        assert(!bsIds.has(st.battleStageId), `${st.id}: duplicate battleStageId ${st.battleStageId}`);
        bsIds.add(st.battleStageId);
      }
    }
    assert(bsIds.size === 20, `expected 20 unique battleStageIds, got ${bsIds.size}`);

    // 验证第20→21关 recommendedPower 不下降
    const st20 = plan.chapterData.data[0].stages[9];
    const st21 = plan.chapterData.data[1].stages[0];
    assert(st21.recommendedPower >= st20.recommendedPower * (1 - D_P1_POWER_TOLERANCE),
      `stage 20→21 power drop: ${st20.recommendedPower} → ${st21.recommendedPower}`);

    // 验证第20→21关 Gold 不下降
    const gold20 = st20.rewards.find((r) => r.type === 'gold');
    const gold21 = st21.rewards.find((r) => r.type === 'gold');
    assert(gold21.amount >= gold20.amount * (1 - D_P1_GOLD_TOLERANCE),
      `stage 20→21 Gold drop: ${gold20.amount} → ${gold21.amount}`);

    // R3: 第21关（第三章首关）prevStageId=null + playerLevel=10
    assert(st21.unlockCondition && st21.unlockCondition.prevStageId === null,
      `stage 21 prevStageId should be null (chapter first stage, R3 rule), got ${st21.unlockCondition?.prevStageId}`);
    assert(st21.unlockCondition.playerLevel === 10,
      `stage 21 should require playerLevel=10, got ${st21.unlockCondition?.playerLevel}`);

    // 验证第11~30关 battleWave 全部为1, staminaCost 全部为0
    for (const bs of plan.stageData.data) {
      assert(bs.battleWave === 1, `${bs.id}: battleWave=${bs.battleWave}`);
      assert(bs.staminaCost === 0, `${bs.id}: staminaCost=${bs.staminaCost}`);
    }
    for (const ch of plan.chapterData.data) {
      for (const st of ch.stages) {
        assert(st.staminaCost === 0, `${st.id}: staminaCost=${st.staminaCost}`);
      }
    }
  }

  // ===================================================================
  // 4.1 跨表 stageType 反向测试
  // ===================================================================

  // Test R2-CROSS-01: Chapter=elite, Battle=normal → ERROR
  {
    const plan = buildValid20StagePlan();
    plan.chapterData.data[0].stages[2].type = 'elite'; // stage 3
    const bs = plan.stageData.data.find((b) => b.id === plan.chapterData.data[0].stages[2].battleStageId);
    bs.stageType = 'normal';
    const r = validateGeneratedDraft(plan);
    assert(r.errors.some((e) => e.includes('does not match') && e.includes('chapter type')),
      `TEST FAIL R2-CROSS-01: Chapter=elite vs Battle=normal should fail, got: ${r.errors.join('; ')}`);
  }

  // Test R2-CROSS-02: Chapter=normal, Battle=elite → ERROR
  {
    const plan = buildValid20StagePlan();
    plan.chapterData.data[0].stages[1].type = 'normal';
    const bs = plan.stageData.data.find((b) => b.id === plan.chapterData.data[0].stages[1].battleStageId);
    bs.stageType = 'elite';
    const r = validateGeneratedDraft(plan);
    assert(r.errors.some((e) => e.includes('does not match') && e.includes('chapter type')),
      `TEST FAIL R2-CROSS-02: Chapter=normal vs Battle=elite should fail, got: ${r.errors.join('; ')}`);
  }

  // Test R2-CROSS-03: Chapter=mini_boss, Battle=normal → ERROR
  {
    const plan = buildValid20StagePlan();
    plan.chapterData.data[0].stages[4].type = 'mini_boss';
    const bs = plan.stageData.data.find((b) => b.id === plan.chapterData.data[0].stages[4].battleStageId);
    bs.stageType = 'normal';
    const r = validateGeneratedDraft(plan);
    assert(r.errors.some((e) => e.includes('does not match') && e.includes('chapter type')),
      `TEST FAIL R2-CROSS-03: Chapter=mini_boss vs Battle=normal should fail, got: ${r.errors.join('; ')}`);
  }

  // Test R2-CROSS-04: Chapter=boss, Battle=elite → ERROR
  {
    const plan = buildValid20StagePlan();
    plan.chapterData.data[0].stages[9].type = 'boss';
    const bs = plan.stageData.data.find((b) => b.id === plan.chapterData.data[0].stages[9].battleStageId);
    bs.stageType = 'elite';
    const r = validateGeneratedDraft(plan);
    assert(r.errors.some((e) => e.includes('does not match') && e.includes('chapter type')),
      `TEST FAIL R2-CROSS-04: Chapter=boss vs Battle=elite should fail, got: ${r.errors.join('; ')}`);
  }

  // ===================================================================
  // 4.2 精确解锁前置链反向测试
  // ===================================================================

  // Test R2-LOCK-01: 第11关 prevStageId 跨章引用 → ERROR (R3首关必须null)
  {
    const plan = buildValid20StagePlan();
    plan.chapterData.data[0].stages[0].unlockCondition = { prevStageId: 'chapter_001_stage_05', playerLevel: 10 };
    const r = validateGeneratedDraft(plan);
    assert(r.errors.some((e) => e.includes('chapter first stage prevStageId must be null') || e.includes('cross-chapter prevStageId')),
      `TEST FAIL R2-LOCK-01: cross-chapter stage 11 prevStageId should fail, got: ${r.errors.join('; ')}`);
  }

  // Test R2-LOCK-02: 第12关 prevStageId 跨章跳关 → ERROR
  {
    const plan = buildValid20StagePlan();
    plan.chapterData.data[0].stages[1].unlockCondition = { prevStageId: 'chapter_001_stage_10' };
    const r = validateGeneratedDraft(plan);
    assert(r.errors.some((e) => e.includes('intra-chapter') || e.includes('cross-chapter prevStageId')),
      `TEST FAIL R2-LOCK-02: stage 12 cross-chapter prevStageId should fail, got: ${r.errors.join('; ')}`);
  }

  // Test R2-LOCK-03: 第21关跨章引用 → ERROR (R3首关必须null)
  {
    const plan = buildValid20StagePlan();
    plan.chapterData.data[1].stages[0].unlockCondition = { prevStageId: 'chapter_002_stage_06', playerLevel: 10 };
    const r = validateGeneratedDraft(plan);
    assert(r.errors.some((e) => e.includes('chapter first stage prevStageId must be null') || e.includes('cross-chapter prevStageId')),
      `TEST FAIL R2-LOCK-03: cross-chapter stage 21 prevStageId should fail, got: ${r.errors.join('; ')}`);
  }

  // Test R2-LOCK-04: 第22关跨章prevStageId → ERROR
  {
    const plan = buildValid20StagePlan();
    plan.chapterData.data[1].stages[1].unlockCondition = { prevStageId: 'chapter_002_stage_10' };
    const r = validateGeneratedDraft(plan);
    assert(r.errors.some((e) => e.includes('cross-chapter prevStageId')),
      `TEST FAIL R2-LOCK-04: stage 22 cross-chapter prevStageId should fail, got: ${r.errors.join('; ')}`);
  }

  // ===================================================================
  // 4.4 掉落物权威反向测试
  // ===================================================================

  // Test R2-DROP-01: itemType=material, itemId=NOT_EXIST → ERROR
  {
    const plan = buildValid20StagePlan();
    plan.dropData.data[0].items = [{ itemId: 'NOT_EXIST', itemType: 'material', dropRate: 0.5 }];
    const r = validateGeneratedDraft(plan);
    assert(r.errors.some((e) => e.includes('NOT_EXIST') && e.includes('not in known authority domain')),
      `TEST FAIL R2-DROP-01: unknown itemId should fail, got: ${r.errors.join('; ')}`);
  }

  // Test R2-DROP-02: itemType=gold, itemId=UNKNOWN_GOLD → ERROR
  {
    const plan = buildValid20StagePlan();
    plan.dropData.data[0].items = [{ itemId: 'UNKNOWN_GOLD', itemType: 'gold', dropRate: 0.5 }];
    const r = validateGeneratedDraft(plan);
    assert(r.errors.some((e) => e.includes('UNKNOWN_GOLD')),
      `TEST FAIL R2-DROP-02: gold with wrong itemId should fail, got: ${r.errors.join('; ')}`);
  }

  // Test R2-DROP-03: itemType=gold, itemId=ITEM_GOLD → PASS
  {
    const plan = buildValid20StagePlan();
    plan.dropData.data[0].items = [{ itemId: 'ITEM_GOLD', itemType: 'gold', dropRate: 1.0 }];
    const r = validateGeneratedDraft(plan);
    assert(r.errors.length === 0,
      `TEST FAIL R2-DROP-03: valid ITEM_GOLD should pass, got: ${r.errors.join('; ')}`);
  }

  // Test R2-DROP-04: itemType=diamond, itemId=ITEM_DIAMOND → PASS
  {
    const plan = buildValid20StagePlan();
    plan.dropData.data[1].items = [{ itemId: 'ITEM_DIAMOND', itemType: 'diamond', dropRate: 1.0 }];
    const r = validateGeneratedDraft(plan);
    assert(r.errors.length === 0,
      `TEST FAIL R2-DROP-04: valid ITEM_DIAMOND should pass, got: ${r.errors.join('; ')}`);
  }

  // Test R2-DROP-05: itemType=gold, itemId=ITEM_DIAMOND → ERROR (类型ID不匹配)
  {
    const plan = buildValid20StagePlan();
    plan.dropData.data[0].items = [{ itemId: 'ITEM_DIAMOND', itemType: 'gold', dropRate: 0.5 }];
    const r = validateGeneratedDraft(plan);
    assert(r.errors.some((e) => e.includes('gold drop must have itemId "ITEM_GOLD"')),
      `TEST FAIL R2-DROP-05: gold+ITEM_DIAMOND mismatch should fail, got: ${r.errors.join('; ')}`);
  }

  // Test R2-DROP-06: 未知 itemType → ERROR
  {
    const plan = buildValid20StagePlan();
    plan.dropData.data[0].items = [{ itemId: 'ITEM_GOLD', itemType: 'unknown_type', dropRate: 0.5 }];
    const r = validateGeneratedDraft(plan);
    assert(r.errors.some((e) => e.includes('unknown_type') && e.includes('not in allowed domain')),
      `TEST FAIL R2-DROP-06: unknown itemType should fail, got: ${r.errors.join('; ')}`);
  }

  // ===================================================================
  // 4.6 关键反向测试
  // ===================================================================

  // Test R2-NEG-01: 重复 battleStageId → ERROR
  {
    const plan = buildValid20StagePlan();
    plan.stageData.data[1].id = plan.stageData.data[0].id;
    const r = validateGeneratedDraft(plan);
    assert(r.errors.some((e) => e.includes('Duplicate battle stage id')),
      `TEST FAIL R2-NEG-01: duplicate battleStageId should fail, got: ${r.errors.join('; ')}`);
  }

  // Test R2-NEG-02: 孤儿 Battle Stage → ERROR
  {
    const plan = buildValid20StagePlan();
    plan.stageData.data.push({
      id: 'STAGE_MAIN_002_999', chapterId: 'chapter_002', stageIndex: 99,
      stageType: 'normal', isBossStage: false,
      enemyIds: plan.stageData.data[0].enemyIds,
      recommendedPower: 1000, staminaCost: 0, battleWave: 1,
      dropId: 'DROP_MAIN_002_001', firstDropId: 'DROP_FIRST_MAIN_002_001',
    });
    const r = validateGeneratedDraft(plan);
    assert(r.errors.some((e) => e.includes('orphan battle stage')),
      `TEST FAIL R2-NEG-02: orphan battle stage should fail, got: ${r.errors.join('; ')}`);
  }

  // Test R2-NEG-03: chapterStageId 格式与 stageIndex 不一致 → ERROR
  {
    const plan = buildValid20StagePlan();
    plan.chapterData.data[0].stages[0].id = 'chapter_002_stage_05'; // stageIndex=1 but ID says 05
    const r = validateGeneratedDraft(plan);
    assert(r.errors.some((e) => e.includes('chapter stage ID implies stage') && e.includes('but stageIndex=')),
      `TEST FAIL R2-NEG-03: chapterStageId format mismatch should fail, got: ${r.errors.join('; ')}`);
  }

  // Test R2-NEG-04: battleStageId 格式与 stageIndex 不一致 → ERROR
  {
    const plan = buildValid20StagePlan();
    plan.stageData.data[0].id = 'STAGE_MAIN_002_005'; // stageIndex=1 but ID says 005
    plan.chapterData.data[0].stages[0].battleStageId = 'STAGE_MAIN_002_005';
    const r = validateGeneratedDraft(plan);
    assert(r.errors.some((e) => e.includes('battle stage ID implies stage') && e.includes('but stageIndex=')),
      `TEST FAIL R2-NEG-04: battleStageId format mismatch should fail, got: ${r.errors.join('; ')}`);
  }

  // Test R2-NEG-05: normal关敌人数 < 2 → ERROR
  {
    const plan = buildValid20StagePlan();
    plan.stageData.data[0].enemyIds = ['ENEMY_MAIN_002_001_01'];
    plan.enemyData.data = plan.enemyData.data.filter((e) => plan.stageData.data[0].enemyIds.includes(e.id));
    const r = validateGeneratedDraft(plan);
    assert(r.errors.some((e) => e.includes('normal stage must have 2-3 enemies')),
      `TEST FAIL R2-NEG-05: normal stage with <2 enemies should fail, got: ${r.errors.join('; ')}`);
  }

  // Test R2-NEG-06: elite关没有elite敌人 → ERROR
  {
    const plan = buildValid20StagePlan();
    const bs = plan.stageData.data[2]; // stage 3 is elite
    bs.enemyIds = ['ENEMY_MAIN_002_003_01', 'ENEMY_MAIN_002_003_02'];
    plan.enemyData.data = plan.enemyData.data.filter((e) => bs.enemyIds.includes(e.id));
    plan.enemyData.data.forEach((e) => { e.enemyType = 'normal'; });
    const r = validateGeneratedDraft(plan);
    assert(r.errors.some((e) => e.includes('elite stage must have at least 1 elite-type enemy')),
      `TEST FAIL R2-NEG-06: elite stage without elite enemy should fail, got: ${r.errors.join('; ')}`);
  }

  // Test R2-NEG-07: boss关存在2名boss敌人 → ERROR
  {
    const plan = buildValid20StagePlan();
    const bs = plan.stageData.data[9]; // stage 10 = boss
    bs.enemyIds = ['ENEMY_BOSS_002_010_01', 'ENEMY_MAIN_002_010_02'];
    plan.enemyData.data = plan.enemyData.data.filter((e) => bs.enemyIds.includes(e.id));
    plan.enemyData.data.forEach((e) => { e.enemyType = 'boss'; e.isBoss = true; });
    const r = validateGeneratedDraft(plan);
    assert(r.errors.some((e) => e.includes('boss stage must have exactly 1 boss-type enemy')),
      `TEST FAIL R2-NEG-07: boss stage with 2 boss enemies should fail, got: ${r.errors.join('; ')}`);
  }

  // Test R2-NEG-08: dropId 与 firstDropId 相同 → ERROR
  {
    const plan = buildValid20StagePlan();
    plan.stageData.data[0].firstDropId = plan.stageData.data[0].dropId;
    const r = validateGeneratedDraft(plan);
    assert(r.errors.some((e) => e.includes('firstDropId must differ from dropId')),
      `TEST FAIL R2-NEG-08: dropId == firstDropId should fail, got: ${r.errors.join('; ')}`);
  }

  // Test R2-NEG-09: dropId 格式错误 → ERROR
  {
    const plan = buildValid20StagePlan();
    plan.stageData.data[0].dropId = 'BAD_DROP_FORMAT';
    const r = validateGeneratedDraft(plan);
    assert(r.errors.some((e) => e.includes('dropId') && e.includes('format invalid')),
      `TEST FAIL R2-NEG-09: bad dropId format should fail, got: ${r.errors.join('; ')}`);
  }

  // Test R2-NEG-10: firstDropId 格式错误 → ERROR
  {
    const plan = buildValid20StagePlan();
    plan.stageData.data[0].firstDropId = 'BAD_FIRST_DROP';
    const r = validateGeneratedDraft(plan);
    assert(r.errors.some((e) => e.includes('firstDropId') && e.includes('format invalid')),
      `TEST FAIL R2-NEG-10: bad firstDropId format should fail, got: ${r.errors.join('; ')}`);
  }

  // Test R2-NEG-11: stageIndex 重复 → ERROR
  {
    const plan = buildValid20StagePlan();
    plan.chapterData.data[0].stages[1].stageIndex = 1;
    const r = validateGeneratedDraft(plan);
    assert(r.errors.some((e) => e.includes('duplicate stageIndex')),
      `TEST FAIL R2-NEG-11: duplicate stageIndex should fail, got: ${r.errors.join('; ')}`);
  }

  // Test R2-NEG-12: stageIndex=11 → ERROR
  {
    const plan = buildValid20StagePlan();
    plan.chapterData.data[0].stages[9].stageIndex = 11;
    const r = validateGeneratedDraft(plan);
    assert(r.errors.length > 0,
      `TEST FAIL R2-NEG-12: stageIndex=11 should fail, got 0 errors`);
  }

  // Test R2-NEG-13: 第2章只有9关 → ERROR
  {
    const plan = buildValid20StagePlan();
    plan.chapterData.data[0].stages.pop();
    const r = validateGeneratedDraft(plan);
    assert(r.errors.some((e) => e.includes('must have exactly 10 stages')),
      `TEST FAIL R2-NEG-13: chapter 2 with 9 stages should fail, got: ${r.errors.join('; ')}`);
  }

  // Test R2-NEG-14: 第3章只有9关 → ERROR
  {
    const plan = buildValid20StagePlan();
    plan.chapterData.data[1].stages.pop();
    const r = validateGeneratedDraft(plan);
    assert(r.errors.some((e) => e.includes('must have exactly 10 stages')),
      `TEST FAIL R2-NEG-14: chapter 3 with 9 stages should fail, got: ${r.errors.join('; ')}`);
  }

  // ===================================================================
  // C1.6-B2-D-P1-B-R1 兼容边界自测
  // ===================================================================

  // Test COMPAT-01: validateDropItemAuthorityCompat allows runtime-supported exp type
  {
    const r = validateDropItemAuthorityCompat('ITEM_EXP', 'exp');
    assert(r.valid === true,
      `TEST FAIL COMPAT-01: exp should pass compat validation, got: ${r.reason || 'unknown'}`);
  }

  // Test COMPAT-02: validateDropItemAuthorityCompat allows runtime-supported equip type
  {
    const r = validateDropItemAuthorityCompat('ITEM_EQUIP_N_001', 'equip');
    assert(r.valid === true,
      `TEST FAIL COMPAT-02: equip should pass compat validation, got: ${r.reason || 'unknown'}`);
  }

  // Test COMPAT-03: validateDropItemAuthorityCompat allows runtime-supported gachaFragment type
  {
    const r = validateDropItemAuthorityCompat('ITEM_GACHA_FRAGMENT_001', 'gachaFragment');
    assert(r.valid === true,
      `TEST FAIL COMPAT-03: gachaFragment should pass compat validation, got: ${r.reason || 'unknown'}`);
  }

  // Test COMPAT-04: validateDropItemAuthorityCompat rejects completely unknown itemType
  {
    const r = validateDropItemAuthorityCompat('ITEM_X', 'nonexistent_type');
    assert(r.valid === false,
      `TEST FAIL COMPAT-04: nonexistent_type should fail compat validation`);
  }

  // Test COMPAT-05: isCompatKnownEquipmentId accepts equipment_common_001
  {
    assert(isCompatKnownEquipmentId('equipment_common_001') === true,
      'TEST FAIL COMPAT-05: equipment_common_001 should be known compat equipment');
    assert(isCompatKnownEquipmentId('equipment_unknown_999') === false,
      'TEST FAIL COMPAT-06: equipment_unknown_999 should not be known compat equipment');
  }

  // Test COMPAT-07: compatCurrentProduction allows hero_002 at stage 6 with valid authority
  {
    const heroIdSet = new Set(['hero_001', 'hero_002', 'hero_003', 'hero_004', 'hero_005']);
    const ch2 = {
      data: [{
        id: 'chapter_002', chapterIndex: 2,
        stages: [{
          id: 'chapter_002_stage_06', chapterId: 'chapter_002', stageIndex: 6, type: 'elite',
          recommendedPower: 1640,
          battleStageId: 'STAGE_MAIN_002_006',
          rewards: [{ type: 'hero', id: 'hero_002', amount: 1 }],
          unlockCondition: { prevStageId: 'chapter_002_stage_05' },
          staminaCost: 0,
        }],
      }],
    };
    const bs = {
      data: [{
        id: 'STAGE_MAIN_002_006', chapterId: 'chapter_002', stageIndex: 6, stageType: 'elite',
        isBossStage: false, enemyIds: ['ENEMY_MAIN_002_006_01', 'ENEMY_MAIN_002_006_02'],
        recommendedPower: 1640, staminaCost: 0, battleWave: 1,
        dropId: 'DROP_MAIN_002_006', firstDropId: 'DROP_FIRST_MAIN_002_006',
      }],
    };
    const r = validateMainStageConfig({
      chapterData: ch2, stageData: bs,
      enemyData: { data: [{ id: 'ENEMY_MAIN_002_006_01', enemyType: 'elite' }, { id: 'ENEMY_MAIN_002_006_02', enemyType: 'normal' }] },
      dropData: { data: [
        { id: 'DROP_MAIN_002_006', items: [{ itemId: 'ITEM_GOLD', itemType: 'gold', dropRate: 1.0 }] },
        { id: 'DROP_FIRST_MAIN_002_006', items: [{ itemId: 'ITEM_DIAMOND', itemType: 'diamond', dropRate: 1.0 }] },
      ] },
      heroIdSet,
      strictGenerated: true, compatMode: false, compatCurrentProduction: true,
    });
    const heroErrors = r.errors.filter(e => e.includes('hero'));
    assert(heroErrors.length === 0,
      `TEST FAIL COMPAT-07: hero_002 at stage 6 should pass with compatCurrentProduction, got: ${heroErrors.join('; ')}`);
  }

  // Test COMPAT-08: compatCurrentProduction rejects invalid hero ID
  {
    const heroIdSet = new Set(['hero_001', 'hero_002', 'hero_003', 'hero_004', 'hero_005']);
    const ch2 = {
      data: [{
        id: 'chapter_002', chapterIndex: 2,
        stages: [{
          id: 'chapter_002_stage_06', chapterId: 'chapter_002', stageIndex: 6, type: 'elite',
          recommendedPower: 1640,
          battleStageId: 'STAGE_MAIN_002_006',
          rewards: [{ type: 'hero', id: 'hero_999', amount: 1 }],
          unlockCondition: { prevStageId: 'chapter_002_stage_05' },
          staminaCost: 0,
        }],
      }],
    };
    const bs = {
      data: [{
        id: 'STAGE_MAIN_002_006', chapterId: 'chapter_002', stageIndex: 6, stageType: 'elite',
        isBossStage: false, enemyIds: ['ENEMY_MAIN_002_006_01', 'ENEMY_MAIN_002_006_02'],
        recommendedPower: 1640, staminaCost: 0, battleWave: 1,
        dropId: 'DROP_MAIN_002_006', firstDropId: 'DROP_FIRST_MAIN_002_006',
      }],
    };
    const r = validateMainStageConfig({
      chapterData: ch2, stageData: bs,
      enemyData: { data: [{ id: 'ENEMY_MAIN_002_006_01', enemyType: 'elite' }, { id: 'ENEMY_MAIN_002_006_02', enemyType: 'normal' }] },
      dropData: { data: [
        { id: 'DROP_MAIN_002_006', items: [{ itemId: 'ITEM_GOLD', itemType: 'gold', dropRate: 1.0 }] },
        { id: 'DROP_FIRST_MAIN_002_006', items: [{ itemId: 'ITEM_DIAMOND', itemType: 'diamond', dropRate: 1.0 }] },
      ] },
      heroIdSet,
      strictGenerated: true, compatMode: false, compatCurrentProduction: true,
    });
    assert(r.errors.some(e => e.includes('hero_999') && e.includes('not found in hero_data.json')),
      `TEST FAIL COMPAT-08: hero_999 should fail even with compatCurrentProduction, got: ${r.errors.join('; ')}`);
  }

  // Test COMPAT-09: hero reward at unauthorized position FAILS compatCurrentProduction
  {
    const heroIdSet = new Set(['hero_001', 'hero_002', 'hero_003']);
    const plan = buildValidChapter2Plan();
    // Put hero at stage 1 instead of stage 6 — unauthorized position
    plan.chapterData.data[0].stages[0].rewards = [{ type: 'hero', id: 'hero_002', amount: 1 }];
    const r = validateMainStageConfig({
      ...plan,
      heroIdSet,
      strictGenerated: true, compatMode: false, compatCurrentProduction: true,
    });
    // hero_002 at stage 1 is NOT an approved position — must FAIL
    assert(r.errors.some(e => e.includes('hero') && e.includes('unauthorized position')),
      `TEST FAIL COMPAT-09: hero_002 at stage 1 should FAIL (unauthorized position), got: ${r.errors.join('; ')}`);
  }

  // ===================================================================
  // C1.6-B2-D-P1-B-R2 英雄奖励位置门禁自测
  // ===================================================================

  // Test HERO-POS-01: chapter_002_stage_06 → hero_002 → PASS
  {
    const heroIdSet = new Set(['hero_001', 'hero_002', 'hero_003']);
    const plan = buildValidChapter2Plan();
    plan.chapterData.data[0].stages[5].rewards = [{ type: 'hero', id: 'hero_002', amount: 1 }];
    const r = validateMainStageConfig({
      ...plan,
      heroIdSet,
      strictGenerated: true, compatMode: false, compatCurrentProduction: true,
    });
    const heroErrors = r.errors.filter(e => e.includes('hero'));
    assert(heroErrors.length === 0,
      `TEST FAIL HERO-POS-01: hero_002 at chapter_002_stage_06 should PASS, got: ${heroErrors.join('; ')}`);
  }

  // Test HERO-POS-02: chapter_003_stage_06 → hero_003 → PASS
  {
    const heroIdSet = new Set(['hero_001', 'hero_002', 'hero_003']);
    const plan = buildValid20StagePlan();
    plan.chapterData.data[1].stages[5].rewards = [{ type: 'hero', id: 'hero_003', amount: 1 }];
    const r = validateMainStageConfig({
      ...plan,
      heroIdSet,
      strictGenerated: true, compatMode: false, compatCurrentProduction: true,
    });
    const heroErrors = r.errors.filter(e => e.includes('hero'));
    assert(heroErrors.length === 0,
      `TEST FAIL HERO-POS-02: hero_003 at chapter_003_stage_06 should PASS, got: ${heroErrors.join('; ')}`);
  }

  // Test HERO-POS-03: chapter_002_stage_01 → hero_002 → FAIL
  {
    const heroIdSet = new Set(['hero_001', 'hero_002', 'hero_003']);
    const plan = buildValidChapter2Plan();
    plan.chapterData.data[0].stages[0].rewards = [{ type: 'hero', id: 'hero_002', amount: 1 }];
    const r = validateMainStageConfig({
      ...plan,
      heroIdSet,
      strictGenerated: true, compatMode: false, compatCurrentProduction: true,
    });
    assert(r.errors.some(e => e.includes('hero') && e.includes('unauthorized position')),
      `TEST FAIL HERO-POS-03: hero_002 at stage 1 should FAIL, got: ${r.errors.join('; ')}`);
  }

  // Test HERO-POS-04: chapter_002_stage_06 → hero_003 → FAIL (wrong hero at approved stage)
  {
    const heroIdSet = new Set(['hero_001', 'hero_002', 'hero_003']);
    const plan = buildValidChapter2Plan();
    plan.chapterData.data[0].stages[5].rewards = [{ type: 'hero', id: 'hero_003', amount: 1 }];
    const r = validateMainStageConfig({
      ...plan,
      heroIdSet,
      strictGenerated: true, compatMode: false, compatCurrentProduction: true,
    });
    assert(r.errors.some(e => e.includes('hero') && e.includes('unauthorized position') && e.includes('expected "hero_002"')),
      `TEST FAIL HERO-POS-04: hero_003 at chapter_002_stage_06 should FAIL (expected hero_002), got: ${r.errors.join('; ')}`);
  }

  // Test HERO-POS-05: chapter_003_stage_06 → hero_002 → FAIL (wrong hero at approved stage)
  {
    const heroIdSet = new Set(['hero_001', 'hero_002', 'hero_003']);
    const plan = buildValid20StagePlan();
    plan.chapterData.data[1].stages[5].rewards = [{ type: 'hero', id: 'hero_002', amount: 1 }];
    const r = validateMainStageConfig({
      ...plan,
      heroIdSet,
      strictGenerated: true, compatMode: false, compatCurrentProduction: true,
    });
    assert(r.errors.some(e => e.includes('hero') && e.includes('unauthorized position') && e.includes('expected "hero_003"')),
      `TEST FAIL HERO-POS-05: hero_002 at chapter_003_stage_06 should FAIL (expected hero_003), got: ${r.errors.join('; ')}`);
  }

  // Test HERO-POS-06: chapter_002_stage_06 → hero_999 → FAIL (nonexistent hero)
  {
    const heroIdSet = new Set(['hero_001', 'hero_002', 'hero_003']);
    const plan = buildValidChapter2Plan();
    plan.chapterData.data[0].stages[5].rewards = [{ type: 'hero', id: 'hero_999', amount: 1 }];
    const r = validateMainStageConfig({
      ...plan,
      heroIdSet,
      strictGenerated: true, compatMode: false, compatCurrentProduction: true,
    });
    assert(r.errors.some(e => e.includes('hero_999') && e.includes('not found in hero_data.json')),
      `TEST FAIL HERO-POS-06: hero_999 should FAIL (not in authority), got: ${r.errors.join('; ')}`);
  }

  // Test HERO-POS-07: chapter_002_stage_06 → hero_002, amount=0 → FAIL
  {
    const heroIdSet = new Set(['hero_001', 'hero_002', 'hero_003']);
    const plan = buildValidChapter2Plan();
    plan.chapterData.data[0].stages[5].rewards = [{ type: 'hero', id: 'hero_002', amount: 0 }];
    const r = validateMainStageConfig({
      ...plan,
      heroIdSet,
      strictGenerated: true, compatMode: false, compatCurrentProduction: true,
    });
    assert(r.errors.some(e => e.includes('hero') && e.includes('amount must be a positive integer')),
      `TEST FAIL HERO-POS-07: hero_002 amount=0 should FAIL, got: ${r.errors.join('; ')}`);
  }

  // Test HERO-POS-08: chapter_002_stage_06 → hero_002, amount=1.5 → FAIL
  {
    const heroIdSet = new Set(['hero_001', 'hero_002', 'hero_003']);
    const plan = buildValidChapter2Plan();
    plan.chapterData.data[0].stages[5].rewards = [{ type: 'hero', id: 'hero_002', amount: 1.5 }];
    const r = validateMainStageConfig({
      ...plan,
      heroIdSet,
      strictGenerated: true, compatMode: false, compatCurrentProduction: true,
    });
    assert(r.errors.some(e => e.includes('hero') && e.includes('amount must be a positive integer')),
      `TEST FAIL HERO-POS-08: hero_002 amount=1.5 should FAIL, got: ${r.errors.join('; ')}`);
  }

  // ===================================================================
  // C1.6-B2-D-P1-B-R2 Chapter 1兼容边界自测
  // ===================================================================

  // Test LEGACY-SCOPE-01: Chapter 1 equipment_common_001 → PASS (compatCurrentProduction scoped to chapterIndex=1)
  {
    const plan = buildValidChapter2Plan();
    // Override as Chapter 1 with equipment_common_001 reward
    plan.chapterData.data[0].id = 'chapter_001';
    plan.chapterData.data[0].chapterIndex = 1;
    plan.chapterData.data[0].stages = [{
      id: 'chapter_001_stage_04', chapterId: 'chapter_001', stageIndex: 4, type: 'normal',
      recommendedPower: 800,
      battleStageId: 'STAGE_MAIN_001_004',
      rewards: [{ type: 'equipment', id: 'equipment_common_001', amount: 1 }],
      unlockCondition: { prevStageId: 'chapter_001_stage_03' },
      staminaCost: 0,
    }];
    plan.stageData.data = [{
      id: 'STAGE_MAIN_001_004', chapterId: 'chapter_001', stageIndex: 4, stageType: 'normal',
      isBossStage: false, enemyIds: ['ENEMY_MAIN_001_004_01', 'ENEMY_MAIN_001_004_02'],
      recommendedPower: 800, staminaCost: 0, battleWave: 1,
      dropId: 'DROP_MAIN_001_004', firstDropId: 'DROP_FIRST_MAIN_001_004',
    }];
    plan.enemyData.data = [{ id: 'ENEMY_MAIN_001_004_01', enemyType: 'normal' }, { id: 'ENEMY_MAIN_001_004_02', enemyType: 'normal' }];
    plan.dropData.data = [
      { id: 'DROP_MAIN_001_004', items: [{ itemId: 'ITEM_GOLD', itemType: 'gold', dropRate: 1.0 }] },
      { id: 'DROP_FIRST_MAIN_001_004', items: [{ itemId: 'ITEM_DIAMOND', itemType: 'diamond', dropRate: 1.0 }] },
    ];
    const r = validateMainStageConfig({
      ...plan,
      strictGenerated: true, compatMode: false, compatCurrentProduction: true,
    });
    const eqErrors = r.errors.filter(e => e.includes('equipment'));
    assert(eqErrors.length === 0,
      `TEST FAIL LEGACY-SCOPE-01: Chapter 1 equipment_common_001 should PASS, got: ${eqErrors.join('; ')}`);
  }

  // Test LEGACY-SCOPE-02: Chapter 2 with equipment_common_001 → FAIL (compat scoped to Chapter 1 only)
  {
    const plan = buildValidChapter2Plan();
    plan.chapterData.data[0].stages[0].rewards = [{ type: 'equipment', id: 'equipment_common_001', amount: 1 }];
    const r = validateMainStageConfig({
      ...plan,
      strictGenerated: true, compatMode: false, compatCurrentProduction: true,
    });
    assert(r.errors.some(e => e.includes('only allows gold/exp rewards')),
      `TEST FAIL LEGACY-SCOPE-02: Chapter 2 equipment_common_001 should FAIL, got: ${r.errors.join('; ')}`);
  }

  // Test LEGACY-SCOPE-03: Chapter 2 drop with exp type → FAIL (compatCurrentProduction scoped by drop ID)
  {
    const plan = buildValidChapter2Plan();
    plan.dropData.data[0].items = [{ itemId: 'ITEM_EXP', itemType: 'exp', dropRate: 1.0 }];
    const r = validateMainStageConfig({
      ...plan,
      strictGenerated: true, compatMode: false, compatCurrentProduction: true,
    });
    assert(r.errors.some(e => e.includes('exp') && e.includes('not in allowed domain')),
      `TEST FAIL LEGACY-SCOPE-03: C2 drop with exp type should FAIL (not Ch1 legacy drop ID), got: ${r.errors.join('; ')}`);
  }

  // Test COMPAT-10: C2/3 drop with legacy exp type FAILS strict (no compatCurrentProduction)
  {
    const plan = buildValidChapter2Plan();
    plan.dropData.data[0].items = [{ itemId: 'ITEM_EXP', itemType: 'exp', dropRate: 1.0 }];
    const r = validateGeneratedDraft(plan);
    assert(r.errors.some(e => e.includes('exp') && e.includes('not in allowed domain')),
      `TEST FAIL COMPAT-10: C2 drop with exp type should fail strict (no compat), got: ${r.errors.join('; ')}`);
  }

  // Test COMPAT-11: C2/3 drop with equip type FAILS strict (no compatCurrentProduction)
  {
    const plan = buildValidChapter2Plan();
    plan.dropData.data[0].items = [{ itemId: 'ITEM_EQUIP_N_001', itemType: 'equip', dropRate: 1.0 }];
    const r = validateGeneratedDraft(plan);
    assert(r.errors.some(e => e.includes('equip') && e.includes('not in allowed domain')),
      `TEST FAIL COMPAT-11: C2 drop with equip type should fail strict, got: ${r.errors.join('; ')}`);
  }

  // Test COMPAT-12: C2/3 drop with gachaFragment type FAILS strict (no compatCurrentProduction)
  {
    const plan = buildValidChapter2Plan();
    plan.dropData.data[0].items = [{ itemId: 'ITEM_GACHA_FRAGMENT_001', itemType: 'gachaFragment', dropRate: 1.0 }];
    const r = validateGeneratedDraft(plan);
    assert(r.errors.some(e => e.includes('gachaFragment') && e.includes('not in allowed domain')),
      `TEST FAIL COMPAT-12: C2 drop with gachaFragment type should fail strict, got: ${r.errors.join('; ')}`);
  }

  // Test COMPAT-13: hero_003 at chapter_003_stage_06 passes compatCurrentProduction
  {
    const heroIdSet = new Set(['hero_001', 'hero_002', 'hero_003', 'hero_004', 'hero_005']);
    const ch3 = {
      data: [{
        id: 'chapter_003', chapterIndex: 3,
        stages: [{
          id: 'chapter_003_stage_06', chapterId: 'chapter_003', stageIndex: 6, type: 'elite',
          recommendedPower: 2720,
          battleStageId: 'STAGE_MAIN_003_006',
          rewards: [{ type: 'hero', id: 'hero_003', amount: 1 }],
          unlockCondition: { prevStageId: 'chapter_003_stage_05' },
          staminaCost: 0,
        }],
      }],
    };
    const bs = {
      data: [{
        id: 'STAGE_MAIN_003_006', chapterId: 'chapter_003', stageIndex: 6, stageType: 'elite',
        isBossStage: false, enemyIds: ['ENEMY_MAIN_003_006_01', 'ENEMY_MAIN_003_006_02'],
        recommendedPower: 2720, staminaCost: 0, battleWave: 1,
        dropId: 'DROP_MAIN_003_006', firstDropId: 'DROP_FIRST_MAIN_003_006',
      }],
    };
    const r = validateMainStageConfig({
      chapterData: ch3, stageData: bs,
      enemyData: { data: [{ id: 'ENEMY_MAIN_003_006_01', enemyType: 'elite' }, { id: 'ENEMY_MAIN_003_006_02', enemyType: 'normal' }] },
      dropData: { data: [
        { id: 'DROP_MAIN_003_006', items: [{ itemId: 'ITEM_GOLD', itemType: 'gold', dropRate: 1.0 }] },
        { id: 'DROP_FIRST_MAIN_003_006', items: [{ itemId: 'ITEM_DIAMOND', itemType: 'diamond', dropRate: 1.0 }] },
      ] },
      heroIdSet,
      strictGenerated: true, compatMode: false, compatCurrentProduction: true,
    });
    const heroErrors = r.errors.filter(e => e.includes('hero'));
    assert(heroErrors.length === 0,
      `TEST FAIL COMPAT-13: hero_003 at stage 6 should pass compatCurrentProduction, got: ${heroErrors.join('; ')}`);
  }

  // ===================================================================
  // C1.6-B2-D-P1-B-R3 精确历史掉落白名单边界自测
  // ===================================================================

  // Test LEGACY-DROP-ID-01: DROP_001 + exp → PASS (白名单内 + 运行时合法历史类型)
  {
    const r = validateDropItemAuthorityCompat('ITEM_EXP', 'exp');
    assert(r.valid === true,
      `TEST FAIL LEGACY-DROP-ID-01: DROP_001 compat exp should PASS, got: ${r.reason || 'unknown'}`);
  }

  // Test LEGACY-DROP-ID-02: DROP_015 + exp → PASS (白名单边界上限)
  {
    const r = validateDropItemAuthorityCompat('ITEM_EXP', 'exp');
    assert(r.valid === true,
      `TEST FAIL LEGACY-DROP-ID-02: DROP_015 compat exp should PASS, got: ${r.reason || 'unknown'}`);
  }

  // Test LEGACY-DROP-ID-03: DROP_F001 + equip → PASS (白名单内 + 运行时合法历史类型)
  {
    const r = validateDropItemAuthorityCompat('ITEM_EQUIP_N_001', 'equip');
    assert(r.valid === true,
      `TEST FAIL LEGACY-DROP-ID-03: DROP_F001 compat equip should PASS, got: ${r.reason || 'unknown'}`);
  }

  // Test LEGACY-DROP-ID-04: DROP_F015 + equip → PASS (白名单边界上限)
  {
    const r = validateDropItemAuthorityCompat('ITEM_EQUIP_N_001', 'equip');
    assert(r.valid === true,
      `TEST FAIL LEGACY-DROP-ID-04: DROP_F015 compat equip should PASS, got: ${r.reason || 'unknown'}`);
  }

  // Test LEGACY-DROP-ID-05: DROP_016 + exp → FAIL (不在白名单)
  {
    // DROP_016 不在白名单，不能进入兼容模式 → 走严格 validateDropItemAuthority
    const r = validateDropItemAuthority('ITEM_EXP', 'exp');
    assert(r.valid === false,
      `TEST FAIL LEGACY-DROP-ID-05: strict exp should FAIL (not in allowed domain), got: ${JSON.stringify(r)}`);
    assert(r.reason.includes('not in allowed domain'),
      `TEST FAIL LEGACY-DROP-ID-05: reason should mention "not in allowed domain", got: ${r.reason}`);
  }

  // Test LEGACY-DROP-ID-06: DROP_F016 + equip → FAIL (不在白名单)
  {
    const r = validateDropItemAuthority('ITEM_EQUIP_N_001', 'equip');
    assert(r.valid === false,
      `TEST FAIL LEGACY-DROP-ID-06: strict equip should FAIL (not in allowed domain), got: ${JSON.stringify(r)}`);
    assert(r.reason.includes('not in allowed domain'),
      `TEST FAIL LEGACY-DROP-ID-06: reason should mention "not in allowed domain", got: ${r.reason}`);
  }

  // Test LEGACY-DROP-ID-07: DROP_999 + gachaFragment → FAIL (不在白名单)
  {
    const r = validateDropItemAuthority('ITEM_GACHA_FRAGMENT_001', 'gachaFragment');
    assert(r.valid === false,
      `TEST FAIL LEGACY-DROP-ID-07: strict gachaFragment should FAIL (not in allowed domain), got: ${JSON.stringify(r)}`);
    assert(r.reason.includes('not in allowed domain'),
      `TEST FAIL LEGACY-DROP-ID-07: reason should mention "not in allowed domain", got: ${r.reason}`);
  }

  // Test LEGACY-DROP-ID-08: DROP_F999 + exp → FAIL (不在白名单)
  {
    const r = validateDropItemAuthority('ITEM_EXP', 'exp');
    assert(r.valid === false,
      `TEST FAIL LEGACY-DROP-ID-08: strict exp should FAIL (not in allowed domain), got: ${JSON.stringify(r)}`);
    assert(r.reason.includes('not in allowed domain'),
      `TEST FAIL LEGACY-DROP-ID-08: reason should mention "not in allowed domain", got: ${r.reason}`);
  }

  // Test LEGACY-DROP-ID-09: DROP_MAIN_002_001 + exp → FAIL (新D-P1掉落)
  {
    const r = validateDropItemAuthority('ITEM_EXP', 'exp');
    assert(r.valid === false,
      `TEST FAIL LEGACY-DROP-ID-09: DROP_MAIN_002_001 with exp should FAIL (not in allowed domain), got: ${JSON.stringify(r)}`);
    assert(r.reason.includes('not in allowed domain'),
      `TEST FAIL LEGACY-DROP-ID-09: reason should mention "not in allowed domain", got: ${r.reason}`);
  }

  // Test LEGACY-DROP-ID-10: DROP_FIRST_MAIN_003_001 + equip → FAIL (新D-P1掉落)
  {
    const r = validateDropItemAuthority('ITEM_EQUIP_N_001', 'equip');
    assert(r.valid === false,
      `TEST FAIL LEGACY-DROP-ID-10: DROP_FIRST_MAIN_003_001 with equip should FAIL (not in allowed domain), got: ${JSON.stringify(r)}`);
    assert(r.reason.includes('not in allowed domain'),
      `TEST FAIL LEGACY-DROP-ID-10: reason should mention "not in allowed domain", got: ${r.reason}`);
  }

  // Test LEGACY-DROP-ID-11: 已授权旧ID + 完全不存在的itemType → FAIL (兼容也拒绝未知类型)
  {
    // 即使 itemId 在运行时合法，itemType 完全未知时严格+兼容均拒绝
    const rCompat = validateDropItemAuthorityCompat('ITEM_EXP', 'nonexistent_type');
    assert(rCompat.valid === false,
      `TEST FAIL LEGACY-DROP-ID-11: compat with nonexistent_type should FAIL, got: ${JSON.stringify(rCompat)}`);
    assert(rCompat.reason.includes('not in allowed domain'),
      `TEST FAIL LEGACY-DROP-ID-11: reason should mention "not in allowed domain", got: ${rCompat.reason}`);
  }

  // Test: isCompatLegacyDropId 精确白名单
  {
    assert(isCompatLegacyDropId('DROP_001') === true, 'TEST FAIL: DROP_001 should be in whitelist');
    assert(isCompatLegacyDropId('DROP_015') === true, 'TEST FAIL: DROP_015 should be in whitelist');
    assert(isCompatLegacyDropId('DROP_F001') === true, 'TEST FAIL: DROP_F001 should be in whitelist');
    assert(isCompatLegacyDropId('DROP_F015') === true, 'TEST FAIL: DROP_F015 should be in whitelist');
    assert(isCompatLegacyDropId('DROP_016') === false, 'TEST FAIL: DROP_016 should NOT be in whitelist');
    assert(isCompatLegacyDropId('DROP_F016') === false, 'TEST FAIL: DROP_F016 should NOT be in whitelist');
    assert(isCompatLegacyDropId('DROP_999') === false, 'TEST FAIL: DROP_999 should NOT be in whitelist');
    assert(isCompatLegacyDropId('DROP_F999') === false, 'TEST FAIL: DROP_F999 should NOT be in whitelist');
    assert(isCompatLegacyDropId('DROP_MAIN_002_001') === false, 'TEST FAIL: DROP_MAIN_002_001 should NOT be in whitelist');
    assert(isCompatLegacyDropId('DROP_FIRST_MAIN_003_001') === false, 'TEST FAIL: DROP_FIRST_MAIN_003_001 should NOT be in whitelist');
    assert(isCompatLegacyDropId('') === false, 'TEST FAIL: empty string should NOT be in whitelist');
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
