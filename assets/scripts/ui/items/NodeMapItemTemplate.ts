// ============================================================
// NodeMapItemTemplate — 节点地图中的节点项模板组件
// 职责：挂载到 DungeonNodeMapPanel 的 nodeItemPrefab 上
// ============================================================

import { _decorator, Component, Label, Button, Node, Sprite, Color } from 'cc';
import type { DungeonNodeUIData } from '../../data/phase8_ui_types';

const { ccclass, property } = _decorator;

@ccclass('NodeMapItemTemplate')
export class NodeMapItemTemplate extends Component {
  @property({ type: Label, tooltip: '图标标签' })
  iconLabel: Label | null = null;

  @property({ type: Label, tooltip: '名称标签' })
  nameLabel: Label | null = null;

  @property({ type: Node, tooltip: '状态指示器' })
  statusIndicator: Node | null = null;

  @property({ type: Sprite, tooltip: '状态指示器 Sprite（可选）' })
  statusSprite: Sprite | null = null;

  @property({ type: Button, tooltip: '进入按钮' })
  enterButton: Button | null = null;

  private _data: DungeonNodeUIData | null = null;
  private _onEnterCallback: ((nodeId: string) => void) | null = null;

  /** 设置数据 */
  setup(data: DungeonNodeUIData, onEnter?: (nodeId: string) => void): void {
    this._data = data;
    this._onEnterCallback = onEnter ?? null;
    this._refresh();
  }

  private _refresh(): void {
    if (!this._data) return;

    if (this.iconLabel) this.iconLabel.string = this._data.label.substring(0, 2);
    if (this.nameLabel) this.nameLabel.string = this._data.label;

    // 状态颜色
    const statusColors: Record<string, Color> = {
      visited: new Color(100, 100, 100, 180),
      current: new Color(255, 215, 0, 255),
      available: new Color(105, 240, 174, 255),
      locked: new Color(80, 80, 80, 120),
    };

    if (this.statusSprite) {
      const color = statusColors[this._data.nodeStatus] ?? Color.WHITE;
      this.statusSprite.color = color;
    }

    if (this.enterButton) {
      this.enterButton.node.active = this._data.nodeStatus === 'available';
      this.enterButton.node.off(Button.EventType.CLICK);
      this.enterButton.node.on(Button.EventType.CLICK, this._onEnterClicked, this);
    }
  }

  private _onEnterClicked(): void {
    if (this._data && this._onEnterCallback) {
      this._onEnterCallback(this._data.nodeId);
    }
  }
}
