# config-spec — 配置系统规范

版本：V1.0
日期：2026-05-31
适用阶段：Phase 2 及后续所有配置开发

---

## 一、配置目录规范

### 1.1 物理目录

```
assets/resources/config/          ← Cocos resources 加载根目录
│
├── cards/                        ← 角色配置
├── skills/                       ← 技能配置
├── stages/                       ← 关卡配置
├── drops/                        ← 掉落配置
├── systems/                      ← 系统参数配置
└── localization/                 ← 多语言文本（V2 预留）
```

**依据：** [ConfigManager.ts](../assets/scripts/core/ConfigManager.ts) 第 17 行 `CONFIG_ROOT = 'config'`，所有配置通过 `config/xxx` 相对路径加载。

### 1.2 规则

| 规则 | 说明 |
|------|------|
| 目录不可删除 | 6 个目录为 ConfigManager 的 DIR_* 常量所引用 |
| 不可自行新增目录 | 新配置类型先申请，评审通过后统一追加 |
| 对应物理位置 | `assets/resources/config/` 对应 Cocos `resources.load('config/...')` |
| 禁止跨目录引用 | cards/ 不引用 skills/，用 ID 关联 |

---

## 二、配置文件命名规范

### 2.1 命名格式

```
{模块名}_{文件用途}.json
```

### 2.2 各目录文件

| 目录 | 文件 | 说明 | Phase |
|------|------|------|-------|
| cards/ | `hero_list.json` | 角色主表（属性 + 成长 + 技能 ID 引用） | P2 |
| cards/ | `hero_star.json` | 升星消耗 & 属性加成 | P2 |
| skills/ | `skill_list.json` | 技能主表（倍率 + 效果 + 目标） | P2 |
| skills/ | `buff_list.json` | Buff / Debuff 效果表 | P2 |
| stages/ | `stage_chapter.json` | 章节 & 关卡配置 | P2 |
| stages/ | `stage_enemy.json` | 敌人阵容配置 | P2 |
| drops/ | `drop_pool.json` | 掉落池配置 | P2 |
| drops/ | `gacha_pool.json` | 抽卡池配置 | P2 |
| systems/ | `global_const.json` | 全局参数（等级上限、初始资源等） | P2 |
| systems/ | `shop_items.json` | 商店物品配置（V2） | V2 |
| systems/ | `ad_rewards.json` | 广告奖励配置（P7） | P7 |
| localization/ | `zh_cn.json` | 简体中文文本 | V2 |

### 2.3 规则

| 规则 | 说明 |
|------|------|
| 全小写 | 文件名全小写，单词间用下划线 |
| 单数为主 | `hero_list` 而非 `heroes`，保持一致 |
| 禁止拼音 | 全部英文命名 |
| 禁止空格 & 特殊字符 | 仅 `[a-z0-9_]` |
| 禁止版本后缀 | 不用 `_v1`、`_v2`，版本管理走 git |

---

## 三、配置 ID 规范

### 3.1 ID 格式

```
{前缀}_{编号}
```

| 前缀 | 编号范围 | 示例 | 说明 |
|------|----------|------|------|
| `CARD` | 001–999 | `CARD_001` | 角色 |
| `SKILL` | 001–999 | `SKILL_001` | 技能 |
| `BUFF` | 001–999 | `BUFF_001` | Buff/Debuff |
| `STAGE` | 001–999 | `STAGE_001` | 关卡 |
| `CHAPTER` | 001–099 | `CHAPTER_001` | 章节 |
| `ENEMY` | 001–999 | `ENEMY_001` | 敌人模板 |
| `DROP` | 001–999 | `DROP_001` | 掉落池 |
| `EQUIP` | 001–999 | `EQUIP_001` | 装备 |
| `ITEM` | 001–999 | `ITEM_001` | 道具/材料 |

### 3.2 规则

| 规则 | 说明 |
|------|------|
| 全大写 | ID 字符串全大写 |
| 下划线分隔 | 前缀与编号之间用下划线 |
| 三位编号 | 编号用 3 位数字，不足补零（001 而非 1） |
| 不可重用 | 删除的 ID 不再分配给新实体，防止存档数据混乱 |
| 区间预留 | 每个前缀预留 001–999，绝不越界 |
| 品质隐含 | ID 不隐含品质（不要 CARD_S_001 这种），品质是字段不是 ID |

### 3.3 编号区间分配（角色）

```
CARD_001 ~ CARD_099   N  品质
CARD_101 ~ CARD_199   R  品质
CARD_201 ~ CARD_299   SR 品质
CARD_301 ~ CARD_399   SSR 品质
CARD_401 ~ CARD_499   UR 品质
CARD_501 ~ CARD_999   预留（V2 扩展）
```

**优势：** 看 ID 即知品质，方便调试和 GM 面板操作。

---

## 四、字段命名规范

### 4.1 通用规则

