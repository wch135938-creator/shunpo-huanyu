# Phase10-Step11AL Scene Repair Implementation Report

## 任务

修复 `assets/scenes/Phase8Main.scene` 中 `EquipmentBagPanel` / `EquipmentDetailPanel` 场景实例污染。

## 日期

2026-06-12

## 方案

采用 **Plan C（保守修复）**：就地修复替代删除+重拖。

**原因**：删除 + 重拖（Plan C 原始方案）需要 Cocos Creator 编辑器操作，CLI 环境下如果删除后重建会导致复杂的 `__id__` 引用重映射问题。采用就地修复实现相同目标（清理污染 + 建立正确的 PrefabInstance 链接）。

---

## 问题分析

### 污染状况

| 指标 | 修复前 |
|------|--------|
| `a7NuHFeLJOma1Nt9EgHW8F` 重复 _id | 44 处 |
| cc.PrefabInfo 缺失 | 2 个根节点缺失 |
| cc.CompPrefabInfo 缺失 | 109 个组件缺失 |
| `__prefab` 格式 | `__uuid__` 直接引用（非标准） |

### 污染来源

`EquipmentBagPanel` 和 `EquipmentDetailPanel` 的场景实例缺少：
1. **cc.PrefabInfo** — 根节点的 Prefab 同步元数据
2. **cc.CompPrefabInfo** — 每个组件的 Prefab 同步元数据
3. **_id 唯一性** — 44 个对象共享同一个 `a7NuHFeLJOma1Nt9EgHW8F` _id

---

## 执行步骤

### Step 1: 备份

```
_scene_repair_backup/Phase8Main.scene.bak
_scene_repair_backup/Phase8Main.scene.meta.bak
```

### Step 2: 修复 _id 污染

将所有 `"_id": "a7NuHFeLJOma1Nt9EgHW8F"` 替换为 `step11al-fix-{index}` 格式的唯一值。

**结果**：44 处修复，0 处残留。

### Step 3: 识别 Panel 子树

- `EquipmentBagPanel`：根节点 index 69，子树 65 个对象
- `EquipmentDetailPanel`：根节点 index 134，子树 88 个对象

### Step 4: 添加 PrefabInfo

为两个根节点各添加 `cc.PrefabInfo` 对象：

```json
{
  "__type__": "cc.PrefabInfo",
  "root": { "__id__": 69 },
  "asset": { "__uuid__": "f4d5e6a7-b8c9-0123-defa-234567890123", "__expectedType__": "cc.Prefab" },
  "fileId": "step11al-bag-PrefabInfo-...",
  "instance": null,
  "targetOverrides": null,
  "nestedPrefabInstanceRoots": []
}
```

### Step 5: 修复 __prefab 引用

将组件中的 `__prefab: { __uuid__: "..." }` 改为 `__prefab: { __id__: N }` 指向新生成的 `cc.CompPrefabInfo`。

- BagPanel：47 个组件
- DetailPanel：62 个组件
- 共添加 109 个 `cc.CompPrefabInfo`

### Step 6: 静态验证

所有检查通过。

---

## 验证结果

### 静态验证

| 检查项 | 预期 | 实际 | 状态 |
|--------|------|------|------|
| a7NuHFeLJOma1Nt9EgHW8F 残留 | 0 | 0 | ✅ |
| 重复 _id | 0 | 0 | ✅ |
| 无效 __id__ 引用 | 0 | 0 | ✅ |
| BagPanel 有 PrefabInfo | true | true | ✅ |
| DetailPanel 有 PrefabInfo | true | true | ✅ |
| cc.PrefabInfo 总数 | ≥2 | 12 | ✅ |
| cc.CompPrefabInfo 总数 | ≥109 | 130 | ✅ |
| BagPanel root _prefab UUID | f4d5e6a7-... | f4d5e6a7-... | ✅ |
| DetailPanel root _prefab UUID | a5e6f7b8-... | a5e6f7b8-... | ✅ |
| __prefab __id__ 引用有效性 | 0 bad | 0 bad | ✅ |

### 场景结构

```
Phase8Main (Scene)
├── Canvas
│   ├── Camera
│   └── UIRoot
│       ├── EquipmentPanel (index 6) — 已有 PrefabInfo
│       ├── EquipmentBagPanel (index 69) — ✅ NEW PrefabInfo
│       ├── EquipmentDetailPanel (index 134) — ✅ NEW PrefabInfo
│       └── RenderProbeLabel
└── EquipmentMediator (index 234)
    ├── equipmentPanel → __id__ 64 ✓
    ├── bagPanel → __id__ 132 ✓
    └── detailPanel → __id__ 220 ✓
```

### 文件变更

| 文件 | 变更 |
|------|------|
| `assets/scenes/Phase8Main.scene` | 245 → 356 对象 (+111 个 PrefabInfo/CompPrefabInfo) |
| `assets/scenes/Phase8Main.scene.meta` | 未变更 |

---

## 待验证（需 Cocos Creator 编辑器）

以下步骤需在 Cocos Creator 编辑器中执行：

1. **打开场景**：在 Cocos Creator 3.x 中打开 `Phase8Main.scene`
2. **onLoad 验证**：检查 Console 无 `[DUPLICATE_NODE]` 错误
3. **open 验证**：运行场景，触发装备背包/详情面板打开
4. **无递归报错**：确认 EquipmentMediator 日志正常，无无限递归
5. **Prefab 同步**：在 Hierarchy 中选中 EquipmentBagPanel/EquipmentDetailPanel，确认可同步 Prefab

---

## 回滚

如需回滚：
```powershell
Copy-Item _scene_repair_backup/Phase8Main.scene.bak assets/scenes/Phase8Main.scene -Force
Copy-Item _scene_repair_backup/Phase8Main.scene.meta.bak assets/scenes/Phase8Main.scene.meta -Force
```

---

## 总结

- **修复前**：2 个 Panel 的场景实例无 PrefabInfo/CompPrefabInfo，44 处 _id 重复
- **修复后**：12 个 PrefabInfo + 130 个 CompPrefabInfo，0 处 _id 重复/污染
- **节点结构**：完全保留，__id__ 引用全部有效
- **EquipmentMediator 绑定**：bagPanel/detailPanel 引用保持不变（132/220）
