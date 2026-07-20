// ============================================================
// ChapterProgressMigration — 六关制旧存档迁移纯函数
// 职责：生成章节配置指纹 / 归一化旧 ChapterProgress
// 边界：纯函数，零 Cocos 依赖，零副作用，不触发事件/奖励
// ============================================================

import type { ChapterConfig, ChapterProgress } from './ChapterTypes';

// ==================== 类型定义 ====================

/** 归一化输入 */
export interface NormalizationInput {
  /** 章节进度映射：chapterId → ChapterProgress */
  progressMap: Record<string, ChapterProgress>;
  /** 当前已加载的章节配置列表 */
  chapters: ChapterConfig[];
  /** 当前章节配置指纹 */
  configFingerprint: string;
}

/** 归一化结果 */
export interface NormalizationResult {
  /** 是否产生了数据变更 */
  changed: boolean;
  /** 被归一化的章节 ID 列表 */
  normalizedChapterIds: string[];
  /** 诊断信息（非法值过滤等） */
  diagnostics: string[];
}

// ==================== 配置指纹 ====================

/**
 * 生成章节配置指纹。
 *
 * 编码内容：
 * - 章节归属（每个 Chapter 的 Stage ID 列表）
 * - 章节顺序（按 chapterIndex 升序排列）
 * - 章内关卡顺序（按 stageIndex 升序排列）
 *
 * 指纹变更触发条件：
 * - 任意章节的 Stage ID 集合变化
 * - 任意章节的章内 Stage 顺序变化
 * - 章节顺序或 chapterIndex 变化（包括新增/删除章节）
 * - 任意 Stage 的所属章节变化
 *
 * 格式：
 *   chapterId=XXX;chapterIndex=N;stages=S1,S2,...,SN|
 *
 * 不使用 .sort() 全局扁平化，以保留章节容器归属和章内顺序信息。
 *
 * @param chapters  按 chapterIndex 升序排列的章节配置列表
 * @returns          确定性配置指纹字符串
 */
export function createChapterConfigFingerprint(chapters: ChapterConfig[]): string {
  const parts: string[] = [];

  for (const chapter of chapters) {
    // 章内关卡按 stageIndex 升序
    const sortedStages = [...chapter.stages].sort(
      (a, b) => a.stageIndex - b.stageIndex,
    );
    const stageIds = sortedStages.map((s) => s.id).join(',');
    parts.push(
      `chapterId=${chapter.id};chapterIndex=${chapter.chapterIndex};stages=${stageIds}`,
    );
  }

  return parts.join('|');
}

// ==================== 归一化 ====================

/**
 * Chapter Stage ID 格式校验正则。
 * 合法格式：chapter_NNN_stage_NN（如 chapter_002_stage_01）
 */
const STAGE_ID_FORMAT_RE = /^chapter_\d{3}_stage_\d{2}$/;

/**
 * 规范化章节进度（六关制→十关制迁移）。
 *
 * 纯函数：接收输入，返回结果；不产生副作用。
 *
 * 规则：
 * 1. 合并 completedStageIds 与 retainedUnknownStageIds
 * 2. 非字符串/空白/格式非法 → 仅入诊断
 * 3. 当前配置存在的 Stage ID → 去重后写回 completedStageIds
 * 4. 格式合法但不在配置中 → 去重后写入 retainedUnknownStageIds
 * 5. 全完成 → status=completed, currentStageId=最后一关
 * 6. 非全完成但有完成记录 → status=unlocked, currentStageId=最早未完成
 * 7. 否则 → status=locked
 * 8. 旧 completed 但不足当前全部关 → legacyCompletedAt 留存
 * 9. 不调用 completeStage/unlockStage，不发事件/奖励
 * 10. 幂等：相同配置指纹不重复执行
 *
 * @param input  归一化输入
 * @returns      归一化结果（输入对象的 progress 被原地修改）
 */
export function normalizeChapterProgress(
  input: NormalizationInput,
): NormalizationResult {
  const { progressMap, chapters, configFingerprint } = input;

  const diagnostics: string[] = [];
  const normalizedChapterIds: string[] = [];
  let changed = false;

  for (const chapter of chapters) {
    const progress = progressMap[chapter.id];
    if (!progress) continue;

    // 幂等：已规范化且指纹匹配则跳过
    if (
      progress.normalizedAgainstChapterConfigVersion === configFingerprint
    ) {
      continue;
    }

    // 步骤1: 收集所有已知 Stage ID（含 retained）
    const rawIds: string[] = [
      ...(Array.isArray(progress.completedStageIds)
        ? progress.completedStageIds
        : []),
      ...(Array.isArray(progress.retainedUnknownStageIds)
        ? progress.retainedUnknownStageIds
        : []),
    ];

    // 步骤2: 过滤非法值
    const cleanIds: string[] = [];
    for (const raw of rawIds) {
      if (typeof raw !== 'string' || raw.trim() === '') {
        diagnostics.push(
          `[normalize] ${chapter.id}: 跳过非法值: ${JSON.stringify(raw)}`,
        );
        continue;
      }
      const trimmed = raw.trim();
      if (!STAGE_ID_FORMAT_RE.test(trimmed)) {
        diagnostics.push(`[normalize] ${chapter.id}: 跳过格式非法: ${trimmed}`);
        continue;
      }
      cleanIds.push(trimmed);
    }

    // 步骤3 & 4: 按当前配置分类
    const configuredIds = chapter.stages.map((s) => s.id);
    const configuredSet = new Set(configuredIds);

    const newCompleted: string[] = [];
    const retainedUnknown: string[] = [];
    const seenCompleted = new Set<string>();

    for (const id of cleanIds) {
      if (configuredSet.has(id)) {
        if (!seenCompleted.has(id)) {
          newCompleted.push(id);
          seenCompleted.add(id);
        }
      } else {
        if (!retainedUnknown.includes(id)) {
          retainedUnknown.push(id);
        }
      }
    }

    // 步骤5-8: 判定状态
    const allComplete = configuredIds.every((id) => seenCompleted.has(id));
    const oldStatus = progress.status;
    const oldCompletedAt = progress.completedAt;

    if (allComplete) {
      progress.status = 'completed';
      progress.currentStageId = configuredIds[configuredIds.length - 1];
    } else if (
      oldStatus === 'unlocked' ||
      oldStatus === 'completed' ||
      newCompleted.length > 0
    ) {
      progress.status = 'unlocked';
      const firstMissing = configuredIds.find((id) => !seenCompleted.has(id));
      progress.currentStageId = firstMissing || configuredIds[0];
    } else {
      progress.status = 'locked';
      progress.currentStageId = '';
    }

    // 旧 completed 但不足当前全部关 → legacyCompletedAt
    if (oldStatus === 'completed' && !allComplete) {
      progress.legacyCompletedAt = oldCompletedAt;
      progress.completedAt = 0;
    }

    // 步骤9: 写回字段
    progress.completedStageIds = newCompleted;
    progress.retainedUnknownStageIds = retainedUnknown;
    progress.normalizedAgainstChapterConfigVersion = configFingerprint;
    progress.updatedAt = Date.now();

    normalizedChapterIds.push(chapter.id);
    changed = true;

    diagnostics.push(
      `[normalize] ${chapter.id}: ` +
        `status=${oldStatus}→${progress.status}, ` +
        `completed=${newCompleted.length}/${configuredIds.length}, ` +
        `unknown=${retainedUnknown.length}`,
    );
  }

  return { changed, normalizedChapterIds, diagnostics };
}
