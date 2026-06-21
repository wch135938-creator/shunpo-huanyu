// ============================================================
// SaveValidator — Phase6-Step5 存档校验器
// 职责：校验 SaveContainer 各字段完整性 / 类型正确性 / 数值范围
// 边界：只读，不修改数据，不依赖运行时系统
// ============================================================

import { BaseSystem } from '../core/BaseSystem';
import type { SaveContainer } from './SaveContainer';
import { CURRENT_SAVE_VERSION } from './SaveContainer';

// ---- 类型定义 ----

/** 校验严重级别 */
export type ValidationSeverity = 'error' | 'warning';

/** 单条校验问题 */
export interface ValidationIssue {
  /** 问题所在路径（如 "player.level"、"equipment.instances"） */
  path: string;
  /** 严重级别 */
  severity: ValidationSeverity;
  /** 问题描述 */
  message: string;
}

/** 校验结果 */
export interface ValidationResult {
  /** 是否通过校验（无 error 级别问题） */
  valid: boolean;
  /** 所有问题列表 */
  issues: ValidationIssue[];
  /** error 数量 */
  errorCount: number;
  /** warning 数量 */
  warningCount: number;
}

/** 子模块校验结果 */
interface SubValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

// ---- 数值范围常量 ----

/** 合理等级范围 */
const MIN_LEVEL = 1;
const MAX_LEVEL = 1000;
/** 合理经验范围 */
const MIN_EXP = 0;
const MAX_EXP = 99999999;
/** 合理战力范围 */
const MIN_POWER = 0;
const MAX_POWER = 99999999;
/** 合理金币范围 */
const MAX_GOLD = 999999999;
/** 合理体力范围 */
const MIN_STAMINA = 0;
const MAX_STAMINA = 999;
/** 合理音量范围 */
const MIN_VOLUME = 0;
const MAX_VOLUME = 100;

export class SaveValidator extends BaseSystem {

  // ==================== Phase7-Step7: 神器校验 ====================

  /**
   * 校验神器背包数据。
   *
   * @param inventory  神器背包（optional）
   * @returns          子模块校验问题列表
   */
  validateArtifactInventory(inventory: unknown): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    if (inventory === undefined || inventory === null) {
      return issues; // V7 字段，optional 允许不存在
    }

    if (typeof inventory !== 'object') {
      issues.push({ path: 'artifactInventory', severity: 'error', message: 'artifactInventory 不是对象' });
      return issues;
    }

    const inv = inventory as Record<string, unknown>;

    if (!Array.isArray(inv.artifacts)) {
      issues.push({ path: 'artifactInventory.artifacts', severity: 'error', message: 'artifacts 不是数组' });
      return issues;
    }

    const artifactIdSet = new Set<string>();

    for (let i = 0; i < inv.artifacts.length; i++) {
      const artifact = inv.artifacts[i] as Record<string, unknown>;
      const base = `artifactInventory.artifacts[${i}]`;

      if (!artifact || typeof artifact !== 'object') {
        issues.push({ path: base, severity: 'error', message: '神器数据为空' });
        continue;
      }

      if (!artifact.artifactId || typeof artifact.artifactId !== 'string') {
        issues.push({ path: `${base}.artifactId`, severity: 'error', message: 'artifactId 缺失或类型错误' });
      } else {
        if (artifactIdSet.has(artifact.artifactId as string)) {
          issues.push({ path: `${base}.artifactId`, severity: 'error', message: `重复的神器 ID: ${artifact.artifactId}` });
        }
        artifactIdSet.add(artifact.artifactId as string);
      }

      if (typeof artifact.level !== 'number' || (artifact.level as number) < 1) {
        issues.push({ path: `${base}.level`, severity: 'error', message: `level 无效: ${artifact.level}` });
      }

      if (typeof artifact.obtainedAt !== 'number' || (artifact.obtainedAt as number) <= 0) {
        issues.push({ path: `${base}.obtainedAt`, severity: 'warning', message: 'obtainedAt 无效' });
      }
    }

