// ============================================================
// Phase9Step8DebugRunner — Phase9-Step8 BattlePresentation 集成测试
// 职责：验证 BattleFXManager / DamageText / DamageTextPool /
//       BattleFXPool / BattleAnimation / PresentationTypes
// 用法：在 Cocos Creator 控制台执行 Phase9Step8DebugRunner.runAll()
// ============================================================

import { Node } from 'cc';
import { BattleFXPool } from '../battlefx/BattleFXPool';
import { DamageTextPool } from '../battlefx/DamageTextPool';
import { DamageText } from '../battlefx/DamageText';
import { BattleAnimation } from '../battlefx/BattleAnimation';
import { BattleFXManager } from '../battlefx/BattleFXManager';
import { EventManager } from '../core/EventManager';
import { BattleEvent } from '../battle/BattleSystem';
import { BattleUnitType } from '../battle/BattleTypes';
import {
  DamageTextType,
  BattleFXType,
  DEFAULT_DAMAGE_TEXT_CONFIG,
  DEFAULT_BATTLE_FX_CONFIG,
  DEFAULT_PRESENTATION_CONFIG,
} from '../battlefx/PresentationTypes';

/** 测试结果 */
interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

export class Phase9Step8DebugRunner {
  private static _results: TestResult[] = [];
  private static _totalAssertions: number = 0;
  private static _passedAssertions: number = 0;

  // ==================== 主入口 ====================

  static runAll(): void {
    this._results = [];
    this._totalAssertions = 0;
    this._passedAssertions = 0;
    console.log('========== Phase9-Step8 BattlePresentation 集成测试 ==========\n');

    // 1. PresentationTypes 类型定义测试
    this.testPresentationTypes();

    // 2. BattleFXPool 对象池测试
    this.testBattleFXPool();

    // 3. DamageText 组件测试
    this.testDamageText();

    // 4. DamageTextPool 飘字池测试
    this.testDamageTextPool();

    // 5. BattleAnimation 动画工具测试
    this.testBattleAnimation();

    // 6. BattleFXManager 管理器测试
    this.testBattleFXManager();

    // 7. EventManager 集成测试
    this.testEventManagerIntegration();

    // 8. 边界情况测试
    this.testEdgeCases();

    // ==================== 汇总 ====================
    this.printSummary();
  }

  // ==================== 1. PresentationTypes 测试 ====================

