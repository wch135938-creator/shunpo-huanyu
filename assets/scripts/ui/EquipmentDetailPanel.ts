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

import { _decorator, Node, Label, Button, Color, UITransform, Graphics, CCObject } from 'cc';
import { BasePanel } from '../core/BasePanel';
import type { EquipmentUIPresenter, EquipmentDetailViewModel } from './EquipmentUIPresenter';
import type { EquipmentViewModel } from '../equipment/EquipmentInventoryView';
import type { EquipmentSlotId } from '../equipment/EquipmentTypes';
import { SLOT_NAME_MAP, EquipmentOperationError } from '../equipment/EquipmentTypes';
import { EquipmentResourceBar } from './EquipmentResourceBar';

const { ccclass, property } = _decorator;

const DETAIL_PANEL_BG_WIDTH = 720;
const DETAIL_PANEL_BG_HEIGHT = 1280;
const DETAIL_CLOSE_BUTTON_SIZE = 60;
const RUNTIME_HIDE_FLAGS = CCObject.Flags.DontSave | CCObject.Flags.HideInHierarchy;
const COST_ITEM_NAME_MAP: Record<string, string> = {
  ITEM_EQUIPMENT_STONE: '强化石',
  ITEM_GOLD: '金币',
  ITEM_DIAMOND: '钻石',
};

/** 操作类型（用于确认对话框） */
type PendingAction =
  | { type: 'upgrade'; uniqueId: string }
  | { type: 'enhance'; uniqueId: string }
  | { type: 'decompose'; uniqueId: string };

