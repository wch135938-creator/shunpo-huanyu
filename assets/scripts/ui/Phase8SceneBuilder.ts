// ============================================================
// Phase8SceneBuilder — Phase8 UI 场景构建器
// 职责：程序化创建所有 Panel 的节点层级结构，绑定 Label/Button/Sprite 子节点
//
// 使用方式（Cocos Creator 编辑器中）：
//   1. 创建空场景，添加 Canvas(720×1280) + Camera(orthoHeight=640)
//   2. 在 Canvas 下创建空节点 "UIRoot"
//   3. 将本组件挂载到 UIRoot 节点上
//   4. 运行场景或调用 buildAllPanels() 一键构建所有 Panel 节点树
//
// 构建完成后，可在编辑器中选中任意 Panel 节点 → 右键 → 创建 Prefab
//
// 规范：所有节点命名与 Panel 脚本中 getChildByName() 一致
// ============================================================

import { _decorator, Component, Node, Label, Button, Sprite, UITransform, Color, Layout, Widget, Prefab } from 'cc';
import { DungeonPanel } from './DungeonPanel';
import { DungeonNodeMapPanel } from './DungeonNodeMapPanel';
import { RoguelikeHUD } from './RoguelikeHUD';
import { ArtifactPanel } from './ArtifactPanel';
import { LiveOpsPanel } from './LiveOpsPanel';
import { EventPanel } from './EventPanel';
import { ResultPanel } from './ResultPanel';
import { Phase8UIManager } from './Phase8UIManager';

const { ccclass, property } = _decorator;

/** 子节点构建辅助 */
interface ChildSpec {
  name: string;
  components?: string[]; // 要附加的组件类型：'Label' | 'Button' | 'Sprite' | 'Layout' | 'Widget'
  children?: ChildSpec[];
  /** 初始激活状态（默认 true） */
  active?: boolean;
  /** 位置 (x, y)，默认 (0, 0) */
  pos?: [number, number];
  /** 尺寸 (w, h)，默认根据组件类型自动设置 */
  size?: [number, number];
  /** 初始文本（Label 组件） */
  text?: string;
  /** 字体大小 */
  fontSize?: number;
  /** 颜色 (r, g, b, a) */
  color?: [number, number, number, number];
}

@ccclass('Phase8SceneBuilder')
export class Phase8SceneBuilder extends Component {
  @property({ tooltip: '构建完成后是否自动隐藏所有面板' })
  autoHideAfterBuild = true;

  @property({ tooltip: '是否在 start() 中自动构建' })
  autoBuild = true;

  @property({ type: Prefab, tooltip: 'DungeonPanel item prefab' })
  dungeonItemPrefab: Prefab | null = null;

  @property({ type: Prefab, tooltip: 'DungeonNodeMapPanel node item prefab' })
  nodeItemPrefab: Prefab | null = null;

  @property({ type: Prefab, tooltip: 'DungeonNodeMapPanel fork choice prefab' })
  forkChoicePrefab: Prefab | null = null;

  @property({ type: Prefab, tooltip: 'ArtifactPanel item prefab' })
  artifactItemPrefab: Prefab | null = null;

  @property({ type: Prefab, tooltip: 'LiveOpsPanel card prefab' })
  activityCardPrefab: Prefab | null = null;

  @property({ type: Prefab, tooltip: 'EventPanel choice button prefab' })
  choiceButtonPrefab: Prefab | null = null;

  @property({ type: Prefab, tooltip: 'ResultPanel reward item prefab' })
  rewardItemPrefab: Prefab | null = null;

  private _built = false;

  start(): void {
    if (this.autoBuild && !this._built) {
      this.buildAllPanels();
    }
  }

