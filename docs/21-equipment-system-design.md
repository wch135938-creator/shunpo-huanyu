# 21 装备系统设计

## 文件定位

本文档定义 Phase4B 装备系统的落地范围。

Phase4B 在 Phase4A 成长闭环稳定后接入，为英雄提供装备穿戴、属性加成与战力计算。

---

# 一、设计依据

必须遵循：

1. `docs/00-project-vision.md`
2. `docs/03-card-system.md`
3. `docs/04-combat-system.md`
4. `docs/05-progression.md`
5. `docs/10-tech-architecture.md`
6. `docs/15-development-rules.md`
7. `docs/20-growth-system-design.md`

Phase4B 承接状态：

- Phase4A 成长闭环已验收
- `PowerSystem.calculateHeroAttributes()` 已预留 `PowerAttributeBonus` 参数
- `PowerSystem.calculateHeroPowerFromProgress()` 已预留 `attributeBonus` 参数
- 战力计算链路已打通

---

# 二、Phase4B 核心目标

在 Phase4A 基础上增加装备维度：

```text
战斗 / 奖励
↓
获得装备
↓
装备进入背包数据
↓
装备到英雄
↓
属性加成注入 PowerSystem
↓
战力重算
↓
存档保存
```

---

# 三、阶段范围

## 3.1 本期必做

- 武器（Weapon）、护甲（Armor）、饰品（Accessory）三种装备类型
- Common / Rare / Epic / Legendary 四级品质
- 装备配置驱动（equipment_config.json）
- 英雄装备槽位（Weapon / Armor / Accessory 各一）
- 装备穿戴与卸下
- 装备属性接入 `PowerSystem` 战力计算
- 装备数据存档与恢复
- 装备获取（战斗奖励 / 系统发放）

## 3.2 本期不做

- 套装效果
- 装备精炼
- 装备升阶
- 宝石镶嵌
- 法宝系统
- 装备技能
- 装备特效

---

# 四、装备类型

| 类型 | 标识 | 主属性倾向 |
|------|------|-----------|
| 武器 | Weapon | 攻击 |
| 护甲 | Armor | 生命、防御 |
| 饰品 | Accessory | 综合属性 |

---

# 五、装备品质

| 品质 | 标识 | 战力倍率 |
|------|------|---------|
| 普通 | Common | 1.0 |
| 稀有 | Rare | 1.2 |
| 史诗 | Epic | 1.5 |
| 传说 | Legendary | 2.0 |

品质战力倍率在 `power_config.json` 中追加 `equipmentQualityMultiplier` 字段，不与角色 `qualityMultiplier` 混用。

---

# 六、装备槽位

每个英雄固定 3 个槽位：

| 槽位 | 类型 | 互斥规则 |
|------|------|---------|
| weaponSlot | Weapon | 同槽位仅可装备一件 |
| armorSlot | Armor | 同槽位仅可装备一件 |
| accessorySlot | Accessory | 同槽位仅可装备一件 |

---

# 七、装备属性

## 7.1 属性字段

| 字段 | 说明 |
|------|------|
| hp | 生命加成 |
| attack | 攻击加成 |
| defense | 防御加成 |
| power | 独立战力值（直接累加） |

## 7.2 属性规则

- 装备可拥有单属性或多属性
- Weapon 倾向 attack 主属性
- Armor 倾向 hp / defense 主属性
- Accessory 可混合多属性
- `power` 字段为装备独立战力，直接累加到英雄战力，不参与战斗属性计算

---

# 八、数据结构

## 8.1 EquipmentConfig（配置模板）

```ts
interface EquipmentConfig {
  id: string;            // 装备配置 ID，如 "weapon_001"
  name: string;          // 装备名称，如 "青锋剑"
  type: EquipmentType;   // Weapon | Armor | Accessory
  quality: EquipmentQuality; // Common | Rare | Epic | Legendary
  levelRequirement: number;  // 穿戴等级需求
  hp: number;            // 生命加成
  attack: number;        // 攻击加成
  defense: number;       // 防御加成
  power: number;         // 独立战力值
}
```

## 8.2 EquipmentType

```ts
enum EquipmentType {
  Weapon = 'Weapon',
  Armor = 'Armor',
  Accessory = 'Accessory',
}
```

## 8.3 EquipmentQuality

```ts
enum EquipmentQuality {
  Common = 'Common',
  Rare = 'Rare',
  Epic = 'Epic',
  Legendary = 'Legendary',
}
```

## 8.4 EquipmentInstanceData（装备实例）

```ts
interface EquipmentInstanceData {
  uid: string;           // 实例唯一 ID（运行时生成）
  configId: string;      // 指向 EquipmentConfig.id
}
```

