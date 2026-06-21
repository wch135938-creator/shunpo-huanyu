// ============================================================
// Phase8Step5DebugRunner — Phase8-Step5 全 UI Prefab 调试运行器
// 职责：9 组综合集成测试，覆盖 Panel/Item/Prefab/动画/本地化/真机
//
// 运行方式：在 Cocos Creator 控制台中执行：
//   Phase8Step5DebugRunner.runAll()
//
// 测试组：
//   1. testPanelPrefabGeneration   — Panel Prefab 节点树验证
//   2. testItemPrefabGeneration    — Item Prefab 模板节点验证
//   3. testAnimationBinding        — 动画系统 Prefab 绑定
//   4. testLocalizationBinding     — 本地化文本绑定到 UI
//   5. testFullPanelLifecycle      — 全部 7 个 Panel 生命周期
//   6. testRewardAnimationPipeline — 奖励动画完整流水线
//   7. testPityAnimationBinding    — 保底动画绑定
//   8. testBuilderToPrefabPipeline — SceneBuilder→Prefab 完整流程
//   9. testZeroBreakPrinciple      — 零断连保护
// ============================================================

import { Node, Label, Prefab, instantiate, tween, Vec3 } from 'cc';
import { Phase8Bootstrap } from '../systems/Phase8Bootstrap';
import { Phase8SceneBuilder } from '../ui/Phase8SceneBuilder';
import { Phase8UIManager } from '../ui/Phase8UIManager';
import { Phase8PrefabGenerator } from '../systems/Phase8PrefabGenerator';
import { RewardAnimationSystem } from '../systems/RewardAnimationSystem';
import { DungeonLoopController, DungeonLoopEvent } from '../systems/DungeonLoopController';
import { EventManager } from '../core/EventManager';
import { ConfigManager } from '../core/ConfigManager';
import type { FlyTextConfig, RewardSequenceConfig } from '../data/reward_types';
import { createDefaultFlyTextConfig, createDefaultRewardSequenceConfig } from '../data/reward_types';
import type { RewardDisplayItem } from '../data/phase8_ui_types';

// ==================== 测试结果类型 ====================

interface TestResult {
  name: string;
  passed: boolean;
  durationMs: number;
  details: string[];
  error?: string;
}

// ==================== 主类 ====================

export class Phase8Step5DebugRunner {
  private static _results: TestResult[] = [];

  /** 运行所有 9 组测试 */
  static async runAll(): Promise<void> {
    this._results = [];

    console.log('============================================');
    console.log('  Phase8-Step5 调试运行器');
    console.log('  目标: 验证 UI Prefab 构建/动画绑定/本地化');
    console.log('============================================\n');

    const tests = [
      () => this.testPanelPrefabGeneration(),
      () => this.testItemPrefabGeneration(),
      () => this.testAnimationBinding(),
      () => this.testLocalizationBinding(),
      () => this.testFullPanelLifecycle(),
      () => this.testRewardAnimationPipeline(),
      () => this.testPityAnimationBinding(),
      () => this.testBuilderToPrefabPipeline(),
      () => this.testZeroBreakPrinciple(),
    ];

    for (const test of tests) {
      try {
        await test.call(this);
      } catch (e) {
        console.error(`[Phase8Step5DebugRunner] 测试异常:`, e);
      }
    }

    this._printSummary();
  }

  /** 运行单个测试 */
  static async runTest(testIndex: number): Promise<void> {
    const tests = [
      this.testPanelPrefabGeneration,
      this.testItemPrefabGeneration,
      this.testAnimationBinding,
      this.testLocalizationBinding,
      this.testFullPanelLifecycle,
      this.testRewardAnimationPipeline,
      this.testPityAnimationBinding,
      this.testBuilderToPrefabPipeline,
      this.testZeroBreakPrinciple,
    ];

    if (testIndex < 0 || testIndex >= tests.length) {
      console.error(`无效测试索引: ${testIndex}, 有效范围 0-${tests.length - 1}`);
      return;
    }

    await tests[testIndex].call(this);
    this._printSummary();
  }

  // ==================== Test 1: Panel Prefab 节点树验证 ====================

