# Phase5 Step2 — Equipment UI Components 开发报告

## 新增文件清单

| # | 文件 | 行数 | 职责 |
|---|------|------|------|
| 1 | `assets/scripts/ui/Phase5EquipmentMockData.ts` | ~235 | Mock 数据工厂 + 品质颜色映射 |
| 2 | `assets/scripts/ui/EquipmentSlotItem.ts` | ~175 | 单个装备槽位组件 |
| 3 | `assets/scripts/ui/EquipmentListItem.ts` | ~175 | 背包列表条目组件 |
| 4 | `assets/scripts/ui/EquipmentBagPanel.ts` | ~270 | 装备背包面板（筛选 + 列表） |
| 5 | `assets/scripts/ui/EquipmentPanel.ts` | ~230 | 装备面板（三槽 + 属性 + 管理背包弹窗） |

---

## UI 结构图

```
EquipmentPanel (BasePanel)  ← 顶层：装备界面
├── heroIdLabel             ← 英雄 ID（调试）
├── [Attribute Bonus]       ← 属性加成区域
│   ├── hpBonusLabel        ← "HP +120"
│   ├── atkBonusLabel       ← "ATK +28"
│   └── defBonusLabel       ← "DEF +14"
├── equipmentPowerLabel     ← "装备战力 105"
├── [3 EquipmentSlotItems]  ← 槽位区域
│   ├── weaponSlot          ← 武器槽（点击→ 卸下 / 打开背包）
│   ├── armorSlot           ← 护甲槽
│   └── accessorySlot       ← 饰品槽
├── closeButton             ← 关闭面板
└── EquipmentBagPanel       ← 子面板（弹窗），点击空槽位时打开
    ├── titleLabel          ← "选择装备 · Weapon"
    ├── filterHintLabel     ← "全部类型 · 全部品质 · 9 件"
    ├── [类型筛选按钮]       ← 全部 / Weapon / Armor / Accessory
    ├── [品质筛选按钮]       ← 全部 / Common / Rare / Epic / Legendary
    ├── ScrollView          ← 装备滚动列表
    │   └── contentNode
    │       └── EquipmentListItem × N  ← 动态实例化
    │           ├── qualityBarNode     ← 品质颜色条
    │           ├── nameLabel          ← "青锋剑"
    │           ├── qualityLabel       ← "普通"
    │           ├── statsLabel         ← "ATK+20"
    │           ├── powerLabel         ← "战力 40"
    │           └── equippedBadgeNode  ← "已装备·Weapon"
    ├── emptyHintNode        ← 空列表提示
    └── closeButton          ← 关闭背包
```

---

## 组件职责矩阵

| 组件 | 继承 | 数据输入 | 事件输出 | 依赖 |
|------|------|---------|---------|------|
| **EquipmentPanel** | BasePanel | `HeroSlotDetails` | `onEquip / onUnequip` 回调 | EquipmentBagPanel, EquipmentSlotItem, EventManager |
| **EquipmentBagPanel** | BasePanel | `EquipmentListEntry[]` + 筛选 | `onEquip / onClose` 回调 | EquipmentListItem, Prefab, EventManager |
| **EquipmentSlotItem** | Component | `EquipmentInstanceDetail \| null` | `SlotClickCallback(slotType, equipped)` | 无（纯叶子组件） |
| **EquipmentListItem** | Component | `EquipmentListEntry` | `ItemClickCallback(entry)` | 无（纯叶子组件） |
| **Phase5EquipmentMockData** | — | — | 工厂函数 | 仅依赖 TypeScript 类型 |

---

## Mock 数据结构

### 品质颜色映射（配置驱动，后续移入 UI 配置表）

| 品质 | 颜色 | 中文标签 |
|------|------|---------|
| Common | `#9CA3AF` 灰 | 普通 |
| Rare | `#3B82F6` 蓝 | 稀有 |
| Epic | `#8B5CF6` 紫 | 史诗 |
| Legendary | `#F59E0B` 金 | 传说 |

### Mock 场景

**场景 A：英雄已穿戴三件装备**

```
英雄 CARD_301：
  Weapon:     weapon_001  青锋剑  (Common,  ATK+20,  Power 40)
  Armor:      armor_001   布衣    (Common,  HP+80 DEF+10, Power 30)
  Accessory:  acc_001     铜戒    (Common,  HP+40 ATK+8 DEF+4, Power 35)
  属性加成：HP+120, ATK+28, DEF+14
  装备战力：105

背包（9件）：
  weapon_001 青锋剑    [已装备·Weapon]
  weapon_002 寒铁重剑  (Rare)
  weapon_003 紫电仙剑  (Epic)
  armor_001  布衣      [已装备·Armor]
  armor_002  玄铁护甲  (Rare)
  armor_003  天蚕宝甲  (Epic)
  acc_001    铜戒      [已装备·Accessory]
  acc_003    凤凰翎    (Epic)
  acc_004    混沌珠    (Legendary)
```

**场景 B：空英雄**

```
英雄 CARD_301：
  三槽全空，属性加成 0，装备战力 0
  背包 6 件装备，全部未穿戴
```

---

## 交互流程验证

### 装备流程
```
用户点击空槽位（Weapon）
  → EquipmentPanel._handleOpenBag(Weapon)
  → EquipmentBagPanel.open(heroId, entries, callbacks, Weapon)
    → 自动筛选 type=Weapon
    → 渲染过滤后的装备列表
  → 用户点击 "寒铁重剑"
    → EquipmentListItem._handleClick()
    → EquipmentBagPanel._handleItemClick(entry)
    → callbacks.onEquip(heroId, uid)
    → 外部执行 equip → 获取新的 HeroSlotDetails
    → EquipmentPanel.refresh(newSlotDetails)
      → 三槽刷新 / 属性刷新 / 战力刷新
    → EquipmentBagPanel.hide()
```

