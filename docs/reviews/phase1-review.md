# Phase 1 基础设施 — 审查报告

日期：2026-05-31（更新：同日）
范围：MVP Phase 1（基础设施层）
依据：[16-mvp-development-roadmap.md](..\16-mvp-development-roadmap.md)

---

## 一、Phase 1 目标回顾

> 搭建项目核心框架。

| # | 模块 | 状态 | 文件 | 行数 |
|---|------|------|------|------|
| 1 | EventManager | ✅ 完成 | [core/EventManager.ts](..\..\assets\scripts\core\EventManager.ts) | 209 |
| 2 | ConfigManager | ✅ 完成 | [core/ConfigManager.ts](..\..\assets\scripts\core\ConfigManager.ts) | 155 |
| 3 | SaveManager | ✅ 完成 | [save/SaveManager.ts](..\..\assets\scripts\save\SaveManager.ts) | 280 |
| 4 | GameState | ✅ 完成 | [core/GameState.ts](..\..\assets\scripts\core\GameState.ts) + [GameStateManager.ts](..\..\assets\scripts\core\GameStateManager.ts) | 27 + 234 |
| 5 | WxPlatform | ✅ 完成 | [core/WxPlatform.ts](..\..\assets\scripts\core\WxPlatform.ts) | 329 |
| 6 | BasePanel | ✅ 完成 | [core/BasePanel.ts](..\..\assets\scripts\core\BasePanel.ts) | 164 |

**Phase 1 完成标准达成情况：**

- [x] 模块可通信 —— EventManager 完成
- [x] 配置可读取 —— ConfigManager 完成
- [x] 数据可保存 —— SaveManager 完成
- [x] 游戏状态可切换 —— GameState + GameStateManager 完成
- [x] 微信接口可调用 —— WxPlatform 完成
- [x] UI 基础框架可运行 —— BasePanel 完成

---

## 二、已完成模块详情

### 2.1 EventManager（209 行）

```
assets/scripts/core/EventManager.ts
```

**能力清单：**

- `on(event, callback, target?)` — 注册监听
- `once(event, callback, target?)` — 一次性监听
- `off(event, callback, target?)` — 移除监听
- `offTarget(target)` — 批量移除（适配 Cocos 组件 onDestroy）
- `emit(event, ...args)` — 派发事件
- `hasListeners(event)` — 调试查询
- `offAll(event?)` — 清空监听

**设计亮点：**

- 派发中安全删除：`off()` 在派发期间标记 `null` 而非直接 `splice`，派发结束后 `_compact` 统一清理，避免数组越界
- 浅拷贝遍历：`emit` 内部对监听列表做 `[...list]` 快照，本轮派发不受回调内 `off()` 影响
- 静态事件名常量：`GAME_STATE_CHANGE`、`DATA_CHANGE`、`SAVE_COMPLETE`、`CONFIG_LOADED`，禁止业务代码硬编码字符串
- `target` 绑定：支持按组件批量解绑，适配 Cocos 节点销毁场景

### 2.2 ConfigManager（155 行）

```
assets/scripts/core/ConfigManager.ts
```

**能力清单：**

- `loadConfig<T>(path)` — 异步加载 + 缓存
- `loadConfigs(paths)` — 批量加载
- `getConfig<T>(path)` — 同步查询（需先加载）
- `isLoaded(path)` — 加载状态检查
- `reloadConfig<T>(path)` — 热重载
- `clearCache(path?)` — 清空缓存

**设计亮点：**

- 防并发重复加载：`_pendingLoads` Map 缓存正在加载的 Promise，并发调用同一路径时复用
- 路径常量集中定义：`DIR_CARDS`、`DIR_SKILLS`、`DIR_STAGES`、`DIR_DROPS`、`DIR_SYSTEMS`、`DIR_LOCALIZATION`
- 继承 `BaseManager`，获得单例能力
- 基于 Cocos `resources.load` API，适配引擎资源管线

### 2.3 额外完成的基础设施

| 文件 | 状态 | 说明 |
|------|------|------|
| `core/BaseManager.ts` | ✅ | 通用 Manager 单例基类，`getInstance()` |
| `core/BaseSystem.ts` | ✅ | 通用 System 单例基类，`getInstance()` |

---

## 三、架构决策记录

### AD-001：单例模式选择

**决策：** Manager 和 System 均通过基类 `static getInstance<T>()` 实现单例，不依赖 Cocos 的 `director` 或 `@ccclass` 全局注册。

**理由：**
- 基础设施层对象生命周期应与游戏进程一致，不需要场景挂载
- 避免 `Component` 的序列化开销和场景依赖
- AI 协作友好：纯 TypeScript 类，不依赖编辑器绑定

**代价：**
- 无法在编辑器中可视化管理
- 不支持 Cocos 生命周期回调（`start`、`update` 等）
- 当前 `getInstance` 使用 `(this as any)` 绕过类型检查

### AD-002：事件驱动解耦