| 规则 | 示例 |
|------|------|
| camelCase | `maxHp`, `atkSpeed`, `critRate` |
| 禁止拼音 | ❌ `gongJiLi` → ✅ `atk` |
| 禁止缩写歧义 | ❌ `dmg` (歧义) → ✅ `atk` / `damage` |
| 布尔字段加前缀 | `isBoss`, `canStack`, `hasRevive` |
| 百分比用小数 | `critRate: 0.15` (15%)，而非 `critPercent: 15` |
| 时间单位统一毫秒 | `durationMs: 3000` |
| 数组用复数 | `skillIds`、`dropItems` |
| 必填字段不可为 null | 默认值用 `0` / `""` / `[]`，不用 `null` |

### 4.2 标准字段字典

以下字段名在所有配置文件中含义统一：

| 字段名 | 类型 | 含义 |
|--------|------|------|
| `id` | string | 配置唯一 ID |
| `name` | string | 显示名称（走 localization key） |
| `desc` | string | 描述（走 localization key） |
| `icon` | string | 图标资源路径 |
| `quality` | string | 品质（N / R / SR / SSR / UR） |
| `level` | number | 等级 |
| `atk` | number | 攻击力 |
| `def` | number | 防御力 |
| `hp` | number | 生命值 |
| `speed` | number | 速度 |
| `critRate` | number | 暴击率（0.0–1.0） |
| `critDamage` | number | 暴击倍率（1.5 = 150%） |
| `skillIds` | string[] | 关联技能 ID 列表 |
| `cost` | number | 消耗 |
| `reward` | object | 奖励结构 |

---

## 五、JSON 结构规范

### 5.1 顶层结构

所有配置文件采用统一顶层格式：

```json
{
  "version": 1,
  "name": "display name",
  "data": []
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `version` | number | ✅ | 配置格式版本，用于 ConfigManager 解析兼容 |
| `name` | string | ✅ | 配置表显示名称（调试用） |
| `data` | array | ✅ | 记录数组，每项含 `id` 字段 |

### 5.2 记录格式

```json
{
  "id": "CARD_001",
  "...业务字段": "..."
}
```

### 5.3 完整示例

**cards/hero_list.json：**

```json
{
  "version": 1,
  "name": "角色主表",
  "data": [
    {
      "id": "CARD_001",
      "quality": "N",
      "nameKey": "hero_name_001",
      "descKey": "hero_desc_001",
      "faction": "混沌",
      "profession": "战士",
      "position": "front",
      "baseAtk": 80,
      "baseDef": 50,
      "baseHp": 1000,
      "baseSpeed": 100,
      "growthAtk": 12,
      "growthDef": 8,
      "growthHp": 150,
      "critRate": 0.05,
      "critDamage": 1.5,
      "skillIds": ["SKILL_001", "SKILL_002"],
      "maxLevel": 100,
      "breakLevels": [20, 40, 60, 80]
    }
  ]
}
```

**stages/stage_chapter.json：**

```json
{
  "version": 1,
  "name": "章节关卡配置",
  "data": [
    {
      "id": "STAGE_001",
      "chapterId": "CHAPTER_001",
      "order": 1,
      "nameKey": "stage_name_001",
      "energyCost": 5,
      "enemyIds": ["ENEMY_001", "ENEMY_002", "ENEMY_003"],
      "rewards": [
        {"type": "gold",    "base": 100, "growth": 10},
        {"type": "exp",     "base": 50,  "growth": 5}
      ],
      "firstClearRewards": [
        {"type": "diamond", "amount": 50}
      ],
      "recommendPower": 500
    }
  ]
}
```

### 5.4 引用规范

| 规则 | 说明 |
|------|------|
| 跨表用 ID 字符串 | `"skillIds": ["SKILL_001"]` 而非内嵌 skill 对象 |
| 数组表示多引用 | `"skillIds": ["SKILL_001", "SKILL_002", "SKILL_003"]` |
| 空引用用空数组 | `"skillIds": []` 不用 `null` |

### 5.5 数值规范

| 规则 | 说明 |
|------|------|
| 禁止魔法数字 | 每个数值必须有业务含义，不可出现 `"x": 9999` 类占位 |
| 概率用小数 | `0.045` 表示 4.5%，不用 `45` 或 `4.5%` |
| 大数值可读性 | `1000000` 不可 `1e6`，JSON 标准不支持科学计数法约定 |
| 百分比参数用百分值 | 技能倍率 `1.25` 表示 125%，伤害加成 `0.25` 表示 25% |
| 初始值记录在 base 字段 | `baseAtk` = 初始攻击力；`growthAtk` = 每级成长值 |

---

## 六、ConfigManager 对接规范

### 6.1 加载路径

```typescript
// ConfigManager 静态常量 → 物理路径映射
ConfigManager.DIR_CARDS         // → 'config/cards'
ConfigManager.DIR_SKILLS        // → 'config/skills'
ConfigManager.DIR_STAGES        // → 'config/stages'
ConfigManager.DIR_DROPS         // → 'config/drops'
ConfigManager.DIR_SYSTEMS       // → 'config/systems'
ConfigManager.DIR_LOCALIZATION  // → 'config/localization'
```

调用方式：

```typescript
const cm = ConfigManager.getInstance();

