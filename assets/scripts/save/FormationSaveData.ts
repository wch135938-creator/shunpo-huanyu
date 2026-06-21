// ============================================================
// FormationSaveData — Phase9 FormationSystem 存档数据结构（SaveV2 预留）
// 职责：定义阵容模块的持久化数据结构
// 注意：本阶段仅预留接口，不修改 SaveManager 或存档版本号
//       SaveV2 统一升级将在 Phase9-Step6 处理
// ============================================================

import type { FormationPreset, FormationMode } from '../formation/FormationTypes';

/**
 * 阵容模块存档数据。
 *
 * Phase9-Step3 仅定义接口，暂不写入 SaveContainer。
 * Phase9-Step6 统一升级 Save Version 时会正式集成。
 */
export interface FormationSaveData {
  /** 所有阵容预设：presetId → FormationPreset */
  presets: Record<string, FormationPreset>;
  /** 各模式的激活阵容 ID：mode → presetId */
  activePresetIds: Partial<Record<FormationMode, string>>;
  /** 存档版本号（用于将来迁移） */
  saveVersion: number;
  /** 最后更新时间戳 */
  updatedAt: number;
}

/** 创建默认阵容存档数据 */
export function createDefaultFormationSaveData(): FormationSaveData {
  return {
    presets: {},
    activePresetIds: {},
    saveVersion: 1,
    updatedAt: Date.now(),
  };
}
