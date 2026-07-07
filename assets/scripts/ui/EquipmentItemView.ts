// ============================================================
// EquipmentItemView.ts — Phase10-Step7 装备列表条目组件 V2
// 职责：渲染背包装备列表中的单个条目
// 支持：名称 / 品质 / 属性简览 / 已装备标识 / 点击选择
// 规范：纯 UI 组件，不直接读写游戏数据
// V2 变更：
//   · 数据源从 EquipmentListEntry → EquipmentViewModel
//   · 点击打开 DetailPanel（而非直接 Equip）
//   · 添加 reset()/activate() 支持对象池
//   · 替代旧 EquipmentListItem.ts
// ============================================================

import { _decorator, Component, Node, Label, Sprite, Color, Button } from 'cc';
import type { EquipmentViewModel } from '../equipment/EquipmentInventoryView';
import { SLOT_NAME_MAP, type EquipmentSlotId } from '../equipment/EquipmentTypes';


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

/** 列表项点击回调 */
export type EquipmentItemClickCallback = (viewModel: EquipmentViewModel) => void;

@ccclass('EquipmentItemView')
export class EquipmentItemView extends Component {
  // ==================== 编辑器绑定 ====================

  @property({ type: Node, tooltip: '品质颜色条节点（左侧竖条）' })
  qualityBarNode: Node | null = null;

  @property({ type: Label, tooltip: '装备名称标签' })
  nameLabel: Label | null = null;

  @property({ type: Label, tooltip: '品质标签' })
  qualityLabel: Label | null = null;

  @property({ type: Label, tooltip: '属性简览标签（HP/ATK/DEF）' })
  statsLabel: Label | null = null;

  @property({ type: Label, tooltip: '战力标签' })
  powerLabel: Label | null = null;

  @property({ type: Node, tooltip: '已装备标识节点（默认隐藏）' })
  equippedBadgeNode: Node | null = null;

  @property({ type: Label, tooltip: '已装备标识文本' })
  equippedLabel: Label | null = null;

  @property({ type: Button, tooltip: '点击按钮' })
  clickButton: Button | null = null;

  @property({ type: Node, tooltip: '背景节点' })
  bgNode: Node | null = null;

  // ==================== 内部状态 ====================

  private _viewModel: EquipmentViewModel | null = null;
  private _onClick: EquipmentItemClickCallback | null = null;

  // ==================== 生命周期 ====================

  onLoad(): void {
    this._recoverBindings();
    this._applyReadableTypography();

    if (this.clickButton) {
      this.clickButton.node.on(Button.EventType.CLICK, this._handleClick, this);
    }

    // 保护：如果 setData() 在 onLoad() 之前被调用
    // （例如父面板先刷新列表再 show），保留此保护防止未来回归
    if (this._viewModel) {
      this._refreshUI();
    }
  }

  onDestroy(): void {
    if (this.clickButton) {
      this.clickButton.node.off(Button.EventType.CLICK, this._handleClick, this);
    }
  }

  // ==================== 公开方法 ====================

  /** 注册点击回调 */
  setClickCallback(cb: EquipmentItemClickCallback): void {
    this._onClick = cb;
  }

  /** 获取当前 ViewModel */
  getViewModel(): EquipmentViewModel | null {
    return this._viewModel;
  }

  /**
   * 设置条目数据并刷新 UI。
   */
  setData(viewModel: EquipmentViewModel): void {
    this._viewModel = viewModel;
    this._refreshUI();
  }

  // ==================== 对象池生命周期 ====================

  /**
   * 回收时清理状态（对象池复用）。
   * 重置所有标签文本、隐藏徽章、清除引用。
   */
  reset(): void {
    this._viewModel = null;
    // 注意：_onClick 不清空。
    // _onClick 是父面板（BagPanel）在创建时设置的结构性回调，
    // 不随数据变化。保留回调确保对象池复用后点击事件仍然有效。

    if (this.nameLabel) this.nameLabel.string = '';
    if (this.qualityLabel) this.qualityLabel.string = '';
    if (this.statsLabel) this.statsLabel.string = '';
    if (this.powerLabel) this.powerLabel.string = '';
    if (this.equippedBadgeNode) this.equippedBadgeNode.active = false;
    if (this.equippedLabel) this.equippedLabel.string = '';
  }

