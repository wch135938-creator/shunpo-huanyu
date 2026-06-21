# Phase10-Step11Q: EquipmentPanel 运行时类定位报告

**日期**：2026-06-08
**状态**：FORCE 日志已注入，待用户 Preview 验证

---

## 1. 全项目 Step11O 搜索结果

### 结论：Step11O 日志仅存在于正确的源文件

| 文件 | Step11O 出现次数 | 说明 |
|------|:---:|------|
| `assets/scripts/ui/EquipmentPanel.ts` | 30 处 | ✅ 诊断日志完整存在 |
| `docs/Phase10-Step11O-*.md` | 引用 | 报告引用（非代码） |
| 其他文件 | 0 | ✅ 无异常 |

**确认**：`assets/scripts/ui/EquipmentPanel.ts` 是唯一的 Step11O 代码载体。

---

## 2. EquipmentPanel 重复类搜索结果

### 结论：无重复类

| 搜索内容 | 结果 | 位置 |
|----------|:---:|------|
| `@ccclass('EquipmentPanel')` | **仅 1 处** | `assets/scripts/ui/EquipmentPanel.ts:24` |
| `class EquipmentPanel` | **仅 1 处** | `assets/scripts/ui/EquipmentPanel.ts:25` |
| `EquipmentPanel*.ts` 文件 | **仅 1 个** | `assets/scripts/ui/EquipmentPanel.ts` |
| `cc.MissingScript`（prefab） | **0** | — |
| `cc.MissingScript`（scene） | **0** | — |

**确认**：项目中不存在重复 EquipmentPanel 类、backup/corrupt/deprecated 文件未被编译。

---

## 3. EquipmentPanel.ts.meta UUID 检查

```json
{
  "uuid": "fd274f49-b5d5-4940-92d0-1131d863d326",
  "importer": "typescript",
  "imported": true
}
```

**UUID**：`fd274f49-b5d5-4940-92d0-1131d863d326` — **与预期一致**。

---

## 4. UUID 一致性链：.meta → Prefab → Scene

### 完整追踪

| 位置 | UUID 格式 | UUID 值 |
|------|-----------|---------|
| `EquipmentPanel.ts.meta` | GUID | `fd274f49-b5d5-4940-92d0-1131d863d326` |
| `EquipmentPanel.prefab[48]` | Compressed | `fd2749JtdVJQJLQETHYY9Mm` |
| `Phase8Main.scene[67]` | Compressed | `fd2749JtdVJQJLQETHYY9Mm` |

### Cocos Creator 3.x UUID 格式说明

Cocos Creator 3.x 使用两种 UUID 格式：
- **GUID 格式**（`.meta` 文件）：`fd274f49-b5d5-4940-92d0-1131d863d326`
- **Compressed 格式**（scene/prefab 内部）：`fd2749JtdVJQJLQETHYY9Mm`

`fd2749JtdVJQJLQETHYY9Mm` 是 `fd274f49-b5d5-4940-92d0-1131d863d326` 的压缩表示形式。

### 结论

**UUID 链完全一致**。Scene 中的 EquipmentPanel 脚本组件正确引用了 `EquipmentPanel.ts`。

---

## 5. Phase8Main.scene EquipmentPanel 组件结构

```
EquipmentPanel Node (_id: 01NR+kExlCvIBehDhBOXUR)
├─ _components:
│   ├─ [65] cc.UITransform        — 布局组件
│   ├─ [67] fd2749JtdVJQJLQETHYY9Mm — ✅ EquipmentPanel 脚本
│   └─ [69] cc.Widget             — Widget 组件
└─ _prefab: [71] cc.PrefabInfo → UUID: 8aab8dc9-042c-40cc-b2db-2feca1ffdddd
                                   → EquipmentPanel.prefab
```

### Prefab 内的组件结构

```
EquipmentPanel.prefab (UUID: 8aab8dc9-042c-40cc-b2db-2feca1ffdddd)
├─ Root Node
│   ├─ [46] cc.UITransform
│   ├─ [48] fd2749JtdVJQJLQETHYY9Mm — ✅ EquipmentPanel 脚本
│   └─ [52] cc.Widget
└─ Children: panelRoot → slotContainer + labels + closeButton
```

**确认**：Scene 和 Prefab 中的脚本组件引用均指向正确的 UUID。

---

## 6. 已插入的 Step11Q_FORCE 日志

### 位置 1：模块加载（`EquipmentPanel.ts` line 27）

```typescript
// import 之后，class 声明之前
console.error('[Step11Q_FORCE] EquipmentPanel module loaded from assets/scripts/ui/EquipmentPanel.ts');
```

**用途**：确认此 .ts 文件是否被 Cocos Creator Preview 加载。

### 位置 2：onLoad 入口（`EquipmentPanel.ts` line 363）

```typescript
onLoad(): void {
    console.error('[Step11Q_FORCE] EquipmentPanel REAL onLoad entered');
    super.onLoad();
    // ...
}
```

**用途**：确认场景中的 EquipmentPanel 实例是否进入了 onLoad。**注意：此行在 super.onLoad() 之前**。

### 位置 3：open 入口（`EquipmentPanel.ts` line 110）

