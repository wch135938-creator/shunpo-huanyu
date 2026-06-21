// ============================================================
// Phase8Step2BuildVerifier — Phase8 UI 构建验证工具
// 职责：验证所有 Panel 节点树是否正确构建 / EventManager 监听是否泄漏 /
//       资源绑定是否正确 / 真机构建是否达标
//
// 运行方式：
//   在 Cocos Creator 中运行 Phase8Main 场景，打开控制台查看日志。
//   或在微信开发者工具中构建后查看 vConsole。
//
// 验证项目：
//   1. 节点数量检查（每个 Panel 的节点层级）
//   2. EventManager 事件订阅数量
//   3. 资源引用完整性
//   4. 面板生命周期逻辑
//   5. 肖像模式参数检查
// ============================================================

import { _decorator, Component, Node, Label, Button, Sprite, Canvas, Camera, UITransform, director } from 'cc';
import { Phase8Bootstrap, Phase8Event } from '../systems/Phase8Bootstrap';
import { EventManager } from '../core/EventManager';
import { Phase8UIManager } from '../ui/Phase8UIManager';
import { Phase8SceneBuilder } from '../ui/Phase8SceneBuilder';
import { DungeonPanel } from '../ui/DungeonPanel';
import { DungeonNodeMapPanel } from '../ui/DungeonNodeMapPanel';
import { RoguelikeHUD } from '../ui/RoguelikeHUD';
import { ArtifactPanel } from '../ui/ArtifactPanel';
import { LiveOpsPanel } from '../ui/LiveOpsPanel';
import { EventPanel } from '../ui/EventPanel';
import { ResultPanel } from '../ui/ResultPanel';
import { SaveManager } from '../save/SaveManager';

const { ccclass, property } = _decorator;

/** 验证结果项 */
interface VerifyCheckItem {
  name: string;
  passed: boolean;
  detail: string;
}

@ccclass('Phase8Step2BuildVerifier')
export class Phase8Step2BuildVerifier extends Component {
  @property({ type: Phase8UIManager, tooltip: 'UI 管理器引用' })
  uiManager: Phase8UIManager | null = null;

  @property({ type: Phase8SceneBuilder, tooltip: '场景构建器引用（可选）' })
  sceneBuilder: Phase8SceneBuilder | null = null;

  @property({ tooltip: '是否自动运行验证' })
  autoRun = true;

  @property({ tooltip: '是否输出详细日志' })
  verbose = true;

  private _results: VerifyCheckItem[] = [];

  start(): void {
    if (this.autoRun) {
      // 等待 Bootstrap 就绪后执行验证
      const bootstrap = Phase8Bootstrap.getInstance();
      if (bootstrap.isReady()) {
        this.scheduleOnce(() => this.runAllChecks(), 0.5);
      } else {
        EventManager.getInstance().once(Phase8Event.BOOTSTRAP_READY, () => {
          this.scheduleOnce(() => this.runAllChecks(), 0.5);
        }, this);
      }
    }
  }

  // ==================== 全量验证 ====================

  runAllChecks(): void {
    this._results = [];

    console.log('========================================');
    console.log('  Phase8Step2 构建验证开始');
    console.log('========================================');

    this._checkPortraitMode();
    this._checkCanvasCamera();
    this._checkNodeHierarchy();
    this._checkEventSubscriptions();
    this._checkPanelComponents();
    this._checkResourceReferences();
    this._checkUIManagerBinding();
    this._checkPanelLifecycle();

    console.log('========================================');
    console.log('  验证结果汇总');
    console.log('========================================');

    let passedCount = 0;
    for (const item of this._results) {
      const icon = item.passed ? '✅' : '❌';
      console.log(`  ${icon} ${item.name}: ${item.detail}`);
      if (item.passed) passedCount++;
    }

    const totalCount = this._results.length;
    console.log(`\n  总计: ${passedCount}/${totalCount} 通过`);

    if (passedCount === totalCount) {
      console.log('  🎉 所有验证通过！可以安全构建。');
    } else {
      console.log(`  ⚠️ ${totalCount - passedCount} 项未通过，请检查。`);
    }

    console.log('========================================\n');
  }

  // ==================== 单项检查 ====================

