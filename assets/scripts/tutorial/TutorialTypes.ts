// ============================================================
// TutorialTypes — Phase9-Step9 新手引导系统类型定义
// 职责：定义引导步骤/分组/进度/快照/配置数据结构
// 边界：仅数据结构，不包含业务逻辑
// ============================================================

// ==================== 引导步骤 ====================

/**
 * 单个引导步骤。
 *
 * 每个步骤属于一个引导组（TutorialGroup），按 order 字段排序执行。
 * highlightTarget 和 requiredAction 分别用于 UI 高亮和交互检测。
 */
export interface TutorialStep {
  /** 步骤唯一 ID（如 "tutorial_intro_01"） */
  stepId: string;
  /** 所属引导组 ID */
  groupId: string;
  /** 步骤序号（从 0 开始） */
  order: number;
  /** 标题 L10n Key */
  titleKey: string;
  /** 描述 L10n Key */
  descriptionKey: string;
  /** 高亮目标 UI 节点路径（可选） */
  highlightTarget?: string;
  /** 完成本步骤所需的交互动作（可选，如 "tap_target" / "drag_card" / "any_tap"） */
  requiredAction?: string;
}

// ==================== 引导组 ====================

/**
 * 引导组。
 *
 * 一个引导组包含多个有序步骤，代表一次完整的引导教学流程。
 * 例如：新手引导、战斗引导、装备引导、地牢引导。
 */
export interface TutorialGroup {
  /** 引导组唯一 ID */
  groupId: string;
  /** 引导组名称 L10n Key */
  nameKey: string;
  /** 引导组描述 */
  description: string;
  /** 引导步骤列表（按 order 排序） */
  steps: TutorialStep[];
  /** 前置引导组 ID 列表（必须先完成） */
  dependencies?: string[];
  /** 触发事件名（可选，自动触发的引导） */
  triggerEvent?: string;
  /** 优先级（数字越大越优先） */
  priority: number;
}

// ==================== 引导进度 ====================

/**
 * 引导进度（运行时）。
 *
 * 记录当前引导状态，包括当前步骤、已完成/已跳过的组和步骤。
 * 所有修改操作通过 TutorialSystem 进行，保证数据一致性。
 */
export interface TutorialProgress {
  /** 当前引导组 ID（空字符串表示无进行中的引导） */
  currentGroupId: string;
  /** 当前步骤 ID */
  currentStepId: string;
  /** 已完成的引导组 ID 列表 */
  completedGroupIds: string[];
  /** 已完成的步骤 ID 列表 */
  completedStepIds: string[];
  /** 已跳过的引导组 ID 列表 */
  skippedGroupIds: string[];
  /** 是否已完成全部引导 */
  isComplete: boolean;
}

// ==================== 引导快照（用于存档） ====================

/**
 * 引导快照。
 *
 * 相当于 TutorialProgress 的不可变快照，用于存档持久化。
 * snapshotAt 记录快照生成时间戳。
 */
export interface TutorialSnapshot {
  /** 当前引导组 ID */
  currentGroupId: string;
  /** 当前步骤 ID */
  currentStepId: string;
  /** 已完成的引导组 ID 列表 */
  completedGroupIds: string[];
  /** 已完成的步骤 ID 列表 */
  completedStepIds: string[];
  /** 已跳过的引导组 ID 列表 */
  skippedGroupIds: string[];
  /** 是否已完成全部引导 */
  isComplete: boolean;
  /** 快照生成时间戳 */
  snapshotAt: number;
}

// ==================== 引导配置数据（顶层） ====================

/**
 * 引导配置数据（tutorial_data.json 顶层结构）。
 */
export interface TutorialConfigData {
  /** 配置版本号 */
  version: number;
  /** 引导组列表 */
  groups: TutorialGroup[];
}

// ==================== 引导步骤完成结果 ====================

/**
 * 完成步骤的返回结果。
 */
export interface TutorialStepResult {
  /** 已完成的步骤 ID */
  stepId: string;
  /** 所属引导组 ID */
  groupId: string;
  /** 是否触发了引导组完成 */
  groupCompleted: boolean;
  /** 是否触发了全部引导完成 */
  allCompleted: boolean;
  /** 下一步骤 ID（null 表示当前引导组已无更多步骤） */
  nextStepId: string | null;
}

// ==================== 工厂函数 ====================

/** 创建默认引导进度 */
export function createDefaultTutorialProgress(): TutorialProgress {
  return {
    currentGroupId: '',
    currentStepId: '',
    completedGroupIds: [],
    completedStepIds: [],
    skippedGroupIds: [],
    isComplete: false,
  };
}

/** 从进度创建快照 */
export function createSnapshotFromProgress(
  progress: TutorialProgress,
  snapshotAt?: number,
): TutorialSnapshot {
  return {
    currentGroupId: progress.currentGroupId,
    currentStepId: progress.currentStepId,
    completedGroupIds: [...progress.completedGroupIds],
    completedStepIds: [...progress.completedStepIds],
    skippedGroupIds: [...progress.skippedGroupIds],
    isComplete: progress.isComplete,
    snapshotAt: snapshotAt ?? Date.now(),
  };
}

/** 从快照恢复进度 */
export function restoreProgressFromSnapshot(snapshot: TutorialSnapshot): TutorialProgress {
  return {
    currentGroupId: snapshot.currentGroupId,
    currentStepId: snapshot.currentStepId,
    completedGroupIds: [...snapshot.completedGroupIds],
    completedStepIds: [...snapshot.completedStepIds],
    skippedGroupIds: [...snapshot.skippedGroupIds],
    isComplete: snapshot.isComplete,
  };
}