装备实例与配置分离：配置定义模板，实例记录拥有关系。

## 8.5 HeroEquipmentData（英雄穿戴状态）

```ts
interface HeroEquipmentData {
  heroId: string;           // 英雄 ID
  weaponId: string | null;  // 穿戴的武器实例 uid，null 表示空
  armorId: string | null;   // 穿戴的护甲实例 uid
  accessoryId: string | null; // 穿戴的饰品实例 uid
}
```

## 8.6 PlayerEquipmentData（玩家装备总数据）

```ts
interface PlayerEquipmentData {
  instances: Record<string, EquipmentInstanceData>; // uid → 实例
  heroEquipment: Record<string, HeroEquipmentData>; // heroId → 穿戴状态
}
```

---

# 九、配置设计

## 9.1 equipment_config.json

路径：`assets/resources/config/systems/equipment_config.json`

格式遵循项目已有配置规范：

```json
{
  "version": "1.0.0",
  "name": "equipment_config",
  "data": [
    {
      "id": "weapon_001",
      "name": "青锋剑",
      "type": "Weapon",
      "quality": "Common",
      "levelRequirement": 1,
      "hp": 0,
      "attack": 20,
      "defense": 0,
      "power": 40
    }
  ]
}
```

## 9.2 power_config.json 扩展

在 `power_config.json` 中追加装备品质战力倍率：

```json
{
  "equipmentQualityMultiplier": {
    "Common": 1.0,
    "Rare": 1.2,
    "Epic": 1.5,
    "Legendary": 2.0
  }
}
```

---

# 十、EquipmentSystem

## 10.1 职责边界

负责：

- 装备实例创建（配置 → 实例）
- 装备穿戴与卸下校验
- 汇总英雄装备属性为 `PowerAttributeBonus`
- 计算装备总战力
- 装备数据存档与恢复

不负责：

- UI 展示
- 战斗掉落逻辑
- 装备强化/精炼/升阶
- 直接修改英雄基础属性

## 10.2 文件规划

```text
assets/scripts/systems/
└── EquipmentSystem.ts

assets/scripts/data/
├── equipment_data.ts          # EquipmentInstanceData、HeroEquipmentData、PlayerEquipmentData
├── equipment_config.ts        # EquipmentConfig、EquipmentType、EquipmentQuality
└── equipment_types.ts         # EquipmentType、EquipmentQuality 枚举

assets/resources/config/systems/
└── equipment_config.json
```

## 10.3 核心方法

| 方法 | 说明 |
|------|------|
| `createInstance(configId)` | 由配置创建装备实例 |
| `equip(heroId, equipmentUid)` | 装备到指定英雄槽位 |
| `unequip(heroId, slotType)` | 卸下指定槽位装备 |
| `getHeroEquipmentBonus(heroId)` | 汇总英雄装备属性 → `PowerAttributeBonus` |
| `getHeroEquipmentPower(heroId)` | 计算英雄装备总战力 |
| `getEquippedInstance(heroId, slotType)` | 查询槽位当前装备实例 |
| `isSlotOccupied(heroId, slotType)` | 检查槽位是否已占用 |

---

# 十一、装备获取

## 11.1 战斗奖励

战斗结算时按概率掉落装备，由 `RewardSystem` 或 `DropSystem` 调用 `EquipmentSystem.createInstance()`。

## 11.2 系统发放

新手奖励、成长奖励等直接调用 `EquipmentSystem.createInstance()` 生成装备实例加入背包。

---

# 十二、穿戴/卸下流程

## 12.1 穿戴流程

```text
校验装备实例存在
↓
校验英雄等级 ≥ 装备 levelRequirement
↓
校验目标槽位未占用（或自动替换）
↓
写入 HeroEquipmentData 对应槽位
↓
汇总装备属性 → PowerAttributeBonus
↓
PowerSystem.calculateHeroPowerFromProgress() 传入 attributeBonus
↓
重算阵容总战力
↓
SaveManager 保存
↓
派发 HERO_EQUIPMENT_CHANGED
```

## 12.2 卸下流程

```text
清空 HeroEquipmentData 对应槽位（设为 null）
↓
移除该装备的属性加成
↓
PowerSystem 重算英雄战力
↓
SaveManager 保存
↓
派发 HERO_EQUIPMENT_CHANGED
```

---

# 十三、战力计算集成

## 13.1 与 PowerSystem 对接

`EquipmentSystem.getHeroEquipmentBonus(heroId)` 汇总英雄三个槽位的装备属性，返回 `PowerAttributeBonus`：

```ts
{
  hp: sum of equipped hp,
  atk: sum of equipped attack,
  def: sum of equipped defense,
  speed: 0  // 装备暂不提供速度
}
```

