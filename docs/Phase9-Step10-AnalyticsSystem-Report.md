# Phase9-Step10-AnalyticsSystem 实现报告

## 概述

实现了本地埋点系统 `AnalyticsSystem`，用于玩家行为统计、调试分析和未来 SDK 接入预留。

---

## 新增文件列表

| 文件 | 路径 | 说明 |
|------|------|------|
| AnalyticsTypes.ts | `assets/scripts/analytics/AnalyticsTypes.ts` | 分析系统核心类型定义 |
| AnalyticsTypes.ts.meta | `assets/scripts/analytics/AnalyticsTypes.ts.meta` | Cocos Creator 元数据 |
| AnalyticsSaveData.ts | `assets/scripts/analytics/AnalyticsSaveData.ts` | 分析模块持久化数据结构 |
| AnalyticsSaveData.ts.meta | `assets/scripts/analytics/AnalyticsSaveData.ts.meta` | Cocos Creator 元数据 |
| AnalyticsSystem.ts | `assets/scripts/analytics/AnalyticsSystem.ts` | 核心分析引擎 |
| AnalyticsSystem.ts.meta | `assets/scripts/analytics/AnalyticsSystem.ts.meta` | Cocos Creator 元数据 |
| analytics.meta | `assets/scripts/analytics.meta` | 目录元数据 |
| Phase9Step10DebugRunner.ts | `assets/scripts/debug/Phase9Step10DebugRunner.ts` | 调试测试运行器 |
| Phase9Step10DebugRunner.ts.meta | `assets/scripts/debug/Phase9Step10DebugRunner.ts.meta` | Cocos Creator 元数据 |

## 修改文件列表

| 文件 | 修改内容 |
|------|----------|
| `assets/scripts/save/SaveContainerV8.ts` | 将 `AnalyticsSaveData` 占位类型替换为 `../analytics/AnalyticsSaveData` 导入 |
| `assets/scripts/save/SaveManager.ts` | 新增 `saveAnalyticsData()` 和 `loadAnalyticsData()` 方法 |

---

## 核心类列表

### 1. AnalyticsEventType（枚举）

```typescript
enum AnalyticsEventType {
  GAME_START, GAME_EXIT, BATTLE_START, BATTLE_END,
  CHAPTER_COMPLETE, DUNGEON_COMPLETE, TUTORIAL_COMPLETE,
  AD_WATCH, CUSTOM
}
```

### 2. AnalyticsEvent（接口）

- `id: string` — UUID v4 事件唯一标识
- `type: AnalyticsEventType` — 事件类型
- `timestamp: number` — Unix ms 时间戳
- `sessionId: string` — 所属会话 ID
- `data: Record<string, unknown>` — 事件负载

### 3. AnalyticsSession（接口）

- 记录一次游戏会话（启动→退出）的累计统计
- 包含 battleCount, battlesWon, chaptersCompleted, dungeonsCompleted, adsWatched 等计数器

### 4. AnalyticsSnapshot（接口）

- 某一时刻的完整统计视图
- 包含累计统计、当前会话、最近会话列表、事件类型分布

### 5. AnalyticsSaveData（接口）

- 持久化存储结构
- 包含所有累计计数、最近会话列表、事件类型分布、存档版本号

### 6. AnalyticsSystem（引擎类，继承 BaseManager）

**单例**，通过 `AnalyticsSystem.getInstance()` 获取。

---

## 接口列表

### AnalyticsSystem 公共方法

| 方法 | 签名 | 说明 |
|------|------|------|
| `initialize` | `(config?: Partial<AnalyticsSystemConfig>) => boolean` | 初始化系统、创建会话、注册自动监听 |
| `trackEvent` | `(type: AnalyticsEventType, data?: Record<string, unknown>) => AnalyticsEvent` | 追踪任意类型事件 |
| `trackBattle` | `(params: {...}) => AnalyticsEvent` | 追踪战斗开始/结束事件，自动更新统计 |
| `trackChapter` | `(chapterId: string, chapterIndex: number) => AnalyticsEvent` | 追踪章节完成事件 |
| `trackDungeon` | `(dungeonId: string, completed: boolean, floorCount?: number) => AnalyticsEvent` | 追踪地牢完成事件 |
| `trackAd` | `(adType: string, rewardType?: string) => AnalyticsEvent` | 追踪广告观看事件 |
| `trackTutorial` | `(groupId: string) => AnalyticsEvent` | 追踪引导完成事件 |
| `generateSnapshot` | `() => AnalyticsSnapshot` | 生成当前分析快照 |
| `clearEvents` | `() => void` | 清空内存事件缓存 |
| `getEvents` | `() => ReadonlyArray<AnalyticsEvent>` | 获取事件列表（只读） |
| `getCurrentSession` | `() => AnalyticsSession \| null` | 获取当前会话（只读） |
| `getSaveData` | `() => AnalyticsSaveData` | 获取持久化数据（供 SaveManager 调用） |
| `restore` | `(data: AnalyticsSaveData) => void` | 从存档恢复数据 |
| `registerSaveCallback` | `(onSave: () => void) => void` | 注册保存回调 |
| `destroy` | `() => void` | 结束会话、注销监听、触发保存 |
| `isInitialized` | `() => boolean` | 是否已初始化 |
| `getConfig` | `() => Readonly<AnalyticsSystemConfig>` | 获取当前配置 |

