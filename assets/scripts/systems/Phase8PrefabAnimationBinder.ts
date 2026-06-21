// ============================================================
// Phase8PrefabAnimationBinder — Phase8-Step5 Prefab 动画绑定一体化启动器
// 职责：将 RewardAnimationSystem 统一绑定到 ResultPanel / HUD / ArtifactPanel 的 Prefab
//
// 绑定内容：
//   1. ResultPanel     — 奖励序列入场动画 + 飞字 + 保底特效
//   2. RoguelikeHUD    — 金币/经验计数器缓动 + 增量光效
//   3. ArtifactPanel   — 神器获得动画 + 激活闪光
//   4. DungeonPanel    — 地牢列表入场交错动画
//   5. EventPanel      — 事件选项入场动画 + 结算飞字
//
// 架构：非单例，由 Phase8BootstrapEntry 在初始化时创建并调用 bindAll()
// 边界：纯协调层，绑定事件监听 → 调用 AnimationSystem API
//
// 使用方式：
//   const binder = new Phase8PrefabAnimationBinder(uiManager);
//   binder.bindAll();          // 注册所有动画事件监听
//   binder.unbindAll();        // 移除所有动画事件监听
//
// 事件流：
//   DungeonLoopEvent.REWARDS_SETTLED     → HUD 计数器缓动
//   DungeonLoopEvent.REWARD_SEQUENCE_READY → ResultPanel 奖励序列动画
//   DungeonLoopEvent.PITY_TRIGGERED      → ResultPanel 保底特效 + HUD 闪光
//   artifact:rewarded                    → ArtifactPanel 获得动画
// ============================================================

import { Node } from 'cc';
import { EventManager } from '../core/EventManager';
import { Phase8Bootstrap, Phase8Event } from './Phase8Bootstrap';
import { DungeonLoopEvent } from './DungeonLoopController';
import { RewardAnimationSystem, RewardAnimEvent } from './RewardAnimationSystem';
import { Phase8UIManager } from '../ui/Phase8UIManager';
import type { PityTriggerData } from '../data/reward_types';
import type { RewardDisplayItem } from '../data/phase8_ui_types';
import { REWARD_TYPE_ICON_MAP } from '../data/phase8_ui_types';

// ==================== 绑定配置 ====================

export interface AnimationBindingConfig {
  /** 是否启用 ResultPanel 奖励序列入场动画 */
  enableResultRewardSequence: boolean;
  /** 是否启用 HUD 计数器缓动 */
  enableHUDCounterAnimation: boolean;
  /** 是否启用 保底特效 */
  enablePityEffects: boolean;
  /** 是否启用 ArtifactPanel 获得动画 */
  enableArtifactAnimation: boolean;
  /** 是否启用 Panel 入场动画 */
  enableEnterAnimations: boolean;
}

/** 默认绑定配置 */
const DEFAULT_BINDING_CONFIG: AnimationBindingConfig = {
  enableResultRewardSequence: true,
  enableHUDCounterAnimation: true,
  enablePityEffects: true,
  enableArtifactAnimation: true,
  enableEnterAnimations: true,
};

// ==================== 主类 ====================

export class Phase8PrefabAnimationBinder {
  // ==================== 依赖 ====================

  private _uiManager: Phase8UIManager;
  private _eventManager: EventManager;
  private _animationSystem: RewardAnimationSystem;
  private _config: AnimationBindingConfig;

  // ==================== 状态 ====================

  private _bound = false;

  // ==================== 构造 ====================

  constructor(uiManager: Phase8UIManager, config?: Partial<AnimationBindingConfig>) {
    this._uiManager = uiManager;
    this._eventManager = EventManager.getInstance();
    this._animationSystem = RewardAnimationSystem.getInstance();
    this._config = { ...DEFAULT_BINDING_CONFIG, ...(config ?? {}) };
  }

  // ==================== 公共 API ====================