  /** 一键构建所有 7 个 Panel 节点树 */
  buildAllPanels(): void {
    if (this._built) {
      console.warn('[Phase8SceneBuilder] 已构建过，跳过。如需重建请先调用 clearAllPanels()');
      return;
    }

    console.log('[Phase8SceneBuilder] BUILD');
    console.log('[Phase8SceneBuilder] 开始构建 Phase8 UI 节点树...');

    this.buildDungeonPanel();
    this.buildDungeonNodeMapPanel();
    this.buildRoguelikeHUD();
    this.buildArtifactPanel();
    this.buildLiveOpsPanel();
    this.buildEventPanel();
    this.buildResultPanel();

    this._bindPanelComponents();

    // 附加 Phase8UIManager 到根节点
    this._attachUIManager();

    if (this.autoHideAfterBuild) {
      this._hideAllPanels();
    }

    this._built = true;
    console.log('[Phase8SceneBuilder] ✅ 所有 Panel 节点树构建完成');
  }

  /** 清除所有已构建的面板 */
  clearAllPanels(): void {
    const panelNames = [
      'DungeonPanel', 'DungeonNodeMapPanel', 'RoguelikeHUD',
      'ArtifactPanel', 'LiveOpsPanel', 'EventPanel', 'ResultPanel',
    ];
    for (const name of panelNames) {
      const child = this.node.getChildByName(name);
      if (child) {
        child.destroy();
      }
    }
    this._built = false;
    console.log('[Phase8SceneBuilder] 已清除所有面板节点');
  }

  // ==================== 各个 Panel 构建方法 ====================

  /** 构建 DungeonPanel */
  buildDungeonPanel(): void {
    const root = this._createPanelRoot('DungeonPanel');

    const spec: ChildSpec = {
      name: 'PanelRoot',
      components: [],
      children: [
        { name: 'TitleLabel', components: ['Label'], text: '选择地牢', fontSize: 36, pos: [0, 280], size: [600, 60], color: [255, 215, 0, 255] },
        { name: 'PowerLabel', components: ['Label'], text: '战力: 0', fontSize: 24, pos: [0, 230], size: [400, 40], color: [255, 255, 255, 255] },
        { name: 'ContentNode', components: ['Layout'], pos: [0, 0], size: [680, 400] },
        { name: 'EmptyHintLabel', components: ['Label'], text: '暂无可用的地牢', fontSize: 22, pos: [0, -240], size: [600, 40], color: [158, 158, 158, 255] },
        { name: 'CloseButton', components: ['Button', 'Label'], text: '✕', fontSize: 28, pos: [310, 310], size: [60, 60], color: [255, 255, 255, 255] },
      ],
      pos: [0, 0],
      size: [720, 700],
    };

    this._buildNodeTree(root, spec);
  }

  /** 构建 DungeonNodeMapPanel */
  buildDungeonNodeMapPanel(): void {
    const root = this._createPanelRoot('DungeonNodeMapPanel');

    // ForkPanel 子结构
    const forkSpec: ChildSpec = {
      name: 'ForkPanel',
      active: false,
      components: [],
      children: [
        { name: 'ForkTitleLabel', components: ['Label'], text: '选择前进方向', fontSize: 28, pos: [0, 80], size: [500, 50], color: [255, 215, 0, 255] },
        { name: 'ForkChoiceContainer', components: ['Layout'], pos: [0, 0], size: [600, 160] },
      ],
      pos: [0, -200],
      size: [680, 200],
    };

    const spec: ChildSpec = {
      name: 'PanelRoot',
      components: [],
      children: [
        { name: 'LayerTitleLabel', components: ['Label'], text: '第 1 层', fontSize: 32, pos: [0, 300], size: [500, 50], color: [255, 215, 0, 255] },
        { name: 'NodeListContainer', components: ['Layout'], pos: [0, 40], size: [680, 400] },
        { name: 'InfoLabel', components: ['Label'], text: '', fontSize: 18, pos: [0, -280], size: [600, 30], color: [158, 158, 158, 255] },
        { name: 'CloseButton', components: ['Button', 'Label'], text: '✕', fontSize: 28, pos: [310, 310], size: [60, 60], color: [255, 255, 255, 255] },
      ],
      pos: [0, 0],
      size: [720, 700],
    };

    this._buildNodeTree(root, spec);

    // 添加 ForkPanel 到 PanelRoot
    const panelRoot = root.getChildByName('PanelRoot');
    if (panelRoot) {
      this._buildNodeTree(panelRoot, forkSpec);
    }
  }