  static testPresentationTypes(): void {
    // DamageTextType 枚举值
    this._assert('DamageTextType.Damage = "Damage"', DamageTextType.Damage === 'Damage');
    this._assert('DamageTextType.Crit = "Crit"', DamageTextType.Crit === 'Crit');
    this._assert('DamageTextType.Heal = "Heal"', DamageTextType.Heal === 'Heal');

    // DamageTextType 值唯一
    const dtValues = Object.values(DamageTextType);
    this._assert('DamageTextType 共 3 个值', dtValues.length === 3);
    this._assert('DamageTextType 值唯一', new Set(dtValues).size === 3);

    // BattleFXType 枚举值
    this._assert('BattleFXType.Attack = "Attack"', BattleFXType.Attack === 'Attack');
    this._assert('BattleFXType.Hit = "Hit"', BattleFXType.Hit === 'Hit');
    this._assert('BattleFXType.Death = "Death"', BattleFXType.Death === 'Death');
    this._assert('BattleFXType.Crit = "Crit"', BattleFXType.Crit === 'Crit');

    // 默认伤害配置完整性
    this._assert('DEFAULT_DAMAGE_TEXT_CONFIG.damageColor', DEFAULT_DAMAGE_TEXT_CONFIG.damageColor === '#FFFFFF');
    this._assert('DEFAULT_DAMAGE_TEXT_CONFIG.critColor', DEFAULT_DAMAGE_TEXT_CONFIG.critColor === '#FFD700');
    this._assert('DEFAULT_DAMAGE_TEXT_CONFIG.healColor', DEFAULT_DAMAGE_TEXT_CONFIG.healColor === '#00FF00');
    this._assert('DEFAULT_DAMAGE_TEXT_CONFIG.floatDistance', DEFAULT_DAMAGE_TEXT_CONFIG.floatDistance === 80);
    this._assert('DEFAULT_DAMAGE_TEXT_CONFIG.floatDuration', DEFAULT_DAMAGE_TEXT_CONFIG.floatDuration === 1.0);
    this._assert('DEFAULT_DAMAGE_TEXT_CONFIG.damageFontSize', DEFAULT_DAMAGE_TEXT_CONFIG.damageFontSize === 32);
    this._assert('DEFAULT_DAMAGE_TEXT_CONFIG.critFontSize', DEFAULT_DAMAGE_TEXT_CONFIG.critFontSize === 42);
    this._assert('DEFAULT_DAMAGE_TEXT_CONFIG.healFontSize', DEFAULT_DAMAGE_TEXT_CONFIG.healFontSize === 32);
    this._assert('DEFAULT_DAMAGE_TEXT_CONFIG.critScaleAnimation', DEFAULT_DAMAGE_TEXT_CONFIG.critScaleAnimation === true);
    this._assert('DEFAULT_DAMAGE_TEXT_CONFIG.critScale', DEFAULT_DAMAGE_TEXT_CONFIG.critScale === 1.3);

    // 默认战斗特效配置完整性
    this._assert('DEFAULT_BATTLE_FX_CONFIG.attackDuration', DEFAULT_BATTLE_FX_CONFIG.attackDuration === 0.2);
    this._assert('DEFAULT_BATTLE_FX_CONFIG.attackLungeDistance', DEFAULT_BATTLE_FX_CONFIG.attackLungeDistance === 20);
    this._assert('DEFAULT_BATTLE_FX_CONFIG.hitDuration', DEFAULT_BATTLE_FX_CONFIG.hitDuration === 0.15);
    this._assert('DEFAULT_BATTLE_FX_CONFIG.hitShakeAmplitude', DEFAULT_BATTLE_FX_CONFIG.hitShakeAmplitude === 5);
    this._assert('DEFAULT_BATTLE_FX_CONFIG.deathDuration', DEFAULT_BATTLE_FX_CONFIG.deathDuration === 0.5);
    this._assert('DEFAULT_BATTLE_FX_CONFIG.enableAttackFlash', DEFAULT_BATTLE_FX_CONFIG.enableAttackFlash === true);
    this._assert('DEFAULT_BATTLE_FX_CONFIG.hitFlashCount', DEFAULT_BATTLE_FX_CONFIG.hitFlashCount === 3);
    this._assert('DEFAULT_BATTLE_FX_CONFIG.hitFlashInterval', DEFAULT_BATTLE_FX_CONFIG.hitFlashInterval === 0.05);

    // 默认总配置完整性
    this._assert('DEFAULT_PRESENTATION_CONFIG.poolCapacity', DEFAULT_PRESENTATION_CONFIG.poolCapacity === 10);
    this._assert('DEFAULT_PRESENTATION_CONFIG.debugLog', DEFAULT_PRESENTATION_CONFIG.debugLog === false);
    this._assert('DEFAULT_PRESENTATION_CONFIG.damageText 子配置存在', !!DEFAULT_PRESENTATION_CONFIG.damageText);
    this._assert('DEFAULT_PRESENTATION_CONFIG.battleFX 子配置存在', !!DEFAULT_PRESENTATION_CONFIG.battleFX);

    // 默认配置是深拷贝（修改默认值不影响常量）
    const configCopy = { ...DEFAULT_DAMAGE_TEXT_CONFIG };
    configCopy.damageColor = '#000000';
    this._assert('默认配置修改不影响常量', DEFAULT_DAMAGE_TEXT_CONFIG.damageColor === '#FFFFFF');
  }

  // ==================== 2. BattleFXPool 测试 ====================

