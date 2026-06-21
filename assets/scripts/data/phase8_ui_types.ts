// ============================================================
// phase8_ui_types.ts — Phase8 UI 层共享数据类型
// 职责：定义 UI 面板间共享的数据结构，填补系统类型到 UI 展示之间的空白
// 规范：仅定义数据结构，不包含业务逻辑
// ============================================================

import type { DungeonNodeType } from './roguelike_types';

// ---- Dungeon UI Types ----

/** 地牢选择列表项（供 DungeonPanel 使用） */
export interface DungeonListEntry {
  /** 地牢 ID */
  dungeonId: string;
  /** 显示名称 Key */
  nameKey: string;
  /** 难度标签 */
  difficulty: 'normal' | 'hard' | 'expert';
  /** 总层数 */
  totalLayers: number;
  /** 是否已解锁 */
  unlocked: boolean;
  /** 解锁条件描述 */
  unlockHint?: string;
  /** 推荐战力 */
  recommendPower: number;
  /** 可获得的奖励标签 */
  rewardTags: string[];
}

// ---- Node Map UI Types ----

/** 节点地图中的单个节点 UI 数据 */
export interface DungeonNodeUIData {
  /** 节点 ID */
  nodeId: string;
  /** 节点类型 */
  nodeType: DungeonNodeType;
  /** 节点状态 */
  nodeStatus: 'visited' | 'current' | 'available' | 'locked';
  /** 图标资源路径 */
  iconPath: string;
  /** 节点标签 */
  label: string;
  /** 预览信息 */
  preview?: string;
}

/** 分叉选择 UI 数据 */
export interface ForkChoiceUIData {
  /** 源节点 ID */
  sourceNodeId: string;
  /** 分支选项列表 */
  branches: ForkBranchUIData[];
}

/** 分叉分支 UI 数据 */
export interface ForkBranchUIData {
  /** 分支节点 ID */
  nodeId: string;
  /** 分支标签 */
  label: string;
  /** 分支预览描述 */
  preview: string;
  /** 节点类型图标 */
  nodeTypeIcon: string;
}

// ---- Event UI Types ----

/** 事件选择项 UI 数据 */
export interface EventChoiceUIData {
  /** 选项 ID */
  choiceId: string;
  /** 选项文本 Key */
  textKey: string;
  /** 奖励预览文本 */
  rewardPreview: string;
  /** 是否有风险 */
  isRisky: boolean;
}

/** 事件面板完整 UI 数据 */
export interface EventPanelUIData {
  /** 事件 ID */
  eventId: string;
  /** 事件标题 Key */
  titleKey: string;
  /** 事件描述 Key */
  descriptionKey: string;
  /** 事件分类 */
  category: string;
  /** 选项列表 */
  choices: EventChoiceUIData[];
}

// ---- Artifact UI Types ----

/** 神器列表项 UI 数据 */
export interface ArtifactUIEntry {
  /** 神器 ID */
  artifactId: string;
  /** 名称 Key */
  nameKey: string;
  /** 稀有度 */
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  /** 当前等级 */
  level: number;
  /** 是否已激活 */
  isActive: boolean;
  /** 效果描述 Key 列表 */
  effectKeys: string[];
  /** 稀有度对应的颜色 */
  rarityColor: string;
  /** 稀有度边框资源路径 */
  framePath: string;
}

// ---- LiveOps UI Types ----

/** 运营活动卡片 UI 数据 */
export interface LiveOpsCardUIData {
  /** 活动 ID */
  eventId: string;
  /** 名称 Key */
  nameKey: string;
  /** 活动状态 */
  status: 'active' | 'upcoming' | 'ended';
  /** 剩余时间（秒），active 时有效 */
  remainingSeconds: number;
  /** 奖励预览文本 */
  rewardPreview: string;
  /** 标签列表 */
  tags: string[];
}

// ---- Result UI Types ----

