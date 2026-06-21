// ============================================================
// Phase8BootstrapEntry — Phase8 启动入口组件
// 职责：挂载到场景根节点，自动初始化 Phase8Bootstrap 和 UI
//
// 使用方式：
//   在 Cocos Creator 编辑器中将此组件拖到场景的任意节点上。
//   推荐挂在 Scene 根节点或 Canvas 节点上。
//   组件会在 start() 中自动完成所有初始化工作。
//
// 初始化顺序：
//   1. 加载所有 Phase8 配置
//   2. 初始化本地化绑定器 (Phase8LocalizationBinder)
//   3. 创建 Phase8UIManager 和所有 Panel 节点树（通过 Phase8SceneBuilder）
//   4. 绑定 Prefab 引用
//   5. 绑定动画系统 (Phase8PrefabAnimationBinder)
//   6. 验证 (Phase8Step5BuildVerifier / Phase8PrefabGenerator)
// ============================================================

import { _decorator, Component, Node, Prefab, UITransform, Label, Button, Sprite, Layout, Color, Canvas, Camera, director } from 'cc';
import { Phase8Bootstrap } from '../systems/Phase8Bootstrap';
import { Phase9Bootstrap } from '../systems/Phase9Bootstrap';
import { EventManager } from './EventManager';
import { Phase8SceneBuilder } from '../ui/Phase8SceneBuilder';
import { Phase8UIManager } from '../ui/Phase8UIManager';
import { Phase8LocalizationBinder } from '../systems/Phase8LocalizationBinder';
import { Phase8PrefabAnimationBinder } from '../systems/Phase8PrefabAnimationBinder';
import { Phase8PrefabGenerator } from '../systems/Phase8PrefabGenerator';
import { Phase8Step5BuildVerifier } from '../debug/Phase8Step5BuildVerifier';
import { DungeonItemTemplate } from '../ui/items/DungeonItemTemplate';
import { NodeMapItemTemplate } from '../ui/items/NodeMapItemTemplate';
import { ForkChoiceTemplate } from '../ui/items/ForkChoiceTemplate';
import { ArtifactItemTemplate } from '../ui/items/ArtifactItemTemplate';
import { LiveOpsCardTemplate } from '../ui/items/LiveOpsCardTemplate';
import { EventChoiceTemplate } from '../ui/items/EventChoiceTemplate';
import { RewardItemTemplate } from '../ui/items/RewardItemTemplate';

// ==================== Phase8 Item Prefab UUID 映射 ====================
// 从 assets/prefabs/items/*.prefab.meta 提取
// 用于运行时自动绑定，替代 Inspector 手动拖入

const ITEM_PREFAB_UUIDS: Record<string, string> = {
  dungeonItemPrefab: '8d80fae9-31f8-4468-891d-fe69f975eee3',    // DungeonItem.prefab
  nodeItemPrefab: 'd705a2b4-30ac-47e7-926c-866289d5eaa5',       // NodeMapItem.prefab
  forkChoicePrefab: 'b329f572-bddc-41c4-b06c-25ccd6c3d8ef',      // ForkChoiceItem.prefab
  artifactItemPrefab: '3191b70d-61b6-4c38-abcd-b88b29fa03a5',   // ArtifactItem.prefab
  activityCardPrefab: '0f96c17f-460d-47b2-8962-1ac103bb3c53',   // LiveOpsCard.prefab
  choiceButtonPrefab: 'fd351a3b-96ad-4475-b909-1ff3f3b583c7',   // EventChoiceButton.prefab
  rewardItemPrefab: '39899e28-183c-4475-b5ca-9b7fabb4fec1',     // RewardItem.prefab
};

const { ccclass, property } = _decorator;

@ccclass('Phase8BootstrapEntry')
export class Phase8BootstrapEntry extends Component {
  @property({ tooltip: 'UI 根容器节点（所有 Panel 的父节点），为空则自动查找 UIRoot' })
  uiRootNode: Node | null = null;

