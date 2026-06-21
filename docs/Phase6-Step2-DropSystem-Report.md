# Phase6-Step2 DropSystem 实现报告

> 日期：2026-06-02 | 阶段：Phase6-Step2 | 系统：掉落系统（DropSystem）

---

## 一、文件清单

| 文件 | 类型 | 职责 |
|------|------|------|
| `assets/scripts/data/drop_types.ts` | 新增 | DropResultData / DropHistoryEntry / DropClaimResult 类型定义 |
| `assets/scripts/save/DropSaveData.ts` | 新增 | 掉落历史存档数据结构 |
| `assets/scripts/systems/DropSystem.ts` | 新增 | 掉落系统核心实现（roll/claim/history/validate） |
| `assets/scripts/debug/DropDebugRunner.ts` | 新增 | 掉落系统集成测试（12 项） |
| `assets/scripts/save/SaveContainer.ts` | 修改 | 新增 `dropHistory` 字段 |
| `assets/scripts/save/SaveManager.ts` | 修改 | 新增掉落历史读写方法 + 旧存档兼容 |

---

## 二、模块职责

### 2.1 DropSystem（核心系统）

| 方法 | 职责 |
|------|------|
| `loadConfig()` | 加载 drop_table.json 配置到内存缓存 |
| `rollDrop(dropTableId, sourceId, playerId?)` | 按权重计算掉落，返回 DropResultData（claimStatus=false） |
| `rollDropMulti(tableIds[], sourceId, playerId?)` | 多表组合语法糖 |
| `claimDrop(resultData, playerId?)` | 领取奖励：发金币/经验到 ProgressSystem，标记 claimStatus=true，写入历史 |
| `getDropHistory(playerId?)` | 查询掉落历史记录 |
| `validateDrop(resultData)` | 校验掉落数据合法性（数值范围/装备有效性/来源ID） |
| `getDropEntry(dropTableId)` | 查询指定掉落表配置 |
| `getAllDropEntries()` | 获取全部掉落表配置 |

**掉落计算规则：**

- **保底掉落** (`isGuaranteed: true`)：必定获得，数量在 `minCount ~ maxCount` 随机
- **概率掉落** (`isGuaranteed: false`)：以 `dropRate` 概率判定（Math.random < dropRate）
- **多表组合**：支持逗号/空格分隔的 ID 列表（如 `"1,2,3"` 或 `"1 2"`），汇总所有表产出
- **非数字 ID 支持**：支持 `"F001"` 等首通掉落表 ID（自动格式化 `DROP_F001`）
- **装备品质映射**：从 itemId 解析品质（`ITEM_EQUIP_N_XXX`→Common, `ITEM_EQUIP_R_XXX`→Rare, `ITEM_EQUIP_SR_XXX`→Epic），过滤对应品质装备池后随机选取

### 2.2 DropResultData（数据结构）

| 字段 | 类型 | 说明 |
|------|------|------|
| `gold` | number | 金币数量 |
| `exp` | number | 经验数量 |
| `equipmentList` | EquipmentInstanceData[] | 已创建的装备实例 |
| `itemList` | DropResultItemEntry[] | 非装备物品（材料/抽卡碎片/钻石） |
| `dropSourceId` | string | 来源标识 |
| `claimStatus` | boolean | 是否已领取（防重复） |
| `timestamp` | number | 生成时间戳 |

### 2.3 存档集成

- **SaveContainer.dropHistory**：顶层存档字段，存储 `{ history: DropHistoryEntry[] }`
- **SaveManager 新增方法**：
  - `saveDropHistoryData(data)` — 全量保存
  - `loadDropHistoryData()` — 全量读取
  - `appendDropHistoryEntry(entry)` — 追加单条（最多 200 条，FIFO 裁剪）
- **旧存档兼容**：`_ensureDropHistoryData()` 自动补默认空历史

---

## 三、集成点

| 系统 | 集成方式 |
|------|----------|
| **DungeonSystem** | 解耦：DungeonSystem 保留内置 `_generateRewards()`，DropSystem 提供独立接口供其他系统调用 |
| **EquipmentSystem** | drop_roll 时通过 `createInstance()` 创建装备实例；validate 时校验 configId 有效性 |
| **ProgressSystem** | claim 时通过 `addHeroExp()` 按英雄平分发放经验 |
| **SaveManager** | 掉落历史通过 SaveManager 读写，自动保存 |
| **EventManager** | 派发 `drop:rolled` 和 `drop:claimed` 事件 |

---

## 四、测试覆盖

| # | 测试项 | 类型 |
|---|--------|------|
| 01 | 配置加载 | 功能验证 |
| 02 | 单表掉落 (DROP_001) | 功能验证 |
| 03 | 固定掉落 (Boss 表 DROP_005) | 保底验证 |
| 04 | 随机掉落（100 次采样平均值） | 概率验证 |
| 05 | 多表组合（逗号/数组） | 组合验证 |
| 06 | 领取奖励 | 发放验证 |
| 07 | 防重复领取 | 边界验证 |
| 08 | 掉落历史查询 | 存档验证 |
| 09 | 合法性校验（正常数据） | 校验验证 |
| 10 | 非法数据校验（null/负值/空ID/超大值） | 边界验证 |
| 11 | 事件派发（rolled + claimed） | 事件验证 |
| 12 | 边界测试（不存在表/空ID/字符串ID/空格分隔/首通表） | 边界验证 |

---

## 五、设计决策

1. **claim 与 roll 分离**：roll 生成结果但不发放 gold/exp，claim 执行发放。支持 UI 展示"确定领取"流程。
2. **装备实例在 roll 时创建**：保持与 DungeonSystem 一致的模式，equipmentList 中的实例 uid 在 roll 时即确定。
3. **复用现有 drop_config.ts**：不创建新的 DropItemEntry 类型，直接使用 Phase6 已有的 `DropItem`/`DropEntry`/`DropTableConfig`。
4. **品质映射**：从 itemId 命名约定（`ITEM_EQUIP_{quality}_{index}`）自动解析品质，过滤装备池。
5. **FIFO 历史裁剪**：最多保留 200 条，避免存档膨胀。
6. **保底机制**：当所有掉落表均无产出时（如配置为空），自动给予小量基础奖励（gold 10~50, exp 5~20）。

---

## 六、未来扩展

- **接入 PlayerEconomySystem**：当前金币仅记录日志，待经济系统实现后接入
- **接入任务/事件系统**：通过 `rollDrop(sourceId)` 为任务奖励/活动奖励提供统一掉落入口
- **接入挂机系统**：挂机奖励通过 DropSystem 生成，复用同一套掉落逻辑
- **SaveValidator 深度联动**：validate 可扩展为检查存档状态一致性
