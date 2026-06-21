// ============================================================
// SaveContainerV8 — Phase9-Step6 SaveV2 顶层存档容器
// 职责：定义 V8 存档接口、SaveMetaV2、工厂函数
// 位置：Save 层
// 边界：只定义类型与工厂函数，不包含业务逻辑
//
// 版本历史：
// - V0–V7: 见 SaveContainer.ts
// - V8: Phase9-Step6 SaveV2（heroes / skills / formations 模块 + SaveMetaV2）
// ============================================================

import type { SaveContainer } from './SaveContainer';
import { CURRENT_SAVE_VERSION, createDefaultSaveContainer } from './SaveContainer';
import type { HeroSaveData } from './HeroSaveData';
import type { SkillSaveData, SkillLevelEntry } from './SkillSaveData';
import type { FormationSaveData } from './FormationSaveData';
import type { ChapterSaveData } from './ChapterSaveData';
import { createDefaultHeroSaveData } from './HeroSaveData';
import { createDefaultSkillSaveData } from './SkillSaveData';
import { createDefaultFormationSaveData } from './FormationSaveData';
import { createDefaultChapterSaveData } from './ChapterSaveData';
import type { TutorialSaveData } from './TutorialSaveData';
import { createDefaultTutorialSaveData } from './TutorialSaveData';
import type { HeroTalentSaveData } from './HeroTalentSaveData';
import { createDefaultHeroTalentSaveData } from './HeroTalentSaveData';
import type { ChapterEventSaveData } from '../chapter/ChapterEventTypes';
import { createDefaultChapterEventSaveData } from '../chapter/ChapterEventTypes';
import type { RewardSaveData } from '../reward/RewardTypes';
import { createDefaultRewardSaveData } from '../reward/RewardTypes';
import type { InventorySaveData } from '../inventory/InventorySaveData';
import { createDefaultInventorySaveData } from '../inventory/InventorySaveData';
import type { EquipmentSaveDataV2 } from '../equipment/EquipmentLoadoutData';
import { createDefaultEquipmentSaveDataV2 } from '../equipment/EquipmentLoadoutData';

// ==================== SaveMetaV2 ====================

/**
 * SaveV2 元数据。
 *
 * 新增字段用于追踪存档创建/更新/迁移/配置版本/幂等开销。
 */
export interface SaveMetaV2 {
  /** 存档首次创建时间戳（Unix ms） */
  createdAt: number;
  /** 存档最后更新时间戳（Unix ms） */
  updatedAt: number;
  /** 从哪个版本迁移而来（0 表示全新存档） */
  migratedFromVersion: number;
  /** 配置文件版本追踪：configPath → version string */
  configVersions: Record<string, string>;
  /** 最后一次奖励发放事务 ID（幂等性） */
  lastRewardTransactionId: string;
}

/** 创建默认 SaveMetaV2 */
export function createDefaultSaveMetaV2(migratedFromVersion: number = 0): SaveMetaV2 {
  const now = Date.now();
  return {
    createdAt: now,
    updatedAt: now,
    migratedFromVersion,
    configVersions: {},
    lastRewardTransactionId: '',
  };
}

// ==================== 预留子模块类型 ====================

/** 章节进度存档 — 类型定义见 ChapterSaveData.ts（Phase9-Step7 实现） */
export type { ChapterSaveData } from './ChapterSaveData';

/** 新手引导状态存档（Phase9-Step9 实现） */
export type { TutorialSaveData } from './TutorialSaveData';

/** 分析数据存档（Phase9-Step10 实现） */
export type { AnalyticsSaveData } from '../analytics/AnalyticsSaveData';
import { createDefaultAnalyticsSaveData } from '../analytics/AnalyticsSaveData';
export { createDefaultAnalyticsSaveData };

// ==================== SaveContainerV8 ====================

/**
 * V8 存档容器接口。
 *
 * 扩展 V7 SaveContainer，新增 Phase9 模块字段和 SaveMetaV2。
 */
