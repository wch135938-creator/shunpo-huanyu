// ============================================================
// roguelike_types.ts — Phase7 Roguelike Core Framework 类型定义
// 职责：定义 DomainEvent、图节点地牢、奖励来源、保底、成长曲线、战力公式等核心类型
// 规范：仅定义数据结构，不包含业务逻辑；所有类型与 Phase6 系统兼容
// ============================================================

// ==================== 基础工具类型 ====================

/** 配置版本号信息 */
export interface ConfigVersion {
  /** 主版本号 */
  major: number;
  /** 次版本号 */
  minor: number;
  /** 更新 Unix 时间戳 */
  updatedAt: number;
  /** 变更说明（可选） */
  changeLog?: string;
}

/** 关联 ID，用于将同一次逻辑操作中的所有领域事件串联 */
export type CorrelationId = string;

// ==================== 领域事件 ====================

/**
 * 通用领域事件（事实事件，非命令事件）。
 *
 * 设计原则：
 * - 所有领域操作产生的事实通过 DomainEvent 对外声明。
 * - payload 必须有版本号；新增字段优先可选；不改变旧字段语义。
 * - correlationId 用于将同一次业务操作（如一整次地牢通关）中的所有事件串联。
 */
export interface DomainEvent<T = unknown> {
  /** 事件唯一 ID */
  id: string;
  /** 事件类型标识，如 "DungeonRunStarted" */
  type: string;
  /** 事件 payload 版本号 */
  version: number;
  /** 聚合根 ID（如 dungeonId、heroId） */
  aggregateId: string;
  /** 玩家 ID */
  playerId: string;
  /** 关联 ID，同一批次事件共享 */
  correlationId: CorrelationId;
  /** 事件负载数据 */
  payload: T;
  /** 事件发生 Unix 时间戳 */
  createdAt: number;
}

/** 领域事件类型常量（集中管理，禁止在业务代码中硬编码字符串） */
export const DomainEventType = {
  // ---- 地牢事件 ----
  DUNGEON_RUN_STARTED: 'DungeonRunStarted',
  DUNGEON_NODE_ENTERED: 'DungeonNodeEntered',
  DUNGEON_EVENT_RESOLVED: 'DungeonEventResolved',
  DUNGEON_BOSS_DEFEATED: 'DungeonBossDefeated',
  DUNGEON_LAYER_COMPLETED: 'DungeonLayerCompleted',
  DUNGEON_RUN_COMPLETED: 'DungeonRunCompleted',

  // ---- 掉落事件 ----
  DROP_SETTLED: 'DropSettled',
  PITY_COUNTER_UPDATED: 'PityCounterUpdated',
  REWARD_GRANTED: 'RewardGranted',

  // ---- 地牢事件（Phase7-Step3） ----
  DUNGEON_EVENT_ROLLED: 'DungeonEventRolled',
  DUNGEON_EVENT_REWARD_GRANTED: 'DungeonEventRewardGranted',
  DUNGEON_EVENT_HISTORY_RECORDED: 'DungeonEventHistoryRecorded',

  // ---- 成长事件 ----
  HERO_EXP_APPLIED: 'HeroExpApplied',
  HERO_LEVEL_CHANGED: 'HeroLevelChanged',
  HERO_PROGRESS_TRACK_UPDATED: 'HeroProgressTrackUpdated',

  // ---- 战力事件 ----
  HERO_POWER_RECALCULATED: 'HeroPowerRecalculated',

  // ---- 迁移事件 ----
  SAVE_MIGRATION_STARTED: 'SaveMigrationStarted',
  SAVE_MIGRATION_STEP_COMPLETED: 'SaveMigrationStepCompleted',
  SAVE_MIGRATION_FAILED: 'SaveMigrationFailed',
  SAVE_ROLLBACK_COMPLETED: 'SaveRollbackCompleted',

  // ---- Portrait 事件 ----
  PORTRAIT_SPEC_VALIDATION_FAILED: 'PortraitSpecValidationFailed',

  // ---- 神器事件（Phase7-Step7） ----
  ARTIFACT_UNLOCKED: 'ArtifactUnlocked',
  ARTIFACT_LEVEL_CHANGED: 'ArtifactLevelChanged',

  // ---- 运营活动事件（Phase7-Step7） ----
  LIVEOPS_REFRESHED: 'LiveOpsRefreshed',

  // ---- 特殊事件（Phase7-Step7） ----
  SPECIAL_EVENT_TRIGGERED: 'SpecialEventTriggered',
  SPECIAL_EVENT_COMPLETED: 'SpecialEventCompleted',
} as const;

