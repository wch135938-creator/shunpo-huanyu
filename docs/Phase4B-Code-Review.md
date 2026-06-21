# Phase4B 装备系统 — 代码级复核文档

## 复核范围

对照 `docs/21-equipment-system-design.md` 对全部实现进行逐文件、逐方法复核。

---

## 文件 1/9：`assets/scripts/data/equipment_types.ts`（新建）

```ts
// ============================================================
// equipment_types.ts — Phase4B 装备枚举定义
// 职责：定义 EquipmentType、EquipmentSlot、EquipmentQuality 枚举
// 规范：仅定义枚举，不包含业务逻辑
// ============================================================

/** 装备类型 */
export enum EquipmentType {
  Weapon = 'Weapon',
  Armor = 'Armor',
  Accessory = 'Accessory',
}

/** 装备槽位（与 EquipmentType 一一对应） */
export enum EquipmentSlot {
  Weapon = 'Weapon',
  Armor = 'Armor',
  Accessory = 'Accessory',
}

/** 装备品质 */
export enum EquipmentQuality {
  Common = 'Common',
  Rare = 'Rare',
  Epic = 'Epic',
  Legendary = 'Legendary',
}

/** EquipmentType → EquipmentSlot 映射 */
export const EQUIPMENT_TYPE_TO_SLOT: Record<EquipmentType, EquipmentSlot> = {
  [EquipmentType.Weapon]: EquipmentSlot.Weapon,
  [EquipmentType.Armor]: EquipmentSlot.Armor,
  [EquipmentType.Accessory]: EquipmentSlot.Accessory,
};
```

**复核要点：**
- `EquipmentType` 与 `EquipmentSlot` 值完全相同但语义分离，类型安全
- `EQUIPMENT_TYPE_TO_SLOT` 实现类型到槽位的自动路由

---

## 文件 2/9：`assets/scripts/data/equipment_config.ts`（新建）

```ts
// ============================================================
// equipment_config.ts — equipment_config.json 的 TypeScript 类型定义
// 职责：定义 Phase4B 装备配置模板结构
// 规范：仅定义配置结构，不包含装备实例或穿戴逻辑
// ============================================================

import type { EquipmentType, EquipmentQuality } from './equipment_types';

/**
 * 单条装备配置模板（对应 equipment_config.json data[] 中每一项）。
 */
export interface EquipmentConfig {
  /** 装备配置 ID，如 "weapon_001" */
  id: string;
  /** 装备名称 */
  name: string;
  /** 装备类型 */
  type: EquipmentType;
  /** 装备品质 */
  quality: EquipmentQuality;
  /** 穿戴等级需求 */
  levelRequirement: number;
  /** 生命加成 */
  hp: number;
  /** 攻击加成 */
  attack: number;
  /** 防御加成 */
  defense: number;
  /** 独立战力值（直接累加到英雄战力） */
  power: number;
}

/**
 * equipment_config.json 的顶层结构（三层：version / name / data[]）。
 */
export interface EquipmentConfigData {
  /** 配置格式版本号 */
  version: string;
  /** 配置表名称（调试用） */
  name: string;
  /** 装备配置数组 */
  data: EquipmentConfig[];
}
```

**复核要点：**
- 字段与设计文档 §8.1 完全对齐：`id / name / type / quality / levelRequirement / hp / attack / defense / power`
- 遵循项目三层配置规范 `{version, name, data[]}`
- `type` 和 `quality` 使用枚举类型约束

---

## 文件 3/9：`assets/scripts/data/equipment_data.ts`（新建）

