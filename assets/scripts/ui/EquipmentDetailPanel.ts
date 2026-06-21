// ============================================================
// EquipmentDetailPanel.ts — Phase10-Step7 装备详情面板
// 职责：装备详情展示 + 所有装备操作统一入口
//   · 基础信息（名称、品质、等级、强化等级、属性、战力）
//   · 穿戴状态
//   · Equip / Unequip / Upgrade / Enhance / Decompose
//   · 升级/强化预览（属性变化、战力变化、消耗预览）
//   · 分解返还预览 + 二次确认
// 位置：ui/ 层
// 规范：继承 BasePanel / 纯 UI / 所有操作通过 Presenter
// ============================================================

import { _decorator, Node, Label, Button, Color, UITransform, Graphics } from 'cc';
import { BasePanel } from '../core/BasePanel';
import type { EquipmentUIPresenter, EquipmentDetailViewModel } from './EquipmentUIPresenter';
import type { EquipmentViewModel } from '../equipment/EquipmentInventoryView';
import type { EquipmentSlotId } from '../equipment/EquipmentTypes';
import { SLOT_NAME_MAP } from '../equipment/EquipmentTypes';

const { ccclass, property } = _decorator;

/** 操作类型（用于确认对话框） */
type PendingAction =
  | { type: 'upgrade' }
  | { type: 'enhance' }
  | { type: 'decompose' };

@ccclass('EquipmentDetailPanel')
export class EquipmentDetailPanel extends BasePanel {
  // ==================== 编辑器绑定：基础信息 ====================

  @property({ type: Label, tooltip: '装备名称' })
  nameLabel: Label | null = null;

  @property({ type: Label, tooltip: '品质标签' })
  qualityLabel: Label | null = null;

  @property({ type: Label, tooltip: '等级标签' })
  levelLabel: Label | null = null;

  @property({ type: Label, tooltip: '强化等级标签' })
  enhanceLevelLabel: Label | null = null;

  @property({ type: Label, tooltip: '战力标签' })
  powerLabel: Label | null = null;

  @property({ type: Label, tooltip: 'HP 属性标签' })
  hpStatLabel: Label | null = null;

  @property({ type: Label, tooltip: 'ATK 属性标签' })
  atkStatLabel: Label | null = null;

  @property({ type: Label, tooltip: 'DEF 属性标签' })
  defStatLabel: Label | null = null;

  @property({ type: Label, tooltip: '穿戴状态标签' })
  equipStatusLabel: Label | null = null;

  // ==================== 编辑器绑定：操作按钮 ====================

  @property({ type: Button, tooltip: '装备按钮' })
  equipBtn: Button | null = null;

  @property({ type: Button, tooltip: '卸下按钮' })
  unequipBtn: Button | null = null;

  @property({ type: Button, tooltip: '升级按钮' })
  upgradeBtn: Button | null = null;

  @property({ type: Button, tooltip: '强化按钮' })
  enhanceBtn: Button | null = null;

  @property({ type: Button, tooltip: '分解按钮' })
  decomposeBtn: Button | null = null;

  // ==================== 编辑器绑定：预览区域 ====================

  @property({ type: Node, tooltip: '预览容器节点' })
  previewContainer: Node | null = null;

  @property({ type: Label, tooltip: '预览战力标签' })
  previewPowerLabel: Label | null = null;

  @property({ type: Label, tooltip: '预览消耗标签' })
  previewCostLabel: Label | null = null;

  // ==================== 编辑器绑定：确认对话框 ====================

  @property({ type: Node, tooltip: '确认对话框节点' })
  confirmDialog: Node | null = null;

  @property({ type: Label, tooltip: '确认对话框文本' })
  confirmTextLabel: Label | null = null;

  @property({ type: Button, tooltip: '确认按钮' })
  confirmBtn: Button | null = null;

  @property({ type: Button, tooltip: '取消按钮' })
  cancelBtn: Button | null = null;

  @property({ type: Button, tooltip: '关闭按钮' })
  closeButton: Button | null = null;

  // ==================== 编辑器绑定：槽位选择（Equip 时） ====================

  @property({ type: Node, tooltip: '槽位选择容器' })
  slotPickerContainer: Node | null = null;

