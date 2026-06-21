# Phase6-Step1-DungeonSystem-Report

## 概述

实现了《瞬破寰宇》Phase6 地牢基础系统，支持玩家进入地牢、通关、失败、奖励结算及数据记录。

**完成日期**: 2026-06-02

---

## 目录结构

### 新增文件

```
assets/
├── scripts/
│   ├── data/
│   │   ├── dungeon_types.ts          # 地牢枚举定义
│   │   ├── dungeon_data.ts           # 地牢运行时数据结构
│   │   └── dungeon_config.ts         # 地牢配置类型定义
│   ├── save/
│   │   └── DungeonSaveData.ts        # 地牢存档数据结构
│   ├── systems/
│   │   └── DungeonSystem.ts          # 地牢主系统
│   └── debug/
│       └── DungeonDebugRunner.ts     # 集成测试运行器
└── resources/
    └── config/
        └── systems/
            └── dungeon_config.json   # 地牢配置数据
```

### 修改文件

```
assets/scripts/save/
├── SaveContainer.ts                  # 新增 dungeon 字段
└── SaveManager.ts                    # 新增地牢读写方法 + 迁移逻辑
```

---

## 数据结构实现

### DungeonDifficulty 枚举 ([dungeon_types.ts](../assets/scripts/data/dungeon_types.ts))

| 值 | 描述 |
|---|---|
| `Normal` | 普通难度 |
| `Hard` | 困难难度 |
| `Expert` | 专家难度 |

### DungeonRewardType 枚举

| 值 | 描述 |
|---|---|
| `Gold` | 金币奖励 |
| `Exp` | 经验奖励 |
| `Equipment` | 装备奖励 |

### DungeonConfig ([dungeon_config.ts](../assets/scripts/data/dungeon_config.ts))

对应 `dungeon_config.json` 的完整类型定义，包含：
- `dungeonId`, `name`, `difficulty`
- `staminaCost`, `maxAttemptsPerDay`
- `dropTableId`, `rewardType[]`, `totalLayers`
- 可选 `bossConfig`, `specialEventConfig`

### DungeonInstanceData ([dungeon_data.ts](../assets/scripts/data/dungeon_data.ts))

单个地牢的玩家进度数据：
- `dungeonId`, `currentLayer`, `completedLayers[]`, `droppedRewards[]`

### DungeonRunData

单次挑战运行记录：
- `playerId`, `dungeonId`, `startTime`, `endTime`
- `isCleared`, `failReason?`, `rewardSettled`

### DungeonRewardData

奖励数据结构：
- `gold`, `exp`, `equipmentList[]`, `itemList[]`

### PlayerDungeonData

玩家地牢总数据（存档根）：
- `instances`, `runHistory[]`, `todayAttempts`
- `lastAttemptDate`, `currentStamina`, `maxStamina`

---

## 系统功能实现

### DungeonSystem ([DungeonSystem.ts](../assets/scripts/system/DungeonSystem.ts))

#### 核心 API

| 方法 | 功能 |
|---|---|
| `enterDungeon(dungeonId, playerId?)` | 校验体力+次数 → 消耗体力 → 创建运行记录 |
| `completeDungeon(dungeonId, playerId?)` | 生成奖励 → 结算 → 更新进度 → 记录历史 |
| `failDungeon(dungeonId, reason, playerId?)` | 标记失败 → 部分奖励（30%）→ 记录历史 |
| `getDungeonInfo(dungeonId)` | 返回配置 + 进度 + 今日次数 + 可进入状态 |
| `getAllDungeonInfos()` | 返回所有地牢的简要信息 |
| `canEnterDungeon(dungeonId)` | 校验体力 + 每日次数 |
| `getStamina()` | 返回当前/最大体力 |

#### 事件系统

| 事件名 | 触发时机 |
|---|---|
| `dungeon:entered` | 成功进入地牢 |
| `dungeon:completed` | 通关结算完成 |
| `dungeon:failed` | 失败结算完成 |

#### 体力系统

- 每日 0 点自动重置体力至满值
- 每 5 分钟自动恢复 1 点体力（可配置）
- `recoverStamina()` 手动触发恢复

#### 每日限制

- 每个地牢独立计算今日挑战次数
- 日期变更时自动重置（基于 `YYYY-MM-DD` 字符串比对）