export type DomainEventTypeValue = typeof DomainEventType[keyof typeof DomainEventType];

// ==================== 地牢：节点图类型 ====================

/**
 * 地牢节点类型（领域行为，非 UI 行为）。
 *
 * - battle: 战斗节点
 * - event:  事件节点（随机事件、选择等）
 * - boss:   Boss 节点
 * - reward: 奖励节点
 * - shop:   商店节点
 * - empty:  空节点（过渡/休息）
 */
export type DungeonNodeType = 'battle' | 'event' | 'boss' | 'reward' | 'shop' | 'empty';

/** 节点进入条件 */
export interface NodeCondition {
  /** 条件类型 */
  type: 'minLevel' | 'maxLevel' | 'minPower' | 'hasItem' | 'hasHero' | 'custom';
  /** 条件参数 */
  params: Record<string, number | string>;
}

/** 地牢节点配置 */
export interface DungeonNodeConfig {
  /** 节点唯一 ID */
  id: string;
  /** 节点类型 */
  type: DungeonNodeType;
  /** 可到达的下一个节点 ID 列表 */
  nextNodeIds: string[];
  /** 事件引用列表（type=event 时有效） */
  eventRefs?: string[];
  /** Boss 引用（type=boss 时有效） */
  bossRef?: string;
  /** 掉落来源引用列表 */
  dropSourceRefs?: string[];
  /** 奖励池引用列表 */
  rewardPoolRefs?: string[];
  /** 进入条件 */
  conditions?: NodeCondition[];
}

/** 层完成规则 */
export interface CompletionRule {
  /** 规则类型 */
  type: 'defeatBoss' | 'clearAllNodes' | 'reachNode' | 'defeatEnemyCount';
  /** 目标节点/数量 */
  target: string | number;
}

/** 地牢层配置 */
export interface DungeonLayerConfig {
  /** 层唯一 ID */
  id: string;
  /** 层序号（从 0 开始） */
  order: number;
  /** 该层的节点图 */
  nodeGraph: DungeonNodeConfig[];
  /** 完成规则 */
  completionRules: CompletionRule[];
}

// ==================== DungeonGraph 专用类型 ====================

/**
 * 节点分叉（NodeFork）—— 节点图中的分支点。
 *
 * 当当前节点有多个 nextNodeIds 时，每个后继节点构成一个"分叉分支"。
 * NodeFork 用于在运行时记录分支结构，供 UI 展示选择面板。
 */
export interface NodeFork {
  /** 分叉的源节点 ID */
  sourceNodeId: string;
  /** 分叉分支列表 */
  branches: NodeForkBranch[];
  /** 分叉创建时间戳 */
  createdAt: number;
  /** Phase7-Step3: 分叉出现时触发的关联事件 ID */
  forkTriggerEvent?: string;
}

/** 分叉分支 */
export interface NodeForkBranch {
  /** 分支后端节点 ID */
  nodeId: string;
  /** 节点类型 */
  nodeType: DungeonNodeType;
  /** 分支标签（如 "正面迎敌"、"绕路潜行"） */
  labelKey?: string;
  /** 分支条件 */
  conditions?: NodeCondition[];
  /** 预览描述（用于 UI 展示） */
  previewKey?: string;
}

