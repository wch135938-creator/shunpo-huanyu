// ============================================================
// EquipmentBagPanel.ts — Phase10-Step7 装备背包面板 V2
// 职责：显示玩家装备列表 / 类型品质筛选 / 装备选择
// 规范：继承 BasePanel / 纯 UI / 数据通过 Presenter 获取
// V2 变更：
//   · 数据从 EquipmentListEntry → EquipmentViewModel
//   · 列表项从 EquipmentListItem → EquipmentItemView
//   · 对象池替代全量销毁重建
//   · 增量刷新
//   · 筛选缓存通过 Presenter
//   · 点击打开 DetailPanel（非直接 Equip）
//   · 事件从旧 equipment:heroChanged/gained → Presenter 驱动
// ============================================================

import { _decorator, Node, Label, Button, ScrollView, Prefab, instantiate, UITransform, Graphics, Color, assetManager } from 'cc';
import { BasePanel } from '../core/BasePanel';
import type { EquipmentViewFilter } from '../equipment/EquipmentInventoryView';
import type { EquipmentViewModel } from '../equipment/EquipmentInventoryView';
import type { EquipmentSlotId } from '../equipment/EquipmentTypes';
import { EquipmentItemView, type EquipmentItemClickCallback } from './EquipmentItemView';
import type { EquipmentUIPresenter } from './EquipmentUIPresenter';


const { ccclass, property } = _decorator;

const EQUIPMENT_ITEM_VIEW_PREFAB_UUID = 'd2b3c4e5-f6a7-8901-bcde-f12345678901';

/** 当前筛选状态 */
interface BagFilterState {
  /** 槽位类型过滤（null = 全部） */
  slotType: EquipmentSlotId | null;
  /** 最低品质过滤（null = 全部） */
  minQuality: number | null;
}

@ccclass('EquipmentBagPanel')
export class EquipmentBagPanel extends BasePanel {
  // ==================== 编辑器绑定 ====================

  @property({ type: Node, tooltip: '面板根节点' })
  panelRoot: Node | null = null;

  @property({ type: ScrollView, tooltip: '装备列表 ScrollView' })
  scrollView: ScrollView | null = null;

  @property({ type: Node, tooltip: 'ScrollView 的 content 节点' })
  contentNode: Node | null = null;

  @property({ type: Prefab, tooltip: 'EquipmentItemView 的 Prefab 模板' })
  itemTemplate: Prefab | null = null;

  @property({ type: Label, tooltip: '面板标题' })
  titleLabel: Label | null = null;

  @property({ type: Label, tooltip: '筛选状态提示' })
  filterHintLabel: Label | null = null;

  // 类型筛选按钮
  @property({ type: Button, tooltip: '类型-全部 按钮' })
  typeAllBtn: Button | null = null;
  @property({ type: Button, tooltip: '类型-武器 按钮' })
  typeWeaponBtn: Button | null = null;
  @property({ type: Button, tooltip: '类型-护甲 按钮' })
  typeArmorBtn: Button | null = null;
  @property({ type: Button, tooltip: '类型-饰品 按钮' })
  typeAccessoryBtn: Button | null = null;

  // 品质筛选按钮
  @property({ type: Button, tooltip: '品质-全部 按钮' })
  qualityAllBtn: Button | null = null;
  @property({ type: Button, tooltip: '品质-普通 按钮' })
  qualityCommonBtn: Button | null = null;
  @property({ type: Button, tooltip: '品质-稀有 按钮' })
  qualityRareBtn: Button | null = null;
  @property({ type: Button, tooltip: '品质-史诗 按钮' })
  qualityEpicBtn: Button | null = null;
  @property({ type: Button, tooltip: '品质-传说 按钮' })
  qualityLegendaryBtn: Button | null = null;

  @property({ type: Button, tooltip: '关闭按钮' })
  closeButton: Button | null = null;

  @property({ type: Node, tooltip: '空列表提示节点' })
  emptyHintNode: Node | null = null;

  // ==================== 内部状态 ====================

  private _heroId: string = '';
  private _filter: BagFilterState = { slotType: null, minQuality: null };
  private _preselectedSlot: EquipmentSlotId | null = null;

  /** Presenter 引用 */
  private _presenter: EquipmentUIPresenter | null = null;

  /** 对象池：所有已创建的 EquipmentItemView（激活 + 隐藏） */
  private _pool: EquipmentItemView[] = [];
  /** 当前激活的 item 列表 */
  private _activeItems: EquipmentItemView[] = [];

  /** Item 点击回调（由 Mediator 设置，用于打开 DetailPanel） */
  private _onItemSelected: ((uniqueId: string) => void) | null = null;

  /** 一次性初始化标记 — 解决 inactive prefab 节点 onLoad 不执行的问题 */
  private _initialized = false;