```ts
// ============================================================
// equipment_data.ts — Phase4B 装备运行时数据结构定义
// 职责：定义装备实例、英雄穿戴状态、玩家装备总数据
// 规范：仅定义数据结构，不包含装备逻辑或 UI
// ============================================================

import type { EquipmentSlot } from './equipment_types';

/**
 * 装备实例数据。
 *
 * 说明：
 * - uid 是实例唯一 ID（运行时生成）。
 * - configId 指向 EquipmentConfig.id。
 * - 实例与配置分离：配置定义模板，实例记录拥有关系。
 */
export interface EquipmentInstanceData {
  /** 实例唯一 ID */
  uid: string;
  /** 装备配置 ID */
  configId: string;
}

/**
 * 单个英雄的装备穿戴状态。
 *
 * 说明：
 * - 每个槽位存储装备实例 uid，null 表示该槽位为空。
 */
export interface HeroEquipmentData {
  /** 英雄 ID */
  heroId: string;
  /** 武器槽位 */
  weaponId: string | null;
  /** 护甲槽位 */
  armorId: string | null;
  /** 饰品槽位 */
  accessoryId: string | null;
}

/**
 * 玩家装备总数据（存档根）。
 *
 * 说明：
 * - instances 保存所有装备实例（uid → 实例数据）。
 * - heroEquipment 保存每个英雄的穿戴状态（heroId → HeroEquipmentData）。
 */
export interface PlayerEquipmentData {
  /** 装备实例映射 */
  instances: Record<string, EquipmentInstanceData>;
  /** 英雄穿戴状态映射 */
  heroEquipment: Record<string, HeroEquipmentData>;
}

/** 创建默认 PlayerEquipmentData */
export function createDefaultPlayerEquipmentData(): PlayerEquipmentData {
  return {
    instances: {},
    heroEquipment: {},
  };
}

/** 创建默认 HeroEquipmentData */
export function createDefaultHeroEquipmentData(heroId: string): HeroEquipmentData {
  return {
    heroId,
    weaponId: null,
    armorId: null,
    accessoryId: null,
  };
}

/** 根据 EquipmentSlot 获取 HeroEquipmentData 中对应字段的值 */
export function getEquipmentSlotValue(data: HeroEquipmentData, slot: EquipmentSlot): string | null {
  switch (slot) {
    case 'Weapon' as EquipmentSlot:
      return data.weaponId;
    case 'Armor' as EquipmentSlot:
      return data.armorId;
    case 'Accessory' as EquipmentSlot:
      return data.accessoryId;
    default:
      return null;
  }
}

/** 根据 EquipmentSlot 设置 HeroEquipmentData 中对应字段的值 */
export function setEquipmentSlotValue(
  data: HeroEquipmentData,
  slot: EquipmentSlot,
  value: string | null,
): void {
  switch (slot) {
    case 'Weapon' as EquipmentSlot:
      data.weaponId = value;
      break;
    case 'Armor' as EquipmentSlot:
      data.armorId = value;
      break;
    case 'Accessory' as EquipmentSlot:
      data.accessoryId = value;
      break;
  }
}
```

**复核要点：**
- `HeroEquipmentData` 与设计文档 §8.5 对齐：`heroId / weaponId / armorId / accessoryId`
- `PlayerEquipmentData` 与设计文档 §8.6 对齐：`instances` + `heroEquipment`
- `getEquipmentSlotValue` / `setEquipmentSlotValue` 提供类型安全的槽位读写
- 实例与配置分离设计：实例仅存 `uid + configId`，属性在运行时查配置

---

## 文件 4/9：`assets/scripts/save/EquipmentSaveData.ts`（重构）

```ts
// ============================================================
// EquipmentSaveData — Phase4B 装备存档数据结构
// 职责：定义装备相关的持久化字段
// 位置：Save 层
// ============================================================

import type { EquipmentInstanceData } from '../data/equipment_data';
import type { HeroEquipmentData } from '../data/equipment_data';

/**
 * 装备存档数据。
 *
 * 说明：
 * - instances 保存所有装备实例（uid → 实例数据）。
 * - heroEquipment 保存每个英雄的穿戴状态（heroId → HeroEquipmentData）。
 */
export interface EquipmentSaveData {
  /** 装备实例映射 */
  instances: Record<string, EquipmentInstanceData>;
  /** 英雄穿戴状态映射 */
  heroEquipment: Record<string, HeroEquipmentData>;
}

/** 创建默认装备存档数据 */
export function createDefaultEquipmentSaveData(): EquipmentSaveData {
  return {
    instances: {},
    heroEquipment: {},
  };
}
```

**复核要点：**
- **重构前**：`equipped: Record<number, number>` + `inventory: number[]`
- **重构后**：`instances: Record<string, EquipmentInstanceData>` + `heroEquipment: Record<string, HeroEquipmentData>`
- 与 `PlayerEquipmentData` 结构一致，`SaveContainer.equipment` 类型安全

---

## 文件 5/9：`assets/scripts/save/SaveContainer.ts`（修改片段）

```ts
// === 修改前 ===
import { EquipmentSaveData } from './EquipmentSaveData';

function createDefaultEquipmentData(): EquipmentSaveData {
  return {
    equipped: {},
    inventory: [],
  };
}

// === 修改后 ===
import { EquipmentSaveData, createDefaultEquipmentSaveData } from './EquipmentSaveData';

function createDefaultEquipmentData(): EquipmentSaveData {
  return createDefaultEquipmentSaveData();
}
```

**复核要点：**
- 单一修改点：导入 + 调用工厂函数
- 不影响 `SaveContainer` 接口签名

---

## 文件 6/9：`assets/scripts/save/SaveManager.ts`（新增方法片段）