/** 奖励展示项 */
export interface RewardDisplayItem {
  /** 奖励类型 */
  rewardType: 'gold' | 'exp' | 'equipment' | 'item' | 'currency';
  /** 图标资源路径 */
  iconPath: string;
  /** 数量 */
  quantity: number;
  /** 显示名称 */
  displayName: string;
  /** 稀有度（装备/物品时有效） */
  rarity?: string;
  /** Phase8-Step4: 是否为保底触发的额外奖励 */
  isPityBonus?: boolean;
}

/** 结算面板 UI 数据 */
export interface ResultPanelUIData {
  /** 是否胜利 */
  isVictory: boolean;
  /** 标题文本 Key */
  titleKey: string;
  /** 奖励列表 */
  rewards: RewardDisplayItem[];
  /** 额外经验 */
  bonusExp: number;
  /** 额外金币 */
  bonusGold: number;
  /** 是否可继续推进 */
  canContinue: boolean;
  /** 下一动作标签 */
  nextActionLabel: string;
}

// ---- HUD UI Types ----

/** Roguelike HUD 数据 */
export interface RoguelikeHUDData {
  /** 当前层序号（1-based） */
  currentFloor: number;
  /** 总层数 */
  totalFloors: number;
  /** 当前层内进度百分比 (0~1) */
  layerProgress: number;
  /** 本 run 累计获得金币 */
  runGold: number;
  /** 本 run 累计获得经验 */
  runExp: number;
  /** 已访问节点数 */
  visitedNodes: number;
  /** 已击败 Boss 数 */
  defeatedBosses: number;
  /** 运行种子 */
  seed: string;
}

// ---- 工厂函数 ----

/** 稀有度 → 颜色映射 */
export const RARITY_COLOR_MAP: Record<string, string> = {
  common: '#9E9E9E',
  rare: '#42A5F5',
  epic: '#AB47BC',
  legendary: '#FFD700',
};

/** 稀有度 → 边框资源路径映射 */
export const RARITY_FRAME_MAP: Record<string, string> = {
  common: 'textures/frames/frame_common',
  rare: 'textures/frames/frame_rare',
  epic: 'textures/frames/frame_epic',
  legendary: 'textures/frames/frame_legendary',
};

/** 节点类型 → 图标资源路径映射 */
export const NODE_TYPE_ICON_MAP: Record<DungeonNodeType, string> = {
  battle: 'textures/icons/node_battle',
  event: 'textures/icons/node_event',
  boss: 'textures/icons/node_boss',
  reward: 'textures/icons/node_reward',
  shop: 'textures/icons/node_shop',
  empty: 'textures/icons/node_empty',
};

/** 奖励类型 → 图标资源路径映射 */
export const REWARD_TYPE_ICON_MAP: Record<string, string> = {
  gold: 'textures/icons/reward_gold',
  exp: 'textures/icons/reward_exp',
  equipment: 'textures/icons/reward_equipment',
  item: 'textures/icons/reward_item',
  currency: 'textures/icons/reward_currency',
};

// ---- Phase8-Step4: 奖励动画与保底 UI 类型 ----

/** 保底触发 UI 数据 */
export interface PityTriggerUIData {
  /** 来源类型 */
  sourceType: string;
  /** 保底规则 ID */
  ruleId: string;
  /** 当前计数 */
  currentCount: number;
  /** 触发阈值 */
  threshold: number;
  /** 保底额外奖励 */
  bonusReward: RewardDisplayItem;
}

/** 飞字 UI 数据 */
export interface FlyTextUIData {
  /** 显示文本（如 "+100 金币"） */
  text: string;
  /** 飞字锚点位置 */
  anchor: 'top' | 'center' | 'rewardItem';
  /** 动画持续时长（秒） */
  duration: number;
  /** 文本颜色 */
  color: string;
}

/** 保底触发颜色映射（按来源类型） */
export const PITY_TRIGGER_COLORS: Record<string, string> = {
  dungeon_boss: '#FF4444',
  dungeon_event: '#FFD700',
  dungeon_node: '#44AAFF',
  quest: '#44FF44',
  achievement: '#FF44FF',
  default: '#FFD700',
};