  @property({ type: Button, tooltip: '槽位选择关闭按钮' })
  slotPickerCloseBtn: Button | null = null;

  // ==================== 内部状态 ====================

  private _presenter: EquipmentUIPresenter | null = null;
  private _currentUniqueId: string = '';
  private _currentHeroId: string = '';
  private _detailVM: EquipmentDetailViewModel | null = null;
  private _pendingAction: PendingAction | null = null;
  private _currentPreview: 'upgrade' | 'enhance' | null = null;

  /** 一次性初始化标记 — 解决 inactive prefab 节点 onLoad 不执行的问题 */
  private _initialized = false;

  // ==================== BasePanel 生命周期 ====================

  protected registerEvents(): void {
    // 不再直接监听 EquipmentEvent。
    // 刷新由 Presenter → Mediator._onPresenterRefresh() → refreshFromPresenter() 统一驱动。
  }

  protected unregisterEvents(): void {
    // 无事件需要注销
  }

  // ==================== Cocos 生命周期 ====================

  onLoad(): void {
    super.onLoad();
  }

  // ==================== 公开方法 ====================

  /** 设置 Presenter 引用 */
  setPresenter(presenter: EquipmentUIPresenter): void {
    this._presenter = presenter;
  }

  /**
   * 打开详情面板。
   *
   * @param uniqueId  装备 uniqueId
   * @param heroId    当前英雄 ID（用于 Equip/Unequip 上下文）
   */
  open(uniqueId: string, heroId: string): void {
    // 每次 open 都确保初始化完成（_ensureInit 内部只执行一次）
    this._ensureInit();

    if (!this._presenter) {
      console.warn('[EquipmentDetailPanel] Presenter 未设置');
      return;
    }

    this._currentUniqueId = uniqueId;
    this._currentHeroId = heroId;

    const detailVM = this._presenter.getDetailViewModel(uniqueId, heroId);
    if (!detailVM) {
      console.warn(`[EquipmentDetailPanel] 装备不存在: ${uniqueId}`);
      return;
    }

    this._detailVM = detailVM;
    this._currentPreview = null;
    this._pendingAction = null;
    this._render();
    this.show();
  }

  // ==================== 一次性安全初始化 ====================

  /**
   * 确保 _recoverBindings + _bindEvents + _ensureVisualBlocks 只执行一次。
   *
   * 原因：EquipmentDetailPanel 是 prefab 实例，场景中默认 active=false。
   * 在 Cocos Creator 3.8 中，inactive 预制体节点的 onLoad 不一定执行，
   * 导致 _bindEvents 从未运行，所有按钮事件丢失。
   *
   * 本方法在第一次 open() 时调用，保证按钮事件无论 onLoad 是否执行都能注册。
   */
  private _ensureInit(): void {
    if (this._initialized) return;
    this._initialized = true;

    // 1. 恢复节点引用
    this._recoverBindings();

    // 2. 注册按钮事件（核心修复）
    this._bindEvents();

    // 3. 创建视觉背景块（try/catch 保护，失败不阻塞交互）
    try {
      this._ensureVisualBlocks();
    } catch (e) {
      console.error('[EquipmentDetailPanel] _ensureVisualBlocks 异常:', e);
    }

    // 4. 初始隐藏确认对话框和预览区域
    if (this.confirmDialog) this.confirmDialog.active = false;
    if (this.previewContainer) this.previewContainer.active = false;
  }

  /**
   * 刷新面板（由 Mediator 通过 Presenter 回调驱动）。
   */
  refreshFromPresenter(): void {
    if (!this._isShowing || !this._presenter) return;

    // 如果装备已被分解，关闭面板
    const detailVM = this._presenter.getDetailViewModel(
      this._currentUniqueId,
      this._currentHeroId,
    );
    if (!detailVM) {
      this.close();
      return;
    }

    this._detailVM = detailVM;
    this._render();
  }

  // ==================== 内部渲染 ====================

