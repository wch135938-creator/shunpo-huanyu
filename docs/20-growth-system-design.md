# Phase4 成长系统落地设计

## 文件定位

本文档定义 Phase4 成长系统的落地范围。

本阶段目标不是完成全部长期养成，而是把 Phase3 已验收通过的战斗闭环，接入可验证、可保存、可展示的成长闭环。

Phase4 拆分为：

- Phase4A：经验、角色等级、属性成长、战力、存档、验收
- Phase4B：简化装备，仅作为后续扩展预留，不作为 Phase4A 必过项

---

# 一、设计依据

必须遵循：

1. `docs/00-project-vision.md`
2. `docs/01-core-gameplay.md`
3. `docs/02-game-loop.md`
4. `docs/03-card-system.md`
5. `docs/04-combat-system.md`
6. `docs/05-progression.md`
7. `docs/10-tech-architecture.md`
8. `docs/15-development-rules.md`
9. `docs/16-mvp-development-roadmap.md`
10. `docs/19-Phase3-Acceptance-Report.md`

Phase4 承接状态：

- Phase1 已完成
- Phase2 已完成
- Phase3 战斗闭环运行时验收通过
- `BATTLE_ENDED -> STAGE_BATTLE_FINISHED` 链路已打通
- 胜利结算已有金币、经验奖励汇总

---

# 二、Phase4 核心目标

Phase4 只回答一个问题：

玩家打完一场战斗后，是否能明确感觉自己变强了？

Phase4A 完成后必须形成循环：

```text
战斗
↓
获得金币 / 经验
↓
角色获得经验
↓
角色升级
↓
属性提升
↓
战力提升
↓
存档保存
↓
挑战更高关卡
```

Phase4B 在 Phase4A 稳定后再接入：

```text
战斗 / 奖励
↓
获得装备
↓
装备进入数据
↓
穿戴或强化
↓
属性与战力提升
```

---

# 三、阶段范围

## 3.1 Phase4A 必做范围

Phase4A 必须完成：

- 战斗经验进入成长系统
- 角色经验累积
- 角色等级提升
- 角色等级属性成长
- 单角色战力计算
- 阵容总战力计算
- 成长数据存档
- 成长数据恢复
- 成长验收日志或 UI 展示
- 预留装备扩展接口

## 3.2 Phase4B 预留范围

Phase4B 仅作为后续扩展，不作为 Phase4A 必过项。

Phase4B 预留内容：

- 简化装备数据结构
- 装备配置目录
- 装备属性接入战力的扩展点
- 装备获得事件
- 装备穿戴事件

Phase4A 不要求：

- 战斗奖励生成装备
- 装备进入玩家装备数据
- 装备穿戴后战力变化
- 装备强化
- 装备 UI

## 3.3 暂不实现内容

以下内容不在 Phase4A 实现：

- 抽卡卡池
- 升星系统
- 突破系统
- 技能升级
- 图鉴系统
- 法宝系统
- 完整 Roguelike 祝福
- 复杂经济系统

---

# 四、成长设计原则

## 4.1 爽感优先

玩家每次进入成长链路，必须看到至少一种正反馈：

- 角色经验增加
- 角色等级提升
- 属性数值提升
- 战力数字提升
- 最高关卡推进

## 4.2 配置驱动

以下数值必须来自配置：

- 角色初始属性
- 角色等级上限
- 升级所需经验
- 等级属性成长
- 战力计算权重
- Phase4B 预留装备属性
- Phase4B 预留装备品质
- Phase4B 预留装备强化消耗

禁止在逻辑代码中硬编码成长数值。

配置目录统一使用：

```text
assets/resources/config/systems/
```

不使用：

```text
assets/config/systems/
```

## 4.3 MVP 收束

Phase4A 优先做少而完整：

- 只实现角色等级 1 条主成长线
- 只实现可验证战力变化
- 只实现可保存、可恢复的成长数据
- 只预留装备扩展接口，不接入装备必过验收

