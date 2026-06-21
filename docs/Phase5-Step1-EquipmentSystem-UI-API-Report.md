# Phase5 Step1 — EquipmentSystem UI 查询接口补充报告

## 文件变更清单

| 操作 | 文件 | 说明 |
|------|------|------|
| **新增** | `assets/scripts/data/equipment_ui_types.ts` | Phase5 UI 层组合查询类型定义 |
| **修改** | `assets/scripts/systems/EquipmentSystem.ts` | 新增 4 个查询方法 + 1 个内部辅助方法 |

---

## 新增类型（equipment_ui_types.ts）

| 类型 | 用途 |
|------|------|
| `EquipmentInstanceDetail` | `{ instance, config }` 装备实例 + 配置的完整详情 |
| `HeroEquipmentUIData` | `HeroEquipmentData` + `HeroEquipmentSummary` 组合体，装备面板顶层数据 |
| `EquipmentSlotDetail` | 单个槽位详情（`EquipmentInstanceDetail \| null`） |
| `HeroSlotDetails` | 三槽完整详情 + 属性汇总，装备面板一次性渲染数据 |
| `EquipmentListFilter` | 背包筛选条件 `{ type?, quality? }` |
| `EquipmentListEntry` | 背包列表条目：实例 + 配置 + 穿戴状态 + 穿戴者信息 |

---

## 新增方法（EquipmentSystem.ts）

### 1. `getPlayerEquipmentList(filter?)`

```
输入：filter?: { type?: EquipmentType; quality?: EquipmentQuality }
输出：EquipmentListEntry[]
```

**功能**：
- 获取玩家所有装备实例，默认不过滤
- 支持按装备类型（Weapon/Armor/Accessory）筛选
- 支持按品质（Common/Rare/Epic/Legendary）筛选
- 每条返回实例数据 + 配置模板 + 是否已被穿戴 + 穿戴者信息
- 内部构建 `uid → 穿戴者` 反向索引，O(n) 复杂度
- 防御：配置缺失的实例自动跳过

**UI 使用场景**：装备背包面板、装备选择列表

---

### 2. `getHeroEquipmentData(heroId)`

```
输入：heroId: string
输出：HeroEquipmentUIData（永不返回 null）
```

**功能**：
- 组合查询：英雄穿戴状态 + 属性加成 + 装备独立战力
- 英雄无装备数据时返回全空默认值（3 槽位 null + 0 属性加成 + 0 战力）
- 对应设计文档 Phase5 §3.1 的 `getHeroEquipmentData` 接口

**UI 使用场景**：装备面板顶层数据绑定

---

### 3. `getEquipmentInstanceDetail(uid)`

```
输入：uid: string
输出：EquipmentInstanceDetail | null
```

**功能**：
- 一次性获取装备实例 + 配置模板
- 实例或配置不存在时返回 null

**UI 使用场景**：装备详情弹窗、装备 Tooltip

---

### 4. `getHeroSlotDetails(heroId)`

```
输入：heroId: string
输出：HeroSlotDetails
```

**功能**：
- 一次性获取三个槽位（weapon/armor/accessory）的完整详情
- 每个槽位为 `EquipmentInstanceDetail | null`
- 同时返回属性加成和装备独立战力
- 复用 `getEquipmentInstanceDetail()` 和 `getHeroEquipmentSummary()`

**UI 使用场景**：装备面板三槽渲染（替代逐个查询）

---

### 5. `_buildEquippedMap()`（private）

```
输出：Map<string, { heroId: string; slotType: EquipmentSlot }>
```

**功能**：
- 构建装备 uid → 穿戴者信息的反向索引
- 供 `getPlayerEquipmentList` 内部使用

---

## 已有方法确认（无需改动）

| 设计文档接口 | 现有方法 | 状态 |
|-------------|---------|------|
| `getEquipmentConfig(configId)` | `getEquipmentConfig(configId: string): EquipmentConfig \| null` | ✅ 已有 |
| `getHeroEquipmentSummary(heroId)` | `getHeroEquipmentSummary(heroId: string): HeroEquipmentSummary` | ✅ 已有 |
| `equip(heroId, equipmentUid)` | `equip(heroId, equipmentUid): HeroEquipmentChangedEventData \| null` | ✅ 已有 |
| `unequip(heroId, slotType)` | `unequip(heroId, slotType): HeroEquipmentChangedEventData \| null` | ✅ 已有 |
| `syncHeroPowerAfterEquipmentChange(heroId)` | `syncHeroPowerAfterEquipmentChange(heroId): { oldPower, newPower, oldTotalPower, newTotalPower }` | ✅ 已有 |

---

## Phase4B 影响评估

| 评估项 | 结论 |
|--------|------|
| 破坏已有接口 | **否** — 未修改任何已有方法签名 |
| 改动战力计算逻辑 | **否** — `calculateFullHeroPower()` / `syncHeroPowerAfterEquipmentChange()` 未改动 |
| 改动存档结构 | **否** — 未修改 `PlayerEquipmentData` / `HeroEquipmentData` / `EquipmentInstanceData` |
| 影响已有测试 | **否** — 新增方法为纯查询，不产生副作用 |

---

## 是否需要重新跑 EquipmentDebugRunner

**不需要**。原因：

1. 新增 4 个方法均为**只读查询**，不修改任何状态
2. `EquipmentDebugRunner` 的 14 项测试验证的是装备创建、穿戴、卸下、战力计算、存档恢复链路，这些链路未受影响
3. 新增方法仅组合已有数据，不引入新的数据流

（如果希望验证新方法返回值格式正确，可后续在 Phase5 UI 联调时一并验证。）

---

## 是否可以进入 UI 组件开发

**可以**。Phase5 UI 层所需的数据接口已全部就绪：

| UI 模块 | 所需数据 | 对应方法 |
|---------|---------|---------|
| 装备面板（三槽位） | 槽位状态 + 属性加成 + 战力 | `getHeroSlotDetails()` 或 `getHeroEquipmentData()` |
| 背包列表 | 装备列表 + 筛选 | `getPlayerEquipmentList(filter?)` |
| 装备详情 Tooltip | 装备配置 | `getEquipmentConfig()` 或 `getEquipmentInstanceDetail()` |
| 战力同步 | 装备变更后刷新 | `syncHeroPowerAfterEquipmentChange()`（已有） |
| 事件驱动刷新 | 穿戴/卸下/获得事件 | `equipment:heroChanged` / `equipment:gained`（已有） |

---

## 审核清单

- [x] `getPlayerEquipmentList` 支持类型+品质筛选
- [x] `getHeroEquipmentData` 返回 HeroEquipmentData + HeroEquipmentSummary 组合
- [x] `getEquipmentConfig` 已有，无需改动
- [x] `getHeroEquipmentSummary` 已有，无需改动
- [x] 所有新方法为纯查询，不产生副作用
- [x] 不破坏 Phase4B 已有接口
- [x] 不改动战力计算逻辑
- [x] 不改动存档结构
- [x] 返回数据方便 UI 层直接使用
- [x] null / undefined 防御到位