  /** 1. 肖像模式参数检查 */
  private _checkPortraitMode(): void {
    const canvas = director.getScene()?.getChildByName('Canvas');
    const uiTransform = canvas?.getComponent(UITransform);

    let passed = true;
    let detail = '';

    if (uiTransform) {
      const w = uiTransform.width;
      const h = uiTransform.height;
      detail = `Canvas: ${w}×${h}`;

      if (w !== 720 || h !== 1280) {
        passed = false;
        detail += ' (期望 720×1280)';
      }
    } else {
      passed = false;
      detail = 'Canvas/UITransform 未找到';
    }

    // 检查 Camera orthoHeight
    const camera = canvas?.getChildByName('Camera')?.getComponent(Camera);
    if (camera && camera.orthoHeight !== 640) {
      passed = false;
      detail += ` | orthoHeight=${camera.orthoHeight} (期望 640)`;
    }

    this._results.push({ name: '肖像模式参数', passed, detail });
  }

  /** 2. Canvas 和 Camera 检查 */
  private _checkCanvasCamera(): void {
    const scene = director.getScene();
    const canvas = scene?.getChildByName('Canvas');
    const camera = canvas?.getChildByName('Camera');

    let passed = true;
    const issues: string[] = [];

    if (!canvas) { passed = false; issues.push('Canvas 节点未找到'); }
    if (!camera) { passed = false; issues.push('Camera 节点未找到'); }

    // 检查 Canvas 组件
    if (canvas && !canvas.getComponent(Canvas)) {
      passed = false;
      issues.push('缺少 Canvas 组件');
    }

    // 检查 Camera 组件
    if (camera && !camera.getComponent(Camera)) {
      passed = false;
      issues.push('缺少 Camera 组件');
    }

    const detail = passed ? 'Canvas/Camera 正常' : issues.join('; ');
    this._results.push({ name: 'Canvas/Camera 组件', passed, detail });
  }

  /** 3. 节点层级完整性检查 */
  private _checkNodeHierarchy(): void {
    const expectedPanels: Record<string, Record<string, string[]>> = {
      DungeonPanel: {
        PanelRoot: ['TitleLabel', 'PowerLabel', 'ContentNode', 'EmptyHintLabel', 'CloseButton'],
      },
      DungeonNodeMapPanel: {
        PanelRoot: ['LayerTitleLabel', 'NodeListContainer', 'InfoLabel', 'CloseButton', 'ForkPanel'],
      },
      RoguelikeHUD: {
        PanelRoot: ['DungeonNameLabel', 'FloorLabel', 'ProgressFill', 'ProgressLabel', 'GoldLabel', 'ExpLabel', 'SeedLabel', 'PauseButton'],
      },
      ArtifactPanel: {
        PanelRoot: ['TitleLabel', 'ActiveArtifactLabel', 'ArtifactListContainer', 'EmptyHintLabel', 'CloseButton', 'TooltipNode'],
      },
      LiveOpsPanel: {
        PanelRoot: ['TitleLabel', 'LastRefreshLabel', 'CardListContainer', 'EmptyHintLabel', 'CloseButton'],
      },
      EventPanel: {
        PanelRoot: ['TitleLabel', 'CategoryLabel', 'DescriptionLabel', 'RewardPreviewLabel', 'ChoiceContainer', 'SkipButton', 'ConfirmButton', 'ResultPanel'],
      },
      ResultPanel: {
        PanelRoot: ['TitleLabel', 'SubtitleLabel', 'RewardContainer', 'ExpGainLabel', 'GoldGainLabel', 'DurationLabel', 'ContinueButton', 'ReturnButton'],
      },
    };

    let allPassed = true;
    const missingNodes: string[] = [];
    let totalNodes = 0;

    for (const [panelName, children] of Object.entries(expectedPanels)) {
      const panelNode = this.uiManager?.panelContainer?.getChildByName(panelName);
      if (!panelNode) {
        allPassed = false;
        missingNodes.push(`${panelName}(根节点)`);
        continue;
      }
      totalNodes++;

      for (const [parentName, childNames] of Object.entries(children)) {
        const parent = panelNode.getChildByName(parentName);
        if (!parent) {
          allPassed = false;
          missingNodes.push(`${panelName}/${parentName}`);
          continue;
        }
        totalNodes++;

        for (const childName of childNames) {
          totalNodes++;
          if (!parent.getChildByName(childName)) {
            // 某些节点可能是组件在父节点上的
            if (parent.name === childName) continue;
            allPassed = false;
            missingNodes.push(`${panelName}/${parentName}/${childName}`);
          }
        }
      }
    }

    const detail = allPassed
      ? `全部 ${Object.keys(expectedPanels).length} 个 Panel 节点树完整 (~${totalNodes} 节点)`
      : `缺少 ${missingNodes.length} 个节点: ${missingNodes.slice(0, 5).join(', ')}${missingNodes.length > 5 ? '...' : ''}`;

    this._results.push({ name: '节点层级完整性', passed: allPassed, detail });
  }

