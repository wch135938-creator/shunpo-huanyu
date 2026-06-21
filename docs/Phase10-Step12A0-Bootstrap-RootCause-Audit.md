# Phase10-Step12A0 Bootstrap RootCause Audit

项目：《瞬破寰宇》  
技术栈：Cocos Creator 3.8.8 / TypeScript / 微信小游戏  
工程路径：`D:\My Project\TestGame`  
审计时间：2026-06-16

## 0. 审计结论

**FAIL**

`Phase10Main.scene` 当前可以打开、Hierarchy 正常、Inspector 绑定正常，但它不是完整游戏启动场景。

当前 Scene 内实际挂载的运行入口只有：

- `EquipmentPanel`
- `EquipmentBagPanel`
- `EquipmentDetailPanel`
- `EquipmentMediator`

Scene 内没有挂载：

- `Phase8BootstrapEntry`
- `Phase8Bootstrap`
- `Phase9Bootstrap`
- `BattleDebugRunner`
- `BattleDebugRunnerV2`
- `GameBootstrap`
- `MainBootstrap`
- `MainCoordinator`
- `GameplayCoordinator`

因此，当前问题不是 Step11 已关闭的 Scene/Prefab/UUID/Script Registry 问题，而是 **Phase10Main 缺少正式 Bootstrap 启动入口，导致 SaveManager、Phase8、Phase9、主玩法链路未被统一初始化**。

## 1. 实际启动入口

### 1.1 Scene 序列化事实

`assets/scenes/Phase10Main.scene` 只包含 4 个自定义组件：

| 节点 | active | 组件类型 |
|---|---:|---|
| `EquipmentPanel` | true | `fd2749JtdVJQJLQETHYY9Mm` |
| `EquipmentBagPanel` | false | `fb89dlx4T5D+KqcbZ4IfpEl` |
| `EquipmentDetailPanel` | false | `534faGomxJErYQBMNA+oQCU` |
| `EquipmentMediator` | true | `679c9TwPJxFNbkGrNmpcHbr` |

组件 UUID 与 `.meta` 对应正常：

- `EquipmentPanel.ts.meta` = `fd274f49-b5d5-4940-92d0-1131d863d326`
- `EquipmentBagPanel.ts.meta` = `fb89d971-e13e-43f8-aa9c-6d9e087e9125`
- `EquipmentDetailPanel.ts.meta` = `534fa1a8-9b12-44ad-8401-30d03ea10094`
- `EquipmentMediator.ts.meta` = `679c94f0-3c9c-4535-b906-acd9a97076eb`

Scene 中没有 `BattleDebugRunner`、`BattleDebugRunnerV2`、`Phase8BootstrapEntry`、`Phase9Bootstrap` 字符串。

### 1.2 真实启动入口判定

当前 Scene 的实际启动入口是：

```text
EquipmentMediator.onLoad()
EquipmentMediator.start()
EquipmentPanel / EquipmentBagPanel / EquipmentDetailPanel 生命周期
```

不是：

```text
Phase8BootstrapEntry.start()
Phase8Bootstrap.initialize()
Phase9Bootstrap.initialize()
Phase9Bootstrap.restoreFromSave()
BattleDebugRunner.onLoad/start()
```

证据：

- `Phase10Main.scene` 只命中 `EquipmentPanel` / `EquipmentBagPanel` / `EquipmentDetailPanel` / `EquipmentMediator`。
- `Phase10Main.scene` 不包含 `Phase8BootstrapEntry`、`Phase9Bootstrap`、`BattleDebugRunner`。
- `Phase8BootstrapEntry.start()` 内存在明确日志：`[Phase8BootstrapEntry] START`，当前 Preview 未出现。
- `Phase9Bootstrap.initialize()` 内存在明确日志：`[Phase9Bootstrap] INIT`，当前 Preview 未出现。

## 2. 实际执行链路

按代码设计，如果 `EquipmentMediator` 生命周期执行，链路应为：

