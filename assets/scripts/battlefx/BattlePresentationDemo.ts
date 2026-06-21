// ============================================================
// BattlePresentationDemo.ts — 战斗表现层独立演示组件
// 职责：提供独立验证场景，测试伤害/暴击/治疗/死亡四种表现
// 位置：battlefx/ 层
// 依赖：cc (Component), BattleFXManager, DamageTextPool, BattleAnimation
// 规范：零 any / 不依赖 BattleSystem / 纯表现验证
// ============================================================

import { Component, Node, _decorator, Button, Label } from 'cc';
import { BattleFXManager } from './BattleFXManager';
import { DamageTextPool } from './DamageTextPool';
import { BattleAnimation } from './BattleAnimation';
import {
  DamageTextType,
  DEFAULT_PRESENTATION_CONFIG,
} from './PresentationTypes';

const { ccclass, property } = _decorator;

/**
 * 战斗表现层演示组件
 *
 * 挂载到场景根节点，提供按钮驱动的独立验证：
 *   - 伤害飘字
 *   - 暴击飘字
 *   - 治疗飘字
 *   - 攻击/受击/死亡动画
 *
 * 使用方式：
 *   1. 在 Cocos Creator 中打开 BattlePresentationDemo 场景
 *   2. 将此组件挂载到场景根节点
 *   3. 配置 _targetNode1 / _targetNode2 为场景中的演示节点
 *   4. 运行场景 → 点击按钮验证
 */
@ccclass('BattlePresentationDemo')
export class BattlePresentationDemo extends Component {
  // ===== 场景引用 =====

  @property({ type: Node, tooltip: '演示目标节点 1（攻击方）' })
  private _targetNode1: Node | null = null;

  @property({ type: Node, tooltip: '演示目标节点 2（受击方）' })
  private _targetNode2: Node | null = null;

  @property({ type: Node, tooltip: 'UI Canvas 根节点' })
  private _canvasNode: Node | null = null;

  // ===== 内部状态 =====

  private _damageTextPool: DamageTextPool | null = null;
  private _demoRoot: Node | null = null;

  // ==================== 生命周期 ====================

  onLoad(): void {
    console.log('[BattlePresentationDemo] onLoad');

    // 初始化对象池
    this._damageTextPool = new DamageTextPool(15);

    // 确定父节点
    this._demoRoot = this._canvasNode ?? this.node;

    // 初始化 BattleFXManager
    const fxMgr = BattleFXManager.getInstance();
    fxMgr.init(DEFAULT_PRESENTATION_CONFIG, this._demoRoot);
  }

  onDestroy(): void {
    if (this._damageTextPool) {
      this._damageTextPool.clear();
      this._damageTextPool = null;
    }
    BattleFXManager.getInstance().cleanup();
  }

  // ==================== 公开方法（UI 按钮绑定） ====================

  /**
   * 测试：伤害飘字
   */
  testDamageText(): void {
    console.log('[Demo] 测试伤害飘字');
    this._spawnText(150, DamageTextType.Damage);
  }

  /**
   * 测试：暴击飘字
   */
  testCritText(): void {
    console.log('[Demo] 测试暴击飘字');
    this._spawnText(350, DamageTextType.Crit);
  }

  /**
   * 测试：治疗飘字
   */
  testHealText(): void {
    console.log('[Demo] 测试治疗飘字');
    this._spawnText(80, DamageTextType.Heal);
  }

  /**
   * 测试：连续飘字（模拟多段伤害）
   */
  testMultiText(): void {
    console.log('[Demo] 测试连续飘字');
    const values = [100, 250, 80, 400, 120];
    for (let i = 0; i < values.length; i++) {
      setTimeout(() => {
        const type =
          values[i] > 300
            ? DamageTextType.Crit
            : DamageTextType.Damage;
        this._spawnText(values[i], type, 50 + i * 30);
      }, i * 200);
    }
  }

  /**
   * 测试：攻击动画
   */
  testAttackAnimation(): void {
    console.log('[Demo] 测试攻击动画');
    if (this._targetNode1 && this._targetNode2) {
      BattleAnimation.playAttack(
        this._targetNode1,
        this._targetNode2,
      );
    }
  }

  /**
   * 测试：受击动画
   */
  testHitAnimation(): void {
    console.log('[Demo] 测试受击动画');
    if (this._targetNode2) {
      BattleAnimation.playHit(this._targetNode2);
    }
  }

  /**
   * 测试：死亡动画
   */
  testDeathAnimation(): void {
    console.log('[Demo] 测试死亡动画');
    if (this._targetNode2) {
      BattleAnimation.playDeath(this._targetNode2, undefined, () => {
        console.log('[Demo] 死亡动画完成');
      });
    }
  }

  /**
   * 测试：攻击 + 受击（组合动画）
   */
  testAttackHit(): void {
    console.log('[Demo] 测试攻击+受击组合');
    if (this._targetNode1 && this._targetNode2) {
      BattleAnimation.playAttackAndHit(
        this._targetNode1,
        this._targetNode2,
        false,
      );
    }
  }

  /**
   * 测试：攻击 + 暴击受击（组合动画 + 暴击特效）
   */
  testAttackCrit(): void {
    console.log('[Demo] 测试攻击+暴击组合');
    if (this._targetNode1 && this._targetNode2) {
      BattleAnimation.playAttackAndHit(
        this._targetNode1,
        this._targetNode2,
        true,
      );
    }
  }

  /**
   * 测试：全流程（多次攻击→死亡）
   */
  testFullFlow(): void {
    console.log('[Demo] 测试全流程');
    if (!this._targetNode2) return;

    // 模拟 5 次普通攻击
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        const isCrit = i === 3; // 第 4 次暴击
        const dmg = isCrit ? 450 : 120;

        this._spawnText(dmg, isCrit ? DamageTextType.Crit : DamageTextType.Damage);

        if (this._targetNode1 && this._targetNode2) {
          BattleAnimation.playAttackAndHit(
            this._targetNode1,
            this._targetNode2,
            isCrit,
          );
        }
      }, i * 600);
    }

    // 最后一次攻击后触发死亡
    setTimeout(() => {
      this._spawnText(0, DamageTextType.Damage);
      if (this._targetNode2) {
        BattleAnimation.playDeath(this._targetNode2);
      }
    }, 5 * 600 + 200);
  }

  /**
   * 测试：对象池状态
   */
  printPoolStats(): void {
    if (!this._damageTextPool) return;
    const stats = this._damageTextPool.getStats();
    console.log(
      `[Demo] 对象池状态 — available: ${stats.available}, ` +
      `total: ${stats.total}, inUse: ${stats.inUse}`,
    );
  }

  // ==================== 内部实现 ====================

  /**
   * 生成一个伤害飘字
   */
  private _spawnText(
    value: number,
    type: DamageTextType,
    yOffset: number = 50,
  ): void {
    if (!this._damageTextPool || !this._demoRoot) return;

    // 计算世界坐标（基于 targetNode2 或屏幕中央）
    let worldX = 0;
    let worldY = 0;
    if (this._targetNode2) {
      const pos = this._targetNode2.worldPosition;
      worldX = pos.x + (Math.random() - 0.5) * 40;
      worldY = pos.y + yOffset + Math.random() * 20;
    }

    this._damageTextPool.show(
      value,
      type,
      this._demoRoot,
      { x: worldX, y: worldY, z: 0 },
    );
  }
}