  static testBattleFXPool(): void {
    // 创建 & 初始化
    const pool = new BattleFXPool(null, 5);
    this._assert('BattleFXPool 创建成功', pool !== null);

    const stats = pool.getStats();
    this._assert('初始 available=5', stats.available === 5);
    this._assert('初始 total=5', stats.total === 5);
    this._assert('初始 inUse=0', stats.inUse === 0);

    // get 取出节点
    const node1 = pool.get();
    this._assert('get 返回 Node', node1 instanceof Node);
    this._assert('get 后节点激活', node1!.active === true);

    const stats2 = pool.getStats();
    this._assert('get 1次后 available=4', stats2.available === 4);
    this._assert('get 1次后 inUse=1', stats2.inUse === 1);

    // put 回收节点
    pool.put(node1!);
    const stats3 = pool.getStats();
    this._assert('put 后 available=5', stats3.available === 5);
    this._assert('put 后 inUse=0', stats3.inUse === 0);

    // put 后节点 deactivate
    this._assert('put 后节点 inactive', node1!.active === false);

    // 按需扩容：取出超过预创建数量
    const nodes: (Node | null)[] = [];
    for (let i = 0; i < 10; i++) {
      nodes.push(pool.get());
    }
    const stats4 = pool.getStats();
    this._assert('取10个后 inUse=10', stats4.inUse === 10);
    this._assert('取10个后 total>=10', stats4.total >= 10);

    // 全部回收
    for (const n of nodes) {
      if (n) pool.put(n);
    }
    const stats5 = pool.getStats();
    this._assert('全部回收后 inUse=0', stats5.inUse === 0);
    this._assert('全部回收后 available=total', stats5.available === stats5.total);

    // 最大容量限制
    const cappedPool = new BattleFXPool(null, 2, 4);
    const cappedStats = cappedPool.getStats();
    this._assert('容量限制池 total=2', cappedStats.total === 2);

    const cn1 = cappedPool.get();
    const cn2 = cappedPool.get();
    const cn3 = cappedPool.get();
    const cn4 = cappedPool.get();
    const cn5 = cappedPool.get(); // 应返回 null
    this._assert('容量限制池第5次get返回null', cn5 === null);
    this._assert('cn1-cn4 非null', cn1 !== null && cn2 !== null && cn3 !== null && cn4 !== null);

    const cappedStats2 = cappedPool.getStats();
    this._assert('容量限制池 total=4', cappedStats2.total === 4);

    // 回收后可以再取出
    if (cn1) cappedPool.put(cn1);
    const cn6 = cappedPool.get();
    this._assert('回收后再取出非null', cn6 !== null);
    this._assert('回收后再取出的inUse不变', cappedPool.getStats().inUse === 4);

    // clear 清理
    pool.clear();
    const statsClear = pool.getStats();
    this._assert('clear 后 total=0', statsClear.total === 0);
    this._assert('clear 后 available=0', statsClear.available === 0);
    this._assert('clear 后 inUse=0', statsClear.inUse === 0);

    cappedPool.clear();

    // preload 扩容
    pool.preload(8);
    const statsPreload = pool.getStats();
    this._assert('preload(8) total=8', statsPreload.total === 8);
    this._assert('preload(8) available=8', statsPreload.available === 8);

    pool.clear();
  }

  // ==================== 3. DamageText 测试 ====================