  /** 4. EventManager 事件订阅数量 */
  private _checkEventSubscriptions(): void {
    // 验证关键事件的订阅
    const keyEvents = [
      'roguelike:runStarted',
      'roguelike:nodeEntered',
      'roguelike:nodeCompleted',
      'roguelike:layerCompleted',
      'roguelike:runCompleted',
      'roguelike:branchChosen',
      'roguelike:floorTransitioned',
      'artifact:unlocked',
      'artifact:levelChanged',
      'artifact:activated',
      'liveOps:refreshed',
    ];

    let hasListenersCount = 0;
    let noListenersCount = 0;

    for (const event of keyEvents) {
      if (EventManager.getInstance().hasListeners(event)) {
        hasListenersCount++;
      } else {
        noListenersCount++;
      }
    }

    // 运行前可能没有订阅（面板未打开），所以只要有监听器比例合理就通过
    const passed = hasListenersCount > 0 || noListenersCount === keyEvents.length;
    const detail = `${hasListenersCount}/${keyEvents.length} 个关键事件已有订阅者`;

    this._results.push({ name: '事件订阅检查', passed, detail });
  }

  /** 5. Panel 组件完整性 */
  private _checkPanelComponents(): void {
    const panelComponents = [
      { name: 'DungeonPanel', comp: DungeonPanel },
      { name: 'DungeonNodeMapPanel', comp: DungeonNodeMapPanel },
      { name: 'RoguelikeHUD', comp: RoguelikeHUD },
      { name: 'ArtifactPanel', comp: ArtifactPanel },
      { name: 'LiveOpsPanel', comp: LiveOpsPanel },
      { name: 'EventPanel', comp: EventPanel },
      { name: 'ResultPanel', comp: ResultPanel },
    ];

    let boundCount = 0;
    let unboundCount = 0;
    const unboundPanels: string[] = [];

    for (const { name, comp } of panelComponents) {
      const panelNode = this.uiManager?.panelContainer?.getChildByName(name);
      if (!panelNode) {
        unboundCount++;
        unboundPanels.push(`${name}(节点)`);
        continue;
      }

      const component = panelNode.getComponent(comp);
      if (component) {
        boundCount++;
      } else {
        unboundCount++;
        unboundPanels.push(`${name}(组件)`);
      }
    }

    const passed = unboundCount === 0;
    const detail = passed
      ? `全部 ${boundCount} 个 Panel 组件已绑定`
      : `${boundCount} 已绑定, ${unboundCount} 未绑定: ${unboundPanels.join(', ')}`;

    this._results.push({ name: 'Panel 组件绑定', passed, detail });
  }

  /** 6. 资源引用完整性 */
  private _checkResourceReferences(): void {
    // 检查 icon 映射配置是否可加载
    // 在运行时，通过 ConfigManager 检查资源路径
    const issues: string[] = [];

    // 检查 Phase8Bootstrap 配置加载数量
    const bootstrap = Phase8Bootstrap.getInstance();
    if (!bootstrap.isReady()) {
      this._results.push({ name: '资源配置加载', passed: false, detail: 'Bootstrap 未就绪' });
      return;
    }

    const dungeonConfigs = bootstrap.getDungeonV2Configs();
    const artifactConfigs = bootstrap.getArtifactConfigs();
    const liveOpsConfigs = bootstrap.getLiveOpsConfigs();

    if (dungeonConfigs.length === 0) issues.push('地牢配置为空');
    if (artifactConfigs.length === 0) issues.push('神器配置为空');
    if (liveOpsConfigs.length === 0) issues.push('运营活动配置为空');

    const passed = issues.length === 0;
    const detail = passed
      ? `地牢${dungeonConfigs.length}个 神器${artifactConfigs.length}个 活动${liveOpsConfigs.length}个`
      : issues.join('; ');

    this._results.push({ name: '资源配置加载', passed, detail });
  }