  /** 构建 RoguelikeHUD */
  buildRoguelikeHUD(): void {
    const root = this._createPanelRoot('RoguelikeHUD');

    const spec: ChildSpec = {
      name: 'PanelRoot',
      components: [],
      children: [
        { name: 'DungeonNameLabel', components: ['Label'], text: '地牢名称', fontSize: 22, pos: [-200, 600], size: [300, 36], color: [255, 215, 0, 255] },
        { name: 'FloorLabel', components: ['Label'], text: '1 / 3', fontSize: 22, pos: [200, 600], size: [200, 36], color: [255, 255, 255, 255] },
        { name: 'ProgressFill', components: ['Sprite'], pos: [-200, 570], size: [300, 16], color: [105, 240, 174, 255] },
        { name: 'ProgressLabel', components: ['Label'], text: '0%', fontSize: 16, pos: [40, 570], size: [80, 20], color: [255, 255, 255, 255] },
        { name: 'GoldLabel', components: ['Label'], text: '💰 0', fontSize: 20, pos: [-260, 540], size: [200, 32], color: [255, 215, 0, 255] },
        { name: 'ExpLabel', components: ['Label'], text: '✨ 0', fontSize: 20, pos: [0, 540], size: [200, 32], color: [179, 136, 255, 255] },
        { name: 'SeedLabel', components: ['Label'], text: '种子: ---', fontSize: 14, pos: [-260, 510], size: [250, 22], color: [158, 158, 158, 255] },
        { name: 'PauseButton', components: ['Button', 'Label'], text: '⏸', fontSize: 28, pos: [310, 600], size: [56, 56], color: [255, 255, 255, 255] },
      ],
      pos: [0, 540],
      size: [720, 160],
    };

    this._buildNodeTree(root, spec);
  }

  /** 构建 ArtifactPanel */
  buildArtifactPanel(): void {
    const root = this._createPanelRoot('ArtifactPanel');

    const tooltipSpec: ChildSpec = {
      name: 'TooltipNode',
      active: false,
      components: ['Sprite'],
      children: [
        { name: 'TooltipNameLabel', components: ['Label'], text: '', fontSize: 24, pos: [0, 40], size: [280, 36], color: [255, 215, 0, 255] },
        { name: 'TooltipEffectLabel', components: ['Label'], text: '', fontSize: 18, pos: [0, -10], size: [280, 80], color: [255, 255, 255, 255] },
        { name: 'TooltipLevelLabel', components: ['Label'], text: '', fontSize: 16, pos: [0, -60], size: [280, 24], color: [158, 158, 158, 255] },
      ],
      pos: [200, 0],
      size: [300, 140],
      color: [40, 40, 40, 230],
    };

    const spec: ChildSpec = {
      name: 'PanelRoot',
      components: [],
      children: [
        { name: 'TitleLabel', components: ['Label'], text: '神器', fontSize: 32, pos: [0, 300], size: [300, 50], color: [255, 215, 0, 255] },
        { name: 'ActiveArtifactLabel', components: ['Label'], text: '未激活任何神器', fontSize: 20, pos: [0, 250], size: [500, 32], color: [105, 240, 174, 255] },
        { name: 'ArtifactListContainer', components: ['Layout'], pos: [0, 20], size: [680, 380] },
        { name: 'EmptyHintLabel', components: ['Label'], text: '尚未获得任何神器', fontSize: 22, pos: [0, -240], size: [600, 40], color: [158, 158, 158, 255] },
        { name: 'CloseButton', components: ['Button', 'Label'], text: '✕', fontSize: 28, pos: [310, 310], size: [60, 60], color: [255, 255, 255, 255] },
      ],
      pos: [0, 0],
      size: [720, 700],
    };

    this._buildNodeTree(root, spec);

    const panelRoot = root.getChildByName('PanelRoot');
    if (panelRoot) {
      this._buildNodeTree(panelRoot, tooltipSpec);
    }
  }

