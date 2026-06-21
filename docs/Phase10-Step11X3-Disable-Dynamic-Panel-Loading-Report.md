# Phase10-Step11X3 — Disable Dynamic Panel Loading Report

## 日期

2026-06-09

## 状态

**完成。等待用户 Preview 验证。**

---

## 一、修改内容

**仅修改了 1 个文件：** `assets/scripts/ui/EquipmentMediator.ts`

### 1.1 移除动态加载能力

| 变更项 | 之前 | 之后 |
|--------|------|------|
| `import` | `assetManager, Prefab, instantiate, find` | `find`（仅用于 duplicate 检测） |
| UUID 常量 | `EQUIPMENT_PANEL_UUID` / `EQUIPMENT_BAG_PANEL_UUID` / `EQUIPMENT_DETAIL_PANEL_UUID` | 已删除 |
| `assetManager.loadAny` | ✅ 在 `_loadPrefabPanel` 中使用 | ❌ 已移除 |
| `instantiate()` | ✅ 在 `_loadPrefabPanel` 中使用 | ❌ 已移除 |
| `node.setParent(Canvas)` | ✅ 在 `_loadPrefabPanel` 中使用 | ❌ 已移除 |

### 1.2 `_ensurePanelsLoaded()` — 改为纯校验

不再执行任何动态加载。逻辑变为：

1. 检查 `equipmentPanel` / `bagPanel` / `detailPanel` 是否为 null
2. 如有缺失 → `console.error` 输出缺失列表 + "Dynamic panel loading is DISABLED"
3. 如全部绑定 → 输出 "All panels are bound from Inspector"
4. 绑定完好时 → 运行 `_checkDuplicateNodes()` 进行重复节点检测

```ts
private async _ensurePanelsLoaded(): Promise<void> {
    const missing: string[] = [];

    if (!this.equipmentPanel)  missing.push('equipmentPanel');
    if (!this.bagPanel)        missing.push('bagPanel');
    if (!this.detailPanel)     missing.push('detailPanel');

    if (missing.length > 0) {
        console.error('[EquipmentMediator] Inspector bindings missing:', missing.join(', '));
        console.error('[EquipmentMediator] Dynamic panel loading is DISABLED. Please bind panels in the Inspector.');
        return;
    }

    console.error('[EquipmentMediator] All panels are bound from Inspector. Dynamic loading disabled.');
    this._checkDuplicateNodes();
}
```

### 1.3 `_loadPrefabPanel()` — 改为安全 no-op

保留方法签名（接口兼容），但任何时候调用均直接返回 `null`：

```ts
private async _loadPrefabPanel<T extends Component>(
    uuid: string, nodeName: string, compName: string,
): Promise<T | null> {
    console.error(
        '[EquipmentMediator] Dynamic panel loading is DISABLED. Refusing to load:',
        'compName=', compName, 'nodeName=', nodeName, 'uuid=', uuid,
    );
    return null;
}
```

### 1.4 新增绑定状态输出

在 `start()` 中 `_ensurePanelsLoaded()` 之后输出：

```ts
console.error('[EquipmentMediator] binding status', {
    equipmentPanel: !!this.equipmentPanel,
    bagPanel: !!this.bagPanel,
    detailPanel: !!this.detailPanel,
});
```

### 1.5 新增重复节点检测 `_checkDuplicateNodes()`

在绑定完好时，检查 Canvas 子节点中是否存在以下重复节点：

- `EquipmentDetailPanel`
- `EquipmentDetailPanel-root`
- `EquipmentDetailPanel-slotPickerCloseBtn`
- `EquipmentBagPanel`
- `EquipmentPanel`

如发现重复（同名节点 > 1），输出 `[DUPLICATE_NODE]` 报告节点名、数量和 UUID。

**仅报告，不删除。**

---

## 二、验收清单

| 检查项 | 状态 |
|--------|------|
| `_ensurePanelsLoaded` 改为纯校验 | ✅ |
| `_loadPrefabPanel` 改为安全 no-op | ✅ |
| `assetManager.loadAny` 已禁止 | ✅ |
| `instantiate` 已禁止（Panel 级别） | ✅ |
| UUID 常量已清理 | ✅ |
| Inspector 绑定状态日志 | ✅ |
| 重复节点检测 `_checkDuplicateNodes` | ✅ |
| 未修改其他 Panel 文件 | ✅ |
| 未修改 Prefab / Layout / UI 结构 | ✅ |

---

## 三、预期 Preview 输出

正常情况下，控制台应出现：

```
[EquipmentMediator] binding status { equipmentPanel: true, bagPanel: true, detailPanel: true }
[EquipmentMediator] All panels are bound from Inspector. Dynamic loading disabled.
```

不应再出现：

```
层级面板过滤了重复的 UUID 节点
EquipmentDetailPanel-root
EquipmentDetailPanel-slotPickerCloseBtn
```

### 如果仍出现重复 UUID

控制台将出现 `[DUPLICATE_NODE]`，请将完整输出提供给下一阶段分析。

---

## 四、用户验证步骤

1. 回到 Cocos Creator
2. 等待脚本重新编译
3. 清空控制台
4. Preview
5. 打开装备界面
6. 点击 **武器 ——空——**
7. 将控制台中所有 `[EquipmentMediator]` 前缀的输出提供给我（特别是 `binding status` 和 `DUPLICATE_NODE`）

---

## 五、修改文件清单

| 文件 | 修改类型 |
|------|---------|
| `assets/scripts/ui/EquipmentMediator.ts` | 禁用动态加载 + 校验绑定 + 重复检测 |