/**
 * 分支路径——记录玩家在分叉点所做的选择。
 *
 * 用途：
 * - 审计：回放玩家在节点图中的所有选择链路。
 * - 补偿：如果奖励发放异常，可追溯完整路径。
 * - 统计：分析玩家偏好路径的分布。
 */
export interface BranchPath {
  /** 分叉的源节点 ID */
  forkNodeId: string;
  /** 玩家选择的分支节点 ID */
  chosenNodeId: string;
  /** 未选择的分支节点 ID 列表 */
  skippedNodeIds: string[];
  /** 选择时的 Unix 时间戳 */
  chosenAt: number;
  /** Phase7-Step3: 分支选择后触发的关联事件 ID */
  branchSelectedEvent?: string;
}

/**
 * 楼层转换——记录层与层之间的过渡状态。
 *
 * 设计意图：
 * - 每一层是一个独立的"楼层"（Floor），层间的过渡是显式操作。
 * - 转换可能触发加载画面、楼层标题展示等 UI 行为。
 * - 持久化后可以恢复到特定层的某个节点状态。
 */
export interface FloorTransition {
  /** 转换唯一 ID */
  transitionId: string;
  /** 出发层 ID */
  fromLayerId: string;
  /** 目标层 ID */
  toLayerId: string;
  /** 出发层最后一个节点 ID */
  fromNodeId: string;
  /** 目标层入口节点 ID */
  toNodeId: string;
  /** 转换方向 */
  direction: 'forward' | 'backward' | 'warp';
  /** 转换原因 */
  reason: 'layerComplete' | 'bossDefeated' | 'warpItem' | 'debug';
  /** 转换时间戳 */
  transitionedAt: number;
  /** Phase7-Step3: 楼层转换时触发的关联事件 ID */
  floorTransitionEvent?: string;
}

/** 地牢进入规则 */
export interface DungeonEntryRule {
  /** 规则类型 */
  type: 'minPlayerLevel' | 'minPower' | 'requireItem' | 'requireClear' | 'dailyLimit';
  /** 规则参数 */
  params: Record<string, number | string>;
}

/**
 * Phase7 地牢配置（V2，与 Phase6 DungeonConfigEntry 并存）。
 *
 * 与 Phase6 的关键区别：
 * - 以 layers + nodeGraph 表达地牢结构，不再使用单一 totalLayers。
 * - Boss 是节点能力，通过 bossRef 绑定，不是独立配置字段。
 * - 奖励池引用由节点、Boss、事件、层完成奖励共同产生。
 */
export interface DungeonConfigV2 {
  /** 地牢唯一 ID */
  id: string;
  /** 配置版本号（数字，用于迁移和兼容性） */
  version: number;
  /** 多语言名称 Key */
  nameKey: string;
  /** 地牢层配置数组 */
  layers: DungeonLayerConfig[];
  /** 进入规则列表 */
  entryRules: DungeonEntryRule[];
  /** 奖励池引用列表 */
  rewardPoolRefs: string[];
  /** 事件池引用列表 */
  eventPoolRefs: string[];
  /** Boss 配置引用列表 */
  bossRefs: string[];
  /** 标签 */
  tags: string[];
}

// ==================== 地牢：运行态状态 ====================

/** 待发放的奖励项 */
export interface RewardGrant {
  /** 奖励项 ID */
  rewardId: string;
  /** 奖励类型 */
  rewardType: 'gold' | 'exp' | 'equipment' | 'item' | 'currency';
  /** 数量 */
  quantity: number;
  /** 来源标识 */
  sourceId: string;
  /** 是否已发放 */
  granted: boolean;
}

/**
 * Phase7 地牢运行态状态。
 *
 * 必须保存 dungeonVersion 和 seed，用于回放、审计、补偿发奖、异常回滚。
 */
