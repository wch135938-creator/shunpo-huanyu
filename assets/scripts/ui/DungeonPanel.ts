// ============================================================
// DungeonPanel — Phase8 地牢选择界面
// 职责：展示可用地牢列表 / 显示地牢信息 / 进入地牢
// 规范：继承 BasePanel / 纯 UI / 通过 Phase8Bootstrap 获取系统引用
// ============================================================

import { _decorator, Node, Label, Button, Prefab, instantiate } from 'cc';
import { BasePanel } from '../core/BasePanel';
import { EventManager } from '../core/EventManager';
import { Phase8Bootstrap } from '../systems/Phase8Bootstrap';
import { RoguelikeSystem } from '../systems/RoguelikeSystem';
import type { DungeonConfigV2 } from '../data/roguelike_types';
import type { DungeonListEntry } from '../data/phase8_ui_types';

const { ccclass, property } = _decorator;

@ccclass('DungeonPanel')
export class DungeonPanel extends BasePanel {
  // ==================== 编辑器绑定 ====================

  @property({ type: Node, tooltip: '面板根节点' })
  panelRoot: Node | null = null;

  @property({ type: Node, tooltip: '地牢列表容器' })
  contentNode: Node | null = null;

  @property({ type: Prefab, tooltip: '地牢列表项 Prefab' })
  dungeonItemPrefab: Prefab | null = null;

  @property({ type: Label, tooltip: '标题标签' })
  titleLabel: Label | null = null;

  @property({ type: Button, tooltip: '关闭按钮' })
  closeButton: Button | null = null;

  @property({ type: Label, tooltip: '玩家战力标签' })
  powerLabel: Label | null = null;

  @property({ type: Label, tooltip: '提示标签（无可用地牢时显示）' })
  emptyHintLabel: Label | null = null;

  // ==================== 内部状态 ====================

  private _roguelikeSystem: RoguelikeSystem | null = null;
  private _dungeonEntries: DungeonListEntry[] = [];
  private _playerPower = 0;

  // ==================== BasePanel 生命周期 ====================

  protected registerEvents(): void {
    const em = EventManager.getInstance();
    em.on(RoguelikeSystem.RUN_STARTED, this._onRunStarted, this);
  }

  protected unregisterEvents(): void {
    const em = EventManager.getInstance();
    em.off(RoguelikeSystem.RUN_STARTED, this._onRunStarted, this);
  }

  // ==================== 公开方法 ====================

  /**
   * 打开地牢选择面板。
   *
   * @param playerPower  当前玩家战力（用于显示推荐战力对比）
   */
  open(playerPower: number = 0): void {
    const bootstrap = Phase8Bootstrap.getInstance();
    if (!bootstrap.isReady()) {
      console.warn('[DungeonPanel] Phase8Bootstrap 尚未就绪');
      return;
    }

    this._roguelikeSystem = bootstrap.getRoguelikeSystem();
    this._playerPower = playerPower;

    this._buildDungeonEntries();
    this._renderDungeonList();

    if (this.titleLabel) {
      this.titleLabel.string = '选择地牢';
    }

    if (this.powerLabel) {
      this.powerLabel.string = `战力: ${playerPower}`;
    }

    this.show();
  }

  /** 设置玩家战力 */
  setPlayerPower(power: number): void {
    this._playerPower = power;
    if (this.powerLabel) {
      this.powerLabel.string = `战力: ${power}`;
    }
  }

  // ==================== 内部：构建地牢列表 ====================

  private _buildDungeonEntries(): void {
    const bootstrap = Phase8Bootstrap.getInstance();
    const configs = bootstrap.getDungeonV2Configs();
    const entries: DungeonListEntry[] = [];

    for (const config of configs) {
      const entry: DungeonListEntry = {
        dungeonId: config.id,
        nameKey: config.nameKey,
        difficulty: this._deriveDifficulty(config.tags),
        totalLayers: config.layers.length,
        unlocked: this._checkUnlocked(config),
        unlockHint: this._getUnlockHint(config),
        recommendPower: this._getRecommendPower(config),
        rewardTags: this._getRewardTags(config),
      };
      entries.push(entry);
    }

    this._dungeonEntries = entries;
  }