  // ==================== BasePanel 生命周期 ====================

  protected registerEvents(): void {
    // V2: 不再监听旧事件 equipment:heroChanged / equipment:gained
    // 刷新由 Mediator 通过 refreshFromPresenter() 驱动
  }

  protected unregisterEvents(): void {
    // 无事件需要注销
  }

  // ==================== Cocos 生命周期 ====================

  private static instanceCount = 0;

  constructor() {
    super();

    EquipmentBagPanel.instanceCount++;
  }

  onLoad(): void {
    super.onLoad();
  }

  start(): void {
    super.start();
  }

  protected onEnable(): void {
    super.onEnable();
  }

  // ==================== 公开方法 ====================

  /** 设置 Presenter 引用 */
  setPresenter(presenter: EquipmentUIPresenter): void {
    this._presenter = presenter;
  }

  /** 设置 Item 选中回调 */
  setItemClickCallback(cb: (uniqueId: string) => void): void {
    this._onItemSelected = cb;
  }

  /**
   * 打开背包面板。
   *
   * @param heroId          当前操作的英雄 ID
   * @param preselectedSlot 预选槽位（从装备面板点击空槽位时传入，自动筛选对应类型）
   */
  open(heroId: string, preselectedSlot?: EquipmentSlotId): void {
    // 每次 open 都确保初始化完成（_ensureInit 内部只执行一次）
    this._ensureInit();

    this._heroId = heroId;
    this._preselectedSlot = preselectedSlot ?? null;

    // 预选槽位 → 自动筛选对应类型
    if (this._preselectedSlot) {
      this._filter.slotType = this._preselectedSlot;
    } else {
      this._filter = { slotType: null, minQuality: null };
    }

    if (this.titleLabel) {
      if (this._preselectedSlot) {
        const slotName = this._presenter?.getSlotName(this._preselectedSlot) ?? this._preselectedSlot;
        this.titleLabel.string = `选择装备 · ${slotName}`;
      } else {
        this.titleLabel.string = '装备背包';
      }
    }

    // 必须先 show() 再 _refreshList()
    // 否则 EquipmentItemView.onLoad() 晚于 setData()，
    // nameLabel/qualityLabel/statsLabel/powerLabel 全部为 null
    this.show();

    this._refreshFilterButtons();

    this._refreshList();
  }

  // ==================== 一次性安全初始化 ====================

  /**
   * 确保 _recoverBindings + _bindEvents + _ensureVisualBlocks 只执行一次。
   *
   * 原因：EquipmentBagPanel 是 prefab 实例，场景中默认 active=false。
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
      console.error('[EquipmentBagPanel] _ensureVisualBlocks 异常:', e);
    }

    // 4. 确保 itemTemplate 已加载
    this._ensureItemTemplateLoaded();
  }

  /**
   * 刷新面板（由 Mediator 通过 Presenter 回调驱动）。
   */
  refreshFromPresenter(): void {
    if (!this._isShowing) return;
    this._refreshList();
  }

  // ==================== 筛选逻辑 ====================

  private _buildFilter(): EquipmentViewFilter {
    const filter: EquipmentViewFilter = {};
    if (this._filter.slotType) {
      filter.slotType = this._filter.slotType;
    }
    if (this._filter.minQuality !== null) {
      filter.minQuality = this._filter.minQuality;
    }
    return filter;
  }

  private _getFilteredEntries(): EquipmentViewModel[] {
    if (!this._presenter) return [];
    return this._presenter.getEquipmentList(this._buildFilter());
  }

  private _setSlotFilter(slotType: EquipmentSlotId | null): void {
    this._filter.slotType = slotType;
    this._refreshFilterButtons();
    this._refreshList();
  }

  private _setQualityFilter(minQuality: number | null): void {
    this._filter.minQuality = minQuality;
    this._refreshFilterButtons();
    this._refreshList();
  }

  private _refreshFilterButtons(): void {
    this._setBtnActive(this.typeAllBtn, this._filter.slotType === null);
    this._setBtnActive(this.typeWeaponBtn, this._filter.slotType === 'Weapon');
    this._setBtnActive(this.typeArmorBtn, this._filter.slotType === 'Armor');
    this._setBtnActive(this.typeAccessoryBtn, this._filter.slotType === 'Accessory');

    this._setBtnActive(this.qualityAllBtn, this._filter.minQuality === null);
    this._setBtnActive(this.qualityCommonBtn, this._filter.minQuality === 0);
    this._setBtnActive(this.qualityRareBtn, this._filter.minQuality === 1);
    this._setBtnActive(this.qualityEpicBtn, this._filter.minQuality === 2);
    this._setBtnActive(this.qualityLegendaryBtn, this._filter.minQuality === 3);

    this._updateFilterHint();
  }