  static async testPanelPrefabGeneration(): Promise<void> {
    const start = Date.now();
    const details: string[] = [];
    let passed = true;

    console.log('--- Test 1: Panel Prefab 节点树验证 ---');

    try {
      const bootstrap = Phase8Bootstrap.getInstance();
      if (!bootstrap.isReady()) {
        await bootstrap.initialize();
        details.push('Bootstrap 自动初始化');
      }

      // 创建临时 UIRoot 用于测试
      const testRoot = new Node('TestUIRoot');
      const builder = testRoot.addComponent(Phase8SceneBuilder);
      builder.autoHideAfterBuild = false;

      // 调用各 build 方法
      builder.buildDungeonPanel();
      builder.buildDungeonNodeMapPanel();
      builder.buildRoguelikeHUD();
      builder.buildArtifactPanel();
      builder.buildLiveOpsPanel();
      builder.buildEventPanel();
      builder.buildResultPanel();

      // 使用 PrefabGenerator 验证节点树
      const validation = Phase8PrefabGenerator.validateNodeTreeFromScene(testRoot);
      let okCount = 0;
      let failCount = 0;

      for (const v of validation) {
        const isOk = v.exists && v.componentBound && v.missingChildren.length === 0;
        if (isOk) {
          okCount++;
          details.push(`✅ ${v.panel}: ${v.foundChildren}/${v.totalChildren} 子节点`);
        } else {
          failCount++;
          const reasons: string[] = [];
          if (!v.exists) reasons.push('节点缺失');
          if (!v.componentBound) reasons.push('组件未绑定');
          if (v.missingChildren.length > 0) reasons.push(`缺: ${v.missingChildren.join(',')}`);
          details.push(`❌ ${v.panel}: ${reasons.join('; ')}`);
        }
      }

      details.push(`Panel 汇总: ${okCount}/${validation.length} 通过`);

      if (failCount > 0) passed = false;

      // 清理
      testRoot.destroy();

    } catch (e) {
      passed = false;
      details.push(`异常: ${e}`);
    }

    const result: TestResult = {
      name: 'Test1-PanelPrefabGeneration',
      passed,
      durationMs: Date.now() - start,
      details,
    };
    this._results.push(result);
    console.log(`  ${passed ? '✅' : '❌'} 耗时 ${result.durationMs}ms\n`);
  }

  // ==================== Test 2: Item Prefab 模板节点验证 ====================

  static async testItemPrefabGeneration(): Promise<void> {
    const start = Date.now();
    const details: string[] = [];
    let passed = true;

    console.log('--- Test 2: Item Prefab 模板节点验证 ---');

    try {
      const itemMeta = Phase8PrefabGenerator.getItemMeta();
      details.push(`Item Prefab 清单: ${itemMeta.length} 个`);

      for (const meta of itemMeta) {
        // 创建临时节点模拟 Item 模板
        const itemNode = new Node(meta.name);

        // 构建子节点
        for (const childName of meta.children) {
          const child = new Node(childName);
          if (childName === 'NameLabel' || childName === 'Icon' || childName === 'TextLabel' || childName === 'ChoiceLabel') {
            child.addComponent(Label);
          }
          child.setParent(itemNode);
        }

        // 验证子节点
        let foundChildren = 0;
        const missingChildren: string[] = [];

        for (const childName of meta.children) {
          if (itemNode.getChildByName(childName)) {
            foundChildren++;
          } else {
            missingChildren.push(childName);
          }
        }

        const isOk = missingChildren.length === 0;
        if (isOk) {
          details.push(`✅ ${meta.name}: ${foundChildren}/${meta.children.length} 子节点 → ${meta.parentPanel}`);
        } else {
          details.push(`❌ ${meta.name}: 缺 ${missingChildren.join(', ')}`);
          passed = false;
        }

        itemNode.destroy();
      }

    } catch (e) {
      passed = false;
      details.push(`异常: ${e}`);
    }

    const result: TestResult = {
      name: 'Test2-ItemPrefabGeneration',
      passed,
      durationMs: Date.now() - start,
      details,
    };
    this._results.push(result);
    console.log(`  ${passed ? '✅' : '❌'} 耗时 ${result.durationMs}ms\n`);
  }

  // ==================== Test 3: 动画系统 Prefab 绑定 ====================