export interface DungeonRunState {
  /** 本次运行唯一 ID */
  runId: string;
  /** 地牢配置 ID */
  dungeonId: string;
  /** 地牢配置版本号 */
  dungeonVersion: number;
  /** 随机种子 */
  seed: string;
  /** 当前层 ID */
  currentLayerId: string;
  /** 当前节点 ID */
  currentNodeId: string;
  /** 已访问节点 ID 列表 */
  visitedNodeIds: string[];
  /** 已处理事件 ID 列表 */
  resolvedEventIds: string[];
  /** 已击败 Boss ID 列表 */
  defeatedBossIds: string[];
  /** 待发放奖励列表 */
  pendingRewards: RewardGrant[];
  /** Phase7-Step2: 分支路径历史（按时间排序） */
  branchHistory?: BranchPath[];
  /** Phase7-Step2: 楼层转换历史（按时间排序） */
  floorTransitions?: FloorTransition[];
  /** Phase7-Step2: 当前层内的未选择分叉（待 UI 展示用） */
  pendingForks?: NodeFork[];
  /** Phase7-Step3: 事件历史记录（按时间排序，用于审计/补偿/统计） */
  eventHistory?: Array<{
    id: string;
    runId: string;
    eventId: string;
    nodeId: string;
    layerId: string;
    correlationId: string;
    rewards: RewardGrant[];
    createdAt: number;
  }>;
  /** 运行开始 Unix 时间戳 */
  startedAt: number;
  /** 最后更新 Unix 时间戳 */
  updatedAt: number;
}

// ---- 地牢系统接口返回类型 ----

/** 地牢节点视图（对外暴露，不含内部配置细节） */
export interface DungeonNodeView {
  /** 节点 ID */
  nodeId: string;
  /** 节点类型 */
  type: DungeonNodeType;
  /** 是否可进入 */
  canEnter: boolean;
  /** 不可进入原因 */
  blockReason?: string;
  /** Phase7-Step2: 分支标签（在分叉点 UI 中展示） */
  branchLabel?: string;
  /** Phase7-Step2: 分支预览描述 */
  branchPreview?: string;
}

/** 战斗请求（当节点类型为 battle/boss 时产生） */
export interface BattleRequest {
  /** 战斗类型 */
  battleType: 'normal' | 'boss';
  /** 敌方配置引用 */
  enemyRef: string;
  /** 敌我战力比 */
  powerRatio: number;
}

/** 进入节点的结果 */
export interface DungeonNodeResult {
  /** 更新后的运行状态 */
  runState: DungeonRunState;
  /** 本节点产生的领域事件 */
  emittedEvents: DomainEvent[];
  /** 奖励来源列表 */
  rewardSources: RewardSource[];
  /** 战斗请求（仅 battle/boss 节点） */
  battleRequest?: BattleRequest;
  /** Phase7-Step2: 当前节点的分叉信息（多分支时非空） */
  nodeFork?: NodeFork;
  /** 校验警告 */
  validationWarnings: ValidationWarning[];
}

/** 事件选择项 */
export interface EventChoice {
  /** 选项 ID */
  choiceId: string;
  /** 选项描述 Key */
  descriptionKey: string;
  /** 选择后触发的奖励来源 */
  rewardSources: RewardSource[];
  /** 选择条件 */
  conditions?: NodeCondition[];
}

/** 解决事件的结果 */
export interface DungeonEventResult {
  /** 更新后的运行状态 */
  runState: DungeonRunState;
  /** 选择的选项 ID */
  chosenChoiceId: string;
  /** 本事件产生的领域事件 */
  emittedEvents: DomainEvent[];
  /** 本次选择的奖励来源 */
  rewardSources: RewardSource[];
}

/** 完成节点的进度结果 */
export interface DungeonProgressResult {
  /** 更新后的运行状态 */
  runState: DungeonRunState;
  /** 是否触发了层完成 */
  layerCompleted: boolean;
  /** 层完成数据（仅 layerCompleted=true 时有值） */
  layerCompletion?: DungeonLayerResult;
  /** 产生的领域事件 */
  emittedEvents: DomainEvent[];
}

