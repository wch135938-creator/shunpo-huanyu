# 《瞬破寰宇》Phase10-Step12A-C1.5.1 GPT / CC 交接启动文档

> 用途：将本文完整粘贴给 GPT，作为下一轮开发的启动上下文。
> 更新时间：2026-07-05
> 项目路径：`D:\My Project\TestGame`
> 引擎：Cocos Creator 3.8.8 / TypeScript

## 一、角色与协作方式

你现在作为本项目的 GPT 规划、审查和验收负责人。

- GPT 负责：读取项目规则、审查现状、确定根因、拆分最小任务、编写给 Claude Code（下称 CC）的精确执行提示、审核 CC 的 diff 和用户 Preview 结果。
- CC 只负责：按 GPT 已确认的方案编写简单、机械、低风险、不容易出错的小范围代码。
- 不允许让 CC 猜根因、连续试补丁、大重构、修改 Scene/Prefab，或跨多个核心系统自由发挥。
- 如果根因不明确、涉及存档真相源、奖励所有权、战斗结算、Scene/Prefab 或受保护 UI 基础设施，CC 必须停止修改并把证据交回 GPT 重新规划。
- 每次只做一个小功能；用户 Preview 验收通过后才能进入下一项。
- 未经用户明确确认，禁止提交，禁止推送 GitHub。

## 二、开始前必须执行

先只读执行并报告，不要覆盖现有改动：

```powershell
git status
git branch --show-current
git log --oneline -5
```

然后完整读取：

1. `docs/00-project-vision.md`
2. `docs/瞬破寰宇 Step12 AI工程SOP启动系统.md`
3. `docs/AI-OS-v1-Step12.md`
4. `docs/ai-rules/Phase10-UI-Screenshot-Acceptance.md`
5. 与下一目标直接相关的模块文档

接手时必须以实际 `git status` 为准；如工作区不干净，必须保留并审查现有改动，禁止用 reset、checkout 或覆盖文件的方式清理。

## 三、本轮开发基线与变更

- 当前分支：`master`
- C1.4.1 基线提交：`c6adc77 feat: complete Step12A C1 gameplay loop preview validation`
- C1.4.1 基线标签：`phase10-step12a-c1.4.1-pass`
- C1.5.1 已完成检查并由用户授权推送；接手时用 `git log` 确认实际最新提交。

本轮 C1.5.1 文件：

```text
assets/scripts/gameplay/Phase10MainGameplayCoordinator.ts
assets/scripts/ui/EquipmentDetailPanel.ts
docs/Phase10-Step12A-C1.5-验收报告.md
docs/Phase10-Step12A-C1.5.1-GPT-CC-交接启动文档.md
```

不要重新实现或回退这些改动。

## 四、稳定基线

以下功能已经稳定或通过人工验收，不得回退：

- 初始青锋剑、布衣、铜戒正常发放并装备。
- 装备主面板、背包、详情、升级、强化正常。
- 邮箱附件、兑换码、每日登录奖励跨 Preview 幂等，不能重复领取。
- 兑换码直接到账并显示奖励明细，不生成邮件。
- Step12A-A 奖励所有权已收口。
- Step12A-B 主闭环已接通。
- 挑战首关可进入战斗并胜利。
- 胜利奖励通过现有结算链到账；失败不发奖。
- 结果文字多行显示且不越出屏幕。
- 邮箱、兑换码、登录奖励弹窗打开时，挑战按钮和结果文字正确隐藏。
- RewardSettlement 的 transactionId 幂等保持不变。
- InventoryService 继续过滤 exp，不把角色经验放入背包。
- 胜利后继续执行 `Phase9Bootstrap.saveAll()` 和 `SaveManager.save()`。
- 主验证场景只有 `assets/scenes/Phase10Main.scene`。

## 五、C1.5.1 当前完成内容

### 1. 角色经验恢复时序修复

真实根因不是 HeroSystem 没有保存经验，而是 Coordinator 原先依赖固定延迟读取角色状态，可能早于异步存档恢复完成，导致 UI 和启动日志读到默认状态或没有刷新。

当前修复：

- Coordinator 监听 `Phase9Event.RESTORE_COMPLETE`。
- 恢复完成后统一刷新 HeroInfoLabel，并输出一次启动诊断。
- 保留 `Phase9Bootstrap.isRestored()` 作为热重载情况下的幂等兜底。
- `onDestroy()` 会注销监听。
- 没有修改 HeroSystem、SaveManager 数据结构或 SaveContainer 版本号。

### 2. 角色经验与等级可见反馈

- 运行时创建 `HeroInfoLabel`，不修改 Scene。
- 显示 `剑无极 LvX  EXP Y/Z`。
- 战斗胜利后刷新经验与等级。
- 如果升级，结果 Label 增加 `等级 LvA → LvB`。
- 弹窗打开时 HeroInfoLabel 与挑战入口、结果文字一起隐藏。

