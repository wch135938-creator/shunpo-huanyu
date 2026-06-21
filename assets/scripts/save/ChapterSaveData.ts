// ============================================================
// ChapterSaveData — Phase9 ChapterSystem 存档数据结构
// 职责：定义章节模块的持久化数据结构
// 位置：Save 层
// 规范：零 any / 所有字段可序列化 / 遵循 SaveV2 模式
// ============================================================

import type { ChapterProgress } from '../chapter/ChapterTypes';

/**
 * 章节模块存档数据。
 *
 * Phase9-Step7 定义，通过 SaveManager 的 saveChapterData / loadChapterData
 * 方法对接到 SaveContainerV8.chapters 字段。
 */
export interface ChapterSaveData {
  /** 所有章节进度：chapterId → ChapterProgress */
  chapterProgress: Record<string, ChapterProgress>;
  /** 当前活跃章节 ID */
  currentChapterId: string;
  /** 存档版本号（用于将来迁移） */
  saveVersion: number;
  /** 最后更新时间戳 */
  updatedAt: number;
}

/** 创建默认章节存档数据 */
export function createDefaultChapterSaveData(): ChapterSaveData {
  return {
    chapterProgress: {},
    currentChapterId: '',
    saveVersion: 1,
    updatedAt: Date.now(),
  };
}