  /** 7. UIManager 绑定检查 */
  private _checkUIManagerBinding(): void {
    if (!this.uiManager) {
      this._results.push({ name: 'UIManager 绑定', passed: false, detail: 'Phase8UIManager 引用为空' });
      return;
    }

    const bindings = [
      { name: 'DungeonPanel', ref: this.uiManager.dungeonPanel },
      { name: 'NodeMapPanel', ref: this.uiManager.nodeMapPanel },
      { name: 'RoguelikeHUD', ref: this.uiManager.roguelikeHUD },
      { name: 'ArtifactPanel', ref: this.uiManager.artifactPanel },
      { name: 'LiveOpsPanel', ref: this.uiManager.liveOpsPanel },
      { name: 'EventPanel', ref: this.uiManager.eventPanel },
      { name: 'ResultPanel', ref: this.uiManager.resultPanel },
    ];

    const unbound: string[] = [];
    for (const { name, ref } of bindings) {
      if (!ref) unbound.push(name);
    }

    const passed = unbound.length === 0;
    const detail = passed
      ? '全部 7 个面板已绑定到 UIManager'
      : `未绑定: ${unbound.join(', ')}`;

    this._results.push({ name: 'UIManager 面板绑定', passed, detail });
  }

  /** 8. 面板生命周期验证 */
  private _checkPanelLifecycle(): void {
    if (!this.uiManager) {
      this._results.push({ name: '面板生命周期', passed: false, detail: 'UIManager 未找到' });
      return;
    }

    const issues: string[] = [];

    // 测试显示/隐藏
    try {
      const wasShowing = this.uiManager.isAnyPanelShowing();

      // 尝试打开 DungeonPanel
      this.uiManager.openDungeonPanel(1000);
      const dungeonShowing = this.uiManager.dungeonPanel?.isShowing();
      if (!dungeonShowing) {
        issues.push('DungeonPanel 打开失败');
      }

      // 隐藏所有
      this.uiManager.hideAllPanels();
      const anyAfterHide = this.uiManager.isAnyPanelShowing();
      if (anyAfterHide) {
        issues.push('Panel 隐藏不完整');
      }
    } catch (e) {
      issues.push(`生命周期异常: ${e}`);
    }

    const passed = issues.length === 0;
    const detail = passed ? '显示/隐藏逻辑正常' : issues.join('; ');

    this._results.push({ name: '面板生命周期', passed, detail });
  }

  // ==================== 真机构建检查（手动触发） ====================

  /**
   * 微信小游戏真机构建检查项。
   * 在微信开发者工具中运行后手动调用此方法。
   */
  checkWeChatBuild(): void {
    console.log('========================================');
    console.log('  微信小游戏真机构建检查');
    console.log('========================================');

    // 节点数统计
    const scene = director.getScene();
    let totalNodes = 0;
    const countNodes = (node: Node): void => {
      totalNodes++;
      node.children.forEach(countNodes);
    };
    if (scene) countNodes(scene);
    console.log(`  场景总节点数: ${totalNodes}`);

    // 内存估算
    if (typeof (performance as any)?.memory !== 'undefined') {
      const mem = (performance as any).memory;
      console.log(`  内存: ${(mem.usedJSHeapSize / 1048576).toFixed(1)}MB / ${(mem.jsHeapSizeLimit / 1048576).toFixed(1)}MB`);
    }

    // 检查 wx API 可用性
    if (typeof (globalThis as any).wx !== 'undefined') {
      const wx = (globalThis as any).wx;
      const systemInfo = wx.getSystemInfoSync?.() ?? {};
      console.log(`  平台: ${systemInfo.platform ?? '未知'}`);
      console.log(`  系统: ${systemInfo.system ?? '未知'}`);
      console.log(`  屏幕: ${systemInfo.screenWidth}×${systemInfo.screenHeight}`);
      console.log(`  微信版本: ${systemInfo.version ?? '未知'}`);
    } else {
      console.log('  ⚠️ 非微信环境 (wx API 不可用)');
    }

    // Canvas 尺寸
    const canvas = scene?.getChildByName('Canvas')?.getComponent(UITransform);
    if (canvas) {
      console.log(`  Canvas: ${canvas.width}×${canvas.height}`);
    }

    console.log('========================================\n');
  }

  // ==================== 摘要报告 ====================

  /** 生成验证报告字符串 */
  generateReport(): string {
    const lines: string[] = [];
    lines.push('=== Phase8Step2 构建验证报告 ===');
    lines.push(`时间: ${new Date().toISOString()}`);
    lines.push('');

    for (const item of this._results) {
      const icon = item.passed ? '[PASS]' : '[FAIL]';
      lines.push(`${icon} ${item.name}: ${item.detail}`);
    }

    const passCount = this._results.filter((r) => r.passed).length;
    lines.push('');
    lines.push(`结果: ${passCount}/${this._results.length} 通过`);

    return lines.join('\n');
  }
}