  /** 构建 LiveOpsPanel */
  buildLiveOpsPanel(): void {
    const root = this._createPanelRoot('LiveOpsPanel');

    const spec: ChildSpec = {
      name: 'PanelRoot',
      components: [],
      children: [
        { name: 'TitleLabel', components: ['Label'], text: '限时活动', fontSize: 32, pos: [0, 300], size: [300, 50], color: [255, 215, 0, 255] },
        { name: 'LastRefreshLabel', components: ['Label'], text: '', fontSize: 16, pos: [0, 255], size: [400, 24], color: [158, 158, 158, 255] },
        { name: 'CardListContainer', components: ['Layout'], pos: [0, 20], size: [680, 400] },
        { name: 'EmptyHintLabel', components: ['Label'], text: '暂无限时活动', fontSize: 22, pos: [0, -240], size: [600, 40], color: [158, 158, 158, 255] },
        { name: 'CloseButton', components: ['Button', 'Label'], text: '✕', fontSize: 28, pos: [310, 310], size: [60, 60], color: [255, 255, 255, 255] },
      ],
      pos: [0, 0],
      size: [720, 700],
    };

    this._buildNodeTree(root, spec);
  }

  /** 构建 EventPanel */
  buildEventPanel(): void {
    const root = this._createPanelRoot('EventPanel');

    const resultSpec: ChildSpec = {
      name: 'ResultPanel',
      active: false,
      components: [],
      children: [
        { name: 'ResultTextLabel', components: ['Label'], text: '', fontSize: 22, pos: [0, 0], size: [400, 200], color: [255, 255, 255, 255] },
      ],
      pos: [0, 0],
      size: [500, 300],
    };

    const spec: ChildSpec = {
      name: 'PanelRoot',
      components: [],
      children: [
        { name: 'TitleLabel', components: ['Label'], text: '', fontSize: 28, pos: [0, 280], size: [600, 44], color: [255, 215, 0, 255] },
        { name: 'CategoryLabel', components: ['Label'], text: '', fontSize: 20, pos: [0, 235], size: [300, 32], color: [158, 158, 158, 255] },
        { name: 'DescriptionLabel', components: ['Label'], text: '', fontSize: 20, pos: [0, 160], size: [600, 120], color: [255, 255, 255, 255] },
        { name: 'RewardPreviewLabel', components: ['Label'], text: '', fontSize: 18, pos: [0, 80], size: [500, 32], color: [105, 240, 174, 255] },
        { name: 'ChoiceContainer', components: ['Layout'], pos: [0, -20], size: [600, 180] },
        { name: 'SkipButton', components: ['Button', 'Label'], text: '跳过', fontSize: 22, pos: [0, -240], size: [160, 50], color: [158, 158, 158, 255] },
      ],
      pos: [0, 0],
      size: [720, 700],
    };

    this._buildNodeTree(root, spec);

    // ConfirmButton (单独添加)
    const panelRoot = root.getChildByName('PanelRoot');
    if (panelRoot) {
      this._buildSingleNode(panelRoot, {
        name: 'ConfirmButton', components: ['Button', 'Label'], text: '确认', fontSize: 22, pos: [0, -240], size: [160, 50], color: [105, 240, 174, 255],
      });
      this._buildNodeTree(panelRoot, resultSpec);
    }
  }