  private _render(): void {
    if (!this._detailVM) return;

    const vm = this._detailVM.equipment;
    const dvm = this._detailVM;
    const qualityColor = this._presenter?.getQualityColor(vm.quality) ?? '#9CA3AF';

    // 名称
    if (this.nameLabel) {
      this.nameLabel.string = vm.name;
    }

    // 品质
    if (this.qualityLabel) {
      const qualityName = this._presenter?.getQualityName(vm.quality) ?? '未知';
      this.qualityLabel.string = qualityName;
      this.qualityLabel.color = this._hexToColor(qualityColor);
    }

    // 等级
    if (this.levelLabel) {
      this.levelLabel.string = `Lv.${vm.level}`;
    }

    // 强化等级
    if (this.enhanceLevelLabel) {
      if (vm.enhanceLevel > 0) {
        this.enhanceLevelLabel.string = `强化 +${vm.enhanceLevel}`;
        this.enhanceLevelLabel.node.active = true;
      } else {
        this.enhanceLevelLabel.node.active = false;
      }
    }

    // 战力
    if (this.powerLabel) {
      this.powerLabel.string = `战力 ${vm.power}`;
    }

    // 属性
    if (this.hpStatLabel) {
      this.hpStatLabel.string = `HP ${vm.baseHp}`;
    }
    if (this.atkStatLabel) {
      this.atkStatLabel.string = `ATK ${vm.baseAtk}`;
    }
    if (this.defStatLabel) {
      this.defStatLabel.string = `DEF ${vm.baseDef}`;
    }

    // 穿戴状态
    if (this.equipStatusLabel) {
      if (vm.isEquipped) {
        const heroId = vm.equippedHeroId ?? '?';
        const slotName = SLOT_NAME_MAP[vm.equippedSlotId as EquipmentSlotId] ?? vm.equippedSlotId ?? '?';
        this.equipStatusLabel.string = `已装备 · ${heroId} · ${slotName}`;
      } else {
        this.equipStatusLabel.string = '背包中';
      }
    }

    // 操作按钮可见性
    this._renderButtons();

    // 预览区域（默认隐藏）
    this._renderPreview();
  }

  private _renderButtons(): void {
    if (!this._detailVM) return;

    const dvm = this._detailVM;

    // Equip 按钮：未穿戴 且 可装备
    if (this.equipBtn) {
      this.equipBtn.node.active = !dvm.isEquippedByCurrentHero && dvm.canEquipToHero;
      this.equipBtn.interactable = dvm.canEquipToHero;
    }

    // Unequip 按钮：已穿戴 且 可卸下
    if (this.unequipBtn) {
      this.unequipBtn.node.active = dvm.isEquippedByCurrentHero;
      this.unequipBtn.interactable = dvm.canUnequip;
    }

    // Upgrade 按钮：可升级
    if (this.upgradeBtn) {
      this.upgradeBtn.node.active = dvm.canUpgrade;
      this.upgradeBtn.interactable = dvm.canUpgrade && dvm.upgradeMaterialSufficient;
    }

    // Enhance 按钮：可强化
    if (this.enhanceBtn) {
      this.enhanceBtn.node.active = dvm.canEnhance;
      this.enhanceBtn.interactable = dvm.canEnhance && dvm.enhanceMaterialSufficient;
    }

    // Decompose 按钮：可分解
    if (this.decomposeBtn) {
      this.decomposeBtn.node.active = dvm.canDecompose;
      this.decomposeBtn.interactable = dvm.canDecompose;
    }
  }

  private _renderPreview(): void {
    if (!this._detailVM || !this._currentPreview) {
      if (this.previewContainer) {
        this.previewContainer.active = false;
      }
      return;
    }

    const dvm = this._detailVM;

    if (this.previewContainer) {
      this.previewContainer.active = true;
    }

    if (this._currentPreview === 'upgrade') {
      if (this.previewPowerLabel) {
        this.previewPowerLabel.string =
          `战力 ${dvm.currentPower} → ${dvm.upgradePowerAfter} (${dvm.upgradePowerAfter - dvm.currentPower >= 0 ? '+' : ''}${dvm.upgradePowerAfter - dvm.currentPower})`;
      }
      if (this.previewCostLabel) {
        const costTexts = dvm.upgradeCost.map((c) => `${c.itemId} x${c.count}`);
        this.previewCostLabel.string = `消耗: ${costTexts.join(', ')}`;
      }
    } else if (this._currentPreview === 'enhance') {
      if (this.previewPowerLabel) {
        this.previewPowerLabel.string =
          `战力 ${dvm.currentPower} → ${dvm.enhancePowerAfter} (${dvm.enhancePowerAfter - dvm.currentPower >= 0 ? '+' : ''}${dvm.enhancePowerAfter - dvm.currentPower})`;
      }
      if (this.previewCostLabel) {
        const costTexts = dvm.enhanceCost.map((c) => `${c.itemId} x${c.count}`);
        this.previewCostLabel.string = `消耗: ${costTexts.join(', ')}`;
      }
    }
  }

