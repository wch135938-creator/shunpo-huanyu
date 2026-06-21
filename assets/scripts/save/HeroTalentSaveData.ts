// ============================================================
// HeroTalentSaveData — Phase10-Step1 天赋存档数据结构
// 职责：定义英雄天赋模块的持久化数据结构（SaveV2 兼容）
// 边界：纯类型定义，不包含业务逻辑
// ============================================================

import type { HeroTalentSaveEntry } from '../hero/HeroTalentTypes';
import { createDefaultHeroTalentSaveEntry } from '../hero/HeroTalentTypes';

// 重新导出以保持 Save 层的独立性
export type { HeroTalentSaveEntry };

/**
 * 天赋模块存档数据。
 *
 * Phase10-Step1 新增，作为 SaveContainerV8 的可选字段。
 * 旧存档无此字段时自动初始化。
 */
export interface HeroTalentSaveData {
  /** 英雄 ID → 天赋存档条目 */
  heroTalentMap: Record<string, HeroTalentSaveEntry>;
  /** 存档版本号 */
  saveVersion: number;
  /** 最后更新时间戳 */
  updatedAt: number;
}

/** 创建默认天赋模块存档数据 */
export function createDefaultHeroTalentSaveData(): HeroTalentSaveData {
  return {
    heroTalentMap: {},
    saveVersion: 1,
    updatedAt: Date.now(),
  };
}

/**
 * 为指定英雄获取或创建天赋存档条目。
 *
 * 旧存档无此英雄条目时自动初始化（兼容 Phase9 存档）。
 *
 * @param data      天赋存档数据
 * @param heroId    英雄 ID
 * @returns         该英雄的天赋存档条目
 */
export function getOrCreateHeroTalentEntry(
  data: HeroTalentSaveData,
  heroId: string,
): HeroTalentSaveEntry {
  if (!data.heroTalentMap[heroId]) {
    data.heroTalentMap[heroId] = createDefaultHeroTalentSaveEntry();
  }
  return data.heroTalentMap[heroId];
}
