// ============================================================
// ArtifactPanel — Phase8 神器管理面板
// 职责：展示所有神器列表 / 激活切换 / 等级显示 / Tooltip
// 规范：继承 BasePanel / 纯 UI / 通过 Phase8Bootstrap 获取系统引用
// ============================================================

import { _decorator, Node, Label, Button, Prefab, instantiate, Color, Sprite } from 'cc';
import { BasePanel } from '../core/BasePanel';
import { EventManager } from '../core/EventManager';
import { Phase8Bootstrap } from '../systems/Phase8Bootstrap';
import { ArtifactSystem } from '../systems/ArtifactSystem';
import type { ArtifactConfig, ArtifactState } from '../data/artifact_types';
import type { ArtifactUIEntry } from '../data/phase8_ui_types';
import { RARITY_COLOR_MAP, RARITY_FRAME_MAP } from '../data/phase8_ui_types';

const { ccclass, property } = _decorator;

@ccclass('ArtifactPanel')
export class ArtifactPanel extends BasePanel {
  // ==================== 编辑器绑定 ====================

  @property({ type: Node, tooltip: '面板根节点' })
  panelRoot: Node | null = null;

  @property({ type: Label, tooltip: '标题标签' })
  titleLabel: Label | null = null;

  @property({ type: Node, tooltip: '神器列表容器' })
  artifactListContainer: Node | null = null;

  @property({ type: Prefab, tooltip: '神器列表项 Prefab' })
  artifactItemPrefab: Prefab | null = null;

  @property({ type: Node, tooltip: 'Tooltip 节点' })
  tooltipNode: Node | null = null;

  @property({ type: Label, tooltip: 'Tooltip 名称' })
  tooltipNameLabel: Label | null = null;

  @property({ type: Label, tooltip: 'Tooltip 效果描述' })
  tooltipEffectLabel: Label | null = null;

  @property({ type: Label, tooltip: 'Tooltip 等级' })
  tooltipLevelLabel: Label | null = null;

  @property({ type: Button, tooltip: '关闭按钮' })
  closeButton: Button | null = null;

  @property({ type: Label, tooltip: '已激活神器标签' })
  activeArtifactLabel: Label | null = null;

  @property({ type: Label, tooltip: '空状态提示' })
  emptyHintLabel: Label | null = null;

  // ==================== 内部状态 ====================

  private _artifactSystem: ArtifactSystem | null = null;
  private _configs: ArtifactConfig[] = [];
  private _entries: ArtifactUIEntry[] = [];

  // ==================== BasePanel 生命周期 ====================

  protected registerEvents(): void {
    const em = EventManager.getInstance();
    // 神器变更事件
    em.on('artifact:unlocked', this._onArtifactChanged, this);
    em.on('artifact:levelChanged', this._onArtifactChanged, this);
    em.on('artifact:activated', this._onArtifactChanged, this);
    // Phase8-Step4: 神器奖励事件 → 自动刷新
    em.on('artifact:rewarded', this._onArtifactChanged, this);
  }

  protected unregisterEvents(): void {
    const em = EventManager.getInstance();
    em.off('artifact:unlocked', this._onArtifactChanged, this);
    em.off('artifact:levelChanged', this._onArtifactChanged, this);
    em.off('artifact:activated', this._onArtifactChanged, this);
    em.off('artifact:rewarded', this._onArtifactChanged, this);
  }

  // ==================== 公开方法 ====================

  /** 打开神器面板 */
  open(): void {
    const bootstrap = Phase8Bootstrap.getInstance();
    if (!bootstrap.isReady()) return;

    this._artifactSystem = bootstrap.getArtifactSystem();
    this._configs = bootstrap.getArtifactConfigs();

    this._buildEntries();
    this._renderArtifactList();
    this._refreshActiveDisplay();

    if (this.titleLabel) {
      this.titleLabel.string = '神器';
    }

    this._hideTooltip();
    this.show();
  }

  // ==================== 内部：构建列表 ====================