暂不引入升星、突破、技能升级，避免成长系统失控。

## 4.4 广告不参与基础成长

Phase4A 可预留广告加速入口，但不接入强依赖。

不看广告：

- 可以正常获得经验
- 可以正常升级
- 可以正常提升战力

看广告：

- 后续 Phase7 可获得额外奖励或加速收益

---

# 五、系统边界

## 5.1 新增系统建议

```text
assets/scripts/systems/
├── ProgressSystem.ts
└── PowerSystem.ts

assets/scripts/data/
├── PlayerProgressData.ts
└── HeroProgressData.ts

assets/resources/config/systems/
├── level-config
└── power-config
```

Phase4B 预留：

```text
assets/scripts/systems/
└── EquipmentSystem.ts

assets/scripts/data/
└── EquipmentData.ts

assets/resources/config/systems/
└── equipment-config
```

实际文件命名可根据当前项目已有目录与配置格式调整，但职责边界必须保持一致。

## 5.2 ProgressSystem

负责：

- 接收战斗结算经验
- 发放角色经验
- 判断角色升级
- 计算等级成长属性
- 发出成长事件

不负责：

- UI 展示
- 战斗调度
- 装备属性计算
- 直接写本地存储

## 5.3 PowerSystem

负责：

- 汇总角色基础属性
- 汇总角色等级成长属性
- 计算单角色战力
- 计算阵容总战力
- 为 Phase4B 预留装备属性接入点

不负责：

- 修改角色经验
- 修改角色等级
- 修改装备数据
- 直接操作 UI

## 5.4 EquipmentSystem

Phase4A 不要求实现完整 `EquipmentSystem`。

如预留接口，只允许定义边界：

- 装备属性未来如何接入 `PowerSystem`
- 装备数据未来如何进入 `SaveManager`
- 装备事件未来如何通过 `EventManager` 派发

不得把装备作为 Phase4A 验收阻塞项。

---

# 六、数据结构设计

## 6.1 HeroProgressData

定位：

`HeroProgressData` 是角色成长主数据。

用途：

保存单个角色的成长状态，并作为 Phase4A 属性成长与战力计算的主要输入。

建议字段：

```ts
interface HeroProgressData {
  heroId: string;
  level: number;
  exp: number;
  power: number;
}
```

说明：

- `heroId` 指向角色配置。
- `level` 表示角色等级。
- `exp` 表示当前等级内或累计经验，具体口径必须在实现时统一。
- `power` 表示该角色当前战力缓存，由 `PowerSystem` 计算。

Phase4A 暂不包含：

- star
- breakthrough
- skillLevel
- bondLevel
- equippedWeaponId
- equippedArmorId
- equippedAccessoryId

装备字段等 Phase4B 实现时再扩展或挂接。

## 6.2 PlayerProgressData

定位：

`PlayerProgressData` 是账号成长、最高关卡、总战力缓存数据。

用途：

保存账号级成长状态和汇总信息，不作为单个角色属性成长的主数据。

建议字段：

```ts
interface PlayerProgressData {
  playerLevel: number;
  playerExp: number;
  totalPower: number;
  highestStageId: string;
  lastGrowthAt: number;
}
```

说明：

- `playerLevel` 暂作为账号等级或展示字段。
- `playerLevel` 暂不参与战斗属性计算。
- `playerExp` 暂作为账号经验或后续账号等级扩展字段。
- `totalPower` 是阵容总战力缓存，由 `PowerSystem` 汇总。
- `highestStageId` 用于关卡推进、挂机收益和后续功能解锁。
- `lastGrowthAt` 用于记录最近成长时间，便于后续离线收益或数据分析。

## 6.3 EquipmentData

定位：

`EquipmentData` 是 Phase4B 预留数据。

Phase4A 不要求落地装备实例数据。

建议字段：

```ts
interface EquipmentData {
  uid: string;
  configId: string;
  level: number;
  ownerHeroId?: string;
  locked: boolean;
}
```