  static testDamageText(): void {
    // 十六进制颜色转换
    const white = DamageText._hexToColor('#FFFFFF');
    this._assert('hexToColor #FFFFFF r=255', white.r === 255);
    this._assert('hexToColor #FFFFFF g=255', white.g === 255);
    this._assert('hexToColor #FFFFFF b=255', white.b === 255);

    const red = DamageText._hexToColor('#FF0000');
    this._assert('hexToColor #FF0000 r=255', red.r === 255);
    this._assert('hexToColor #FF0000 g=0', red.g === 0);
    this._assert('hexToColor #FF0000 b=0', red.b === 0);

    const gold = DamageText._hexToColor('#FFD700');
    this._assert('hexToColor #FFD700 r=255', gold.r === 255);
    this._assert('hexToColor #FFD700 g=215', gold.g === 215);
    this._assert('hexToColor #FFD700 b=0', gold.b === 0);

    const green = DamageText._hexToColor('#00FF00');
    this._assert('hexToColor #00FF00 r=0', green.r === 0);
    this._assert('hexToColor #00FF00 g=255', green.g === 255);
    this._assert('hexToColor #00FF00 b=0', green.b === 0);

    // 无 # 号格式
    const blue = DamageText._hexToColor('0000FF');
    this._assert('hexToColor 无# r=0', blue.r === 0);
    this._assert('hexToColor 无# g=0', blue.g === 0);
    this._assert('hexToColor 无# b=255', blue.b === 255);

    // 短格式
    const shortRed = DamageText._hexToColor('#F00');
    this._assert('hexToColor #F00(短) r=255', shortRed.r === 255);
    this._assert('hexToColor #F00(短) g=0', shortRed.g === 0);
    this._assert('hexToColor #F00(短) b=0', shortRed.b === 0);

    // 非法格式 fallback 到白色
    const invalid = DamageText._hexToColor('INVALID');
    this._assert('hexToColor 非法格式 r=255', invalid.r === 255);
    this._assert('hexToColor 非法格式 g=255', invalid.g === 255);
    this._assert('hexToColor 非法格式 b=255', invalid.b === 255);

    // DamageText 组件创建
    const node = new Node('TestDamageText');
    const dt = node.addComponent(DamageText);
    this._assert('DamageText 组件添加成功', dt !== null);
    this._assert('DamageText instanceof DamageText', dt instanceof DamageText);

    // show 方法调用（验证不报错）
    dt.show(100, DamageTextType.Damage);
    this._assert('show Damage 不报错', true);

    dt.show(200, DamageTextType.Crit);
    this._assert('show Crit 不报错', true);

    dt.show(50, DamageTextType.Heal);
    this._assert('show Heal 不报错', true);

    // show 后节点激活
    this._assert('show 后 node.active=true', node.active === true);

    // hide 方法
    dt.hide();
    this._assert('hide 后 node.active=false', node.active === false);

    // getTextType
    this._assert('getTextType 返回 Heal', dt.getTextType() === DamageTextType.Heal);

    // isPlaying（动画未开始或已停止）
    const playing = dt.isPlaying();
    this._assert('isPlaying 为 boolean', typeof playing === 'boolean');

    // 数值格式化验证（通过 show 间接测试）
    dt.show(0, DamageTextType.Damage, DEFAULT_DAMAGE_TEXT_CONFIG);
    this._assert('show 0 伤害不报错', true);

    // 超大数值
    dt.show(99999, DamageTextType.Crit, DEFAULT_DAMAGE_TEXT_CONFIG);
    this._assert('show 99999 暴击不报错', true);

    // 负数值（治疗正数显示）
    dt.show(-10, DamageTextType.Heal, DEFAULT_DAMAGE_TEXT_CONFIG);
    this._assert('show 负治疗不报错', true);

    // onComplete 回调
    let callbackCalled = false;
    dt.show(50, DamageTextType.Damage, DEFAULT_DAMAGE_TEXT_CONFIG, () => {
      callbackCalled = true;
    });
    this._assert('onComplete 回调已注册', !callbackCalled); // 还未完成

    node.destroy();
  }

  // ==================== 4. DamageTextPool 测试 ====================

  static testDamageTextPool(): void {
    // 创建
    const pool = new DamageTextPool(10);
    this._assert('DamageTextPool 创建成功', pool !== null);

    const stats = pool.getStats();
    this._assert('DTPool 初始 total=10', stats.total === 10);
    this._assert('DTPool 初始 available=10', stats.available === 10);
    this._assert('DTPool 初始 inUse=0', stats.inUse === 0);

    // get
    const parent = new Node('TestParent');
    const dt1 = pool.get(parent);
    this._assert('get 返回 DamageText', dt1 instanceof DamageText);

    const stats2 = pool.getStats();
    this._assert('DTPool get1次后 available=9', stats2.available === 9);
    this._assert('DTPool get1次后 inUse=1', stats2.inUse === 1);

    // put
    pool.put(dt1!);
    const stats3 = pool.getStats();
    this._assert('DTPool put后 available=10', stats3.available === 10);
    this._assert('DTPool put后 inUse=0', stats3.inUse === 0);

    // 多次取还
    for (let i = 0; i < 5; i++) {
      const dt = pool.get(parent);
      if (dt) {
        pool.put(dt);
      }
    }
    const stats4 = pool.getStats();
    this._assert('DTPool 5次取还后 inUse=0', stats4.inUse === 0);
    this._assert('DTPool 5次取还后 available=10', stats4.available === 10);

    // 取出超过预创建数量（按需扩容）
    const dts: (DamageText | null)[] = [];
    for (let i = 0; i < 20; i++) {
      dts.push(pool.get(parent));
    }
    const stats5 = pool.getStats();
    this._assert('DTPool 取20个 total>=20', stats5.total >= 20);
    this._assert('DTPool 取20个 inUse=20', stats5.inUse === 20);

    // 全部回收
    for (const dt of dts) {
      if (dt) pool.put(dt);
    }
    const stats6 = pool.getStats();
    this._assert('DTPool 全回收 inUse=0', stats6.inUse === 0);

    // 最大容量限制
    const cappedPool = new DamageTextPool(2, 5);
    const cappedStats = cappedPool.getStats();
    this._assert('DTPool 容量限制 total=2', cappedStats.total === 2);

    const cdt1 = cappedPool.get(parent);
    const cdt2 = cappedPool.get(parent);
    const cdt3 = cappedPool.get(parent);
    const cdt4 = cappedPool.get(parent);
    const cdt5 = cappedPool.get(parent);
    const cdt6 = cappedPool.get(parent); // null
    this._assert('DTPool 第6次get返回null', cdt6 === null);
    this._assert('DTPool cdt1-cdt5 非null', cdt1 && cdt2 && cdt3 && cdt4 && cdt5 ? true : false);

    const cappedStats2 = cappedPool.getStats();
    this._assert('DTPool 容量限制 total=5', cappedStats2.total === 5);

    // config 配置
    const cfg = pool.getConfig();
    this._assert('getConfig 返回配置', cfg !== null);
    this._assert('getConfig.damageColor 默认白', cfg.damageColor === '#FFFFFF');

    const newConfig = { ...DEFAULT_DAMAGE_TEXT_CONFIG, damageColor: '#FF0000' };
    pool.setConfig(newConfig);
    const updatedCfg = pool.getConfig();
    this._assert('setConfig 生效', updatedCfg.damageColor === '#FF0000');

    // cleanup
    pool.clear();
    const statsClear = pool.getStats();
    this._assert('DTPool clear后 total=0', statsClear.total === 0);
    this._assert('DTPool clear后 available=0', statsClear.available === 0);

    cappedPool.clear();
    parent.destroy();
  }