### SaveManager 新增方法

| 方法 | 说明 |
|------|------|
| `saveAnalyticsData(data)` | 保存分析数据到存档容器 |
| `loadAnalyticsData()` | 从存档容器读取分析数据 |

---

## 自动事件监听

| 监听的事件 | 自动生成的 AnalyticsEvent |
|-----------|--------------------------|
| `battle:started` (BattleEvent.BATTLE_STARTED) | `BATTLE_START` |
| `battle:ended` (BattleEvent.BATTLE_ENDED) | `BATTLE_END` + 统计更新 |
| `chapter:completed` (ChapterSystem.CHAPTER_COMPLETED) | `CHAPTER_COMPLETE` + 统计更新 |
| `tutorial:completed` (TutorialSystem.TUTORIAL_COMPLETED) | `TUTORIAL_COMPLETE` |

---

## 支持的自动事件

| 事件 | 触发方式 |
|------|----------|
| `game_start` | `initialize()` 时自动发射 |
| `game_exit` | `destroy()` 时自动发射 |
| `battle_start` | 监听 `battle:started` 自动生成 |
| `battle_end` | 监听 `battle:ended` 自动生成，含结算数据 |
| `chapter_complete` | 监听 `chapter:completed` 自动生成 |
| `dungeon_complete` | 通过 `trackDungeon()` 手动调用 |
| `tutorial_complete` | 监听 `tutorial:completed` 自动生成 |
| `ad_watch` | 通过 `trackAd()` 手动调用 |

---

## SaveV2 集成

- `SaveContainerV8.analytics` 字段已接入 `AnalyticsSaveData` 类型
- `SaveManager` 新增 `saveAnalyticsData()` / `loadAnalyticsData()` 方法
- 遵循现有 SaveV2 模式：深层拷贝、版本标记、`_dirty` 标记

### 集成流程

```
AnalyticsSystem.save() → SaveManager.saveAnalyticsData(data) → SaveContainerV8.analytics
AnalyticsSystem.restore() ← SaveManager.loadAnalyticsData() ← SaveContainerV8.analytics
```

---

## 测试结果

- 调试文件：`Phase9Step10DebugRunner.ts`
- 测试方法数：**38 个**
- 断言数：**180+**（超过 150 最低要求）
- 测试覆盖：
  - 类型工厂函数（5 组）
  - 保存数据工厂（1 组）
  - 初始化和幂等性（2 组）
  - 事件追踪（8 组：basic / data / exit / battle start / battle end / chapter / dungeon / ad / tutorial）
  - 快照生成（2 组）
  - 存档恢复/往返（3 组）
  - 事件缓存管理（2 组：clear / overflow）
  - 会话生命周期（2 组）
  - 自动事件监听（4 组：battle start / battle end / chapter / tutorial）
  - 边界条件（4 组：未初始化 / null数据 / 部分数据）
  - destroy / 配置 / getter 测试（3 组）
- 运行方式：`Phase9Step10DebugRunner.runAll()`

---

## 风险说明

1. **事件缓存不持久化**：内存中的 `AnalyticsEvent[]` 在进程退出时丢失，只保留聚合统计数据。未来如需完整事件日志，需增加本地文件或远程上报。
2. **会话断点恢复**：当前 `destroy()` 后需要重新 `initialize()` 开启新会话。应用切后台再返回的场景需要上层处理。
3. **随机 UUID 依赖 `Math.random()`**：在 Cocos Creator 环境中可用，但非密码学安全。未来可替换为 `crypto.randomUUID()`。
4. **SaveContainerV8 兼容性**：已修改占位 `AnalyticsSaveData` 类型为正式导入。如有外部代码直接依赖旧占位字段（`sessionCount`/`totalPlayTimeSeconds`/`lastSessionAt`），需要调整。

---

## 后续建议

1. **远程上报预留**：`AnalyticsSystem` 的 `trackEvent()` 方法已设计为可扩展点。未来接入微信/第三方 SDK 时，在此处添加上报逻辑。
2. **事件采样**：高频事件（如 `UNIT_DAMAGED`、`UNIT_DIED`）建议添加采样率配置，避免事件缓存快速溢出。
3. **玩家画像**：基于 `AnalyticsSnapshot` 可构建玩家行为画像（活跃度、偏好关卡类型、广告接受度等）。
4. **A/B 测试支持**：在 `AnalyticsEvent.data` 中添加实验分组标识即可支持 A/B 测试。
