// ============================================================
// RoguelikeHUD — Phase8 地牢内 HUD 覆盖层
// 职责：显示当前层数 / 进度条 / 资源 / 运行信息
// 规范：继承 BasePanel / 纯 UI / 由 RoguelikeSystem 事件驱动刷新
// ============================================================

import { _decorator, Node, Label, Sprite, Button } from 'cc';
import { BasePanel } from '../core/BasePanel';
import { EventManager } from '../core/EventManager';
import { Phase8Bootstrap } from '../systems/Phase8Bootstrap';
import { RoguelikeSystem } from '../systems/RoguelikeSystem';
import { DungeonLoopEvent } from '../systems/DungeonLoopController';
import { RewardAnimationSystem } from '../systems/RewardAnimationSystem';
import type { DungeonRunState, DungeonConfigV2 } from '../data/roguelike_types';
import type { RoguelikeHUDData } from '../data/phase8_ui_types';
import type { PityTriggerData } from '../data/reward_types';

const { ccclass, property } = _decorator;

@ccclass('RoguelikeHUD')
export class RoguelikeHUD extends BasePanel {
  // ==================== 编辑器绑定 ====================

  @property({ type: Node, tooltip: 'HUD 根节点' })
  panelRoot: Node | null = null;

  @property({ type: Label, tooltip: '当前层/总层数标签' })
  floorLabel: Label | null = null;

  @property({ type: Sprite, tooltip: '进度条填充' })
  progressFill: Sprite | null = null;

  @property({ type: Label, tooltip: '进度百分比标签' })
  progressLabel: Label | null = null;

  @property({ type: Label, tooltip: '金币标签' })
  goldLabel: Label | null = null;

  @property({ type: Label, tooltip: '经验标签' })
  expLabel: Label | null = null;

  @property({ type: Label, tooltip: '种子标签' })
  seedLabel: Label | null = null;

  @property({ type: Label, tooltip: '地牢名称标签' })
  dungeonNameLabel: Label | null = null;

  @property({ type: Button, tooltip: '暂停/退出按钮' })
  pauseButton: Button | null = null;

  // ==================== 内部状态 ====================

  private _roguelikeSystem: RoguelikeSystem | null = null;
  private _activeRunState: DungeonRunState | null = null;
  private _runGold = 0;
  private _runExp = 0;

  // ==================== BasePanel 生命周期 ====================

  protected registerEvents(): void {
    const em = EventManager.getInstance();
    em.on(RoguelikeSystem.RUN_STARTED, this._onRunStarted, this);
    em.on(RoguelikeSystem.NODE_ENTERED, this._onNodeEntered, this);
    em.on(RoguelikeSystem.NODE_COMPLETED, this._onNodeCompleted, this);
    em.on(RoguelikeSystem.LAYER_COMPLETED, this._onLayerCompleted, this);
    em.on(RoguelikeSystem.RUN_COMPLETED, this._onRunCompleted, this);
    em.on(RoguelikeSystem.FLOOR_TRANSITIONED, this._onFloorTransitioned, this);
    // DungeonLoop 奖励结算事件 → 更新资源显示
    em.on(DungeonLoopEvent.REWARDS_SETTLED, this._onRewardsSettled, this);
    // Phase8-Step4: 保底触发 → HUD 提示
    em.on(DungeonLoopEvent.PITY_TRIGGERED, this._onPityTriggered, this);
  }

  protected unregisterEvents(): void {
    const em = EventManager.getInstance();
    em.off(RoguelikeSystem.RUN_STARTED, this._onRunStarted, this);
    em.off(RoguelikeSystem.NODE_ENTERED, this._onNodeEntered, this);
    em.off(RoguelikeSystem.NODE_COMPLETED, this._onNodeCompleted, this);
    em.off(RoguelikeSystem.LAYER_COMPLETED, this._onLayerCompleted, this);
    em.off(RoguelikeSystem.RUN_COMPLETED, this._onRunCompleted, this);
    em.off(RoguelikeSystem.FLOOR_TRANSITIONED, this._onFloorTransitioned, this);
    em.off(DungeonLoopEvent.REWARDS_SETTLED, this._onRewardsSettled, this);
    em.off(DungeonLoopEvent.PITY_TRIGGERED, this._onPityTriggered, this);
  }