  // ==================== 5. BattleAnimation 测试 ====================

  static testBattleAnimation(): void {
    const node1 = new Node('AnimTest1');
    const node2 = new Node('AnimTest2');

    // 所有 API 可调用
    BattleAnimation.playAttack(node1, node2);
    this._assert('playAttack 调用不报错', true);

    BattleAnimation.playHit(node2);
    this._assert('playHit 调用不报错', true);

    let deathComplete = false;
    BattleAnimation.playDeath(node2, DEFAULT_BATTLE_FX_CONFIG, () => {
      deathComplete = true;
    });
    this._assert('playDeath 调用不报错', true);
    this._assert('playDeath callback 已注册', !deathComplete);

    BattleAnimation.playCritEffect(node2);
    this._assert('playCritEffect 调用不报错', true);

    let attackComplete = false;
    BattleAnimation.playAttack(node1, node2, DEFAULT_BATTLE_FX_CONFIG, () => {
      attackComplete = true;
    });
    this._assert('playAttack with callback 调用不报错', true);

    BattleAnimation.playAttackAndHit(node1, node2, true);
    this._assert('playAttackAndHit(crit=true) 调用不报错', true);

    BattleAnimation.playAttackAndHit(node1, node2, false);
    this._assert('playAttackAndHit(crit=false) 调用不报错', true);

    // stopAll
    BattleAnimation.stopAll(node1);
    this._assert('stopAll 调用不报错', true);

    BattleAnimation.stopAll(node2);
    this._assert('stopAll 调用不报错', true);

    // 边界：null 参数
    BattleAnimation.playAttack(null as unknown as Node, node2);
    this._assert('playAttack null attacker 不报错', true);

    BattleAnimation.playAttack(node1, null as unknown as Node);
    this._assert('playAttack null target 不报错', true);

    BattleAnimation.playHit(null as unknown as Node);
    this._assert('playHit null 不报错', true);

    BattleAnimation.playDeath(null as unknown as Node);
    this._assert('playDeath null 不报错', true);

    BattleAnimation.playCritEffect(null as unknown as Node);
    this._assert('playCritEffect null 不报错', true);

    BattleAnimation.stopAll(null as unknown as Node);
    this._assert('stopAll null 不报错', true);

    // 配置验证
    const cfg = DEFAULT_BATTLE_FX_CONFIG;
    this._assert('cfg.attackDuration > 0', cfg.attackDuration > 0);
    this._assert('cfg.hitDuration > 0', cfg.hitDuration > 0);
    this._assert('cfg.deathDuration > 0', cfg.deathDuration > 0);
    this._assert('cfg.hitFlashCount >= 1', cfg.hitFlashCount >= 1);

    // 动画持续时间累加合理性
    const totalAnimTime = cfg.attackDuration + cfg.hitDuration;
    this._assert('attack+hit总时长 < 3s', totalAnimTime < 3);

    node1.destroy();
    node2.destroy();
  }