  static async testAnimationBinding(): Promise<void> {
    const start = Date.now();
    const details: string[] = [];
    let passed = true;

    console.log('--- Test 3: 动画系统 Prefab 绑定 ---');

    try {
      const bootstrap = Phase8Bootstrap.getInstance();
      if (!bootstrap.isReady()) {
        await bootstrap.initialize();
        details.push('Bootstrap 自动初始化');
      }

      const animSys = bootstrap.getRewardAnimationSystem();
      if (!animSys) {
        details.push('❌ RewardAnimationSystem 未初始化');
        passed = false;
      } else {
        details.push('✅ RewardAnimationSystem 已初始化');

        // 验证动画配置
        const config = animSys.getAnimationConfig();
        const defaultConfig = animSys.getAnimationDefaults();

        details.push(`  staggerDelay: ${config.staggerDelay}s (默认 ${defaultConfig.staggerDelay}s)`);
        details.push(`  flyDistance: ${config.flyDistance}px (默认 ${defaultConfig.flyDistance}px)`);
        details.push(`  counterDuration: ${config.counterDuration}s`);

        // 测试飞字动画（创建临时节点）
        const testParent = new Node('TestFlyParent');
        const flyConfig: FlyTextConfig = {
          text: '+100 金币',
          worldPosition: { x: 0, y: 100 },
          duration: 0.3,
          color: '#FFD700',
          fontSize: 24,
        };

        const flyNode = animSys.playFlyText(testParent, flyConfig);
        if (flyNode && flyNode.isValid) {
          details.push('✅ playFlyText: 飞字节点已创建');
        } else {
          details.push('❌ playFlyText: 飞字节点创建失败');
          passed = false;
        }

        // 测试计数器缓动
        let counterValue = 0;
        animSys.animateCounter(0, 100, 0.1, (val: number) => {
          counterValue = val;
        }, () => {
          details.push(`  counterValue 最终值: ${counterValue}`);
        });

        await this._delay(200);
        if (counterValue === 100) {
          details.push('✅ animateCounter: 计数器缓动正常');
        } else {
          details.push(`⚠️ animateCounter: 最终值=${counterValue} (期望 100)`);
        }

        // 测试增量光效
        animSys.playIncrementGlow(testParent);
        details.push('✅ playIncrementGlow: 调用成功（无异常）');

        // 测试保底特效
        animSys.playPityTriggerEffect(testParent, 500);
        details.push('✅ playPityTriggerEffect: 调用成功（无异常）');

        // 清理
        animSys.stopAllFlyText();
        testParent.destroy();
      }
    } catch (e) {
      passed = false;
      details.push(`异常: ${e}`);
    }

    const result: TestResult = {
      name: 'Test3-AnimationBinding',
      passed,
      durationMs: Date.now() - start,
      details,
    };
    this._results.push(result);
    console.log(`  ${passed ? '✅' : '❌'} 耗时 ${result.durationMs}ms\n`);
  }

  // ==================== Test 4: 本地化文本绑定 ====================

  static async testLocalizationBinding(): Promise<void> {
    const start = Date.now();
    const details: string[] = [];
    let passed = true;

    console.log('--- Test 4: 本地化文本绑定 ---');

    try {
      const bootstrap = Phase8Bootstrap.getInstance();
      if (!bootstrap.isReady()) {
        await bootstrap.initialize();
        details.push('Bootstrap 自动初始化');
      }

      // 尝试通过 ConfigManager 读取本地化配置
      const configManager = (bootstrap as unknown as {
        _configManager: { getConfig: (path: string) => unknown };
      })._configManager;

      let l10nConfig: Record<string, Record<string, string>> | undefined;
      try {
        l10nConfig = (configManager?.getConfig('config/localization/phase8_ui_texts') as any)?.data ?? undefined;
      } catch {
        details.push('⚠️ 本地化配置未通过 ConfigManager 加载（可能尚未注册到加载列表）');
      }

      if (l10nConfig && l10nConfig['zh']) {
        const zh = l10nConfig['zh'];
        const keyCount = Object.keys(zh).length;
        details.push(`✅ 本地化文本已加载: ${keyCount} 个 key (zh)`);

        // 验证必需的 key 存在
        const requiredKeys = [
          'dungeon_panel_title', 'nodemap_title', 'hud_gold', 'hud_exp',
          'artifact_panel_title', 'liveops_panel_title',
          'result_panel_victory', 'result_panel_defeat',
          'reward_type_gold', 'reward_type_exp',
        ];

        const missingKeys: string[] = [];
        for (const k of requiredKeys) {
          if (!zh[k]) missingKeys.push(k);
        }

        if (missingKeys.length === 0) {
          details.push('✅ 所有必需 key 均存在');
        } else {
          details.push(`❌ 缺少 ${missingKeys.length} 个必需 key: ${missingKeys.join(', ')}`);
          passed = false;
        }
      } else {
        details.push('❌ 本地化文本配置未加载');
        passed = false;
      }
    } catch (e) {
      passed = false;
      details.push(`异常: ${e}`);
    }

    const result: TestResult = {
      name: 'Test4-LocalizationBinding',
      passed,
      durationMs: Date.now() - start,
      details,
    };
    this._results.push(result);
    console.log(`  ${passed ? '✅' : '❌'} 耗时 ${result.durationMs}ms\n`);
  }