  // ==================== Equip 流程 ====================

  private _onEquipClick(): void {
    if (!this._detailVM || !this._presenter) return;

    const compatibleSlot = this._detailVM.equipment.slotType;

    // 直接装备到兼容槽位（如有替换则自动处理）
    const result = this._presenter.equip(
      this._currentHeroId,
      compatibleSlot,
      this._currentUniqueId,
    );

    if (result.success) {
      console.log(`[EquipmentDetailPanel] 装备成功: ${this._currentUniqueId} → ${compatibleSlot}`);
    } else {
      console.warn(`[EquipmentDetailPanel] 装备失败: ${result.message}`);
      this._showError(result.message ?? '装备失败');
    }
  }

  // ==================== Unequip 流程 ====================

  private _onUnequipClick(): void {
    if (!this._detailVM || !this._presenter) return;

    const slotId = this._detailVM.equipment.equippedSlotId as EquipmentSlotId;
    if (!slotId) return;

    const result = this._presenter.unequip(this._currentHeroId, slotId);

    if (result.success) {
      console.log(`[EquipmentDetailPanel] 卸下成功: ${this._currentUniqueId}`);
    } else {
      console.warn(`[EquipmentDetailPanel] 卸下失败: ${result.message}`);
      this._showError(result.message ?? '卸下失败');
    }
  }

  // ==================== Upgrade 流程 ====================

  private _onUpgradeClick(): void {
    if (!this._detailVM || !this._presenter) return;

    const dvm = this._detailVM;
    this._pendingAction = { type: 'upgrade' };

    const powerDelta = dvm.upgradePowerAfter - dvm.currentPower;
    const sign = powerDelta >= 0 ? '+' : '';
    if (this.confirmTextLabel) {
      const costTexts = dvm.upgradeCost.map((c) => `${c.itemId} x${c.count}`).join(', ');
      this.confirmTextLabel.string = `确认升级？\n等级: Lv.${dvm.equipment.level} → Lv.${dvm.equipment.level + 1}\n战力: ${dvm.currentPower} → ${dvm.upgradePowerAfter} (${sign}${powerDelta})\n消耗: ${costTexts}${dvm.upgradeMaterialSufficient ? '' : '\n⚠ 材料不足'}`;
    }
    if (this.confirmDialog) {
      this.confirmDialog.active = true;
    }
  }

  // ==================== Enhance 流程 ====================

  private _onEnhanceClick(): void {
    if (!this._detailVM || !this._presenter) return;

    const dvm = this._detailVM;
    this._pendingAction = { type: 'enhance' };

    const powerDelta = dvm.enhancePowerAfter - dvm.currentPower;
    const sign = powerDelta >= 0 ? '+' : '';
    const currentEnhance = dvm.equipment.enhanceLevel;
    if (this.confirmTextLabel) {
      const costTexts = dvm.enhanceCost.map((c) => `${c.itemId} x${c.count}`).join(', ');
      this.confirmTextLabel.string = `确认强化？\n强化等级: +${currentEnhance} → +${currentEnhance + 1}\n战力: ${dvm.currentPower} → ${dvm.enhancePowerAfter} (${sign}${powerDelta})\n消耗: ${costTexts}${dvm.enhanceMaterialSufficient ? '' : '\n⚠ 材料不足'}`;
    }
    if (this.confirmDialog) {
      this.confirmDialog.active = true;
    }
  }

  // ==================== Decompose 流程 ====================

