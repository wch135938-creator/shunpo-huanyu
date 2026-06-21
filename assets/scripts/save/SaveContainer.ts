// ============================================================
// SaveContainer — 顶层存档容器
// 职责：聚合所有存档子模块，携带版本号与时间戳
// 位置：Save 层
// ============================================================

import { PlayerSaveData } from './PlayerSaveData';
import { CardSaveData } from './CardSaveData';
import { EquipmentSaveData, createDefaultEquipmentSaveData } from './EquipmentSaveData';
import { SettingSaveData } from './SettingSaveData';
import { AdSaveData } from './AdSaveData';
import type { GrowthSaveData } from './GrowthSaveData';
import { DungeonSaveData, createDefaultDungeonSaveData } from './DungeonSaveData';
import { DropSaveData, createDefaultDropSaveData } from './DropSaveData';
import type { RoguelikeSaveData } from '../data/roguelike_types';
import { createDefaultRoguelikeSaveData } from '../data/roguelike_types';
import type { PowerFormulaSnapshot } from '../data/power_types';
import { createDefaultPowerFormulaSnapshot } from '../data/power_types';
import type { ArtifactInventory } from '../data/artifact_types';
import { createDefaultArtifactInventory } from '../data/artifact_types';
import type { LiveOpsState } from '../data/liveops_types';
import { createDefaultLiveOpsState } from '../data/liveops_types';
import type { SpecialEventState } from '../data/specialevent_types';

/** 当前支持的存档版本号
 *
 * 版本历史：
 * - V0: 无版本号（旧存档）
 * - V1: Phase6 里程碑（dungeon + dropHistory 模块标准化）
 * - V2: Phase7 里程碑（roguelikeState + 配置版本追踪）
 * - V3: Phase7-Step3 里程碑（事件历史 eventHistory）
 * - V4: Phase7-Step4 里程碑（DropHistoryRecord + PitySnapshot 保底系统）
 * - V5: Phase7-Step5 里程碑（HeroProgressStateV2 多轨成长）
 * - V6: Phase7-Step6 里程碑（PowerFormulaSnapshot 战力公式快照）
 * - V7: Phase7-Step7 里程碑（ArtifactInventory + LiveOpsState + SpecialEventStates）
 * - V8: Phase9-Step6 里程碑（SaveV2: heroes / skills / formations / SaveMetaV2）
 */
export const CURRENT_SAVE_VERSION = 8;

export interface SaveContainer {
  /** 存档版本号（用于数据迁移） */
  saveVersion: number;
  /** 存档时间戳 (Date.now()) */
  timestamp: number;
  /** 玩家数据 */
  player: PlayerSaveData;
  /** 卡牌列表 */
  cards: CardSaveData[];
  /** 装备数据 */
  equipment: EquipmentSaveData;
  /** 系统设置 */
  settings: SettingSaveData;
  /** 广告数据 */
  ad: AdSaveData;
  /** Phase4A 成长数据 */
  growth: GrowthSaveData;
  /** Phase6 地牢数据 */
  dungeon: DungeonSaveData;
  /** Phase6-Step2 掉落历史数据 */
  dropHistory: DropSaveData;
  /** Phase7 Roguelike 核心框架数据（V2+ 新增） */
  roguelikeState?: RoguelikeSaveData;
  /** Phase7-Step6 战力公式配置快照（V6+ 新增），用于迁移时公式版本控制 */
  powerFormulaSnapshot?: PowerFormulaSnapshot;
  /** Phase7-Step7 神器背包（V7+ 新增） */
  artifactInventory?: ArtifactInventory;
  /** Phase7-Step7 运营活动状态（V7+ 新增） */
  liveOpsState?: LiveOpsState;
  /** Phase7-Step7 特殊事件状态列表（V7+ 新增） */
  specialEventStates?: SpecialEventState[];
}

/** 生成默认存档容器（新用户首次初始化） */
export function createDefaultSaveContainer(): SaveContainer {
  return {
    saveVersion: CURRENT_SAVE_VERSION,
    timestamp: Date.now(),
    player: createDefaultPlayerData(),
    cards: [],
    equipment: createDefaultEquipmentData(),
    settings: createDefaultSettingData(),
    ad: createDefaultAdData(),
    growth: createDefaultGrowthData(),
    dungeon: createDefaultDungeonSaveData(),
    dropHistory: createDefaultDropSaveData(),
    roguelikeState: createDefaultRoguelikeSaveData(),
    powerFormulaSnapshot: createDefaultPowerFormulaSnapshot(),
    artifactInventory: createDefaultArtifactInventory(),
    liveOpsState: createDefaultLiveOpsState(),
    specialEventStates: [],
  };
}

function createDefaultPlayerData(): PlayerSaveData {
  return {
    level: 1,
    exp: 0,
    stageId: 1,
    combatPower: 0,
  };
}

function createDefaultEquipmentData(): EquipmentSaveData {
  return createDefaultEquipmentSaveData();
}

function createDefaultSettingData(): SettingSaveData {
  return {
    musicVolume: 80,
    sfxVolume: 80,
  };
}

function createDefaultAdData(): AdSaveData {
  return {
    totalWatched: 0,
    todayWatched: 0,
    lastWatchDate: '',
  };
}

export function createDefaultGrowthData(): GrowthSaveData {
  return {
    playerProgress: {
      playerLevel: 1,
      playerExp: 0,
      totalPower: 0,
      highestStageId: 'STAGE_001',
      lastGrowthAt: 0,
    },
    heroProgressList: [],
  };
}
