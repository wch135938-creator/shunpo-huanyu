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
import { ConfigManager } from '../core/ConfigManager';
import { HeroSnapshotBuilder } from '../hero/HeroSnapshotBuilder';
import { FormationSystem } from '../formation/FormationSystem';
import { ProgressSystem } from '../systems/ProgressSystem';
import { ChapterSystem } from '../chapter/ChapterSystem';
import type { GlobalConstConfig, GlobalPlayerEntry } from '../config/global_config';

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

const DEFAULT_EQUIPMENT_HERO_ID_FALLBACK = 'hero_001';
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

    // [Step12A-C1.2][EquipmentUIDiag] 自动装备后诊断
    const diagHeroId = resolveInitialHeroId();
    logEquipmentDiagAfterBootstrap(diagHeroId, inventory, equipment);

    // [Step12A-C1.1] Wire EquipmentService → HeroSnapshotBuilder
    // so equipment stats flow into hero battle snapshots.
    HeroSnapshotBuilder.getInstance().setBonusProvider((heroId: string) => {
      try {
        const eq = EquipmentService.getInstance();
        const contrib = eq.getHeroEquipmentContribution(heroId);
        if (!contrib) return {};
        return {
          hp: contrib.attributeBonus.hp,
          atk: contrib.attributeBonus.atk,
          def: contrib.attributeBonus.def,
          speed: contrib.attributeBonus.speed,
          equipmentPower: contrib.equipmentPower,
        };
      } catch {
        return {};
      }
    });
    console.log('[Step12A-C1.1][Bootstrap] HeroSnapshotBuilder bonusProvider 已接线');

    // ---- [C1.5.9-G-B1-A7] 加载账号等级配置 ----
    await ProgressSystem.getInstance().loadAccountLevelConfig();
    console.log('[Phase10MainBootstrap][A7] 账号等级配置已加载');

    // ---- [C1.5.9-G-B1-A5] Bootstrap 确定性同步段：装备与阵容均已就绪 ----
    // 顺序不可变：先重算战力 → 读取最新 playerLevel + teamPower → 章节重判 → 保存
    const formationSystem = FormationSystem.getInstance();
    formationSystem.recalculateAllPower();

    const playerProgress = ProgressSystem.getInstance().getPlayerProgressData();
    const pvePreset = formationSystem.getActivePreset('pve');

    const chapterSystem = ChapterSystem.getInstance();
    const unlockChanged = chapterSystem.reevaluateUnlockConditions({
      playerLevel: playerProgress.playerLevel,
      totalPower: pvePreset?.teamPower ?? 0,
    });

    if (unlockChanged) {
      phase9.saveAll();
      console.log('[Phase10MainBootstrap][A5] 启动同步重判产生新解锁，已保存');
    }
    console.log(
      `[Phase10MainBootstrap][A5] 启动同步重判完成: ` +
      `playerLevel=${playerProgress.playerLevel}, teamPower=${pvePreset?.teamPower ?? 0}, ` +
      `changed=${unlockChanged}`,
    );

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