  private _buildEntries(): void {
    const states = this._artifactSystem?.getAllArtifacts() ?? [];
    const activeId = this._artifactSystem?.getActiveArtifact()?.artifactId ?? null;
    const entries: ArtifactUIEntry[] = [];

    for (const config of this._configs) {
      const state = states.find((s) => s.artifactId === config.id);
      const isActive = config.id === activeId;

      entries.push({
        artifactId: config.id,
        nameKey: config.nameKey,
        rarity: config.rarity,
        level: state?.level ?? 0,
        isActive,
        effectKeys: config.effectRefs,
        rarityColor: RARITY_COLOR_MAP[config.rarity] ?? '#9E9E9E',
        framePath: RARITY_FRAME_MAP[config.rarity] ?? 'textures/frames/frame_common',
      });
    }

    // 排序：已激活 > 已解锁 > 未解锁，稀有度高优先
    entries.sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      if ((a.level > 0) !== (b.level > 0)) return a.level > 0 ? -1 : 1;
      const rarityOrder = { legendary: 0, epic: 1, rare: 2, common: 3 };
      return (rarityOrder[a.rarity] ?? 2) - (rarityOrder[b.rarity] ?? 2);
    });

    this._entries = entries;
  }

  // ==================== 内部：渲染 ====================

  private _renderArtifactList(): void {
    if (!this.artifactListContainer || !this.artifactItemPrefab) return;

    this.artifactListContainer.removeAllChildren();

    if (this._entries.length === 0) {
      if (this.emptyHintLabel) {
        this.emptyHintLabel.string = '尚未获得任何神器';
        this.emptyHintLabel.node.active = true;
      }
      return;
    }

    if (this.emptyHintLabel) {
      this.emptyHintLabel.node.active = false;
    }

    for (const entry of this._entries) {
      const itemNode = instantiate(this.artifactItemPrefab);
      this._configureArtifactItem(itemNode, entry);
      this.artifactListContainer.addChild(itemNode);
    }
  }

  private _configureArtifactItem(itemNode: Node, entry: ArtifactUIEntry): void {
    const nameLabel = itemNode.getChildByName('NameLabel')?.getComponent(Label);
    const rarityLabel = itemNode.getChildByName('RarityLabel')?.getComponent(Label);
    const levelLabel = itemNode.getChildByName('LevelLabel')?.getComponent(Label);
    const activeIndicator = itemNode.getChildByName('ActiveIndicator');
    const lockedMask = itemNode.getChildByName('LockedMask');
    const activateBtn = itemNode.getChildByName('ActivateButton')?.getComponent(Button);

    if (nameLabel) {
      nameLabel.string = entry.nameKey;
      // 设置稀有度颜色
      nameLabel.color = this._parseColor(entry.rarityColor);
    }

    if (rarityLabel) {
      const rarityNames: Record<string, string> = {
        common: '普通', rare: '稀有', epic: '史诗', legendary: '传说',
      };
      rarityLabel.string = rarityNames[entry.rarity] ?? entry.rarity;
    }

    if (levelLabel) {
      levelLabel.string = entry.level > 0 ? `Lv.${entry.level}` : '未解锁';
    }

    if (activeIndicator) {
      activeIndicator.active = entry.isActive;
    }

    if (lockedMask) {
      lockedMask.active = entry.level === 0;
    }

    // 激活按钮（已解锁但未激活时显示）
    if (activateBtn) {
      activateBtn.node.active = entry.level > 0 && !entry.isActive;
      activateBtn.node.on(Button.EventType.CLICK, () => {
        this._handleActivate(entry.artifactId);
      }, this);
    }

    // 点击显示 Tooltip
    itemNode.on(Node.EventType.TOUCH_END, () => {
      this._showTooltip(entry);
    }, this);
  }

  private _refreshActiveDisplay(): void {
    if (!this.activeArtifactLabel) return;

    const active = this._artifactSystem?.getActiveArtifact();
    if (active) {
      const config = this._configs.find((c) => c.id === active.artifactId);
      this.activeArtifactLabel.string = config
        ? `已激活: ${config.nameKey} Lv.${active.level}`
        : '已激活: 未知神器';
    } else {
      this.activeArtifactLabel.string = '未激活任何神器';
    }
  }

  // ==================== Tooltip ====================

  private _showTooltip(entry: ArtifactUIEntry): void {
    if (!this.tooltipNode) return;

    if (this.tooltipNameLabel) {
      this.tooltipNameLabel.string = entry.nameKey;
    }

    if (this.tooltipEffectLabel) {
      this.tooltipEffectLabel.string = entry.effectKeys.join('\n');
    }

    if (this.tooltipLevelLabel) {
      this.tooltipLevelLabel.string = entry.level > 0
        ? `等级: ${entry.level}`
        : '尚未解锁';
    }

    this.tooltipNode.active = true;
  }

  private _hideTooltip(): void {
    if (this.tooltipNode) {
      this.tooltipNode.active = false;
    }
  }

  // ==================== 交互 ====================

  private _handleActivate(artifactId: string): void {
    if (!this._artifactSystem) return;

    const success = this._artifactSystem.activateArtifact(artifactId);
    if (success) {
      EventManager.getInstance().emit('artifact:activated', { artifactId });
      this._buildEntries();
      this._renderArtifactList();
      this._refreshActiveDisplay();
    }
  }

  // ==================== 事件响应 ====================

  private _onArtifactChanged(..._args: unknown[]): void {
    if (!this._isShowing) return;
    this._buildEntries();
    this._renderArtifactList();
    this._refreshActiveDisplay();
  }

  // ==================== 辅助 ====================

  private _parseColor(hex: string): Color {
    // 简化实现：解析 #RRGGBB 格式
    const r = parseInt(hex.substring(1, 3), 16);
    const g = parseInt(hex.substring(3, 5), 16);
    const b = parseInt(hex.substring(5, 7), 16);
    return new Color(r, g, b, 255);
  }

  // ==================== 按钮绑定 ====================

  onLoad(): void {
    super.onLoad();
    this.closeButton?.node.on(Button.EventType.CLICK, this._handleClose, this);
    this._hideTooltip();
  }

  private _handleClose(): void {
    this._hideTooltip();
    this.hide();
  }

  onDestroy(): void {
    super.onDestroy();
  }
}