```text
EquipmentMediator.onLoad()
  -> InventoryService.getInstance()
  -> InventoryService.initialize()
     -> InventoryRepository.initialize()
     -> SaveManager.getData()
     -> 无 Save 数据时创建默认 InventorySaveData
     -> 首次初始化时发放 INITIAL_EQUIPMENT_ITEM_IDS
  -> EquipmentService.getInstance()
  -> EquipmentService.initialize()
     -> SaveManager.loadEquipmentDataV2()
     -> 无 equipmentData 时创建默认 EquipmentSaveDataV2
  -> EquipmentService.loadConfigs()

EquipmentMediator.start()
  -> new EquipmentUIPresenter()
  -> EquipmentUIPresenter.initialize()
  -> 绑定三个 Panel
  -> _openActiveScenePanel()
  -> openEquipmentPanel('0')
  -> EquipmentPanel.open('0')
  -> EquipmentPanel._refreshAll()
  -> EquipmentUIPresenter.getHeroEquipmentView('0')
```

关键证据：

- `EquipmentMediator.ts:43` 定义 `onLoad()`。
- `EquipmentMediator.ts:44` 获取 `InventoryService`。
- `EquipmentMediator.ts:50` 获取 `EquipmentService`。
- `EquipmentMediator.ts:56` 调用 `eqService.loadConfigs()`。
- `EquipmentMediator.ts:61` 定义 `start()`。
- `EquipmentMediator.ts:63` 创建 `EquipmentUIPresenter`。
- `EquipmentMediator.ts:75` 调用 `_openActiveScenePanel()`。
- `EquipmentMediator.ts:190-194` 在 EquipmentPanel active 且未 showing 时调用 `openEquipmentPanel('0')`。
- `EquipmentMediator.ts:204` 定义 `openEquipmentPanel(heroId)`。

## 3. 实际未执行链路

当前 Preview 日志未出现以下链路的日志：

```text
[Phase8BootstrapEntry] START
[Phase8Bootstrap] INIT
[Phase9Bootstrap] INIT
[SaveManager] 无旧存档，创建新存档容器（V8）
[SaveManager] 读取旧存档成功
[InventoryInit] initialize start
[EquipmentService] 初始化完成
[EquipmentUIPresenter] 初始化完成
[STACK_TRACE] BasePanel.onLoad
[STACK_TRACE] BasePanel.onEnable
[STACK_TRACE] BasePanel.show
```

这些日志的缺失不是单纯“没写日志”：

- `InventoryService.initialize()` 明确有日志：`InventoryService.ts:116`、`InventoryService.ts:153`、`InventoryService.ts:158`。
- `EquipmentService.initialize()` 明确有日志：`EquipmentService.ts:113`。
- `EquipmentUIPresenter.initialize()` 明确有日志：`EquipmentUIPresenter.ts:164`。
- `BasePanel.onLoad()` / `onEnable()` / `show()` 当前明确使用 `console.error('[STACK_TRACE]...')`：`BasePanel.ts:35-59`。

因此，如果用户确认 Preview 期间无红字、无上述日志，则当前运行表现更接近：

```text
Scene 静态节点被渲染
但 Equipment 组件生命周期 / Mediator 初始化链未按预期进入
```

或：

```text
当前 Preview 看到的并非最新编译后的脚本执行结果
```

这不等同于 Script Registry 失败，因为 Scene 组件 UUID 与 `.meta` 匹配正常，且 Step11 注册链问题已关闭。

## 4. Equipment 数据未显示根因

根因分两层。

### 4.1 根因一：Phase10Main 缺少完整 Bootstrap

`Phase10Main.scene` 没有挂载正式 Bootstrap 入口。

`SaveManager` 只有在显式调用：

```ts
SaveManager.getInstance().init(adapter)
```

后才会读取本地存档、迁移 V8、创建默认 V8 容器并写入内存。

但当前 Scene 中没有任何节点负责执行该调用。

证据：

- `SaveManager.ts:103` 定义 `init(adapter)`。
- `SaveManager.ts:114-117` 在 `init()` 内读取 `SaveManager.SAVE_KEY`。
- `SaveManager.ts:134` 在无旧存档时创建 V8 默认容器。
- `SaveManager.ts:595` 的 `getData()` 只是返回内存 `_data`。
- `SaveManager.ts:1233-1239` 的 `_ensureReady()` 明确要求先调用 `init()`。
- `EquipmentMediator.ts` 只初始化 `InventoryService` 和 `EquipmentService`，没有调用 `SaveManager.init(adapter)`。

因此，当前 `EquipmentMediator` 不是完整启动器，只是 Equipment UI 桥接器。