```ts
// === 新增 import ===
import type { PlayerEquipmentData } from '../data/equipment_data';

// === 新增方法块（插入在 Phase4A 成长数据读写之后）===

  // ==================== Phase4B 装备数据读写 ====================

  /** 保存装备总数据到内存 */
  savePlayerEquipmentData(data: PlayerEquipmentData): void {
    if (!this._ensureReady()) return;

    this._data!.equipment = {
      instances: { ...data.instances },
      heroEquipment: { ...data.heroEquipment },
    };
    this._dirty = true;
  }

  /** 读取装备总数据副本 */
  loadPlayerEquipmentData(): PlayerEquipmentData | null {
    if (!this._data) return null;

    return {
      instances: { ...this._data.equipment.instances },
      heroEquipment: { ...this._data.equipment.heroEquipment },
    };
  }
```

**复核要点：**
- 遵循 Phase4A `savePlayerProgressData` / `loadPlayerProgressData` 的模式
- 深拷贝防御，防止外部修改污染存档
- 设置 `_dirty = true`，触发 3 秒防抖自动保存

---

## 文件 7/9：`assets/scripts/config/power_config.ts`（修改片段）

```ts
// === 修改前 ===
export interface PowerConfig {
  id: string;
  hpWeight: number;
  atkWeight: number;
  defWeight: number;
  speedWeight: number;
  qualityMultiplier: Record<Quality, number>;
}

// === 修改后 ===
export interface PowerConfig {
  id: string;
  hpWeight: number;
  atkWeight: number;
  defWeight: number;
  speedWeight: number;
  /** 品质战力倍率 */
  qualityMultiplier: Record<Quality, number>;
  /** 装备品质战力倍率（Phase4B），key 为 EquipmentQuality */
  equipmentQualityMultiplier: Record<string, number>;
}
```

**复核要点：**
- 新增字段使用 `Record<string, number>` 避免跨模块枚举依赖
- 向后兼容：`qualityMultiplier` 字段不变，Phase4A 代码不受影响

---

## 文件 8/9：`assets/resources/config/systems/equipment_config.json`（新建）

```json
{
  "version": "1.0.0",
  "name": "equipment_config",
  "data": [
    { "id": "weapon_001", "name": "青锋剑",   "type": "Weapon",    "quality": "Common",    "levelRequirement": 1,  "hp": 0,   "attack": 20,  "defense": 0,   "power": 40 },
    { "id": "weapon_002", "name": "寒铁重剑", "type": "Weapon",    "quality": "Rare",      "levelRequirement": 5,  "hp": 0,   "attack": 55,  "defense": 0,   "power": 120 },
    { "id": "weapon_003", "name": "紫电仙剑", "type": "Weapon",    "quality": "Epic",      "levelRequirement": 10, "hp": 30,  "attack": 120, "defense": 0,   "power": 300 },
    { "id": "weapon_004", "name": "盘古开天斧","type": "Weapon",    "quality": "Legendary", "levelRequirement": 20, "hp": 100, "attack": 280, "defense": 0,   "power": 800 },
    { "id": "armor_001",  "name": "布衣",      "type": "Armor",     "quality": "Common",    "levelRequirement": 1,  "hp": 80,  "attack": 0,   "defense": 10,  "power": 30 },
    { "id": "armor_002",  "name": "玄铁护甲",  "type": "Armor",     "quality": "Rare",      "levelRequirement": 5,  "hp": 220, "attack": 0,   "defense": 28,  "power": 100 },
    { "id": "armor_003",  "name": "天蚕宝甲",  "type": "Armor",     "quality": "Epic",      "levelRequirement": 10, "hp": 500, "attack": 0,   "defense": 60,  "power": 260 },
    { "id": "armor_004",  "name": "不灭金身",  "type": "Armor",     "quality": "Legendary", "levelRequirement": 20, "hp": 1200,"attack": 0,   "defense": 150, "power": 700 },
    { "id": "acc_001",    "name": "铜戒",      "type": "Accessory", "quality": "Common",    "levelRequirement": 1,  "hp": 40,  "attack": 8,   "defense": 4,   "power": 35 },
    { "id": "acc_002",    "name": "灵玉坠",    "type": "Accessory", "quality": "Rare",      "levelRequirement": 5,  "hp": 110, "attack": 22,  "defense": 11,  "power": 110 },
    { "id": "acc_003",    "name": "凤凰翎",    "type": "Accessory", "quality": "Epic",      "levelRequirement": 10, "hp": 250, "attack": 50,  "defense": 25,  "power": 280 },
    { "id": "acc_004",    "name": "混沌珠",    "type": "Accessory", "quality": "Legendary", "levelRequirement": 20, "hp": 600, "attack": 120, "defense": 60,  "power": 750 }
  ]
}
```

**复核要点：**
- 12 件装备，3 类型 × 4 品质完整覆盖
- 字段与 `EquipmentConfig` 接口一一对应
- Weapon 倾向 attack，Armor 倾向 hp/defense，Accessory 混合属性
- 等级需求梯度：1 → 5 → 10 → 20

