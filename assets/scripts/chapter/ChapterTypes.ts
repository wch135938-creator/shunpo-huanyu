// ============================================================
// ChapterTypes.ts — Phase9 ChapterSystem 核心类型定义
// 职责：定义章节配置、关卡配置、章节进度与快照
// 规范：零 any / 枚举约束状态 / 所有数值可序列化
// ============================================================

// ==================== 关卡类型枚举 ====================

/** 关卡类型 */
export type StageType = 'normal' | 'boss' | 'elite';

/** 章节状态 */
export type ChapterStatus = 'locked' | 'unlocked' | 'completed';

/** 关卡状态 */
export type StageStatus = 'locked' | 'unlocked' | 'completed';

// ==================== 奖励定义 ====================

/** 关卡奖励条目 */
export interface StageReward {
  /** 奖励类型：gold / exp / hero / equipment / item */
  type: 'gold' | 'exp' | 'hero' | 'equipment' | 'item';
  /** 奖励 ID（如 hero_001, equipment_001） */
  id: string;
  /** 数量 */
  amount: number;
}

// ==================== 关卡准入条件 ====================

/** 装备槽位类型（用于准入条件指定检查的槽位） */
export type StageEntryEquipmentSlot =
  | 'Weapon'
  | 'Armor'
  | 'Accessory';

/** 已穿戴装备强化等级准入要求。
 *  slots 中列出的每个已装备槽位都必须分别达到 minLevel。 */
export interface EquippedEnhanceLevelRequirement {
  type: 'equippedEnhanceLevel';
  slots: StageEntryEquipmentSlot[];
  minLevel: number;
}

/** 关卡准入条件联合类型 */
export type StageEntryRequirement =
  | EquippedEnhanceLevelRequirement;

// ==================== 关卡配置 ====================

/**
 * 关卡配置（对应 chapter_data.json 中 stages[] 每一项）。
 */
export interface StageConfig {
  /** 关卡唯一 ID，如 stage_001_01 */
  id: string;
  /** 关卡名称 */
  name: string;
  /** 所属章节 ID */
  chapterId: string;
  /** 关卡序号（1-based，章节内排序） */
  stageIndex: number;
  /** 关卡类型 */
  type: StageType;
  /** 推荐战力 */
  recommendedPower: number;
  /** 敌方阵容组 ID（对应 enemy_data.json 中 enemyGroupId） */
  enemyGroupId: string;
  /** Boss ID（boss 关卡必填） */
  bossId: string;
  /** 关卡奖励列表 */
  rewards: StageReward[];
  /** 解锁条件 */
  unlockCondition: StageUnlockCondition;
  /** 消耗体力 */
  staminaCost: number;
  /**
   * [Step12A-B] BattleManager stageId 映射。
   * 将 Chapter 关卡映射到 stage_data.json 中的 Battle 关卡。
   * 仅在已完成映射的关卡上设置；未设置的关卡 Coordinator 拒绝启动。
   * 可选字段 — 旧配置兼容，缺失时 Coordinator 返回"后续关卡尚未接入"。
   */
  battleStageId?: string;
  /**
   * [C1.5.9-G-B2-A11] 关卡准入条件列表。
   * 可选字段 — 缺失时保持旧关卡行为（无条件准入）。
   * 不得修改 unlockCondition 语义。
   */
  entryRequirements?: StageEntryRequirement[];
}

// ==================== 解锁条件 ====================

/**
 * 关卡解锁条件。
 *
 * 支持三种条件（按优先级）：
 * 1. 前置关卡完成（prevStageId）
 * 2. 玩家等级要求（playerLevel）
 * 3. 总战力要求（totalPower）
 */
export interface StageUnlockCondition {
  /** 前置关卡 ID（首个关卡为 null） */
  prevStageId: string | null;
  /** 玩家最低等级 */
  playerLevel: number;
  /** 最低总战力 */
  totalPower: number;
}

// ==================== 章节配置 ====================

/**
 * 章节配置（对应 chapter_data.json 中 data[] 每一项）。
 */
