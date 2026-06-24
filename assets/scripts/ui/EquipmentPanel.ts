// ============================================================
// EquipmentPanel.ts — Phase10-Step7 装备面板 V2
// 职责：展示当前英雄装备 / 显示装备总战力 / 动态槽位 / 打开背包 / 刷新装备状态
// 规范：继承 BasePanel / 纯 UI / 数据通过 Presenter 获取
// V2 变更：
//   · 槽位从硬编码三槽 → 动态 slotContainer + Prefab
//   · 数据从 EquipmentSystem → EquipmentUIPresenter
//   · 事件从 equipment:heroChanged → equipment:loadoutChanged
//   · 回调改为 Presenter 驱动 + Mediator 导航
// ============================================================

import { UIStateStore } from "./core/UIStateStore";
import { UIRenderAdapter } from "./core/UIRenderAdapter";
import { _decorator, Node, Label, Button, Prefab, instantiate, UITransform, Graphics, Color, assetManager, Layout, CCObject } from 'cc';
import { BasePanel } from '../core/BasePanel';
import type { EquipmentSlotId } from '../equipment/EquipmentTypes';
import type { SlotViewModel } from '../equipment/EquipmentInventoryView';
import type { EquipmentViewModel } from '../equipment/EquipmentInventoryView';
import { EquipmentSlotItem, type SlotClickCallback } from './EquipmentSlotItem';
import type { EquipmentUIPresenter } from './EquipmentUIPresenter';

const { ccclass, property } = _decorator;

const EQUIPMENT_SLOT_ITEM_PREFAB_UUID = 'c1a2b3d4-e5f6-7890-abcd-ef1234567890';
const RUNTIME_HIDE_FLAGS = CCObject.Flags.DontSave | CCObject.Flags.HideInHierarchy;

@ccclass('EquipmentPanel')
export class EquipmentPanel extends BasePanel {
  private static _runtimeNodeSequence = 0;

  // ==================== 编辑器绑定 ====================

  @property({ type: Node, tooltip: '面板根节点' })
  panelRoot: Node | null = null;

  private _uiReady: boolean = false;

private _flushInitialData() {
    if (!this._uiReady) return;

    UIStateStore.setEquipment({
        name: "Test Sword",
        atk: 100
    });
}

  @property({ type: Node, tooltip: '槽位容器（Layout 节点，动态生成 SlotItem）' })
  slotContainer: Node | null = null;

  @property({ type: Prefab, tooltip: 'EquipmentSlotItem 预制体' })
  slotItemPrefab: Prefab | null = null;

  // 属性加成标签
  @property({ type: Label, tooltip: 'HP 属性加成标签' })
  hpBonusLabel: Label | null = null;

  @property({ type: Label, tooltip: 'ATK 属性加成标签' })
  atkBonusLabel: Label | null = null;

  @property({ type: Label, tooltip: 'DEF 属性加成标签' })
  defBonusLabel: Label | null = null;

  // 战力标签
  @property({ type: Label, tooltip: '装备总战力标签' })
  equipmentPowerLabel: Label | null = null;

  @property({ type: Label, tooltip: '英雄 ID 标签（调试用）' })
  heroIdLabel: Label | null = null;

  @property({ type: Button, tooltip: '关闭按钮' })
  closeButton: Button | null = null;

  // ==================== 内部状态 ====================

  private _currentHeroId: string = '';
  private _presenter: EquipmentUIPresenter | null = null;

  /** 动态创建的 SlotItem 列表 */
  private _slotItems: EquipmentSlotItem[] = [];

  /** 打开背包回调（由 Mediator 设置） */
  private _onOpenBag: ((slotId: EquipmentSlotId) => void) | null = null;

  /** 打开详情回调（由 Mediator 设置） */
  private _onOpenDetail: ((uniqueId: string) => void) | null = null;

  // ==================== BasePanel 生命周期 ====================

  protected registerEvents(): void {
    // 不再直接监听 EquipmentEvent。
    // 刷新由 Presenter → Mediator._onPresenterRefresh() → refreshFromPresenter() 统一驱动。
  }

