// ============================================================
// HeroTalentTypes.ts — Phase10-Step1 英雄成长路线 & 天赋类型定义
// 职责：定义 GrowthRoute / TalentConfig / TalentBonus 等核心类型
// 边界：纯类型定义，不包含业务逻辑，不依赖运行时系统
// ============================================================

// ==================== 成长路线配置 ====================

/** 成长路线主属性类型 */
export type GrowthMainStat = 'attack' | 'defense' | 'hp' | 'speed' | 'critRate' | 'critDamage';

/** 单条成长路线配置（对应 hero_growth_config.json 中 growthRoutes[] 每项） */
export interface GrowthRouteConfig {
  /** 路线唯一 ID，如 ROUTE_ATK */
  routeId: string;
  /** 路线显示名称，如 "破军" */
  routeName: string;
  /** 解锁所需英雄等级 */
  unlockLevel: number;
  /** 路线主属性 */
  mainStat: GrowthMainStat;
}

/** 单个英雄的成长路线分组配置（对应 hero_growth_config.json 中 data[] 每项） */
export interface HeroGrowthConfig {
  /** 英雄 ID */
  heroId: string;
  /** 成长路线列表 */
  growthRoutes: GrowthRouteConfig[];
}

/** hero_growth_config.json 顶层结构 */
export interface HeroGrowthDataList {
  /** 配置格式版本号 */
  version: string;
  /** 配置表名称 */
  name: string;
  /** 成长路线数据数组 */
  data: HeroGrowthConfig[];
}

// ==================== 天赋配置 ====================

/** 天赋效果类型 */
export type TalentEffectType =
  | 'attackPercent'
  | 'defensePercent'
  | 'hpPercent'
  | 'speedPercent'
  | 'critRate'
  | 'critDamage';

/** 单个天赋节点配置（对应 hero_talent_config.json 中 data[] 每项） */
export interface TalentConfig {
  /** 天赋唯一 ID，如 TALENT_001 */
  talentId: string;
  /** 所属英雄 ID */
  heroId: string;
  /** 所属成长路线 ID */
  routeId: string;
  /** 天赋显示名称，如 "破势一击" */
  talentName: string;
  /** 解锁所需英雄等级 */
  unlockLevel: number;
  /** 解锁消耗天赋点数 */
  cost: number;
  /** 效果类型 */
  effectType: TalentEffectType;
  /** 效果数值（百分比用小数，如 0.05 = 5%） */
  effectValue: number;
  /** 下一个天赋节点 ID（空字符串表示终点） */
  nextTalentId: string;
}

/** hero_talent_config.json 顶层结构 */
export interface HeroTalentDataList {
  /** 配置格式版本号 */
  version: string;
  /** 配置表名称 */
  name: string;
  /** 天赋数据数组 */
  data: TalentConfig[];
}

// ==================== 天赋存档数据 ====================

/** 单个英雄的天赋存档数据 */
export interface HeroTalentSaveEntry {
  /** 已解锁天赋 ID 列表 */
  unlockedTalentIds: string[];
  /** 当前选中的成长路线 ID */
  selectedRouteId: string;
  /** 当前可用天赋点数 */
  talentPoints: number;
}

/** 天赋模块存档数据（顶层） */
export interface HeroTalentSaveData {
  /** 英雄 ID → 天赋存档条目 */
  heroTalentMap: Record<string, HeroTalentSaveEntry>;
  /** 存档版本号 */
  saveVersion: number;
  /** 最后更新时间戳 */
  updatedAt: number;
}

// ==================== 天赋加成计算结果 ====================

/** 天赋效果加成类型 */
export type TalentBonusEffectType = TalentEffectType;

/** 单个天赋效果加成 */
export interface TalentBonusEntry {
  /** 效果类型 */
  effectType: TalentBonusEffectType;
  /** 效果来源天赋 ID */
  sourceTalentId: string;
  /** 效果数值 */
  value: number;
}

/** 英雄天赋总加成结果 */
export interface HeroTalentBonus {
  /** 英雄 ID */
  heroId: string;
  /** 当前选中路线 ID */
  selectedRouteId: string;
  /** 已解锁天赋数量 */
  unlockedTalentCount: number;
  /** 当前天赋点数 */
  talentPoints: number;
  /** 已解锁天赋 ID 列表 */
  unlockedTalentIds: string[];
  /** 天赋加成明细 */
  bonuses: TalentBonusEntry[];
  /** 按类型汇总的加成值 */
  bonusSummary: Partial<Record<TalentBonusEffectType, number>>;
}

// ==================== 工厂函数 ====================

/** 创建默认天赋存档条目 */
export function createDefaultHeroTalentSaveEntry(): HeroTalentSaveEntry {
  return {
    unlockedTalentIds: [],
    selectedRouteId: '',
    talentPoints: 0,
  };
}

/** 创建默认天赋模块存档数据 */
export function createDefaultHeroTalentSaveData(): HeroTalentSaveData {
  return {
    heroTalentMap: {},
    saveVersion: 1,
    updatedAt: Date.now(),
  };
}

/** 创建默认天赋加成结果 */
export function createDefaultHeroTalentBonus(heroId: string): HeroTalentBonus {
  return {
    heroId,
    selectedRouteId: '',
    unlockedTalentCount: 0,
    talentPoints: 0,
    unlockedTalentIds: [],
    bonuses: [],
    bonusSummary: {},
  };
}
