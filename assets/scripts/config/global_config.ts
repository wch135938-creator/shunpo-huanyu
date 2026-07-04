// ============================================================
// global_config.ts — global_const.json 的 TypeScript 类型定义
// 职责：与 config/systems/global_const.json 字段严格一一对应
// 规范：零 any / discriminated union / 禁止硬编码
// 特点：通过 id 字面量实现类型窄化，TS 自动推断具体配置组字段
// ============================================================

// ==================== 玩家初始配置 ====================

/**
 * 玩家初始配置（GLOBAL_PLAYER）
 *
 * 消费方：PlayerData.init() / SaveManager.createNewSave()
 */
export interface GlobalPlayerEntry {
  /** 配置组 ID（字面量，用于 discriminated union 窄化） */
  id: 'GLOBAL_PLAYER';
  /** 初始玩家等级 */
  initialLevel: number;
  /** 初始金币 */
  initialGold: number;
  /** 初始钻石 */
  initialDiamond: number;
  /** 初始装备强化石（Inventory 一次性发放） */
  initialEquipmentStone: number;
  /** 初始体力 */
  initialStamina: number;
  /** 体力上限 */
  maxStamina: number;
  /** 每 1 点体力恢复时间（毫秒），默认 300000 = 5 分钟 */
  staminaRecoverIntervalMs: number;
  /** 初始解锁关卡 ID */
  initialStageId: string;
  /** 默认上阵人数（前排 2 + 后排 3） */
  defaultHeroSlotCount: number;
  /** 玩家等级上限 */
  maxLevel: number;
  /**
   * [Step12A-B] 初始默认英雄 ID。
   * 新存档无已解锁英雄时，Coordinator 使用此 ID 通过 HeroSystem.unlockHero() 解锁。
   * 必须为 hero_data.json 中真实存在的 heroId。
   */
  initialHeroId: string;
}

// ==================== 战斗基础配置 ====================

/**
 * 战斗基础配置（GLOBAL_BATTLE）
 *
 * 消费方：BattleSystem 初始化 / DamageCalculator
 */
export interface GlobalBattleEntry {
  /** 配置组 ID（字面量） */
  id: 'GLOBAL_BATTLE';
  /** 默认战斗倍速 */
  defaultBattleSpeed: number;
  /** 最大战斗倍速 */
  maxBattleSpeed: number;
  /** 暴击伤害倍率（1.5 = 150%） */
  criticalDamageMultiplier: number;
  /** 属性克制增伤加成（0.25 = 25%） */
  elementCounterBonus: number;
  /** 默认暴击率（0.05 = 5%） */
  defaultCritRate: number;
  /** 伤害随机浮动范围（0.1 = ±10%） */
  damageRandomFactor: number;
  /** 单场战斗最大时长（毫秒），超时强制结算 */
  maxBattleDurationMs: number;
  /** 每下普攻获得的能量 */
  defaultEnergyPerAttack: number;
  /** 能量上限（满能量可释放技能） */
  maxEnergy: number;
}

// ==================== 挂机收益配置 ====================

/**
 * 挂机收益配置（GLOBAL_IDLE）
 *
 * 消费方：IdleManager（Phase 5）
 */
export interface GlobalIdleEntry {
  /** 配置组 ID（字面量） */
  id: 'GLOBAL_IDLE';
  /** 最大离线累积时间（毫秒），43200000 = 12 小时 */
  maxOfflineTimeMs: number;
  /** 挂机收益结算间隔（毫秒），60000 = 1 分钟 */
  idleRewardIntervalMs: number;
  /** 每间隔产出金币 */
  idleGoldPerInterval: number;
  /** 每间隔产出修为经验 */
  idleExpPerInterval: number;
  /** 广告翻倍倍率 */
  adIdleMultiplier: number;
}

// ==================== 广告奖励配置 ====================

/**
 * 广告奖励配置（GLOBAL_AD）
 *
 * 消费方：AdManager（Phase 7）
 * 依据：06-monetization.md — MVP 仅激励视频广告
 */
export interface GlobalAdEntry {
  /** 配置组 ID（字面量） */
  id: 'GLOBAL_AD';
  /** 广告奖励通用倍率 */
  adRewardMultiplier: number;
  /** 每日广告观看上限 */
  dailyAdLimit: number;
  /** 激励视频冷却时间（毫秒），30000 = 30 秒 */
  rewardedAdCooldownMs: number;
  /** Boss 战复活广告开关 */
  adReviveEnabled: boolean;
  /** 战斗结算翻倍广告开关 */
  adDoubleRewardEnabled: boolean;
  /** 每日免费抽卡广告开关 */
  adFreeGachaEnabled: boolean;
  /** 离线收益翻倍广告开关 */
  adIdleBoostEnabled: boolean;
}

// ==================== 系统基础配置 ====================

/**
 * 系统基础配置（GLOBAL_SYSTEM）
 *
 * 消费方：SaveManager / 版本检查 / GM 面板
 */
export interface GlobalSystemEntry {
  /** 配置组 ID（字面量） */
  id: 'GLOBAL_SYSTEM';
  /** 自动存档间隔（毫秒），30000 = 30 秒 */
  autoSaveIntervalMs: number;
  /** 存档格式版本号（版本不兼容时递增） */
  saveVersion: number;
  /** 游戏版本号 */
  gameVersion: string;
  /** 最大存档槽数 */
  maxSaveSlots: number;
  /** 调试面板开关（发布前必须关闭） */
  enableDebugPanel: boolean;
}

// ==================== Discriminated Union ====================

/**
 * 全局配置条目并集类型
 *
 * TypeScript 会通过 id 字面量自动窄化类型：
 *
 *   const entry = cfg.data.find(e => e.id === 'GLOBAL_PLAYER');
 *   if (entry && entry.id === 'GLOBAL_PLAYER') {
 *     entry.initialLevel  // ← TS 自动补全，无需 as 断言
 *   }
 */
export type GlobalEntry =
  | GlobalPlayerEntry
  | GlobalBattleEntry
  | GlobalIdleEntry
  | GlobalAdEntry
  | GlobalSystemEntry;

// ==================== 顶层结构 ====================

/**
 * global_const.json 的顶层结构（三层：version / name / data[]）
 * 用于 ConfigManager.getConfig 的类型参数
 *
 * 调用示例：
 *   const cfg = ConfigManager.getInstance()
 *     .getConfig<GlobalConstConfig>('config/systems/global_const');
 *   // 按 id 查找指定配置组
 *   const battle = cfg.data.find(e => e.id === 'GLOBAL_BATTLE') as GlobalBattleEntry;
 */
export interface GlobalConstConfig {
  /** 配置格式版本号 */
  version: string;
  /** 配置表名称（调试用） */
  name: string;
  /** 全局配置条目数组（5 组 discriminated union） */
  data: GlobalEntry[];
}