  protected onEnable(): void {
    // no-op; refreshFromPresenter() handles data updates
  }

  protected unregisterEvents(): void {
    // 无事件需要注销
  }

  // ==================== 公开方法 ====================

  /** 设置 Presenter 引用 */
  setPresenter(presenter: EquipmentUIPresenter): void {
    this._presenter = presenter;
  }

  /** 设置打开背包回调 */
  setOpenBagCallback(cb: (slotId: EquipmentSlotId) => void): void {
    this._onOpenBag = cb;
  }

  /** 设置打开详情回调 */
  setOpenDetailCallback(cb: (uniqueId: string) => void): void {
    this._onOpenDetail = cb;
  }

  /**
   * 打开装备面板。
   *
   * @param heroId  英雄 ID
   */
  open(heroId: string): void {
    if (!this._presenter) {
      console.warn('[EquipmentPanel] Presenter 未设置');
      return;
    }

    this._currentHeroId = heroId;
    this._presenter.setCurrentHero(heroId);

    if (this.heroIdLabel) {
      this.heroIdLabel.string = `英雄 ${heroId}`;
    }

    this._refreshAll();
    this.show();
  }

  /**
   * 刷新面板（由 Mediator 通过 Presenter 回调驱动）。
   */
  refreshFromPresenter(): void {
    if (!this._isShowing || !this._presenter) return;
    this._refreshAll();
  }

  /** 获取当前英雄 ID */
  getCurrentHeroId(): string {
    return this._currentHeroId;
  }

  // ==================== 内部刷新 ====================

  private _refreshAll(): void {
    if (!this._presenter) {
      return;
    }

    const heroView = this._presenter.getHeroEquipmentView(this._currentHeroId);
    this._renderSlots(heroView.slots);
    this._renderAttributeBonus(heroView.slots);
    this._renderPower(heroView.totalEquipmentPower);
  }

  // ==================== 槽位渲染（动态） ====================

  private _renderSlots(slots: SlotViewModel[]): void {
    if (!this.slotContainer) {
      return;
    }

    // 确保有足够的 SlotItem
    const needCreate = slots.length - this._slotItems.length;
    for (let i = this._slotItems.length; i < slots.length; i++) {
      const slotItem = this._createSlotItem();
      if (slotItem) {
        this._slotItems.push(slotItem);
      }
    }

    // 设置每个 SlotItem 的数据
    for (let i = 0; i < slots.length; i++) {
      const slotVM = slots[i];
      const slotItem = this._slotItems[i];
      if (!slotItem) continue;

      slotItem.node.active = true;

      if (slotVM.isEmpty || !slotVM.equippedItem) {
        slotItem.setEmpty(slotVM.slotId);
      } else {
        slotItem.setData(slotVM.equippedItem);
      }
    }

    // 隐藏多余的 SlotItem
    for (let i = slots.length; i < this._slotItems.length; i++) {
      const slotItem = this._slotItems[i];
      if (slotItem && slotItem.node.isValid) {
        slotItem.node.active = false;
      }
    }

    // 更新 Layout
    this.markLayoutDirty('DATA_BIND');
  }

  /**
   * 创建一个新的 SlotItem 实例。
   */
  private _createSlotItem(): EquipmentSlotItem | null {
    if (!this.slotItemPrefab || !this.slotContainer) {
      console.warn('[EquipmentPanel] slotItemPrefab 或 slotContainer 未设置');
      return null;
    }

    let node: Node;
    try {
      node = instantiate(this.slotItemPrefab);
    } catch (e) {
      console.error('[EquipmentPanel] instantiate(slotItemPrefab) 抛出异常:', e);
      return null;
    }

    this._markRuntimeNodeTree(node, 'SlotItem');

    const comp = node.getComponent(EquipmentSlotItem);
    if (comp) {
      comp.setClickCallback(this._handleSlotClick.bind(this));
      node.setParent(this.slotContainer);
      return comp;
    }

    console.warn('[EquipmentPanel] 实例化的节点未找到 EquipmentSlotItem 组件');
    node.destroy();
    return null;
  }