function logEquipmentDiagAfterBootstrap(
  initialHeroId: string,
  inventory: InventoryService,
  equipment: EquipmentService,
): void {
  const TAG = '[Step12A-C1.2][EquipmentUIDiag]';

  // hero_001 loadout 摘要
  const loadoutHero = equipment.getHeroLoadout(initialHeroId);
  console.log(
    `${TAG} Bootstrap: heroId=${initialHeroId} loadout: ` +
    `Weapon=${loadoutHero?.slots['Weapon']?.slice(-8) ?? 'null'}, ` +
    `Armor=${loadoutHero?.slots['Armor']?.slice(-8) ?? 'null'}, ` +
    `Accessory=${loadoutHero?.slots['Accessory']?.slice(-8) ?? 'null'}`,
  );

  // hero '0' loadout 摘要（遗留检查）
  const loadoutLegacy = equipment.getHeroLoadout('0');
  if (loadoutLegacy) {
    console.log(
      `${TAG} Bootstrap: heroId='0' legacy loadout: ` +
      `Weapon=${loadoutLegacy.slots['Weapon']?.slice(-8) ?? 'null'}, ` +
      `Armor=${loadoutLegacy.slots['Armor']?.slice(-8) ?? 'null'}, ` +
      `Accessory=${loadoutLegacy.slots['Accessory']?.slice(-8) ?? 'null'}`,
    );
  } else {
    console.log(`${TAG} Bootstrap: heroId='0' legacy loadout: null (已清理)`);
  }

  // inventory 中三件初始装备摘要
  const weaponInst = inventory.getInstancesByItemId('ITEM_EQ_WEAPON_001');
  const armorInst = inventory.getInstancesByItemId('ITEM_EQ_ARMOR_001');
  const accessoryInst = inventory.getInstancesByItemId('ITEM_EQ_ACCESSORY_001');
  console.log(
    `${TAG} Bootstrap: Inventory initial equipment: ` +
    `Weapon=[${weaponInst.map((i) => `${i.uniqueId.slice(-8)}(eq=${equipment.isEquipped(i.uniqueId).equipped})`).join(', ') || 'NONE'}], ` +
    `Armor=[${armorInst.map((i) => `${i.uniqueId.slice(-8)}(eq=${equipment.isEquipped(i.uniqueId).equipped})`).join(', ') || 'NONE'}], ` +
    `Accessory=[${accessoryInst.map((i) => `${i.uniqueId.slice(-8)}(eq=${equipment.isEquipped(i.uniqueId).equipped})`).join(', ') || 'NONE'}]`,
  );
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

function resolveInitialHeroId(): string {
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
  return DEFAULT_EQUIPMENT_HERO_ID_FALLBACK;
}

function autoEquipInitialEquipment(
  inventory: InventoryService,
  equipment: EquipmentService,
): void {
  const initialHeroId = resolveInitialHeroId();
  const TAG = '[Step12A-C1.3][AutoEquip]';

  // [Step12A-C1.1] Migration: unequip items from legacy hero '0' if present
  const legacyLoadout = equipment.getHeroLoadout('0');
  if (legacyLoadout) {
    const slotIds: EquipmentSlotId[] = ['Weapon', 'Armor', 'Accessory'];
    for (const slotId of slotIds) {
      if (legacyLoadout.slots[slotId]) {
        equipment.unequip('0', slotId);
        console.log(
          `[Step12A-C1.1][Bootstrap] 迁移: 从旧 heroId='0' 卸下 ${slotId}`,
        );
      }
    }
  }

  // Auto-equip initial equipment to the correct hero
  const loadout = equipment.getHeroLoadout(initialHeroId);

  // [Step12A-C1.3] 诊断: 打印装备背包中初始装备的完整状态
  for (const entry of INITIAL_EQUIPMENT_AUTO_EQUIP) {
    const instances = inventory.getInstancesByItemId(entry.itemId);
    const equippedInst = instances.filter((i) => equipment.isEquipped(i.uniqueId).equipped);
    const unequippedInst = instances.filter((i) => !equipment.isEquipped(i.uniqueId).equipped);
    console.log(
      `${TAG} ${entry.itemId}: total=${instances.length}, ` +
      `equipped=[${equippedInst.map((i) => `${i.uniqueId.slice(-8)}→${equipment.isEquipped(i.uniqueId).heroId}/${equipment.isEquipped(i.uniqueId).slotId}`).join(', ') || 'NONE'}], ` +
      `unequipped=[${unequippedInst.map((i) => i.uniqueId.slice(-8)).join(', ') || 'NONE'}]`,
    );
  }

  for (const entry of INITIAL_EQUIPMENT_AUTO_EQUIP) {
    const occupiedUniqueId = loadout?.slots[entry.slotId];
    if (occupiedUniqueId) {
      const occupiedInstance = inventory.getInstanceByUniqueId(occupiedUniqueId);
      if (occupiedInstance) {
        console.log(
          `${TAG} 槽位已占用: ${entry.slotId}=${occupiedUniqueId.slice(-8)}, 跳过`,
        );
        continue;
      }

      const clearResult = equipment.unequip(initialHeroId, entry.slotId);
      if (!clearResult.success) {
        console.warn(
          `${TAG} 清理悬空装备引用失败: hero=${initialHeroId}, slot=${entry.slotId}, `
          + `uniqueId=${occupiedUniqueId}, errorCode=${clearResult.errorCode}, message=${clearResult.message}`,
        );
        continue;
      }
      console.log(
        `${TAG} 已清理悬空装备引用: hero=${initialHeroId}, slot=${entry.slotId}, uniqueId=${occupiedUniqueId}`,
      );
    }

    const instance = inventory
      .getInstancesByItemId(entry.itemId)
      .find((item) => !equipment.isEquipped(item.uniqueId).equipped);

    if (!instance) {
      console.warn(
        `${TAG} 无可穿戴实例: ${entry.itemId}, slot=${entry.slotId}. ` +
        `所有${inventory.getInstancesByItemId(entry.itemId).length}件均已装备或无实例`,
      );
      continue;
    }

    const result = equipment.equip(
      initialHeroId,
      entry.slotId,
      instance.uniqueId,
    );

    if (result.success) {
      console.log(
        `${TAG} 自动穿戴: hero=${initialHeroId} ` +
        `${entry.itemId}(${instance.uniqueId.slice(-8)}) → ${entry.slotId}`,
      );
    } else {
      console.warn(
        `${TAG} 自动穿戴失败: ${entry.itemId}, ` +
        `slot=${entry.slotId}, errorCode=${result.errorCode}, message=${result.message}`,
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