---

## 文件 9/9：`assets/resources/config/systems/power_config.json`（修改片段）

```json
{
  "version": "1.0.0",
  "name": "power_config",
  "data": [
    {
      "id": "POWER_DEFAULT",
      "hpWeight": 0.10,
      "atkWeight": 5.00,
      "defWeight": 3.00,
      "speedWeight": 2.00,
      "qualityMultiplier": {
        "N": 1.00,
        "R": 1.15,
        "SR": 1.35,
        "SSR": 1.70,
        "UR": 2.20
      },
      "equipmentQualityMultiplier": {
        "Common": 1.0,
        "Rare": 1.2,
        "Epic": 1.5,
        "Legendary": 2.0
      }
    }
  ]
}
```

**复核要点：**
- `equipmentQualityMultiplier` 与设计文档 §5 对齐
- Common=1.0 / Rare=1.2 / Epic=1.5 / Legendary=2.0
- 角色品质倍率 `qualityMultiplier` 不同，装备使用独立倍率体系

---

## 核心文件：`assets/scripts/systems/EquipmentSystem.ts`（新建，按方法分段复核）

### 9.0 模块头部

```ts
// ============================================================
// EquipmentSystem — Phase4B 装备系统
// 职责：装备实例管理 / 穿戴卸下 / 属性汇总 / 战力计算 / 存档
// 边界：不实现 UI、不直接修改英雄基础属性、不实现强化/精炼/升阶/套装
// ============================================================

import { BaseSystem } from '../core/BaseSystem';
import { ConfigManager } from '../core/ConfigManager';
import { EventManager } from '../core/EventManager';
import { SaveManager } from '../save/SaveManager';
import { PowerSystem, type PowerAttributeBonus } from './PowerSystem';
import { ProgressSystem } from './ProgressSystem';
import type { EquipmentConfig, EquipmentConfigData } from '../data/equipment_config';
import type {
  EquipmentInstanceData,
  HeroEquipmentData,
  PlayerEquipmentData,
} from '../data/equipment_data';
import {
  createDefaultPlayerEquipmentData,
  createDefaultHeroEquipmentData,
  setEquipmentSlotValue,
} from '../data/equipment_data';
import { EquipmentType, EquipmentQuality, EquipmentSlot, EQUIPMENT_TYPE_TO_SLOT } from '../data/equipment_types';
import type { HeroConfig, HeroListData } from '../config/hero_config';

/** 装备获得事件数据 */
export interface EquipmentGainedEventData {
  equipmentUid: string;
  configId: string;
}

/** 英雄装备变更事件数据 */
export interface HeroEquipmentChangedEventData {
  heroId: string;
  slotType: EquipmentSlot;
  oldEquipmentUid: string | null;
  newEquipmentUid: string | null;
}

/** 英雄装备属性汇总结果 */
export interface HeroEquipmentSummary {
  attributeBonus: PowerAttributeBonus;
  equipmentPower: number;
}
```

**复核要点：**
- 依赖关系：`ConfigManager`(配置) + `EventManager`(事件) + `SaveManager`(存档) + `PowerSystem`(战力权重) + `ProgressSystem`(角色等级)
- 三个导出接口供外部消费

### 9.1 类定义与内部状态

```ts
export class EquipmentSystem extends BaseSystem {
  static readonly EQUIPMENT_GAINED = 'equipment:gained';
  static readonly HERO_EQUIPMENT_CHANGED = 'equipment:heroChanged';

  private static readonly EQUIPMENT_CONFIG_PATH = `${ConfigManager.DIR_SYSTEMS}/equipment_config`;
  private static readonly HERO_CONFIG_PATH = `${ConfigManager.DIR_CARDS}/hero_list`;

  private _configMap: Map<string, EquipmentConfig> = new Map();
  private _heroConfigMap: Map<string, HeroConfig> = new Map();
  private _data: PlayerEquipmentData = createDefaultPlayerEquipmentData();
  private _uidCounter = 0;
  private _configLoaded = false;
```

**复核要点：**
- 事件名使用命名空间前缀 `equipment:`
- 配置路径通过 `ConfigManager.DIR_*` 常量拼接，无硬编码
- `_data` 是运行时主数据，泛型为 `PlayerEquipmentData`

### 9.2 `loadConfig()` — 初始化