// 加载单个配置（含扩展名路径）
const heroData = await cm.loadConfig<HeroListConfig>('config/cards/hero_list');

// 批量加载
await cm.loadConfigs([
    'config/cards/hero_list',
    'config/skills/skill_list',
    'config/stages/stage_chapter',
]);

// 同步查询（必须先 loadConfig）
const config = cm.getConfig<HeroListConfig>('config/cards/hero_list');
```

### 6.2 类型定义规范

每个配置文件对应一个 TypeScript 类型文件：

```
assets/scripts/config/           ← 配置类型定义目录（新增）
├── HeroConfig.ts                ← 对应 config/cards/hero_list.json
├── SkillConfig.ts               ← 对应 config/skills/skill_list.json
├── StageConfig.ts               ← 对应 config/stages/stage_chapter.json
├── DropConfig.ts                ← 对应 config/drops/drop_pool.json
└── GlobalConfig.ts              ← 对应 config/systems/global_const.json
```

命名格式：`{Name}Config.ts`，接口名为 `{Name}Config`。

### 6.3 类型示例

```typescript
// HeroConfig.ts
export interface HeroListConfig {
    version: number;
    name: string;
    data: HeroEntry[];
}

export interface HeroEntry {
    id: string;
    quality: Quality;
    nameKey: string;
    descKey: string;
    faction: Faction;
    profession: Profession;
    position: 'front' | 'back';
    baseAtk: number;
    baseDef: number;
    baseHp: number;
    baseSpeed: number;
    growthAtk: number;
    growthDef: number;
    growthHp: number;
    critRate: number;
    critDamage: number;
    skillIds: string[];
    maxLevel: number;
    breakLevels: number[];
}

export type Quality = 'N' | 'R' | 'SR' | 'SSR' | 'UR';
export type Faction = '青龙' | '白虎' | '朱雀' | '玄武' | '混沌';
export type Profession = '战士' | '法师' | '刺客' | '坦克' | '辅助';
```

### 6.4 禁止事项

| 禁止 | 原因 |
|------|------|
| 多次加载同一配置 | ConfigManager 有缓存，但浪费并发槽位 |
| 绕过 ConfigManager 直接读 JSON | 失去缓存、热重载、错误处理 |
| 配置文件放在 resources 之外 | Cocos 无法加载 |
| 配置中包含函数或表达式 | JSON 不支持，且违反配置驱动原则 |
| 配置 key 使用中文 | 中文 Key 在部分环境下解析不稳定 |

---

## 七、微信小游戏资源规范

### 7.1 配置体积控制

| 规则 | 说明 |
|------|------|
| 单文件 ≤ 100KB | 大表拆分为多个子文件 |
| 总配置体积 ≤ 500KB | Phase 2 初期目标 |
| 不用的字段不写入 | JSON 保持精简 |
| 数组优先于对象嵌套 | `[{id:1},{id:2}]` 优于 `{"1":{...},"2":{...}}`，更易压缩 |

### 7.2 分包策略（V2 预留）

```
主包（首屏）
  └── config/systems/global_const.json    # 全局参数

分包 A：战斗
  ├── config/cards/
  ├── config/skills/
  └── config/stages/

分包 B：系统
  ├── config/drops/
  └── config/localization/
```

首包只加载 `global_const.json`（< 5KB），其余按场景分包加载。

### 7.3 加载时序

```
游戏启动
  1. ConfigManager.loadConfig('config/systems/global_const')  ← 阻塞
  2. 其他系统初始化
  3. GameState → LOADING
  4. ConfigManager.loadConfigs([...])  ← 异步并行
  5. GameState → MAIN_MENU
```

### 7.4 编辑器与真机差异

| 环境 | 加载方式 | 延迟 |
|------|----------|------|
| Cocos 编辑器 | 本地文件读取 | < 10ms |
| 微信真机 | `wx.getFileSystemManager` 读取 | 50–200ms |
| 微信远程 | CDN 下载 | 500–2000ms |

设计原则：所有配置按**真机延迟**做性能预算，不在编辑器内验证"够快"。

---

## 八、质量门禁

新增或修改配置文件时，必须通过以下检查：

| # | 检查项 | 标准 |
|---|--------|------|
| 1 | JSON 合法 | `JSON.parse` 不抛异常 |
| 2 | 字段完整 | 必填字段全部存在，无 null 值 |
| 3 | ID 唯一 | data 数组内 `id` 无重复 |
| 4 | ID 引用有效 | 跨表引用的 ID 在目标表中存在 |
| 5 | 数值范围 | 概率在 0–1，伤害 > 0，时长 > 0 |
| 6 | 命名合规 | 文件名、字段名、ID 均符合本规范 |
| 7 | 对应类型文件 | `scripts/config/` 下有对应的 `.ts` 类型定义 |
| 8 | 根目录正确 | 在 `assets/resources/config/` 下 |

---

## 九、变更记录

| 版本 | 日期 | 变更内容 |
|------|------|----------|
| 1.0 | 2026-05-31 | 初始版本，覆盖 7 大规范 + 质量门禁 |
