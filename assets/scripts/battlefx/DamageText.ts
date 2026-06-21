// ============================================================
// DamageText.ts — 伤害/治疗飘字组件
// 职责：在目标位置显示浮动文字（伤害/暴击/治疗），动画结束后自动回调
// 位置：battlefx/ 层
// 依赖：cc (Component, Label, Tween, Color, Vec3, UITransform)
// 规范：零 any / 全部参数化 / Tween 实现 / 支持对象池回收
// ============================================================

import { Component, Label, _decorator, Color, Vec3, UITransform } from 'cc';
import { Tween, tween } from 'cc';
import {
  DamageTextType,
  DEFAULT_DAMAGE_TEXT_CONFIG,
} from './PresentationTypes';
import type { DamageTextConfig } from './PresentationTypes';

const { ccclass } = _decorator;

/**
 * 飘字动画完成回调类型
 */
export type DamageTextCompleteCallback = (damageText: DamageText) => void;

/**
 * 伤害飘字组件
 *
 * 每个 DamageText 实例挂在一个 Cocos Node 上，包含一个 Label 子节点。
 * 调用 show() 播放浮动动画，完成后调用 onComplete 回调。
 *
 * 生命周期：
 *   1. 创建 Node + DamageText 组件
 *   2. show(value, type, config, callback) → 播放动画
 *   3. 动画结束 → 调用 onComplete（池回收）
 *
 * 使用示例：
 *   const dt = node.getComponent(DamageText);
 *   dt.show(150, DamageTextType.Crit, config, (dt) => pool.put(dt.node));
 */
@ccclass('DamageText')
export class DamageText extends Component {
  // ===== 节点引用 =====

  /** Label 组件（子节点上的文字渲染组件） */
  private _label: Label | null = null;

  /** 当前正在运行的 Tween 实例（用于 stop） */
  private _activeTween: Tween<DamageText> | null = null;

  /** 动画完成回调 */
  private _onComplete: DamageTextCompleteCallback | null = null;

  /** 飘字类型 */
  private _textType: DamageTextType = DamageTextType.Damage;

  // ==================== 生命周期 ====================

  onLoad(): void {
    // 获取或创建 Label 组件
    this._label = this._findOrCreateLabel();
  }

  onDestroy(): void {
    this._stopTween();
    this._onComplete = null;
  }

  // ==================== 公共接口 ====================

  /**
   * 显示伤害/治疗飘字
   *
   * @param value     — 伤害/治疗数值
   * @param textType  — 飘字类型（伤害/暴击/治疗）
   * @param config    — 飘字表现配置
   * @param onComplete — 动画完成回调（用于池回收）
   */
  show(
    value: number,
    textType: DamageTextType,
    config?: DamageTextConfig,
    onComplete?: DamageTextCompleteCallback,
  ): void {
    // 停止之前的动画
    this._stopTween();

    const cfg = config ?? DEFAULT_DAMAGE_TEXT_CONFIG;
    this._textType = textType;
    this._onComplete = onComplete ?? null;

    // 确保 Label 存在
    if (!this._label) {
      this._label = this._findOrCreateLabel();
    }
    if (!this._label) return;

    // 激活节点
    this.node.active = true;

    // 设置文字内容
    const displayValue = Math.round(value);
    this._label.string = this._formatText(displayValue, textType);

    // 设置颜色
    this._label.color = this._resolveColor(textType, cfg);

    // 设置字体大小
    this._label.fontSize = this._resolveFontSize(textType, cfg);

    // 重置状态
    this.node.setScale(1, 1, 1);
    this._label.node.setPosition(0, 0, 0);
    this._setOpacity(255);

    // 暴击缩放动画
    if (textType === DamageTextType.Crit && cfg.critScaleAnimation) {
      this.node.setScale(cfg.critScale, cfg.critScale, 1);
    }

    // 播放浮动动画
    this._playFloatAnimation(cfg);
  }

  /**
   * 立即停止动画并隐藏（用于强制回收）
   */
  hide(): void {
    this._stopTween();
    this.node.active = false;
    this._onComplete = null;
  }

  /**
   * 获取当前飘字类型
   */
  getTextType(): DamageTextType {
    return this._textType;
  }

  /**
   * 是否正在播放动画
   */
  isPlaying(): boolean {
    return this._activeTween !== null;
  }

  // ==================== 内部实现 ====================

  /**
   * 查找或创建 Label 子节点
   */
  private _findOrCreateLabel(): Label {
    // 先尝试查找已有 Label
    let label = this.node.getComponent(Label);
    if (label) return label;

    // 查找子节点
    label = this.node.getComponentInChildren(Label);
    if (label) return label;

    // 创建 Label 子节点
    const labelNode = new Node('Label');
    labelNode.setParent(this.node);
    label = labelNode.addComponent(Label);

    // 确保 UITransform 存在
    let uiTransform = this.node.getComponent(UITransform);
    if (!uiTransform) {
      uiTransform = this.node.addComponent(UITransform);
    }
    // 设置合理的尺寸
    uiTransform.setContentSize(200, 60);

    return label;
  }