  private _setBtnActive(btn: Button | null, active: boolean): void {
    if (!btn) return;
    btn.node.setScale(active ? 1.1 : 1.0, active ? 1.1 : 1.0, 1);
  }

  private _updateFilterHint(): void {
    if (!this.filterHintLabel) return;

    const parts: string[] = [];
    if (this._filter.slotType) {
      const slotName = this._presenter?.getSlotName(this._filter.slotType) ?? this._filter.slotType;
      parts.push(slotName);
    } else {
      parts.push('全部类型');
    }

    if (this._filter.minQuality !== null) {
      const qName = this._presenter?.getQualityName(this._filter.minQuality) ?? `${this._filter.minQuality}`;
      parts.push(qName + '+');
    } else {
      parts.push('全部品质');
    }

    const viewModels = this._getFilteredEntries();
    parts.push(`${viewModels.length} 件`);
    this.filterHintLabel.string = parts.join(' · ');
  }

  // ==================== 列表渲染（对象池 + 增量刷新） ====================

  private _refreshList(): void {
    const viewModels = this._getFilteredEntries();

    // 空列表提示
    if (this.emptyHintNode) {
      this.emptyHintNode.active = viewModels.length === 0;
    }

    // 确保有足够的 item（对象池）
    for (let i = this._activeItems.length; i < viewModels.length; i++) {
      const item = this._getOrCreateItem();
      if (item) {
        this._activeItems.push(item);
      }
    }

    // 设置数据 & 激活
    for (let i = 0; i < viewModels.length; i++) {
      const item = this._activeItems[i];
      if (item) {
        item.setData(viewModels[i]);
        item.node.active = true;
      }
    }

    // 隐藏多余的 item
    for (let i = viewModels.length; i < this._activeItems.length; i++) {
      const item = this._activeItems[i];
      if (item && item.node.isValid) {
        item.reset();
        item.node.active = false;
      }
    }

    this._updateFilterHint();

    // 更新 Layout
    this.markLayoutDirty('DATA_BIND');
  }

  /**
   * 从对象池获取或创建一个 EquipmentItemView。
   */
  private _getOrCreateItem(): EquipmentItemView | null {
    // 先在隐藏列表中查找可用项
    for (const item of this._pool) {
      if (item.node.isValid && !item.node.active) {
        item.activate();
        return item;
      }
    }

    // 没有可用项，新建
    if (!this.itemTemplate) {
      console.warn('[EquipmentBagPanel] itemTemplate 未设置');
      return null;
    }

    const node = instantiate(this.itemTemplate);

    const comp = node.getComponent(EquipmentItemView);

    if (comp) {
      comp.setClickCallback(this._handleItemClick.bind(this));
      if (this.contentNode) {
        node.setParent(this.contentNode);
      } else {
        console.error('[EquipmentBagPanel] contentNode is null, cannot add child');
      }
      this._pool.push(comp);
      return comp;
    }

    console.warn('[EquipmentBagPanel] 实例化的节点未找到 EquipmentItemView 组件');
    return null;
  }

  // ==================== 事件处理 ====================

  private _handleItemClick(viewModel: EquipmentViewModel): void {
    if (this._onItemSelected) {
      this._onItemSelected(viewModel.uniqueId);
    }
  }

  // ==================== 按钮绑定 ====================

  private _bindEvents(): void {
    // 类型筛选按钮
    if (this.typeAllBtn) {
      this.typeAllBtn.node.on(Button.EventType.CLICK, () => this._setSlotFilter(null), this);
    }
    if (this.typeWeaponBtn) {
      this.typeWeaponBtn.node.on(Button.EventType.CLICK, () => this._setSlotFilter('Weapon'), this);
    }
    if (this.typeArmorBtn) {
      this.typeArmorBtn.node.on(Button.EventType.CLICK, () => this._setSlotFilter('Armor'), this);
    }
    if (this.typeAccessoryBtn) {
      this.typeAccessoryBtn.node.on(Button.EventType.CLICK, () => this._setSlotFilter('Accessory'), this);
    }

    // 品质筛选按钮
    if (this.qualityAllBtn) {
      this.qualityAllBtn.node.on(Button.EventType.CLICK, () => this._setQualityFilter(null), this);
    }
    if (this.qualityCommonBtn) {
      this.qualityCommonBtn.node.on(Button.EventType.CLICK, () => this._setQualityFilter(0), this);
    }
    if (this.qualityRareBtn) {
      this.qualityRareBtn.node.on(Button.EventType.CLICK, () => this._setQualityFilter(1), this);
    }
    if (this.qualityEpicBtn) {
      this.qualityEpicBtn.node.on(Button.EventType.CLICK, () => this._setQualityFilter(2), this);
    }
    if (this.qualityLegendaryBtn) {
      this.qualityLegendaryBtn.node.on(Button.EventType.CLICK, () => this._setQualityFilter(3), this);
    }

    // 关闭按钮
    if (this.closeButton) {
      this.closeButton.node.on(Button.EventType.CLICK, this._handleClose, this);
    }
  }

