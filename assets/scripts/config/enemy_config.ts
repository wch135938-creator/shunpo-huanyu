// ============================================================
// enemy_config.ts — enemy_data.json 的 TypeScript 类型定义
// 职责：与 config/stages/enemy_data.json 字段严格一一对应
// 规范：零 any / 联合类型约束 / 禁止硬编码
// ============================================================

import type { Faction } from './hero_config';

// ==================== 枚举类型 ====================

/** 敌人类型 */
export type EnemyType = 'normal' | 'elite' | 'boss';

/** 属性（金木水火土体系：火 / 冰 / 雷 / 毒 / 光 / 暗）
 *  用途：技能元素判定 / 特效表现 / Buff 交互
 *  注意：阵营克制请使用 faction 字段 */
export type Element = '火' | '冰' | '雷' | '毒' | '光' | '暗';

// ==================== 单条敌人 ====================

/**
 * 单条敌人配置（对应 enemy_data.json data[] 中每一项）
 *
 * 调用示例：
 *   const cfg = ConfigManager.getInstance()
 *     .getConfig<EnemyDataConfig>('config/stages/enemy_data');
 *   const enemies: EnemyEntry[] = cfg.data;
 *
 * 战斗中使用：
 *   const enemyCfg = cfg.data.find(e => e.id === stage.enemyIds[0]);
 *   const enemy = new BattleEntity(enemyCfg);
 */
export interface EnemyEntry {
  /** 敌人唯一 ID，格式 ENEMY_NNN / ENEMY_BOSS_NNN */
  id: string;
  /** 敌人名称（调试显示） */
  name: string;
  /** 敌人类型 */
  enemyType: EnemyType;
  /** 阵营：青龙 / 白虎 / 朱雀 / 玄武 / 混沌
   *  用于阵营克制计算（DamageCalculator）
   *  克制关系：青龙→白虎→朱雀→玄武→青龙，混沌不克制/不被克制 */
  faction: Faction;
  /** 元素属性：火 / 冰 / 雷 / 毒 / 光 / 暗
   *  用于技能元素判定 / 特效表现 / Buff 交互
   *  注意：阵营克制请使用 faction 字段 */
  element: Element;
  /** 敌人等级（影响属性计算） */
  level: number;
  /** 生命值 */
  hp: number;
  /** 攻击力 */
  attack: number;
  /** 防御力 */
  defense: number;
  /** 速度（决定出手顺序） */
  speed: number;
  /** 技能 ID 列表（第一个通常为普攻，后续为主动/被动） */
  skillIds: string[];
  /** 掉落池 ID，引用 DropConfig */
  dropId: string;
  /** 是否为 Boss（true 时触发 Boss 专属战斗逻辑） */
  isBoss: boolean;
}

// ==================== 顶层结构 ====================

/**
 * enemy_data.json 的顶层结构（三层：version / name / data[]）
 * 用于 ConfigManager.getConfig 的类型参数
 */
export interface EnemyDataConfig {
  /** 配置格式版本号 */
  version: string;
  /** 配置表名称（调试用） */
  name: string;
  /** 敌人数据数组 */
  data: EnemyEntry[];
}