/** 层完成结果 */
export interface DungeonLayerResult {
  /** 已完成的层 ID */
  layerId: string;
  /** 奖励来源列表 */
  rewardSources: RewardSource[];
  /** 是否所有层已完成（地牢通关） */
  isRunComplete: boolean;
  /** 产生的领域事件 */
  emittedEvents: DomainEvent[];
  /** Phase7-Step2: 楼层转换记录（层完成时产生） */
  floorTransition?: FloorTransition;
}

/** 通关完成结果 */
export interface DungeonRunResult {
  /** 更新后的运行状态 */
  runState: DungeonRunState;
  /** 是否通关成功 */
  success: boolean;
  /** 总奖励来源 */
  rewardSources: RewardSource[];
  /** 基础奖励列表 */
  baseRewards: RewardGrant[];
  /** 产生的领域事件 */
  emittedEvents: DomainEvent[];
  /** 运行时长（毫秒） */
  durationMs: number;
}

// ==================== 掉落系统：V2 配置 ====================

/**
 * 奖励来源统一抽象。
 *
 * 所有产生奖励的场景（Boss、事件、任务、商店、补偿、赛季）归一化为 RewardSource，
 * 由 DropSystem 或 RewardSettlementService 统一结算。
 */
export interface RewardSource {
  /** 来源唯一 ID */
  sourceId: string;
  /** 来源类型 */
  sourceType:
    | 'dungeon_node'
    | 'dungeon_boss'
    | 'dungeon_event'
    | 'quest'
    | 'achievement'
    | 'shop'
    | 'compensation'
    | 'season';
  /** 掉落表引用列表 */
  dropTableRefs: string[];
  /** 奖励池引用列表 */
  rewardPoolRefs: string[];
  /** 结算上下文 */
  context: RewardContext;
}

/** 奖励结算上下文 */
export interface RewardContext {
  /** 玩家 ID */
  playerId: string;
  /** 关联 ID */
  correlationId: CorrelationId;
  /** 额外元数据 */
  metadata?: Record<string, string | number>;
}

/** 数量范围 */
export interface QuantityRange {
  /** 最小数量 */
  min: number;
  /** 最大数量 */
  max: number;
}

/** 掉落条件 */
export interface DropCondition {
  /** 条件类型 */
  type: 'playerLevel' | 'heroLevel' | 'heroRarity' | 'firstClear' | 'dailyFirst' | 'custom';
  /** 条件参数 */
  params: Record<string, number | string>;
}

/**
 * Phase7 掉落项配置（V2）。
 *
 * 与 Phase6 DropItem 的关键区别：
 * - 使用 rewardRef 而非直接 itemId（支持奖励池间接引用）。
 * - 增加 conditions 和 tags 用于条件掉落和标签分组。
 * - weight 不直接等同概率，实际概率由同池总权重计算。
 */
export interface DropEntryV2 {
  /** 奖励引用（可能是物品 ID 或奖励池引用） */
  rewardRef: string;
  /** 权重（0~N，实际概率 = weight / totalWeight） */
  weight: number;
  /** 数量范围 */
  quantity: QuantityRange;
  /** 掉落条件列表 */
  conditions?: DropCondition[];
  /** 标签 */
  tags?: string[];
}

/** 保底规则 */
export interface PityRule {
  /** 保底规则 ID */
  id: string;
  /** 保底计数器维度（按玩家、按英雄、按地牢、按 Boss、按池子） */
  scope: 'player' | 'hero' | 'dungeon' | 'boss' | 'pool';
  /** 保底计数字段 */
  scopeKey: string;
  /** 触发保底所需的计数阈值 */
  threshold: number;
  /** 保底触发时使用的奖励池引用 */
  guaranteedRewardPoolRef: string;
  /** 保底触发后是否重置计数器 */
  resetOnTrigger: boolean;
}

