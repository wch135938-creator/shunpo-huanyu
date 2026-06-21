// ============================================================
// EventChoiceTemplate — 事件选项按钮模板组件
// 职责：挂载到 EventPanel 的 choiceButtonPrefab 上
// ============================================================

import { _decorator, Component, Label, Node, Button } from 'cc';
import type { EventChoiceUIData } from '../../data/phase8_ui_types';

const { ccclass, property } = _decorator;

@ccclass('EventChoiceTemplate')
export class EventChoiceTemplate extends Component {
  @property({ type: Label, tooltip: '选项文本' })
  textLabel: Label | null = null;

  @property({ type: Label, tooltip: '奖励预览文本' })
  previewLabel: Label | null = null;

  @property({ type: Node, tooltip: '风险指示器' })
  riskIndicator: Node | null = null;

  private _choice: EventChoiceUIData | null = null;
  private _onChoiceCallback: ((choiceId: string) => void) | null = null;

  setup(choice: EventChoiceUIData, onChoice?: (choiceId: string) => void): void {
    this._choice = choice;
    this._onChoiceCallback = onChoice ?? null;
    this._refresh();
  }

  private _refresh(): void {
    if (!this._choice) return;

    if (this.textLabel) this.textLabel.string = this._choice.textKey;
    if (this.previewLabel) this.previewLabel.string = this._choice.rewardPreview;
    if (this.riskIndicator) this.riskIndicator.active = this._choice.isRisky;

    this.node.off(Button.EventType.CLICK);
    this.node.on(Button.EventType.CLICK, this._onClicked, this);
  }

  private _onClicked(): void {
    if (this._choice && this._onChoiceCallback) {
      this._onChoiceCallback(this._choice.choiceId);
    }
  }
}