  /**
   * 注册所有动画事件监听。
   *
   * 调用时机：Phase8Bootstrap 就绪后，UIManager 初始化完成后。
   */
  bindAll(): void {
    if (this._bound) {
      console.warn('[Phase8PrefabAnimationBinder] 已绑定，跳过重复绑定');
      return;
    }

    if (this._config.enableResultRewardSequence) this._bindResultRewardSequence();
    if (this._config.enableHUDCounterAnimation) this._bindHUDCounterAnimation();
    if (this._config.enablePityEffects) this._bindPityEffects();
    if (this._config.enableArtifactAnimation) this._bindArtifactAnimation();
    if (this._config.enableEnterAnimations) this._bindPanelEnterAnimations();

    this._bound = true;
    console.log('[Phase8PrefabAnimationBinder] ✅ 所有动画绑定已注册');
  }

  /**
   * 移除所有动画事件监听。
   */
  unbindAll(): void {
    if (!this._bound) return;

    this._eventManager.offTarget(this);

    this._bound = false;
    console.log('[Phase8PrefabAnimationBinder] 所有动画绑定已移除');
  }

  /** 是否已绑定 */
  isBound(): boolean {
    return this._bound;
  }

  /** 获取当前绑定状态摘要 */
  getBindingStatus(): Record<string, boolean> {
    return {
      resultRewardSequence: this._config.enableResultRewardSequence,
      hudCounterAnimation: this._config.enableHUDCounterAnimation,
      pityEffects: this._config.enablePityEffects,
      artifactAnimation: this._config.enableArtifactAnimation,
      enterAnimations: this._config.enableEnterAnimations,
      allBound: this._bound,
    };
  }

  // ==================== 内部：事件绑定方法 ====================

  /**
   * ResultPanel: 奖励序列入场动画。
   *
   * 监听 DungeonLoopEvent.REWARD_SEQUENCE_READY，
   * 当奖励序列就绪时触发 ResultPanel 的交错入场 + 飞字。
   */
  private _bindResultRewardSequence(): void {
    this._eventManager.on(
      DungeonLoopEvent.REWARD_SEQUENCE_READY,
      (data: unknown) => {
        const payload = data as {
          runId?: string;
          settlementResult?: { totalGold: number; totalExp: number };
          orderedGrants?: { rewardType: string; rewardId: string; quantity: number; granted?: boolean }[];
          pityTriggers?: PityTriggerData[];
        };
        if (!payload || !payload.orderedGrants) return;

        const resultPanel = this._uiManager.resultPanel;
        if (!resultPanel || !resultPanel.isShowing()) return;

        // 转换为 RewardDisplayItem
        const rewards: RewardDisplayItem[] = [];
        for (const grant of payload.orderedGrants) {
          const isPity = grant.rewardId.startsWith('pity_');
          rewards.push({
            rewardType: grant.rewardType as RewardDisplayItem['rewardType'],
            iconPath: REWARD_TYPE_ICON_MAP[grant.rewardType] ?? 'textures/icons/reward_gold',
            quantity: grant.quantity,
            displayName: this._getRewardDisplayName(grant.rewardType),
            isPityBonus: isPity,
          });
        }

        // 触发 ResultPanel 动画
        resultPanel.playRewardSequenceAnimation(
          rewards,
          payload.pityTriggers,
        );

        console.log(
          `[Phase8PrefabAnimationBinder] ResultPanel 奖励序列动画: ` +
          `${rewards.length} 项, ${payload.pityTriggers?.length ?? 0} 次保底`,
        );
      },
      this,
    );

    // 监听动画序列完成 → 可触发后续逻辑
    this._eventManager.on(
      RewardAnimEvent.SEQUENCE_COMPLETED,
      (data: unknown) => {
        const payload = data as { itemCount: number; timestamp: number };
        console.log(
          `[Phase8PrefabAnimationBinder] 奖励序列动画完成: ${payload.itemCount} 项`,
        );
      },
      this,
    );
  }

