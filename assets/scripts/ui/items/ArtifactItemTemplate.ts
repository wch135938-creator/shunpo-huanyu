// ============================================================
// ArtifactItemTemplate — 神器列表项模板组件
// 职责：挂载到 ArtifactPanel 的 artifactItemPrefab 上
// ============================================================

import { _decorator, Component, Label, Button, Node, Color } from 'cc';
import type { ArtifactUIEntry } from '../../data/phase8_ui_types';

const { ccclass, property } = _decorator;

@ccclass('ArtifactItemTemplate')
export class ArtifactItemTemplate extends Component {
  @property({ type: Label, tooltip: '名称标签' })
  nameLabel: Label | null = null;

  @property({ type: Label, tooltip: '稀有度标签' })
  rarityLabel: Label | null = null;

  @property({ type: Label, tooltip: '等级标签' })
  levelLabel: Label | null = null;

  @property({ type: Node, tooltip: '激活指示器' })
  activeIndicator: Node | null = null;

  @property({ type: Node, tooltip: '锁定遮罩' })
  lockedMask: Node | null = null;

  @property({ type: Button, tooltip: '激活按钮' })
  activateButton: Button | null = null;

  private _entry: ArtifactUIEntry | null = null;
  private _onActivateCallback: ((artifactId: string) => void) | null = null;
  private _onClickCallback: ((entry: ArtifactUIEntry) => void) | null = null;

  setup(
    entry: ArtifactUIEntry,
    callbacks?: {
      onActivate?: (artifactId: string) => void;
      onClick?: (entry: ArtifactUIEntry) => void;
    },
  ): void {
    this._entry = entry;
    this._onActivateCallback = callbacks?.onActivate ?? null;
    this._onClickCallback = callbacks?.onClick ?? null;
    this._refresh();
  }

  private _refresh(): void {
    if (!this._entry) return;

    const rarityNames: Record<string, string> = {
      common: '普通', rare: '稀有', epic: '史诗', legendary: '传说',
    };

    if (this.nameLabel) {
      this.nameLabel.string = this._entry.nameKey;
      this.nameLabel.color = this._parseHexColor(this._entry.rarityColor);
    }

    if (this.rarityLabel) {
      this.rarityLabel.string = rarityNames[this._entry.rarity] ?? this._entry.rarity;
    }

    if (this.levelLabel) {
      this.levelLabel.string = this._entry.level > 0 ? `Lv.${this._entry.level}` : '未解锁';
    }

    if (this.activeIndicator) this.activeIndicator.active = this._entry.isActive;
    if (this.lockedMask) this.lockedMask.active = this._entry.level === 0;

    if (this.activateButton) {
      this.activateButton.node.active = this._entry.level > 0 && !this._entry.isActive;
      this.activateButton.node.off(Button.EventType.CLICK);
      this.activateButton.node.on(Button.EventType.CLICK, this._onActivateClicked, this);
    }

    this.node.off(Node.EventType.TOUCH_END);
    this.node.on(Node.EventType.TOUCH_END, this._onItemClicked, this);
  }

  private _onActivateClicked(): void {
    if (this._entry && this._onActivateCallback) {
      this._onActivateCallback(this._entry.artifactId);
    }
  }

  private _onItemClicked(): void {
    if (this._entry && this._onClickCallback) {
      this._onClickCallback(this._entry);
    }
  }

  private _parseHexColor(hex: string): Color {
    const r = parseInt(hex.substring(1, 3), 16);
    const g = parseInt(hex.substring(3, 5), 16);
    const b = parseInt(hex.substring(5, 7), 16);
    return new Color(r, g, b, 255);
  }
}