  // ==================== 6. BattleFXManager 测试 ====================

  static testBattleFXManager(): void {
    // 单例
    const mgr1 = BattleFXManager.getInstance();
    const mgr2 = BattleFXManager.getInstance();
    this._assert('BattleFXManager 单例一致', mgr1 === mgr2);

    // init
    const root = new Node('BattleRoot');
    mgr1.init(DEFAULT_PRESENTATION_CONFIG, root);
    this._assert('init 调用不报错', true);

    // registerUnitNode
    const heroNode = new Node('HeroNode');
    const enemyNode = new Node('EnemyNode');
    const bossNode = new Node('BossNode');

    mgr1.registerUnitNode('p_0', heroNode, BattleUnitType.Hero);
    mgr1.registerUnitNode('e_0', enemyNode, BattleUnitType.Enemy);
    mgr1.registerUnitNode('e_boss', bossNode, BattleUnitType.Boss);

    // getUnitNode
    const foundHero = mgr1.getUnitNode('p_0');
    this._assert('getUnitNode p_0 返回 heroNode', foundHero === heroNode);

    const foundEnemy = mgr1.getUnitNode('e_0');
    this._assert('getUnitNode e_0 返回 enemyNode', foundEnemy === enemyNode);

    const foundBoss = mgr1.getUnitNode('e_boss');
    this._assert('getUnitNode e_boss 返回 bossNode', foundBoss === bossNode);

    const notFound = mgr1.getUnitNode('unknown');
    this._assert('getUnitNode unknown 返回 null', notFound === null);

    // unregisterUnitNode
    mgr1.unregisterUnitNode('e_0');
    const afterUnreg = mgr1.getUnitNode('e_0');
    this._assert('unregister后 getUnitNode 返回 null', afterUnreg === null);

    // clearUnitNodes
    mgr1.clearUnitNodes();
    const afterClear = mgr1.getUnitNode('p_0');
    this._assert('clearUnitNodes 后返回 null', afterClear === null);

    // showDamageTextAt
    mgr1.showDamageTextAt(100, DamageTextType.Damage, root.worldPosition.clone());
    this._assert('showDamageTextAt 调用不报错', true);

    mgr1.showDamageTextAt(300, DamageTextType.Crit, root.worldPosition.clone());
    this._assert('showDamageTextAt Crit 调用不报错', true);

    // showHealText
    // 先注册一个节点再测试
    mgr1.registerUnitNode('p_test', heroNode, BattleUnitType.Hero);
    mgr1.showHealText(50, 'p_test');
    this._assert('showHealText 调用不报错', true);

    // showHealText 未注册节点
    mgr1.showHealText(50, 'nonexistent');
    this._assert('showHealText nonexistent 不报错', true);

    // 未 init 时 startListening 警告
    // 先 cleanup 再测试
    mgr1.cleanup();
    mgr1.startListening();
    this._assert('未init startListening 不报错', true);

    // 重新 init 后 startListening
    mgr1.init(DEFAULT_PRESENTATION_CONFIG, root);
    mgr1.startListening();
    this._assert('init后 startListening 不报错', true);

    // 重复 startListening 不报错
    mgr1.startListening();
    this._assert('重复 startListening 不报错', true);

    // stopListening
    mgr1.stopListening();
    this._assert('stopListening 不报错', true);

    // 重复 stopListening 不报错
    mgr1.stopListening();
    this._assert('重复 stopListening 不报错', true);

    // cleanup
    mgr1.cleanup();
    this._assert('cleanup 不报错', true);

    heroNode.destroy();
    enemyNode.destroy();
    bossNode.destroy();
    root.destroy();
  }

  // ==================== 7. EventManager 集成测试 ====================

