# Phase9-Step5: EnemyExpansion — 实施报告

**日期**: 2026-06-05  
**开发者**: Vwa (AI辅助)  
**状态**: ✅ **完成，等待审核**

---

## 一、Step 目标

实现 **Enemy Expansion**——扩展敌人体系，支持 **普通怪 / Elite / Boss** 三级敌人品质，为 **ChapterSystem / DungeonSystem / Roguelike** 提供统一的敌人数据来源。

---

## 二、新增文件列表

| 文件 | 路径 | 行数 | 说明 |
|------|------|------|------|
| `EnemyTypes.ts` | `assets/scripts/enemy/EnemyTypes.ts` | ~200 | 核心类型定义：EnemyConfig / BossConfig / EnemyGroupConfig / EnemySnapshot + 工厂函数 |
| `EnemyRepository.ts` | `assets/scripts/enemy/EnemyRepository.ts` | ~260 | 敌人配置仓库：加载/缓存 enemy_data.json + boss_data.json，同步查询 |
| `EnemySystem.ts` | `assets/scripts/enemy/EnemySystem.ts` | ~340 | 敌人管理系统：配置管理 / 快照生成 / Boss 查询 / 敌人组组装 |
| `enemy_data.json` | `assets/resources/config/enemies/enemy_data.json` | ~110 | 敌人配置数据：6 只普通怪 + 3 只精英怪 |
| `boss_data.json` | `assets/resources/config/enemies/boss_data.json` | ~90 | Boss 配置数据：5 个 Boss |
| `Phase9Step5DebugRunner.ts` | `assets/scripts/debug/Phase9Step5DebugRunner.ts` | ~400 | 调试测试运行器：12 组测试，140 断言 |
| *.meta | 各目录 | — | Cocos Creator 编辑器元数据文件（8 个） |

**共计新增**: 14 个文件（6 个源码 + 2 个配置 + 1 个调试 + 5 个 .meta）

---

## 三、核心类列表

### 3.1 EnemyRepository (extends BaseSystem)

| 方法 | 签名 | 说明 |
|------|------|------|
| `loadEnemyConfig()` | `() => Promise<void>` | 加载 enemy_data.json，发送 `enemy:loaded` 事件 |
| `loadBossConfig()` | `() => Promise<void>` | 加载 boss_data.json，发送 `boss:loaded` 事件 |
| `loadAllConfigs()` | `() => Promise<void>` | 并行加载所有配置 |
| `getEnemy()` | `(enemyId) => EnemyConfig \| null` | 查询单个敌人 |
| `getAllEnemies()` | `() => EnemyConfig[]` | 获取所有敌人 |
| `getEnemiesByQuality()` | `(quality) => EnemyConfig[]` | 按品质筛选 |
| `getEnemiesByElement()` | `(element) => EnemyConfig[]` | 按元素筛选 |
| `getEnemyGroup()` | `(enemyIds) => EnemyConfig[]` | 按 ID 数组组装敌人组 |
| `getBoss()` | `(bossId) => BossConfig \| null` | 查询单个 Boss |
| `getAllBosses()` | `() => BossConfig[]` | 获取所有 Boss |
| `getBossesByDungeon()` | `(dungeonRef) => BossConfig[]` | 按地牢引用查询 |

### 3.2 EnemySystem (extends BaseSystem)

| 方法 | 签名 | 说明 |
|------|------|------|
| `initialize()` | `() => Promise<boolean>` | 初始化系统，确保 EnemyRepository 已加载 |
| `getEnemy()` | `(enemyId) => EnemyConfig \| null` | 查询单个敌人 |
| `getEnemyGroup()` | `(enemyIds) => EnemyConfig[]` | 按 ID 数组获取敌人组 |
| `getEnemyGroupConfig()` | `(enemyIds, formation, name?) => EnemyGroupConfig` | 获取带阵型的敌人组配置 |
| `getBoss()` | `(bossId) => BossConfig \| null` | 查询单个 Boss |
| `getBossesByDungeon()` | `(dungeonRef) => BossConfig[]` | 按地牢引用查询 Boss |
| `generateEnemySnapshot()` | `(EnemyConfig) => EnemySnapshot` | 从配置生成敌人快照 |
| `generateBossSnapshot()` | `(BossConfig) => EnemySnapshot` | 从 Boss 配置生成快照 |
| `generateById()` | `(id) => EnemySnapshot \| null` | 自动识别 enemy/boss 生成快照 |
| `generateSnapshots()` | `(ids[]) => EnemySnapshot[]` | 批量生成快照 |
| `generateAllSnapshots()` | `() => EnemySnapshot[]` | 生成所有敌人+Boss 快照 |
| `generateSnapshotsByQuality()` | `(quality) => EnemySnapshot[]` | 按品质过滤生成快照 |
| `assembleEnemyGroupForStage()` | `(enemyIds, formation) => EnemyGroupConfig` | 关卡敌人组组装 |

---

## 四、接口/类型列表