  @property({ tooltip: '是否自动打开地牢选择面板（测试用）' })
  autoOpenDungeonPanel = false;

  @property({ tooltip: '测试用的玩家战力值' })
  testPlayerPower = 1000;

  @property({ tooltip: '是否启用 Step5 Prefab 构建验证' })
  enableStep5Verification = true;

  @property({ tooltip: '是否启用动画绑定' })
  enableAnimationBinding = true;

  @property({ tooltip: '是否启用本地化绑定' })
  enableLocalizationBinding = true;

  private _initialized = false;
  private _animationBinder: Phase8PrefabAnimationBinder | null = null;
  private _phase9Bootstrap: Phase9Bootstrap | null = null;

  async start(): Promise<void> {
    if (this._initialized) return;

    console.log('[Phase8BootstrapEntry] START');
    console.log('[Phase8BootstrapEntry] 开始初始化 Phase8-Step5...');

    try {
      this._enforcePortraitMode();
      // Step 1: 初始化 Phase8Bootstrap
      const bootstrap = Phase8Bootstrap.getInstance();
      await bootstrap.initialize();

      // Step 1.5: 初始化 Phase9Bootstrap（Phase9 系统族统一入口）
      const phase9Bootstrap = Phase9Bootstrap.getInstance();
      await phase9Bootstrap.initialize();
      phase9Bootstrap.restoreFromSave();
      this._phase9Bootstrap = phase9Bootstrap;
      console.log('[Phase8BootstrapEntry] ✅ Phase9 系统已初始化');

      // Step 2: 初始化本地化绑定器
      if (this.enableLocalizationBinding) {
        const l10nBinder = Phase8LocalizationBinder.getInstance();
        const l10nReady = l10nBinder.initialize();
        if (l10nReady) {
          console.log('[Phase8BootstrapEntry] ✅ 本地化绑定器已就绪');
        } else {
          console.warn('[Phase8BootstrapEntry] ⚠️ 本地化绑定器初始化失败（配置可能未注册到 ConfigManager 加载列表）');
        }
      }

      // Step 3: 查找或创建 UIRoot
      if (!this.uiRootNode) {
        this.uiRootNode = this.node.getChildByName('UIRoot');
      }

      if (!this.uiRootNode) {
        // 在 Canvas 下创建 UIRoot
        const canvas = this.node.getChildByName('Canvas') ?? this.node;
        this.uiRootNode = new Node('UIRoot');
        this.uiRootNode.setParent(canvas);
        this.uiRootNode.addComponent('cc.UITransform' as any);
        console.log('[Phase8BootstrapEntry] 已创建 UIRoot 节点');
      }

      // Step 4: 通过 SceneBuilder 构建所有 Panel
      let builder = this.uiRootNode.getComponent(Phase8SceneBuilder);
      if (!builder) {
        builder = this.uiRootNode.addComponent(Phase8SceneBuilder);
      }
      builder.autoHideAfterBuild = true;

      // Step 4.5: 加载并绑定 7 个 Item Prefab 到 SceneBuilder
      // 等价于在 Inspector 中手动拖入 Prefab 绑定
      await this._loadAllBuilderPrefabs(builder);

      builder.buildAllPanels();

      // Step 5: 获取 UIManager 引用
      const uiManager = this.uiRootNode.getComponent(Phase8UIManager);
      if (!uiManager) {
        console.warn('[Phase8BootstrapEntry] ⚠️ Phase8UIManager 未找到');
      } else {
        // Step 6: 绑定动画系统到 Prefab
        if (this.enableAnimationBinding && uiManager) {
          this._animationBinder = new Phase8PrefabAnimationBinder(uiManager);
          this._animationBinder.bindAll();
          console.log('[Phase8BootstrapEntry] ✅ 动画系统已绑定到 Prefab');
        }

        // Step 7: Step5 构建验证
        if (this.enableStep5Verification) {
          this.scheduleOnce(() => {
            this._runStep5Verification(uiManager);
          }, 1.0);
        }

        // Step 8: 生成 Prefab 构建报告
        this.scheduleOnce(() => {
          if (this.uiRootNode) {
            const report = Phase8PrefabGenerator.generateStep5Report(this.uiRootNode);
            console.log(report);
          }
        }, 0.8);

        console.log('[Phase8BootstrapEntry] ✅ Phase8-Step5 全部初始化完成');

        // 可选：自动打开地牢选择面板
        if (this.autoOpenDungeonPanel) {
          this.scheduleOnce(() => {
            uiManager.openDungeonPanel(this.testPlayerPower);
          }, 0.3);
        }
      }

      this._initialized = true;
    } catch (err) {
      console.error('[Phase8BootstrapEntry] ❌ 初始化失败:', err);
    }
  }