  /**
   * 格式化文字内容
   */
  private _formatText(value: number, textType: DamageTextType): string {
    switch (textType) {
      case DamageTextType.Damage:
        return `-${value}`;
      case DamageTextType.Crit:
        return `暴击! -${value}`;
      case DamageTextType.Heal:
        return `+${value}`;
      default:
        return `${value}`;
    }
  }

  /**
   * 根据飘字类型解析颜色
   */
  private _resolveColor(
    textType: DamageTextType,
    config: DamageTextConfig,
  ): Color {
    let hex: string;
    switch (textType) {
      case DamageTextType.Damage:
        hex = config.damageColor;
        break;
      case DamageTextType.Crit:
        hex = config.critColor;
        break;
      case DamageTextType.Heal:
        hex = config.healColor;
        break;
      default:
        hex = '#FFFFFF';
    }
    return DamageText._hexToColor(hex);
  }

  /**
   * 根据飘字类型解析字体大小
   */
  private _resolveFontSize(
    textType: DamageTextType,
    config: DamageTextConfig,
  ): number {
    switch (textType) {
      case DamageTextType.Damage:
        return config.damageFontSize;
      case DamageTextType.Crit:
        return config.critFontSize;
      case DamageTextType.Heal:
        return config.healFontSize;
      default:
        return config.damageFontSize;
    }
  }

  /**
   * 播放浮动动画
   *
   * 动画流程：
   *   1. 节点整体向上移动 floatDistance 像素
   *   2. 后半段渐隐透明度 + 缩小
   *   3. 动画完成后调用 _onAnimationComplete
   */
  private _playFloatAnimation(config: DamageTextConfig): void {
    const startPos = this.node.position.clone();
    const endPos = new Vec3(
      startPos.x,
      startPos.y + config.floatDistance,
      startPos.z,
    );

    const fadeStartRatio = 0.5;
    const fadeDelay = config.floatDuration * fadeStartRatio;
    const fadeDuration = config.floatDuration * (1 - fadeStartRatio);

    // 更新透明度的闭包
    const updateOpacity = (target: DamageText, ratio: number): void => {
      const opacity = Math.round(255 * (1 - ratio));
      target._setOpacity(Math.max(0, opacity));
    };

    // 单一 Tween 序列：位置移动 + 透明度和缩放并行渐隐
    this._activeTween = tween(this)
      .parallel(
        // 位置：向上浮动（全程）
        tween(this.node)
          .to(
            config.floatDuration,
            { position: endPos },
            { easing: 'sineOut' },
          ),
        // 透明度和缩放：后段并行
        tween(this.node)
          .delay(fadeDelay)
          .parallel(
            // 透明度渐变
            tween<DamageText>(this)
              .to(
                fadeDuration,
                {},
                {
                  easing: 'linear',
                  onUpdate: (_target: DamageText, ratio: number) => {
                    updateOpacity(_target, ratio);
                  },
                },
              ),
            // 缩小
            tween(this.node)
              .to(
                fadeDuration,
                { scale: new Vec3(0.8, 0.8, 1) },
                { easing: 'sineIn' },
              ),
          ),
      )
      .call(() => this._onAnimationComplete())
      .start();
  }

  /**
   * 设置节点透明度（通过修改 Label 颜色 alpha）
   */
  private _setOpacity(opacity: number): void {
    if (!this._label) return;
    const color = this._label.color.clone();
    color.a = Math.max(0, Math.min(255, opacity));
    this._label.color = color;
  }

  /**
   * 动画完成处理
   */
  private _onAnimationComplete(): void {
    this._activeTween = null;
    this._setOpacity(255);
    if (this._onComplete) {
      const callback = this._onComplete;
      this._onComplete = null;
      callback(this);
    }
  }

  /**
   * 停止正在运行的 Tween
   */
  private _stopTween(): void {
    if (this._activeTween) {
      this._activeTween.stop();
      this._activeTween = null;
    }
    // 停止节点上的所有 Tween
    Tween.stopAllByTarget(this);
    Tween.stopAllByTarget(this.node);
  }

  // ==================== 静态工具 ====================

  /**
   * 将十六进制颜色字符串转换为 Cocos Color
   *
   * 支持格式：#RGB, #RRGGBB
   * 非法格式返回白色。
   *
   * @param hex — 十六进制颜色字符串（如 "#FFD700"）
   */
  static _hexToColor(hex: string): Color {
    let h = hex.replace('#', '');
    if (h.length === 3) {
      h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    }
    if (h.length !== 6) {
      return new Color(255, 255, 255, 255);
    }
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return new Color(r, g, b, 255);
  }
}