  private _onDecomposeClick(): void {
    if (!this._detailVM || !this._presenter) return;

    const dvm = this._detailVM;
    const quality = dvm.equipment.quality;

    // 高品质装备需要二次确认
    this._pendingAction = { type: 'decompose' };

    if (this.confirmTextLabel) {
      let text = `确认分解 ${dvm.equipment.name}？`;
      if (dvm.decomposeReturns.length > 0) {
        const returnTexts = dvm.decomposeReturns.map((r) => `${r.itemId} x${r.count}`).join(', ');
        text += `\n返还: ${returnTexts}`;
      }
      if (quality >= 2) {
        text += '\n⚠ 高品质装备，分解后不可恢复！';
      }
      this.confirmTextLabel.string = text;
    }

    if (this.confirmDialog) {
      this.confirmDialog.active = true;
    }
  }

  // ==================== 确认/取消 ====================

  private _onConfirm(): void {
    if (!this._pendingAction || !this._presenter) return;

    switch (this._pendingAction.type) {
      case 'upgrade': {
        const result = this._presenter.upgrade(this._currentUniqueId);
        if (!result.success) {
          this._showError(result.message ?? '升级失败');
        }
        break;
      }
      case 'enhance': {
        const result = this._presenter.enhance(this._currentUniqueId);
        if (!result.success) {
          this._showError(result.message ?? '强化失败');
        }
        break;
      }
      case 'decompose': {
        const result = this._presenter.decompose(this._currentUniqueId);
        if (result.success) {
          // 分解成功后关闭面板（装备已不存在）
          this.close();
          return;
        } else {
          this._showError(result.message ?? '分解失败');
        }
        break;
      }
    }

    // 关闭确认对话框
    if (this.confirmDialog) {
      this.confirmDialog.active = false;
    }
    this._pendingAction = null;
    this._currentPreview = null;
  }

  private _onCancel(): void {
    if (this.confirmDialog) {
      this.confirmDialog.active = false;
    }
    this._pendingAction = null;
  }

  // ==================== 关闭流程 ====================

  private _handleClose(): void {
    if (this.confirmDialog) {
      this.confirmDialog.active = false;
    }
    this._pendingAction = null;
    this._currentPreview = null;
    this.close();
  }

  // ==================== 错误提示 ====================

  private _showError(message: string): void {
    // 简单实现：输出到 console；后续可接入 Toast 组件
    console.error(`[EquipmentDetailPanel] ${message}`);
  }

  // ==================== 按钮绑定 ====================

  private _bindEvents(): void {
    if (this.equipBtn) {
      this.equipBtn.node.on(Button.EventType.CLICK, this._onEquipClick, this);
    }
    if (this.unequipBtn) {
      this.unequipBtn.node.on(Button.EventType.CLICK, this._onUnequipClick, this);
    }
    if (this.upgradeBtn) {
      this.upgradeBtn.node.on(Button.EventType.CLICK, this._onUpgradeClick, this);
    }
    if (this.enhanceBtn) {
      this.enhanceBtn.node.on(Button.EventType.CLICK, this._onEnhanceClick, this);
    }
    if (this.decomposeBtn) {
      this.decomposeBtn.node.on(Button.EventType.CLICK, this._onDecomposeClick, this);
    }
    if (this.confirmBtn) {
      this.confirmBtn.node.on(Button.EventType.CLICK, this._onConfirm, this);
    }
    if (this.cancelBtn) {
      this.cancelBtn.node.on(Button.EventType.CLICK, this._onCancel, this);
    }
    if (this.closeButton) {
      this.closeButton.node.on(Button.EventType.CLICK, this._handleClose, this);
    }
  }

  private _ensureVisualBlocks(): void {
    this._ensureBlock(this.node.getChildByName('panelRoot'), '__EquipmentDetailPanelBg', 720, 1100, new Color(25, 25, 35, 230));
    this._ensureBlock(this.previewContainer, '__PreviewContainerBg', 500, 80, new Color(40, 40, 50, 200));
    this._ensureBlock(this.confirmDialog, '__ConfirmDialogBg', 500, 220, new Color(20, 20, 30, 240));
    this._ensureBlock(this.slotPickerContainer, '__SlotPickerBg', 400, 60, new Color(30, 30, 40, 220));
    if (this.closeButton) {
      this._ensureBlock(this.closeButton.node, '__DetailCloseButtonBg', 60, 60, new Color(70, 85, 110, 255));
    }
  }