```ts
  /**
   * 功能：并行加载装备配置、角色配置、战力配置，构建缓存 Map，从存档恢复运行时数据。
   * 输入：无
   * 输出：Promise<void>，完成后 _configLoaded = true
   * 依赖：ConfigManager、PowerSystem.loadConfig()、SaveManager
   */
  async loadConfig(): Promise<void> {
    const configManager = ConfigManager.getInstance();
    const [equipmentConfig, heroConfig] = await Promise.all([
      configManager.loadConfig<EquipmentConfigData>(EquipmentSystem.EQUIPMENT_CONFIG_PATH),
      configManager.loadConfig<HeroListData>(EquipmentSystem.HERO_CONFIG_PATH),
      PowerSystem.getInstance().loadConfig(),
    ]);

    this._configMap = this._buildEquipmentConfigMap(equipmentConfig);
    this._heroConfigMap = this._buildHeroConfigMap(heroConfig);
    this._restoreFromSave();
    this._configLoaded = true;
  }
```

**复核要点：**
- 并行加载三项配置（装备 + 角色 + 战力），效率最优
- 恢复顺序：先构建配置缓存 → 再从存档恢复运行时数据
- `_restoreFromSave()` 依赖 `SaveManager` 已初始化

### 9.3 `createInstance(configId)` — 实例创建

```ts
  /**
   * 功能：由配置 ID 创建装备实例，生成唯一 uid，写入 instances，自动保存，派发事件。
   * 输入：configId — 装备配置 ID
   * 输出：EquipmentInstanceData（uid + configId）
   * 事件：equipment:gained（{ equipmentUid, configId }）
   */
  createInstance(configId: string): EquipmentInstanceData {
    const config = this._getRequiredConfig(configId);
    const uid = this._generateUid(configId);

    const instance: EquipmentInstanceData = { uid, configId };

    this._data.instances[uid] = instance;
    this._save();

    this._emitEquipmentGained({ equipmentUid: uid, configId });

    return instance;
  }
```

**复核要点：**
- UID 格式：`EQUIP_{configId}_{timestamp}_{counter}`，保证唯一性
- `_getRequiredConfig` 会在配置不存在时抛出错误
- 创建后自动保存 + 派发 `equipment:gained` 事件

### 9.4 `removeInstance(uid)` — 实例删除

```ts
  /**
   * 功能：从背包删除装备实例。若装备正被任何英雄穿戴则拒绝删除。
   * 输入：uid — 装备实例 uid
   * 输出：boolean — 是否成功删除
   */
  removeInstance(uid: string): boolean {
    // 检查是否正在被穿戴
    for (const heroEquipment of Object.values(this._data.heroEquipment)) {
      if (
        heroEquipment.weaponId === uid
        || heroEquipment.armorId === uid
        || heroEquipment.accessoryId === uid
      ) {
        return false;
      }
    }

    const existed = uid in this._data.instances;
    delete this._data.instances[uid];

    if (existed) {
      this._save();
    }

    return existed;
  }
```

**复核要点：**
- 穿戴状态检查：遍历所有英雄的三个槽位，防止删除正在使用的装备
- 安全删除：先检查后删除，不存在则返回 false

### 9.5 `equip(heroId, equipmentUid)` — 装备穿戴

```ts
  /**
   * 功能：将装备穿戴到指定英雄的对应槽位。
   * 规则：
   *   - 校验英雄等级 ≥ 装备 levelRequirement
   *   - 同槽位自动替换：旧装备保留在背包，仅解除穿戴关系
   *   - 幂等性：同一件装备已在槽位上时返回 null，不触发事件
   * 输入：heroId / equipmentUid
   * 输出：HeroEquipmentChangedEventData | null
   * 事件：equipment:heroChanged
   */
  equip(heroId: string, equipmentUid: string): HeroEquipmentChangedEventData | null {
    const instance = this._getRequiredInstance(equipmentUid);
    const config = this._getRequiredConfig(instance.configId);
    const slot = EQUIPMENT_TYPE_TO_SLOT[config.type];
    const heroEquipment = this._getOrCreateHeroEquipment(heroId);

    // 校验等级需求
    this._validateLevelRequirement(heroId, config);

    // 记录旧装备
    const oldEquipmentUid = this._getSlotValue(heroEquipment, slot);

    // 幂等性：同一件装备已经在槽位上，无需操作
    if (oldEquipmentUid === equipmentUid) {
      return null;
    }

    // 穿戴新装备
    setEquipmentSlotValue(heroEquipment, slot, equipmentUid);
    this._save();

    const eventData: HeroEquipmentChangedEventData = {
      heroId,
      slotType: slot,
      oldEquipmentUid,
      newEquipmentUid: equipmentUid,
    };

    this._emitHeroEquipmentChanged(eventData);

    return eventData;
  }
```

**复核要点：**
- **槽位路由**：`EQUIPMENT_TYPE_TO_SLOT[config.type]` 自动确定目标槽位
- **自动替换**：不先卸下旧装备，直接覆盖槽位值；旧装备仍在 `_data.instances` 中
- **幂等性**：`oldEquipmentUid === equipmentUid` 时直接返回 null，不触发事件
- **等级校验**：委托 `_validateLevelRequirement`，内部含 fallback（ProgressSystem 未就绪时仅 warn）

