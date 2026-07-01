// ============================================================
// EquipmentSlotItem.ts — Phase10-Step7 装备槽位组件 V2
// 职责：渲染单个装备槽位（Weapon / Armor / Accessory / ...）
// 支持：空槽位占位 / 已装备展示 / 品质颜色边框 / 点击交互
// 规范：纯 UI 组件，不直接读写游戏数据
// V2 变更：数据源从 EquipmentInstanceDetail → EquipmentViewModel
//         槽位类型从 EquipmentSlot → EquipmentSlotId
//         品质从字符串枚举 → 数值
// ============================================================

import { _decorator, Component, Node, Label, Sprite, Color, Button, UITransform } from 'cc';
import type { EquipmentSlotId } from '../equipment/EquipmentTypes';
import type { EquipmentViewModel } from '../equipment/EquipmentInventoryView';

const { ccclass, property } = _decorator;

// ==================== 品质颜色映射（数值型） ====================

const QUALITY_COLOR_BY_NUM: Record<number, string> = {
  0: '#9CA3AF',  // Common 灰色
  1: '#3B82F6',  // Rare 蓝色
  2: '#8B5CF6',  // Epic 紫色
  3: '#F59E0B',  // Legendary 金色
};

const QUALITY_LABEL_BY_NUM: Record<number, string> = {
  0: '普通',
  1: '稀有',
  2: '史诗',
  3: '传说',
};

/** 槽位中文名称映射 */
const SLOT_LABEL_MAP: Record<string, string> = {
  Weapon: '武器',
  Armor: '护甲',
  Accessory: '饰品',
  Helmet: '头盔',
  Boots: '战靴',
  Ring1: '戒指1',
  Ring2: '戒指2',
  Relic: '遗物',
  RuneSocket: '符文孔',
  PetGear: '灵宠装备',
};

/** 槽位点击回调 */
export type SlotClickCallback = (
  slotId: EquipmentSlotId,
  isEmpty: boolean,
  equippedItem?: EquipmentViewModel,
) => void;

@ccclass('EquipmentSlotItem')
export class EquipmentSlotItem extends Component {
  // ==================== 编辑器绑定 ====================

  @property({ type: Node, tooltip: '品质边框背景节点（Sprite）' })
  borderNode: Node | null = null;

  @property({ type: Node, tooltip: '装备图标占位节点（Sprite）' })
  iconNode: Node | null = null;

  @property({ type: Label, tooltip: '槽位名称标签' })
  slotNameLabel: Label | null = null;

  @property({ type: Label, tooltip: '装备名称标签' })
  equipmentNameLabel: Label | null = null;

  @property({ type: Label, tooltip: '属性简览标签（HP/ATK/DEF）' })
  statsLabel: Label | null = null;

  @property({ type: Label, tooltip: '品质标签' })
  qualityLabel: Label | null = null;

  @property({ type: Label, tooltip: '战力标签' })
  powerLabel: Label | null = null;

  @property({ type: Button, tooltip: '点击按钮' })
  clickButton: Button | null = null;

  // ==================== 内部状态 ====================

  private _viewModel: EquipmentViewModel | null = null;
  private _isEmpty: boolean = true;
  private _slotId: EquipmentSlotId = 'Weapon';
  private _onClick: SlotClickCallback | null = null;

  // ==================== 生命周期 ====================

  onLoad(): void {
    this._recoverBindings();
    this._applyCompactLayout();

    if (this.clickButton) {
      this.clickButton.node.on(Button.EventType.CLICK, this._handleClick, this);
    }
  }

  onDestroy(): void {
    if (this.clickButton) {
      this.clickButton.node.off(Button.EventType.CLICK, this._handleClick, this);
    }
  }

  // ==================== 公开方法 ====================

  /** 注册点击回调 */
  setClickCallback(cb: SlotClickCallback): void {
    this._onClick = cb;
  }

  /** 获取当前槽位类型 */
  getSlotId(): EquipmentSlotId {
    return this._slotId;
  }

  /** 是否为空槽位 */
  isEmpty(): boolean {
    return this._isEmpty;
  }

  /** 获取当前装备 ViewModel */
  getViewModel(): EquipmentViewModel | null {
    return this._viewModel;
  }

  /**
   * 设置已装备状态（V2：使用 EquipmentViewModel）。
   */
  setData(viewModel: EquipmentViewModel): void {
    this._viewModel = viewModel;
    this._slotId = viewModel.slotType;
    this._isEmpty = false;
    this._refreshUI();
  }

  /**
   * 设置为空槽位状态（V2：使用 EquipmentSlotId）。
   */
  setEmpty(slotId?: EquipmentSlotId): void {
    if (slotId) {
      this._slotId = slotId;
    }
    this._viewModel = null;
    this._isEmpty = true;
    this._refreshUI();
  }

  // ==================== 内部刷新 ====================

