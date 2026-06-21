// ============================================================
// RewardAnimationSystem — Phase8-Step4 奖励动画系统
// 职责：管理飞字、奖励序列入场、计数器缓动、保底特效等 tween 动画
// 架构：继承 BaseSystem 单例，纯逻辑层，接受 Node/Prefab 参数
// 边界：不持有具体 UI 节点引用，不操作 Canvas/Camera
//
// 使用方式：
//   const animSys = RewardAnimationSystem.getInstance();
//   animSys.playFlyText(labelNode, config);
//   animSys.playRewardSequence(container, prefab, rewards);
//   animSys.animateCounter(oldVal, newVal, duration, (val) => { label.string = val; });
// ============================================================

import { _decorator, Node, Label, Prefab, instantiate, tween, Vec3, UIOpacity, Color } from 'cc';
import { BaseSystem } from '../core/BaseSystem';
import type { FlyTextConfig, RewardSequenceConfig } from '../data/reward_types';
import { createDefaultRewardSequenceConfig } from '../data/reward_types';
import type { RewardDisplayItem } from '../data/phase8_ui_types';

const { ccclass } = _decorator;

// ==================== 默认动画参数 ====================

/** 动画默认参数（所有值可通过 RewardSequenceConfig 覆盖） */
const ANIM_DEFAULTS = createDefaultRewardSequenceConfig();

// ==================== 事件常量 ====================

export const RewardAnimEvent = {
  /** 飞字动画完成 */
  FLY_TEXT_COMPLETED: 'rewardAnim:flyTextCompleted',
  /** 奖励序列动画全部完成 */
  SEQUENCE_COMPLETED: 'rewardAnim:sequenceCompleted',
  /** 计数器缓动完成 */
  COUNTER_COMPLETED: 'rewardAnim:counterCompleted',
};

export class RewardAnimationSystem extends BaseSystem {
  // ==================== 单例 ====================

  static getInstance(): RewardAnimationSystem {
    return super.getInstance<RewardAnimationSystem>();
  }

  // ==================== 内部状态 ====================

  /** 活跃的飞字节点池（用于批量清理） */
  private _activeFlyTextNodes: Node[] = [];

  /** 动画播放配置（可运行时覆盖默认值） */
  private _config: RewardSequenceConfig = { ...ANIM_DEFAULTS };

  // ==================== 配置 ====================

  /** 设置动画播放配置 */
  setAnimationConfig(config: Partial<RewardSequenceConfig>): void {
    this._config = { ...this._config, ...config };
  }

  /** 获取当前动画配置 */
  getAnimationConfig(): Readonly<RewardSequenceConfig> {
    return { ...this._config };
  }

  /** 获取动画默认参数 */
  getAnimationDefaults(): Readonly<RewardSequenceConfig> {
    return { ...ANIM_DEFAULTS };
  }

  // ================================================================
  // 核心 API：飞字动画
  // ================================================================

