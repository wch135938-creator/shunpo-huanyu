// ============================================================
// stage_config.ts — stage_data.json 的 TypeScript 类型定义
// 职责：与 config/stages/stage_data.json 字段严格一一对应
// 规范：零 any / 联合类型约束 / 禁止硬编码
// ============================================================

// ==================== 枚举类型 ====================

/** 关卡类型 */
export type StageType = 'normal' | 'elite' | 'mini_boss' | 'boss';

/** 解锁条件类型 */
export type UnlockType = 'always' | 'prevStage' | 'playerLevel' | 'both';

// ==================== 子结构 ====================

/**
 * 关卡解锁条件
 *
 * 四种解锁模式：
 *   · always      — 无任何前置条件（仅第一关）
 *   · prevStage   — 需通关前置关卡
 *   · playerLevel — 需达到指定玩家等级
 *   · both        — 需同时满足前置关卡 + 玩家等级
 */
export interface UnlockCondition {
  /** 解锁类型 */
  type: UnlockType;
  /** 前置关卡 ID（type 含 prevStage 时必填） */
  prevStageId?: string;
  /** 所需玩家等级（type 含 playerLevel 时必填） */
  playerLevel?: number;
}

// ==================== 单条关卡 ====================

/**
 * 单条关卡配置（对应 stage_data.json data[] 中每一项）
 *
 * 调用示例：
 *   const cfg = ConfigManager.getInstance()
 *     .getConfig<StageDataConfig>('config/stages/stage_data');
 *   const stages: StageEntry[] = cfg.data;
 */
export interface StageEntry {
  /** 关卡唯一 ID，格式 STAGE_NNN */
  id: string;
  /** 关卡名称（调试显示） */
  name: string;
  /** 名称本地化 key */
  nameKey: string;
  /** 所属章节 ID，格式 CHAPTER_NNN */
  chapterId: string;
  /** 章节内序号（从 1 开始） */
  stageIndex: number;
  /** 关卡类型 */
  stageType: StageType;
  /** 是否为章节最终大Boss关（stageType 为 boss 时必为 true；mini_boss 不属于章节最终大Boss关） */
  isBossStage: boolean;
  /** 敌人阵容 ID 列表，引用 ENEMY_XXX */
  enemyIds: string[];
  /** 推荐战力 */
  recommendedPower: number;
  /** 体力消耗 */
  staminaCost: number;
  /** 常规掉落池 ID，引用 DROP_XXX */
  dropId: string;
  /** 首通掉落池 ID，引用 DROP_FXXX（独立于常规掉落） */
  firstDropId: string;
  /** 解锁条件 */
  unlockCondition: UnlockCondition;
  /** 战斗波次（1~3） */
  battleWave: number;
}

// ==================== 顶层结构 ====================

/**
 * stage_data.json 的顶层结构（三层：version / name / data[]）
 * 用于 ConfigManager.getConfig 的类型参数
 */
export interface StageDataConfig {
  /** 配置格式版本号 */
  version: string;
  /** 配置表名称（调试用） */
  name: string;
  /** 关卡数据数组 */
  data: StageEntry[];
}