调用方将 `PowerAttributeBonus` 传入 `PowerSystem.calculateHeroPowerFromProgress()` 的 `attributeBonus` 参数。

## 13.2 装备独立战力

装备 `power` 字段直接累加到英雄战力，不走属性计算：

```text
HeroPower = BasePower + LevelPower + Σ(equipment.power * equipmentQualityMultiplier[quality])
```

## 13.3 战力公式

```text
HeroPower =
  PowerSystem.calculateHeroPowerFromProgress(heroConfig, progress, levelConfig, equipmentBonus)
  + Σ(equipment.power × equipmentQualityMultiplier)

TotalPower = Σ HeroPower
```

---

# 十四、存档集成

## 14.1 存档数据

`PlayerEquipmentData` 整体由 `SaveManager` 统一管理。

保存内容：

- 所有装备实例（`instances`）
- 所有英雄穿戴状态（`heroEquipment`）

## 14.2 加载恢复

1. `SaveManager` 加载 `PlayerEquipmentData`
2. `EquipmentSystem` 初始化实例缓存
3. 英雄属性计算时查询穿戴状态
4. 战力重算时自动包含装备加成

---

# 十五、事件

| 事件 | 触发时机 | 数据 |
|------|---------|------|
| `EQUIPMENT_GAINED` | 获得新装备实例 | `{ equipmentUid, configId }` |
| `HERO_EQUIPMENT_CHANGED` | 穿戴或卸下 | `{ heroId, slotType, oldEquipmentUid, newEquipmentUid }` |

---

# 十六、未来扩展预留

| 扩展方向 | 预留方式 |
|----------|---------|
| 套装系统 | `EquipmentConfig` 追加 `setId` 字段；`EquipmentSystem` 追加套装匹配逻辑 |
| 装备精炼 | `EquipmentInstanceData` 追加 `refineLevel`；配置追加精炼消耗表 |
| 装备升阶 | `EquipmentInstanceData` 追加 `advanceLevel`；配置追加升阶消耗与属性成长表 |
| 宝石镶嵌 | `EquipmentInstanceData` 追加 `gemSlots` 数组；新增 `GemSystem` |
| 法宝系统 | 新增 `ArtifactSystem`，独立于 `EquipmentSystem`，复用 `PowerAttributeBonus` 注入 |
| 装备技能 | `EquipmentConfig` 追加 `skillId`；战斗系统按装备查询技能 |
| 装备特效 | `EquipmentConfig` 追加 `effectId`；战斗系统按装备应用特效 |

所有扩展通过追加字段和新增 System 实现，不破坏现有 `EquipmentConfig` / `EquipmentInstanceData` / `PowerAttributeBonus` 接口。

---

# 十七、验收标准

Phase4B 通过必须满足：

1. 武器、护甲、饰品三种类型可配置、可创建实例
2. Common / Rare / Epic / Legendary 四级品质可区分
3. 英雄可穿戴装备到对应槽位
4. 同槽位不可重复穿戴（替换需先卸下或自动替换）
5. 英雄可卸下已穿戴装备
6. 装备属性通过 `PowerAttributeBonus` 传入 `PowerSystem`
7. 穿戴/卸下后英雄战力正确重算
8. 阵容总战力包含装备加成
9. 装备数据可通过 `SaveManager` 保存与恢复
10. 所有装备数值来自 `equipment_config.json`
11. 不破坏 Phase3 战斗闭环
12. 不破坏 Phase4A 成长闭环

---

# 十八、Phase10 装备成长经济规则

## 18.1 升级与强化消耗

- 装备升级和强化都必须同时消耗金币与装备强化石。
- 装备品质越高、当前等级或强化等级越高，金币与强化石消耗越高。
- 史诗、传说装备进入后期阶段后，可额外少量消耗钻石。
- 所有成本、启用等级、等级上限和分解返还比例必须来自 `equipment_config.json`，逻辑代码不得硬编码数值。

## 18.2 资源职责

- 金币：通用养成消耗，用于形成长期货币回收。
- 装备强化石：装备成长专属材料，通过战斗掉落和装备分解获得。
- 钻石：稀缺通用资源，仅用于后期高级成长，不得成为新手期基础成长门槛。

## 18.3 分解返还

- 装备分解按配置比例返还强化石。
- 金币和钻石不通过装备分解返还，避免循环刷取通用货币。

## 18.4 广告边界

- 装备系统只负责消费资源，不直接调用广告。
- 金币或钻石不足时，可由后续 `AdManager` 提供自愿观看的额外资源入口。
- 广告奖励必须通过 `InventoryService` 入库，并设置每日次数与冷却限制。