  private _enforcePortraitMode(): void {
    const canvasNode = director.getScene()?.getChildByName('Canvas') ?? this.node.getChildByName('Canvas');
    const canvasTransform = canvasNode?.getComponent(UITransform);
    if (canvasTransform) {
      canvasTransform.setContentSize(720, 1280);
    }

    const canvas = canvasNode?.getComponent(Canvas);
    if (canvas) {
      (canvas as unknown as { alignCanvasWithScreen?: boolean; _alignCanvasWithScreen?: boolean }).alignCanvasWithScreen = false;
      (canvas as unknown as { _alignCanvasWithScreen?: boolean })._alignCanvasWithScreen = false;
    }

    const camera = canvasNode?.getChildByName('Camera')?.getComponent(Camera);
    if (camera) {
      camera.orthoHeight = 640;
    }
  }
  /** 加载所有 Item Prefab 并绑定到 SceneBuilder */
  private async _loadAllBuilderPrefabs(builder: Phase8SceneBuilder): Promise<void> {
    let loadedCount = 0;

    for (const field of Object.keys(ITEM_PREFAB_UUIDS)) {
      const prefab = this._createRuntimeItemPrefab(field);
      if (prefab) {
        (builder as Record<string, unknown>)[field] = prefab;
        loadedCount++;
      }
    }

    console.log(
      '[Phase8BootstrapEntry] Prefab runtime create done: ' + loadedCount + '/' + Object.keys(ITEM_PREFAB_UUIDS).length,
    );
  }

  private _createRuntimeItemPrefab(field: string): Prefab | null {
    switch (field) {
      case 'dungeonItemPrefab':
        return this._createDungeonItemPrefab();
      case 'nodeItemPrefab':
        return this._createNodeMapItemPrefab();
      case 'forkChoicePrefab':
        return this._createForkChoicePrefab();
      case 'artifactItemPrefab':
        return this._createArtifactItemPrefab();
      case 'activityCardPrefab':
        return this._createLiveOpsCardPrefab();
      case 'choiceButtonPrefab':
        return this._createEventChoicePrefab();
      case 'rewardItemPrefab':
        return this._createRewardItemPrefab();
      default:
        console.warn('[Phase8BootstrapEntry] Unknown prefab field: ' + field);
        return null;
    }
  }

  private _createPrefab(name: string, root: Node): Prefab {
    const prefab = new Prefab();
    prefab.name = name;
    prefab.data = root;
    return prefab;
  }

  private _node(parent: Node | null, name: string, size: [number, number], pos: [number, number] = [0, 0], active = true): Node {
    const node = new Node(name);
    if (parent) node.setParent(parent);
    node.active = active;
    node.setPosition(pos[0], pos[1], 0);
    node.addComponent(UITransform).setContentSize(size[0], size[1]);
    return node;
  }

  private _label(parent: Node, name: string, text: string, size: [number, number], pos: [number, number], fontSize: number): Label {
    const node = this._node(parent, name, size, pos);
    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = fontSize + 8;
    label.color = Color.WHITE;
    return label;
  }

