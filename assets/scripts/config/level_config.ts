// ============================================================
// level_config.ts — level_config.json 的 TypeScript 类型定义
// 职责：定义 Phase4A 角色等级经验与属性成长配置
// 规范：仅定义配置结构，不包含升级计算逻辑
// ============================================================

/**
 * 单级角色成长配置（对应 level_config.json data[] 中每一项）。
 */
export interface LevelConfig {
  /** 角色等级 */
  level: number;
  /** 升至下一级所需经验；满级可配置为 0 */
  requiredExp: number;
  /** 生命成长倍率 */
  hpGrowthRate: number;
  /** 攻击成长倍率 */
  atkGrowthRate: number;
  /** 防御成长倍率 */
  defGrowthRate: number;
  /** 速度成长倍率 */
  speedGrowthRate: number;
}

/**
 * level_config.json 的顶层结构（三层：version / name / data[]）。
 */
export interface LevelConfigData {
  /** 配置格式版本号 */
  version: string;
  /** 配置表名称（调试用） */
  name: string;
  /** 等级成长配置数组 */
  data: LevelConfig[];
}

