# Phase4A Step5 Linkage Report

项目：《瞬破寰宇》微信小游戏

工程路径：`E:\CocosProjects\TestGame\TestGame`

报告日期：2026-06-01

报告范围：真正打通 `ProgressSystem -> PowerSystem -> SaveManager`

---

# 1. 本轮目标

本轮目标是完成 Phase4A Step5 联动链路：

```text
ProgressSystem
↓
PowerSystem
↓
SaveManager
```

要求结果：

1. 角色升级后自动重算单角色战力。
2. 单角色战力变化后自动汇总阵容总战力。
3. 成长数据自动写入 `SaveManager`。
4. 派发：
   - `HERO_POWER_CHANGED`
   - `TOTAL_POWER_CHANGED`

---

# 2. 修改文件

本轮只修改：

```text
assets/scripts/systems/ProgressSystem.ts
```

新增本报告：

```text
docs/Phase4A-Step5-Linkage-Report.md
```

本轮未修改：

```text
assets/scripts/battle/BattleSystem.ts
assets/scripts/managers/BattleManager.ts
assets/scripts/systems/PowerSystem.ts
assets/scripts/save/SaveManager.ts
```

---

# 3. 已完成联动内容

## 3.1 ProgressSystem 加载依赖扩展

`ProgressSystem.loadConfig()` 现在会加载：

```text
config/systems/level_config
config/cards/hero_list
PowerSystem.loadConfig()
```

加载完成后会调用：

```ts
restoreFromSaveManager()
```

用于从 `SaveManager` 恢复：

- `PlayerProgressData`
- `HeroProgressData[]`

## 3.2 角色升级后自动重算战力

`addHeroExp(heroId, exp)` 和 `checkLevelUp(heroId)` 在处理升级后会调用：

```ts
_syncPowerAndSave(data, levelUpEvents.length > 0)
```

当发生升级时：

```text
ProgressSystem
↓
_recalculateHeroPower()
↓
PowerSystem.calculateHeroPowerFromProgress()
↓
写回 HeroProgressData.power
```

## 3.3 总战力自动更新

单角色战力处理完成后会执行：

```ts
_recalculateTotalPower()
```

该方法会汇总当前所有 `HeroProgressData.power`：

```text
heroProgressMap.values()
↓
hero.power[]
↓
PowerSystem.calculateTotalPower()
↓
PlayerProgressData.totalPower
```

同时更新：

```ts
PlayerProgressData.lastGrowthAt = Date.now()
```

## 3.4 自动写入 SaveManager

联动完成后会写入：

```ts
SaveManager.getInstance().saveHeroProgressData(data)
SaveManager.getInstance().savePlayerProgressData(this._playerProgressData)
```

说明：

- 本轮写入的是 SaveManager 内存存档。
- 是否立即落盘仍遵循现有 `SaveManager.save()` / `autoSave()` 机制。
- 本轮未改变 SaveManager 的落盘策略。

---

# 4. 新增事件

`ProgressSystem` 新增事件常量：

```ts
static readonly HERO_POWER_CHANGED = 'hero:powerChanged';
static readonly TOTAL_POWER_CHANGED = 'hero:totalPowerChanged';
```

## 4.1 HERO_POWER_CHANGED

触发条件：

单角色战力发生变化。

事件数据：

```ts
interface HeroPowerChangedEventData {
  heroId: string;
  oldPower: number;
  newPower: number;
  powerDelta: number;
}
```

## 4.2 TOTAL_POWER_CHANGED

触发条件：

阵容总战力发生变化。

事件数据：

```ts
interface TotalPowerChangedEventData {
  oldTotalPower: number;
  newTotalPower: number;
  powerDelta: number;
}
```

---

# 5. ProgressSystem 新增/扩展接口

## 5.1 新增接口

```ts
restoreFromSaveManager(): void
getPlayerProgressData(): PlayerProgressData
setPlayerProgressData(data: PlayerProgressData): void
```