  private _button(parent: Node, name: string, size: [number, number], pos: [number, number], text = ''): Button {
    const node = this._node(parent, name, size, pos);
    const button = node.addComponent(Button);
    button.transition = Button.Transition.SCALE;
    button.zoomScale = 0.95;
    if (text) this._label(node, 'Label', text, [size[0] - 16, size[1] - 12], [0, 0], 20);
    return button;
  }

  private _sprite(parent: Node, name: string, size: [number, number], pos: [number, number], color: Color): Sprite {
    const node = this._node(parent, name, size, pos);
    const sprite = node.addComponent(Sprite);
    sprite.color = color;
    return sprite;
  }

  private _layout(parent: Node, name: string, size: [number, number], pos: [number, number]): Node {
    const node = this._node(parent, name, size, pos);
    const layout = node.addComponent(Layout);
    layout.type = Layout.Type.VERTICAL;
    layout.spacingY = 8;
    return node;
  }

  private _createDungeonItemPrefab(): Prefab {
    const root = this._node(null, 'DungeonItem', [660, 120]);
    const tpl = root.addComponent(DungeonItemTemplate);
    this._sprite(root, 'Background', [660, 120], [0, 0], new Color(30, 30, 40, 255));
    tpl.nameLabel = this._label(root, 'NameLabel', 'Dungeon', [300, 36], [-280, 30], 24);
    tpl.layerLabel = this._label(root, 'LayerLabel', 'Layers', [200, 28], [-280, -10], 18);
    tpl.powerLabel = this._label(root, 'PowerLabel', 'Power', [200, 28], [80, -10], 18);
    tpl.rewardLabel = this._label(root, 'RewardLabel', 'Rewards', [200, 24], [80, 30], 16);
    tpl.enterButton = this._button(root, 'EnterButton', [80, 48], [270, 0], 'Enter');
    tpl.lockMask = this._sprite(root, 'LockMask', [660, 120], [0, 0], new Color(128, 128, 128, 180)).node;
    tpl.lockMask.active = false;
    return this._createPrefab('DungeonItem', root);
  }

  private _createNodeMapItemPrefab(): Prefab {
    const root = this._node(null, 'NodeMapItem', [640, 80]);
    const tpl = root.addComponent(NodeMapItemTemplate);
    tpl.iconLabel = this._label(root, 'Icon', 'N', [48, 48], [-280, 0], 32);
    tpl.nameLabel = this._label(root, 'NameLabel', 'Node', [300, 32], [-180, 0], 20);
    tpl.statusIndicator = this._sprite(root, 'StatusIndicator', [24, 24], [240, 0], new Color(158, 158, 158, 255)).node;
    tpl.statusSprite = tpl.statusIndicator.getComponent(Sprite);
    tpl.enterButton = this._button(root, 'EnterButton', [72, 44], [280, 0], 'Enter');
    return this._createPrefab('NodeMapItem', root);
  }

  private _createForkChoicePrefab(): Prefab {
    const root = this._node(null, 'ForkChoiceItem', [600, 70]);
    root.addComponent(Button);
    const tpl = root.addComponent(ForkChoiceTemplate);
    tpl.choiceLabel = this._label(root, 'ChoiceLabel', 'Choice', [350, 32], [-200, 0], 20);
    tpl.previewLabel = this._label(root, 'PreviewLabel', '', [200, 24], [100, 0], 16);
    tpl.typeIcon = this._label(root, 'TypeIcon', '>', [32, 32], [270, 0], 24).node;
    return this._createPrefab('ForkChoiceItem', root);
  }

  private _createArtifactItemPrefab(): Prefab {
    const root = this._node(null, 'ArtifactItem', [660, 100]);
    const tpl = root.addComponent(ArtifactItemTemplate);
    this._sprite(root, 'Background', [660, 100], [0, 0], new Color(30, 30, 40, 255));
    tpl.nameLabel = this._label(root, 'NameLabel', 'Artifact', [250, 34], [-250, 18], 22);
    tpl.rarityLabel = this._label(root, 'RarityLabel', 'SR', [150, 26], [50, 18], 16);
    tpl.levelLabel = this._label(root, 'LevelLabel', 'Lv.1', [150, 26], [-250, -18], 16);
    tpl.activeIndicator = this._sprite(root, 'ActiveIndicator', [16, 16], [260, 18], new Color(105, 240, 174, 255)).node;
    tpl.activeIndicator.active = false;
    tpl.lockedMask = this._sprite(root, 'LockedMask', [660, 100], [0, 0], new Color(80, 80, 80, 180)).node;
    tpl.lockedMask.active = false;
    tpl.activateButton = this._button(root, 'ActivateButton', [80, 40], [260, -18], 'Use');
    return this._createPrefab('ArtifactItem', root);
  }

