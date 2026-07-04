// ============================================================
// EquipmentMediator.ts — Phase10-Step7 UI ↔ EquipmentService 桥接器 V2
// 职责：创建并持有 EquipmentUIPresenter / 连接面板 / 导航逻辑
// 规范：纯桥接组件，不包含 UI 渲染逻辑
// V2 变更：
//   · 不再依赖 systems/EquipmentSystem（使用 equipment/EquipmentService）
//   · 创建 EquipmentUIPresenter 作为逻辑层
//   · 连接面板到 Presenter
//   · 管理面板间导航（Slot → Detail / Bag → Detail）
//   · 不再调用 syncHeroPowerAfterEquipmentChange
// ============================================================

import { _decorator, Component, find, Label } from 'cc';
import { EquipmentService } from '../equipment/EquipmentService';
import { InventoryService } from '../inventory/InventoryService';
import { EquipmentUIPresenter } from './EquipmentUIPresenter';
import { EquipmentPanel } from './EquipmentPanel';
import { EquipmentBagPanel } from './EquipmentBagPanel';
import { EquipmentDetailPanel } from './EquipmentDetailPanel';
import type { EquipmentSlotId } from '../equipment/EquipmentTypes';
import { ConfigManager } from '../core/ConfigManager';
import type { GlobalConstConfig, GlobalPlayerEntry } from '../config/global_config';

const DEFAULT_EQUIPMENT_HERO_ID = 'hero_001';

function resolveActiveEquipmentHeroId(): string {
  try {
    const configManager = ConfigManager.getInstance();
    const globalCfg = configManager.getConfig<GlobalConstConfig>('config/systems/global_const');
    const playerEntry = globalCfg?.data?.find(
      (e): e is GlobalPlayerEntry => e.id === 'GLOBAL_PLAYER',
    );
    if (playerEntry?.initialHeroId) {
      return playerEntry.initialHeroId;
    }
  } catch {
    // fallback
  }
  return DEFAULT_EQUIPMENT_HERO_ID;
}

const { ccclass, property } = _decorator;

@ccclass('EquipmentMediator')
export class EquipmentMediator extends Component {
  // ==================== 编辑器绑定 ====================

  @property({ type: EquipmentPanel, tooltip: '装备面板引用' })
  equipmentPanel: EquipmentPanel | null = null;

  @property({ type: EquipmentBagPanel, tooltip: '装备背包面板引用' })
  bagPanel: EquipmentBagPanel | null = null;

  @property({ type: EquipmentDetailPanel, tooltip: '装备详情面板引用' })
  detailPanel: EquipmentDetailPanel | null = null;

  // ==================== 内部状态 ====================

  private _presenter: EquipmentUIPresenter | null = null;
  private _configReadyPromise: Promise<void> = Promise.resolve();

  // ==================== 生命周期 ====================

  onLoad(): void {
    const inventoryService = InventoryService.getInstance();
    if (!inventoryService.isInitialized()) {
      inventoryService.initialize();
    }

    // 确保 EquipmentService 已初始化
    const eqService = EquipmentService.getInstance();
    if (!eqService.isInitialized()) {
      eqService.initialize();
    }

    // 预加载装备配置，并由 start() 等待完成后再进行首屏渲染。
    this._configReadyPromise = eqService.loadConfigs().catch((err: unknown) => {
      console.warn('[EquipmentMediator] 装备配置加载失败:', err);
    });
  }

  async start(): Promise<void> {
    // 配置未就绪时 ViewModel 只能回退到 itemId / 0 属性。
    // 等待同一个加载任务，确保首屏名称、属性和自动穿戴刷新使用真实配置。
    await this._configReadyPromise;

    // 1. 创建 Presenter
    this._presenter = new EquipmentUIPresenter();
    this._presenter.initialize();

    // 2. 注册 Presenter 刷新回调
    this._presenter.setRefreshCallback(() => this._onPresenterRefresh());

    // 3. 校验面板 Inspector 绑定（动态加载已禁用）
    await this._ensurePanelsLoaded();

    // 4. 连接面板到 Presenter 并设置导航回调
    this._connectPanels();

    this._openActiveScenePanel();
  }

  // ==================== 内部：面板加载（仅校验 Inspector 绑定） ====================

  /**
   * 确保所有面板引用均已通过 Inspector 绑定。
   *
   * Phase10-Step11X3: 动态加载已禁用。
   * 如果绑定缺失，直接输出 console.error，不执行任何 assetManager.loadAny/instantiate/setParent。
   */
  private async _ensurePanelsLoaded(): Promise<void> {
    const missing: string[] = [];

    if (!this.equipmentPanel) {
      missing.push('equipmentPanel');
    }

    if (!this.bagPanel) {
      missing.push('bagPanel');
    }

    if (!this.detailPanel) {
      missing.push('detailPanel');
    }

    if (missing.length > 0) {
      console.error(
        '[EquipmentMediator] Inspector bindings missing:',
        missing.join(', '),
      );
      console.error('[EquipmentMediator] Dynamic panel loading is DISABLED. Please bind panels in the Inspector.');
      return;
    }

    this._checkDuplicateNodes();
  }

