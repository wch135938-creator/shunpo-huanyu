// ============================================================
// hero_progress_data.ts — Phase4A 角色成长主数据定义
// 职责：保存单个角色的等级、经验与战力缓存
// 规范：仅定义数据结构，不包含成长计算、存档写入或 UI 逻辑
// ============================================================

/**
 * 单个角色的 Phase4A 成长状态。
 *
 * 说明：
 * - heroId 指向角色配置 ID。
 * - level / exp 是角色成长主数据。
 * - power 是 PowerSystem 计算后的单角色战力缓存。
 */
export interface HeroProgressData {
  /** 角色唯一 ID，引用 hero_list.json */
  heroId: string;
  /** 角色等级 */
  level: number;
  /** 角色经验，Phase4A 实现时需统一为当前等级内经验或累计经验 */
  exp: number;
  /** 单角色战力缓存，由 PowerSystem 计算 */
  power: number;
}