  private _ensureVisualBlocks(): void {
    if (this.panelRoot) {
      this._ensureBlock(this.panelRoot, '__EquipmentBagPanelBg', 720, 1200, new Color(25, 25, 35, 230));
    }
    if (this.contentNode) {
      this._ensureBlock(this.contentNode, '__EquipmentBagContentBg', 680, 700, new Color(38, 44, 58, 120));
    }
    if (this.closeButton) {
      this._ensureBlock(this.closeButton.node, '__BagCloseButtonBg', 60, 60, new Color(70, 85, 110, 255));
    }
  }

  private _recoverBindings(): void {
    if (!this.panelRoot) this.panelRoot = this._findNode('panelRoot');
    if (!this.scrollView) this.scrollView = this._findNode('scrollView')?.getComponent(ScrollView) ?? null;
    if (!this.contentNode) this.contentNode = this._findNode('contentNode');
    if (!this.titleLabel) this.titleLabel = this._findNode('titleLabel')?.getComponent(Label) ?? null;
    if (!this.filterHintLabel) this.filterHintLabel = this._findNode('filterHintLabel')?.getComponent(Label) ?? null;
    if (!this.typeAllBtn) this.typeAllBtn = this._findNode('typeAllBtn')?.getComponent(Button) ?? null;
    if (!this.typeWeaponBtn) this.typeWeaponBtn = this._findNode('typeWeaponBtn')?.getComponent(Button) ?? null;
    if (!this.typeArmorBtn) this.typeArmorBtn = this._findNode('typeArmorBtn')?.getComponent(Button) ?? null;
    if (!this.typeAccessoryBtn) this.typeAccessoryBtn = this._findNode('typeAccessoryBtn')?.getComponent(Button) ?? null;
    if (!this.qualityAllBtn) this.qualityAllBtn = this._findNode('qualityAllBtn')?.getComponent(Button) ?? null;
    if (!this.qualityCommonBtn) this.qualityCommonBtn = this._findNode('qualityCommonBtn')?.getComponent(Button) ?? null;
    if (!this.qualityRareBtn) this.qualityRareBtn = this._findNode('qualityRareBtn')?.getComponent(Button) ?? null;
    if (!this.qualityEpicBtn) this.qualityEpicBtn = this._findNode('qualityEpicBtn')?.getComponent(Button) ?? null;
    if (!this.qualityLegendaryBtn) this.qualityLegendaryBtn = this._findNode('qualityLegendaryBtn')?.getComponent(Button) ?? null;
    if (!this.closeButton) this.closeButton = this._findNode('closeButton')?.getComponent(Button) ?? null;
    if (!this.emptyHintNode) this.emptyHintNode = this._findNode('emptyHintNode');
  }

  private _findNode(name: string, root: Node = this.node): Node | null {
    if (root.name === name) return root;
    for (const child of root.children) {
      const found = this._findNode(name, child);
      if (found) return found;
    }
    return null;
  }

  private _ensureItemTemplateLoaded(): void {
    if (this.itemTemplate) return;

    console.warn('[EquipmentBagPanel] itemTemplate is null, loading default prefab as fallback');
    assetManager.loadAny({ uuid: EQUIPMENT_ITEM_VIEW_PREFAB_UUID }, (err, asset) => {
      if (err || !asset) {
        console.error('[EquipmentBagPanel] Failed to load default EquipmentItemView prefab:', err);
        return;
      }

      this.itemTemplate = asset as Prefab;
      if (this._isShowing) {
        this._refreshList();
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

    const transform = node.getComponent(UITransform) ?? node.addComponent(UITransform);
    transform.setContentSize(width, height);

    const graphics = node.getComponent(Graphics) ?? node.addComponent(Graphics);
    graphics.clear();
    graphics.fillColor = color;
    graphics.fillRect(-width / 2, -height / 2, width, height);
  }

  private _handleClose(): void {
    this.hide();
  }

  onClose(): void {
    // 清理所有激活的 item
    for (const item of this._activeItems) {
      if (item && item.node.isValid) {
        item.reset();
        item.node.active = false;
      }
    }
    this._activeItems = [];
    super.onClose();
  }

  onDestroy(): void {
    // 清理对象池中所有节点
    for (const item of this._pool) {
      if (item && item.node.isValid) {
        item.node.destroy();
      }
    }
    this._pool = [];
    this._activeItems = [];
    super.onDestroy();
  }
}