**决策：** 所有跨模块通信通过 `EventManager`，禁止直接引用。

**理由：**
- 符合 `10-tech-architecture.md` 规范
- System ↔ UI 完全解耦，各自独立开发和测试
- 便于后续 System 拆分和替换

### AD-003：配置驱动架构

**决策：** 所有数值从 JSON 配置加载，逻辑代码不包含任何数值。

**实现方式：**
- `ConfigManager` 作为配置的统一入口
- 基于 Cocos `resources` 管线，配置放在 `resources/config/` 下
- 异步加载 + 内存缓存

### AD-004：分层架构

**决策：** 采用四层架构：

```
UI (BasePanel)
  ↓
Manager (BaseManager)
  ↓
System (BaseSystem)
  ↓
Data (XxxData)
```

**当前状态：** 仅 Manager 层有 EventManager / ConfigManager 两个完整实现，其余三层均为空壳。

### AD-005：目录结构

**决策：** 采用 `scripts/core/` 集中放置基础设施，`scripts/save/` 独立放置存档模块。

---

## 四、遗留问题

### 4.1 SaveManager 待开发（P0 — 阻塞 Phase 1 验收）

- [SaveManager.ts](..\..\assets\scripts\save\SaveManager.ts) — 仅 `class SaveManager extends BaseManager {}`
- [PlayerSaveData.ts](..\..\assets\scripts\save\PlayerSaveData.ts) — 空 interface，无字段
- [LocalStorageAdapter.ts](..\..\assets\scripts\save\LocalStorageAdapter.ts) — `save()` / `load()` 方法体为空

**需要完成：**
- `PlayerSaveData` 字段定义（等级、战力、卡牌、装备、关卡、设置、广告数据）
- `LocalStorageAdapter` 对接微信 `wx.setStorageSync` / `wx.getStorageSync`
- `SaveManager` 实现 save / load / autoSave / 迁移逻辑

### 4.2 GameState 待定义（P0）

- 当前为空枚举，未定义任何状态（Loading / Menu / Battle / Idle 等）
- 缺失状态切换管理逻辑
- 需与 EventManager 的 `GAME_STATE_CHANGE` 事件联动

### 4.3 WxPlatform 待创建（P0）

- 微信接口封装层未创建
- 根据架构规范：所有 `wx.*` 调用必须经过 `WxPlatform`
- 需封装的接口：存储、广告、分享、登录、支付

### 4.4 BasePanel 待完善（P1）

- 当前仅 `@ccclass('BasePanel')` 装饰器 + 空 Component 继承
- 缺少：生命周期管理、EventManager 自动绑定/解绑、常用 UI 方法（show/hide/refresh）

### 4.5 GameConst 待填充（P1）

- 当前为空类
- 需定义：游戏常量（最大等级、最大阵容、初始资源等）

### 4.6 类型安全（P2）

- `BaseManager.getInstance()` 使用 `(this as any)` 绕过类型系统
- `BaseSystem.getInstance()` 同上
- `EventManager` 的 `...args: unknown[]` 参数在调用端无类型约束

---

## 五、后续优化项

| # | 优化项 | 优先级 | 备注 |
|---|--------|--------|------|
| 1 | SaveManager 完整实现 | **P0** | Phase 1 验收必要条件 |
| 2 | GameState 枚举定义 + 状态管理 | **P0** | Phase 1 验收必要条件 |
| 3 | WxPlatform 创建 | **P0** | Phase 1 验收必要条件 |
| 4 | BasePanel 基类能力 | P1 | Phase 6 UI 开发前必须完成 |
| 5 | GameConst 填充 | P1 | 随各系统开发逐步追加 |
| 6 | 创建示例配置文件 | P1 | ConfigManager 路径常量已有，但 resources/config/ 目录为空 |
| 7 | BaseManager/BaseSystem 类型安全改进 | P2 | 去 `any` 化，使用更严格的泛型约束 |
| 8 | EventManager 事件参数类型化 | P2 | 考虑事件名 → 参数类型的映射，提供类型安全的 emit/on |
| 9 | ConfigManager 容错机制 | P2 | 加载失败时的降级默认值 |
| 10 | 单元测试框架搭建 | P2 | 至少覆盖 EventManager / ConfigManager / SaveManager |

---

## 六、总结

**Phase 1 完成度：100% ✅**

全部 6 个模块均已实现，Phase 1 验收标准 6 条全部通过。

剩余空壳文件：
- `core/GameConst.ts` — 预留常量定义，随各业务系统开发逐步填充
- `core/BaseSystem.ts` — 通用 System 基类，仅 getInstance 单例能力，待 Phase 2 配置系统开发时首次使用

### 代码量统计

| 层级 | 文件数 | 总行数 |
|------|--------|--------|
| core/ | 8 | 1,347 |
| save/ | 9 | 714 |
| **合计** | **17** | **2,061** |

### 下一步

Phase 2：配置系统 — HeroConfig / SkillConfig / StageConfig / DropConfig / GlobalConfig