  /** 构建 ResultPanel */
  buildResultPanel(): void {
    const root = this._createPanelRoot('ResultPanel');

    const spec: ChildSpec = {
      name: 'PanelRoot',
      components: [],
      children: [
        { name: 'TitleLabel', components: ['Label'], text: '✨ 结算 ✨', fontSize: 36, pos: [0, 280], size: [500, 56], color: [255, 215, 0, 255] },
        { name: 'SubtitleLabel', components: ['Label'], text: '', fontSize: 22, pos: [0, 220], size: [500, 36], color: [255, 255, 255, 255] },
        { name: 'RewardContainer', components: ['Layout'], pos: [0, 40], size: [680, 250] },
        { name: 'ExpGainLabel', components: ['Label'], text: '经验 +0', fontSize: 22, pos: [-150, -160], size: [250, 32], color: [179, 136, 255, 255] },
        { name: 'GoldGainLabel', components: ['Label'], text: '金币 +0', fontSize: 22, pos: [150, -160], size: [250, 32], color: [255, 215, 0, 255] },
        { name: 'DurationLabel', components: ['Label'], text: '', fontSize: 16, pos: [0, -200], size: [300, 24], color: [158, 158, 158, 255] },
        { name: 'ContinueButton', components: ['Button'], active: false, pos: [100, -280], size: [180, 56] },
        { name: 'ReturnButton', components: ['Button', 'Label'], text: '返回', fontSize: 24, pos: [-100, -280], size: [180, 56], color: [255, 255, 255, 255] },
      ],
      pos: [0, 0],
      size: [720, 700],
    };

    this._buildNodeTree(root, spec);

    // ContinueButton 的文本子标签
    const panelRoot = root.getChildByName('PanelRoot');
    const continueBtn = panelRoot?.getChildByName('ContinueButton');
    if (continueBtn) {
      this._buildSingleNode(continueBtn, {
        name: 'ContinueButtonLabel', components: ['Label'], text: '继续', fontSize: 24, pos: [0, 0], size: [160, 40], color: [255, 255, 255, 255],
      });
    }
  }

  // ==================== 私有构建辅助 ====================

  /** 创建面板根节点（初始隐藏） */
  private _createPanelRoot(panelName: string): Node {
    const node = new Node(panelName);
    node.setParent(this.node);
    node.active = false;

    // 添加 UITransform
    const uiTransform = node.addComponent(UITransform);
    uiTransform.setContentSize(720, 1280);
    uiTransform.setAnchorPoint(0.5, 0.5);

    // 添加 Widget 全屏拉伸
    const widget = node.addComponent(Widget);
    widget.alignMode = 2;
    widget.isAlignLeft = true;
    widget.isAlignRight = true;
    widget.isAlignTop = true;
    widget.isAlignBottom = true;
    widget.left = 0;
    widget.right = 0;
    widget.top = 0;
    widget.bottom = 0;

    return node;
  }

  /** 递归构建节点树 */
  private _buildNodeTree(parent: Node, spec: ChildSpec): Node {
    const node = this._buildSingleNode(parent, spec);

    if (spec.children) {
      for (const childSpec of spec.children) {
        this._buildNodeTree(node, childSpec);
      }
    }

    return node;
  }

  /** 构建单个节点 */
  private _buildSingleNode(parent: Node, spec: ChildSpec): Node {
    const node = new Node(spec.name);
    node.setParent(parent);

    if (spec.active !== undefined) {
      node.active = spec.active;
    }

    // UITransform
    const [w, h] = spec.size ?? [100, 40];
    const uiTransform = node.addComponent(UITransform);
    uiTransform.setContentSize(w, h);
    uiTransform.setAnchorPoint(0.5, 0.5);

    // 位置
    if (spec.pos) {
      node.setPosition(spec.pos[0], spec.pos[1], 0);
    }

    // 组件
    if (spec.components) {
      for (const comp of spec.components) {
        switch (comp) {
          case 'Label': {
            const label = node.addComponent(Label);
            if (spec.text !== undefined) label.string = spec.text;
            if (spec.fontSize) label.fontSize = spec.fontSize;
            if (spec.color) {
              label.color = new Color(spec.color[0], spec.color[1], spec.color[2], spec.color[3]);
            }
            label.lineHeight = spec.fontSize ? spec.fontSize + 8 : 28;
            break;
          }
          case 'Button': {
            const btn = node.addComponent(Button);
            btn.transition = Button.Transition.SCALE;
            btn.zoomScale = 0.95;
            // 如果有 Label 子组件，设为默认交互效果会被处理
            break;
          }
          case 'Sprite': {
            const sprite = node.addComponent(Sprite);
            if (spec.color) {
              sprite.color = new Color(spec.color[0], spec.color[1], spec.color[2], spec.color[3]);
            }
            break;
          }
          case 'Layout': {
            const layout = node.addComponent(Layout);
            layout.type = Layout.Type.VERTICAL;
            layout.spacingY = 8;
            layout.paddingLeft = 20;
            layout.paddingRight = 20;
            layout.paddingTop = 10;
            layout.paddingBottom = 10;
            break;
          }
          case 'Widget': {
            node.addComponent(Widget);
            break;
          }
        }
      }
    }

    return node;
  }

