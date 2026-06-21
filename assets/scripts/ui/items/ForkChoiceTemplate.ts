// ============================================================
// ForkChoiceTemplate — 分叉选择项模板组件
// 职责：挂载到 DungeonNodeMapPanel 的 forkChoicePrefab 上
// ============================================================

import { _decorator, Component, Label, Button, Node } from 'cc';
import type { ForkBranchUIData } from '../../data/phase8_ui_types';

const { ccclass, property } = _decorator;

@ccclass('ForkChoiceTemplate')
export class ForkChoiceTemplate extends Component {
  @property({ type: Label, tooltip: '选项标签' })
  choiceLabel: Label | null = null;

  @property({ type: Label, tooltip: '预览标签' })
  previewLabel: Label | null = null;

  @property({ type: Node, tooltip: '节点类型图标' })
  typeIcon: Node | null = null;

  private _branch: ForkBranchUIData | null = null;
  private _onSelectCallback: ((nodeId: string) => void) | null = null;

  setup(branch: ForkBranchUIData, onSelect?: (nodeId: string) => void): void {
    this._branch = branch;
    this._onSelectCallback = onSelect ?? null;
    this._refresh();
  }

  private _refresh(): void {
    if (!this._branch) return;

    if (this.choiceLabel) this.choiceLabel.string = this._branch.label;
    if (this.previewLabel) this.previewLabel.string = this._branch.preview;

    this.node.off(Button.EventType.CLICK);
    this.node.on(Button.EventType.CLICK, this._onClicked, this);
  }

  private _onClicked(): void {
    if (this._branch && this._onSelectCallback) {
      this._onSelectCallback(this._branch.nodeId);
    }
  }
}