@ccclass('EquipmentDetailPanel')
export class EquipmentDetailPanel extends BasePanel {
  private static _runtimeNodeSequence = 0;

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
  private _feedbackLabel: Label | null = null;
  private _resourceBar: EquipmentResourceBar | null = null;

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
    this._ensureResourceBar();
    this._refreshResourceBar();
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
    this._resetTransientState();
    this._hideFeedback();
    this._render();
    this._bringToFront();
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
    this._ensureRuntimeControls();
    this._applyReadableTypography();

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
      this.hpStatLabel.string = `生命 ${vm.baseHp}`;
    }
    if (this.atkStatLabel) {
      this.atkStatLabel.string = `攻击 ${vm.baseAtk}`;
    }
    if (this.defStatLabel) {
      this.defStatLabel.string = `防御 ${vm.baseDef}`;
    }

    // 穿戴状态
    if (this.equipStatusLabel) {
      if (vm.isEquipped) {
        const heroId = vm.equippedHeroId ?? '?';
        const slotName = SLOT_NAME_MAP[vm.equippedSlotId as EquipmentSlotId] ?? vm.equippedSlotId ?? '?';
        this.equipStatusLabel.string = `已装备：${this.formatHeroDisplayName(heroId)} · ${slotName}`;
      } else {
        this.equipStatusLabel.string = '背包中';
      }
    }

    // 操作按钮可见性
    this._renderButtons();

    this._refreshResourceBar();

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
      this.upgradeBtn.interactable = dvm.canUpgrade;
    }

    // Enhance 按钮：可强化
    if (this.enhanceBtn) {
      this.enhanceBtn.node.active = dvm.canEnhance;
      this.enhanceBtn.interactable = dvm.canEnhance;
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
        this.previewCostLabel.string = `消耗: ${this._formatCosts(dvm.upgradeCost)}`;
      }
    } else if (this._currentPreview === 'enhance') {
      if (this.previewPowerLabel) {
        this.previewPowerLabel.string =
          `战力 ${dvm.currentPower} → ${dvm.enhancePowerAfter} (${dvm.enhancePowerAfter - dvm.currentPower >= 0 ? '+' : ''}${dvm.enhancePowerAfter - dvm.currentPower})`;
      }
      if (this.previewCostLabel) {
        this.previewCostLabel.string = `消耗: ${this._formatCosts(dvm.enhanceCost)}`;
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

    console.log('[EquipmentDetailPanel][CLICK_UPGRADE]');
    const dvm = this._presenter.getDetailViewModel(this._detailVM.equipment.uniqueId, this._currentHeroId) ?? this._detailVM;
    if (!dvm.upgradeMaterialSufficient) {
      console.log('[EquipmentDetailPanel][CHECK_UPGRADE] false -> return');
      this._showMaterialBlocked('升级', dvm.upgradeCost);
      return;
    }
    this._pendingAction = { type: 'upgrade', uniqueId: dvm.equipment.uniqueId };
    this._refreshResourceBar();

    const powerDelta = dvm.upgradePowerAfter - dvm.currentPower;
    const sign = powerDelta >= 0 ? '+' : '';
    if (this.confirmTextLabel) {
      const costTexts = this._formatCosts(dvm.upgradeCost);
      this.confirmTextLabel.string = `确认升级？\n等级: Lv.${dvm.equipment.level} → Lv.${dvm.equipment.level + 1}\n战力: ${dvm.currentPower} → ${dvm.upgradePowerAfter} (${sign}${powerDelta})\n消耗: ${costTexts}${dvm.upgradeMaterialSufficient ? '' : '\n⚠ 资源不足'}`;
    }
    if (this.confirmBtn) {
      this.confirmBtn.node.active = true;
      this.confirmBtn.interactable = true;
    }
    if (this.confirmDialog) {
      this.confirmDialog.active = true;
    }
  }

  // ==================== Enhance 流程 ====================

  private _onEnhanceClick(): void {
    if (!this._detailVM || !this._presenter) return;

    console.log('[EquipmentDetailPanel][CLICK_ENHANCE]');
    const dvm = this._presenter.getDetailViewModel(this._detailVM.equipment.uniqueId, this._currentHeroId) ?? this._detailVM;
    if (!dvm.enhanceMaterialSufficient) {
      console.log('[EquipmentDetailPanel][CHECK_ENHANCE] false -> return');
      this._showMaterialBlocked('强化', dvm.enhanceCost);
      return;
    }
    this._pendingAction = { type: 'enhance', uniqueId: dvm.equipment.uniqueId };
    this._refreshResourceBar();

    const powerDelta = dvm.enhancePowerAfter - dvm.currentPower;
    const sign = powerDelta >= 0 ? '+' : '';
    const currentEnhance = dvm.equipment.enhanceLevel;
    if (this.confirmTextLabel) {
      const costTexts = this._formatCosts(dvm.enhanceCost);
      this.confirmTextLabel.string = `确认强化？\n强化等级: +${currentEnhance} → +${currentEnhance + 1}\n战力: ${dvm.currentPower} → ${dvm.enhancePowerAfter} (${sign}${powerDelta})\n消耗: ${costTexts}${dvm.enhanceMaterialSufficient ? '' : '\n⚠ 资源不足'}`;
    }
    if (this.confirmBtn) {
      this.confirmBtn.node.active = true;
      this.confirmBtn.interactable = true;
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
    this._pendingAction = { type: 'decompose', uniqueId: dvm.equipment.uniqueId };

    // 高品质装备需要二次确认

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
    if (this.confirmBtn) {
      this.confirmBtn.node.active = true;
      this.confirmBtn.interactable = true;
    }

    if (this.confirmDialog) {
      this.confirmDialog.active = true;
    }
  }

  // ==================== 确认/取消 ====================

  private _onConfirm(): void {
    if (!this._pendingAction || !this._presenter) return;

    const action = this._pendingAction;
    switch (action.type) {
      case 'upgrade': {
        const detailVM = this._presenter.getDetailViewModel(action.uniqueId, this._currentHeroId);
        if (!detailVM?.upgradeMaterialSufficient) {
          console.log('[EquipmentDetailPanel][CHECK_UPGRADE] false -> return');
          this._showMaterialBlocked('升级', detailVM?.upgradeCost ?? []);
          return;
        }
        const result = this._presenter.upgrade(action.uniqueId);
        if (!result.success) {
          if (result.errorCode === EquipmentOperationError.INSUFFICIENT_MATERIALS) {
            this._showMaterialBlocked('升级', detailVM?.upgradeCost ?? result.costItems ?? []);
            return;
          }
          this._showError(result.message ?? '升级失败');
        }
        break;
      }
      case 'enhance': {
        const detailVM = this._presenter.getDetailViewModel(action.uniqueId, this._currentHeroId);
        if (!detailVM?.enhanceMaterialSufficient) {
          console.log('[EquipmentDetailPanel][CHECK_ENHANCE] false -> return');
          this._showMaterialBlocked('强化', detailVM?.enhanceCost ?? []);
          return;
        }
        const result = this._presenter.enhance(action.uniqueId);
        if (!result.success) {
          if (result.errorCode === EquipmentOperationError.INSUFFICIENT_MATERIALS) {
            this._showMaterialBlocked('强化', detailVM?.enhanceCost ?? result.costItems ?? []);
            return;
          }
          this._showError(result.message ?? '强化失败');
        }
        break;
      }
      case 'decompose': {
        const result = this._presenter.decompose(action.uniqueId);
        if (result.success) {
          this._resetTransientState();
          this.close();
          return;
        } else {
          this._showError(result.message ?? '分解失败');
        }
        break;
      }
    }

    // 关闭确认对话框
    this._resetTransientState();
  }

  private _onCancel(): void {
    this._resetTransientState();
  }

  // ==================== 关闭流程 ====================

  private _handleClose(): void {
    this._resetTransientState();
    this.close();
  }

  protected onClose(): void {
    this._resetTransientState();
    super.onClose();
  }

  // ==================== 错误提示 ====================

  private _showError(message: string): void {
    console.warn(`[EquipmentDetailPanel] ${message}`);
    if (!this._feedbackLabel) {
      this._feedbackLabel = this._findNode('__RuntimeFeedbackLabel')?.getComponent(Label) ?? null;
    }
    if (!this._feedbackLabel) return;

    this._feedbackLabel.string = message;
    this._feedbackLabel.node.active = true;
    this.unschedule(this._hideFeedback);
    this.scheduleOnce(this._hideFeedback, 1.5);
  }

  private _showMaterialBlocked(actionName: string, costs: { itemId: string; count: number }[]): void {
    this._pendingAction = null;
    const costText = costs.length > 0
      ? this._formatCosts(costs, true)
      : '无消耗配置';

    if (this.confirmTextLabel) {
      this.confirmTextLabel.string = `${actionName}失败\n资源不足\n需要: ${costText}`;
    }
    if (this.confirmBtn) {
      this.confirmBtn.node.active = false;
    }
    if (this.confirmDialog) {
      this.confirmDialog.active = true;
      return;
    }

    this._showError('资源不足');
  }

  private _formatCosts(
    costs: { itemId: string; count: number }[],
    includeOwned: boolean = false,
  ): string {
    return costs
      .map((cost) => {
        const required = `${COST_ITEM_NAME_MAP[cost.itemId] ?? cost.itemId} x${cost.count}`;
        if (!includeOwned) return required;
        const owned = this._presenter?.getAssetCount(cost.itemId) ?? 0;
        return `${required}（拥有 ${owned}）`;
      })
      .join(', ');
  }

  private _hideFeedback = (): void => {
    if (this._feedbackLabel) {
      this._feedbackLabel.node.active = false;
    }
  };

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
    this._ensureBlock(this.node.getChildByName('panelRoot'), '__EquipmentDetailPanelBg', DETAIL_PANEL_BG_WIDTH, DETAIL_PANEL_BG_HEIGHT, new Color(25, 25, 35, 255));
    this._ensureBlock(this.previewContainer, '__PreviewContainerBg', 500, 80, new Color(40, 40, 50, 200));
    this._ensureBlock(this.confirmDialog, '__ConfirmDialogBg', 500, 220, new Color(20, 20, 30, 255));
    this._ensureBlock(this.slotPickerContainer, '__SlotPickerBg', 400, 60, new Color(30, 30, 40, 220));
    if (this.closeButton) {
      this._ensureBlock(this.closeButton.node, '__DetailCloseButtonBg', DETAIL_CLOSE_BUTTON_SIZE, DETAIL_CLOSE_BUTTON_SIZE, new Color(70, 85, 110, 255));
      this._ensureCloseButtonLabel(this.closeButton.node);
      const closeParent = this.closeButton.node.parent;
      if (closeParent) {
        this.closeButton.node.setSiblingIndex(closeParent.children.length - 1);
      }
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

  private _ensureRuntimeControls(): void {
    const panelRoot = this.node.getChildByName('panelRoot');
    if (!panelRoot) return;

    if (!this.closeButton) {
      const closeNode = this._ensureButtonNode(
        panelRoot,
        '__RuntimeCloseButton',
        DETAIL_CLOSE_BUTTON_SIZE,
        DETAIL_CLOSE_BUTTON_SIZE,
        new Color(70, 85, 110, 255),
      );
      closeNode.setPosition(300, 450, 0);
      this.closeButton = closeNode.getComponent(Button);
    }

    if (!this.confirmDialog) {
      const dialog = this._ensurePlainNode(panelRoot, '__RuntimeConfirmDialog', 500, 220);
      dialog.setPosition(0, 0, 0);
      dialog.active = false;
      this.confirmDialog = dialog;

      const textNode = this._ensurePlainNode(dialog, '__RuntimeConfirmText', 460, 110);
      textNode.setPosition(0, 50, 0);
      this.confirmTextLabel = this._ensureLabelNode(
        textNode,
        '__RuntimeConfirmTextLabel',
        '',
        18,
        26,
        new Color(255, 255, 255, 255),
      );

      const confirmNode = this._ensureButtonNode(dialog, '__RuntimeConfirmBtn', 160, 48, new Color(75, 95, 130, 255));
      confirmNode.setPosition(-100, -70, 0);
      this._ensureLabelNode(confirmNode, '__RuntimeConfirmBtnLabel', '确认', 20, 48, new Color(255, 255, 255, 255));
      this.confirmBtn = confirmNode.getComponent(Button);

      const cancelNode = this._ensureButtonNode(dialog, '__RuntimeCancelBtn', 160, 48, new Color(70, 70, 80, 255));
      cancelNode.setPosition(100, -70, 0);
      this._ensureLabelNode(cancelNode, '__RuntimeCancelBtnLabel', '取消', 20, 48, new Color(255, 255, 255, 255));
      this.cancelBtn = cancelNode.getComponent(Button);
    }

    if (this.previewContainer && !this.previewPowerLabel) {
      const previewPowerNode = this._ensurePlainNode(this.previewContainer, '__RuntimePreviewPowerLabel', 460, 28);
      previewPowerNode.setPosition(0, 12, 0);
      this.previewPowerLabel = this._ensureLabelNode(
        previewPowerNode,
        '__RuntimePreviewPowerLabelText',
        '',
        18,
        28,
        new Color(255, 215, 0, 255),
      );
    }

    if (this.previewContainer && !this.previewCostLabel) {
      const previewCostNode = this._ensurePlainNode(this.previewContainer, '__RuntimePreviewCostLabel', 460, 24);
      previewCostNode.setPosition(0, -16, 0);
      this.previewCostLabel = this._ensureLabelNode(
        previewCostNode,
        '__RuntimePreviewCostLabelText',
        '',
        16,
        24,
        new Color(255, 215, 0, 255),
      );
    }

    if (!this._feedbackLabel) {
      const feedbackNode = this._ensurePlainNode(panelRoot, '__RuntimeFeedback', 420, 48);
      feedbackNode.setPosition(0, -430, 0);
      this._feedbackLabel = this._ensureLabelNode(
        feedbackNode,
        '__RuntimeFeedbackLabel',
        '',
        22,
        48,
        new Color(255, 210, 80, 255),
      );
      feedbackNode.active = false;
    }
  }

  /** 720×1280 设计分辨率下的详情页可读字号。 */
  private _applyReadableTypography(): void {
    this._setReadableLabel(this.nameLabel, 30, 38);
    this._setReadableLabel(this.qualityLabel, 22, 30);
    this._setReadableLabel(this.levelLabel, 22, 30);
    this._setReadableLabel(this.enhanceLevelLabel, 22, 30);
    this._setReadableLabel(this.powerLabel, 24, 32);
    this._setReadableLabel(this.hpStatLabel, 22, 30);
    this._setReadableLabel(this.atkStatLabel, 22, 30);
    this._setReadableLabel(this.defStatLabel, 22, 30);
    this._setReadableLabel(this.equipStatusLabel, 20, 28);

    for (const button of [
      this.equipBtn,
      this.unequipBtn,
      this.upgradeBtn,
      this.enhanceBtn,
      this.decomposeBtn,
    ]) {
      this._setReadableLabel(button?.node.getComponent(Label) ?? null, 24, 34);
    }
  }

  private _setReadableLabel(label: Label | null, fontSize: number, lineHeight: number): void {
    if (!label) return;
    label.fontSize = fontSize;
    label.lineHeight = lineHeight;
    label.overflow = Label.Overflow.SHRINK;
  }

  private _resetTransientState(): void {
    if (this.confirmDialog) {
      this.confirmDialog.active = false;
    }
    if (this.previewContainer) {
      this.previewContainer.active = false;
    }
    if (this.confirmBtn) {
      this.confirmBtn.node.active = true;
      this.confirmBtn.interactable = true;
    }
    this._pendingAction = null;
    this._currentPreview = null;
    this._refreshResourceBar();
  }

  private _bringToFront(): void {
    const parent = this.node.parent;
    if (!parent) return;
    this.node.setSiblingIndex(parent.children.length - 1);
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
    this._markRuntimeNode(node, name);

    const transform = node.getComponent(UITransform) ?? node.addComponent(UITransform);
    this._markRuntimeObject(transform);
    transform.setContentSize(width, height);

    const graphics = node.getComponent(Graphics) ?? node.addComponent(Graphics);
    this._markRuntimeObject(graphics);
    graphics.clear();
    graphics.fillColor = color;
    graphics.fillRect(-width / 2, -height / 2, width, height);
  }

  private _ensurePlainNode(parent: Node, name: string, width: number, height: number): Node {
    let node = parent.getChildByName(name);
    if (!node) {
      node = new Node(name);
      node.setParent(parent);
      node.setPosition(0, 0, 0);
    }
    this._markRuntimeNode(node, name);

    const transform = node.getComponent(UITransform) ?? node.addComponent(UITransform);
    this._markRuntimeObject(transform);
    transform.setContentSize(width, height);
    return node;
  }

  private _ensureResourceBar(): void {
    if (this._resourceBar || !this._presenter) return;

    const panelRoot = this.node.getChildByName('panelRoot');
    if (!panelRoot) return;

    this._resourceBar = new EquipmentResourceBar(
      panelRoot,
      '__EquipmentDetailResourceBar',
      -25,
      500,
      (itemId) => this._presenter?.getAssetCount(itemId) ?? 0,
    );
  }

  private _refreshResourceBar(): void {
    this._resourceBar?.refresh();
  }

  private _ensureButtonNode(parent: Node, name: string, width: number, height: number, color: Color): Node {
    const node = this._ensurePlainNode(parent, name, width, height);
    const button = node.getComponent(Button) ?? node.addComponent(Button);
    this._markRuntimeObject(button);
    button.interactable = true;

    const graphics = node.getComponent(Graphics) ?? node.addComponent(Graphics);
    this._markRuntimeObject(graphics);
    graphics.clear();
    graphics.fillColor = color;
    graphics.fillRect(-width / 2, -height / 2, width, height);
    return node;
  }

  private _ensureLabelNode(parent: Node, name: string, text: string, fontSize: number, lineHeight: number, color: Color): Label {
    let node = parent.getChildByName(name);
    if (!node) {
      node = new Node(name);
      node.setParent(parent);
      node.setPosition(0, 0, 0);
    }
    this._markRuntimeNode(node, name);

    const transform = node.getComponent(UITransform) ?? node.addComponent(UITransform);
    this._markRuntimeObject(transform);
    const parentTransform = parent.getComponent(UITransform);
    transform.setContentSize(
      parentTransform?.contentSize.width ?? 160,
      parentTransform?.contentSize.height ?? lineHeight,
    );

    const label = node.getComponent(Label) ?? node.addComponent(Label);
    this._markRuntimeObject(label);
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = lineHeight;
    label.color = color;
    (label as any).horizontalAlign = 1;
    (label as any).verticalAlign = 1;
    return label;
  }

  private _markRuntimeObject(target: CCObject | null): void {
    if (!target) return;
    target.hideFlags = RUNTIME_HIDE_FLAGS;
  }

  private _markRuntimeNode(node: Node, name: string): void {
    this._markRuntimeObject(node);

    const runtimeNode = node as Node & {
      __equipmentDetailRuntimeId?: string;
    };
    if (runtimeNode.__equipmentDetailRuntimeId) return;

    EquipmentDetailPanel._runtimeNodeSequence += 1;
    const safeName = name.replace(/[^a-zA-Z0-9_]/g, '_');
    const runtimeId = `EquipmentDetailPanelRuntime_${EquipmentDetailPanel._runtimeNodeSequence}_${safeName}`;
    runtimeNode.__equipmentDetailRuntimeId = runtimeId;
  }

  private _ensureCloseButtonLabel(parent: Node): void {
    let node = parent.getChildByName('__DetailCloseButtonLabel');
    if (!node) {
      node = new Node('__DetailCloseButtonLabel');
      node.setParent(parent);
      node.setPosition(0, 0, 0);
    }
    this._markRuntimeNode(node, '__DetailCloseButtonLabel');
    node.setSiblingIndex(parent.children.length - 1);

    const transform = node.getComponent(UITransform) ?? node.addComponent(UITransform);
    this._markRuntimeObject(transform);
    transform.setContentSize(DETAIL_CLOSE_BUTTON_SIZE, DETAIL_CLOSE_BUTTON_SIZE);

    const label = node.getComponent(Label) ?? node.addComponent(Label);
    this._markRuntimeObject(label);
    label.string = 'X';
    label.fontSize = 28;
    label.lineHeight = DETAIL_CLOSE_BUTTON_SIZE;
    label.color = new Color(255, 255, 255, 255);
    (label as any).horizontalAlign = 1;
    (label as any).verticalAlign = 1;
  }

  onDestroy(): void {
    super.onDestroy();
  }

  // ==================== 工具方法 ====================

  /**
   * [C1.5.2] 将内部 heroId 映射为玩家可见的中文角色名。
   * 仅用于 UI 文案展示，不参与存档、逻辑或装备归属判断。
   */
  private formatHeroDisplayName(heroId: string): string {
    if (heroId === 'hero_001') {
      return '剑无极';
    }
    return heroId;
  }

  private _hexToColor(hex: string): Color {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return new Color(r, g, b, 255);
  }
}
