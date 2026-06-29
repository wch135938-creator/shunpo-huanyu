// ============================================================
// OperationsUIBackdrop.ts — 面板与按钮的轻量纯色背景
// 使用节点既有 UITransform 尺寸绘制，不修改布局数据
// ============================================================

import { _decorator, Color, Component, Graphics, UITransform } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('OperationsUIBackdrop')
export class OperationsUIBackdrop extends Component {
  @property(Color) color: Color = new Color(25, 25, 35, 245);
  @property radius = 0;

  onLoad(): void {
    this._draw();
  }

  protected onEnable(): void {
    this._draw();
  }

  private _draw(): void {
    const transform = this.getComponent(UITransform);
    if (!transform) return;
    const graphics = this.getComponent(Graphics) ?? this.addComponent(Graphics);
    const width = transform.contentSize.width;
    const height = transform.contentSize.height;
    const left = -width * transform.anchorPoint.x;
    const bottom = -height * transform.anchorPoint.y;
    graphics.clear();
    graphics.fillColor = this.color;
    if (this.radius > 0) {
      graphics.roundRect(left, bottom, width, height, this.radius);
    } else {
      graphics.rect(left, bottom, width, height);
    }
    graphics.fill();
  }
}