### 9.6 `unequip(heroId, slotType)` — 装备卸下

```ts
  /**
   * 功能：卸下指定英雄指定槽位的装备。
   * 输入：heroId / slotType
   * 输出：HeroEquipmentChangedEventData | null（槽位为空时 null）
   * 事件：equipment:heroChanged
   */
  unequip(heroId: string, slotType: EquipmentSlot): HeroEquipmentChangedEventData | null {
    const heroEquipment = this._getOrCreateHeroEquipment(heroId);
    const oldEquipmentUid = this._getSlotValue(heroEquipment, slotType);

    if (oldEquipmentUid === null) {
      return null;
    }

    setEquipmentSlotValue(heroEquipment, slotType, null);
    this._save();

    const eventData: HeroEquipmentChangedEventData = {
      heroId,
      slotType,
      oldEquipmentUid,
      newEquipmentUid: null,
    };

    this._emitHeroEquipmentChanged(eventData);

    return eventData;
  }
```

**复核要点：**
- 空槽位幂等：`oldEquipmentUid === null` 时直接返回 null
- 装备实例保留在背包（`_data.instances`），不删除

### 9.7 `getHeroEquipmentBonus(heroId)` — 属性汇总

```ts
  /**
   * 功能：汇总英雄三个槽位装备的属性加成，返回 PowerAttributeBonus。
   * 公式：hp = Σ(config.hp), atk = Σ(config.attack), def = Σ(config.defense), speed = 0
   * 输入：heroId
   * 输出：PowerAttributeBonus（可直接传入 PowerSystem.calculateHeroPowerFromProgress）
   */
  getHeroEquipmentBonus(heroId: string): PowerAttributeBonus {
    const heroEquipment = this._data.heroEquipment[heroId];
    if (!heroEquipment) {
      return { hp: 0, atk: 0, def: 0, speed: 0 };
    }

    const slots: (string | null)[] = [
      heroEquipment.weaponId,
      heroEquipment.armorId,
      heroEquipment.accessoryId,
    ];

    let totalHp = 0;
    let totalAtk = 0;
    let totalDef = 0;

    for (const uid of slots) {
      if (!uid) continue;
      const instance = this._data.instances[uid];
      if (!instance) continue;
      const config = this._configMap.get(instance.configId);
      if (!config) continue;

      totalHp += config.hp;
      totalAtk += config.attack;
      totalDef += config.defense;
    }

    return {
      hp: totalHp,
      atk: totalAtk,
      def: totalDef,
      speed: 0, // Phase4B 装备暂不提供速度
    };
  }
```

**复核要点：**
- 防御式编程：每一步都检查 null/undefined（heroEquipment、uid、instance、config）
- 返回的 `PowerAttributeBonus` 与 `PowerSystem.calculateHeroPowerFromProgress()` 的 `attributeBonus` 参数签名完全匹配
- speed 始终为 0（设计文档 §7.1 未包含速度）

### 9.8 `getHeroEquipmentPower(heroId)` — 独立战力

```ts
  /**
   * 功能：计算英雄装备独立战力（非属性计算的直接累加部分）。
   * 公式：Σ(equipment.power × equipmentQualityMultiplier[quality])
   * 输入：heroId
   * 输出：number — 装备独立战力总和
   * 依赖：PowerSystem.getPowerConfig() 获取品质倍率
   */
  getHeroEquipmentPower(heroId: string): number {
    const heroEquipment = this._data.heroEquipment[heroId];
    if (!heroEquipment) return 0;

    const powerConfig = PowerSystem.getInstance().getPowerConfig();
    const qualityMultiplier = powerConfig?.equipmentQualityMultiplier ?? {};

    const slots: (string | null)[] = [
      heroEquipment.weaponId,
      heroEquipment.armorId,
      heroEquipment.accessoryId,
    ];

    let totalPower = 0;

    for (const uid of slots) {
      if (!uid) continue;
      const instance = this._data.instances[uid];
      if (!instance) continue;
      const config = this._configMap.get(instance.configId);
      if (!config) continue;

      const multiplier = qualityMultiplier[config.quality] ?? 1.0;
      totalPower += Math.round(config.power * multiplier);
    }

    return totalPower;
  }
```

**复核要点：**
- 品质倍率通过 `PowerSystem.getPowerConfig()?.equipmentQualityMultiplier` 获取
- 未知品质 fallback 到 1.0
- `Math.round` 取整，避免浮点误差

### 9.9 `calculateFullHeroPower(heroId)` — 完整战力

