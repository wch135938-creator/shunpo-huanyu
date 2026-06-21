# Phase9-Step6-SaveV2 — 实施报告

## 概述

完成 `V7 → V8` 存档迁移实现，将 Phase9 模块（HeroSystem / SkillSystem / FormationSystem）正式集成到存档容器中。

---

## 新增文件

| 文件 | 路径 | 说明 |
|------|------|------|
| SaveContainerV8.ts | `assets/scripts/save/SaveContainerV8.ts` | V8 存档容器接口 + SaveMetaV2 + 工厂函数 |
| SaveV2Migrator.ts | `assets/scripts/save/SaveV2Migrator.ts` | V7→V8 迁移器（hero/skill/formation/meta） |
| Phase9Step6DebugRunner.ts | `assets/scripts/debug/Phase9Step6DebugRunner.ts` | 176 条断言测试 |
| SaveContainerV8.ts.meta | `.meta` 文件 | Cocos Creator 元数据 |
| SaveV2Migrator.ts.meta | `.meta` 文件 | Cocos Creator 元数据 |
| Phase9Step6DebugRunner.ts.meta | `.meta` 文件 | Cocos Creator 元数据 |
| HeroSaveData.ts.meta | `.meta` 文件 | Phase9-Step1 补遗 |
| SkillSaveData.ts.meta | `.meta` 文件 | Phase9-Step2 补遗 |
| FormationSaveData.ts.meta | `.meta` 文件 | Phase9-Step3 补遗 |

## 修改文件

| 文件 | 变更 |
|------|------|
| `assets/scripts/save/SaveContainer.ts` | `CURRENT_SAVE_VERSION` 从 7 → 8 |
| `assets/scripts/save/SaveMigrationSystem.ts` | 注册 V7→V8 迁移步骤 + `_migrateV7ToV8()` 方法 |
| `assets/scripts/save/SaveManager.ts` | V8 集成：事件发射、hero/skill/formation 数据读写、`migrateIfNeeded()`、`deferredSkillMigration()`、V8 默认容器 |
| `assets/scripts/core/EventManager.ts` | 新增 `SAVE_MIGRATED` 和 `SAVE_V8_LOADED` 事件常量 |

---

## 迁移流程

```
V7 SaveContainer
    │
    ├── cards[] + growth.heroProgressList[] → heroes (HeroSaveData)
    │   · cardId (number) → heroId ("hero_XXX")
    │   · card 数据 (level/star/exp) 与 growth 数据 (level/exp/power) 合并
    │   · growth 字段优先
    │   · 缺失字段补默认值 (breakthrough=0, unlocked=true)
    │
    ├── hero_data.json defaultSkillIds → skills (SkillSaveData)
    │   · 需要 heroDefaultSkillMap 参数（运行时由 HeroRepository 提供）
    │   · 无参数时创建空 skills — SkillSystem.initialize() 补全
    │   · heroSkillLoadouts 设置为英雄默认技能列表
    │   · 所有技能 level=1, unlocked=false
    │
    ├── 已拥有英雄 → formations (FormationSaveData)
    │   · 创建 default_pve 预设
    │   · 按战力降序填充槽位
    │   · 不足时允许空槽 (warnings 记录)
    │
    ├── 初始化 SaveMetaV2
    │   · createdAt / updatedAt = now
    │   · migratedFromVersion = 7
    │   · configVersions = {}
    │   · lastRewardTransactionId = ""
    │
    └── 初始化预留字段 (chapters / tutorial / analytics)
    
    ↓
V8 SaveContainerV8
    saveVersion = 8
```

---

## 事件系统

| 事件名 | 触发时机 | 数据 |
|--------|----------|------|
| `save:migrated` | 迁移步骤执行成功 | `{fromVersion, toVersion, stepsExecuted, executedSteps}` |
| `save:v8Loaded` | `SaveManager.init()` 完成 | `{version, timestamp}` |

