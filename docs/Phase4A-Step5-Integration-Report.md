# Phase4A Step5 Integration Report

项目：《瞬破寰宇》微信小游戏

工程路径：`E:\CocosProjects\TestGame\TestGame`

报告日期：2026-06-01

报告范围：Phase4A Step1 ~ Step4 的成长系统集成状态整理

---

# 1. 本阶段目标

Phase4A 的目标是建立最小成长闭环基础：

```text
角色经验
↓
角色等级
↓
属性成长
↓
战力计算
↓
成长数据存档
```

当前 Step5 不接入战斗，不修改 BattleSystem / BattleManager，不实现装备，不实现 UI。

---

# 2. 已完成内容

## 2.1 Step1：成长数据与配置

已新增角色成长主数据：

- `assets/scripts/data/hero_progress_data.ts`
- `assets/scripts/data/player_progress_data.ts`

已新增配置类型：

- `assets/scripts/config/level_config.ts`
- `assets/scripts/config/power_config.ts`

已新增配置 JSON：

- `assets/resources/config/systems/level_config.json`
- `assets/resources/config/systems/power_config.json`

配置解析结果：

- `level_config.json` JSON 解析通过，`data` 数量为 30。
- `power_config.json` JSON 解析通过，`data` 数量为 1。

设计符合 `docs/20-growth-system-design.md`：

- `HeroProgressData` 是角色成长主数据。
- `PlayerProgressData` 是账号成长、最高关卡、总战力缓存数据。
- `playerLevel` 暂不参与战斗属性计算。
- 配置目录使用 `assets/resources/config/systems/`。

## 2.2 Step2：PowerSystem

已新增：

- `assets/scripts/systems/PowerSystem.ts`

职责：

- 读取 `power_config`
- 根据角色基础属性和等级成长配置计算角色属性
- 计算单角色战力
- 汇总阵容总战力
- 预留属性加成入口，用于后续装备或 Buff 扩展

当前未做：

- 未接入战斗
- 未接入存档
- 未实现装备
- 未实现 UI

## 2.3 Step3：ProgressSystem

已新增：

- `assets/scripts/systems/ProgressSystem.ts`

职责：

- 读取 `level_config`
- 发放角色经验
- 查询角色等级和经验
- 判断升级
- 支持连续升级
- 更新运行时 `HeroProgressData`
- 通过 `EventManager` 派发成长事件

已定义事件：

```text
hero:expGained
hero:levelUp
```

当前未做：

- 未接入战斗结算
- 未接入 SaveManager 自动同步
- 未计算战力
- 未实现 UI

## 2.4 Step4：成长数据存档

已新增：

- `assets/scripts/save/GrowthSaveData.ts`

已修改：

- `assets/scripts/save/SaveContainer.ts`
- `assets/scripts/save/SaveManager.ts`

新增存档字段：

```ts
growth: GrowthSaveData;
```

`GrowthSaveData` 结构：

```ts
interface GrowthSaveData {
  playerProgress: PlayerProgressData;
  heroProgressList: HeroProgressData[];
}
```

已支持保存和读取：

- `HeroProgressData.level`
- `HeroProgressData.exp`
- `HeroProgressData.power`
- `PlayerProgressData.playerLevel`
- `PlayerProgressData.playerExp`
- `PlayerProgressData.totalPower`
- `PlayerProgressData.highestStageId`
- `PlayerProgressData.lastGrowthAt`

旧存档兼容：

- 旧存档缺失 `growth` 字段时，会自动补默认成长数据。
- 默认成长数据会尽量继承旧 `player` 字段：
  - `player.level -> playerProgress.playerLevel`
  - `player.exp -> playerProgress.playerExp`
  - `player.combatPower -> playerProgress.totalPower`
  - `player.stageId -> playerProgress.highestStageId`

---

# 3. 当前对外接口汇总

## 3.1 PowerSystem

```ts
loadConfig(): Promise<void>
isConfigLoaded(): boolean
getPowerConfig(): PowerConfig | null
calculateHeroAttributes(...): HeroComputedAttributes
calculateHeroPower(...): number
calculateHeroPowerFromProgress(...): number
calculatePowerByAttributes(...): number
calculateTotalPower(heroPowers: number[]): number
```

## 3.2 ProgressSystem

```ts
loadConfig(): Promise<void>
isConfigLoaded(): boolean
setHeroProgress(data: HeroProgressData): void
setHeroProgressList(list: HeroProgressData[]): void
getHeroProgress(heroId: string): HeroProgressData
addHeroExp(heroId: string, exp: number): AddHeroExpResult
getHeroLevel(heroId: string): number
getHeroExp(heroId: string): number
checkLevelUp(heroId: string): AddHeroExpResult
getLevelConfig(level: number): LevelConfig | null
getMaxLevel(): number
clearProgress(): void
```

## 3.3 SaveManager 成长数据接口

