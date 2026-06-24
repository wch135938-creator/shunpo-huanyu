// ============================================================
// Phase10MainBootstrap — Phase10Main 唯一启动入口
// 职责：统一初始化 SaveManager / Inventory / Equipment / Phase9 数据恢复
// 位置：bootstrap/ 层
// 规范：
//   · Phase10Main 场景的唯一启动组件
//   · 不包含 UI 渲染逻辑
//   · 初始化完成后 EquipmentMediator 正常接管 UI
//   · 所有初始化步骤幂等（可被多次安全调用）
// ============================================================

console.log("🔥 BOOTSTRAP SCRIPT LOADED");

import { _decorator, Component, Director, ResolutionPolicy, director, view } from 'cc';
import { SaveManager } from '../save/SaveManager';
import { LocalStorageAdapter } from '../save/LocalStorageAdapter';
import { Phase9Bootstrap } from '../systems/Phase9Bootstrap';
import { InventoryService } from '../inventory/InventoryService';
import { EquipmentService } from '../equipment/EquipmentService';
import type { EquipmentSlotId } from '../equipment/EquipmentTypes';
import { UIDiagnosticCore } from '../diagnostic/UIDiagnosticCore';
import { UIEngine } from '../ui/UIEngine';

const { ccclass } = _decorator;

type PrefabRegistryHost = typeof globalThis & {
  __PREFAB_REGISTRY__?: Record<string, unknown>;
};

interface Phase10BootstrapState {
  saveReady: boolean;
  started: boolean;
  fallbackRegistered: boolean;
  componentSeen: boolean;
}

type Phase10BootstrapStateHost = typeof globalThis & {
  __PHASE10_MAIN_BOOTSTRAP_STATE__?: Phase10BootstrapState;
};

const prefabRegistryHost = globalThis as PrefabRegistryHost;
prefabRegistryHost.__PREFAB_REGISTRY__ = prefabRegistryHost.__PREFAB_REGISTRY__ ?? {};

const phase10BootstrapStateHost = globalThis as Phase10BootstrapStateHost;
const phase10BootstrapState = phase10BootstrapStateHost.__PHASE10_MAIN_BOOTSTRAP_STATE__ ?? {
  saveReady: false,
  started: false,
  fallbackRegistered: false,
  componentSeen: false,
};
phase10BootstrapStateHost.__PHASE10_MAIN_BOOTSTRAP_STATE__ = phase10BootstrapState;

const DEFAULT_EQUIPMENT_HERO_ID = '0';
const DESIGN_RESOLUTION_WIDTH = 720;
const DESIGN_RESOLUTION_HEIGHT = 1280;
const INITIAL_EQUIPMENT_AUTO_EQUIP: Array<{ itemId: string; slotId: EquipmentSlotId }> = [
  { itemId: 'ITEM_EQ_WEAPON_001', slotId: 'Weapon' },
  { itemId: 'ITEM_EQ_ARMOR_001', slotId: 'Armor' },
  { itemId: 'ITEM_EQ_ACCESSORY_001', slotId: 'Accessory' },
];

function applyPortraitDesignResolution(): void {
  view.setDesignResolutionSize(
    DESIGN_RESOLUTION_WIDTH,
    DESIGN_RESOLUTION_HEIGHT,
    ResolutionPolicy.SHOW_ALL,
  );

  console.log(
    `[Phase10MainBootstrap] Design Resolution ${DESIGN_RESOLUTION_WIDTH}x${DESIGN_RESOLUTION_HEIGHT}`,
  );
}

function ensureSaveReady(): void {
  if (phase10BootstrapState.saveReady) {
    return;
  }

  applyPortraitDesignResolution();
  SaveManager.getInstance().init(new LocalStorageAdapter());
  phase10BootstrapState.saveReady = true;
  console.log('[Phase10MainBootstrap] SaveManager Ready');
}