  // ==================== 公开方法 ====================

  /** 激活 HUD（地牢运行开始时调用） */
  activate(): void {
    const bootstrap = Phase8Bootstrap.getInstance();
    if (!bootstrap.isReady()) return;

    this._roguelikeSystem = bootstrap.getRoguelikeSystem();
    this.show();
  }

  /** 使用运行状态刷新 HUD */
  refreshWithRunState(runState: DungeonRunState): void {
    this._activeRunState = runState;
    this._refreshAll();
  }

  /** 增加本次 run 获得的金币 */
  addGold(amount: number): void {
    this._runGold += amount;
    this._refreshResourceLabels();
  }

  /** 增加本次 run 获得的经验 */
  addExp(amount: number): void {
    this._runExp += amount;
    this._refreshResourceLabels();
  }

  // ==================== 内部：刷新 ====================

  private _refreshAll(): void {
    if (!this._activeRunState) return;

    const config = this._roguelikeSystem?.getDungeonConfig(this._activeRunState.dungeonId);
    const totalLayers = config?.layers.length ?? 1;
    const currentLayer = config?.layers.find(
      (l) => l.id === this._activeRunState!.currentLayerId,
    );
    const currentLayerIndex = config?.layers.findIndex(
      (l) => l.id === this._activeRunState!.currentLayerId,
    ) ?? 0;

    // 层数标签
    if (this.floorLabel) {
      this.floorLabel.string = `${currentLayerIndex + 1} / ${totalLayers}`;
    }

    // 进度条
    if (currentLayer) {
      const totalNodes = currentLayer.nodeGraph.length;
      const visitedInLayer = currentLayer.nodeGraph.filter(
        (n) => this._activeRunState!.visitedNodeIds.includes(n.id),
      ).length;
      const progress = totalNodes > 0 ? visitedInLayer / totalNodes : 0;

      if (this.progressFill) {
        // 通过 scaleX 或 fillRange 控制进度条
        this.progressFill.node.setScale(progress, 1, 1);
      }

      if (this.progressLabel) {
        this.progressLabel.string = `${Math.round(progress * 100)}%`;
      }
    }

    // 地牢名称
    if (this.dungeonNameLabel && config) {
      this.dungeonNameLabel.string = config.nameKey;
    }

    // 种子
    if (this.seedLabel) {
      this.seedLabel.string = `种子: ${this._activeRunState.seed.substring(0, 12)}`;
    }

    this._refreshResourceLabels();
  }

  private _refreshResourceLabels(): void {
    if (this.goldLabel) {
      this.goldLabel.string = `💰 ${this._runGold}`;
    }

    if (this.expLabel) {
      this.expLabel.string = `✨ ${this._runExp}`;
    }
  }

  // ==================== 事件响应 ====================

  private _onRunStarted(runState: unknown): void {
    const state = runState as DungeonRunState;
    if (!state) return;

    this._activeRunState = state;
    this._runGold = 0;
    this._runExp = 0;
    this.show();
    this._refreshAll();
  }

  private _onNodeEntered(_data: unknown): void {
    if (!this._isShowing || !this._activeRunState) return;
    this._refreshAll();
  }

  private _onNodeCompleted(_data: unknown): void {
    if (!this._isShowing || !this._activeRunState) return;
    this._refreshAll();
  }

  private _onLayerCompleted(_data: unknown): void {
    if (!this._isShowing || !this._activeRunState) return;
    this._refreshAll();
  }

  private _onFloorTransitioned(_data: unknown): void {
    if (!this._isShowing || !this._activeRunState) return;
    this._refreshAll();
  }

  private _onRunCompleted(_data: unknown): void {
    this._activeRunState = null;
    this.hide();
  }