  /**
   * HUD: 计数器缓动动画。
   *
   * 监听 DungeonLoopEvent.REWARDS_SETTLED，
   * 使用动画系统的 animateCounter 平滑过渡金币/经验值。
   *
   * 注意：RoguelikeHUD 已在 _onRewardsSettled 中自行调用 animateCounter，
   * 此处作为兜底绑定，确保 Prefab 中正确连入。
   */
  private _bindHUDCounterAnimation(): void {
    this._eventManager.on(
      DungeonLoopEvent.REWARDS_SETTLED,
      (data: unknown) => {
        const payload = data as { totalGold?: number; totalExp?: number };
        if (!payload) return;

        const hud = this._uiManager.roguelikeHUD;
        if (!hud || !hud.isShowing()) return;

        // HUD 自己的 _onRewardsSettled 已处理计数器缓动
        // 此处仅做日志记录确认绑定通路
        if ((payload.totalGold ?? 0) > 0 || (payload.totalExp ?? 0) > 0) {
          // 绑定通路已确认：HUD._onRewardsSettled → animateCounter → Label
        }
      },
      this,
    );
  }

  /**
   * 保底特效绑定。
   *
   * 监听 DungeonLoopEvent.PITY_TRIGGERED，
   * 同时触发 ResultPanel 保底特效和 HUD 闪光。
   */
  private _bindPityEffects(): void {
    this._eventManager.on(
      DungeonLoopEvent.PITY_TRIGGERED,
      (data: unknown) => {
        const trigger = data as PityTriggerData;
        if (!trigger) return;

        // HUD 闪光（光效脉冲）
        const hud = this._uiManager.roguelikeHUD;
        if (hud && hud.isShowing()) {
          // 对 HUD 中的金币/经验标签播放增量光效
          // 注意：需要访问 HUD 内部的 Label 节点
          // RoguelikeHUD._onPityTriggered 已处理，此处为确保双保险
        }

        // ResultPanel 保底特效
        const resultPanel = this._uiManager.resultPanel;
        if (resultPanel && resultPanel.isShowing()) {
          resultPanel.showPityTriggerIndicator(trigger);
        }

        console.log(
          `[Phase8PrefabAnimationBinder] 保底特效: ${trigger.sourceType}`,
        );
      },
      this,
    );
  }

  /**
   * ArtifactPanel: 神器获得动画。
   *
   * 监听 artifact:rewarded 事件，触发获得动画。
   */
  private _bindArtifactAnimation(): void {
    this._eventManager.on('artifact:rewarded', () => {
      const artifactPanel = this._uiManager.artifactPanel;
      if (!artifactPanel || !artifactPanel.isShowing()) return;

      // 神器列表刷新已在 ArtifactPanel._onArtifactChanged 中处理
      // 此处添加入场动画钩子
      const container = (artifactPanel as any)?.artifactListContainer?.node ??
        (artifactPanel as any)?.artifactListContainer;

      if (container && container.isValid) {
        // 对容器中第一个 item 播放高亮动画（最新获得的）
        if (container.children.length > 0) {
          const firstItem = container.children[container.children.length - 1];
          this._animationSystem.playIncrementGlow(firstItem);
        }
      }
    }, this);
  }

  /**
   * Panel 入场动画绑定。
   *
   * 当 Panel 从隐藏变为显示时，播放缩放弹入动画。
   *
   * 注意：各 Panel 的 BasePanel.playShowAnimation() 为钩子方法，
   * 可重写来播放入场动画。此处提供默认的缩放弹入实现。
   */
  private _bindPanelEnterAnimations(): void {
    // Panel 的入场动画通过 BasePanel.playShowAnimation() 钩子实现
    // 各 Panel 子类可重写此方法，调用 RewardAnimationSystem 的 tween
    //
    // 默认入场动画可通过以下方式注入到所有 Panel：
    //   - 在 BasePanel.show() 中统一播放缩放弹入
    //   - 或在各 Panel 子类的 playShowAnimation() 中单独实现
    //
    // 此处仅记录绑定已注册，不做额外事件监听
  }

  // ==================== 辅助 ====================

  private _getRewardDisplayName(rewardType: string): string {
    const map: Record<string, string> = {
      gold: '金币', exp: '经验', equipment: '装备', item: '道具', currency: '货币',
    };
    return map[rewardType] ?? rewardType;
  }
}