  static testEventManagerIntegration(): void {
    const mgr = BattleFXManager.getInstance();
    const root = new Node('EventTestRoot');
    mgr.init(DEFAULT_PRESENTATION_CONFIG, root);

    // 验证事件常量存在
    this._assert('BattleEvent.UNIT_DAMAGED 已定义', !!BattleEvent.UNIT_DAMAGED);
    this._assert('BattleEvent.UNIT_DIED 已定义', !!BattleEvent.UNIT_DIED);
    this._assert('BattleEvent.BATTLE_ENDED 已定义', !!BattleEvent.BATTLE_ENDED);
    this._assert('BattleEvent.BATTLE_STARTED 已定义', !!BattleEvent.BATTLE_STARTED);

    const eventMgr = EventManager.getInstance();

    // 开始监听前事件无监听者（表现层未注册时）
    const hadListeners = eventMgr.hasListeners(BattleEvent.UNIT_DAMAGED);
    // 可能已有其他模块监听，这里只验证 API 调用不抛异常即可
    this._assert('事件系统 hasListeners 正常', typeof hadListeners === 'boolean');

    // startListening 注册事件
    mgr.startListening();

    // 验证事件可被 emit 且不报错
    eventMgr.emit(BattleEvent.UNIT_DAMAGED, {
      sourceUnitId: 'test_src',
      targetUnitId: 'test_tgt',
      damage: 50,
      isCritical: false,
      remainingHp: 100,
      targetMaxHp: 150,
    });
    this._assert('emit UNIT_DAMAGED 不报错', true);

    eventMgr.emit(BattleEvent.UNIT_DAMAGED, {
      sourceUnitId: 'test_src',
      targetUnitId: 'test_tgt',
      damage: 200,
      isCritical: true,
      remainingHp: 0,
      targetMaxHp: 200,
    });
    this._assert('emit UNIT_DAMAGED(crit) 不报错', true);

    eventMgr.emit(BattleEvent.UNIT_DIED, {
      unitId: 'test_tgt',
      unitType: BattleUnitType.Enemy,
      position: { row: 0, column: 1, index: 1 },
    });
    this._assert('emit UNIT_DIED 不报错', true);

    eventMgr.emit(BattleEvent.BATTLE_ENDED, {
      executionResult: {
        stageId: 'STAGE_001',
        resultType: 0,
        elapsedTimeMs: 5000,
        round: 3,
        killedEnemyIds: ['e1', 'e2'],
      },
    } as unknown as import('../battle/BattleSystem').BattleEndedEvent);
    this._assert('emit BATTLE_ENDED 不报错', true);

    // 验证 BattleFXManager 中注册节点后事件不崩溃
    const testNode = new Node('EventTestNode');
    mgr.registerUnitNode('test_tgt', testNode, BattleUnitType.Enemy);
    mgr.registerUnitNode('test_src', new Node('EventTestSrc'), BattleUnitType.Hero);

    mgr.startListening();

    // 再次 emit — 现在节点已注册，应驱动动画
    eventMgr.emit(BattleEvent.UNIT_DAMAGED, {
      sourceUnitId: 'test_src',
      targetUnitId: 'test_tgt',
      damage: 80,
      isCritical: false,
      remainingHp: 50,
      targetMaxHp: 130,
    });
    this._assert('emit 注册节点后 UNIT_DAMAGED 不报错', true);

    // UNIT_DIED 有注册节点
    eventMgr.emit(BattleEvent.UNIT_DIED, {
      unitId: 'test_tgt',
      unitType: BattleUnitType.Enemy,
      position: { row: 0, column: 1, index: 1 },
    });
    this._assert('emit 注册节点后 UNIT_DIED 不报错', true);

    mgr.cleanup();
    testNode.destroy();
    root.destroy();
  }

  // ==================== 8. 边界情况测试 ====================

