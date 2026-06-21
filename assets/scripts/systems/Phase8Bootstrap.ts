// ============================================================
// Phase8Bootstrap — Phase8 系统初始化与配置加载
// 职责：加载所有 Phase8 配置 / 实例化 Phase7 系统 / 注册配置 / 提供系统引用
// 边界：纯逻辑层，不操作 UI、Canvas、Camera
//
// 使用方式：
//   1. 游戏启动时调用 Phase8Bootstrap.getInstance().initialize()
//   2. 初始化完成后通过 getXxx() 获取各系统引用
//   3. UI 面板通过 getXxx() 获取系统引用并调用其 API
// ============================================================

import { BaseManager } from '../core/BaseManager';
import { ConfigManager } from '../core/ConfigManager';
import { EventManager } from '../core/EventManager';
import { RoguelikeSystem } from './RoguelikeSystem';
import { DungeonEventManager } from './DungeonEventManager';
import { ArtifactSystem } from './ArtifactSystem';
import { LiveOpsManager } from './LiveOpsManager';
import { SpecialEventManager } from './SpecialEventManager';
import { DropSystem } from './DropSystem';
import { DungeonLoopController } from './DungeonLoopController';
import { RewardAnimationSystem } from './RewardAnimationSystem';
import type { DungeonConfigV2, RewardPoolConfigV2, DropTableConfigV2 } from '../data/roguelike_types';
import type { EventConfig, EventPool } from '../data/event_types';
import type { ArtifactConfig } from '../data/artifact_types';
import type { LiveOpsConfig } from '../data/liveops_types';
import type { SpecialEventConfig } from '../data/specialevent_types';
import type { BossConfigData } from '../config/boss_config';

// ---- 配置路径常量 ----

const PHASE8_CONFIG_PATHS = [
  'config/systems/boss_config',
  'config/systems/artifact_config',
  'config/systems/liveops_config',
  'config/systems/special_event_config',
  'config/systems/dungeon_v2_config',
  'config/systems/event_config',
  'config/systems/event_pool_config',
  'config/systems/reward_pool_config',
  'config/localization/phase8_ui_texts',
  'config/icons/phase8_icon_mapping',
];

// ---- 事件常量 ----

export const Phase8Event = {
  /** Phase8 所有配置加载完成 */
  BOOTSTRAP_READY: 'phase8:bootstrapReady',
  /** 配置加载失败 */
  BOOTSTRAP_FAILED: 'phase8:bootstrapFailed',
} as const;

// ---- 容器接口 ----

/** 地牢 V2 配置容器（匹配 JSON 顶层结构） */
interface DungeonV2ConfigContainer {
  version: number;
  name: string;
  data: DungeonConfigV2[];
}

/** 事件配置容器 */
interface EventConfigContainer {
  version: number;
  name: string;
  data: EventConfig[];
}

/** 事件池容器 */
interface EventPoolContainer {
  version: number;
  name: string;
  data: EventPool[];
}

/** 奖励池容器 */
interface RewardPoolContainer {
  version: number;
  name: string;
  data: RewardPoolConfigV2[];
}

/** 神器配置容器 */
interface ArtifactConfigContainer {
  version: number;
  name: string;
  data: ArtifactConfig[];
}

/** 运营活动配置容器 */
interface LiveOpsConfigContainer {
  version: number;
  name: string;
  data: LiveOpsConfig[];
}

/** 特殊事件配置容器 */
interface SpecialEventConfigContainer {
  version: number;
  name: string;
  data: SpecialEventConfig[];
}

export class Phase8Bootstrap extends BaseManager {
  // ===== 单例 =====

  static getInstance(): Phase8Bootstrap {
    return super.getInstance<Phase8Bootstrap>();
  }

  // ===== 依赖 =====

  private _configManager: ConfigManager;
  private _eventManager: EventManager;

  // ===== Phase7 系统实例 =====

  private _roguelikeSystem: RoguelikeSystem;
  private _dungeonEventManager: DungeonEventManager;
  private _artifactSystem: ArtifactSystem;
  private _liveOpsManager: LiveOpsManager;
  private _specialEventManager: SpecialEventManager;
  private _dungeonLoopController: DungeonLoopController;
  private _rewardAnimationSystem: RewardAnimationSystem;

  // ===== 内部状态 =====

  private _ready = false;
  private _configCount = 0;

  // ===== 构造 =====

  constructor() {
    super();
    this._configManager = ConfigManager.getInstance();
    this._eventManager = EventManager.getInstance();

    this._roguelikeSystem = new RoguelikeSystem();
    this._dungeonEventManager = new DungeonEventManager();
    this._artifactSystem = new ArtifactSystem();
    this._liveOpsManager = new LiveOpsManager();
    this._specialEventManager = new SpecialEventManager();
    this._dungeonLoopController = new DungeonLoopController(this);
    this._rewardAnimationSystem = RewardAnimationSystem.getInstance();
  }

  // ================================================================
  // 初始化
  // ================================================================

  /**
   * 异步初始化 — 加载所有 Phase8 配置并注入到各系统。
   *
   * 调用时机：游戏启动时，在进入任何游戏场景之前。
   * 可重复调用（幂等）— 已 ready 时直接返回。
   */
  async initialize(): Promise<void> {
    if (this._ready) return;

    console.log('[Phase8Bootstrap] INIT');

    try {
      // 1. 加载所有配置
      await this._configManager.loadConfigs(PHASE8_CONFIG_PATHS);
      this._configCount = PHASE8_CONFIG_PATHS.length;

      // 2. 注入配置到各系统
      this._injectDungeonConfigs();
      this._injectEventConfigs();
      this._injectArtifactConfigs();
      this._injectLiveOpsConfigs();
      this._injectSpecialEventConfigs();

      this._ready = true;

      this._eventManager.emit(Phase8Event.BOOTSTRAP_READY, {
        configCount: this._configCount,
      });

      console.log(`[Phase8Bootstrap] 初始化完成，已加载 ${this._configCount} 个配置`);
    } catch (err) {
      console.error('[Phase8Bootstrap] 初始化失败:', err);
      this._eventManager.emit(Phase8Event.BOOTSTRAP_FAILED, { error: err });
      throw err;
    }
  }