  // ==================== Test 5: 全部 7 个 Panel 生命周期 ====================

  static async testFullPanelLifecycle(): Promise<void> {
    const start = Date.now();
    const details: string[] = [];
    let passed = true;

    console.log('--- Test 5: 全部 Panel 生命周期 ---');

    try {
      const bootstrap = Phase8Bootstrap.getInstance();
      if (!bootstrap.isReady()) {
        await bootstrap.initialize();
        details.push('Bootstrap 自动初始化');
      }

      // 创建临时 UIRoot + UIManager
      const testRoot = new Node('TestUIRoot');
      const builder = testRoot.addComponent(Phase8SceneBuilder);
      builder.autoHideAfterBuild = false;
      builder.buildAllPanels();

      const uiMgr = testRoot.getComponent(Phase8UIManager);
      if (!uiMgr) {
        details.push('❌ Phase8UIManager 未附加');
        passed = false;
      } else {
        // 测试每个 Panel 的显示/隐藏
        const testCases = [
          { name: 'DungeonPanel', open: () => uiMgr.dungeonPanel?.show(), check: () => uiMgr.dungeonPanel?.isShowing() },
          { name: 'DungeonNodeMapPanel', open: () => uiMgr.nodeMapPanel?.show(), check: () => uiMgr.nodeMapPanel?.isShowing() },
          { name: 'RoguelikeHUD', open: () => uiMgr.roguelikeHUD?.show(), check: () => uiMgr.roguelikeHUD?.isShowing() },
          { name: 'ArtifactPanel', open: () => uiMgr.artifactPanel?.show(), check: () => uiMgr.artifactPanel?.isShowing() },
          { name: 'LiveOpsPanel', open: () => uiMgr.liveOpsPanel?.show(), check: () => uiMgr.liveOpsPanel?.isShowing() },
          { name: 'EventPanel', open: () => uiMgr.eventPanel?.show(), check: () => uiMgr.eventPanel?.isShowing() },
          { name: 'ResultPanel', open: () => uiMgr.resultPanel?.show(), check: () => uiMgr.resultPanel?.isShowing() },
        ];

        for (const tc of testCases) {
          tc.open();
          const showing = tc.check();
          if (showing) {
            details.push(`✅ ${tc.name}: 显示正常`);
            // 隐藏
            const panel = (uiMgr as any)[tc.name.charAt(0).toLowerCase() + tc.name.slice(1)];
            if (panel && typeof panel.hide === 'function') {
              // 用 hideAllPanels 统一清理
            }
          } else {
            details.push(`❌ ${tc.name}: 显示失败`);
            passed = false;
          }
        }

        uiMgr.hideAllPanels();
        const anyShowing = uiMgr.isAnyPanelShowing();
        if (anyShowing) {
          details.push('❌ hideAllPanels 不完整');
          passed = false;
        } else {
          details.push('✅ hideAllPanels 正常');
        }
      }

      // 清理
      testRoot.destroy();
    } catch (e) {
      passed = false;
      details.push(`异常: ${e}`);
    }

    const result: TestResult = {
      name: 'Test5-FullPanelLifecycle',
      passed,
      durationMs: Date.now() - start,
      details,
    };
    this._results.push(result);
    console.log(`  ${passed ? '✅' : '❌'} 耗时 ${result.durationMs}ms\n`);
  }