  private _refreshUI(): void {
    this._recoverBindings();
    this._applyCompactLayout();

    const quality = this._viewModel?.quality;
    const colorHex = quality !== undefined
      ? (QUALITY_COLOR_BY_NUM[quality] ?? '#555555')
      : '#555555';

    // 品质边框颜色
    if (this.borderNode) {
      const sprite = this.borderNode.getComponent(Sprite);
      if (sprite) {
        sprite.color = this._hexToColor(this._isEmpty ? '#444444' : colorHex);
      }
    }

    // 槽位名称
    if (this.slotNameLabel) {
      this.slotNameLabel.string = SLOT_LABEL_MAP[this._slotId] ?? this._slotId;
    }

    if (this._isEmpty) {
      // 空槽位状态
      if (this.equipmentNameLabel) {
        this.equipmentNameLabel.string = '— 空 —';
      }
      if (this.statsLabel) {
        this.statsLabel.string = '';
      }
      if (this.qualityLabel) {
        this.qualityLabel.string = '';
        this.qualityLabel.node.active = false;
      }
      if (this.powerLabel) {
        this.powerLabel.string = '';
        this.powerLabel.node.active = false;
      }
      // 图标变灰
      if (this.iconNode) {
        const sprite = this.iconNode.getComponent(Sprite);
        if (sprite) {
          sprite.color = new Color(80, 80, 80, 180);
        }
      }
    } else {
      // 已装备状态
      const vm = this._viewModel!;

      if (this.equipmentNameLabel) {
        this.equipmentNameLabel.string = vm.name;
      }

      if (this.statsLabel) {
        this.statsLabel.string = '';
        this.statsLabel.node.active = false;
      }

      // 品质标签
      if (this.qualityLabel) {
        const qualityName = QUALITY_LABEL_BY_NUM[vm.quality] ?? '未知';
        this.qualityLabel.string = qualityName;
        this.qualityLabel.color = this._hexToColor(colorHex);
        this.qualityLabel.string = '';
        this.qualityLabel.node.active = false;
      }

      // 战力
      if (this.powerLabel) {
        this.powerLabel.string = `战力 ${vm.power}`;
      }

      // 图标恢复
      if (this.iconNode) {
        const sprite = this.iconNode.getComponent(Sprite);
        if (sprite) {
          sprite.color = Color.WHITE;
        }
      }
    }
  }

  // ==================== 交互 ====================

  private _handleClick(): void {
    if (this._onClick) {
      this._onClick(this._slotId, this._isEmpty, this._viewModel ?? undefined);
    }
  }

  private _recoverBindings(): void {
    if (!this.borderNode) this.borderNode = this._findNode('borderNode');
    if (!this.iconNode) this.iconNode = this._findNode('iconNode');
    if (!this.slotNameLabel) this.slotNameLabel = this._findNode('slotNameLabel')?.getComponent(Label) ?? null;
    if (!this.equipmentNameLabel) this.equipmentNameLabel = this._findNode('equipmentNameLabel')?.getComponent(Label) ?? null;
    if (!this.statsLabel) this.statsLabel = this._findNode('statsLabel')?.getComponent(Label) ?? null;
    if (!this.qualityLabel) this.qualityLabel = this._findNode('qualityLabel')?.getComponent(Label) ?? null;
    if (!this.powerLabel) this.powerLabel = this._findNode('powerLabel')?.getComponent(Label) ?? null;
    if (!this.clickButton) this.clickButton = this._findNode('clickButton')?.getComponent(Button) ?? null;
  }

  private _applyCompactLayout(): void {
    this._setNodeSize(this.node, 160, 150);
    this._setNodeSize(this.borderNode, 160, 150);
    this._setNodeSize(this.clickButton?.node ?? null, 160, 150);

    this.iconNode?.setPosition(0, 34, 0);
    this._setNodeSize(this.iconNode, 56, 56);

    this.slotNameLabel?.node.setPosition(0, -8, 0);
    this._setLabelStyle(this.slotNameLabel, 17, 22, 140, 24);

    this.equipmentNameLabel?.node.setPosition(0, -36, 0);
    this._setLabelStyle(this.equipmentNameLabel, 21, 26, 150, 28);

    this.statsLabel?.node.setPosition(0, -62, 0);
    this._setLabelStyle(this.statsLabel, 15, 20, 154, 22);
    if (this.statsLabel) this.statsLabel.node.active = false;

    if (this.qualityLabel) this.qualityLabel.node.active = false;
    if (this.powerLabel) this.powerLabel.node.active = false;
  }

  private _setNodeSize(node: Node | null, width: number, height: number): void {
    node?.getComponent(UITransform)?.setContentSize(width, height);
  }

  private _setLabelStyle(
    label: Label | null,
    fontSize: number,
    lineHeight: number,
    width: number,
    height: number,
  ): void {
    if (!label) return;
    label.fontSize = fontSize;
    label.lineHeight = lineHeight;
    label.enableWrapText = false;
    label.overflow = Label.Overflow.SHRINK;
    label.getComponent(UITransform)?.setContentSize(width, height);
  }

  private _findNode(name: string, root: Node = this.node): Node | null {
    if (root.name === name) return root;
    for (const child of root.children) {
      const found = this._findNode(name, child);
      if (found) return found;
    }
    return null;
  }

  // ==================== 工具方法 ====================

  private _hexToColor(hex: string): Color {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return new Color(r, g, b, 255);
  }
}