async function runPhase10Bootstrap(startLog: 'START' | 'START_FALLBACK' = 'START'): Promise<void> {
  ensureSaveReady();

  if (phase10BootstrapState.started) {
    console.warn('[Phase10MainBootstrap] 已启动，跳过重复 start');
    return;
  }

  phase10BootstrapState.started = true;
  console.log(`[Phase10MainBootstrap] ${startLog}`);
  UIEngine.bootstrap();
  UIEngine.forceFrame0Flush();
  UIDiagnosticCore.init();
  UIDiagnosticCore.scanScene();
  UIDiagnosticCore.checkScripts();
  UIDiagnosticCore.checkCanvas();
  UIDiagnosticCore.traceUI();

  try {
    // ---- Step 2: Phase9Bootstrap 初始化 + 存档恢复 ----
    const phase9 = Phase9Bootstrap.getInstance();
    if (!phase9.isReady()) {
      await phase9.initialize();
    }
    if (!phase9.isRestored()) {
      phase9.restoreFromSave();
    }
    console.log('[Phase10MainBootstrap] Phase9 Ready');

    // ---- Step 3: InventoryService 初始化 ----
    const inventory = InventoryService.getInstance();
    if (!inventory.isInitialized()) {
      inventory.initialize();
    }
    console.log('[Phase10MainBootstrap] Inventory Ready');

    // ---- Step 4: EquipmentService 初始化 ----
    const equipment = EquipmentService.getInstance();
    if (!equipment.isInitialized()) {
      equipment.initialize();
    }
    console.log('[Phase10MainBootstrap] Equipment Ready');

    // ---- Step 5: 加载装备配置 ----
    await equipment.loadConfigs();
    console.log('[Phase10MainBootstrap] Configs Loaded');
    autoEquipInitialEquipment(inventory, equipment);

    // ---- Step 6: Phase9 恢复完成 ----
    console.log('[Phase10MainBootstrap] Restore Complete');

    // ---- Step 7: UI 就绪 ----
    // EquipmentMediator 在自身的 start() 中创建 Presenter 并打开 Panel。
    // 此时所有数据层（Save/Phase9/Inventory/Equipment）已就绪，
    // EquipmentMediator 的 isInitialized() 守卫将跳过重复初始化。
    console.log('[Phase10MainBootstrap] UI Ready');

  } catch (err) {
    console.error('[Phase10MainBootstrap] INIT FAILED:', err);
  }
}

function registerPhase10BootstrapFallback(): void {
  if (phase10BootstrapState.fallbackRegistered) {
    return;
  }

  phase10BootstrapState.fallbackRegistered = true;
  director.once(Director.EVENT_AFTER_SCENE_LAUNCH, () => {
    setTimeout(() => {
      if (phase10BootstrapState.started || phase10BootstrapState.componentSeen) {
        return;
      }

      void runPhase10Bootstrap('START_FALLBACK');
    }, 0);
  });
}

function autoEquipInitialEquipment(
  inventory: InventoryService,
  equipment: EquipmentService,
): void {
  const loadout = equipment.getHeroLoadout(DEFAULT_EQUIPMENT_HERO_ID);

  for (const entry of INITIAL_EQUIPMENT_AUTO_EQUIP) {
    if (loadout?.slots[entry.slotId]) {
      continue;
    }

    const instance = inventory
      .getInstancesByItemId(entry.itemId)
      .find((item) => !equipment.isEquipped(item.uniqueId).equipped);

    if (!instance) {
      continue;
    }

    const result = equipment.equip(
      DEFAULT_EQUIPMENT_HERO_ID,
      entry.slotId,
      instance.uniqueId,
    );

    if (!result.success) {
      console.warn(
        '[Phase10MainBootstrap] Auto equip initial equipment failed:',
        entry.itemId,
        entry.slotId,
        result.errorCode,
        result.message,
      );
    }
  }
}

registerPhase10BootstrapFallback();

@ccclass('Phase10MainBootstrap')
export class Phase10MainBootstrap extends Component {

  private _started = false;

  // ==================== 生命周期 ====================

  /**
   * onLoad: 同步初始化 SaveManager（最底层依赖）。
   *
   * 必须在所有其他系统之前完成，因为 InventoryService / EquipmentService
   * 的 initialize() 内部依赖 SaveManager.getData()。
   */
  onLoad(): void {
    phase10BootstrapState.componentSeen = true;

    // Step 1: SaveManager.init(adapter) — 同步完成，init() 内部幂等
    ensureSaveReady();
  }

  /**
   * start: 异步初始化所有 Phase9/Inventory/Equipment 系统。
   *
   * 初始化顺序（严格不可变更）：
   *   1. SaveManager.init()          — onLoad 中已完成
   *   2. Phase9Bootstrap.initialize() + restoreFromSave()
   *   3. InventoryService.initialize()
   *   4. EquipmentService.initialize()
   *   5. EquipmentService.loadConfigs()
   *   6. Phase9 恢复流程确认
   *   7. UI 就绪（EquipmentMediator 在自身 start() 中接管）
   */
  async start(): Promise<void> {
    if (this._started) {
      console.warn('[Phase10MainBootstrap] 已启动，跳过重复 start');
      return;
    }

    await runPhase10Bootstrap();
    this._started = phase10BootstrapState.started;
  }

  // ==================== 销毁 ====================

  onDestroy(): void {
    // Phase9Bootstrap 负责销毁所有 Phase9 系统
    const phase9 = Phase9Bootstrap.getInstance();
    if (phase9.isReady()) {
      phase9.destroy();
    }
    console.log('[Phase10MainBootstrap] Destroyed');
  }

  private _autoEquipInitialEquipment(
    inventory: InventoryService,
    equipment: EquipmentService,
  ): void {
    autoEquipInitialEquipment(inventory, equipment);
  }
}