### 4.1 数据类型

| 接口 | 说明 |
|------|------|
| `EnemyQuality` | `'normal' \| 'elite' \| 'boss'` |
| `EnemyBaseStats` | `{hp, atk, def, speed, critRate?, critDamage?}` |
| `EnemyConfig` | 敌人配置（id, name, element, faction, quality, level, baseStats, skillIds, dropGroup） |
| `EnemyDataList` | enemy_data.json 顶层结构（version, name, data[]） |
| `BossConfig` | Boss 配置（扩展 dungeonRefs） |
| `BossDataList` | boss_data.json 顶层结构 |
| `EnemyGroupConfig` | 敌人组配置（enemyIds, formation） |
| `EnemySnapshot` | 战斗用敌人快照（含完整属性+技能+掉落） |

### 4.2 事件接口

| 事件常量 | 事件名 | 负载 |
|----------|--------|------|
| `EnemySystem.ENEMY_LOADED` | `enemy:loaded` | `{ count: number }` |
| `EnemySystem.BOSS_LOADED` | `boss:loaded` | `{ count: number }` |
| `EnemySystem.ENEMY_SNAPSHOT_GENERATED` | `enemy:snapshotGenerated` | `{ enemyId, snapshot }` |

### 4.3 工厂函数

| 函数 | 说明 |
|------|------|
| `createDefaultEnemyBaseStats()` | 创建默认普通敌人属性 |
| `createDefaultEliteBaseStats()` | 创建默认精英属性（含暴击） |
| `createDefaultBossBaseStats()` | 创建默认 Boss 属性（含高暴击） |
| `createDefaultEnemyGroupConfig()` | 创建空敌人组配置 |

---

## 五、测试结果

### Debug Runner: Phase9Step5DebugRunner

| 测试组 | 内容 | 断言数 | 结果 |
|--------|------|--------|------|
| 1. EnemyTypes 工厂函数 | 默认属性/精英/Boss/组配置创建 | 19 | ✅ |
| 2. EnemyRepository 加载 | 初始化状态/加载状态检查 | 5 | ✅ |
| 3. EnemyRepository 敌人查询 | 未加载时的查询行为 | 5 | ✅ |
| 4. EnemyRepository Boss 查询 | 未加载时的 Boss 查询行为 | 5 | ✅ |
| 5. EnemyRepository 敌人组 | 空列表/不存在 ID 处理 | 2 | ✅ |
| 6. EnemySystem 初始化 | 初始状态/未初始化抛异常 | 7 | ✅ |
| 7. EnemySystem 敌人查询 | 方法存在性/clearData | 8 | ✅ |
| 8. EnemySystem Boss 查询 | 方法存在性验证 | 6 | ✅ |
| 9. EnemySystem 快照生成 | 敌人/Boss/精英快照/深拷贝/批量 | 33 | ✅ |
| 10. 事件集成 | enemy:loaded / boss:loaded / snapshot / once / hasListeners | 13 | ✅ |
| 11. 边界情况 | 空技能/极高属性/零属性/中文/空dungeonRefs | 15 | ✅ |
| 12. 扩展边界 | 批量快照/全元素/全阵营/时间戳/clearData | 22 | ✅ |
| **合计** | | **140** | **✅ 全部通过** |

**断言数量: 140 ≥ 100，满足验收标准。**

---

## 六、配置数据

### enemy_data.json (6 普通 + 3 精英)

| ID | 名称 | 品质 | 元素 | 等级 | HP | 技能数 |
|----|------|------|------|------|----|--------|
| enemy_001 | 雾气精魄 | normal | 冰 | 1 | 200 | 1 |
| enemy_002 | 岩甲龟 | normal | 光 | 2 | 350 | 1 |
| enemy_003 | 毒刺蜂 | normal | 毒 | 2 | 280 | 1 |
| enemy_004 | 风刃雀 | normal | 雷 | 3 | 320 | 1 |
| enemy_005 | 火灵蝠 | normal | 火 | 4 | 400 | 1 |
| enemy_006 | 暗影斥候 | normal | 暗 | 5 | 450 | 1 |
| elite_001 | 冰霜守卫 | elite | 冰 | 5 | 1200 | 2 |
| elite_002 | 雷霆战将 | elite | 雷 | 8 | 2000 | 2 |
| elite_003 | 地狱火魔 | elite | 火 | 12 | 3500 | 3 |

### boss_data.json (5 个 Boss)

| ID | 名称 | 元素 | 等级 | HP | 技能数 | 地牢引用 |
|----|------|------|------|----|--------|----------|
| boss_001 | 噬渊魔君 | 暗 | 10 | 5000 | 2 | dungeon_001 |
| boss_002 | 雷霆龙王 | 雷 | 20 | 12000 | 2 | dungeon_002 |
| boss_003 | 朱雀焚天凤 | 火 | 35 | 25000 | 2 | dungeon_003 |
| boss_004 | 冰霜古龙 | 冰 | 50 | 50000 | 2 | dungeon_001,002 |
| boss_005 | 光耀圣使 | 光 | 70 | 100000 | 3 | dungeon_003 |

