// ============================================================
// BattleUnit.ts — 战斗单元运行时数据结构
// 职责： 定义 BattleUnit 接口，桥接 HeroConfig / EnemyConfig
// 位置： battle/ 层
// 依赖： BattleTypes (BattleUnitType, BattlePosition)
// 规范： 零 any / 仅接口定义 / 不实现逻辑
// ============================================================

import { BattleUnitType, BattlePosition } from './BattleTypes';
import type { Faction } from '../config/hero_config';
import type { Element } from '../config/enemy_config';

// ==================== BattleUnit ====================

/**
 * 战斗单元 — 表示战斗中的一个角色或敌人
 *
 * 创建方式（后续实现，本文件仅定义结构）：
 *
 *   HeroConfig → BattleUnit:
 *     configId   = HeroEntry.id
 *     unitType   = BattleUnitType.Hero
 *     name       = resolve(HeroEntry.nameKey)
 *     faction    = HeroEntry.faction
 *     element    = inferred from HeroEntry (火/冰/雷/毒/光/暗)
 *     maxHp      = HeroEntry.baseHp + HeroEntry.growthHp * (level - 1)
 *     attack     = HeroEntry.baseAtk + HeroEntry.growthAtk * (level - 1)
 *     defense    = HeroEntry.baseDef + HeroEntry.growthDef * (level - 1)
 *     speed      = HeroEntry.baseSpeed
 *     skillIds   = HeroEntry.skillIds
 *     position   = assigned by BattleSystem
 *
 *   EnemyConfig → BattleUnit:
 *     configId   = EnemyEntry.id
 *     unitType   = enemyType === 'boss' ? Boss : Enemy
 *     faction    = EnemyEntry.faction
 *     element    = EnemyEntry.element
 *     maxHp      = EnemyEntry.hp
 *     attack     = EnemyEntry.attack
 *     defense    = EnemyEntry.defense
 *     speed      = EnemyEntry.speed
 *     name       = EnemyEntry.name
 *     skillIds   = EnemyEntry.skillIds
 *     position   = assigned by BattleSystem
 */
export interface BattleUnit {
  // ===== 身份 =====

  /** 运行时唯一 ID，格式 "p_0" / "e_2" (p=player, e=enemy, 数字=槽位索引) */
  unitId: string;
  /** 配置 ID，引用 HeroConfig.id 或 EnemyConfig.id */
  configId: string;
  /** 战斗单元类型 */
  unitType: BattleUnitType;

  // ===== 显示 =====

  /** 显示名称 */
  name: string;
  /** 阵营：青龙 / 白虎 / 朱雀 / 玄武 / 混沌
   *  用于阵营克制计算（DamageCalculator） */
  faction: Faction;
  /** 元素属性：火 / 冰 / 雷 / 毒 / 光 / 暗
   *  用于技能元素判定 / 特效表现 / Buff 交互 */
  element: Element;

  // ===== 属性（运行时值，可随 buff / debuff 变化）=====

  /** 等级 */
  level: number;
  /** 最大生命值 */
  maxHp: number;
  /** 当前生命值（≤ 0 则阵亡） */
  currentHp: number;
  /** 攻击力 */
  attack: number;
  /** 防御力 */
  defense: number;
  /** 速度（决定出手顺序） */
  speed: number;

  // ===== 技能 =====

  /** 技能 ID 列表，引用 SkillConfig.id */
  skillIds: string[];

  // ===== 站位 =====

  /** 阵型位置 */
  position: BattlePosition;

  // ===== 状态 =====

  /** 是否存活（false 时跳过行动） */
  isAlive: boolean;
}
