# Phase10-Step12A1 — Bootstrap 绑定修复报告

## 日期

2026-06-17

---

## 1. 问题现象

Preview 启动后报错：

```
[Scene] Missing class: b1AKABAAFAAIAAAAAAAAAB
[Scene] Script "b1AKABAAFAAIAAAAAAAAAB" attached to "Phase10MainBootstrap" is missing or invalid.
```

---

## 2. compressUuid 数学验证

### 2.1 输入数据

| 项目 | 值 |
|------|-----|
| 脚本 UUID (`.meta`) | `b100a001-0001-4000-8000-000000000001` |
| Scene `__type__` | `b1AKABAAFAAIAAAAAAAAAB` |

### 2.2 验证结果

| 验证 | 结果 |
|------|------|
| `compressUuid(meta UUID)` → scene `__type__` | ✅ **匹配** |
| `decodeUuid(scene __type__)` → meta UUID | ✅ **匹配** |
| 压缩 UUID 长度 | ✅ 22 字符 |
| 编码/解码对称性 | ✅ 双向通过 |

```
Encode: b100a001-0001-4000-8000-000000000001 → b1AKABAAFAAIAAAAAAAAAB ✓
Decode: b1AKABAAFAAIAAAAAAAAAB → b100a001-0001-4000-8000-000000000001 ✓
```

### 2.3 结论

**compressUuid 在数学上是完全正确的**。Scene JSON 的 `__type__` 字段无误。

---

## 3. 真正根因分析

### 3.1 排除项

| 嫌疑 | 状态 |
|------|------|
| compressUuid 计算错误 | ❌ 排除（数学验证通过） |
| Scene JSON `__type__` 字段损坏 | ❌ 排除（编解码对称） |
| 脚本 `.meta` UUID 不匹配 | ❌ 排除（双向编解码一致） |
| 脚本依赖缺失 | ❌ 排除（SaveManager/Phase9Bootstrap/InventoryService/EquipmentService 全部存在） |

### 3.2 根因

**Cocos Creator 引擎 `library/` 缓存中缺少 Phase10MainBootstrap 脚本的编译注册**。

引擎在运行时通过 UUID → 脚本类 的映射查找组件：
1. 从 scene 读取 compressUuid → 解码为完整 UUID `b100a001-...`
2. 在 asset 数据库中查找该 UUID → 应找到 `Phase10MainBootstrap.ts`
3. 从编译缓存加载 JS 模块 → 获取 `@ccclass('Phase10MainBootstrap')` 类
4. 实例化组件

**步骤 3 失败** — `library/` 中不存在该脚本的编译产物，或数据库索引过期。

### 3.3 为什么 compressUuid 正确但类仍然缺失

Scene JSON 的文件格式是正确的，但 Cocos Creator 的 **asset database** (`library/` 目录) 是在编辑器导入时建立的。如果：
- scene 文件是在编辑器外部生成的（程序化写入）
- `library/` 缓存是在脚本添加前生成的
- 缓存中的依赖图缺少 `b100a001 → Phase10MainBootstrap` 映射

则引擎在运行时无法解析该类型。

---

## 4. 修复方案

### 方案 A：清除缓存重建（推荐，无需手动绑定）

```
1. 关闭 Cocos Creator
2. 删除 library/ 目录（当前 667 文件）
3. 删除 temp/ 目录（当前 1337 文件）
4. 重新打开 Cocos Creator 项目
5. 等待 "脚本编译完成" 提示
6. 打开 Phase10Main.scene
7. 确认 Phase10MainBootstrap 节点组件正常显示（绿色，无 Missing Script）
8. Preview
```

### 方案 B：编辑器重新绑定（如果方案 A 无效）

```
1. 打开 Phase10Main.scene
2. 定位 UIRoot → Phase10MainBootstrap 节点
3. 删除节点上的 Phase10MainBootstrap 组件（Inspector 面板 → 右键 → Remove）
4. 从 Assets 面板拖入 assets/scripts/bootstrap/Phase10MainBootstrap.ts
5. Ctrl+S 保存
6. Preview
```

---

## 5. Scene 结构验证

当前 Phase10Main.scene Bootstrap 节点结构：

```
Scene (__id__ 1)
└── Canvas (__id__ 2)
    └── UIRoot (__id__ 5)
        ├── Phase10MainBootstrap (__id__ 209)  ← 目标节点
        │   ├── cc.UITransform (__id__ 210)
        │   └── Phase10MainBootstrap 组件 (__id__ 211) ← __type__: b1AKABAAFAAIAAAAAAAAAB
        ├── EquipmentPanel (__id__ 10)
        ├── EquipmentBagPanel (__id__ 43)
        ├── EquipmentDetailPanel (__id__ 109)
        └── EquipmentMediator (__id__ 197)
```

Scene 层级结构正常，组件引用格式正确。

---

## 6. 验收标准检查

| 检查项 | 状态 |
|--------|------|
| Preview 无 `Missing class` | ⏳ 待验证 |
| Preview 无 `Missing Script` | ⏳ 待验证 |
| Preview 无 `Invalid Script` | ⏳ 待验证 |
| `[Phase10MainBootstrap] SaveManager Ready` | ⏳ 待验证 |
| `[Phase10MainBootstrap] Phase9 Ready` | ⏳ 待验证 |
| `[Phase10MainBootstrap] Inventory Ready` | ⏳ 待验证 |
| `[Phase10MainBootstrap] Equipment Ready` | ⏳ 待验证 |
| `[Phase10MainBootstrap] UI Ready` | ⏳ 待验证 |

---

## 7. 总结

- **compressUuid 不是问题** — 编码数学验证 100% 正确
- **问题在于 library/ 缓存** — 需要 Cocos Creator 重建 asset database
- **Scene JSON 无需修改** — `__type__` 字段值正确
- **修复十分简单** — 删除 library/ + temp/ 后重新打开项目即可