export interface ChapterConfig {
  /** 章节唯一 ID，如 chapter_001 */
  id: string;
  /** 章节名称 */
  name: string;
  /** 章节序号（1-based） */
  chapterIndex: number;
  /** 章节描述 */
  description: string;
  /** 章节图标资源路径 */
  iconPath: string;
  /** 章节推荐总战力（所有关卡推荐战力最大值） */
  recommendedPower: number;
  /** 章节包含的关卡列表 */
  stages: StageConfig[];
  /** 章节解锁条件 */
  unlockCondition: ChapterUnlockCondition;
}

// ==================== 章节解锁条件 ====================

/**
 * 章节解锁条件。
 */
export interface ChapterUnlockCondition {
  /** 前置章节 ID（首个章节为 null） */
  prevChapterId: string | null;
  /** 玩家最低等级 */
  playerLevel: number;
}

// ==================== chapter_data.json 顶层结构 ====================

/** chapter_data.json 顶层结构 */
export interface ChapterDataList {
  /** 配置格式版本号 */
  version: number;
  /** 配置表名称 */
  name: string;
  /** 章节数据数组 */
  data: ChapterConfig[];
}

// ==================== 章节进度 ====================

/**
 * 章节进度（持久化数据）。
 *
 * 记录玩家在每个章节/关卡的进度状态。
 */
export interface ChapterProgress {
  /** 章节 ID */
  chapterId: string;
  /** 章节状态 */
  status: ChapterStatus;
  /** 已完成关卡 ID 列表 */
  completedStageIds: string[];
  /** 当前可挑战的关卡 ID */
  currentStageId: string;
  /** 首次解锁时间戳（Unix ms） */
  unlockedAt: number;
  /** 首次完成时间戳（Unix ms，未完成时为 0） */
  completedAt: number;
  /** 最后更新时间戳 */
  updatedAt: number;
}

// ==================== 章节快照 ====================

/**
 * 章节快照。
 *
 * 在进入章节/战斗前生成，包含章节完整状态。
 * 供 BattleSystem / DungeonSystem / UI 等消费者使用。
 */
export interface ChapterSnapshot {
  /** 章节 ID */
  chapterId: string;
  /** 章节名称 */
  chapterName: string;
  /** 章节序号 */
  chapterIndex: number;
  /** 当前关卡 ID */
  currentStageId: string;
  /** 当前关卡配置 */
  currentStage: StageConfig | null;
  /** 已完成的关卡数 */
  completedStageCount: number;
  /** 章节总关卡数 */
  totalStageCount: number;
  /** 该章节已解锁关卡 ID 列表 */
  unlockedStageIds: string[];
  /** 推荐战力 */
  recommendedPower: number;
  /** 章节是否已全部完成 */
  isCompleted: boolean;
  /** 快照生成时间戳 */
  capturedAt: number;
}

// ==================== 工厂函数 ====================

/** 创建默认 StageReward */
export function createDefaultStageReward(): StageReward {
  return { type: 'gold', id: '', amount: 0 };
}

/** 创建默认 StageUnlockCondition */
export function createDefaultStageUnlockCondition(): StageUnlockCondition {
  return { prevStageId: null, playerLevel: 1, totalPower: 0 };
}

/** 创建默认 ChapterUnlockCondition */
export function createDefaultChapterUnlockCondition(): ChapterUnlockCondition {
  return { prevChapterId: null, playerLevel: 1 };
}

/** 创建默认 ChapterProgress */
export function createDefaultChapterProgress(chapterId: string): ChapterProgress {
  return {
    chapterId,
    status: 'locked',
    completedStageIds: [],
    currentStageId: '',
    unlockedAt: 0,
    completedAt: 0,
    updatedAt: Date.now(),
  };
}

/** 创建空的 ChapterSnapshot */
export function createEmptyChapterSnapshot(chapterId: string): ChapterSnapshot {
  return {
    chapterId,
    chapterName: '',
    chapterIndex: 0,
    currentStageId: '',
    currentStage: null,
    completedStageCount: 0,
    totalStageCount: 0,
    unlockedStageIds: [],
    recommendedPower: 0,
    isCompleted: false,
    capturedAt: Date.now(),
  };
}