    // 交叉校验：activeArtifactId 是否在 artifacts 中存在
    if (inv.activeArtifactId !== undefined && inv.activeArtifactId !== null) {
      if (typeof inv.activeArtifactId !== 'string') {
        issues.push({ path: 'artifactInventory.activeArtifactId', severity: 'error', message: 'activeArtifactId 类型错误' });
      } else if (!artifactIdSet.has(inv.activeArtifactId as string)) {
        issues.push({
          path: 'artifactInventory.activeArtifactId',
          severity: 'warning',
          message: `activeArtifactId (${inv.activeArtifactId}) 不在 artifacts 列表中`,
        });
      }
    }

    return issues;
  }

  /**
   * 校验运营活动状态。
   *
   * @param state  运营活动状态（optional）
   * @returns      子模块校验问题列表
   */
  validateLiveOpsState(state: unknown): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    if (state === undefined || state === null) {
      return issues; // V7 字段，optional 允许不存在
    }

    if (typeof state !== 'object') {
      issues.push({ path: 'liveOpsState', severity: 'error', message: 'liveOpsState 不是对象' });
      return issues;
    }

    const ls = state as Record<string, unknown>;

    if (!Array.isArray(ls.activeEventIds)) {
      issues.push({ path: 'liveOpsState.activeEventIds', severity: 'error', message: 'activeEventIds 不是数组' });
    } else {
      for (let i = 0; i < ls.activeEventIds.length; i++) {
        if (typeof ls.activeEventIds[i] !== 'string') {
          issues.push({
            path: `liveOpsState.activeEventIds[${i}]`,
            severity: 'error',
            message: `无效的活动 ID: ${ls.activeEventIds[i]}`,
          });
        }
      }
    }

    if (typeof ls.lastRefreshAt !== 'number' || (ls.lastRefreshAt as number) < 0) {
      issues.push({ path: 'liveOpsState.lastRefreshAt', severity: 'error', message: 'lastRefreshAt 无效' });
    }

    return issues;
  }

  /**
   * 校验特殊事件状态列表。
   *
   * @param states  特殊事件状态列表（optional）
   * @returns       子模块校验问题列表
   */
  validateSpecialEventStates(states: unknown): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    if (states === undefined || states === null) {
      return issues; // V7 字段，optional 允许不存在
    }

    if (!Array.isArray(states)) {
      issues.push({ path: 'specialEventStates', severity: 'error', message: 'specialEventStates 不是数组' });
      return issues;
    }

    const eventIdSet = new Set<string>();

    for (let i = 0; i < states.length; i++) {
      const eventState = states[i] as Record<string, unknown>;
      const base = `specialEventStates[${i}]`;

      if (!eventState || typeof eventState !== 'object') {
        issues.push({ path: base, severity: 'error', message: '事件状态数据为空' });
        continue;
      }

      if (!eventState.eventId || typeof eventState.eventId !== 'string') {
        issues.push({ path: `${base}.eventId`, severity: 'error', message: 'eventId 缺失或类型错误' });
      } else {
        if (eventIdSet.has(eventState.eventId as string)) {
          issues.push({ path: `${base}.eventId`, severity: 'error', message: `重复的事件 ID: ${eventState.eventId}` });
        }
        eventIdSet.add(eventState.eventId as string);
      }

      if (typeof eventState.completed !== 'boolean') {
        issues.push({ path: `${base}.completed`, severity: 'error', message: 'completed 类型错误' });
      }

      if (eventState.completed && eventState.completedAt !== undefined) {
        if (typeof eventState.completedAt !== 'number' || (eventState.completedAt as number) <= 0) {
          issues.push({
            path: `${base}.completedAt`,
            severity: 'warning',
            message: `completedAt 无效: ${eventState.completedAt}`,
          });
        }
      }
    }

    return issues;
  }

  // ==================== 核心：全量校验 ====================

  /**
   * 执行全量存档校验。
   *
   * @param container  待校验的存档容器
   * @returns          校验结果
   */
  validate(container: SaveContainer): ValidationResult {
    const allIssues: ValidationIssue[] = [];

    if (!container) {
      return {
        valid: false,
        issues: [{ path: 'root', severity: 'error', message: 'container 为 null 或 undefined' }],
        errorCount: 1,
        warningCount: 0,
      };
    }

    // 逐子模块校验
    const subResults: SubValidationResult[] = [
      this._validateRoot(container),
      this._validatePlayer(container),
      this._validateCards(container),
      this._validateEquipment(container),
      this._validateSettings(container),
      this._validateAd(container),
      this._validateGrowth(container),
      this._validateDungeon(container),
      this._validateDropHistory(container),
      this._validateArtifactInventorySub(container),
      this._validateLiveOpsStateSub(container),
      this._validateSpecialEventStatesSub(container),
    ];

    for (const sub of subResults) {
      allIssues.push(...sub.issues);
    }

    const errors = allIssues.filter((i) => i.severity === 'error');
    const warnings = allIssues.filter((i) => i.severity === 'warning');

    return {
      valid: errors.length === 0,
      issues: allIssues,
      errorCount: errors.length,
      warningCount: warnings.length,
    };
  }

  /**
   * 快速校验（仅检查最关键的字段）。
   *
   * @param container  待校验的存档容器
   * @returns          是否通过快速校验
   */
  quickValidate(container: SaveContainer): boolean {
    if (!container) return false;

    // 关键检查：版本号、玩家数据、成长数据
    if (typeof container.saveVersion !== 'number' || container.saveVersion < 0) return false;
    if (!container.player || typeof container.player !== 'object') return false;
    if (typeof container.player.level !== 'number' || container.player.level < 1) return false;
    if (!Array.isArray(container.cards)) return false;
    if (!container.growth || typeof container.growth !== 'object') return false;

    return true;
  }

  // ==================== 按路径校验 ====================

  /**
   * 校验存档的指定子模块。
   *
   * @param container  存档容器
   * @param moduleKey  子模块名称
   * @returns          子模块校验问题列表
   */
  validateModule(
    container: SaveContainer,
    moduleKey: keyof SaveContainer,
  ): ValidationIssue[] {
    if (!container) {
      return [{ path: 'root', severity: 'error', message: 'container 为 null' }];
    }

    switch (moduleKey) {
      case 'player':
        return this._validatePlayer(container).issues;
      case 'cards':
        return this._validateCards(container).issues;
      case 'equipment':
        return this._validateEquipment(container).issues;
      case 'settings':
        return this._validateSettings(container).issues;
      case 'ad':
        return this._validateAd(container).issues;
      case 'growth':
        return this._validateGrowth(container).issues;
      case 'dungeon':
        return this._validateDungeon(container).issues;
      case 'dropHistory':
        return this._validateDropHistory(container).issues;
      case 'artifactInventory':
        return this._validateArtifactInventorySub(container).issues;
      case 'liveOpsState':
        return this._validateLiveOpsStateSub(container).issues;
      case 'specialEventStates':
        return this._validateSpecialEventStatesSub(container).issues;
      default:
        return [{
          path: String(moduleKey),
          severity: 'warning',
          message: `未定义校验规则的子模块: ${String(moduleKey)}`,
        }];
    }
  }

  // ==================== 内部：各子模块校验 ====================

  private _validateRoot(container: SaveContainer): SubValidationResult {
    const issues: ValidationIssue[] = [];

    // 版本号
    if (typeof container.saveVersion !== 'number' || !Number.isFinite(container.saveVersion)) {
      issues.push({ path: 'saveVersion', severity: 'error', message: 'saveVersion 缺失或类型错误' });
    } else if (container.saveVersion < 0) {
      issues.push({ path: 'saveVersion', severity: 'error', message: `saveVersion 为负数: ${container.saveVersion}` });
    } else if (container.saveVersion > CURRENT_SAVE_VERSION) {
      issues.push({ path: 'saveVersion', severity: 'warning', message: `saveVersion (${container.saveVersion}) 高于当前版本 (${CURRENT_SAVE_VERSION})` });
    }

    // 时间戳
    if (typeof container.timestamp !== 'number' || !Number.isFinite(container.timestamp)) {
      issues.push({ path: 'timestamp', severity: 'warning', message: 'timestamp 缺失或类型错误' });
    }

    return { valid: issues.filter((i) => i.severity === 'error').length === 0, issues };
  }

  private _validatePlayer(container: SaveContainer): SubValidationResult {
    const issues: ValidationIssue[] = [];
    const p = container.player;

    if (!p || typeof p !== 'object') {
      issues.push({ path: 'player', severity: 'error', message: 'player 数据缺失' });
      return { valid: false, issues };
    }

    if (typeof p.level !== 'number' || !Number.isFinite(p.level)) {
      issues.push({ path: 'player.level', severity: 'error', message: 'level 类型错误' });
    } else if (p.level < MIN_LEVEL || p.level > MAX_LEVEL) {
      issues.push({ path: 'player.level', severity: 'warning', message: `level 超出合理范围: ${p.level}` });
    }

    if (typeof p.exp !== 'number' || !Number.isFinite(p.exp)) {
      issues.push({ path: 'player.exp', severity: 'error', message: 'exp 类型错误' });
    } else if (p.exp < MIN_EXP || p.exp > MAX_EXP) {
      issues.push({ path: 'player.exp', severity: 'warning', message: `exp 超出合理范围: ${p.exp}` });
    }

    if (typeof p.stageId !== 'number' || !Number.isFinite(p.stageId)) {
      issues.push({ path: 'player.stageId', severity: 'error', message: 'stageId 类型错误' });
    } else if (p.stageId < 1) {
      issues.push({ path: 'player.stageId', severity: 'warning', message: `stageId 无效: ${p.stageId}` });
    }

    if (typeof p.combatPower !== 'number' || !Number.isFinite(p.combatPower)) {
      issues.push({ path: 'player.combatPower', severity: 'error', message: 'combatPower 类型错误' });
    } else if (p.combatPower < MIN_POWER || p.combatPower > MAX_POWER) {
      issues.push({ path: 'player.combatPower', severity: 'warning', message: `combatPower 超出合理范围: ${p.combatPower}` });
    }

    return { valid: issues.filter((i) => i.severity === 'error').length === 0, issues };
  }

  private _validateCards(container: SaveContainer): SubValidationResult {
    const issues: ValidationIssue[] = [];

    if (!Array.isArray(container.cards)) {
      issues.push({ path: 'cards', severity: 'error', message: 'cards 不是数组' });
      return { valid: false, issues };
    }

    for (let i = 0; i < container.cards.length; i++) {
      const card = container.cards[i];
      const base = `cards[${i}]`;

      if (typeof card.cardId !== 'number') {
        issues.push({ path: `${base}.cardId`, severity: 'error', message: 'cardId 类型错误' });
      }
      if (typeof card.level !== 'number' || card.level < 1) {
        issues.push({ path: `${base}.level`, severity: 'error', message: 'level 无效' });
      }
      if (typeof card.star !== 'number' || card.star < 0) {
        issues.push({ path: `${base}.star`, severity: 'warning', message: 'star 无效' });
      }
      if (typeof card.exp !== 'number' || card.exp < 0) {
        issues.push({ path: `${base}.exp`, severity: 'warning', message: 'exp 无效' });
      }
    }

    return { valid: issues.filter((i) => i.severity === 'error').length === 0, issues };
  }

  private _validateEquipment(container: SaveContainer): SubValidationResult {
    const issues: ValidationIssue[] = [];
    const eq = container.equipment;

    if (!eq || typeof eq !== 'object') {
      issues.push({ path: 'equipment', severity: 'error', message: 'equipment 数据缺失' });
      return { valid: false, issues };
    }

    if (!eq.instances || typeof eq.instances !== 'object') {
      issues.push({ path: 'equipment.instances', severity: 'error', message: 'instances 不是对象' });
    }

    if (!eq.heroEquipment || typeof eq.heroEquipment !== 'object') {
      issues.push({ path: 'equipment.heroEquipment', severity: 'error', message: 'heroEquipment 不是对象' });
    }

    // 校验 instances 中各实例
    if (eq.instances) {
      for (const uid of Object.keys(eq.instances)) {
        const inst = eq.instances[uid];
        if (!inst || typeof inst !== 'object') {
          issues.push({ path: `equipment.instances[${uid}]`, severity: 'error', message: '实例数据损坏' });
          continue;
        }
        if (!inst.uid || typeof inst.uid !== 'string') {
          issues.push({ path: `equipment.instances[${uid}].uid`, severity: 'error', message: 'uid 缺失' });
        }
        if (!inst.configId || typeof inst.configId !== 'string') {
          issues.push({ path: `equipment.instances[${uid}].configId`, severity: 'error', message: 'configId 缺失' });
        }
      }
    }

    // 校验 heroEquipment 中各英雄
    if (eq.heroEquipment) {
      for (const heroId of Object.keys(eq.heroEquipment)) {
        const he = eq.heroEquipment[heroId];
        if (!he || typeof he !== 'object') {
          issues.push({ path: `equipment.heroEquipment[${heroId}]`, severity: 'error', message: '英雄装备数据损坏' });
          continue;
        }
        if (he.weaponId !== null && he.weaponId !== undefined && typeof he.weaponId !== 'string') {
          issues.push({ path: `equipment.heroEquipment[${heroId}].weaponId`, severity: 'warning', message: 'weaponId 类型异常' });
        }
        if (he.armorId !== null && he.armorId !== undefined && typeof he.armorId !== 'string') {
          issues.push({ path: `equipment.heroEquipment[${heroId}].armorId`, severity: 'warning', message: 'armorId 类型异常' });
        }
        if (he.accessoryId !== null && he.accessoryId !== undefined && typeof he.accessoryId !== 'string') {
          issues.push({ path: `equipment.heroEquipment[${heroId}].accessoryId`, severity: 'warning', message: 'accessoryId 类型异常' });
        }
      }
    }

    // 交叉校验：穿戴的装备是否在 instances 中存在
    if (eq.heroEquipment && eq.instances) {
      for (const heroId of Object.keys(eq.heroEquipment)) {
        const he = eq.heroEquipment[heroId];
        if (!he || typeof he !== 'object') continue;

        const slotUids = [he.weaponId, he.armorId, he.accessoryId];
        for (const slotUid of slotUids) {
          if (slotUid && typeof slotUid === 'string' && !eq.instances[slotUid]) {
            issues.push({
              path: `equipment.heroEquipment[${heroId}]`,
              severity: 'warning',
              message: `穿戴的装备 ${slotUid} 在 instances 中不存在`,
            });
          }
        }
      }
    }

    return { valid: issues.filter((i) => i.severity === 'error').length === 0, issues };
  }

  private _validateSettings(container: SaveContainer): SubValidationResult {
    const issues: ValidationIssue[] = [];
    const s = container.settings;

    if (!s || typeof s !== 'object') {
      issues.push({ path: 'settings', severity: 'error', message: 'settings 数据缺失' });
      return { valid: false, issues };
    }

    if (typeof s.musicVolume !== 'number' || !Number.isFinite(s.musicVolume)) {
      issues.push({ path: 'settings.musicVolume', severity: 'error', message: 'musicVolume 类型错误' });
    } else if (s.musicVolume < MIN_VOLUME || s.musicVolume > MAX_VOLUME) {
      issues.push({ path: 'settings.musicVolume', severity: 'warning', message: `musicVolume 超出范围: ${s.musicVolume}` });
    }

    if (typeof s.sfxVolume !== 'number' || !Number.isFinite(s.sfxVolume)) {
      issues.push({ path: 'settings.sfxVolume', severity: 'error', message: 'sfxVolume 类型错误' });
    } else if (s.sfxVolume < MIN_VOLUME || s.sfxVolume > MAX_VOLUME) {
      issues.push({ path: 'settings.sfxVolume', severity: 'warning', message: `sfxVolume 超出范围: ${s.sfxVolume}` });
    }

    return { valid: issues.filter((i) => i.severity === 'error').length === 0, issues };
  }

  private _validateAd(container: SaveContainer): SubValidationResult {
    const issues: ValidationIssue[] = [];
    const a = container.ad;

    if (!a || typeof a !== 'object') {
      issues.push({ path: 'ad', severity: 'error', message: 'ad 数据缺失' });
      return { valid: false, issues };
    }

    if (typeof a.totalWatched !== 'number' || a.totalWatched < 0) {
      issues.push({ path: 'ad.totalWatched', severity: 'error', message: 'totalWatched 无效' });
    }
    if (typeof a.todayWatched !== 'number' || a.todayWatched < 0) {
      issues.push({ path: 'ad.todayWatched', severity: 'error', message: 'todayWatched 无效' });
    }
    if (typeof a.lastWatchDate !== 'string') {
      issues.push({ path: 'ad.lastWatchDate', severity: 'warning', message: 'lastWatchDate 类型错误' });
    }

    return { valid: issues.filter((i) => i.severity === 'error').length === 0, issues };
  }

  private _validateGrowth(container: SaveContainer): SubValidationResult {
    const issues: ValidationIssue[] = [];
    const g = container.growth;

    if (!g || typeof g !== 'object') {
      issues.push({ path: 'growth', severity: 'error', message: 'growth 数据缺失' });
      return { valid: false, issues };
    }

    // playerProgress
    const pp = g.playerProgress;
    if (!pp || typeof pp !== 'object') {
      issues.push({ path: 'growth.playerProgress', severity: 'error', message: 'playerProgress 数据缺失' });
    } else {
      if (typeof pp.playerLevel !== 'number' || pp.playerLevel < MIN_LEVEL) {
        issues.push({ path: 'growth.playerProgress.playerLevel', severity: 'error', message: 'playerLevel 无效' });
      }
      if (typeof pp.playerExp !== 'number' || pp.playerExp < 0) {
        issues.push({ path: 'growth.playerProgress.playerExp', severity: 'error', message: 'playerExp 无效' });
      }
      if (typeof pp.totalPower !== 'number' || pp.totalPower < MIN_POWER) {
        issues.push({ path: 'growth.playerProgress.totalPower', severity: 'error', message: 'totalPower 无效' });
      } else if (pp.totalPower > MAX_POWER) {
        issues.push({ path: 'growth.playerProgress.totalPower', severity: 'warning', message: `totalPower 超出合理范围: ${pp.totalPower}` });
      }
      if (!pp.highestStageId || typeof pp.highestStageId !== 'string') {
        issues.push({ path: 'growth.playerProgress.highestStageId', severity: 'error', message: 'highestStageId 缺失或类型错误' });
      }
      if (typeof pp.lastGrowthAt !== 'number') {
        issues.push({ path: 'growth.playerProgress.lastGrowthAt', severity: 'warning', message: 'lastGrowthAt 类型错误' });
      }
    }

    // heroProgressList
    if (!Array.isArray(g.heroProgressList)) {
      issues.push({ path: 'growth.heroProgressList', severity: 'error', message: 'heroProgressList 不是数组' });
    } else {
      for (let i = 0; i < g.heroProgressList.length; i++) {
        const hp = g.heroProgressList[i];
        const base = `growth.heroProgressList[${i}]`;

        if (!hp.heroId || typeof hp.heroId !== 'string') {
          issues.push({ path: `${base}.heroId`, severity: 'error', message: 'heroId 缺失或类型错误' });
        }
        if (typeof hp.level !== 'number' || hp.level < MIN_LEVEL || hp.level > MAX_LEVEL) {
          issues.push({ path: `${base}.level`, severity: 'error', message: `level 无效: ${hp.level}` });
        }
        if (typeof hp.exp !== 'number' || hp.exp < MIN_EXP) {
          issues.push({ path: `${base}.exp`, severity: 'error', message: 'exp 无效' });
        }
        if (typeof hp.power !== 'number' || hp.power < MIN_POWER) {
          issues.push({ path: `${base}.power`, severity: 'error', message: 'power 无效' });
        }
      }
    }

    // Phase7-Step5: heroProgressV2List（optional，有则校验）
    if (g.heroProgressV2List !== undefined) {
      if (!Array.isArray(g.heroProgressV2List)) {
        issues.push({
          path: 'growth.heroProgressV2List',
          severity: 'error',
          message: 'heroProgressV2List 不是数组',
        });
      } else {
        for (let i = 0; i < g.heroProgressV2List.length; i++) {
          const hpv2 = g.heroProgressV2List[i];
          const base = `growth.heroProgressV2List[${i}]`;

          if (!hpv2 || typeof hpv2 !== 'object') {
            issues.push({ path: base, severity: 'error', message: 'heroProgressV2List 条目为空' });
            continue;
          }

          if (!hpv2.heroId || typeof hpv2.heroId !== 'string') {
            issues.push({ path: `${base}.heroId`, severity: 'error', message: 'heroId 缺失或类型错误' });
          }

          if (!hpv2.tracks || typeof hpv2.tracks !== 'object') {
            issues.push({ path: `${base}.tracks`, severity: 'error', message: 'tracks 缺失或类型错误' });
          } else {
            for (const [trackId, trackState] of Object.entries(hpv2.tracks)) {
              const trackBase = `${base}.tracks.${trackId}`;

              if (!trackState || typeof trackState !== 'object') {
                issues.push({ path: trackBase, severity: 'error', message: '轨道状态为空' });
                continue;
              }

              if (typeof trackState.level !== 'number' || trackState.level < MIN_LEVEL) {
                issues.push({ path: `${trackBase}.level`, severity: 'error', message: `level 无效: ${trackState.level}` });
              }

              if (typeof trackState.exp !== 'number' || trackState.exp < MIN_EXP) {
                issues.push({ path: `${trackBase}.exp`, severity: 'error', message: `exp 无效: ${trackState.exp}` });
              }
            }
          }

          if (typeof hpv2.totalExpReceived !== 'number' || hpv2.totalExpReceived < 0) {
            issues.push({
              path: `${base}.totalExpReceived`,
              severity: 'error',
              message: `totalExpReceived 无效: ${hpv2.totalExpReceived}`,
            });
          }
        }
      }
    }

    return { valid: issues.filter((i) => i.severity === 'error').length === 0, issues };
  }

  private _validateDungeon(container: SaveContainer): SubValidationResult {
    const issues: ValidationIssue[] = [];
    const d = container.dungeon;

    if (!d || typeof d !== 'object') {
      issues.push({ path: 'dungeon', severity: 'error', message: 'dungeon 数据缺失' });
      return { valid: false, issues };
    }

    if (!d.instances || typeof d.instances !== 'object') {
      issues.push({ path: 'dungeon.instances', severity: 'error', message: 'instances 不是对象' });
    }

    if (!Array.isArray(d.runHistory)) {
      issues.push({ path: 'dungeon.runHistory', severity: 'error', message: 'runHistory 不是数组' });
    }

    if (!d.todayAttempts || typeof d.todayAttempts !== 'object') {
      issues.push({ path: 'dungeon.todayAttempts', severity: 'error', message: 'todayAttempts 不是对象' });
    }

    if (typeof d.lastAttemptDate !== 'string') {
      issues.push({ path: 'dungeon.lastAttemptDate', severity: 'warning', message: 'lastAttemptDate 类型错误' });
    }

    if (typeof d.currentStamina !== 'number' || !Number.isFinite(d.currentStamina)) {
      issues.push({ path: 'dungeon.currentStamina', severity: 'error', message: 'currentStamina 类型错误' });
    } else if (d.currentStamina < MIN_STAMINA || d.currentStamina > MAX_STAMINA) {
      issues.push({ path: 'dungeon.currentStamina', severity: 'warning', message: `currentStamina 超出合理范围: ${d.currentStamina}` });
    }

    if (typeof d.maxStamina !== 'number' || !Number.isFinite(d.maxStamina)) {
      issues.push({ path: 'dungeon.maxStamina', severity: 'error', message: 'maxStamina 类型错误' });
    } else if (d.maxStamina <= 0 || d.maxStamina > MAX_STAMINA) {
      issues.push({ path: 'dungeon.maxStamina', severity: 'warning', message: `maxStamina 超出合理范围: ${d.maxStamina}` });
    }

    return { valid: issues.filter((i) => i.severity === 'error').length === 0, issues };
  }

  private _validateDropHistory(container: SaveContainer): SubValidationResult {
    const issues: ValidationIssue[] = [];
    const dh = container.dropHistory;

    if (!dh || typeof dh !== 'object') {
      issues.push({ path: 'dropHistory', severity: 'error', message: 'dropHistory 数据缺失' });
      return { valid: false, issues };
    }

    if (!Array.isArray(dh.history)) {
      issues.push({ path: 'dropHistory.history', severity: 'error', message: 'history 不是数组' });
    }

    return { valid: issues.filter((i) => i.severity === 'error').length === 0, issues };
  }

  /** V7 神器背包子校验 */
  private _validateArtifactInventorySub(container: SaveContainer): SubValidationResult {
    const issues = this.validateArtifactInventory(container.artifactInventory);
    return { valid: issues.filter((i) => i.severity === 'error').length === 0, issues };
  }

  /** V7 运营活动状态子校验 */
  private _validateLiveOpsStateSub(container: SaveContainer): SubValidationResult {
    const issues = this.validateLiveOpsState(container.liveOpsState);
    return { valid: issues.filter((i) => i.severity === 'error').length === 0, issues };
  }

  /** V7 特殊事件状态子校验 */
  private _validateSpecialEventStatesSub(container: SaveContainer): SubValidationResult {
    const issues = this.validateSpecialEventStates(container.specialEventStates);
    return { valid: issues.filter((i) => i.severity === 'error').length === 0, issues };
  }
}