```ts
  /**
   * 功能：计算英雄含装备加成的完整战力。
   * 公式：
   *   HeroPower =
   *     PowerSystem.calculateHeroPowerFromProgress(heroConfig, progress, levelConfig, equipmentBonus)
   *     + Σ(equipment.power × equipmentQualityMultiplier)
   * 输入：heroId
   * 输出：number — 完整战力
   * 前置条件：ProgressSystem 已加载配置
   */
  calculateFullHeroPower(heroId: string): number {
    const progressSystem = ProgressSystem.getInstance();
    const powerSystem = PowerSystem.getInstance();

    const heroProgress = progressSystem.getHeroProgress(heroId);
    const heroConfig = this._getRequiredHeroConfig(heroId);
    const levelConfig = progressSystem.getLevelConfig(heroProgress.level);

    if (!levelConfig) {
      throw new Error(`[EquipmentSystem] 缺少等级配置: level=${heroProgress.level}`);
    }

    const equipmentSummary = this.getHeroEquipmentSummary(heroId);

    const basePower = powerSystem.calculateHeroPowerFromProgress(
      heroConfig,
      heroProgress,
      levelConfig,
      equipmentSummary.attributeBonus,
    );

    return basePower + equipmentSummary.equipmentPower;
  }
```

**复核要点：**
- **两段式战力**：`basePower`（属性加权，由 PowerSystem 计算）+ `equipmentPower`（独立战力，品质倍率后直接累加）
- 与设计文档 §13.3 战力公式对齐
- 通过已有的 `PowerSystem.calculateHeroPowerFromProgress()` 注入 `attributeBonus`，不修改 Phase4A 接口

### 9.10 `syncHeroPowerAfterEquipmentChange(heroId)` — 战力同步

```ts
  /**
   * 功能：装备变更后同步战力：重算所有英雄完整战力 → 更新 ProgressSystem → 重算总战力 → 存档。
   * 流程：
   *   1. 重算受影响英雄的完整战力（含装备）
   *   2. 遍历所有含配置的英雄，逐一用 calculateFullHeroPower 重算并同步回 ProgressSystem
   *   3. 汇总计算新的阵容总战力
   *   4. 保存所有英雄进度 + 总战力到 SaveManager
   *   5. 触发 autoSave 落盘
   * 输入：heroId — 触发变更的英雄 ID
   * 输出：{ oldPower, newPower, oldTotalPower, newTotalPower }
   * 调用时机：equip() / unequip() 之后由调用方决定是否触发
   */
  syncHeroPowerAfterEquipmentChange(heroId: string): {
    oldPower: number;
    newPower: number;
    oldTotalPower: number;
    newTotalPower: number;
  } {
    const progressSystem = ProgressSystem.getInstance();
    const powerSystem = PowerSystem.getInstance();

    const heroProgress = progressSystem.getHeroProgress(heroId);
    const oldPower = heroProgress.power;
    const newPower = this.calculateFullHeroPower(heroId);

    // 更新受影响的单角色战力
    heroProgress.power = newPower;
    progressSystem.setHeroProgress(heroProgress);

    // 重算总战力：遍历所有有配置的英雄，分别计算含装备的完整战力
    const playerData = progressSystem.getPlayerProgressData();
    const oldTotalPower = playerData.totalPower;

    const heroPowers: number[] = [];
    const processedHeroIds = new Set<string>();

    for (const id of this._heroConfigMap.keys()) {
      processedHeroIds.add(id);
      try {
        const fullPower = this.calculateFullHeroPower(id);
        const progress = progressSystem.getHeroProgress(id);
        progress.power = fullPower;
        progressSystem.setHeroProgress(progress);
        heroPowers.push(fullPower);
      } catch {
        // 角色可能尚未初始化成长数据，跳过
      }
    }

    const newTotalPower = powerSystem.calculateTotalPower(heroPowers);
    playerData.totalPower = newTotalPower;
    playerData.lastGrowthAt = Date.now();
    progressSystem.setPlayerProgressData(playerData);

    // 存档：保存每个已处理英雄的进度 + 总战力
    for (const id of processedHeroIds) {
      try {
        SaveManager.getInstance().saveHeroProgressData(progressSystem.getHeroProgress(id));
      } catch {
        // 跳过
      }
    }
    SaveManager.getInstance().savePlayerProgressData(playerData);
    SaveManager.getInstance().autoSave();

    return {
      oldPower,
      newPower,
      oldTotalPower,
      newTotalPower,
    };
  }
```

**复核要点：**
- **全量重算**：遍历所有英雄而非仅受影响英雄，确保总战力正确（首次调用时"补全"所有英雄的装备贡献）
- **每个英雄的 power 同步回 ProgressSystem**，保证后续 ProgressSystem 自身的 `_recalculateTotalPower` 也能得到含装备的战力
- **异常安全**：ProgressSystem 中未初始化的英雄 catch 后跳过
- **存档完整**：英雄进度 + 总战力 + 装备数据（由 `_save()` 在 equip/unequip 中已写入）

