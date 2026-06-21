// ============================================================
// TutorialSaveData — Phase9-Step9 新手引导存档数据结构
// 职责：定义引导模块的持久化数据结构
// 位置：Save 层
// 规范：零 any / 所有字段可序列化 / 遵循 SaveV2 模式
// ============================================================

import type { TutorialSnapshot } from '../tutorial/TutorialTypes';

/**
 * 引导模块存档数据。
 *
 * Phase9-Step9 定义，通过 SaveManager 的 saveTutorialData / loadTutorialData
 * 方法对接到 SaveContainerV8.tutorial 字段。
 */
export interface TutorialSaveData {
  /** 引导进度快照（null 表示无已保存的引导进度） */
  snapshot: TutorialSnapshot | null;
  /** 存档版本号（用于将来迁移） */
  saveVersion: number;
  /** 最后更新时间戳 */
  updatedAt: number;
}

/** 创建默认引导存档数据 */
export function createDefaultTutorialSaveData(): TutorialSaveData {
  return {
    snapshot: null,
    saveVersion: 1,
    updatedAt: Date.now(),
  };
}
