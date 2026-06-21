# Phase4A Step6 Acceptance Report

## 1. 修改文件列表

新增：

- `assets/scripts/debug/GrowthDebugRunner.ts`
- `assets/scripts/debug/GrowthDebugRunner.ts.meta`
- `docs/Phase4A-Step6-GrowthDebugRunner-Report.md`

本报告：

- `docs/Phase4A-Step6-Acceptance-Report.md`

未修改：

- `BattleSystem.ts`
- `BattleManager.ts`
- `PowerSystem.ts`
- `ProgressSystem.ts`
- `SaveManager.ts`
- Phase3 验收逻辑

---

## 2. 新增接口

新增 Cocos Component：

```ts
@ccclass('GrowthDebugRunner')
export class GrowthDebugRunner extends Component
```

生命周期入口：

```ts
onLoad(): void
onEnable(): void
start(): void
onDestroy(): void
```

说明：

- `start()` 自动执行 Phase4A 成长闭环验收。
- 无 public 业务接口。
- 不对外暴露战斗、装备、UI 入口。

---

## 3. GrowthDebugRunner 执行步骤

1. 初始化 `SaveManager`。
2. 加载 `level_config`。
3. 加载 `power_config`。
4. 加载 `hero_list`。
5. 初始化测试角色 `CARD_301`。
6. 记录旧等级、旧经验、旧战力、旧总战力。
7. 调用 `ProgressSystem.addHeroExp('CARD_301', 84)`。
8. 验证经验写入。
9. 验证角色升级。
10. 验证单角色战力提升。
11. 验证 `totalPower` 更新。
12. 验证 `SaveManager.save()` 写入。
13. 验证 `SaveManager.load()` 读取恢复。
14. 输出 Phase4A 成长闭环验收日志。
15. 尝试恢复测试前 `growth` 存档。

---

## 4. 完整验收日志

当前尚未运行 Cocos Preview，因此以下为 `GrowthDebugRunner` 设计输出的完整验收日志格式：

```text
[GrowthDebugRunner] onLoad
[GrowthDebugRunner] onEnable
[GrowthDebugRunner] start
[GrowthTest] ==================================================
[GrowthTest] Phase4A 成长闭环测试开始
[GrowthTest] 测试角色: CARD_301
[GrowthTest] 测试经验: +84
[GrowthTest] --------------------------------------------------
[GrowthTest] SaveManager 初始化完成, hasSave=false
[GrowthTest] level_config 加载完成
[GrowthTest] power_config 加载完成
[GrowthTest] 旧数据: level=1, exp=0, power=0, totalPower=0
[GrowthTest] 角色升级: CARD_301 Lv.1 -> Lv.2
[GrowthTest] 单体战力提升: CARD_301 0 -> 计算后战力 (+计算后战力)
[GrowthTest] 阵容战力提升: 0 -> 计算后总战力 (+计算后总战力)
[GrowthTest] 新数据: level=2, exp=44, power=计算后战力, totalPower=计算后总战力
[GrowthTest] --------------------------------------------------
[GrowthTest] 验收检查:
[GrowthTest]   ✅ SaveManager 初始化完成
[GrowthTest]   ✅ level_config / power_config 加载完成
[GrowthTest]   ✅ 测试角色初始化完成
[GrowthTest]   ✅ 调用 addHeroExp(CARD_301, 84)
[GrowthTest]   ✅ 经验写入 HeroProgressData
[GrowthTest]   ✅ HERO_EXP_GAINED 事件已触发
[GrowthTest]   ✅ 角色升级
[GrowthTest]   ✅ HERO_LEVEL_UP 事件已触发
[GrowthTest]   ✅ 单角色战力提升
[GrowthTest]   ✅ HERO_POWER_CHANGED 事件已触发
[GrowthTest]   ✅ totalPower 更新
[GrowthTest]   ✅ TOTAL_POWER_CHANGED 事件已触发
[GrowthTest]   ✅ SaveManager 写入成功
[GrowthTest]   ✅ SaveManager 读取成功
[GrowthTest]   ✅ 读取恢复角色等级
[GrowthTest]   ✅ 读取恢复角色经验
[GrowthTest]   ✅ 读取恢复单角色战力
[GrowthTest]   ✅ 读取恢复 totalPower
[GrowthTest]   ✅ 读取恢复 highestStageId
[GrowthTest]   ✅ 读取恢复 lastGrowthAt
[GrowthTest] --------------------------------------------------
[GrowthTest] ========== Phase4A 成长闭环验证通过 ==========
[GrowthTest] ==================================================
[GrowthTest] 已恢复测试前成长存档
```

---

## 5. 是否通过

代码实现状态：

```text
通过
```

运行时验收状态：

```text
未执行
```

原因：

- 本轮未运行 Cocos Preview。
- `GrowthDebugRunner` 需要挂载到场景节点后由 Cocos 生命周期触发。

---

## 6. 遗留问题

1. 尚未在 Cocos Preview 中实际运行 `GrowthDebugRunner`。
2. 尚未取得真实 Console 验收日志。
3. 当前环境无可用 `tsc` 命令，未完成 TypeScript 编译验证。
4. Runner 会尝试恢复测试前 `growth` 存档，但若运行中途异常退出，可能留下测试成长数据。