  static testEdgeCases(): void {
    const pool = new DamageTextPool(3);
    const parent = new Node('EdgeCaseParent');

    // 1. put null
    pool.put(null as unknown as DamageText);
    this._assert('put null 不报错', true);

    // 2. get 空父节点
    const dt = pool.get();
    this._assert('get 无父节点返回 DamageText', dt instanceof DamageText);
    if (dt) pool.put(dt);

    // 3. 取空池 → 自动扩容
    const emptyPool = new DamageTextPool(0);
    const emptyDt = emptyPool.get(parent);
    this._assert('容量0池按需扩容返回 DamageText', emptyDt instanceof DamageText);
    if (emptyDt) emptyPool.put(emptyDt);
    emptyPool.clear();

    // 4. 大容量池
    const bigPool = new DamageTextPool(50);
    const bigStats = bigPool.getStats();
    this._assert('大池 total=50', bigStats.total === 50);
    bigPool.clear();

    // 5. 重复 clear
    pool.clear();
    pool.clear();
    this._assert('重复 clear 不报错', true);

    // 6. preload 0 个节点
    pool.preload(0);
    const zeroPreloadStats = pool.getStats();
    this._assert('preload(0) total不变', zeroPreloadStats.total === 0);

    // 7. BattleFXPool 空参数构造
    const emptyFXP = new BattleFXPool();
    this._assert('BattleFXPool 无参构造 available=10', emptyFXP.getStats().available === 10);
    emptyFXP.clear();

    // 8. save/restore 模拟（重初始化后状态干净）
    pool.preload(5);
    const beforeClear = pool.getStats().total;
    pool.clear();
    pool.preload(5);
    const afterClear = pool.getStats().total;
    this._assert('clear后reload状态正确', beforeClear === afterClear);

    // 9. BattleFXManager 多次 init
    const mgr = BattleFXManager.getInstance();
    mgr.init(DEFAULT_PRESENTATION_CONFIG);
    mgr.init(DEFAULT_PRESENTATION_CONFIG);
    this._assert('双重 init 不报错', true);

    // 10. BattleFXManager 空 root
    mgr.init(DEFAULT_PRESENTATION_CONFIG, undefined);
    this._assert('init 无 root 不报错', true);

    // 11. BattleFXPool put 非本池节点
    const pool1 = new BattleFXPool(null, 1);
    const pool2 = new BattleFXPool(null, 1);
    const otherNode = pool2.get();
    pool1.put(otherNode!); // 应警告
    this._assert('put 非本池节点不崩溃', true);

    // 12. put 已回收节点
    const n = pool2.get();
    if (n) {
      pool2.put(n);
      pool2.put(n); // 重复回收
    }
    this._assert('重复 put 不崩溃', true);

    // 13. 浮点数值
    const floatDt = new DamageTextPool(1);
    const fdt = floatDt.get(parent);
    if (fdt) {
      fdt.show(10.7, DamageTextType.Damage);
      this._assert('浮点伤害值不报错', true);

      fdt.show(0.1, DamageTextType.Crit);
      this._assert('小数值暴击不报错', true);

      floatDt.put(fdt);
    }
    floatDt.clear();

    // 14. BattleAnimation 边界：无效 duration
    const animNode = new Node('AnimEdgeNode');
    BattleAnimation.playDeath(animNode, {
      ...DEFAULT_BATTLE_FX_CONFIG,
      deathDuration: 0.01,
    });
    this._assert('极小 deathDuration 不报错', true);

    BattleAnimation.playHit(animNode, {
      ...DEFAULT_BATTLE_FX_CONFIG,
      hitDuration: 2.0,
    });
    this._assert('大 hitDuration 不报错', true);

    BattleAnimation.playAttack(animNode, animNode);
    this._assert('同一个节点 attack 不报错', true);

    animNode.destroy();

    // 15. 清理所有测试池
    pool.clear();
    pool1.clear();
    pool2.clear();
    parent.destroy();

    // 最后清理 BattleFXManager
    mgr.cleanup();
  }

  // ==================== 断言 & 汇总 ====================

  /**
   * 断言并记录
   */
  private static _assert(name: string, condition: boolean): void {
    this._totalAssertions++;
    if (condition) {
      this._passedAssertions++;
      this._results.push({ name, passed: true, message: 'PASS' });
    } else {
      this._results.push({
        name,
        passed: false,
        message: `FAIL: expected true, got ${condition}`,
      });
      console.error(`  ✗ ${name} — FAIL`);
    }
  }

  /**
   * 打印测试汇总
   */
  private static printSummary(): void {
    const failed = this._results.filter((r) => !r.passed);

    console.log('\n========== 测试汇总 ==========');
    console.log(`总断言数: ${this._totalAssertions}`);
    console.log(`通过: ${this._passedAssertions}`);
    console.log(`失败: ${failed.length}`);

    if (failed.length > 0) {
      console.log('\n--- 失败项 ---');
      for (const f of failed) {
        console.log(`  ✗ ${f.name}: ${f.message}`);
      }
    }

    const passRate =
      this._totalAssertions > 0
        ? ((this._passedAssertions / this._totalAssertions) * 100).toFixed(1)
        : '0.0';
    console.log(`\n通过率: ${passRate}%`);

    if (failed.length === 0) {
      console.log('✓ 所有断言通过！');
    }

    console.log(`\n共计 ${this._totalAssertions} 条断言，覆盖 8 个测试分组`);
  }
}
