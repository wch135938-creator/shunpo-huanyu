// ============================================================
// hero_config.ts — hero_list.json 的 TypeScript 类型定义
// 职责：与 config/cards/hero_list.json 字段严格一一对应
// 规范：零 any / 联合类型约束品质/阵营/职业 / 禁止硬编码
// ============================================================

// ==================== 枚举类型 ====================

/** 角色稀有度 */
export type Quality = 'N' | 'R' | 'SR' | 'SSR' | 'UR';

/** 阵营 */
export type Faction = '青龙' | '白虎' | '朱雀' | '玄武' | '混沌';

/** 职业 */
export type Profession = '战士' | '法师' | '刺客' | '坦克' | '辅助';

/** 站位 */
export type Position = 'front' | 'back';

// ==================== 角色条目 ====================

/**
 * 单条角色配置（对应 hero_list.json data[] 中每一项）
 *
 * 调用示例：
 *   const cfg = ConfigManager.getInstance()
 *     .getConfig<HeroListData>('config/cards/hero_list');
 *   const heroes: HeroConfig[] = cfg.data;
 */
export interface HeroConfig {
  /** 角色唯一 ID，按品质分段：CARD_001–099(N) / 101–199(R) / 201–299(SR) / 301–399(SSR) / 401–499(UR) */
  id: string;
  /** 稀有度 */
  quality: Quality;
  /** 名称本地化 key */
  nameKey: string;
  /** 描述本地化 key */
  descKey: string;
  /** 阵营 */
  faction: Faction;
  /** 职业 */
  profession: Profession;
  /** 站位 */
  position: Position;
  /** 图标资源路径（相对 resources/） */
  icon: string;

  // ---- 基础属性 ----
  /** 初始攻击力 */
  baseAtk: number;
  /** 初始防御力 */
  baseDef: number;
  /** 初始生命值 */
  baseHp: number;
  /** 初始速度 */
  baseSpeed: number;

  // ---- 成长率（每升一级增加值）----
  /** 每级攻击成长 */
  growthAtk: number;
  /** 每级防御成长 */
  growthDef: number;
  /** 每级生命成长 */
  growthHp: number;

  // ---- 战斗参数 ----
  /** 暴击率 (0.0–1.0，0.18 = 18%) */
  critRate: number;
  /** 暴击倍率 (1.5 = 150%) */
  critDamage: number;
  /** 攻击间隔（毫秒） */
  atkIntervalMs: number;

  // ---- 技能 & 养成 ----
  /** 关联技能 ID 列表（第一个为普攻，其余为主动/被动/终极） */
  skillIds: string[];
  /** 最大等级 */
  maxLevel: number;
  /** 突破等级节点 */
  breakLevels: number[];
}

// ==================== 顶层结构 ====================

/**
 * hero_list.json 的顶层结构（三层：version / name / data[]）
 * 用于 ConfigManager.getConfig 的类型参数
 */
export interface HeroListData {
  /** 配置格式版本号 */
  version: number;
  /** 配置表名称（调试用） */
  name: string;
  /** 角色数据数组 */
  data: HeroConfig[];
}
