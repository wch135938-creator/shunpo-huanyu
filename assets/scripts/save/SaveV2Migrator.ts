// ============================================================
// SaveV2Migrator — Phase9-Step6 V7 → V8 迁移器
// 职责：处理 cards→heroes / skills→skills / formation→default_pve / meta 迁移
// 边界：只读容器数据，不修改其他系统运行时状态
// 规范：零 any / 数值范围校验 / 缺失数据补默认值
// ============================================================

import type { SaveContainer } from './SaveContainer';
import type { SaveContainerV8 } from './SaveContainerV8';
import { upgradeToV8, createDefaultSaveMetaV2 } from './SaveContainerV8';
import { createDefaultHeroSaveData } from './HeroSaveData';
import type { HeroSaveData } from './HeroSaveData';
import { createDefaultSkillSaveData } from './SkillSaveData';
import type { SkillSaveData } from './SkillSaveData';
import { createDefaultFormationSaveData } from './FormationSaveData';
import type { FormationSaveData } from './FormationSaveData';
import type { HeroRuntimeState } from '../hero/HeroTypes';
import { createDefaultHeroRuntimeState } from '../hero/HeroTypes';
import type { SkillRuntimeState } from '../skill/SkillTypes';
import { createDefaultSkillRuntimeState } from '../skill/SkillTypes';
import type { FormationPreset, FormationSlot } from '../formation/FormationTypes';
import {
  createEmptySlots,
  FORMATION_SLOT_COUNT,
} from '../formation/FormationTypes';

// ==================== 迁移结果 ====================

export interface V7ToV8MigrationResult {
  /** 是否成功 */
  success: boolean;
  /** 迁移的英雄数量 */
  heroesMigrated: number;
  /** 迁移的技能数量 */
  skillsMigrated: number;
  /** 创建的阵容预设数量 */
  formationsCreated: number;
  /** 警告信息 */
  warnings: string[];
  /** 错误信息 */
  errors: string[];
}

// ==================== 迁移器常量 ====================

/** 英雄等级合理上限 */
const HERO_MAX_LEVEL = 1000;
/** 英雄等级合理下限 */
const HERO_MIN_LEVEL = 1;
/** 英雄星级上限 */
const HERO_MAX_STAR = 7;
/** 英雄星级下限 */
const HERO_MIN_STAR = 0;
/** 英雄突破次数上限 */
const HERO_MAX_BREAKTHROUGH = 6;
/** 英雄突破次数下限 */
const HERO_MIN_BREAKTHROUGH = 0;
/** 技能等级下限 */
const SKILL_MIN_LEVEL = 1;
/** 阵容槽位数 */
const FORMATION_MAX_SLOTS = FORMATION_SLOT_COUNT;

export class SaveV2Migrator {

  // ==================== 主迁移入口 ====================

  /**
   * V7 → V8 迁移主入口。
   *
   * 流程：
   * 1. 从 V7 cards + growth 迁移 heroes
   * 2. 从 hero_data.json defaultSkillIds 迁移 skills
   * 3. 从已拥有英雄创建 default_pve 阵容
   * 4. 初始化 SaveMetaV2 和预留字段
   * 5. 设置 saveVersion = 8
   *
   * @param container  V7 存档容器
   * @param heroDefaultSkillMap  可选：heroId → defaultSkillIds[] 映射
   *                             用于 skill 迁移，如果未提供则创建空 skills
   * @returns          迁移结果
   */
  migrateV7ToV8(
    container: SaveContainer,
    heroDefaultSkillMap?: Map<string, string[]>,
  ): V7ToV8MigrationResult {
    const result: V7ToV8MigrationResult = {
      success: true,
      heroesMigrated: 0,
      skillsMigrated: 0,
      formationsCreated: 0,
      warnings: [],
      errors: [],
    };

    try {
      // Step 1: 迁移 heroes
      const heroResult = this._migrateHeroes(container);
      result.heroesMigrated = heroResult.count;
      result.warnings.push(...heroResult.warnings);

      // Step 2: 迁移 skills
      const skillResult = this._migrateSkills(container, heroDefaultSkillMap);
      result.skillsMigrated = skillResult.count;
      result.warnings.push(...skillResult.warnings);

      // Step 3: 迁移 formations
      const formationResult = this._migrateFormations(container);
      result.formationsCreated = formationResult.count;
      result.warnings.push(...formationResult.warnings);

      // Step 4: 升级到 V8（设置 saveMetaV2 + 预留字段 + saveVersion = 8）
      upgradeToV8(container);

      // 确保 saveMetaV2.migratedFromVersion 正确
      const v8 = container as SaveContainerV8;
      v8.saveMetaV2 = createDefaultSaveMetaV2(7); // migrated from V7
      v8.saveMetaV2.updatedAt = Date.now();

      console.log(
        `[SaveV2Migrator] V7→V8 迁移完成: ` +
        `${result.heroesMigrated} heroes, ${result.skillsMigrated} skills, ` +
        `${result.formationsCreated} formations`,
      );
    } catch (e) {
      result.success = false;
      result.errors.push(`迁移异常: ${String(e)}`);
      console.error(`[SaveV2Migrator] 迁移失败: ${e}`);
    }

    return result;
  }