### 9.11 内部工具方法

```ts
  /** 生成装备实例唯一 ID。格式：EQUIP_{configId}_{timestamp}_{counter} */
  private _generateUid(configId: string): string {
    this._uidCounter += 1;
    return `EQUIP_${configId}_${Date.now()}_${this._uidCounter}`;
  }

  /** 获取或创建英雄穿戴状态（懒初始化） */
  private _getOrCreateHeroEquipment(heroId: string): HeroEquipmentData {
    let data = this._data.heroEquipment[heroId];
    if (data) return data;
    data = createDefaultHeroEquipmentData(heroId);
    this._data.heroEquipment[heroId] = data;
    return data;
  }

  /** 校验英雄等级 ≥ 装备需求。ProgressSystem 未就绪时仅 warn，不阻塞穿戴 */
  private _validateLevelRequirement(heroId: string, config: EquipmentConfig): void {
    try {
      const progressSystem = ProgressSystem.getInstance();
      const heroLevel = progressSystem.getHeroLevel(heroId);
      if (heroLevel < config.levelRequirement) {
        throw new Error(
          `[EquipmentSystem] 英雄等级不足: heroId=${heroId}, heroLevel=${heroLevel}, ` +
          `equipment=${config.id}, requiredLevel=${config.levelRequirement}`,
        );
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes('英雄等级不足')) {
        throw e;
      }
      console.warn(`[EquipmentSystem] 无法校验等级需求: heroId=${heroId}, equipment=${config.id}`);
    }
  }

  /** 从 SaveManager 恢复装备运行时数据 */
  private _restoreFromSave(): void {
    const saveManager = SaveManager.getInstance();
    const savedEquipment = saveManager.loadData<PlayerEquipmentData>('equipment');
    if (savedEquipment && savedEquipment.instances) {
      this._data = {
        instances: { ...savedEquipment.instances },
        heroEquipment: { ...savedEquipment.heroEquipment },
      };
    }
  }

  /** 保存装备数据到 SaveManager 内存（不立即落盘） */
  private _save(): void {
    const saveManager = SaveManager.getInstance();
    saveManager.saveData<PlayerEquipmentData>('equipment', {
      instances: { ...this._data.instances },
      heroEquipment: { ...this._data.heroEquipment },
    });
  }
```

**复核要点：**
- `_generateUid`：counter 自增 + timestamp，单会话内唯一
- `_validateLevelRequirement`：双层 try-catch — 等级不足错误透传，其他错误（ProgressSystem 未就绪）降级为 warn
- `_restoreFromSave` / `_save`：深拷贝防御，防止引用污染
- `_getOrCreateHeroEquipment`：懒初始化，避免预先为所有英雄创建空数据

---

## 逐条审核清单

| # | 审核项 | 对应文件 | 状态 |
|---|--------|---------|------|
| 1 | EquipmentSystem 职责是否单一、模块是否过重 | EquipmentSystem.ts | 待审核 |
| 2 | 初始化顺序是否安全（ProgressSystem 先于 equip 调用） | EquipmentSystem.ts:loadConfig() | 待审核 |
| 3 | equip/unequip 是否正确处理 HeroEquipmentData | EquipmentSystem.ts:equip()/unequip() | 待审核 |
| 4 | 属性注入 PowerAttributeBonus 是否正确 | EquipmentSystem.ts:getHeroEquipmentBonus() | 待审核 |
| 5 | 战力计算是否包含装备独立战力 + 品质倍率 | EquipmentSystem.ts:calculateFullHeroPower() | 待审核 |
| 6 | 存档读写与 SaveManager 接口是否兼容 | EquipmentSystem.ts:_save()/_restoreFromSave() + SaveManager.ts | 待审核 |
| 7 | 自动替换 + 幂等性处理是否正确 | EquipmentSystem.ts:equip():L182-184 | 待审核 |
| 8 | 事件触发是否完整 | EquipmentSystem.ts:equipment:gained / equipment:heroChanged | 待审核 |
| 9 | 配置是否符合设计文档字段规范 | equipment_config.json + equipment_config.ts | 待审核 |
| 10 | PowerConfig 扩展是否向后兼容 | power_config.ts + power_config.json | 待审核 |
| 11 | EquipmentSaveData 重构是否破坏 SaveContainer | EquipmentSaveData.ts + SaveContainer.ts | 待审核 |
| 12 | 代码是否遵循项目规范（无硬编码 / 配置驱动 / BaseSystem 单例） | 全部 | 待审核 |

---

Phase4B 代码复核文档完成，可交 ChatGPT 审核。