  // ==================== 槽位点击处理 ====================

  private _handleSlotClick(
    slotId: EquipmentSlotId,
    isEmpty: boolean,
    equippedItem?: EquipmentViewModel,
  ): void {
    if (isEmpty) {
      // 空槽位 → 打开背包（按槽位类型过滤）
      if (this._onOpenBag) {
        this._onOpenBag(slotId);
      }
    } else if (equippedItem) {
      // 已装备 → 打开详情面板
      if (this._onOpenDetail) {
        this._onOpenDetail(equippedItem.uniqueId);
      }
    }
  }

  // ==================== 属性加成渲染 ====================

  private _renderAttributeBonus(slots: SlotViewModel[]): void {
    let totalHp = 0;
    let totalAtk = 0;
    let totalDef = 0;

    for (const slot of slots) {
      if (slot.equippedItem) {
        totalHp += slot.equippedItem.baseHp;
        totalAtk += slot.equippedItem.baseAtk;
        totalDef += slot.equippedItem.baseDef;
      }
    }

    if (this.hpBonusLabel) {
      this.hpBonusLabel.string = `HP +${totalHp}`;
    }
    if (this.atkBonusLabel) {
      this.atkBonusLabel.string = `ATK +${totalAtk}`;
    }
    if (this.defBonusLabel) {
      this.defBonusLabel.string = `DEF +${totalDef}`;
    }
  }

  // ==================== 战力渲染 ====================

  private _renderPower(totalPower: number): void {
    if (this.equipmentPowerLabel) {
      this.equipmentPowerLabel.string = `装备战力 ${totalPower}`;
    }
  }

  // ==================== 按钮绑定 ====================

  onLoad() {

    super.onLoad();

    console.log("[EquipmentPanel] onLoad");

    // =========================
    // ① UI系统初始化（订阅层）
    // =========================
    UIRenderAdapter.init();

    // =========================
    // ② UI结构初始化（绑定/Prefab）
    // =========================
    this._recoverBindings();
    this._ensureVisualBlocks();
    this._ensureSlotItemPrefabLoaded();

    // =========================
    // ③ UI就绪标记（防止时序问题）
    // =========================
    this._uiReady = true;

    // =========================
    // ④ 强制 Layout 首帧刷新（修复遮挡/偏移问题）
    // =========================
    this.scheduleOnce(() => {
        this._forceLayout();
    }, 0);

    // 兜底：0.01s 延迟二次刷新，防止极低帧率下 Layout 未就绪
    this.scheduleOnce(() => {
        this._forceLayout();
    }, 0.01);

    // =========================
    // ⑤ 数据驱动（必须最后）
    // =========================
    this.scheduleOnce(() => {
    this._flushInitialData();
}, 0);

    // =========================
    // ⑥ 按钮事件绑定
    // =========================
    this.closeButton?.node.on(
        Button.EventType.CLICK,
        this._handleClose,
        this
    );
}

  protected start(): void {
    super.start();
  }

  private _ensureVisualBlocks(): void {
    if (this.panelRoot) {
      this._ensureBlock(this.panelRoot, '__EquipmentPanelBg', 720, 1280, new Color(25, 25, 35, 230));
    }
    if (this.closeButton) {
      this._ensureBlock(this.closeButton.node, '__CloseButtonBg', 80, 56, new Color(70, 85, 110, 255));
    }
  }

  private _recoverBindings(): void {
    if (!this.panelRoot) this.panelRoot = this._findNode('panelRoot');
    if (!this.slotContainer) this.slotContainer = this._findNode('slotContainer');
    if (!this.hpBonusLabel) this.hpBonusLabel = this._findNode('hpBonusLabel')?.getComponent(Label) ?? null;
    if (!this.atkBonusLabel) this.atkBonusLabel = this._findNode('atkBonusLabel')?.getComponent(Label) ?? null;
    if (!this.defBonusLabel) this.defBonusLabel = this._findNode('defBonusLabel')?.getComponent(Label) ?? null;
    if (!this.equipmentPowerLabel) this.equipmentPowerLabel = this._findNode('equipmentPowerLabel')?.getComponent(Label) ?? null;
    if (!this.heroIdLabel) this.heroIdLabel = this._findNode('heroIdLabel')?.getComponent(Label) ?? null;
    if (!this.closeButton) this.closeButton = this._findNode('closeButton')?.getComponent(Button) ?? null;
  }

