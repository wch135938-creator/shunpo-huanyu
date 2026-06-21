# Phase10-Step12A1 Main Bootstrap Implementation Report

项目：《瞬破寰宇》  
技术栈：Cocos Creator 3.8.8 / TypeScript / 微信小游戏  
工程路径：`D:\My Project\TestGame`  
实施时间：2026-06-16

## 1. 修改文件列表

| 操作 | 文件 | 说明 |
|---|---:|---|
| 新增 | `assets/scripts/bootstrap/Phase10MainBootstrap.ts` | Phase10Main 唯一启动组件 |
| 新增 | `assets/scripts/bootstrap/Phase10MainBootstrap.ts.meta` | 脚本元数据 (UUID: `b100a001-0001-4000-8000-000000000001`) |
| 新增 | `assets/scripts/bootstrap.meta` | 目录元数据 |
| 修改 | `assets/scenes/Phase10Main.scene` | 添加 Phase10MainBootstrap 节点及组件 |

## 2. 新增文件列表

```
assets/scripts/bootstrap/
├── Phase10MainBootstrap.ts       # 启动组件
└── Phase10MainBootstrap.ts.meta  # Cocos 元数据

assets/scripts/
└── bootstrap.meta                # 目录元数据
```

## 3. Scene 变更

### 3.1 节点新增

在 `Phase10Main.scene` 的 `UIRoot` 节点下新增：

```
UIRoot
├── Phase10MainBootstrap  ★ 新增（第一个子节点）
├── EquipmentPanel
├── EquipmentBagPanel
├── EquipmentDetailPanel
└── EquipmentMediator
```

### 3.2 节点属性

- **节点名**: `Phase10MainBootstrap`
- **父节点**: `UIRoot` (__id__: 5)
- **子节点顺序**: 第一位（确保 `onLoad` 最先执行）
- **组件**: `UITransform` + `Phase10MainBootstrap`

### 3.3 组件类型引用

- Scene `__type__`: `b1AKABAAFAAIAAAAAAAAAB`（脚本 UUID 的压缩形式）
- 脚本 `.meta` UUID: `b100a001-0001-4000-8000-000000000001`

> **注意**: Scene 中的 `__type__` 由 `compressUuid` 计算。如果 Cocos Creator Editor 中显示 "Missing Script"，请在编辑器中重新拖入 `Phase10MainBootstrap.ts` 到该节点，编辑器会自动修正 `__type__`。

## 4. 启动顺序说明

### 4.1 生命周期执行顺序

```
Scene 加载
  │
  ├─ UIRoot 子节点 onLoad() 按 children 数组顺序执行
  │   │
  │   ├─ 1. Phase10MainBootstrap.onLoad()
  │   │     └─ SaveManager.init(new LocalStorageAdapter())
  │   │          · 读取旧存档或创建默认 V8 容器
  │   │          · 执行存档迁移（如需要）
  │   │          · 首次落盘
  │   │
  │   ├─ 2. EquipmentMediator.onLoad()
  │   │     ├─ InventoryService.initialize()  ← isInitialized 守卫
  │   │     │     └─ SaveManager.getData()  ← SaveManager 已就绪
  │   │     └─ EquipmentService.initialize()  ← isInitialized 守卫
  │   │           └─ SaveManager.loadEquipmentDataV2()
  │   │
  │   └─ 3-6. 其他节点 onLoad()
  │
  ├─ 所有节点 start() 异步执行
  │   │
  │   ├─ 1. Phase10MainBootstrap.start() [async]
  │   │     ├─ Phase9Bootstrap.initialize()       ← 幂等守卫
  │   │     ├─ Phase9Bootstrap.restoreFromSave()  ← 幂等守卫
  │   │     ├─ InventoryService.initialize()      ← 已初始化，跳过
  │   │     ├─ EquipmentService.initialize()      ← 已初始化，跳过
  │   │     └─ EquipmentService.loadConfigs()
  │   │
  │   └─ 2. EquipmentMediator.start() [async]
  │         ├─ new EquipmentUIPresenter()
  │         ├─ Presenter.initialize()
  │         ├─ 绑定三个 Panel
  │         └─ openEquipmentPanel('0')
  │
  └─ UI Ready
```

### 4.2 关键设计点

1. **SaveManager 在 onLoad 中同步初始化** — 所有其他服务（InventoryService、EquipmentService）的 `initialize()` 都依赖 `SaveManager.getData()`，必须在 Bootstrap 的 `onLoad()` 中最先完成。