### 4.2 根因二：青锋剑属于背包初始装备，不等于已穿戴武器

`青锋剑` 对应配置：

```text
assets/resources/config/systems/equipment_config.json
weapon_001
name = 青锋剑
type = Weapon
```

Inventory 初始发放列表包含：

```text
ITEM_EQ_WEAPON_001
ITEM_EQ_ARMOR_001
ITEM_EQ_ACCESSORY_001
```

证据：

- `InventoryDomain.ts:481-485` 定义 `INITIAL_EQUIPMENT_ITEM_IDS`。
- `InventoryService.ts:152-154` 首次初始化且背包为空时调用 `_grantInitialEquipment()`。
- `InventoryService.ts:201-218` 只执行 `addAssets()` 并设置 `initialEquipmentGranted = true`。

但 EquipmentPanel 渲染的是指定英雄的已穿戴 loadout：

- `EquipmentInventoryView.ts:190` `getHeroSlotViewModels(heroId)`。
- `EquipmentInventoryView.ts:200` 从 `entry?.slots[slotId]` 读取已穿戴 uniqueId。
- `EquipmentInventoryView.ts:213` 没有 equippedItem 时 `isEmpty = true`。
- `EquipmentInventoryView.ts:224-230` 总战力只统计已穿戴装备。

也就是说：

```text
背包里有青锋剑
≠
heroId = '0' 的 Weapon 槽已经穿戴青锋剑
```

当前 `EquipmentMediator` 默认打开：

```text
openEquipmentPanel('0')
```

证据：`EquipmentMediator.ts:194`。

如果 `equipmentData.loadouts` 中没有 hero `0` 的 weapon slot，UI 显示：

```text
武器 ——空——
```

是符合当前数据模型的。

## 5. BattleDebugRunner 影响分析

当前唯一业务日志：

```text
[BattleDebugRunner] module loaded
```

来自 `BattleDebugRunner.ts` 顶层代码：

```ts
console.log('[BattleDebugRunner] module loaded');
```

这代表模块被 Cocos 脚本系统加载或评估，不代表组件挂载到了当前 Scene。

如果 `BattleDebugRunner` 作为组件实例执行，还应出现：

```text
[BattleDebugRunner] constructor
[BattleDebugRunner] onLoad
[BattleDebugRunner] onEnable
[BattleDebugRunner] start
[BattleDebugRunner] update (disabled now)
```

但当前 Scene 中没有 `BattleDebugRunner` 组件，也没有这些生命周期日志。

结论：

```text
BattleDebugRunner 不是 Phase10Main 的启动入口
BattleDebugRunner 没有覆盖正常启动流程
BattleDebugRunner 当前只是模块加载噪声
```

## 6. 存档加载状态

### 6.1 CURRENT_SAVE_VERSION

当前版本：

```text
CURRENT_SAVE_VERSION = 8
```

证据：`SaveContainer.ts:38`。

### 6.2 SaveManager 状态

从代码事实看，当前 `Phase10Main.scene` 没有显式入口调用：

```ts
SaveManager.getInstance().init(new LocalStorageAdapter())
```

`Phase8BootstrapEntry` 也不是当前 Scene 组件，因此它不会替当前 Scene 执行 Phase8/Phase9 初始化。

注意：`Phase9Bootstrap` 本身持有 `SaveManager.getInstance()`，但它也不负责调用 `SaveManager.init(adapter)`；它的 `restoreFromSave()` 假设 SaveManager 已经可读。

因此本次审计只能确认：

```text
当前 Scene 内没有 SaveManager init 入口
当前 Preview 未出现 SaveManager 读取/创建 V8 存档日志
无法证明本地存档已经被加载
```

更精确地说：

```text
不是存档迁移失败
不是 CURRENT_SAVE_VERSION 错误
不是 V8 结构不可用
而是 Phase10Main 没有触发 SaveManager 正式初始化
```

## 7. 修复方案

本次审计不执行修复。建议最小修复路径如下。

### 方案 A：为 Phase10Main 增加正式启动组件

新增或复用一个 Phase10 专用启动入口，例如：

```text
Phase10MainBootstrap
```

职责：

