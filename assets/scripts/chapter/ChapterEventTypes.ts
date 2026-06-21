// ============================================================
// ChapterEventTypes.ts — Phase10-Step3 关卡动态扩展系统核心类型
// 职责：定义章节事件、动态敌人、关卡扩展配置及运行时快照
// 规范：零 any / 枚举约束 / 所有数值可序列化
// 边界：不修改 ChapterTypes.ts（Phase9 已定义类型）
// ============================================================

// ==================== 事件类型枚举 ====================

/** 章节事件类型 */
export type ChapterEventType = 'shop' | 'buff' | 'boss' | 'elite' | 'reward';

/** 事件触发条件 */
export interface EventTriggerCondition {
  /** 最小章节通关次数（0 = 任意） */
  minChapterCompletions: number;
  /** 是否仅在 Boss 关卡触发 */
  bossOnlyStages: boolean;
}

// ==================== 章节事件配置 ====================

/** 单条章节事件配置（对应 chapter_event_config.json 中 events[] 每一项） */
export interface ChapterEventConfig {
  /** 事件唯一 ID */
  id: string;
  /** 所属章节 ID */
  chapterId: string;
  /** 事件名称 */
  name: string;
  /** 事件描述 */
  description: string;
  /** 权重（越大越容易抽中） */
  weight: number;
  /** 事件类型 */
  type: ChapterEventType;
  /** 事件图标资源路径 */
  iconPath: string;
  /** 触发条件 */
  triggerCondition: EventTriggerCondition;
}

// ==================== chapter_event_config.json 顶层结构 ====================

/** chapter_event_config.json 顶层结构 */
export interface ChapterEventConfigList {
  /** 配置格式版本号 */
  version: number;
  /** 配置表名称 */
  name: string;
  /** 事件数据数组 */
  events: ChapterEventConfig[];
}

// ==================== 动态敌人配置 ====================

/** 单条动态敌人配置（对应 dynamic_enemy_config.json 中 enemies[] 每一项） */
export interface DynamicEnemyConfig {
  /** 动态敌人唯一 ID */
  id: string;
  /** 基础敌人 ID（引用 enemy_data.json） */
  baseEnemyId: string;
  /** 名称后缀（如 "(强化)"、"(精英)") */
  nameSuffix: string;
  /** HP 倍率 */
  hpMultiplier: number;
  /** 攻击力倍率 */
  atkMultiplier: number;
  /** 防御力倍率 */
  defMultiplier: number;
  /** 速度倍率 */
  speedMultiplier: number;
  /** 等级加成（在基础敌人等级上增加） */
  levelBonus: number;
  /** 掉落池覆盖 ID（null 表示沿用基础敌人的掉落池） */
  dropGroupOverride: string | null;
}

/** dynamic_enemy_config.json 顶层结构 */
export interface DynamicEnemyConfigList {
  /** 配置格式版本号 */
  version: number;
  /** 配置表名称 */
  name: string;
  /** 动态敌人数据数组 */
  enemies: DynamicEnemyConfig[];
}

// ==================== 关卡扩展配置 ====================

/** 单条关卡扩展配置（对应 stage_extension_config.json 中 stages[] 每一项） */
export interface StageExtensionConfig {
  /** 关卡 ID */
  stageId: string;
  /** 可用事件池（事件 ID 列表） */
  eventPool: string[];
  /** 可用动态敌人池（动态敌人 ID 列表） */
  enemyPool: string[];
}

/** stage_extension_config.json 顶层结构 */
export interface StageExtensionConfigList {
  /** 配置格式版本号 */
  version: number;
  /** 配置表名称 */
  name: string;
  /** 关卡扩展数据数组 */
  stages: StageExtensionConfig[];
}

// ==================== 运行时快照 ====================

/** 动态敌人运行时快照（供 BattleUnitFactory / BattleManager 消费） */
export interface DynamicEnemySnapshot {
  /** 动态敌人配置 ID */
  dynamicEnemyId: string;
  /** 基础敌人配置 ID */
  baseEnemyId: string;
  /** 敌人名称（含后缀） */
  name: string;
  /** 敌人类型（从基础敌人继承） */
  enemyType: 'normal' | 'elite' | 'boss';
  /** 阵营 */
  faction: string;
  /** 元素 */
  element: string;
  /** 计算后的等级 */
  level: number;
  /** 计算后的 HP */
  hp: number;
  /** 计算后的攻击力 */
  attack: number;
  /** 计算后的防御力 */
  defense: number;
  /** 计算后的速度 */
  speed: number;
  /** 技能 ID 列表 */
  skillIds: string[];
  /** 掉落池 ID */
  dropId: string;
  /** 是否为 Boss */
  isBoss: boolean;
}

/** 章节事件记录（运行时追踪） */
export interface ChapterEventRecord {
  /** 事件配置 ID */
  eventId: string;
  /** 所属章节 ID */
  chapterId: string;
  /** 事件名称 */
  eventName: string;
  /** 事件类型 */
  eventType: ChapterEventType;
  /** 触发时间戳 */
  triggeredAt: number;
}

// ==================== 章节事件存档数据 ====================

/**
 * 章节事件存档数据（SaveV2 可选字段 chapterData）。
 *
 * 旧存档自动补全，缺失字段自动创建，不升级版本号，不触发迁移。
 */
export interface ChapterEventSaveData {
  /** 最后触发的事件 ID */
  lastEventId?: string;
  /** 事件触发历史记录 */
  eventHistory?: ChapterEventRecord[];
  /** 存档版本号 */
  saveVersion?: number;
  /** 最后更新时间戳 */
  updatedAt?: number;
}

// ==================== 工厂函数 ====================

/** 创建默认 ChapterEventSaveData */
export function createDefaultChapterEventSaveData(): ChapterEventSaveData {
  return {
    lastEventId: '',
    eventHistory: [],
    saveVersion: 1,
    updatedAt: Date.now(),
  };
}