说明：

- `uid` 是装备实例唯一 ID。
- `configId` 指向装备配置。
- `ownerHeroId` 为空表示未穿戴。
- Phase4A 只需预留扩展方向，不要求生成、保存或穿戴装备。

---

# 七、配置设计

配置根目录：

```text
assets/resources/config/systems/
```

## 7.1 LevelConfig

用途：

定义角色等级成长。

建议字段：

```ts
interface LevelConfig {
  level: number;
  requiredExp: number;
  hpGrowthRate: number;
  atkGrowthRate: number;
  defGrowthRate: number;
  speedGrowthRate: number;
}
```

规则：

- 等级上限 Phase4A 建议先开放到 30 级。
- 后续再扩展到 `05-progression.md` 定义的 100 级。
- 前 10 级升级速度必须快，确保 3 分钟内有成长反馈。

## 7.2 PowerConfig

用途：

定义战力计算权重。

建议字段：

```ts
interface PowerConfig {
  hpWeight: number;
  atkWeight: number;
  defWeight: number;
  speedWeight: number;
  qualityMultiplier: Record<string, number>;
}
```

战力公式建议：

```text
power =
  hp * hpWeight
  + atk * atkWeight
  + def * defWeight
  + speed * speedWeight

finalPower = power * qualityMultiplier
```

具体权重必须走配置。

## 7.3 EquipmentConfig

用途：

定义 Phase4B 简化装备基础属性。

Phase4A 只预留配置目录和读取扩展点，不要求接入验收。

建议字段：

```ts
interface EquipmentConfig {
  id: string;
  name: string;
  slot: string;
  quality: string;
  baseHp: number;
  baseAtk: number;
  baseDef: number;
  baseSpeed: number;
  growthPerLevel: number;
  maxLevel: number;
  sellGold: number;
}
```

Phase4B 装备部位建议先开放：

- 武器
- 护甲
- 饰品

暂不开放：

- 头盔
- 法宝
- 套装
- 精炼
- 升阶

---

# 八、Phase4A 成长流程

## 8.1 战斗胜利成长流程

```text
BATTLE_ENDED
↓
STAGE_BATTLE_FINISHED
↓
RewardSystem 汇总奖励
↓
ProgressSystem 发放经验
↓
ProgressSystem 判断角色升级
↓
PowerSystem 重算角色战力
↓
PowerSystem 重算阵容总战力
↓
SaveManager 保存成长数据
↓
EventManager 派发成长结果
```

## 8.2 战斗失败成长流程

失败不应完全无收益。

失败时允许：

- 获得部分金币
- 获得部分经验

失败成长目标：

让玩家知道差一点，强化后可以再试。

## 8.3 角色升级流程

```text
获得经验
↓
写入 HeroProgressData.exp
↓
查询 LevelConfig
↓
满足 requiredExp
↓
HeroProgressData.level + 1
↓
重新计算角色属性
↓
重新计算角色战力
↓
重新计算总战力
↓
派发 HERO_LEVEL_UP
```

## 8.4 总战力缓存流程

```text
任意角色等级变化
↓
PowerSystem 重算该角色战力
↓
PowerSystem 汇总阵容总战力
↓
写入 PlayerProgressData.totalPower
↓
SaveManager 保存
↓
派发 TOTAL_POWER_CHANGED
```

---

# 九、Phase4B 装备扩展预留

Phase4B 装备流程建议：

```text
获得装备
↓
写入 EquipmentData
↓
判断是否优于当前装备
↓
可提示一键穿戴
↓
穿戴后重算属性
↓
重算战力
↓
派发 HERO_EQUIPMENT_CHANGED
```

Phase4A 只需要保证：

- `PowerSystem` 未来可以接收装备属性加成。
- `SaveManager` 未来可以保存装备数据。
- `EventManager` 未来可以派发装备事件。
- 当前验收不依赖装备生成、穿戴或强化。

