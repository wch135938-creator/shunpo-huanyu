// ============================================================
// account_level_config.ts — account_level_config.json 的 TypeScript 类型定义
// 职责：定义账号等级经验曲线配置结构
// 规范：与 hero/level_config 完全独立，不混用
// C1.5.9-G-B1-A7: 最小账号等级生产闭环
// ============================================================

/**
 * 单级账号等级配置条目。
 */
export interface AccountLevelEntry {
  /** 账号等级 */
  level: number;
  /** 升至下一级所需经验；满级为 0 */
  requiredExpToNext: number;
}

/**
 * account_level_config.json 的顶层结构。
 */
export interface AccountLevelConfig {
  /** 配置格式版本号 */
  version: number;
  /** 等级配置数组 */
  levels: AccountLevelEntry[];
}