/** 掉落限制规则 */
export interface DropLimitRule {
  /** 限制维度 */
  scope: 'daily' | 'weekly' | 'total';
  /** 限制的奖励引用 */
  rewardRef: string;
  /** 最大次数 */
  maxCount: number;
}

/**
 * Phase7 掉落表配置（V2）。
 */
export interface DropTableConfigV2 {
  /** 掉落表唯一 ID */
  id: string;
  /** 配置版本号 */
  version: number;
  /** 掉落项列表 */
  entries: DropEntryV2[];
  /** 保底规则列表 */
  pityRules?: PityRule[];
  /** 限制规则列表 */
  limits?: DropLimitRule[];
}

/**
 * Phase7 奖励池配置。
 *
 * 奖励池允许嵌套引用，但 Validator 必须禁止循环引用。
 */
export interface RewardPoolConfigV2 {
  /** 池子唯一 ID */
  id: string;
  /** 配置版本号 */
  version: number;
  /** 结算模式 */
  mode: 'all' | 'weighted_one' | 'weighted_many' | 'sequence';
  /** 引用的掉落表 ID 列表 */
  tableRefs: string[];
}

/** 保底快照 */
export interface PitySnapshot {
  /** 保底规则 ID */
  pityRuleId: string;
  /** 当前计数 */
  counter: number;
  /** 快照时间戳 */
  timestamp: number;
}

/**
 * Phase7 掉落历史记录。
 *
 * 用途：客服审计、补偿机制、玩法分析。
 */
export interface DropHistoryRecordV2 {
  /** 记录唯一 ID */
  id: string;
  /** 玩家 ID */
  playerId: string;
  /** 来源 ID */
  sourceId: string;
  /** 来源类型 */
  sourceType: string;
  /** 掉落表版本号 */
  dropTableVersion: number;
  /** 结算随机种子 */
  seed: string;
  /** 本次获得的奖励 */
  rewards: RewardGrant[];
  /** 结算前保底状态 */
  pityBefore: PitySnapshot[];
  /** 结算后保底状态 */
  pityAfter: PitySnapshot[];
  /** 记录创建时间戳 */
  createdAt: number;
}

// ==================== 成长系统：V2 配置 ====================

/** 成长轨道类型 */
export type GrowthTrackType = 'level' | 'skill' | 'bond' | 'awakening' | 'equipment';

/** 属性修正规则 */
export interface StatModifierRule {
  /** 属性名 */
  stat: 'hp' | 'atk' | 'def' | 'speed' | 'critRate' | 'critDamage';
  /** 修正类型 */
  modifierType: 'flat' | 'multiply' | 'percent';
  /** 修正值 */
  value: number;
}

/**
 * Phase7 成长曲线配置。
 *
 * 支持两种成长方式：
 * - 表驱动：适合等级经验、固定阶段突破。
 * - 公式驱动：适合长期扩展、赛季缩放、英雄稀有度差异。
 */
export interface GrowthCurveConfig {
  /** 曲线唯一 ID */
  id: string;
  /** 配置版本号 */
  version: number;
  /** 成长轨道 */
  track: GrowthTrackType;
  /** 最大等级 */
  maxLevel: number;
  /** 经验表引用（表驱动时使用） */
  expTableRef?: string;
  /** 公式引用（公式驱动时使用） */
  formulaRef?: string;
  /** 每级属性修正 */
  statModifiers: StatModifierRule[];
}

/**
 * Phase7 成长轨道状态。
 *
 * 每个英雄同时有多个成长轨道：等级、技能、羁绊、觉醒、装备。
 */
export interface ProgressTrackState {
  /** 轨道 ID */
  trackId: string;
  /** 当前等级 */
  level: number;
  /** 当前经验 */
  exp: number;
  /** 已解锁里程碑 ID 列表 */
  unlockedMilestoneIds: string[];
  /** 轨道配置版本号 */
  version: number;
}