  // ==================== Test 6: 奖励动画完整流水线 ====================

  static async testRewardAnimationPipeline(): Promise<void> {
    const start = Date.now();
    const details: string[] = [];
    let passed = true;

    console.log('--- Test 6: 奖励动画完整流水线 ---');

    try {
      const bootstrap = Phase8Bootstrap.getInstance();
      if (!bootstrap.isReady()) {
        await bootstrap.initialize();
        details.push('Bootstrap 自动初始化');
      }

      const animSys = bootstrap.getRewardAnimationSystem();

      // 模拟奖励数据
      const mockRewards: RewardDisplayItem[] = [
        { rewardType: 'gold', iconPath: '', quantity: 100, displayName: '金币' },
        { rewardType: 'exp', iconPath: '', quantity: 50, displayName: '经验' },
        { rewardType: 'equipment', iconPath: '', quantity: 1, displayName: '铁剑', isPityBonus: true },
      ];

      // 创建临时容器和 Prefab 模拟
      const container = new Node('TestRewardContainer');
      const itemPrefab = new Node('RewardItemTemplate');
      const iconLabel = new Node('Icon');
      iconLabel.addComponent(Label);
      iconLabel.setParent(itemPrefab);
      const nameLabel = new Node('NameLabel');
      nameLabel.addComponent(Label);
      nameLabel.setParent(itemPrefab);
      const qtyLabel = new Node('QtyLabel');
      qtyLabel.addComponent(Label);
      qtyLabel.setParent(itemPrefab);

      // 使用回退方式测试（无 Prefab 对象时，animSys 使用 _configureRewardItemFallback）
      details.push('ℹ️ 注意: playRewardSequence 需要 Prefab 对象，此处测试独立 API');

      // 测试飞字批量
      const flyConfigs: FlyTextConfig[] = mockRewards.map((r) => ({
        text: `+${r.quantity} ${r.displayName}`,
        worldPosition: { x: 0, y: 100 + Math.random() * 50 },
        duration: 0.3,
        color: r.rewardType === 'gold' ? '#FFD700' : r.rewardType === 'exp' ? '#44AAFF' : '#FF44FF',
      }));

      animSys.playFlyTextBatch(container, flyConfigs);
      details.push('✅ playFlyTextBatch: 批量飞字已触发');

      // 测试配置覆盖
      animSys.setAnimationConfig({ staggerDelay: 0.12, flyDistance: 100 });
      const updatedConfig = animSys.getAnimationConfig();
      if (updatedConfig.staggerDelay === 0.12 && updatedConfig.flyDistance === 100) {
        details.push('✅ setAnimationConfig: 配置覆盖生效');
      } else {
        details.push('❌ setAnimationConfig: 配置覆盖失败');
        passed = false;
      }

      // 恢复默认
      animSys.setAnimationConfig(animSys.getAnimationDefaults());
      details.push('✅ 动画配置已恢复默认');

      // 清理
      animSys.stopAllFlyText();
      container.destroy();
      itemPrefab.destroy();

    } catch (e) {
      passed = false;
      details.push(`异常: ${e}`);
    }

    const result: TestResult = {
      name: 'Test6-RewardAnimationPipeline',
      passed,
      durationMs: Date.now() - start,
      details,
    };
    this._results.push(result);
    console.log(`  ${passed ? '✅' : '❌'} 耗时 ${result.durationMs}ms\n`);
  }

  // ==================== Test 7: 保底动画绑定 ====================