  /**
   * 从对象池取出时激活。
   */
  activate(): void {
    this.node.active = true;
  }

  // ==================== 内部刷新 ====================

  private _refreshUI(): void {
    if (!this._viewModel) return;

    this._recoverBindings();
    this._applyReadableTypography();

    const vm = this._viewModel;
    const colorHex = QUALITY_COLOR_BY_NUM[vm.quality] ?? '#9CA3AF';

    // 品质颜色条
    if (this.qualityBarNode) {
      const sprite = this.qualityBarNode.getComponent(Sprite);
      if (sprite) {
        sprite.color = this._hexToColor(colorHex);
      }
    }

    // 装备名称
    if (this.nameLabel) {
      this.nameLabel.string = vm.name;
    }

    // 品质标签
    if (this.qualityLabel) {
      this.qualityLabel.string = QUALITY_LABEL_BY_NUM[vm.quality] ?? '未知';
      this.qualityLabel.color = this._hexToColor(colorHex);
    }

    // 属性简览
    if (this.statsLabel) {
      const parts: string[] = [];
      if (vm.baseHp > 0) parts.push(`生命+${vm.baseHp}`);
      if (vm.baseAtk > 0) parts.push(`攻击+${vm.baseAtk}`);
      if (vm.baseDef > 0) parts.push(`防御+${vm.baseDef}`);
      this.statsLabel.string = parts.join('  ');
    }

    // 战力
    if (this.powerLabel) {
      this.powerLabel.string = `战力 ${vm.power}`;
    }

    // 已装备标识
    if (this.equippedBadgeNode) {
      this.equippedBadgeNode.active = vm.isEquipped;
    }
    if (this.equippedLabel && vm.isEquipped) {
      const slotLabel = SLOT_NAME_MAP[vm.equippedSlotId as EquipmentSlotId] ?? vm.equippedSlotId ?? '';
      this.equippedLabel.string = `已装备·${slotLabel}`;
    }

    // 背景色（已装备项略微变暗）
    if (this.bgNode) {
      const sprite = this.bgNode.getComponent(Sprite);
      if (sprite) {
        sprite.color = vm.isEquipped
          ? new Color(50, 50, 50, 255)
          : new Color(70, 70, 70, 255);
      }
    }
  }

  // ==================== 交互 ====================

  private _handleClick(): void {
    if (this._onClick && this._viewModel) {
      this._onClick(this._viewModel);
    }
  }

  private _recoverBindings(): void {
    if (!this.qualityBarNode) this.qualityBarNode = this._findNode('qualityBarNode');
    if (!this.nameLabel) this.nameLabel = this._findNode('nameLabel')?.getComponent(Label) ?? null;
    if (!this.qualityLabel) this.qualityLabel = this._findNode('qualityLabel')?.getComponent(Label) ?? null;
    if (!this.statsLabel) this.statsLabel = this._findNode('statsLabel')?.getComponent(Label) ?? null;
    if (!this.powerLabel) this.powerLabel = this._findNode('powerLabel')?.getComponent(Label) ?? null;
    if (!this.equippedBadgeNode) this.equippedBadgeNode = this._findNode('equippedBadgeNode');
    if (!this.equippedLabel) this.equippedLabel = this._findNode('equippedLabel')?.getComponent(Label) ?? null;
    if (!this.clickButton) this.clickButton = this._findNode('clickButton')?.getComponent(Button) ?? null;
    if (!this.bgNode) this.bgNode = this._findNode('bgNode');
  }

  private _applyReadableTypography(): void {
    this._setReadableLabel(this.nameLabel, 26, 34);
    this._setReadableLabel(this.qualityLabel, 20, 28);
    this._setReadableLabel(this.statsLabel, 18, 26);
    this._setReadableLabel(this.powerLabel, 18, 26);
    this._setReadableLabel(this.equippedLabel, 18, 26);
  }

  private _setReadableLabel(label: Label | null, fontSize: number, lineHeight: number): void {
    if (!label) return;
    label.fontSize = fontSize;
    label.lineHeight = lineHeight;
    label.enableWrapText = false;
    label.overflow = Label.Overflow.SHRINK;
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