/**
 * Phase7 英雄成长状态（多轨）。
 *
 * 与 Phase6 HeroProgressData 的关键区别：
 * - 不再使用单一 level/power，而是 tracks 记录所有轨道。
 * - Power 由 PowerSystem 派生，不在 ProgressSystem 中直接计算。
 */
export interface HeroProgressStateV2 {
  /** 英雄 ID */
  heroId: string;
  /** 各轨道进度 */
  tracks: Record<string, ProgressTrackState>;
  /** 累计获得的总经验 */
  totalExpReceived: number;
  /** 最后更新 Unix 时间戳 */
  updatedAt: number;
}

// ==================== 战力系统：V2 配置 ====================

/** 战力修正规则 */
export interface PowerModifierRule {
  /** 修正类型 */
  type: 'flat' | 'multiply' | 'cap';
  /** 目标属性 */
  stat: string;
  /** 修正值 */
  value: number;
}

/**
 * Phase7 战力公式配置。
 *
 * 设计原则：
 * - 存档中保存 powerFormulaVersion 与最后一次计算摘要。
 * - 新公式上线不立即覆盖全部历史数据，可通过迁移任务或懒重算逐步更新。
 * - 排行榜、竞技、战斗匹配等强一致场景必须使用同一公式版本。
 */
export interface PowerFormulaConfigV2 {
  /** 公式配置唯一 ID */
  id: string;
  /** 公式版本号 */
  version: number;
  /** 生效的存档最低版本 */
  effectiveFromSaveVersion: number;
  /** 属性权重映射 */
  statWeights: Record<string, number>;
  /** 修正规则列表 */
  modifiers: PowerModifierRule[];
  /** 取整方式 */
  rounding: 'floor' | 'round' | 'ceil';
}

/** 战力计算结果摘要 */
export interface PowerCalculationSummary {
  /** 公式版本号 */
  formulaVersion: number;
  /** 输入属性摘要 */
  inputAttributes: Record<string, number>;
  /** 输出战力值 */
  outputPower: number;
  /** 差异摘要（重算时与旧值的差异） */
  deltaSummary?: string;
  /** 重算原因 */
  recalculationReason?: string;
}

// ==================== 校验警告 ====================

/**
 * 校验警告（用于领域计算结果的非致命问题提示）。
 *
 * 与 SaveValidator 的 ValidationIssue 不同：
 * - ValidationWarning 是领域层面的预警（如"Boss 掉落池为空"）。
 * - ValidationIssue 是存档层面的数据问题（如"level 类型错误"）。
 */
export interface ValidationWarning {
  /** 警告来源模块 */
  source: string;
  /** 警告代码 */
  code: string;
  /** 警告描述 */
  message: string;
  /** 相关数据引用 */
  context?: Record<string, unknown>;
}

// ==================== Roguelike 存档数据 ====================

/** Phase7 Roguelike 模块的存档数据 */
export interface RoguelikeSaveData {
  /** 活跃运行状态（null 表示无进行中的 run） */
  activeRun: DungeonRunState | null;
  /** 已完成的地牢运行历史 */
  runHistory: DungeonRunState[];
  /** 保底计数器（按 pityRuleId + scopeKey 索引） */
  pityCounters: Record<string, number>;
}

// ==================== 工厂函数 ====================

/** 生成唯一关联 ID */
export function generateCorrelationId(): CorrelationId {
  // Format: corr_<timestamp>_<random>
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 8);
  return `corr_${ts}_${rand}`;
}

/** 生成领域事件唯一 ID */
export function generateEventId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 10);
  return `evt_${ts}_${rand}`;
}

/** 生成运行唯一 ID */
export function generateRunId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 10);
  return `run_${ts}_${rand}`;
}

/** 生成随机种子 */
export function generateSeed(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 14);
  return `seed_${ts}_${rand}`;
}

/** 创建默认 RoguelikeSaveData */
export function createDefaultRoguelikeSaveData(): RoguelikeSaveData {
  return {
    activeRun: null,
    runHistory: [],
    pityCounters: {},
  };
}
