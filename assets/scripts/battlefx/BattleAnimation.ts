// ============================================================
// BattleAnimation.ts — 战斗动画工具类
// 职责：提供 Tween 驱动的攻击 / 受击 / 死亡动画
// 位置：battlefx/ 层
// 依赖：cc (Node, Tween, Vec3, Color, Sprite, tween)
// 规范：零 any / 全部 static 方法 / 不依赖 Spine / Promise 完成通知
// ============================================================

import { Node, Vec3, Color, Sprite, tween, Tween } from 'cc';
import { DEFAULT_BATTLE_FX_CONFIG } from './PresentationTypes';
import type { BattleFXConfig } from './PresentationTypes';

/**
 * 动画完成回调
 */
export type AnimationCallback = () => void;

/**
 * 战斗动画工具类
 *
 * 所有方法均为 static，不持有状态。
 * 全部动画基于 Tween 实现，无 Spine 依赖。
 *
 * 使用方式：
 *   BattleAnimation.playAttack(attackerNode, targetNode, config);
 *   BattleAnimation.playHit(targetNode, config);
 *   BattleAnimation.playDeath(targetNode, config, () => { ... });
 */
export class BattleAnimation {
  // ==================== 攻击动画 ====================

  /**
   * 播放攻击动画
   *
   * 效果：攻击方向目标方向瞬移一小段距离再弹回原位。
   *
   * @param attackerNode — 攻击方节点
   * @param targetNode   — 目标节点（用于计算方向）
   * @param config       — 表现配置（可选）
   * @param onComplete   — 完成回调（可选）
   */
  static playAttack(
    attackerNode: Node,
    targetNode: Node,
    config?: BattleFXConfig,
    onComplete?: AnimationCallback,
  ): void {
    if (!attackerNode || !attackerNode.isValid) return;
    if (!targetNode || !targetNode.isValid) return;

    const cfg = config ?? DEFAULT_BATTLE_FX_CONFIG;
    const originalPos = attackerNode.position.clone();

    // 计算朝向目标的方向
    const attackerWorldPos = attackerNode.worldPosition.clone();
    const targetWorldPos = targetNode.worldPosition.clone();
    const direction = new Vec3(
      targetWorldPos.x - attackerWorldPos.x,
      targetWorldPos.y - attackerWorldPos.y,
      0,
    );
    direction.normalize();

    const lungeDistance = cfg.attackLungeDistance;
    const lungePos = new Vec3(
      originalPos.x + direction.x * lungeDistance,
      originalPos.y + direction.y * lungeDistance,
      originalPos.z,
    );

    const halfDuration = cfg.attackDuration / 2;

    // 前冲 → 回弹
    tween(attackerNode)
      .to(halfDuration, { position: lungePos }, { easing: 'sineOut' })
      .to(halfDuration, { position: originalPos }, { easing: 'sineIn' })
      .call(() => {
        if (onComplete) onComplete();
      })
      .start();
  }

  // ==================== 受击动画 ====================

  /**
   * 播放受击动画
   *
   * 效果：节点左右快速震动 + 红色闪烁。
   *
   * @param targetNode — 受击方节点
   * @param config     — 表现配置（可选）
   * @param onComplete — 完成回调（可选）
   */
  static playHit(
    targetNode: Node,
    config?: BattleFXConfig,
    onComplete?: AnimationCallback,
  ): void {
    if (!targetNode || !targetNode.isValid) return;

    const cfg = config ?? DEFAULT_BATTLE_FX_CONFIG;
    const originalPos = targetNode.position.clone();
    const amplitude = cfg.hitShakeAmplitude;

    // 震动序列
    const shakeSequence = tween(targetNode);
    const stepDuration = cfg.hitDuration / (cfg.hitFlashCount * 2);

    for (let i = 0; i < cfg.hitFlashCount; i++) {
      shakeSequence
        .to(stepDuration, {
          position: new Vec3(
            originalPos.x + amplitude,
            originalPos.y,
            originalPos.z,
          ),
        })
        .to(stepDuration, {
          position: new Vec3(
            originalPos.x - amplitude,
            originalPos.y,
            originalPos.z,
          ),
        });
    }

    shakeSequence
      .to(stepDuration, { position: originalPos })
      .call(() => {
        if (onComplete) onComplete();
      })
      .start();

    // 红色闪烁效果
    BattleAnimation._playFlash(targetNode, cfg, onComplete);
  }

  // ==================== 死亡动画 ====================

  /**
   * 播放死亡动画
   *
   * 效果：节点下沉 + 渐隐 + 缩小。
   *
   * @param targetNode — 死亡单位节点
   * @param config     — 表现配置（可选）
   * @param onComplete — 完成回调（可选）
   */
  static playDeath(
    targetNode: Node,
    config?: BattleFXConfig,
    onComplete?: AnimationCallback,
  ): void {
    if (!targetNode || !targetNode.isValid) return;

    const cfg = config ?? DEFAULT_BATTLE_FX_CONFIG;
    const originalPos = targetNode.position.clone();
    const sinkDistance = 30;

    tween(targetNode)
      .parallel(
        // 下沉
        tween(targetNode).to(
          cfg.deathDuration,
          {
            position: new Vec3(
              originalPos.x,
              originalPos.y - sinkDistance,
              originalPos.z,
            ),
          },
          { easing: 'sineIn' },
        ),
        // 缩小
        tween(targetNode).to(
          cfg.deathDuration,
          { scale: new Vec3(0.01, 0.01, 1) },
          { easing: 'sineIn' },
        ),
      )
      .call(() => {
        targetNode.setScale(1, 1, 1);
        targetNode.setPosition(originalPos);
        if (onComplete) onComplete();
      })
      .start();

    // 死亡渐隐
    BattleAnimation._fadeOut(targetNode, cfg.deathDuration);
  }