  /**
   * 奖励结算事件 → 从 DungeonLoopController 同步累计资源到 HUD。
   * Phase8-Step4: 使用计数器缓动动画替代即时赋值。
   */
  private _onRewardsSettled(data: unknown): void {
    if (!this._isShowing || !this._activeRunState) return;

    const payload = data as { runId?: string; totalGold?: number; totalExp?: number };
    if (!payload || !payload.runId) return;

    // 从 DungeonLoopController 读取累计值
    const bootstrap = Phase8Bootstrap.getInstance();
    if (!bootstrap.isReady()) return;

    const loopController = bootstrap.getDungeonLoopController();
    const stats = loopController.getRunStats(payload.runId);

    const oldGold = this._runGold;
    const oldExp = this._runExp;
    const newGold = stats.gold;
    const newExp = stats.exp;

    this._runGold = newGold;
    this._runExp = newExp;

    // Phase8-Step4: 使用动画系统播放计数器缓动
    const animSys = this._getAnimationSystem();
    if (animSys && this.goldLabel) {
      // 金币计数器缓动
      animSys.animateCounter(oldGold, newGold, 0.3, (val: number) => {
        if (this.goldLabel) {
          this.goldLabel.string = `💰 ${val}`;
        }
      }, () => {
        // 完成时播放增量光效
        if (newGold > oldGold && this.goldLabel) {
          animSys.playIncrementGlow(this.goldLabel.node);
        }
      });
    }

    if (animSys && this.expLabel) {
      // 经验计数器缓动
      animSys.animateCounter(oldExp, newExp, 0.3, (val: number) => {
        if (this.expLabel) {
          this.expLabel.string = `✨ ${val}`;
        }
      }, () => {
        if (newExp > oldExp && this.expLabel) {
          animSys.playIncrementGlow(this.expLabel.node);
        }
      });
    }

    // 如果动画系统不可用，回退到即时赋值
    if (!animSys) {
      this._refreshResourceLabels();
    }

    // 日志
    if (payload.totalGold && payload.totalGold > 0) {
      console.log(`[RoguelikeHUD] 金币 +${payload.totalGold} (累计: ${this._runGold})`);
    }
    if (payload.totalExp && payload.totalExp > 0) {
      console.log(`[RoguelikeHUD] 经验 +${payload.totalExp} (累计: ${this._runExp})`);
    }
  }

  /**
   * Phase8-Step4: 保底触发事件 → HUD 显示闪烁提示。
   */
  private _onPityTriggered(data: unknown): void {
    if (!this._isShowing) return;

    const trigger = data as PityTriggerData;
    if (!trigger) return;

    console.log(
      `[RoguelikeHUD] 保底触发! ${trigger.sourceType} → ` +
      `${trigger.bonusReward.rewardType}x${trigger.bonusReward.quantity}`,
    );

    // 对金币/经验标签播放增量光效
    const animSys = this._getAnimationSystem();
    if (animSys) {
      if (this.goldLabel) animSys.playIncrementGlow(this.goldLabel.node);
      if (this.expLabel) animSys.playIncrementGlow(this.expLabel.node);
    }

    // TODO: 可在此添加 HUD 保底提示文本（需在编辑器中绑定 pityTipLabel）
  }

  // ==================== 内部：动画辅助 ====================

  private _getAnimationSystem(): RewardAnimationSystem | null {
    try {
      const bootstrap = Phase8Bootstrap.getInstance();
      if (bootstrap.isReady()) {
        return bootstrap.getRewardAnimationSystem();
      }
    } catch {
      // 回退
    }
    return null;
  }

  // ==================== 按钮绑定 ====================

  onLoad(): void {
    super.onLoad();
    this.pauseButton?.node.on(Button.EventType.CLICK, this._handlePause, this);
  }

  private _handlePause(): void {
    // TODO: 打开暂停菜单
    console.log('[RoguelikeHUD] 暂停按钮点击');
  }

  onDestroy(): void {
    super.onDestroy();
  }
}