---

## SaveContainerV8 接口

```typescript
interface SaveContainerV8 extends SaveContainer {
  heroes?: HeroSaveData;        // Phase9-Step1
  skills?: SkillSaveData;       // Phase9-Step2
  formations?: FormationSaveData; // Phase9-Step3
  chapters?: ChapterSaveData;   // Phase9 预留
  tutorial?: TutorialSaveData;  // Phase9 预留
  analytics?: AnalyticsSaveData; // Phase9 预留
  saveMetaV2: SaveMetaV2;       // 元数据
}

interface SaveMetaV2 {
  createdAt: number;
  updatedAt: number;
  migratedFromVersion: number;
  configVersions: Record<string, string>;
  lastRewardTransactionId: string;
}
```

---

## 测试结果

- 测试断言总数：**176 条**（超过最低要求 150）
- 测试覆盖：
  - SaveMetaV2 工厂函数（8 条）
  - 预留类型工厂函数（10 条）
  - SaveContainerV8 工厂函数（15 条）
  - Hero 迁移 — 完整合并（14 条）
  - Hero 迁移 — 仅 cards（7 条）
  - Hero 迁移 — 仅 growth（7 条）
  - Hero 迁移 — 空数据（5 条）
  - Skill 迁移 — 有 heroDefaultSkillMap（15 条）
  - Skill 迁移 — 无 heroDefaultSkillMap（5 条）
  - Formation 迁移（15 条）
  - Formation 迁移 — 空英雄（5 条）
  - 完整 V7→V8 迁移（16 条）
  - 完整迁移 — 空容器（6 条）
  - cardId→heroId 转换（5 条）
  - upgradeToV8 函数（7 条）
  - SaveMetaV2 从迁移创建（6 条）
  - 迁移步骤注册（4 条）
  - 迁移结果结构（6 条）
  - HeroSaveData 默认值（4 条）
  - SkillSaveData 默认值（6 条）
  - FormationSaveData 默认值（5 条）
  - Event 事件发射（3 条）
  - CURRENT_SAVE_VERSION（2 条）

---

## 风险说明

1. **Skill 迁移延迟**：V7→V8 迁移时如果 `heroDefaultSkillMap` 未提供（config 未加载），skills 初始化为空结构。需要 `deferredSkillMigration()` 在配置加载后补全。不影响系统正常初始化流程（SkillSystem.initialize() 会补全）。

2. **cardId 转换约定**：`cardId` (number) → `heroId` (string) 使用 `"hero_" + padStart(3, '0')` 约定。这不适用于所有可能的 hero ID 格式（如 DLC 英雄可能有不同前缀），但符合当前项目的配置结构。

3. **向后兼容**：`SaveContainerV8` 中 heroes/skills/formations 均为 optional (`?`)，允许从 V7 逐步迁移。旧代码路径（如 `_ensureDungeonData`）不受影响。

4. **ISaveAdapter 类型限制**：`ISaveAdapter` 的方法签名使用 `SaveContainer` 类型，存储 V8 容器时通过类型断言处理。运行时 V8 容器完全兼容 V7 结构。

---

## 后续建议

1. **Phase9-Step7+**：在 HeroSystem / SkillSystem / FormationSystem 的 `restore()` / `save()` 方法中对接 SaveManager 的 `saveHeroData()` / `loadHeroData()` 等方法。

2. **延迟 Skill 迁移完善**：在 ConfigManager 加载完成后调用 `SaveManager.deferredSkillMigration(heroDefaultSkillMap)` 补全技能默认数据。

3. **章节系统**：当 Phase9 实现章节系统时，使用预留的 `chapters` 字段。

4. **新手引导**：当实现新手引导时，使用预留的 `tutorial` 字段。

5. **数据分析**：当集成分析 SDK 时，使用预留的 `analytics` 字段。

---

## 开发日期

2026-06-05