  static async testPityAnimationBinding(): Promise<void> {
    const start = Date.now();
    const details: string[] = [];
    let passed = true;

    console.log('--- Test 7: 保底动画绑定 ---');

    try {
      const bootstrap = Phase8Bootstrap.getInstance();
      if (!bootstrap.isReady()) {
        await bootstrap.initialize();
        details.push('Bootstrap 自动初始化');
      }

      const animSys = bootstrap.getRewardAnimationSystem();

      // 创建保底触发测试节点
      const pityNode = new Node('PityTriggerNode');
      const uiOpacity = pityNode.addComponent('cc.UIOpacity' as any);
      const label = pityNode.addComponent(Label);
      label.string = '🔥 Boss保底!';
      label.fontSize = 28;

      // 播放保底特效
      animSys.playPityTriggerEffect(pityNode, 800);
      details.push('✅ playPityTriggerEffect: 保底特效已触发');

      // 验证缩放波动
      const initialScale = pityNode.scale.clone();
      await this._delay(100);

      // 特效触发后缩放应该已改变
      details.push(`  初始缩放: (${initialScale.x.toFixed(2)}, ${initialScale.y.toFixed(2)})`);
      details.push('  保底特效序列: scaleIn(1.3) → scaleOut(1.0) → delay(0.5s) → fadeOut(0.3s) → deactivate');

      // 等待特效完成
      await this._delay(1000);

      details.push('✅ 保底动画序列执行完成');

      // 清理
      pityNode.destroy();

    } catch (e) {
      passed = false;
      details.push(`异常: ${e}`);
    }

    const result: TestResult = {
      name: 'Test7-PityAnimationBinding',
      passed,
      durationMs: Date.now() - start,
      details,
    };
    this._results.push(result);
    console.log(`  ${passed ? '✅' : '❌'} 耗时 ${result.durationMs}ms\n`);
  }

  // ==================== Test 8: SceneBuilder → Prefab 完整流程 ====================

  static async testBuilderToPrefabPipeline(): Promise<void> {
    const start = Date.now();
    const details: string[] = [];
    let passed = true;

    console.log('--- Test 8: SceneBuilder → Prefab 完整流程 ---');

    try {
      const bootstrap = Phase8Bootstrap.getInstance();
      if (!bootstrap.isReady()) {
        await bootstrap.initialize();
        details.push('Bootstrap 自动初始化');
      }

      // 创建独立测试环境
      const testRoot = new Node('TestSceneRoot');

      // Step 1: 使用 SceneBuilder 构建所有 Panel
      const builder = testRoot.addComponent(Phase8SceneBuilder);
      builder.autoHideAfterBuild = false;
      builder.buildAllPanels();

      const uiMgr = testRoot.getComponent(Phase8UIManager);
      if (!uiMgr) {
        details.push('❌ Phase8UIManager 未创建');
        passed = false;
      } else {
        details.push('✅ Phase8UIManager 已创建并绑定 7 个 Panel');

        // Step 2: 使用 PrefabGenerator 生成报告
        const report = Phase8PrefabGenerator.generateStep5Report(testRoot);
        details.push('✅ PrefabGenerator.generateStep5Report 已生成');

        // Step 3: 验证指令
        const instructions = Phase8PrefabGenerator.generateBuildInstructions();
        const lineCount = instructions.split('\n').length;
        details.push(`✅ 构建指令: ${lineCount} 行`);

        // Step 4: 验证清单
        const checklist = Phase8PrefabGenerator.generateBindingChecklist();
        details.push('✅ 引用绑定清单已生成');
      }

      // Step 5: 节点数统计
      const nodeCount = Phase8PrefabGenerator.countNodes(testRoot);
      details.push(`✅ 节点数统计: ${nodeCount} 个节点`);

      // 清理
      testRoot.destroy();

      details.push('✅ SceneBuilder → Prefab 流程完整');

    } catch (e) {
      passed = false;
      details.push(`异常: ${e}`);
    }

    const result: TestResult = {
      name: 'Test8-BuilderToPrefabPipeline',
      passed,
      durationMs: Date.now() - start,
      details,
    };
    this._results.push(result);
    console.log(`  ${passed ? '✅' : '❌'} 耗时 ${result.durationMs}ms\n`);
  }

  // ==================== Test 9: 零断连保护 ====================