  private _findNode(name: string, root: Node = this.node): Node | null {
    if (root.name === name) return root;
    for (const child of root.children) {
      const found = this._findNode(name, child);
      if (found) return found;
    }
    return null;
  }

  private _ensureSlotItemPrefabLoaded(): void {
    if (this.slotItemPrefab) {
      return;
    }

    assetManager.loadAny({ uuid: EQUIPMENT_SLOT_ITEM_PREFAB_UUID }, (err, asset) => {
      if (err || !asset) {
        console.warn('[EquipmentPanel] Failed to load default EquipmentSlotItem prefab:', err);
        return;
      }

      this.slotItemPrefab = asset as Prefab;
      if (this._isShowing) {
        this._refreshAll();
      }
    });
  }

  private _ensureBlock(parent: Node, name: string, width: number, height: number, color: Color): void {
    let node = parent.getChildByName(name);
    if (!node) {
      node = new Node(name);
      node.setParent(parent);
      node.setSiblingIndex(0);
      node.setPosition(0, 0, 0);
    }

    this._markRuntimeNodeTree(node, name);

    const transform = node.getComponent(UITransform) ?? node.addComponent(UITransform);
    this._markRuntimeObject(transform);
    transform.setContentSize(width, height);

    const graphics = node.getComponent(Graphics) ?? node.addComponent(Graphics);
    this._markRuntimeObject(graphics);
    graphics.clear();
    graphics.fillColor = color;
    graphics.fillRect(-width / 2, -height / 2, width, height);
  }

  private _markRuntimeObject(target: CCObject | null): void {
    if (!target) return;
    target.hideFlags = RUNTIME_HIDE_FLAGS;
  }

  private _markRuntimeNodeTree(root: Node, sourceName: string): void {
    this._markRuntimeNode(root, sourceName);
    for (const child of root.children) {
      this._markRuntimeNodeTree(child, child.name);
    }
  }

  private _markRuntimeNode(node: Node, sourceName: string): void {
    this._markRuntimeObject(node);

    const runtimeNode = node as Node & {
      __equipmentPanelRuntimeId?: string;
    };
    if (!runtimeNode.__equipmentPanelRuntimeId) {
      EquipmentPanel._runtimeNodeSequence += 1;
      const safeName = sourceName.replace(/[^a-zA-Z0-9_]/g, '_');
      const runtimeId = `EquipmentPanelRuntime_${EquipmentPanel._runtimeNodeSequence}_${safeName}`;
      runtimeNode.__equipmentPanelRuntimeId = runtimeId;
    }

    for (const component of node.components) {
      this._markRuntimeObject(component);
    }
  }

  /**
   * 强制刷新 slotContainer 的 Layout 布局。
   * 解决首帧 Layout 未初始化导致的内容遮挡/偏移问题。
   */
  private _forceLayout(): void {
    if (!this.slotContainer) return;

    const layout = this.slotContainer.getComponent(Layout);
    if (!layout) return;

    console.log('[EquipmentPanel] _forceLayout called');
    layout.updateLayout();
  }

  private _handleClose(): void {
    this.close();
  }

  onClose(): void {
    // 清理动态插槽
    for (const item of this._slotItems) {
      if (item && item.node.isValid) {
        item.node.active = false;
      }
    }
    super.onClose();
  }

  onDestroy(): void {
    // 清理所有动态创建的 SlotItem 节点
    for (const item of this._slotItems) {
      if (item && item.node.isValid) {
        item.node.destroy();
      }
    }
    this._slotItems = [];
    super.onDestroy();
  }
}
