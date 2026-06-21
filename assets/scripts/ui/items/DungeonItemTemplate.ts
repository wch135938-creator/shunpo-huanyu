// ============================================================
// DungeonItemTemplate — 地牢列表项模板组件
// 职责：挂载到 DungeonPanel 的 dungeonItemPrefab 上
// 规范：纯 UI，接收 DungeonListEntry 数据并刷新显示
// ============================================================

import { _decorator, Component, Node, Label, Button, Color } from 'cc';
import type { DungeonListEntry } from '../../data/phase8_ui_types';

const { ccclass, property } = _decorator;

@ccclass('DungeonItemTemplate')
export class DungeonItemTemplate extends Component {
  @property({ type: Label, tooltip: '地牢名称' })
  nameLabel: Label | null = null;

  @property({ type: Label, tooltip: '层数标签' })
  layerLabel: Label | null = null;

  @property({ type: Label, tooltip: '推荐战力标签' })
  powerLabel: Label | null = null;

  @property({ type: Label, tooltip: '奖励预览标签' })
  rewardLabel: Label | null = null;

  @property({ type: Button, tooltip: '进入按钮' })
  enterButton: Button | null = null;

  @property({ type: Node, tooltip: '锁定遮罩节点' })
  lockMask: Node | null = null;

  private _entry: DungeonListEntry | null = null;
  private _onEnterCallback: ((dungeonId: string) => void) | null = null;

  /** 设置数据并刷新显示 */
  setup(entry: DungeonListEntry, onEnter?: (dungeonId: string) => void): void {
    this._entry = entry;
    this._onEnterCallback = onEnter ?? null;
    this._refresh();
  }

  private _refresh(): void {
    if (!this._entry) return;

    if (this.nameLabel) this.nameLabel.string = this._entry.nameKey;
    if (this.layerLabel) this.layerLabel.string = `${this._entry.totalLayers} 层`;
    if (this.powerLabel) this.powerLabel.string = `推荐战力: ${this._entry.recommendPower}`;
    if (this.rewardLabel) this.rewardLabel.string = this._entry.rewardTags.join(' / ');

    if (this.lockMask) this.lockMask.active = !this._entry.unlocked;
    if (this.enterButton) {
      this.enterButton.node.active = this._entry.unlocked;
      if (this._entry.unlocked) {
        this.enterButton.node.off(Button.EventType.CLICK);
        this.enterButton.node.on(Button.EventType.CLICK, this._onEnterClicked, this);
      }
    }
  }

  private _onEnterClicked(): void {
    if (this._entry && this._onEnterCallback) {
      this._onEnterCallback(this._entry.dungeonId);
    }
  }
}