  private _recoverBindings(): void {
    if (!this.nameLabel) this.nameLabel = this._findNode('nameLabel')?.getComponent(Label) ?? null;
    if (!this.qualityLabel) this.qualityLabel = this._findNode('qualityLabel')?.getComponent(Label) ?? null;
    if (!this.levelLabel) this.levelLabel = this._findNode('levelLabel')?.getComponent(Label) ?? null;
    if (!this.enhanceLevelLabel) this.enhanceLevelLabel = this._findNode('enhanceLevelLabel')?.getComponent(Label) ?? null;
    if (!this.powerLabel) this.powerLabel = this._findNode('powerLabel')?.getComponent(Label) ?? null;
    if (!this.hpStatLabel) this.hpStatLabel = this._findNode('hpStatLabel')?.getComponent(Label) ?? null;
    if (!this.atkStatLabel) this.atkStatLabel = this._findNode('atkStatLabel')?.getComponent(Label) ?? null;
    if (!this.defStatLabel) this.defStatLabel = this._findNode('defStatLabel')?.getComponent(Label) ?? null;
    if (!this.equipStatusLabel) this.equipStatusLabel = this._findNode('equipStatusLabel')?.getComponent(Label) ?? null;
    if (!this.equipBtn) this.equipBtn = this._findNode('equipBtn')?.getComponent(Button) ?? null;
    if (!this.unequipBtn) this.unequipBtn = this._findNode('unequipBtn')?.getComponent(Button) ?? null;
    if (!this.upgradeBtn) this.upgradeBtn = this._findNode('upgradeBtn')?.getComponent(Button) ?? null;
    if (!this.enhanceBtn) this.enhanceBtn = this._findNode('enhanceBtn')?.getComponent(Button) ?? null;
    if (!this.decomposeBtn) this.decomposeBtn = this._findNode('decomposeBtn')?.getComponent(Button) ?? null;
    if (!this.previewContainer) this.previewContainer = this._findNode('previewContainer');
    if (!this.previewPowerLabel) this.previewPowerLabel = this._findNode('previewPowerLabel')?.getComponent(Label) ?? null;
    if (!this.previewCostLabel) this.previewCostLabel = this._findNode('previewCostLabel')?.getComponent(Label) ?? null;
    if (!this.confirmDialog) this.confirmDialog = this._findNode('confirmDialog');
    if (!this.confirmTextLabel) this.confirmTextLabel = this._findNode('confirmTextLabel')?.getComponent(Label) ?? null;
    if (!this.confirmBtn) this.confirmBtn = this._findNode('confirmBtn')?.getComponent(Button) ?? null;
    if (!this.cancelBtn) this.cancelBtn = this._findNode('cancelBtn')?.getComponent(Button) ?? null;
    if (!this.closeButton) this.closeButton = this._findNode('closeButton')?.getComponent(Button) ?? null;
    if (!this.slotPickerContainer) this.slotPickerContainer = this._findNode('slotPickerContainer');
    if (!this.slotPickerCloseBtn) this.slotPickerCloseBtn = this._findNode('slotPickerCloseBtn')?.getComponent(Button) ?? null;
  }

  private _findNode(name: string, root: Node = this.node): Node | null {
    if (root.name === name) return root;
    for (const child of root.children) {
      const found = this._findNode(name, child);
      if (found) return found;
    }
    return null;
  }

  private _ensureBlock(parent: Node | null, name: string, width: number, height: number, color: Color): void {
    if (!parent) return;

    let node = parent.getChildByName(name);
    if (!node) {
      node = new Node(name);
      node.setParent(parent);
      node.setSiblingIndex(0);
      node.setPosition(0, 0, 0);
    }

    const transform = node.getComponent(UITransform) ?? node.addComponent(UITransform);
    transform.setContentSize(width, height);

    const graphics = node.getComponent(Graphics) ?? node.addComponent(Graphics);
    graphics.clear();
    graphics.fillColor = color;
    graphics.fillRect(-width / 2, -height / 2, width, height);
  }

  onDestroy(): void {
    super.onDestroy();
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