  private _deriveDifficulty(tags: string[]): DungeonListEntry['difficulty'] {
    if (tags.includes('endgame')) return 'expert';
    if (tags.includes('hard')) return 'hard';
    return 'normal';
  }

  private _checkUnlocked(_config: DungeonConfigV2): boolean {
    // 简化实现：第一个地牢总是解锁
    // 后续可根据 entryRules 中的 minPlayerLevel / requireClear 判断
    return true;
  }

  private _getUnlockHint(config: DungeonConfigV2): string | undefined {
    if (config.entryRules && config.entryRules.length > 0) {
      const levelRule = config.entryRules.find((r) => r.type === 'minPlayerLevel');
      if (levelRule) {
        return `需要等级 ${levelRule.params.level}`;
      }
    }
    return undefined;
  }

  private _getRecommendPower(config: DungeonConfigV2): number {
    // 简化：层数越多推荐战力越高
    const basePower = 500;
    const perLayerPower = 300;
    return basePower + config.layers.length * perLayerPower;
  }

  private _getRewardTags(config: DungeonConfigV2): string[] {
    const tags: string[] = [];
    if (config.tags.includes('starter')) tags.push('金币');
    if (config.tags.includes('hard')) tags.push('稀有装备');
    if (config.tags.includes('endgame')) tags.push('史诗掉落');
    tags.push('经验');
    return tags;
  }

  // ==================== 内部：渲染 ====================

  private _renderDungeonList(): void {
    if (!this.contentNode || !this.dungeonItemPrefab) return;

    // 清空旧内容
    this.contentNode.removeAllChildren();

    if (this._dungeonEntries.length === 0) {
      if (this.emptyHintLabel) {
        this.emptyHintLabel.string = '暂无可用的地牢';
        this.emptyHintLabel.node.active = true;
      }
      return;
    }

    if (this.emptyHintLabel) {
      this.emptyHintLabel.node.active = false;
    }

    for (const entry of this._dungeonEntries) {
      const itemNode = instantiate(this.dungeonItemPrefab);
      this._configureDungeonItem(itemNode, entry);
      this.contentNode.addChild(itemNode);
    }
  }

  private _configureDungeonItem(itemNode: Node, entry: DungeonListEntry): void {
    // 查找子节点并设置数据
    const nameLabel = itemNode.getChildByName('NameLabel')?.getComponent(Label);
    const layerLabel = itemNode.getChildByName('LayerLabel')?.getComponent(Label);
    const powerLabel = itemNode.getChildByName('PowerLabel')?.getComponent(Label);
    const rewardLabel = itemNode.getChildByName('RewardLabel')?.getComponent(Label);
    const enterBtn = itemNode.getChildByName('EnterButton')?.getComponent(Button);
    const lockMask = itemNode.getChildByName('LockMask');

    if (nameLabel) nameLabel.string = entry.nameKey;
    if (layerLabel) layerLabel.string = `${entry.totalLayers} 层`;
    if (powerLabel) powerLabel.string = `推荐战力: ${entry.recommendPower}`;
    if (rewardLabel) rewardLabel.string = entry.rewardTags.join(' / ');

    // 锁定状态
    if (lockMask) {
      lockMask.active = !entry.unlocked;
    }

    // 进入按钮
    if (enterBtn) {
      enterBtn.node.active = entry.unlocked;
      enterBtn.node.on(Button.EventType.CLICK, () => {
        this._handleEnterDungeon(entry.dungeonId);
      }, this);
    }
  }

  // ==================== 交互 ====================

  private _handleEnterDungeon(dungeonId: string): void {
    if (!this._roguelikeSystem) return;

    const runState = this._roguelikeSystem.startRun(dungeonId);
    if (runState) {
      console.log(`[DungeonPanel] 开始地牢: ${dungeonId}, runId=${runState.runId}`);
      this.hide();
    }
  }

  // ==================== 事件响应 ====================

  private _onRunStarted(..._args: unknown[]): void {
    // 地牢运行开始后自动隐藏面板
    if (this._isShowing) {
      this.hide();
    }
  }

  // ==================== 按钮绑定 ====================

  onLoad(): void {
    super.onLoad();
    if (this.closeButton) {
      this.closeButton.node.on(Button.EventType.CLICK, this._handleClose, this);
    }
  }

  private _handleClose(): void {
    this.hide();
  }

  onDestroy(): void {
    super.onDestroy();
  }
}