  private _createLiveOpsCardPrefab(): Prefab {
    const root = this._node(null, 'LiveOpsCard', [660, 130]);
    const tpl = root.addComponent(LiveOpsCardTemplate);
    tpl.nameLabel = this._label(root, 'NameLabel', 'Activity', [300, 36], [-250, 40], 24);
    tpl.statusLabel = this._label(root, 'StatusLabel', 'Active', [200, 28], [150, 40], 18);
    tpl.countdownLabel = this._label(root, 'CountdownLabel', '00:00:00', [250, 28], [-250, 5], 18);
    tpl.rewardLabel = this._label(root, 'RewardLabel', 'Rewards', [300, 24], [-250, -30], 16);
    tpl.tagLabel = this._label(root, 'TagLabel', 'Limited', [100, 22], [200, 5], 14);
    tpl.enterButton = this._button(root, 'EnterButton', [90, 44], [260, -20], 'Enter');
    return this._createPrefab('LiveOpsCard', root);
  }

  private _createEventChoicePrefab(): Prefab {
    const root = this._node(null, 'EventChoiceButton', [580, 70]);
    root.addComponent(Button);
    const tpl = root.addComponent(EventChoiceTemplate);
    tpl.textLabel = this._label(root, 'TextLabel', 'Choice', [500, 32], [0, 8], 20);
    tpl.previewLabel = this._label(root, 'PreviewLabel', 'Preview', [400, 24], [0, -18], 16);
    tpl.riskIndicator = this._label(root, 'RiskIndicator', '!', [24, 24], [260, 0], 20).node;
    tpl.riskIndicator.active = false;
    return this._createPrefab('EventChoiceButton', root);
  }

  private _createRewardItemPrefab(): Prefab {
    const root = this._node(null, 'RewardItem', [180, 80]);
    const tpl = root.addComponent(RewardItemTemplate);
    tpl.iconLabel = this._label(root, 'Icon', '*', [40, 40], [0, 15], 28);
    tpl.nameLabel = this._label(root, 'NameLabel', 'Reward', [160, 28], [0, -15], 18);
    tpl.qtyLabel = this._label(root, 'QtyLabel', 'x1', [80, 28], [0, -40], 18);
    return this._createPrefab('RewardItem', root);
  }

  private _runStep5Verification(uiManager: Phase8UIManager): void {
    // 查找或创建 BuildVerifier
    let verifier = this.node.getComponent(Phase8Step5BuildVerifier);
    if (!verifier) {
      verifier = this.node.addComponent(Phase8Step5BuildVerifier);
    }
    verifier.uiManager = uiManager;
    verifier.sceneBuilder = this.uiRootNode?.getComponent(Phase8SceneBuilder) ?? null;
    verifier.runAllChecks();

    // 同时打印绑定引用清单
    const checklist = Phase8PrefabGenerator.generateBindingChecklist();
    console.log(checklist);
  }

  /** 获取动画绑定器 */
  getAnimationBinder(): Phase8PrefabAnimationBinder | null {
    return this._animationBinder;
  }

  onDestroy(): void {
    if (this._animationBinder) {
      this._animationBinder.unbindAll();
    }
    if (this._phase9Bootstrap) {
      this._phase9Bootstrap.destroy();
      this._phase9Bootstrap = null;
      console.log('[Phase8BootstrapEntry] ✅ Phase9 系统已销毁');
    }
  }
}