---

# 十、事件设计

所有系统通信必须通过 `EventManager`。

## 10.1 Phase4A 必需事件

建议事件：

```text
HERO_EXP_GAINED
HERO_LEVEL_UP
HERO_POWER_CHANGED
TOTAL_POWER_CHANGED
GROWTH_RESULT_READY
```

## 10.2 Phase4B 预留事件

建议事件：

```text
EQUIPMENT_GAINED
HERO_EQUIPMENT_CHANGED
```

Phase4A 不要求触发 Phase4B 事件。

## 10.3 GROWTH_RESULT_READY

用途：

给结算界面或调试 Runner 展示本次成长变化。

建议数据：

```ts
interface GrowthResultData {
  expGain: number;
  goldGain: number;
  levelUpHeroIds: string[];
  oldTotalPower: number;
  newTotalPower: number;
  powerDelta: number;
}
```

Phase4B 扩展时可追加：

```ts
gainedEquipmentIds?: string[];
```

---

# 十一、UI 展示要求

Phase4A 不强制完成完整 UI，但成长结果必须可被展示或调试验证。

后续 UI 必须展示：

- 本次获得经验
- 本次获得金币
- 是否升级
- 原战力
- 新战力
- 战力提升值

显示示例：

```text
战力 12000 -> 13520
+1520
```

UI 不得直接修改成长数据。

正确链路：

```text
GrowthPanel
↓
ProgressManager / System
↓
ProgressData
```

---

# 十二、数值节奏

## 12.1 新手期目标

前 10 分钟必须满足：

- 至少 3 次角色升级
- 至少 1 次明显战力提升
- 至少 1 次因成长通关更高关卡

## 12.2 30 秒循环

30 秒内至少出现：

- 经验增长
- 金币增长
- 战斗胜利
- 战力变化提示

## 12.3 3 分钟循环

3 分钟内至少出现：

- 角色升级
- 战力提升

## 12.4 15 分钟循环

15 分钟内至少出现：

- 阵容总战力明显提升
- 推进多个关卡
- 解锁下一个成长目标

---

# 十三、存档要求

成长数据必须由 `SaveManager` 统一保存。

## 13.1 Phase4A 必须保存

- 玩家等级
- 玩家经验
- 角色等级
- 角色经验
- 单角色战力
- 总战力
- 当前最高关卡
- 最近成长时间

## 13.2 Phase4B 预留保存

- 装备实例
- 装备穿戴关系
- 装备强化等级

Phase4A 不要求保存装备数据。

禁止：

- UI 直接写本地存储
- System 绕过 SaveManager 直接写 `localStorage`
- 战力只存在内存不落盘

---

# 十四、Debug 验收入口

Phase4A 应新增或扩展调试 Runner。

建议名称：

```text
GrowthDebugRunner
```

或在现有战斗调试入口中追加成长验收段。

调试能力：

- 模拟完成一场胜利战斗
- 发放经验
- 发放金币
- 触发角色升级
- 重算角色战力
- 重算阵容总战力
- 写入 `PlayerProgressData.totalPower`
- 打印成长结果
- 验证存档写入
- 验证存档读取
- 验证装备扩展接口已预留

---

# 十五、Phase4A 验收标准

Phase4A 通过必须满足：

1. 战斗胜利后可以获得经验。
2. 战斗胜利后可以获得金币。
3. 经验可以写入 `HeroProgressData`。
4. 至少 1 名角色可以升级。
5. 角色升级后属性增加。
6. 角色升级后单角色战力增加。
7. 阵容总战力可以重新计算。
8. `PlayerProgressData.totalPower` 可以更新。
9. `playerLevel` 暂不参与战斗属性计算。
10. 成长数据可以通过 `SaveManager` 保存。
11. 重启或重新加载后成长数据可以恢复。
12. 成长结果可以通过日志或 UI 明确展示。
13. 所有成长数值来自配置。
14. 配置目录使用 `assets/resources/config/systems/`。
15. 无硬编码成长数值。
16. 预留装备扩展接口。
17. 不破坏 Phase3 战斗闭环验收。