1. 初始化 `SaveManager`，注入 `LocalStorageAdapter`。
2. 初始化 Phase8/Phase9 必要系统。
3. 调用 `Phase9Bootstrap.restoreFromSave()`。
4. 初始化 Inventory / Reward / Equipment 链路。
5. 在所有数据 ready 后通知 `EquipmentMediator` 打开 EquipmentPanel。

优点：

- 语义正确。
- 适合作为 Step12 主玩法启动链。
- 不污染 `EquipmentMediator`，保持 UI 桥接器职责单一。

风险：

- 需要明确 Phase10 是否继续依赖 Phase8BootstrapEntry 的 UI 自动构建逻辑。
- 需要处理启动顺序和重复初始化幂等。

### 方案 B：临时 Debug Runner 方式恢复预览

创建只用于 Preview 的 `Phase10Step12A0DebugBootstrap`：

1. `SaveManager.init(new LocalStorageAdapter())`
2. `InventoryService.initialize()`
3. `EquipmentService.initialize()`
4. `EquipmentService.loadConfigs()`
5. 可选：为 hero `0` 自动穿戴初始武器
6. 调用 `EquipmentMediator.openEquipmentPanel('0')`

优点：

- 最小验证成本。
- 能快速确认 `青锋剑`、背包、升级、强化链路是否仍然可用。

风险：

- 只能作为调试入口，不能直接代表正式主启动架构。

### 方案 C：调整 Equipment UI 默认行为

如果需求是“新档进入装备页必须默认显示青锋剑在武器槽”，则需要在数据层明确建立：

```text
初始装备发放
-> 自动穿戴到默认英雄
-> equipmentData.loadouts 写入 heroId / slotId / uniqueId
```

不建议在 `EquipmentPanel` 中伪造显示 `青锋剑`，因为这会让 UI 与真实 loadout 数据不一致。

## 8. 风险评估

| 风险 | 等级 | 说明 |
|---|---:|---|
| Bootstrap 缺失 | 高 | 当前 Phase10Main 不是完整启动场景，后续主循环无法可靠进入。 |
| SaveManager 未 init | 高 | 存档无法保证读取、迁移、写入，Inventory/Equipment 只能落到默认或空内存状态。 |
| EquipmentMediator 职责膨胀 | 中 | 若直接把 Save/Phase8/Phase9 初始化塞入 Mediator，会破坏 UI 桥接层边界。 |
| 初始装备与已穿戴状态混淆 | 中 | `青锋剑` 在背包中存在不代表武器槽显示它。需明确默认穿戴规则。 |
| BattleDebugRunner 顶层日志误导 | 低 | 只是模块加载日志，但会干扰判断真实启动入口。 |
| Step11 问题误回归 | 低 | 当前证据没有指向 Scene/Prefab/UUID/Script Registry 污染。 |

## 9. 推荐下一步

推荐进入：

```text
Phase10-Step12A1 Main Bootstrap Implementation
```

目标：

```text
为 Phase10Main 建立正式启动入口
统一初始化 SaveManager / Inventory / Equipment / Reward / Phase9 必要系统
确保 EquipmentMediator 在数据 ready 后刷新
明确新档默认装备是否自动穿戴
```

建议验收标准：

1. Preview 出现明确启动日志：
   - `SaveManager init`
   - `InventoryInit initialize start`
   - `EquipmentService 初始化完成`
   - `EquipmentUIPresenter 初始化完成`
2. `Phase10Main.scene` 中启动入口唯一且命名明确。
3. `SaveManager.getData()` 非空，版本为 V8。
4. Inventory 初始装备存在。
5. 若设计要求默认穿戴，则 hero `0` 的 weapon slot 指向 `ITEM_EQ_WEAPON_001` 对应实例。
6. EquipmentPanel 不再只依赖静态 Prefab 文本。
7. BattleDebugRunner 不作为 Phase10Main 启动入口。

## 10. 最终判定

```text
Phase10-Step12A0 审计：FAIL
```

原因：

```text
根因已定位：
Phase10Main 当前缺少正式 Bootstrap 启动入口。
EquipmentMediator 绑定正常，但它不是 Save / Phase8 / Phase9 / 主玩法初始化器。
青锋剑属于 Inventory 初始装备，不等同于 hero 0 已穿戴武器。
BattleDebugRunner 仅为模块加载日志，不是当前 Scene 运行入口。
```