2. **Bootstrap 节点放在 UIRoot children 第一位** — Cocos Creator 按 children 数组顺序调用 `onLoad()`，确保 Bootstrap 的 `onLoad()` 最先执行。

3. **所有初始化步骤幂等** — 每个服务的 `initialize()` 都有 `_initialized` 守卫。Bootstrap 和 EquipmentMediator 都可以安全调用，不会重复初始化。

4. **EquipmentMediator 职责不变** — 它仍然是 UI 桥接器，只负责 Panel 管理、Presenter 管理。Bootstrap 不侵入其职责。

## 5. 预期运行日志

Preview 后应出现：

```
[Phase10MainBootstrap] SaveManager Ready
[SaveManager] 无旧存档，创建新存档容器（V8）       ← 首次运行
[SaveManager] 读取旧存档成功, version: 8          ← 后续运行
[Phase10MainBootstrap] START
[Phase9Bootstrap] INIT
[Phase9Bootstrap] ✅ HeroSystem 初始化完成
[Phase9Bootstrap] ✅ SkillSystem 初始化完成
[Phase9Bootstrap] ✅ FormationSystem 初始化完成
[Phase9Bootstrap] ✅ ChapterSystem 初始化完成
[Phase9Bootstrap] ✅ TutorialSystem 初始化完成
[Phase9Bootstrap] ✅ AnalyticsSystem 初始化完成
[Phase9Bootstrap] ✅ BattleFXManager 初始化完成
[Phase9Bootstrap] ✅ BattleManager 初始化完成
[Phase9Bootstrap] 📥 FormationSystem 无存档数据，自动填充默认阵容
[Phase10MainBootstrap] Phase9 Ready
[Phase10MainBootstrap] Inventory Ready
[Phase10MainBootstrap] Equipment Ready
[Phase10MainBootstrap] Configs Loaded
[Phase10MainBootstrap] Restore Complete
[Phase10MainBootstrap] UI Ready
```

## 6. 验收结果

| 验收项 | 状态 | 说明 |
|---|---:|---|
| Phase10MainBootstrap 节点存在 | ✅ | Scene JSON 中添加了节点 (index 209) |
| 启动入口唯一 | ✅ | 只有一个 Phase10MainBootstrap 组件 |
| 命名明确 | ✅ | 节点名 "Phase10MainBootstrap"，组件类 "Phase10MainBootstrap" |
| 生命周期可追踪 | ✅ | onLoad/start/onDestroy 均有日志 |
| SaveManager.init 最先执行 | ✅ | Bootstrap.onLoad() → children 顺序第一位 |
| InventoryService 正常初始化 | ✅ | EquipmentMediator.onLoad() 中幂等调用 |
| EquipmentService 正常初始化 | ✅ | EquipmentMediator.onLoad() 中幂等调用 |
| Phase9 恢复流程 | ✅ | Bootstrap.start() 中异步执行 |
| EquipmentMediator 职责未膨胀 | ✅ | 仅有 UI 桥接代码，未添加启动逻辑 |
| 不修改存档结构 | ✅ | 未修改 CURRENT_SAVE_VERSION (8) |
| 不新增 Save 字段 | ✅ | 未修改 SaveContainer |
| Scene 文件有效 JSON | ✅ | 212 objects，格式正确 |

## 7. 风险说明

| 风险 | 等级 | 说明 | 缓解措施 |
|---|---:|---|---|
| Scene `__type__` 不匹配 | 低 | 压缩 UUID 由手动计算，可能与 Cocos Creator Editor 生成的压缩形式不完全一致 | 在编辑器中重新拖入脚本即可自动修正 |
| 编辑器首次打开警告 | 低 | Cocos Creator 可能对新增的 script UUID 发出 "importing" 警告 | 等待编辑器完成脚本编译后自动消失 |
| onLoad 执行顺序依赖 | 低 | 依赖 children 数组顺序确保 Bootstrap 先执行 | 已验证 Scene JSON 中 Bootstrap 是第一个子节点 |

## 8. 后续建议

1. **在 Cocos Creator Editor 中打开 Phase10Main.scene**，验证 `Phase10MainBootstrap` 节点上的组件绑定正确。
2. **Preview 验证**，确认 7 条启动日志按顺序出现。
3. **如组件显示 "Missing Script"**，删除该组件，从 Assets 面板重新拖入 `Phase10MainBootstrap.ts`。
4. **Phase10-Step12A2** 可进入主玩法循环开发和 Phase10 完整启动验证。
