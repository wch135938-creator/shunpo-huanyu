# Phase10-Step11O: SlotItem 创建调试报告

**日期**：2026-06-08
**状态**：诊断日志已添加，待运行时确认

---

## 1. Slot 创建入口

`EquipmentPanel.ts` 中 Slot 创建的完整调用链：

```
EquipmentMediator.start()
  → EquipmentMediator._openActiveScenePanel()
    → EquipmentMediator.openEquipmentPanel('0')
      → EquipmentPanel.open('0')                    [line 104]
        → EquipmentPanel._refreshAll()               [line 148]
          → EquipmentPresenter.getHeroEquipmentView()
          → EquipmentPanel._renderSlots(slots)        [line 179]
            → EquipmentPanel._createSlotItem()         [line 256]
              → instantiate(this.slotItemPrefab)       [line 274]
              → node.setParent(this.slotContainer)     [line 286]
```

---

## 2. 完整调用链分析

### 2.1 onLoad 阶段（line 353）

```typescript
onLoad(): void {
    super.onLoad();
    this._recoverBindings();       // → 从场景节点树恢复 @property 绑定
    this._ensureVisualBlocks();    // → 创建视觉效果块
    this._ensureSlotItemPrefabLoaded();  // → 确保 slotItemPrefab 非 null
}
```

**`_recoverBindings()`**：
- 通过递归搜索 `_findNode('slotContainer')` 恢复 `slotContainer` 绑定
- `slotContainer` 位于 `EquipmentPanel → panelRoot → slotContainer`，可以被找到

**`_ensureSlotItemPrefabLoaded()`**：
- 如果 `this.slotItemPrefab` 已设置（编辑器绑定有效）→ 跳过
- 如果 `this.slotItemPrefab` 为 null → 启动异步加载：
  ```
  assetManager.loadAny({ uuid: 'c1a2b3d4-e5f6-7890-abcd-ef1234567890' }, callback)
  ```

### 2.2 open() 阶段（line 104）

```
open() → _presenter.setCurrentHero() → _refreshAll() → show()
```

注意：`_refreshAll()` 在 `show()` 之前调用，此时 `_isShowing` 仍为 false。

### 2.3 _renderSlots() 阶段（line 179）

```
_renderSlots(slots):
  1. 检查 slotContainer 是否存在 → YES（编辑器绑定有效）
  2. for (i = _slotItems.length; i < slots.length; i++)
     → 如果 slots.length > 0 且 _slotItems 为空，则创建 SlotItem
     → 如果 slots.length === 0，不创建任何东西
  3. _createSlotItem() → 需要 slotItemPrefab 非 null
```

---

## 3. SlotItem 创建逻辑详情

### 3.1 `_createSlotItem()` 的守卫条件（line 256）

```typescript
private _createSlotItem(): EquipmentSlotItem | null {
    if (!this.slotItemPrefab || !this.slotContainer) {
        // ⚠️ 任何一个为 null → 返回 null，不创建任何 SlotItem
        return null;
    }
    const node = instantiate(this.slotItemPrefab);
    const comp = node.getComponent(EquipmentSlotItem);
    // ...
}
```

**两个必须条件：**
1. `this.slotContainer` ≠ null — 由场景节点树提供，预期正常
2. `this.slotItemPrefab` ≠ null — **关键疑点**

### 3.2 `slotItemPrefab` 来源

`slotItemPrefab` 有两个来源：

| 来源 | 机制 | 时机 |
|------|------|------|
| 编辑器绑定 | Scene JSON 中 `__uuid__` → 反序列化 | `onLoad()` 之前 |
| 运行时回退 | `assetManager.loadAny()` 异步加载 | `onLoad()` 中触发，回调异步 |

---

## 4. slotContainer 为空的根因分析

### 4.1 核心发现：`slotItemPrefab` 使用了假 UUID

**Scene 文件中的绑定**（`Phase8Main.scene` line 1856-1858）：
```json
"slotItemPrefab": {
    "__uuid__": "c1a2b3d4-e5f6-7890-abcd-ef1234567890",
    "__expectedType__": "cc.Prefab"
},
```