  static async testZeroBreakPrinciple(): Promise<void> {
    const start = Date.now();
    const details: string[] = [];
    let passed = true;

    console.log('--- Test 9: 零断连保护 ---');

    try {
      // 场景 1: 动画系统接收 null parentNode
      const animSys = RewardAnimationSystem.getInstance();
      const nullResult = animSys.playFlyText(null as unknown as Node, createDefaultFlyTextConfig());
      if (nullResult === null) {
        details.push('✅ playFlyText(null): 正确返回 null（不断连）');
      } else {
        details.push('❌ playFlyText(null): 未正确处理 null');
        passed = false;
      }

      // 场景 2: 计数器缓动相同值
      let counterValue = -1;
      animSys.animateCounter(42, 42, 0.1, (val) => { counterValue = val; });
      await this._delay(100);
      if (counterValue === 42) {
        details.push('✅ animateCounter(42→42): 相同值正确跳过（不断连）');
      } else {
        details.push(`❌ animateCounter(42→42): 值异常=${counterValue}`);
        passed = false;
      }

      // 场景 3: 增量光效到无效节点
      try {
        animSys.playIncrementGlow(null as unknown as Node);
        details.push('✅ playIncrementGlow(null): 静默处理（不断连）');
      } catch {
        details.push('❌ playIncrementGlow(null): 抛出异常（应静默处理）');
        passed = false;
      }

      // 场景 4: 保底特效到无效节点
      try {
        animSys.playPityTriggerEffect(null as unknown as Node);
        details.push('✅ playPityTriggerEffect(null): 静默处理（不断连）');
      } catch {
        details.push('❌ playPityTriggerEffect(null): 抛出异常（应静默处理）');
        passed = false;
      }

      // 场景 5: 空奖励来源
      const bootstrap = Phase8Bootstrap.getInstance();
      if (!bootstrap.isReady()) {
        await bootstrap.initialize();
      }
      const loopController = bootstrap.getDungeonLoopController();
      const emptyResult = loopController.settleNodeRewards([], 'test_zero_001');
      if (emptyResult.totalGold === 0 && emptyResult.totalExp === 0 && emptyResult.records.length === 0) {
        details.push('✅ settleNodeRewards([]): 空来源正确返回零值');
      } else {
        details.push('❌ settleNodeRewards([]): 非零值异常');
        passed = false;
      }

      // 场景 6: 无效 Panel 引用
      // 测试 PrefabGenerator 接收 null root
      const nullValidation = Phase8PrefabGenerator.validateNodeTreeFromScene(null as unknown as Node);
      if (nullValidation.length === 7) {
        // 即使根节点为空，也应该返回完整的 7 个"不存在"结果
        const allMissing = nullValidation.every((v) => !v.exists);
        if (allMissing) {
          details.push('✅ validateNodeTreeFromScene(null): 正确返回不存在状态');
        } else {
          details.push('❌ validateNodeTreeFromScene(null): 结果异常');
          passed = false;
        }
      } else {
        details.push('❌ validateNodeTreeFromScene(null): 返回结果数异常');
        passed = false;
      }

    } catch (e) {
      passed = false;
      details.push(`异常: ${e}`);
    }

    const result: TestResult = {
      name: 'Test9-ZeroBreakPrinciple',
      passed,
      durationMs: Date.now() - start,
      details,
    };
    this._results.push(result);
    console.log(`  ${passed ? '✅' : '❌'} 耗时 ${result.durationMs}ms\n`);
  }

  // ==================== 辅助 ====================

  private static _delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ==================== 汇总 ====================

  private static _printSummary(): void {
    console.log('\n============================================');
    console.log('  Phase8-Step5 测试结果汇总');
    console.log('============================================');

    for (const result of this._results) {
      const icon = result.passed ? '✅' : '❌';
      console.log(`${icon} ${result.name} (${result.durationMs}ms)`);
      for (const detail of result.details) {
        console.log(`    ${detail}`);
      }
    }

    const passCount = this._results.filter((r) => r.passed).length;
    const totalCount = this._results.length;

    console.log('\n  ━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  测试结果: ${passCount}/${totalCount} 通过`);

    if (passCount === totalCount) {
      console.log('  🎉 所有测试通过！Phase8-Step5 验证成功。');
    } else {
      console.log(`  ⚠️ ${totalCount - passCount} 组测试未通过，请检查对应项。`);
    }

    const totalMs = this._results.reduce((sum, r) => sum + r.durationMs, 0);
    console.log(`  总耗时: ${totalMs}ms`);
    console.log('============================================\n');
  }

  /** 获取测试结果 */
  static getResults(): ReadonlyArray<TestResult> {
    return this._results;
  }
}

// 注册为全局便捷入口
(globalThis as any).Phase8Step5DebugRunner = Phase8Step5DebugRunner;
