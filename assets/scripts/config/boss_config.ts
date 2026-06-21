// ============================================================
// boss_config.ts — Phase8 Boss 配置类型定义
// 职责：定义 BossConfig / BossConfigData 接口
// 对应配置文件：config/systems/boss_config.json
// ============================================================

/** 元素类型 */
export type BossElement = '火' | '冰' | '雷' | '毒' | '光' | '暗';

/** 阵营类型 */
export type BossFaction = '青龙' | '白虎' | '朱雀' | '玄武' | '混沌';

/** Boss 技能条目 */
export interface BossSkillEntry {
  /** 技能 ID（引用 skill_data.json） */
  skillId: string;
  /** 技能释放权重（0~N，权重越高越容易释放） */
  weight: number;
}

/** Boss 掉落条目 */
export interface BossDropEntry {
  /** 掉落表 ID（引用 drop_table.json） */
  dropTableId: number;
  /** 掉落描述 Key */
  descKey: string;
}

/** 单条 Boss 配置 */
export interface BossConfig {
  /** Boss 唯一 ID */
  id: string;
  /** Boss 显示名称 Key */
  nameKey: string;
  /** Boss 描述 Key */
  descKey: string;
  /** Boss 等级 */
  level: number;
  /** 元素属性 */
  element: BossElement;
  /** 阵营 */
  faction: BossFaction;
  /** 生命值 */
  hp: number;
  /** 攻击力 */
  atk: number;
  /** 防御力 */
  def: number;
  /** 速度 */
  speed: number;
  /** 暴击率 (0~1) */
  critRate: number;
  /** 暴击倍率 */
  critDamage: number;
  /** 技能列表 */
  skills: BossSkillEntry[];
  /** 掉落列表 */
  drops: BossDropEntry[];
  /** 所属地牢 ID 列表 */
  dungeonRefs: string[];
}

/** Boss 配置表顶层结构 */
export interface BossConfigData {
  version: number;
  name: string;
  data: BossConfig[];
}