Phase4A 不要求：

- 战斗奖励生成装备。
- 装备进入玩家装备数据。
- 装备穿戴后属性或战力发生变化。

推荐验收日志：

```text
[GrowthTest] Phase4A 成长闭环测试开始
[GrowthTest] 战斗奖励: exp=84 gold=133
[GrowthTest] 经验写入: CARD_301 exp +84
[GrowthTest] 角色升级: CARD_301 Lv.1 -> Lv.2
[GrowthTest] 属性提升: ATK 200 -> 216
[GrowthTest] 单体战力提升: CARD_301 1200 -> 1360 (+160)
[GrowthTest] 阵容战力提升: 12000 -> 12160 (+160)
[GrowthTest] PlayerProgressData.totalPower 更新完成
[GrowthTest] playerLevel 未参与战斗属性计算
[GrowthTest] 装备扩展接口预留完成
[GrowthTest] 存档写入完成
[GrowthTest] 存档读取验证通过
[GrowthTest] ========== Phase4A 成长闭环验证通过 ==========
```

---

# 十六、KPI 影响

Phase4A 主要影响：

- 首日战力提升
- 平均在线时长
- 主线通关率
- D1 留存
- D3 留存

目标关系：

- 角色升级提升首日战力提升。
- 战力变化展示提升成长感。
- 存档恢复保证持续游玩。
- 更高关卡挑战驱动继续在线。
- 装备预留接口降低 Phase4B 接入成本。

---

# 十七、风险与限制

## 17.1 风险：成长线过多

表现：

同时做升级、装备、升星、突破、技能、装备精炼。

处理：

Phase4A 只允许经验、等级、属性、战力、存档。

## 17.2 风险：战力公式失控

表现：

战力暴涨但战斗无明显变化。

处理：

战力权重配置化，并用同一套属性参与战斗计算。

## 17.3 风险：账号等级误用

表现：

`playerLevel` 直接参与角色战斗属性，导致账号成长与角色成长边界混乱。

处理：

Phase4A 明确：`playerLevel` 暂不参与战斗属性计算。

## 17.4 风险：装备提前变成阻塞项

表现：

Phase4A 因装备掉落、穿戴、强化未完成而无法验收。

处理：

装备只作为 Phase4B 扩展预留，不作为 Phase4A 必过项。

## 17.5 风险：破坏 Phase3

表现：

成长接入后战斗无法完成或奖励结算异常。

处理：

成长逻辑只监听战斗结果，不反向侵入战斗调度。

---

# 十八、开发顺序建议

## 18.1 Phase4A

1. 定义 `HeroProgressData`。
2. 定义 `PlayerProgressData`。
3. 定义 `LevelConfig`。
4. 定义 `PowerConfig`。
5. 实现 `PowerSystem`。
6. 实现 `ProgressSystem`。
7. 接入战斗结算经验与金币。
8. 接入 `SaveManager`。
9. 派发 `EventManager` 成长事件。
10. 预留装备扩展接口。
11. 增加成长调试验收入口。
12. 跑通 Phase4A 验收日志。
13. 确认 Phase3 验收不回归。

## 18.2 Phase4B

1. 定义 `EquipmentData`。
2. 定义 `EquipmentConfig`。
3. 实现简化 `EquipmentSystem`。
4. 接入装备获得。
5. 接入装备穿戴。
6. 接入装备属性到 `PowerSystem`。
7. 接入装备存档。
8. 增加装备验收日志。

---

# 十九、最终原则

Phase4A 不追求系统完整。

Phase4A 只追求一件事：

玩家打完战斗后，能看到经验进入角色成长系统，并明确感受到自己变强。

Phase4B 再处理装备。

如果某个设计不能服务 Phase4A 目标，延期到后续 Phase。