### 3. 经验诊断与保存诊断

现有日志前缀：

```text
[Step12A-C1.5][HeroExpDiag]
[Step12A-C1.5][HeroInfoLabel]
[Step12A-C1.5.1][CoordinatorDiag]
```

`CoordinatorDiag ON_LOAD_ENTER` 是一次性启动诊断，目前仍保留在代码中；不要重复添加同类日志。

### 4. 装备详情属性中文化

`EquipmentDetailPanel.ts` 已将：

- `HP` 改为 `生命`
- `ATK` 改为 `攻击`
- `DEF` 改为 `防御`

这部分已通过静态检查，但交接时尚未单独提供装备详情面板的最新人工截图；后续只需做 Preview 肉眼回归，不要重新改代码。

## 六、C1.5.1 人工验收证据

角色经验持久化已经人工验收通过，不要重复修复。

启动恢复：

```text
hero_001 level=12, exp=105/1200, unlocked=true
savedLevel=12, savedExp=105, savedUnlocked=true
```

挑战首关胜利：

```text
PreBattle: level=12, exp=105
expGain=66
levelBefore=12, expBefore=105
levelAfter=12, expAfter=171
saveAll+save done, success=true
```

重新加载 Preview：

```text
Startup restore: level=12, exp=171/1200
savedLevel=12, savedExp=171, savedUnlocked=true
```

结论：`105 + 66 = 171`，战后保存成功，重新 Preview 后运行值与存档值均为 171，角色经验持久化验收通过。

## 七、控制台现状

Creator 编辑器控制台可能看不到浏览器 Preview 日志。Edge 开发者工具可以看到完整日志。

Edge 控制台存在大量持续增长的过滤消息，来源是受保护的 `UIRenderSync.flush()` 每帧打印：

```text
[UI-TEST] RenderSync.flush executed
[SOP-UI-03] RENDER_FLUSH: 0
```

这些是重复帧日志，不是红字，也不是角色经验失败。验收时在 Edge 控制台使用以下筛选词：

```text
CoordinatorDiag
HeroExpDiag
```

禁止为了消除刷屏而修改 `UIRenderSync.ts`。

## 八、强制禁止修改范围

除非用户以后明确授权并先确认计划，否则禁止修改：

- `UIEngine`
- `UILayoutEngine`
- `UIRenderSync`
- `UIDiffEngine`
- `UIRenderVM`
- Frame-0 Flush
- Bootstrap 基础启动链
- `BattleManager`
- `RewardSettlement`
- `HeroSystem`
- `FormationSystem`
- `ChapterSystem`
- `DungeonLoopController`
- `DropSystem`
- `ProgressSystem`
- SaveContainer 版本号
- `assets/scenes/Phase10Main.scene`
- 任意 Prefab 结构
- `assets/scenes/Phase8Main.scene`
- `assets/scenes/Phase10Main-Clean.scene`

禁止新建第二套奖励、资产、角色经验、装备、弹窗或存档真相源。

## 九、后续给 CC 的任务格式

GPT 必须先完成只读审查并给出精确计划，再把单个小任务交给 CC。给 CC 的提示必须包含：

1. 只允许修改的具体文件。
2. 只允许修改的具体方法或代码区域。
3. 预期输入、输出和验收日志。
4. 明确禁止修改的系统。
5. 要求先看现有实现，复用既有接口。
6. 要求输出 diff 摘要和静态检查结果。
7. 明确禁止提交和推送。

推荐模板：

```text
这是一个已完成根因分析的低风险小任务。不要重新设计，不要扩大范围。

只允许修改：<文件>
只允许处理：<方法/行为>
预期结果：<可观察结果>
复用：<现有接口或模式>
禁止修改：<受保护系统列表>
禁止修改 Scene/Prefab，禁止新增真相源，禁止重构，禁止提交，禁止推送。

完成后只报告：修改文件、关键 diff、静态检查、本地无法代替的 Preview 验收步骤。
```

如果一个任务无法压缩成上述单文件或极少文件的小补丁，先交回 GPT 继续拆分，不要直接让 CC 编码。

## 十、GPT 下一轮启动要求

1. 先确认上述 Git 状态和未提交改动仍存在。
2. 明确宣布 C1.5.1 角色经验持久化已经人工验收通过，不重复施工。
3. 先完成装备详情中文标签和 HeroInfoLabel 的必要肉眼回归记录。
4. 用户未指定下一功能前，只做现状总结和最小计划，不擅自进入大型 C2 开发。
5. 用户指定下一功能后，将其拆成单功能、低风险、可由 CC 完成的小补丁。
6. 每个补丁完成后，先由 GPT 审核 diff，再由用户运行 Creator Preview 验收。

最终原则：GPT 做判断，CC 写简单代码；复杂问题先审计，禁止靠连续猜补丁推进。