  /**
   * 检查 Canvas 下是否存在重复的装备面板节点。
   *
   * 这些节点名如果在场景中重复出现，说明存在重复实例化/挂载。
   * 仅报告，不删除。
   */
  private _checkDuplicateNodes(): void {
    const canvas = find('Canvas');
    if (!canvas) {
      return;
    }

    const suspiciousNames = [
      'EquipmentDetailPanel',
      'EquipmentDetailPanel-root',
      'EquipmentDetailPanel-slotPickerCloseBtn',
      'EquipmentBagPanel',
      'EquipmentPanel',
    ];

    for (const name of suspiciousNames) {
      const allMatches = canvas.children.filter((child) => child.name === name);
      if (allMatches.length > 1) {
        console.error(
          '[DUPLICATE_NODE]',
          `Found ${allMatches.length} instances of "${name}" under Canvas.`,
          'UUIDs:',
          allMatches.map((c) => c.uuid),
        );
      }
    }
  }

  /**
   * 动态加载面板 Prefab — Phase10-Step11X3 已禁用。
   *
   * 此方法仅保留签名以维持接口兼容性。
   * 任何时候调用均返回 null，并输出拒绝日志。
   */
  private async _loadPrefabPanel<T extends Component>(
    uuid: string,
    nodeName: string,
    compName: string,
  ): Promise<T | null> {
    console.error(
      '[EquipmentMediator] Dynamic panel loading is DISABLED. Refusing to load:',
      'compName=', compName,
      'nodeName=', nodeName,
      'uuid=', uuid,
    );

    return null;
  }

  /**
   * 连接面板到 Presenter 并设置面板间导航回调。
   */
  private _connectPanels(): void {
    // 连接面板到 Presenter
    this.equipmentPanel?.setPresenter(this._presenter!);
    this.bagPanel?.setPresenter(this._presenter!);
    this.detailPanel?.setPresenter(this._presenter!);

    // EquipmentPanel 槽位点击 → 打开背包或详情
    this.equipmentPanel?.setOpenBagCallback((slotId: EquipmentSlotId) => {
      this._openBagPanel(slotId);
    });
    this.equipmentPanel?.setOpenDetailCallback((uniqueId: string) => {
      this._openDetailPanel(uniqueId);
    });

    // BagPanel 物品点击 → 打开详情
    this.bagPanel?.setItemClickCallback((uniqueId: string) => {
      this._openDetailPanel(uniqueId);
    });
  }

  private _openActiveScenePanel(): void {
    if (!this.equipmentPanel || this.equipmentPanel.isShowing()) return;
    if (!this.equipmentPanel.node.active) return;

    const initialHeroId = resolveActiveEquipmentHeroId();
    console.log(
      `[Step12A-C1.2][EquipmentUIDiag] Mediator._openActiveScenePanel heroId=${initialHeroId}`,
    );
    this.openEquipmentPanel(initialHeroId);
  }

  // ==================== 公开方法（向后兼容） ====================

  /**
   * 打开指定英雄的装备面板。
   *
   * @param heroId  英雄 ID
   */
  openEquipmentPanel(heroId: string): void {
    if (!this._presenter) {
      console.error('[EquipmentMediator] Presenter 不可用');
      return;
    }

    if (!this.equipmentPanel) {
      console.error('[EquipmentMediator] equipmentPanel 未绑定');
      return;
    }

    this._presenter.setCurrentHero(heroId);
    this.equipmentPanel.open(heroId);
    this._localizeEquipmentSummaryLabels();
  }

  /** 获取当前操作的英雄 ID */
  getCurrentHeroId(): string {
    return this._presenter?.getCurrentHeroId() ?? '';
  }

  // ==================== 内部：面板间导航 ====================

  /**
   * 打开背包面板（可按槽位类型过滤）。
   */
  private _openBagPanel(slotId: EquipmentSlotId): void {
    if (!this.bagPanel || !this._presenter) return;

    const heroId = this._presenter.getCurrentHeroId();
    this.bagPanel.open(heroId, slotId);
  }

  /**
   * 打开详情面板。
   */
  private _openDetailPanel(uniqueId: string): void {
    if (!this.detailPanel || !this._presenter) return;

    const heroId = this._presenter.getCurrentHeroId();
    this.detailPanel.open(uniqueId, heroId);
  }

  // ==================== 内部：Presenter 刷新回调 → 面板刷新 ====================

  /**
   * Presenter 刷新回调 —— 由 Presenter 在事件触发时调用。
   * 广播到当前显示的所有面板。
   */
  private _onPresenterRefresh(): void {
    if (this.equipmentPanel?.isShowing()) {
      this.equipmentPanel.refreshFromPresenter();
      this._localizeEquipmentSummaryLabels();
    }
    if (this.bagPanel?.isShowing()) {
      this.bagPanel.refreshFromPresenter();
    }
    if (this.detailPanel?.isShowing()) {
      this.detailPanel.refreshFromPresenter();
    }
  }

  private _localizeEquipmentSummaryLabels(): void {
    this._replaceSummaryPrefix(this.equipmentPanel?.hpBonusLabel ?? null, 'HP', '生命');
    this._replaceSummaryPrefix(this.equipmentPanel?.atkBonusLabel ?? null, 'ATK', '攻击');
    this._replaceSummaryPrefix(this.equipmentPanel?.defBonusLabel ?? null, 'DEF', '防御');
  }

  private _replaceSummaryPrefix(
    label: Label | null,
    originalPrefix: string,
    localizedPrefix: string,
  ): void {
    if (!label || !label.string.startsWith(originalPrefix)) return;
    label.string = `${localizedPrefix}${label.string.slice(originalPrefix.length)}`;
  }

  // ==================== 清理 ====================

  onDestroy(): void {
    this._presenter?.destroy();
    this._presenter = null;
  }
}