  // ==================== Hero 迁移 ====================

  /**
   * 从 V7 cards + growth.heroProgressList → V8 heroes。
   *
   * 规则：
   * - cardId (number) 转换为 heroId (string): "hero_" + padStart(3, '0')
   * - card 数据和 growth 数据合并（growth 优先）
   * - 缺失字段补默认值
   * - 数值范围校验
   *
   * @param container  V7 存档容器
   * @returns          迁移计数与警告
   */
  private _migrateHeroes(container: SaveContainer): { count: number; warnings: string[] } {
    const warnings: string[] = [];
    const heroSave = createDefaultHeroSaveData();

    // 构建 heroId → CardSaveData 映射
    const cardMap = new Map<string, { level: number; star: number; exp: number }>();
    for (const card of container.cards) {
      if (typeof card.cardId !== 'number' || card.cardId <= 0) {
        warnings.push(`跳过无效 card.cardId=${card.cardId}`);
        continue;
      }
      const heroId = this._cardIdToHeroId(card.cardId);
      cardMap.set(heroId, {
        level: card.level ?? 1,
        star: card.star ?? 0,
        exp: card.exp ?? 0,
      });
    }

    // 构建 heroId → HeroProgressData 映射（growth 优先）
    const growthMap = new Map<string, { level: number; exp: number; power: number }>();
    if (container.growth && Array.isArray(container.growth.heroProgressList)) {
      for (const hp of container.growth.heroProgressList) {
        if (!hp.heroId || typeof hp.heroId !== 'string') {
          warnings.push('跳过无效 growth.heroProgressList 条目（heroId 缺失）');
          continue;
        }
        growthMap.set(hp.heroId, {
          level: hp.level ?? 1,
          exp: hp.exp ?? 0,
          power: hp.power ?? 0,
        });
      }
    }

    // 合并 card 和 growth 数据
    const allHeroIds = new Set([...cardMap.keys(), ...growthMap.keys()]);

    for (const heroId of allHeroIds) {
      const card = cardMap.get(heroId);
      const growth = growthMap.get(heroId);

      // 合并：growth 数据优先
      const mergedLevel = growth?.level ?? card?.level ?? 1;
      const mergedExp = growth?.exp ?? card?.exp ?? 0;
      const mergedStar = card?.star ?? 0;
      const mergedPower = growth?.power ?? 0;

      // 创建 hero runtime state
      const state: HeroRuntimeState = {
        heroId,
        level: this._clamp(mergedLevel, HERO_MIN_LEVEL, HERO_MAX_LEVEL),
        exp: Math.max(0, mergedExp),
        star: this._clamp(mergedStar, HERO_MIN_STAR, HERO_MAX_STAR),
        breakthrough: 0, // V7 无突破数据，默认 0
        power: Math.max(0, mergedPower),
        unlocked: true, // 从 cards 迁移来的都是已拥有的
        unlockedAt: container.timestamp,
        updatedAt: Date.now(),
      };

      heroSave.heroStates[heroId] = state;
    }

    const count = Object.keys(heroSave.heroStates).length;
    (container as SaveContainerV8).heroes = heroSave;

    return { count, warnings };
  }

  // ==================== Skill 迁移 ====================