export interface SaveContainerV8 extends SaveContainer {
  /** Phase9-Step1: 英雄模块存档 */
  heroes?: HeroSaveData;
  /** Phase9-Step2: 技能模块存档 */
  skills?: SkillSaveData;
  /** Phase9-Step3: 阵容模块存档 */
  formations?: FormationSaveData;
  /** Phase9 预留: 章节进度 */
  chapters?: ChapterSaveData;
  /** Phase9 预留: 新手引导进度 */
  tutorial?: TutorialSaveData;
  /** Phase9 预留: 分析数据 */
  analytics?: AnalyticsSaveData;
  /** Phase10-Step1: 英雄天赋数据 */
  heroTalentData?: HeroTalentSaveData;
  /** Phase10-Step2: 技能等级精简存储（skillId → { level }） */
  skillData?: Record<string, SkillLevelEntry>;
  /** Phase10-Step3: 章节事件数据（可选，旧存档自动补全） */
  chapterData?: ChapterEventSaveData;
  /** Phase10-Step4: 奖励系统数据（可选，旧存档自动补全） */
  rewardData?: RewardSaveData;
  /** Phase10-Step5: 资产系统数据（可选，旧存档自动补全） */
  inventoryData?: InventorySaveData;
  /** Phase10-Step6: 装备穿戴关系数据（可选，旧存档自动补全） */
  equipmentData?: EquipmentSaveDataV2;
  /** SaveV2 元数据 */
  saveMetaV2: SaveMetaV2;
}

// ==================== 工厂函数 ====================

/**
 * 从 V7 SaveContainer 升级到 V8 SaveContainerV8。
 *
 * 调用方（SaveV2Migrator）负责填充 heroes / skills / formations。
 * 此工厂只保证所有字段存在默认值。
 *
 * @param container  V7 存档容器
 * @returns          V8 存档容器（原地升级 + 返回同一引用）
 */
export function upgradeToV8(container: SaveContainer): SaveContainerV8 {
  const v8 = container as SaveContainerV8;

  // 确保 Phase9 模块字段存在
  if (!v8.heroes) {
    v8.heroes = createDefaultHeroSaveData();
  }
  if (!v8.skills) {
    v8.skills = createDefaultSkillSaveData();
  }
  if (!v8.formations) {
    v8.formations = createDefaultFormationSaveData();
  }

  // 确保预留字段存在
  if (!v8.chapters) {
    v8.chapters = createDefaultChapterSaveData();
  }
  if (!v8.tutorial) {
    v8.tutorial = createDefaultTutorialSaveData();
  }
  if (!v8.analytics) {
    v8.analytics = createDefaultAnalyticsSaveData();
  }

  // 确保 SaveMetaV2 存在
  if (!v8.saveMetaV2) {
    v8.saveMetaV2 = createDefaultSaveMetaV2(v8.saveVersion ?? 0);
  }

  // Phase10-Step1: 确保天赋数据存在
  if (!v8.heroTalentData) {
    v8.heroTalentData = createDefaultHeroTalentSaveData();
  }

  // Phase10-Step2: 确保 skillData 存在（旧存档自动补全）
  if (!v8.skillData) {
    v8.skillData = {};
  }

  // Phase10-Step3: 确保章节事件数据存在（旧存档自动补全，不触发迁移）
  if (!v8.chapterData) {
    v8.chapterData = createDefaultChapterEventSaveData();
  }

  // Phase10-Step4: 确保奖励数据存在（旧存档自动补全，不触发迁移）
  if (!v8.rewardData) {
    v8.rewardData = createDefaultRewardSaveData();
  }

  // Phase10-Step5: 确保资产数据存在（旧存档自动补全，不触发迁移）
  if (!v8.inventoryData) {
    v8.inventoryData = createDefaultInventorySaveData();
  }

  // Phase10-Step6: 确保装备穿戴关系数据存在（旧存档自动补全，不触发迁移）
  if (!v8.equipmentData) {
    v8.equipmentData = createDefaultEquipmentSaveDataV2();
  }

  // 更新版本号
  v8.saveVersion = CURRENT_SAVE_VERSION;

  return v8;
}

/**
 * 创建全新的 V8 默认存档容器。
 *
 * @returns  新的 V8 存档容器
 */
export function createDefaultSaveContainerV8(): SaveContainerV8 {
  // 从 V7 默认容器升级
  const base = createDefaultSaveContainer() as SaveContainerV8;

  base.heroes = createDefaultHeroSaveData();
  base.skills = createDefaultSkillSaveData();
  base.formations = createDefaultFormationSaveData();
  base.chapters = createDefaultChapterSaveData();
  base.tutorial = createDefaultTutorialSaveData();
  base.analytics = createDefaultAnalyticsSaveData();
  base.heroTalentData = createDefaultHeroTalentSaveData();
  base.skillData = {};
  base.chapterData = createDefaultChapterEventSaveData();
  base.rewardData = createDefaultRewardSaveData();
  base.inventoryData = createDefaultInventorySaveData();
  base.equipmentData = createDefaultEquipmentSaveDataV2();
  base.saveMetaV2 = createDefaultSaveMetaV2(0);
  base.saveVersion = CURRENT_SAVE_VERSION;
  base.timestamp = Date.now();

  return base;
}
