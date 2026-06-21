// ============================================================
// DropSaveData — Phase6-Step2 掉落存档数据结构
// 职责：定义掉落历史相关的持久化字段
// Phase7-Step4: 新增 dropHistoryRecords / pitySnapshot / pityRules 字段
// 位置：Save 层
// ============================================================

import type { DropHistoryEntry, DropHistoryRecord, PitySnapshot, PityRule } from '../data/drop_types';
import { createEmptyPitySnapshot } from '../data/drop_types';

/**
 * 掉落存档数据。
 *
 * 说明：
 * - history 保存 Phase6 旧版掉落历史记录，用于查询与审计。
 * - Phase7-Step4 新增：
 *   - dropHistoryRecords: Phase7 新版掉落历史（含保底状态）
 *   - pitySnapshot: 当前保底计数器快照
 *   - pityRules: 已注册的保底规则配置
 * - 所有 Phase7 新增字段为 optional，保证向后兼容。
 */
export interface DropSaveData {
  /** Phase6 掉落历史记录列表 */
  history: DropHistoryEntry[];
  /** Phase7-Step4: 新版掉落历史记录列表（含保底快照） */
  dropHistoryRecords?: DropHistoryRecord[];
  /** Phase7-Step4: 当前保底计数器快照 */
  pitySnapshot?: PitySnapshot;
  /** Phase7-Step4: 已注册的保底规则配置 */
  pityRules?: PityRule[];
}

/** 创建默认掉落存档数据 */
export function createDefaultDropSaveData(): DropSaveData {
  return {
    history: [],
    dropHistoryRecords: [],
    pitySnapshot: createEmptyPitySnapshot(),
    pityRules: [],
  };
}
