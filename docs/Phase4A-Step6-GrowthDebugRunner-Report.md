# Phase4A Step6 GrowthDebugRunner Report

项目：《瞬破寰宇》微信小游戏

工程路径：`E:\CocosProjects\TestGame\TestGame`

报告日期：2026-06-02

报告范围：新增独立成长调试验收入口 `GrowthDebugRunner`

---

# 1. 本轮目标

新增独立成长调试验收入口：

```text
assets/scripts/debug/GrowthDebugRunner.ts
```

用于验证 Phase4A 成长闭环：

```text
SaveManager
↓
ProgressSystem
↓
PowerSystem
↓
SaveManager
```

本轮不接入战斗，不修改 Phase3 验收逻辑。

---

# 2. 修改文件

新增文件：

```text
assets/scripts/debug/GrowthDebugRunner.ts
assets/scripts/debug/GrowthDebugRunner.ts.meta
docs/Phase4A-Step6-GrowthDebugRunner-Report.md
```

本轮未修改：

```text
assets/scripts/battle/BattleSystem.ts
assets/scripts/managers/BattleManager.ts
assets/scripts/systems/PowerSystem.ts
assets/scripts/systems/ProgressSystem.ts
assets/scripts/save/SaveManager.ts
```

---

# 3. GrowthDebugRunner 职责

`GrowthDebugRunner` 是开发期 Cocos Component。

使用方式：

1. 在 Cocos Creator 场景中创建任意节点。
2. 挂载 `GrowthDebugRunner`。
3. 运行场景。
4. 查看 Console 日志。

它只负责验收：

- 成长配置加载
- 角色经验写入
- 角色升级
- 单角色战力提升
- 阵容总战力更新
- SaveManager 写入
- SaveManager 读取恢复
- 成长事件派发

不负责：

- 战斗启动
- 战斗结算
- 装备系统
- UI 展示
- 广告系统

---

# 4. 验收链路

`GrowthDebugRunner` 执行链路：

```text
start()
↓
初始化 SaveManager(LocalStorageAdapter)
↓
ProgressSystem.loadConfig()
↓
加载 level_config
↓
加载 hero_list
↓
加载 power_config
↓
初始化测试角色 CARD_301
↓
记录旧等级 / 旧经验 / 旧战力 / 旧总战力
↓
ProgressSystem.addHeroExp(CARD_301, 84)
↓
验证经验写入
↓
验证角色升级
↓
验证单角色战力提升
↓
验证 totalPower 更新
↓
SaveManager.save()
↓
SaveManager.load()
↓
验证读取恢复
↓
输出验收日志
↓
恢复测试前 growth 存档
```

---

# 5. 测试数据

测试角色：

```text
CARD_301
```

测试经验：

```text
84
```

测试初始角色成长数据：

```ts
{
  heroId: 'CARD_301',
  level: 1,
  exp: 0,
  power: 0
}
```

测试初始账号成长数据：

```ts
{
  playerLevel: 1,
  playerExp: 0,
  totalPower: 0,
  highestStageId: 'STAGE_001',
  lastGrowthAt: 0
}
```

说明：

- `CARD_301` 来自现有 `hero_list.json`。
- `84` 可使 1 级角色满足 `level_config` 中 1 级升级需求。
- 测试结束后会尝试恢复测试前的 `growth` 存档数据，降低调试污染。

---

# 6. 事件验证

`GrowthDebugRunner` 注册并验证以下事件：

```text
ProgressSystem.HERO_EXP_GAINED
ProgressSystem.HERO_LEVEL_UP
ProgressSystem.HERO_POWER_CHANGED
ProgressSystem.TOTAL_POWER_CHANGED
```

验证目标：

- 经验写入时触发 `HERO_EXP_GAINED`
- 升级时触发 `HERO_LEVEL_UP`
- 单角色战力变化时触发 `HERO_POWER_CHANGED`
- 总战力变化时触发 `TOTAL_POWER_CHANGED`

---

# 7. 验收检查项

Runner 内部检查项：

1. `SaveManager` 初始化完成。
2. `level_config / power_config` 加载完成。
3. 测试角色初始化完成。
4. 已调用 `addHeroExp(CARD_301, 84)`。
5. 经验写入 `HeroProgressData`。
6. `HERO_EXP_GAINED` 事件已触发。
7. 角色升级。
8. `HERO_LEVEL_UP` 事件已触发。
9. 单角色战力提升。
10. `HERO_POWER_CHANGED` 事件已触发。
11. `totalPower` 更新。
12. `TOTAL_POWER_CHANGED` 事件已触发。
13. `SaveManager` 写入成功。
14. `SaveManager` 读取成功。
15. 读取恢复角色等级。
16. 读取恢复角色经验。
17. 读取恢复单角色战力。
18. 读取恢复 `totalPower`。
19. 读取恢复 `highestStageId`。
20. 读取恢复 `lastGrowthAt`。

---

# 8. 推荐最终日志

通过时输出：

```text
[GrowthTest] ========== Phase4A 成长闭环验证通过 ==========
```

失败时输出：

```text
[GrowthTest] ========== Phase4A 成长闭环验证未通过 ❌ ==========
```

---

# 9. 静态校验

已确认新增文件包含：

```text
GrowthDebugRunner
SaveManager
ProgressSystem
CARD_301
addHeroExp
Phase4A 成长闭环验证通过
```

已确认配置 JSON 解析：

```text
hero_list.json      data 数量 5
level_config.json   data 数量 30
power_config.json   data 数量 1
```

---

# 10. TS 编译状态

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

# 11. 运行状态

本轮未运行 Cocos Preview。

原因：

- 当前任务要求新增 `GrowthDebugRunner` 并输出报告。
- Runner 需要挂载到场景节点后由 Cocos 生命周期触发。
- 本轮未修改场景文件，避免影响 Phase3 验收场景。

---

# 12. 禁止项遵守情况

本轮未接入：

- `BattleSystem`
- `BattleManager`
- 战斗结算
- 装备系统
- UI

本轮未修改：

- Phase3 验收逻辑
- 战斗相关代码
- 场景文件
- `PowerSystem`
- `ProgressSystem`
- `SaveManager`

---

# 13. 风险说明

## 13.1 需要场景挂载

`GrowthDebugRunner` 是 Cocos Component。

只有挂载到场景节点并运行场景时，`start()` 才会触发。

## 13.2 SaveManager 初始化状态

如果其他调试组件已提前初始化 `SaveManager`，再次调用 `init()` 会复用现有状态。

当前 Runner 会继续使用 `SaveManager` 当前实例。

## 13.3 存档污染控制

Runner 会在测试前记录原始 `growth` 数据，并在验收后尝试恢复。

如果运行中途异常退出，可能留下测试成长数据。

处理方式：

再次运行 Runner 或清理本地存档。

---

# 14. 结论

Phase4A Step6 `GrowthDebugRunner` 已完成。

当前已具备独立成长闭环验收入口，可用于验证：

```text
经验写入
↓
角色升级
↓
单角色战力提升
↓
totalPower 更新
↓
SaveManager 写入
↓
SaveManager 读取恢复
```

下一步建议：

在 Cocos Creator 场景中挂载 `GrowthDebugRunner` 并运行，确认 Console 输出：

```text
[GrowthTest] ========== Phase4A 成长闭环验证通过 ==========
```