```ts
saveGrowthData(data: GrowthSaveData): void
loadGrowthData(): GrowthSaveData | null
savePlayerProgressData(data: PlayerProgressData): void
loadPlayerProgressData(): PlayerProgressData | null
saveHeroProgressList(list: HeroProgressData[]): void
loadHeroProgressList(): HeroProgressData[]
saveHeroProgressData(data: HeroProgressData): void
loadHeroProgressData(heroId: string): HeroProgressData | null
```

---

# 4. 集成状态

当前已具备：

1. 成长数据结构。
2. 等级配置。
3. 战力配置。
4. 角色经验与升级逻辑。
5. 角色属性与战力计算逻辑。
6. 成长数据存档结构。
7. 成长数据保存和读取接口。
8. 旧存档补 `growth` 字段兼容逻辑。

当前尚未完成：

1. `ProgressSystem -> PowerSystem` 自动联动。
2. `ProgressSystem -> SaveManager` 自动同步。
3. 战斗结算奖励接入成长系统。
4. 成长调试 Runner。
5. Phase4A 运行时验收日志。

---

# 5. 禁止项遵守情况

本阶段未修改：

- `BattleSystem.ts`
- `BattleManager.ts`
- Phase3 验收逻辑

本阶段未实现：

- 装备系统
- UI
- 战斗结算接入
- 广告接入

本阶段保持：

- 成长数值读取配置
- `EventManager` 派发成长事件
- `SaveManager` 统一负责成长数据存档

---

# 6. TS 编译状态

已尝试执行：

```text
tsc --noEmit --project E:\CocosProjects\TestGame\TestGame\tsconfig.json
```

结果：

```text
tsc : 无法将“tsc”项识别为 cmdlet、函数、脚本文件或可运行程序的名称
```

结论：

- 当前环境没有可用 `tsc` 命令。
- 未完成 TypeScript 编译验证。
- 已完成 JSON 解析校验：
  - `level_config.json` 解析通过。
  - `power_config.json` 解析通过。

---

# 7. 风险说明

## 7.1 运行时未接入风险

当前系统已经具备数据、计算和存档能力，但尚未形成完整运行时链路。

风险：

- 角色升级后不会自动触发战力重算。
- 战力重算后不会自动写入存档。
- 战斗奖励不会自动进入成长系统。

处理建议：

下一步新增独立调试入口或 GrowthDebugRunner，先验证成长链路，再接入战斗结算。

## 7.2 事件常量分散风险

`ProgressSystem` 当前自带：

```text
hero:expGained
hero:levelUp
```

风险：

- 后续事件管理可能希望统一集中到 `EventManager`。

处理建议：

暂不移动，避免本阶段扩大修改 Core 层。等 Phase4A 验收稳定后再统一事件常量。

## 7.3 旧存档兼容风险

旧存档会自动补 `growth` 字段。

风险：

- 旧 `player.stageId` 是数字，新 `highestStageId` 是字符串，当前转换为 `STAGE_XXX`。

处理建议：

后续关卡系统正式接入时，再统一最高关卡 ID 口径。

---

# 8. 下一步建议

建议 Step6 先做成长调试入口，而不是直接接入战斗。

推荐顺序：

1. 新增 `GrowthDebugRunner`。
2. 加载 `level_config` 和 `power_config`。
3. 初始化一组 `HeroProgressData`。
4. 调用 `ProgressSystem.addHeroExp()`。
5. 调用 `PowerSystem.calculateHeroPower()`。
6. 汇总总战力。
7. 写入 `SaveManager`。
8. 读取 `SaveManager` 并验证数据一致。
9. 输出 Phase4A 成长闭环验收日志。

推荐验收日志：

```text
[GrowthTest] Phase4A 成长闭环测试开始
[GrowthTest] level_config 加载完成
[GrowthTest] power_config 加载完成
[GrowthTest] 经验写入: CARD_301 exp +84
[GrowthTest] 角色升级: CARD_301 Lv.1 -> Lv.2
[GrowthTest] 单体战力提升: CARD_301 1200 -> 1360 (+160)
[GrowthTest] 阵容战力提升: 12000 -> 12160 (+160)
[GrowthTest] 成长数据写入 SaveManager 完成
[GrowthTest] 成长数据读取验证通过
[GrowthTest] ========== Phase4A 成长闭环验证通过 ==========
```

---

# 9. 结论

Phase4A Step1 ~ Step4 的基础模块已完成：

- 数据定义已完成。
- 配置资源已完成。
- 战力系统已完成。
- 经验升级系统已完成。
- 成长存档结构与读写接口已完成。

当前还不能判定 Phase4A 完整验收通过，因为尚未完成运行时联动与调试验收。

允许进入下一步：

```text
Phase4A Step6：成长调试入口 / 成长闭环验证
```

不建议直接进入：

```text
战斗结算接入
```

原因：

先用独立调试入口验证成长链路，可以降低对 Phase3 战斗闭环的回归风险。