  private _find(root: Node | null, path: string): Node | null {
    if (!root) return null;
    return path.split('/').reduce<Node | null>((node, name) => {
      return node?.getChildByName(name) ?? null;
    }, root);
  }

  private _label(root: Node | null, path: string): Label | null {
    return this._find(root, path)?.getComponent(Label) ?? null;
  }

  private _button(root: Node | null, path: string): Button | null {
    return this._find(root, path)?.getComponent(Button) ?? null;
  }

  private _sprite(root: Node | null, path: string): Sprite | null {
    return this._find(root, path)?.getComponent(Sprite) ?? null;
  }

  private _getOrAdd<T extends Component>(
    node: Node | null,
    componentClass: new (...args: any[]) => T,
  ): T | null {
    if (!node) return null;
    return node.getComponent(componentClass) ?? node.addComponent(componentClass);
  }

  private _bindPanelComponents(): void {
    const dungeonNode = this.node.getChildByName('DungeonPanel');
    const dungeon = this._getOrAdd(dungeonNode, DungeonPanel);
    if (dungeon) {
      dungeon.panelRoot = this._find(dungeonNode, 'PanelRoot');
      dungeon.contentNode = this._find(dungeonNode, 'PanelRoot/ContentNode');
      dungeon.dungeonItemPrefab = this.dungeonItemPrefab;
      dungeon.titleLabel = this._label(dungeonNode, 'PanelRoot/TitleLabel');
      dungeon.closeButton = this._button(dungeonNode, 'PanelRoot/CloseButton');
      dungeon.powerLabel = this._label(dungeonNode, 'PanelRoot/PowerLabel');
      dungeon.emptyHintLabel = this._label(dungeonNode, 'PanelRoot/EmptyHintLabel');
    }

    const mapNode = this.node.getChildByName('DungeonNodeMapPanel');
    const map = this._getOrAdd(mapNode, DungeonNodeMapPanel);
    if (map) {
      map.panelRoot = this._find(mapNode, 'PanelRoot');
      map.layerTitleLabel = this._label(mapNode, 'PanelRoot/LayerTitleLabel');
      map.nodeListContainer = this._find(mapNode, 'PanelRoot/NodeListContainer');
      map.nodeItemPrefab = this.nodeItemPrefab;
      map.forkPanel = this._find(mapNode, 'PanelRoot/ForkPanel');
      map.forkTitleLabel = this._label(mapNode, 'PanelRoot/ForkPanel/ForkTitleLabel');
      map.forkChoiceContainer = this._find(mapNode, 'PanelRoot/ForkPanel/ForkChoiceContainer');
      map.forkChoicePrefab = this.forkChoicePrefab;
      map.closeButton = this._button(mapNode, 'PanelRoot/CloseButton');
      map.infoLabel = this._label(mapNode, 'PanelRoot/InfoLabel');
    }

    const hudNode = this.node.getChildByName('RoguelikeHUD');
    const hud = this._getOrAdd(hudNode, RoguelikeHUD);
    if (hud) {
      hud.panelRoot = this._find(hudNode, 'PanelRoot');
      hud.floorLabel = this._label(hudNode, 'PanelRoot/FloorLabel');
      hud.progressFill = this._sprite(hudNode, 'PanelRoot/ProgressFill');
      hud.progressLabel = this._label(hudNode, 'PanelRoot/ProgressLabel');
      hud.goldLabel = this._label(hudNode, 'PanelRoot/GoldLabel');
      hud.expLabel = this._label(hudNode, 'PanelRoot/ExpLabel');
      hud.seedLabel = this._label(hudNode, 'PanelRoot/SeedLabel');
      hud.dungeonNameLabel = this._label(hudNode, 'PanelRoot/DungeonNameLabel');
      hud.pauseButton = this._button(hudNode, 'PanelRoot/PauseButton');
    }

    const artifactNode = this.node.getChildByName('ArtifactPanel');
    const artifact = this._getOrAdd(artifactNode, ArtifactPanel);
    if (artifact) {
      artifact.panelRoot = this._find(artifactNode, 'PanelRoot');
      artifact.titleLabel = this._label(artifactNode, 'PanelRoot/TitleLabel');
      artifact.artifactListContainer = this._find(artifactNode, 'PanelRoot/ArtifactListContainer');
      artifact.artifactItemPrefab = this.artifactItemPrefab;
      artifact.tooltipNode = this._find(artifactNode, 'PanelRoot/TooltipNode');
      artifact.tooltipNameLabel = this._label(artifactNode, 'PanelRoot/TooltipNode/TooltipNameLabel');
      artifact.tooltipEffectLabel = this._label(artifactNode, 'PanelRoot/TooltipNode/TooltipEffectLabel');
      artifact.tooltipLevelLabel = this._label(artifactNode, 'PanelRoot/TooltipNode/TooltipLevelLabel');
      artifact.closeButton = this._button(artifactNode, 'PanelRoot/CloseButton');
      artifact.activeArtifactLabel = this._label(artifactNode, 'PanelRoot/ActiveArtifactLabel');
      artifact.emptyHintLabel = this._label(artifactNode, 'PanelRoot/EmptyHintLabel');
    }

    const liveOpsNode = this.node.getChildByName('LiveOpsPanel');
    const liveOps = this._getOrAdd(liveOpsNode, LiveOpsPanel);
    if (liveOps) {
      liveOps.panelRoot = this._find(liveOpsNode, 'PanelRoot');
      liveOps.titleLabel = this._label(liveOpsNode, 'PanelRoot/TitleLabel');
      liveOps.cardListContainer = this._find(liveOpsNode, 'PanelRoot/CardListContainer');
      liveOps.activityCardPrefab = this.activityCardPrefab;
      liveOps.closeButton = this._button(liveOpsNode, 'PanelRoot/CloseButton');
      liveOps.emptyHintLabel = this._label(liveOpsNode, 'PanelRoot/EmptyHintLabel');
      liveOps.lastRefreshLabel = this._label(liveOpsNode, 'PanelRoot/LastRefreshLabel');
    }

    const eventNode = this.node.getChildByName('EventPanel');
    const eventPanel = this._getOrAdd(eventNode, EventPanel);
    if (eventPanel) {
      eventPanel.panelRoot = this._find(eventNode, 'PanelRoot');
      eventPanel.titleLabel = this._label(eventNode, 'PanelRoot/TitleLabel');
      eventPanel.descriptionLabel = this._label(eventNode, 'PanelRoot/DescriptionLabel');
      eventPanel.categoryLabel = this._label(eventNode, 'PanelRoot/CategoryLabel');
      eventPanel.choiceContainer = this._find(eventNode, 'PanelRoot/ChoiceContainer');
      eventPanel.choiceButtonPrefab = this.choiceButtonPrefab;
      eventPanel.rewardPreviewLabel = this._label(eventNode, 'PanelRoot/RewardPreviewLabel');
      eventPanel.skipButton = this._button(eventNode, 'PanelRoot/SkipButton');
      eventPanel.resultPanel = this._find(eventNode, 'PanelRoot/ResultPanel');
      eventPanel.resultTextLabel = this._label(eventNode, 'PanelRoot/ResultPanel/ResultTextLabel');
      eventPanel.confirmButton = this._button(eventNode, 'PanelRoot/ConfirmButton');
    }

    const resultNode = this.node.getChildByName('ResultPanel');
    const result = this._getOrAdd(resultNode, ResultPanel);
    if (result) {
      result.panelRoot = this._find(resultNode, 'PanelRoot');
      result.titleLabel = this._label(resultNode, 'PanelRoot/TitleLabel');
      result.subtitleLabel = this._label(resultNode, 'PanelRoot/SubtitleLabel');
      result.rewardContainer = this._find(resultNode, 'PanelRoot/RewardContainer');
      result.rewardItemPrefab = this.rewardItemPrefab;
      result.expGainLabel = this._label(resultNode, 'PanelRoot/ExpGainLabel');
      result.goldGainLabel = this._label(resultNode, 'PanelRoot/GoldGainLabel');
      result.durationLabel = this._label(resultNode, 'PanelRoot/DurationLabel');
      result.continueButton = this._button(resultNode, 'PanelRoot/ContinueButton');
      result.returnButton = this._button(resultNode, 'PanelRoot/ReturnButton');
      result.continueButtonLabel = this._label(resultNode, 'PanelRoot/ContinueButton/ContinueButtonLabel');
    }
  }

