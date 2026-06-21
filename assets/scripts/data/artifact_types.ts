// ============================================================
// artifact_types.ts — Phase7-Step7 神器系统类型定义
// 职责：定义 ArtifactConfig / ArtifactState / ArtifactInventory 等核心类型
// 规范：仅定义数据结构，不包含业务逻辑；所有字段为 optional 兼容
// ============================================================

// ---- ArtifactConfig ----

/**
 * 神器配置。
 *
 * 神器是特殊的永久加成型装备，每个玩家最多同时激活一个。
 * rarity 决定了神器的基础效果强度。
 * effectRefs 引用 Effect 系统中的效果 ID。
 */
export interface ArtifactConfig {
  /** 神器唯一 ID */
  id: string;
  /** 配置版本号 */
  version: number;
  /** 多语言名称 Key */
  nameKey: string;
  /** 稀有度 */
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  /** 效果引用列表（指向 Effect 系统） */
  effectRefs: string[];
  /** 标签（用于分组过滤） */
  tags?: string[];
}

// ---- ArtifactState ----

/**
 * 神器运行时状态。
 *
 * 持久化到存档中，记录神器的等级和获得时间。
 */
export interface ArtifactState {
  /** 神器 ID（对应 ArtifactConfig.id） */
  artifactId: string;
  /** 当前等级 */
  level: number;
  /** 获得时间戳（Unix） */
  obtainedAt: number;
}

// ---- ArtifactInventory ----

/**
 * 神器背包。
 *
 * 持久化到存档中，记录所有已解锁神器状态。
 * 最多同时激活一个神器（由 activeArtifactId 指定）。
 */
export interface ArtifactInventory {
  /** 神器状态列表 */
  artifacts: ArtifactState[];
  /** 当前激活的神器 ID（null 表示无激活神器） */
  activeArtifactId?: string | null;
}

// ---- 工厂函数 ----

/** 有效的稀有度值 */
export const VALID_ARTIFACT_RARITIES: ArtifactConfig['rarity'][] = [
  'common', 'rare', 'epic', 'legendary',
];

/** 创建默认的 ArtifactInventory */
export function createDefaultArtifactInventory(): ArtifactInventory {
  return {
    artifacts: [],
    activeArtifactId: null,
  };
}

/** 创建默认的 ArtifactState */
export function createDefaultArtifactState(artifactId: string): ArtifactState {
  return {
    artifactId,
    level: 1,
    obtainedAt: Date.now(),
  };
}