## 5.2 扩展返回数据

`AddHeroExpResult` 新增字段：

```ts
oldPower: number;
newPower: number;
oldTotalPower: number;
newTotalPower: number;
```

用途：

- 调试成长结果
- 后续结算界面展示战力变化
- 后续 Phase4A 验收日志读取

---

# 6. 当前联动流程

## 6.1 addHeroExp 流程

```text
addHeroExp(heroId, exp)
↓
校验 level_config / hero_list / power_config 已加载
↓
写入 HeroProgressData.exp
↓
派发 HERO_EXP_GAINED
↓
_processLevelUp()
↓
派发 HERO_LEVEL_UP
↓
_syncPowerAndSave()
↓
升级时调用 PowerSystem 重算单角色战力
↓
派发 HERO_POWER_CHANGED
↓
汇总阵容总战力
↓
派发 TOTAL_POWER_CHANGED
↓
写入 SaveManager
```

## 6.2 checkLevelUp 流程

```text
checkLevelUp(heroId)
↓
校验配置已加载
↓
处理当前经验是否可升级
↓
升级时重算战力
↓
汇总总战力
↓
写入 SaveManager
```

---

# 7. 验证情况

## 7.1 配置解析

已确认：

```text
hero_list.json        data 数量 5
level_config.json     data 数量 30
power_config.json     data 数量 1
```

## 7.2 代码检查

已确认 `ProgressSystem.ts` 包含：

```text
PowerSystem
SaveManager
HERO_POWER_CHANGED
TOTAL_POWER_CHANGED
saveHeroProgressData
savePlayerProgressData
_syncPowerAndSave
_recalculateHeroPower
_recalculateTotalPower
```

## 7.3 TypeScript 编译状态

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
- 需要在 Cocos Creator 或具备 TypeScript 编译器的环境中再做一次编译确认。

---

# 8. 禁止项遵守情况

本轮未接入：

- `BattleSystem`
- `BattleManager`
- 战斗结算
- 装备系统
- UI
- `GrowthDebugRunner`

本轮未修改：

- Phase3 验收逻辑
- `PowerSystem`
- `SaveManager`

---

# 9. 风险说明

## 9.1 SaveManager 初始化风险

`ProgressSystem` 当前会自动调用 SaveManager 写入接口。

如果调用方尚未执行 `SaveManager.init(adapter)`：

- SaveManager 会拒绝写入并打印未初始化错误。
- ProgressSystem 的内存成长数据仍会更新。

处理建议：

后续启动流程必须保证：

```text
SaveManager.init()
↓
ProgressSystem.loadConfig()
↓
ProgressSystem.addHeroExp()
```

## 9.2 初始战力风险

当前逻辑在角色升级后重算战力。

如果角色只获得经验但未升级：

- 会保存经验。
- 不会重算单角色战力。
- 总战力通常不变。

这符合本轮目标：“角色升级后自动重算战力”。

## 9.3 事件常量位置风险

新增事件常量目前放在 `ProgressSystem` 内：

```ts
ProgressSystem.HERO_POWER_CHANGED
ProgressSystem.TOTAL_POWER_CHANGED
```

未移动到 `EventManager`。

原因：

- 避免本轮扩大修改 Core 层。
- 保持 Step5 范围只在成长联动内。

后续如需要统一事件常量，可单独执行事件规范整理。

---

# 10. 结论

Phase4A Step5 真实联动已完成。

当前已打通：

```text
ProgressSystem
↓
PowerSystem
↓
SaveManager
```

已满足：

1. 角色升级后自动重算战力。
2. 战力变化后自动更新 `PlayerProgressData.totalPower`。
3. 成长数据自动写入 `SaveManager`。
4. 派发 `HERO_POWER_CHANGED`。
5. 派发 `TOTAL_POWER_CHANGED`。

当前仍未接入战斗，因此不会影响 Phase3 战斗闭环。