### 卸下流程
```
用户点击已装备槽位（Weapon，当前装备青锋剑）
  → EquipmentPanel._handleUnequip(Weapon)
  → callbacks.onUnequip(heroId, Weapon)
  → 外部执行 unequip → 获取新的 HeroSlotDetails
  → EquipmentPanel.refresh(newSlotDetails)
    → 武器槽清空 / 属性刷新 / 战力刷新
```

### 筛选流程
```
EquipmentBagPanel 打开后：
  → 点击 "Epic" 品质筛选按钮
    → _setQualityFilter(Epic)
    → 仅显示 Epic 品质装备
  → 点击 "全部类型" 按钮
    → _setTypeFilter(null)
    → 恢复显示所有类型
```

---

## 编辑器设置要求

每个组件的 `@property` 绑定需求：

### EquipmentPanel
| 属性 | 类型 | 说明 |
|------|------|------|
| panelRoot | Node | 面板根节点 |
| weaponSlot | EquipmentSlotItem | 挂载了 EquipmentSlotItem 组件的节点 |
| armorSlot | EquipmentSlotItem | 同上 |
| accessorySlot | EquipmentSlotItem | 同上 |
| hpBonusLabel | Label | HP 加成文本 |
| atkBonusLabel | Label | ATK 加成文本 |
| defBonusLabel | Label | DEF 加成文本 |
| equipmentPowerLabel | Label | 装备战力文本 |
| heroIdLabel | Label | 英雄 ID（调试） |
| bagPanel | EquipmentBagPanel | 子面板节点 |
| closeButton | Button | 关闭按钮 |

### EquipmentBagPanel
| 属性 | 类型 | 说明 |
|------|------|------|
| panelRoot | Node | 面板根节点 |
| scrollView | ScrollView | 滚动视图 |
| contentNode | Node | ScrollView content |
| itemTemplate | Prefab | EquipmentListItem 的 Prefab |
| titleLabel | Label | 面板标题 |
| filterHintLabel | Label | 筛选状态 |
| typeAllBtn ~ typeAccessoryBtn | Button×4 | 类型筛选按钮 |
| qualityAllBtn ~ qualityLegendaryBtn | Button×5 | 品质筛选按钮 |
| closeButton | Button | 关闭按钮 |
| emptyHintNode | Node | 空列表提示 |

### EquipmentSlotItem
| 属性 | 类型 | 说明 |
|------|------|------|
| borderNode | Node | 品质边框 |
| iconNode | Node | 装备图标 |
| slotNameLabel | Label | 槽位名称 |
| equipmentNameLabel | Label | 装备名称 |
| statsLabel | Label | 属性简览 |
| qualityLabel | Label | 品质标签 |
| powerLabel | Label | 战力标签 |
| clickButton | Button | 点击按钮 |
| slotType | string | 槽位类型枚举值 |

### EquipmentListItem
| 属性 | 类型 | 说明 |
|------|------|------|
| qualityBarNode | Node | 品质颜色条 |
| nameLabel | Label | 装备名称 |
| qualityLabel | Label | 品质 |
| statsLabel | Label | 属性 |
| powerLabel | Label | 战力 |
| equippedBadgeNode | Node | 已装备标识 |
| equippedLabel | Label | 已装备文本 |
| clickButton | Button | 点击按钮 |
| bgNode | Node | 背景节点 |

---

## 验收标准对照

| 标准 | 状态 | 说明 |
|------|------|------|
| 三槽位正常显示 | ✅ | EquipmentPanel 驱动 3 个 EquipmentSlotItem |
| 背包列表正常显示 | ✅ | EquipmentBagPanel 动态创建 EquipmentListItem |
| 品质颜色正常显示 | ✅ | QUALITY_COLOR_MAP 映射，borderNode / qualityBarNode 着色 |
| 支持装备 | ✅ | 空槽位 → 打开背包 → 点击条目 → onEquip 回调 |
| 支持卸下 | ✅ | 已装备槽位点击 → onUnequip 回调 |
| UI 刷新正确 | ✅ | refresh() 重绘槽位/属性/战力 |
| 不报错 | ✅ | 所有方法有 null 防御，contentNode/template 缺失时有 warn |
| 支持 Mock 数据运行 | ✅ | Phase5EquipmentMockData 提供 2 个独立场景 |

---

## 是否可进入真实数据联调

**可以**。组件已具备接入真实 EquipmentSystem 的条件：

1. 所有组件通过回调与外部交互，不直接依赖 EquipmentSystem
2. 真实联调时只需将 Mock 数据替换为 EquipmentSystem 方法调用：
   - `createMockFullScenario()` → `equipmentSystem.getHeroSlotDetails(heroId)`
   - `mockScenario.bagEntries` → `equipmentSystem.getPlayerEquipmentList(filter)`
   - Mock 回调 → `equipmentSystem.equip()` / `equipmentSystem.unequip()`
3. 事件 `equipment:heroChanged` 的监听已在面板中注册
4. Panel 的 `refresh()` 方法设计为接收真实数据格式

**建议联调顺序**：
1. 先创建 Prefab（EquipmentListItem）+ Scene 绑定 @property
2. 用 Mock 数据验证 UI 渲染和交互
3. 将 Mock 回调替换为真实 EquipmentSystem 调用
4. 添加 `syncHeroPowerAfterEquipmentChange()` 到 equip/unequip 回调中