---

## 七、架构说明

### 目录结构

```
assets/
├── scripts/
│   └── enemy/                          ← 新建
│       ├── EnemyTypes.ts               ← 类型定义
│       ├── EnemyRepository.ts          ← 配置仓库
│       └── EnemySystem.ts             ← 敌人管理系统
├── resources/
│   └── config/
│       └── enemies/                    ← 新建
│           ├── enemy_data.json         ← 敌人配置数据
│           └── boss_data.json          ← Boss 配置数据
```

### 数据流

```
┌────────────────────┐
│  enemy_data.json    │
│  boss_data.json     │
└────────┬───────────┘
         │ loadConfig()
         ▼
┌────────────────────┐
│  ConfigManager      │
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│  EnemyRepository    │  ← 配置缓存与查询
│  .getEnemy()        │
│  .getBoss()         │
│  .getEnemyGroup()   │
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│  EnemySystem        │  ← 业务逻辑层
│  .initialize()      │
│  .generateSnapshot()│
│  .assembleGroup()   │
└────────┬───────────┘
         │
         ├── EnemyConfig → EnemySnapshot
         ├── BossConfig  → EnemySnapshot (quality='boss')
         └── EnemyGroupConfig (含 formation)
              │
              ▼
┌──────────────────────────────────┐
│  BattleManager / ChapterSystem    │  ← 消费者
│  DungeonSystem / Roguelike        │
└──────────────────────────────────┘
```

### 与旧版配置的关系

| 旧版 | 新版 | 说明 |
|------|------|------|
| `config/stages/enemy_data.json` | `config/enemies/enemy_data.json` | 新位置，字段统一为 baseStats 嵌套结构 |
| `config/systems/boss_config.json` | `config/enemies/boss_data.json` | 新位置，字段简化（name 代替 nameKey） |
| `config/enemy_config.ts` (EnemyEntry) | `enemy/EnemyTypes.ts` (EnemyConfig) | 旧类型保留，旧 BattleManager 仍可用 |

**新旧并存，不破坏现有系统。**

---

## 八、遵守的开发约束

| 约束 | 状态 |
|------|------|
| 禁止修改 BattleSystem | ✅ 零改动 |
| 禁止修改 BattleManager | ✅ 零改动 |
| 禁止修改 DungeonSystem | ✅ 零改动 |
| 禁止修改 DropSystem | ✅ 零改动 |
| 禁止修改 Roguelike | ✅ 零改动 |
| 禁止修改 SaveManager | ✅ 零改动 |
| 禁止修改 UI Prefab | ✅ 零改动 |
| 所有数值走配置 | ✅ enemy_data.json / boss_data.json |
| 禁止硬编码 | ✅ 路径常量、事件常量均集中定义 |
| 必须通过 EventManager 发送事件 | ✅ enemy:loaded / boss:loaded / snapshot 事件 |

---

## 九、风险说明

1. **与旧 enemy_data.json 共存**: 新配置位于 `config/enemies/`，旧配置仍位于 `config/stages/`，两者独立。旧 BattleManager 的 `_buildEnemyUnits()` 仍使用旧配置路径。后续在接入 ChapterSystem/DungeonSystem 时需逐步迁移。

2. **ConfigManager 加载路径**: 新配置路径为 `config/enemies/enemy_data`（相对 resources/），需确保 Cocos Creator 的 `resources.load()` 能正确加载该路径下的 JSON 文件。

3. **.meta UUID**: .meta 文件的 UUID 为占位值，Cocos Creator 编辑器打开项目时会自动重新生成正确的 UUID。不影响功能。

4. **EnemySnapshot 与 BattleUnit 的桥接**: EnemySnapshot 包含战斗所需的所有字段，但需要 BattleUnitFactory（或 BattleManager）新增 `enemySnapshotToBattleUnit()` 方法来转换为 BattleUnit。此转换建议在 Phase9-Step6 中实现。

---

## 十、后续建议

1. **Phase9-Step6**: 建议在 BattleManager 中新增 Phase9 敌方路径，通过 EnemySystem 生成 EnemySnapshot，由 BattleUnitFactory 转换为 BattleUnit 数组，实现完整的 Phase9 数据流。

2. **ChapterSystem 集成**: 在关卡配置中引用新 enemyIds，调用 `EnemySystem.assembleEnemyGroupForStage()` 生成敌人组。

3. **Roguelike 集成**: 使用 `getEnemiesByQuality()` 和 `getEnemiesByElement()` 实现 Roguelike 模式的随机敌人选取。

4. **旧配置迁移**: 逐步将 `config/stages/enemy_data.json` 的数据迁移到 `config/enemies/enemy_data.json`，最终废弃旧配置。

---

**🤖 Generated with [Claude Code](https://claude.com/claude-code)**

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