  /** 附加 Phase8UIManager 到根节点 */
  private _attachUIManager(): void {
    let uiMgr = this.node.getComponent(Phase8UIManager);
    if (!uiMgr) {
      uiMgr = this.node.addComponent(Phase8UIManager);
    }

    // 自动绑定各 Panel 引用
    uiMgr.dungeonPanel = this.node.getChildByName('DungeonPanel')?.getComponent(DungeonPanel) ?? null;
    uiMgr.nodeMapPanel = this.node.getChildByName('DungeonNodeMapPanel')?.getComponent(DungeonNodeMapPanel) ?? null;
    uiMgr.roguelikeHUD = this.node.getChildByName('RoguelikeHUD')?.getComponent(RoguelikeHUD) ?? null;
    uiMgr.artifactPanel = this.node.getChildByName('ArtifactPanel')?.getComponent(ArtifactPanel) ?? null;
    uiMgr.liveOpsPanel = this.node.getChildByName('LiveOpsPanel')?.getComponent(LiveOpsPanel) ?? null;
    uiMgr.eventPanel = this.node.getChildByName('EventPanel')?.getComponent(EventPanel) ?? null;
    uiMgr.resultPanel = this.node.getChildByName('ResultPanel')?.getComponent(ResultPanel) ?? null;
    uiMgr.panelContainer = this.node;

    console.log('[Phase8SceneBuilder] UIManager panel refs', {
      dungeonPanel: !!uiMgr.dungeonPanel,
      nodeMapPanel: !!uiMgr.nodeMapPanel,
      roguelikeHUD: !!uiMgr.roguelikeHUD,
      artifactPanel: !!uiMgr.artifactPanel,
      liveOpsPanel: !!uiMgr.liveOpsPanel,
      eventPanel: !!uiMgr.eventPanel,
      resultPanel: !!uiMgr.resultPanel,
    });
    console.log('[Phase8SceneBuilder] Phase8UIManager 已绑定');
  }

  /** 隐藏所有面板 */
  private _hideAllPanels(): void {
    const names = [
      'DungeonPanel', 'DungeonNodeMapPanel', 'RoguelikeHUD',
      'ArtifactPanel', 'LiveOpsPanel', 'EventPanel', 'ResultPanel',
    ];
    for (const name of names) {
      const child = this.node.getChildByName(name);
      if (child) child.active = false;
    }
  }
}