  /**
   * 播放单条飞字动画。
   *
   * 流程：
   * 1. 创建临时 Label 节点（从模板或动态创建）
   * 2. 从世界坐标定位
   * 3. 链式 tween: 缩放弹入 → 上浮 → 淡出 → 销毁
   * 4. 完成后派发 FLY_TEXT_COMPLETED 事件
   *
   * @param parentNode  父节点（飞字挂在此节点下）
   * @param config      飞字配置
   * @param template    可选的 Label 模板节点
   * @returns           创建的飞字节点
   */
  playFlyText(
    parentNode: Node,
    config: FlyTextConfig,
    template?: Node,
  ): Node | null {
    if (!parentNode || !parentNode.isValid) {
      console.warn('[RewardAnimationSystem] playFlyText: parentNode 无效');
      return null;
    }

    // 创建飞字节点
    let flyNode: Node;
    if (template && template.isValid) {
      flyNode = instantiate(template);
    } else {
      flyNode = new Node('FlyText');
      const label = flyNode.addComponent(Label);
      label.string = config.text;
      label.fontSize = config.fontSize ?? 28;
      if (config.color) {
        label.color = this._parseColor(config.color);
      }
    }

    // 如果有文本需要设置（使用模板时也可能需要覆盖文本）
    const label = flyNode.getComponent(Label);
    if (label) {
      if (config.text) label.string = config.text;
      if (config.fontSize) label.fontSize = config.fontSize;
      if (config.color) label.color = this._parseColor(config.color);
    }

    // 设置位置
    flyNode.setParent(parentNode);
    flyNode.setPosition(
      config.worldPosition.x,
      config.worldPosition.y,
      0,
    );

    // 初始状态：缩放为 0
    flyNode.setScale(0, 0, 1);

    // 添加 UIOpacity 组件（不存在则添加）
    let uiOpacity = flyNode.getComponent(UIOpacity);
    if (!uiOpacity) {
      uiOpacity = flyNode.addComponent(UIOpacity);
    }
    uiOpacity.opacity = 255;

    // 添加到活跃节点列表
    this._activeFlyTextNodes.push(flyNode);

    const cfg = this._config;
    const fadeInDuration = config.duration ? config.duration * 0.2 : cfg.fadeInDuration;
    const flyDuration = config.duration ?? cfg.flyDuration;

    // 链式 tween
    tween(flyNode)
      // 缩放入场
      .to(fadeInDuration, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
      // 并行动画：上浮 + 随机水平偏移
      .parallel(
        tween().by(flyDuration, { position: new Vec3(
          (Math.random() - 0.5) * 30,
          cfg.flyDistance,
          0,
        ) }),
        // 淡出（后半段）
        tween(flyNode.getComponent(UIOpacity)!)
          .delay(flyDuration * 0.3)
          .to(flyDuration * 0.7, { opacity: 0 }),
      )
      // 完成回调
      .call(() => {
        this._removeFlyTextNode(flyNode);
        flyNode.destroy();
      })
      .start();

    return flyNode;
  }

  /**
   * 批量播放飞字（从一个位置同时飞出多条不同颜色的文字）。
   *
   * @param parentNode  父节点
   * @param configs     多条飞字配置
   * @param template    可选的模板节点
   */
  playFlyTextBatch(
    parentNode: Node,
    configs: FlyTextConfig[],
    template?: Node,
  ): void {
    for (let i = 0; i < configs.length; i++) {
      // 每条飞字延迟 40ms 起飞，产生波浪效果
      const config = configs[i];
      setTimeout(() => {
        if (parentNode.isValid) {
          this.playFlyText(parentNode, config, template);
        }
      }, i * 40);
    }
  }

  // ================================================================
  // 核心 API：奖励序列动画
  // ================================================================

  /**
   * 按顺序播放奖励序列入场动画。
   *
   * 每个奖励项依次以缩放入场动画出现（交错延迟）。
   * 全部完成后派发 SEQUENCE_COMPLETED 事件。
   *
   * @param container     奖励列表容器节点
   * @param itemPrefab    奖励项 Prefab（需挂载设置方法 setup(reward)）
   * @param rewards       奖励展示列表
   * @param config        播放配置（可选，覆盖默认值）
   */
  playRewardSequence(
    container: Node,
    itemPrefab: Prefab,
    rewards: RewardDisplayItem[],
    config?: Partial<RewardSequenceConfig>,
  ): void {
    if (!container || !container.isValid) {
      console.warn('[RewardAnimationSystem] playRewardSequence: container 无效');
      return;
    }

    if (!itemPrefab) {
      console.warn('[RewardAnimationSystem] playRewardSequence: itemPrefab 为空');
      return;
    }

    const cfg = { ...this._config, ...(config ?? {}) };
    const totalItems = rewards.length;

    if (totalItems === 0) {
      // 空列表直接完成
      this._emitSequenceCompleted(0);
      return;
    }

    container.removeAllChildren();

    let completedCount = 0;

    for (let i = 0; i < totalItems; i++) {
      const reward = rewards[i];
      const itemNode = instantiate(itemPrefab);
      container.addChild(itemNode);

      // 初始缩放为 0
      itemNode.setScale(0, 0, 1);

      // 调用 setup 方法配置数据
      const comp = itemNode.getComponent('RewardItemTemplate');
      if (comp && typeof (comp as any).setup === 'function') {
        (comp as any).setup(reward);
      } else {
        // 回退：手动设置子节点标签
        this._configureRewardItemFallback(itemNode, reward);
      }

      // 交错延迟入场
      const delay = i * cfg.staggerDelay;

      tween(itemNode)
        .delay(delay)
        .to(cfg.scaleInDuration, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
        .call(() => {
          completedCount += 1;
          if (completedCount >= totalItems) {
            this._emitSequenceCompleted(totalItems);
          }
        })
        .start();
    }
  }

  // ================================================================
  // 核心 API：计数器缓动
  // ================================================================

  /**
   * 计数器缓动动画。
   *
   * 从 fromValue 平滑过渡到 toValue，通过 onUpdate 回调输出中间值。
   * 使用 sineOut 缓动，完成时确保最终值精确为 toValue。
   *
   * @param fromValue  起始值
   * @param toValue    目标值
   * @param duration   时长（秒）
   * @param onUpdate   每帧回调（接收当前值）
   * @param onComplete 完成回调
   */
  animateCounter(
    fromValue: number,
    toValue: number,
    duration: number,
    onUpdate: (value: number) => void,
    onComplete?: () => void,
  ): void {
    if (fromValue === toValue) {
      onUpdate(toValue);
      if (onComplete) onComplete();
      return;
    }

    const tempObj = { value: fromValue };
    const actualDuration = duration > 0 ? duration : this._config.counterDuration;

    tween(tempObj)
      .to(actualDuration, { value: toValue }, {
        easing: 'sineOut',
        onUpdate: () => {
          onUpdate(Math.round(tempObj.value));
        },
      })
      .call(() => {
        // 确保最终值精确
        onUpdate(toValue);
        if (onComplete) onComplete();
      })
      .start();
  }

  // ================================================================
  // 核心 API：增量光效
  // ================================================================

  /**
   * 在节点上播放增量光效脉冲动画。
   *
   * 缩放脉冲：1.0 → peakScale → 1.0，产生"弹出"效果。
   *
   * @param targetNode  目标节点
   * @param peakScale   峰值缩放（默认 1.15）
   * @param duration    单程时长（默认 0.15s）
   */
  playIncrementGlow(
    targetNode: Node,
    peakScale: number = ANIM_DEFAULTS.glowPulseScale,
    duration: number = ANIM_DEFAULTS.glowPulseDuration,
  ): void {
    if (!targetNode || !targetNode.isValid) return;

    const originalScale = targetNode.scale.clone();

    tween(targetNode)
      .to(duration, { scale: new Vec3(peakScale, peakScale, 1) }, { easing: 'sineOut' })
      .to(duration, { scale: originalScale }, { easing: 'sineIn' })
      .start();
  }

  // ================================================================
  // 核心 API：保底触发特效
  // ================================================================

  /**
   * 播放保底触发视觉特效。
   *
   * 特效序列：快速缩放脉冲 → 停留 → 淡出。
   *
   * @param targetNode   特效节点（如保底奖励项）
   * @param durationMs   总时长（毫秒，默认 1200）
   */
  playPityTriggerEffect(
    targetNode: Node,
    durationMs: number = 1200,
  ): void {
    if (!targetNode || !targetNode.isValid) return;

    const uiOpacity = targetNode.getComponent(UIOpacity)
      ?? targetNode.addComponent(UIOpacity);
    uiOpacity.opacity = 255;

    tween(targetNode)
      // 快速放大
      .to(0.1, { scale: new Vec3(1.3, 1.3, 1) }, { easing: 'backOut' })
      // 回落
      .to(0.1, { scale: new Vec3(1.0, 1.0, 1) }, { easing: 'backIn' })
      // 停留
      .delay(0.5)
      // 淡出
      .to(0.3, {}, {
        onUpdate: (_target?: unknown, ratio?: number) => {
          if (targetNode.isValid && ratio !== undefined) {
            const opacity = Math.round(255 * (1 - ratio));
            targetNode.getComponent(UIOpacity)!.opacity = Math.max(0, opacity);
          }
        },
      })
      .call(() => {
        if (targetNode.isValid) {
          targetNode.active = false;
        }
      })
      .start();
  }

  // ================================================================
  // 清理
  // ================================================================

  /** 停止所有活跃飞字并清理 */
  stopAllFlyText(): void {
    const nodes = [...this._activeFlyTextNodes];
    for (const node of nodes) {
      if (node && node.isValid) {
        node.destroy();
      }
    }
    this._activeFlyTextNodes = [];
  }

  /** 停止并清理所有动画 */
  stopAllAnimations(): void {
    this.stopAllFlyText();
  }

  // ================================================================
  // 内部方法
  // ================================================================

  /** 从活跃列表中移除飞字节点 */
  private _removeFlyTextNode(node: Node): void {
    const index = this._activeFlyTextNodes.indexOf(node);
    if (index >= 0) {
      this._activeFlyTextNodes.splice(index, 1);
    }
  }

  /** 解析 hex 颜色字符串为 Color */
  private _parseColor(hex: string): Color {
    let h = hex.replace('#', '');
    if (h.length === 3) {
      h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    }
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return new Color(r, g, b, 255);
  }

  /** 派发序列完成事件 */
  private _emitSequenceCompleted(itemCount: number): void {
    const eventManager = (this as any)?._eventManager;
    // 使用全局 EventManager
    try {
      const { EventManager } = require('../core/EventManager');
      EventManager.getInstance().emit(RewardAnimEvent.SEQUENCE_COMPLETED, {
        itemCount,
        timestamp: Date.now(),
      });
    } catch {
      // 忽略事件派发失败
    }
  }

  /**
   * 回退方式配置奖励项（当模板无 RewardItemTemplate 组件时使用）。
   */
  private _configureRewardItemFallback(itemNode: Node, reward: RewardDisplayItem): void {
    const iconLabel = itemNode.getChildByName('Icon')?.getComponent(Label);
    const nameLabel = itemNode.getChildByName('NameLabel')?.getComponent(Label);
    const qtyLabel = itemNode.getChildByName('QtyLabel')?.getComponent(Label);

    const emojiMap: Record<string, string> = {
      gold: '💰',
      exp: '✨',
      equipment: '⚔️',
      item: '📦',
      currency: '💎',
    };

    if (iconLabel) iconLabel.string = emojiMap[reward.rewardType] ?? '📦';
    if (nameLabel) nameLabel.string = reward.displayName;
    if (qtyLabel) qtyLabel.string = `x${reward.quantity}`;

    // 保底奖励加特效标记
    if (reward.isPityBonus && qtyLabel) {
      qtyLabel.string = `✨ x${reward.quantity} (保底)`;
    }
  }
}