---

## 奖励系统

### 掉落判定

1. 从 `drop_table.json` 加载掉落池配置
2. 遍历掉落项：
   - `isGuaranteed = true` → 必定获得 `[minCount, maxCount]` 随机数量
   - `isGuaranteed = false` → 以 `dropRate` 概率判定
3. 按类型分类：`gold`, `exp`, `equip`, `material`, `gachaFragment`, `diamond`

### 奖励发放

| 类型 | 处理方式 |
|---|---|
| Gold | 记录日志（待经济系统接入） |
| Exp | 通过 ProgressSystem 均分给所有英雄 |
| Equipment | 通过 EquipmentSystem 随机创建实例 |
| Material/其他 | 记录到 itemList |

### 失败奖励

- 保留完整奖励的 **30%**
- 金币/经验按比例缩减
- 装备奖励不保留
- 物品奖励保留 ≥1 个

---

## 存档集成

### SaveContainer 扩展

```typescript
interface SaveContainer {
  // ...existing fields...
  dungeon: DungeonSaveData;  // 新增
}
```

### SaveManager 扩展

- `savePlayerDungeonData(data)` — 保存到内存
- `loadPlayerDungeonData()` — 从内存读取
- `_ensureDungeonData(container)` — 旧存档兼容迁移

### 自动恢复

DungeonSystem.loadConfig() 执行时自动从 SaveManager 恢复数据。

---

## 配置数据

### dungeon_config.json

| ID | 名称 | 难度 | 体力 | 每日次数 | 层数 | Boss | 特殊事件 |
|---|---|---|---|---|---|---|---|
| 1 | 试炼洞窟 | Normal | 10 | 5 | 5 | - | - |
| 2 | 幽暗深渊 | Hard | 20 | 3 | 8 | 暗渊魔君 Lv.10 | - |
| 3 | 天劫秘境 | Expert | 30 | 2 | 10 | 天劫之主 Lv.20 | 天降神兵(15%) |

---

## 测试覆盖

### DungeonDebugRunner ([DungeonDebugRunner.ts](../assets/scripts/debug/DungeonDebugRunner.ts))

共 **13 项测试**：

| # | 测试名称 | 验证内容 |
|---|---|---|
| 01 | 配置加载 | 3 种难度配置均正确加载 |
| 02 | 进入校验 | 正常/不存在地牢的校验逻辑 |
| 03 | 进入地牢 | 体力消耗、活跃运行、事件派发 |
| 04 | 通关地牢 | 奖励生成、事件派发、运行清理 |
| 05 | 失败地牢 | 失败原因、部分奖励、事件派发 |
| 06 | 每日限制 | 5 次后正确拒绝第 6 次 |
| 07 | 体力管理 | 消耗/恢复/边界校验 |
| 08 | 地牢信息查询 | 单地牢信息完整性 |
| 09 | 全部地牢信息 | 批量查询 |
| 10 | 存档保存与恢复 | 完整保存→清除→恢复 |
| 11 | 事件派发 | entered/completed/failed 事件 |
| 12 | 奖励数据完整性 | 结构/类型/保底掉落 |
| 13 | 边界测试 | 不存在地牢/未进入即完成/重复进入/空字符串等 |

---

## 技术决策

1. **独立体力系统** — 内置简单体力管理，避免依赖尚未实现的 StaminaSystem
2. **装备奖励集成** — 通过 EquipmentSystem.createInstance() 创建奖励装备，与 Phase4B 完全兼容
3. **经验奖励集成** — 通过 ProgressSystem.addHeroExp() 发放经验，与 Phase4A 完全兼容
4. **掉落表复用** — 使用现有 `drop_table.json` 配置，不新建冗余配置
5. **仅访问私有成员** — 通过 `(obj as unknown as Record<string, unknown>)['_privateField']` 模式访问其他系统的内部状态，避免接口膨胀

---

## 设计约束遵循

- ✅ 所有数值从配置文件读取（无硬编码）
- ✅ 继承 BaseSystem 单例模式
- ✅ 遵循项目命名规范（XxxData, XxxConfig, XxxSystem）
- ✅ 与现有装备/成长系统完全兼容
- ✅ 存档通过 SaveManager 统一管理
- ✅ 不修改已有接口