```typescript
open(heroId: string): void {
    console.error('[Step11Q_FORCE] EquipmentPanel.open entered, heroId =', heroId);
    // ...
}
```

**用途**：确认 EquipmentMediator 是否成功调用了 `equipmentPanel.open()`。

**注意**：三条 FORCE 日志均使用 `console.error()` 以确保在 Console 中以红色高亮显示，不会被过滤。

---

## 7. 现象分析

### 已知事实

| # | 事实 | 状态 |
|---|------|:---:|
| 1 | `@ccclass('EquipmentPanel')` 唯一 | ✅ |
| 2 | `class EquipmentPanel` 唯一 | ✅ |
| 3 | `.ts.meta` UUID = `fd274f49-...` | ✅ |
| 4 | Scene 组件 `__type__` = compressed UUID | ✅ |
| 5 | Prefab 组件 `__type__` = compressed UUID | ✅ |
| 6 | 无 MissingScript | ✅ |
| 7 | 无 backup/corrupt 文件被编译 | ✅ |
| 8 | Step11O 日志在源码中存在 | ✅ |
| 9 | Step11O 日志在 Preview 中不出现 | ❌ 异常 |

### 核心矛盾

```
UUID 链正确 → Scene 应该加载正确的脚本
源码有日志 → 脚本执行应该打印日志
Screen 显示 UI → 确实有代码在运行
但 → Step11O 日志完全没有
```

### 可能性分析

| 可能性 | 概率 | 排除依据 |
|--------|:---:|----------|
| Preview 运行了不同的 Scene | 低 | 用户确认 Phase8Main.scene 已打开 |
| 脚本未编译 | 中 | Step11P 报告已确认 temp 中有编译产物 |
| **Cocos Creator 编译缓存未更新** | **高** | 用户编辑 .ts 后可能未触发完整重编译 |
| Console 过滤器排除 | 低 | console.log 默认不过滤 |
| 旧编译产物覆盖 | 中 | library/ 或 temp/ 缓存 |

---

## 8. 用户验证步骤

请按以下顺序执行：

```
1. 确认 EquipmentPanel.ts 已保存（文件应有 * 未保存标记消失）
2. 等待 Cocos Creator 右下角 "编译中..." 消失
3. 关闭当前 Preview（如果已打开）
4. 确认当前打开的是 Phase8Main.scene
5. 点击 Preview 按钮
6. 打开 Console（F12 或 开发者工具）
7. 在 Console 搜索框输入：Step11Q_FORCE
8. 截图完整 Console 结果
```

### Console 中应看到的关键日志

```text
[Step11Q_FORCE] EquipmentPanel module loaded from assets/scripts/ui/EquipmentPanel.ts
[Step11Q_FORCE] EquipmentPanel REAL onLoad entered
[Step11Q_FORCE] EquipmentPanel.open entered, heroId = 0
```

---

## 9. 判定规则（用户确认后执行）

### 情况 A：三条 FORCE 日志全部出现

```text
✅ Module loaded
✅ onLoad entered
✅ open entered
```

→ **脚本正确加载**。问题不在类定位，而在：
- `_renderSlots` 内部逻辑
- `_createSlotItem` Prefab 创建
- `heroView.slots` 数据

→ 下一步检查 `_refreshAll` → `_renderSlots` 日志链。

---

### 情况 B：只有 Module loaded，无 onLoad

```text
✅ Module loaded
❌ onLoad entered
❌ open entered
```

→ **脚本被加载但 onLoad 未执行**。原因：
- EquipmentPanel 节点 `_active = false`
- 父节点 inactive
- 脚本组件 `_enabled = false`
- Prefab 实例化失败

---

### 情况 C：有 Module loaded + onLoad，无 open

```text
✅ Module loaded
✅ onLoad entered
❌ open entered
```

→ **EquipmentMediator 未调用 open()**。原因：
- `EquipmentMediator.start()` 未执行
- `_openActiveScenePanel()` 条件不满足
- Presenter 未初始化

---

### 情况 D：完全没有 FORCE 日志

```text
❌ Module loaded
❌ onLoad entered
❌ open entered
```

→ **此 .ts 文件未被 Preview 加载**。必须执行：
1. 关闭 Cocos Creator
2. 删除 `temp/` 目录
3. 删除 `library/` 目录
4. 重新打开项目
5. 等待完全编译
6. 重新 Preview

---

## 10. 补充发现

### EquipmentPanel.prefab 存在

项目中有 `assets/prefabs/panels/EquipmentPanel.prefab` (UUID: `8aab8dc9-042c-40cc-b2db-2feca1ffdddd`)。Scene 中的 EquipmentPanel 节点是此 Prefab 的实例。

这意味着 EquipmentPanel 的**组件定义**在 Prefab 中，Scene 只存覆盖/引用。如果在编辑器中修改 Prefab 组件属性，需要确保 Prefab 已保存。

### prefab.backup.Step10M 存在

`assets/prefabs/panels/EquipmentPanel.prefab.backup.Step10M` 存在备份文件。以 `.backup.Step10M` 结尾的文件不会被 Cocos Creator 当作资源导入，**已确认不会干扰编译**。
