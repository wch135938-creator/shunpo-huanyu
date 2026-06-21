// ============================================================
// SkillSaveData — Phase9 SkillSystem 存档数据结构（SaveV2 预留）
// 职责：定义技能模块的持久化数据结构
// 注意：本阶段仅预留接口，不修改 SaveManager 或存档版本号
//       SaveV2 统一升级将在 Phase9-Step6 处理
// ============================================================

import type { SkillRuntimeState } from '../skill/SkillTypes';

/**
 * 技能模块存档数据。
 *
 * Phase9-Step2 仅定义接口，暂不写入 SaveContainer。
 * Phase9-Step6 统一升级 Save Version 时会正式集成。
 * Phase10-Step2: 新增 skillData 字段，简化技能等级存储。
 */
export interface SkillSaveData {
  /** 技能运行时状态映射：skillId → SkillRuntimeState */
  skillStates: Record<string, SkillRuntimeState>;
  /** 英雄技能装配映射：heroId → skillIds[] */
  heroSkillLoadouts: Record<string, string[]>;
  /** Phase10-Step2: 技能等级精简存储（skillId → { level }） */
  skillData?: Record<string, SkillLevelEntry>;
  /** 存档版本号（用于将来迁移） */
  saveVersion: number;
  /** 最后更新时间戳 */
  updatedAt: number;
}

/** Phase10-Step2: 技能等级精简存储条目 */
export interface SkillLevelEntry {
  level: number;
}

/** 创建默认技能存档数据 */
export function createDefaultSkillSaveData(): SkillSaveData {
  return {
    skillStates: {},
    heroSkillLoadouts: {},
    skillData: {},
    saveVersion: 1,
    updatedAt: Date.now(),
  };
}