  // ==================== 暴击特效 ====================

  /**
   * 播放暴击缩放动画
   *
   * 效果：节点短暂放大后恢复。
   *
   * @param targetNode — 添加暴击效果的目标节点
   * @param config     — 表现配置（可选）
   * @param onComplete — 完成回调（可选）
   */
  static playCritEffect(
    targetNode: Node,
    config?: BattleFXConfig,
    onComplete?: AnimationCallback,
  ): void {
    if (!targetNode || !targetNode.isValid) return;

    const cfg = config ?? DEFAULT_BATTLE_FX_CONFIG;
    const originalScale = targetNode.scale.clone();
    const critScale = 1.2;
    const duration = cfg.hitDuration * 2;

    tween(targetNode)
      .to(duration * 0.3, {
        scale: new Vec3(critScale, critScale, 1),
      }, { easing: 'backOut' })
      .to(duration * 0.7, {
        scale: originalScale,
      }, { easing: 'sineIn' })
      .call(() => {
        if (onComplete) onComplete();
      })
      .start();
  }

  // ==================== 组合动画 ====================

  /**
   * 播放完整的攻击→受击动画序列
   *
   * @param attackerNode — 攻击方节点
   * @param targetNode   — 目标节点
   * @param isCritical   — 是否暴击（暴击时额外播放暴击特效）
   * @param config       — 表现配置
   * @param onAllComplete — 全部动画完成回调
   */
  static playAttackAndHit(
    attackerNode: Node,
    targetNode: Node,
    isCritical: boolean,
    config?: BattleFXConfig,
    onAllComplete?: AnimationCallback,
  ): void {
    if (!attackerNode || !attackerNode.isValid) return;
    if (!targetNode || !targetNode.isValid) return;

    const cfg = config ?? DEFAULT_BATTLE_FX_CONFIG;
    const attackDuration = cfg.attackDuration;
    let hitStarted = false;

    // 攻击动画开始
    BattleAnimation.playAttack(attackerNode, targetNode, cfg);

    // 受击动画在攻击进行到一半时开始
    tween(attackerNode)
      .delay(attackDuration * 0.5)
      .call(() => {
        if (!hitStarted) {
          hitStarted = true;
          BattleAnimation.playHit(targetNode, cfg);
          if (isCritical) {
            BattleAnimation.playCritEffect(targetNode, cfg);
          }
        }
      })
      .delay(cfg.hitDuration + attackDuration * 0.5)
      .call(() => {
        if (onAllComplete) onAllComplete();
      })
      .start();
  }

  // ==================== 清理方法 ====================

  /**
   * 停止节点上所有 BattleAnimation 创建的 Tween
   *
   * @param targetNode — 要清理的节点
   */
  static stopAll(targetNode: Node): void {
    if (!targetNode || !targetNode.isValid) return;
    Tween.stopAllByTarget(targetNode);
  }

  // ==================== 内部工具 ====================

  /**
   * 红色闪烁效果
   *
   * 通过修改节点 Sprite 的颜色实现。
   * 如果节点无 Sprite 组件，则静默跳过。
   */
  private static _playFlash(
    targetNode: Node,
    config: BattleFXConfig,
    _onComplete?: AnimationCallback,
  ): void {
    const sprite = targetNode.getComponent(Sprite);
    if (!sprite) return;

    const originalColor = sprite.color.clone();
    const flashColor = BattleAnimation._hexToColor(config.hitFlashColor);

    const interval = config.hitFlashInterval;
    let count = 0;

    const flashTween = tween(targetNode);
    for (let i = 0; i < config.hitFlashCount; i++) {
      flashTween
        .call(() => {
          if (sprite && sprite.isValid) {
            sprite.color = count % 2 === 0 ? flashColor : originalColor;
          }
          count++;
        })
        .delay(interval);
    }
    flashTween
      .call(() => {
        if (sprite && sprite.isValid) {
          sprite.color = originalColor;
        }
      })
      .start();
  }

  /**
   * 渐隐效果
   */
  private static _fadeOut(targetNode: Node, duration: number): void {
    const sprite = targetNode.getComponent(Sprite);
    if (!sprite) return;

    const originalColor = sprite.color.clone();

    tween(targetNode)
      .to(duration, {}, {
        easing: 'sineIn',
        onUpdate: (_target: Node, ratio: number) => {
          if (sprite && sprite.isValid) {
            const c = originalColor.clone();
            c.a = Math.round(255 * (1 - ratio));
            sprite.color = c;
          }
        },
      })
      .start();
  }

  /**
   * 十六进制颜色字符串 → Cocos Color
   */
  private static _hexToColor(hex: string): Color {
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