**代码中的硬编码 UUID**（`EquipmentPanel.ts` line 22）：
```typescript
const EQUIPMENT_SLOT_ITEM_PREFAB_UUID = 'c1a2b3d4-e5f6-7890-abcd-ef1234567890';
```

**Prefab 的 .meta 文件**（`EquipmentSlotItem.prefab.meta` line 5）：
```json
"uuid": "c1a2b3d4-e5f6-7890-abcd-ef1234567890"
```

### 4.2 为什么 UUID 是假的

UUID `c1a2b3d4-e5f6-7890-abcd-ef1234567890` 是一个**明显的人为序列化占位符**：
- 真实 Cocos Creator UUID 是随机生成的（如 `02bOnthWdFrICGxaNQHPWl`）
- 这个 UUID 是顺序数字 `c1a2b3d4-e5f6-7890-abcd-ef1234567890`
- 场景文件、代码、.meta 三处使用了同样的假 UUID

这表明：
1. `.meta` 文件是手动创建的（非编辑器生成）
2. Prefab 资产可能未被 Cocos Creator 编辑器的内部资产数据库注册
3. Scene 中的 `__uuid__` 引用也是手动写入的

### 4.3 运行时行为推演

**场景 A：编辑器能解析 UUID**
- Cocos Creator 编辑器/运行时通过 `.meta` 找到了资产
- `slotItemPrefab` 在 `onLoad()` 之前由反序列化器设置
- `_ensureSlotItemPrefabLoaded()` → `if (this.slotItemPrefab) return;` → 直接跳过
- `_createSlotItem()` → `instantiate(this.slotItemPrefab)` → **成功** ✅
- **但此场景下 slotContainer 不应为空** → 说明可能不是此场景

**场景 B：编辑器无法解析 UUID（最可能）**
- `.meta` 是手动创建的，不在编辑器内部数据库中
- Cocos Creator 反序列化时找不到 UUID → `slotItemPrefab` 被设为 `null`
- `_ensureSlotItemPrefabLoaded()` → `this.slotItemPrefab` 为 null → 不走早返回
- 启动 `assetManager.loadAny()` 异步加载 → **回调尚未执行**
- `open()` 被调用 → `_refreshAll()` → `_renderSlots()` → `_createSlotItem()`
- `this.slotItemPrefab` 仍为 null → **返回 null** ❌
- 所有 SlotItem 创建失败 → `slotContainer` 为空

**场景 C：异步加载完成但 `slots` 为空**
- `_allowedSlotIds` 被意外清空
- `getHeroSlotViewModels()` 返回空数组
- `_renderSlots` 的 for 循环 `0 < 0` = false → 不创建任何 SlotItem

### 4.4 可能性排序

| 排序 | 原因 | 概率 | 依据 |
|------|------|------|------|
| **1st** | `slotItemPrefab` 为 null（场景B） | **最高** | 假 UUID + 手动 .meta = 资产解析失败 |
| 2nd | `slots` 数据为空（场景C） | 中 | Core slots 有3个固定值，除非被覆盖 |
| 3rd | `_createSlotItem()` 异常被吞 | 低 | 代码有 try-catch，但之前的版本没有 |

---

## 5. 唯一根因

**`slotItemPrefab` 在运行时为 null。**

原因链：

```
手动创建 .meta 文件（假 UUID）
  → Cocos Creator 编辑器未注册此资产
    → 场景反序列化时 __uuid__ 解析失败
      → @property slotItemPrefab = null
        → _ensureSlotItemPrefabLoaded() 启动异步回退加载
          → open() 在异步回调完成前被调用
            → _createSlotItem() 发现 slotItemPrefab 为 null
              → 返回 null，SlotItem 创建跳过
                → slotContainer 保持为空
```

**核心矛盾**：
- `slotContainer` 有值（场景节点树提供）
- `slotItemPrefab` 无值（资产系统无法解析假 UUID）
- `_createSlotItem()` 需要两者都非 null 才能执行