  // ================================================================
  // 配置注入
  // ================================================================

  /** 注入地牢 V2 配置到 RoguelikeSystem */
  private _injectDungeonConfigs(): void {
    const container = this._configManager.getConfig<DungeonV2ConfigContainer>(
      'config/systems/dungeon_v2_config',
    );
    if (container?.data) {
      this._roguelikeSystem.registerConfigs(container.data);
      console.log(`[Phase8Bootstrap] 已注册 ${container.data.length} 个地牢 V2 配置`);
    }
  }

  /** 注入事件配置和事件池到 DungeonEventManager */
  private _injectEventConfigs(): void {
    // 事件配置
    const eventContainer = this._configManager.getConfig<EventConfigContainer>(
      'config/systems/event_config',
    );
    if (eventContainer?.data) {
      this._dungeonEventManager.registerEventConfigs(eventContainer.data);
      console.log(`[Phase8Bootstrap] 已注册 ${eventContainer.data.length} 个事件配置`);
    }

    // 事件池
    const poolContainer = this._configManager.getConfig<EventPoolContainer>(
      'config/systems/event_pool_config',
    );
    if (poolContainer?.data) {
      this._dungeonEventManager.registerEventPools(poolContainer.data);
      console.log(`[Phase8Bootstrap] 已注册 ${poolContainer.data.length} 个事件池`);
    }
  }

  /** 注入神器配置到 ArtifactSystem */
  private _injectArtifactConfigs(): void {
    const container = this._configManager.getConfig<ArtifactConfigContainer>(
      'config/systems/artifact_config',
    );
    if (container?.data) {
      // ArtifactSystem 通过 loadInventory 加载存档数据
      // 配置数据在 UI 层通过 getConfig() 查询
      console.log(`[Phase8Bootstrap] 已加载 ${container.data.length} 个神器配置`);
    }
  }

  /** 注入运营活动配置到 LiveOpsManager */
  private _injectLiveOpsConfigs(): void {
    const container = this._configManager.getConfig<LiveOpsConfigContainer>(
      'config/systems/liveops_config',
    );
    if (container?.data) {
      this._liveOpsManager.loadConfigs(container.data);
      this._liveOpsManager.refreshEvents();
      console.log(`[Phase8Bootstrap] 已注册 ${container.data.length} 个运营活动`);
    }
  }

  /** 注入特殊事件配置到 SpecialEventManager */
  private _injectSpecialEventConfigs(): void {
    const container = this._configManager.getConfig<SpecialEventConfigContainer>(
      'config/systems/special_event_config',
    );
    if (container?.data) {
      this._specialEventManager.loadConfigs(container.data);
      console.log(`[Phase8Bootstrap] 已注册 ${container.data.length} 个特殊事件`);
    }
  }

  // ================================================================
  // 系统引用（供 UI 层获取）
  // ================================================================

  getRoguelikeSystem(): RoguelikeSystem {
    return this._roguelikeSystem;
  }

  getDungeonEventManager(): DungeonEventManager {
    return this._dungeonEventManager;
  }

  getArtifactSystem(): ArtifactSystem {
    return this._artifactSystem;
  }

  getLiveOpsManager(): LiveOpsManager {
    return this._liveOpsManager;
  }

  getSpecialEventManager(): SpecialEventManager {
    return this._specialEventManager;
  }

  getDungeonLoopController(): DungeonLoopController {
    return this._dungeonLoopController;
  }

  /** Phase8-Step4: 获取奖励动画系统 */
  getRewardAnimationSystem(): RewardAnimationSystem {
    return this._rewardAnimationSystem;
  }

  // ================================================================
  // 配置查询（供 UI 层直接读取配置）
  // ================================================================

  /** 获取所有神器配置 */
  getArtifactConfigs(): ArtifactConfig[] {
    const container = this._configManager.getConfig<ArtifactConfigContainer>(
      'config/systems/artifact_config',
    );
    return container?.data ?? [];
  }

  /** 获取所有运营活动配置 */
  getLiveOpsConfigs(): LiveOpsConfig[] {
    const container = this._configManager.getConfig<LiveOpsConfigContainer>(
      'config/systems/liveops_config',
    );
    return container?.data ?? [];
  }

  /** 获取所有 Boss 配置 */
  getBossConfigs(): BossConfigData['data'] {
    const container = this._configManager.getConfig<BossConfigData>(
      'config/systems/boss_config',
    );
    return container?.data ?? [];
  }

  /** 根据 ID 获取单个 Boss 配置 */
  getBossConfig(bossId: string): BossConfigData['data'][number] | null {
    const container = this._configManager.getConfig<BossConfigData>(
      'config/systems/boss_config',
    );
    return container?.data.find((b) => b.id === bossId) ?? null;
  }

  /** 获取所有地牢 V2 配置 */
  getDungeonV2Configs(): DungeonConfigV2[] {
    const container = this._configManager.getConfig<DungeonV2ConfigContainer>(
      'config/systems/dungeon_v2_config',
    );
    return container?.data ?? [];
  }

  // ================================================================
  // 状态查询
  // ================================================================

  isReady(): boolean {
    return this._ready;
  }
}