  /**
   * 从 hero_data.json defaultSkillIds → V8 skills。
   *
   * 规则：
   * - 使用 heroDefaultSkillMap（heroId → defaultSkillIds[]）
   * - 每个技能创建 SkillRuntimeState: level = 1, unlocked = false
   * - 设置 heroSkillLoadouts 为每个英雄的默认技能列表
   * - 如果 heroDefaultSkillMap 未提供，创建空 skills
   *
   * @param container            V7 存档容器
   * @param heroDefaultSkillMap  英雄默认技能映射
   * @returns                    迁移计数与警告
   */
  private _migrateSkills(
    container: SaveContainer,
    heroDefaultSkillMap?: Map<string, string[]>,
  ): { count: number; warnings: string[] } {
    const warnings: string[] = [];
    const skillSave = createDefaultSkillSaveData();
    let count = 0;

    if (!heroDefaultSkillMap || heroDefaultSkillMap.size === 0) {
      // 无法获取配置，创建空 skills — SkillSystem.initialize() 会补全
      (container as SaveContainerV8).skills = skillSave;
      warnings.push('heroDefaultSkillMap 未提供，skills 初始化为空 — SkillSystem.initialize() 将补全');
      return { count: 0, warnings };
    }

    // 获取已迁移的英雄 ID 列表
    const heroes = (container as SaveContainerV8).heroes;
    const migratedHeroIds = heroes
      ? Object.keys(heroes.heroStates).filter((hid) => heroes.heroStates[hid].unlocked)
      : [];

    const allSkillIds = new Set<string>();

    for (const heroId of migratedHeroIds) {
      const defaultSkillIds = heroDefaultSkillMap.get(heroId);
      if (!defaultSkillIds || defaultSkillIds.length === 0) {
        warnings.push(`英雄 ${heroId} 无默认技能配置`);
        continue;
      }

      // 为每个默认技能创建状态（level=1）
      for (const skillId of defaultSkillIds) {
        if (!skillSave.skillStates[skillId]) {
          skillSave.skillStates[skillId] = createDefaultSkillRuntimeState(skillId);
          count += 1;
        }
        allSkillIds.add(skillId);
      }

      // 设置英雄默认技能装备
      skillSave.heroSkillLoadouts[heroId] = [...defaultSkillIds];
    }

    skillSave.updatedAt = Date.now();
    (container as SaveContainerV8).skills = skillSave;

    return { count, warnings };
  }

  // ==================== Formation 迁移 ====================

  /**
   * 从已拥有英雄创建 default_pve 阵容。
   *
   * 规则：
   * - 优先使用已拥有英雄（按战力降序）
   * - 不足 5 个时允许空槽
   * - 仅创建 pve 模式的 default 预设
   *
   * @param container  V7/SaveContainerV8 存档容器（heroes 字段已迁移完成）
   * @returns          迁移计数与警告
   */
  private _migrateFormations(container: SaveContainer): { count: number; warnings: string[] } {
    const warnings: string[] = [];
    const formationSave = createDefaultFormationSaveData();
    const v8 = container as SaveContainerV8;

    // 获取已拥有英雄
    const ownedHeroIds: string[] = [];
    if (v8.heroes && v8.heroes.heroStates) {
      for (const [heroId, state] of Object.entries(v8.heroes.heroStates)) {
        if (state.unlocked) {
          ownedHeroIds.push(heroId);
        }
      }
    }

    // 按战力降序排列
    ownedHeroIds.sort((a, b) => {
      const powerA = v8.heroes?.heroStates[a]?.power ?? 0;
      const powerB = v8.heroes?.heroStates[b]?.power ?? 0;
      return powerB - powerA;
    });

    // 填充槽位
    const slots: FormationSlot[] = createEmptySlots();
    for (let i = 0; i < Math.min(ownedHeroIds.length, FORMATION_MAX_SLOTS); i++) {
      slots[i].heroId = ownedHeroIds[i];
    }

    // 创建 default_pve 预设
    const defaultPvePreset: FormationPreset = {
      id: 'default_pve',
      name: '默认推图队',
      mode: 'pve',
      slots,
      teamPower: 0, // 运行时由 TeamSnapshotBuilder 计算
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    formationSave.presets['default_pve'] = defaultPvePreset;
    formationSave.activePresetIds.pve = 'default_pve';
    formationSave.updatedAt = Date.now();

    v8.formations = formationSave;

    if (ownedHeroIds.length < FORMATION_MAX_SLOTS) {
      warnings.push(
        `已拥有英雄数量 (${ownedHeroIds.length}) 不足阵容槽位数 (${FORMATION_MAX_SLOTS})，` +
        `剩余 ${FORMATION_MAX_SLOTS - ownedHeroIds.length} 个槽位为空`,
      );
    }

    return { count: 1, warnings };
  }

  // ==================== 工具方法 ====================

  /**
   * cardId (number) → heroId (string) 转换。
   *
   * 约定：1 → "hero_001", 42 → "hero_042"
   */
  private _cardIdToHeroId(cardId: number): string {
    return `hero_${String(Math.max(1, Math.floor(cardId))).padStart(3, '0')}`;
  }

  /** 数值范围钳制 */
  private _clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}