---

## 6. 修复方案

### 方案 A：创建真实的 Prefab 资产（推荐）

1. 在 Cocos Creator 编辑器中，将 `EquipmentSlotItem` 组件挂载到一个节点
2. 从该节点创建 Prefab（拖入 assets 目录）
3. 编辑器会自动生成真实的 `.meta` 文件和 UUID
4. 更新 `EquipmentPanel.ts` 中的 `EQUIPMENT_SLOT_ITEM_PREFAB_UUID` 为真实 UUID
5. 在 `Phase8Main.scene` 中将 `slotItemPrefab` 绑定到真实 Prefab

### 方案 B：程序化创建 SlotItem（不依赖 Prefab）

在 `_createSlotItem()` 中，当 `slotItemPrefab` 为 null 时，用代码创建节点和组件：

```typescript
private _createSlotItem(): EquipmentSlotItem | null {
    if (!this.slotContainer) return null;

    let node: Node;

    if (this.slotItemPrefab) {
        node = instantiate(this.slotItemPrefab);
    } else {
        // 回退：程序化创建
        node = new Node('SlotItem');
        node.addComponent(EquipmentSlotItem);
        // 添加必要的子节点：borderNode, iconNode, labels, button...
        this._buildSlotItemChildren(node);
    }

    const comp = node.getComponent(EquipmentSlotItem);
    if (comp) {
        comp.setClickCallback(this._handleSlotClick.bind(this));
        node.setParent(this.slotContainer);
        return comp;
    }
    node.destroy();
    return null;
}
```

### 方案 C：确保异步加载在 open() 之前完成

将 `_ensureSlotItemPrefabLoaded()` 改为返回 Promise，并在 `open()` 中 await：

```typescript
private async _ensureSlotItemPrefabLoadedAsync(): Promise<void> {
    if (this.slotItemPrefab) return;

    return new Promise((resolve) => {
        assetManager.loadAny({ uuid: EQUIPMENT_SLOT_ITEM_PREFAB_UUID }, (err, asset) => {
            if (!err && asset) {
                this.slotItemPrefab = asset as Prefab;
            }
            resolve();
        });
    });
}

async open(heroId: string): Promise<void> {
    await this._ensureSlotItemPrefabLoadedAsync();
    // ... 原有逻辑
}
```

### 推荐方案

**方案 A（创建真实 Prefab）**—— 这是唯一正确的长期方案。假 UUID 资产在任何 Cocos Creator 版本升级或项目迁移时都会出问题。

---

## 7. 新增诊断日志位置

已在 `EquipmentPanel.ts` 中添加以下 Step11O 日志（共 6 处）：

| 位置 | 方法 | 诊断内容 |
|------|------|----------|
| line 363 | `onLoad()` | slotContainer/slotItemPrefab 初始状态 |
| line 406 | `_ensureSlotItemPrefabLoaded()` | Prefab 绑定/加载状态 |
| line 105 | `open()` | 调用前/后 slotContainer 状态 |
| line 149 | `_refreshAll()` | heroView.slots 数据和 Presenter 状态 |
| line 180 | `_renderSlots()` | 创建前后的槽位数量变化 |
| line 257 | `_createSlotItem()` | Prefab/Container 状态，instantiate 结果 |

运行后在 Console 中搜索 `[Step11O]` 即可看到完整诊断链。

---

## 8. 验证步骤

1. 在 Cocos Creator 编辑器中运行场景
2. 打开 Console，过滤 `[Step11O]`
3. 检查第一条日志：`_ensureSlotItemPrefabLoaded 入口` 中 `this.slotItemPrefab` 是否为 null
4. 如果是 null → 确认根因为 UUID 解析失败 → 执行方案 A
5. 如果非 null 但 `_createSlotItem()` 返回 null → 检查 Prefab 是否挂载了 `EquipmentSlotItem` 组件
6. 如果 `slots.length === 0` → 检查 `_configRepo._allowedSlotIds` 和 `_loadouts` 数据
