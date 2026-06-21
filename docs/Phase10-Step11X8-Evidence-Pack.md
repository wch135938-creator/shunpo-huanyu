# Phase10-Step11X8 Evidence Pack

项目：《瞬破寰宇》  
引擎：Cocos Creator 3.8.8  
工程路径：`E:\CocosProjects\TestGame\TestGame`  
审计日期：2026-06-10  
任务类型：证据补充审计  

本轮仅补充证据：

```text
未修改代码
未修改 Prefab
未修改 Scene
```

---

## 1. 审计对象

必查文件：

```text
E:\CocosProjects\TestGame\TestGame\assets\scenes\Phase8Main.scene
E:\CocosProjects\TestGame\TestGame\assets\prefabs\panels\EquipmentBagPanel.prefab
E:\CocosProjects\TestGame\TestGame\assets\prefabs\panels\EquipmentDetailPanel.prefab
```

目标：

```text
补齐 Phase10-Step11X8 根因判断的原始证据。
```

---

## 2. Phase8Main.scene 原始证据

来源文件：

```text
assets/scenes/Phase8Main.scene
```

提取脚本：

```js
const fs = require('fs');
const s = JSON.parse(fs.readFileSync(
  'E:/CocosProjects/TestGame/TestGame/assets/scenes/Phase8Main.scene',
  'utf8',
));

function nodeFrag(i) {
  const o = s[i];
  return {
    index: i,
    __type__: o.__type__,
    _name: o._name,
    _id: o._id,
    _active: o._active,
    _parent: o._parent,
    _children: o._children,
    _components: o._components,
    _prefab: o._prefab,
  };
}

console.log(JSON.stringify({
  EquipmentBagPanel: nodeFrag(69),
  EquipmentDetailPanel: nodeFrag(135),
}, null, 2));
```

### 2.1 EquipmentBagPanel Scene 片段

原始输出：

```json
{
  "index": 69,
  "__type__": "cc.Node",
  "_name": "EquipmentBagPanel",
  "_id": "EquipmentDetailPanel-root",
  "_active": false,
  "_parent": {
    "__id__": 5
  },
  "_children": [
    {
      "__id__": 70
    }
  ],
  "_components": [
    {
      "__id__": 131
    },
    {
      "__id__": 132
    },
    {
      "__id__": 133
    }
  ],
  "_prefab": {
    "__id__": 134
  }
}
```

直接证据：

```text
name = EquipmentBagPanel
_id = EquipmentDetailPanel-root
```

这证明：

```text
EquipmentBagPanel Scene 实例已经持有 EquipmentDetailPanel 的 root _id。
```

### 2.2 EquipmentDetailPanel Scene 片段

原始输出：

```json
{
  "index": 135,
  "__type__": "cc.Node",
  "_name": "EquipmentDetailPanel",
  "_id": "EquipmentDetailPanel-root",
  "_active": false,
  "_parent": {
    "__id__": 5
  },
  "_children": [
    {
      "__id__": 136
    }
  ],
  "_components": [
    {
      "__id__": 220
    },
    {
      "__id__": 221
    },
    {
      "__id__": 222
    }
  ],
  "_prefab": {
    "__id__": 223
  }
}
```

直接证据：

```text
name = EquipmentDetailPanel
_id = EquipmentDetailPanel-root
```

与 2.1 组合后得到：

```text
Phase8Main.scene 中至少存在两个节点持有同一个 _id：
EquipmentDetailPanel-root
```

---

## 3. EquipmentBagPanel.prefab 原始证据

来源文件：

```text
assets/prefabs/panels/EquipmentBagPanel.prefab
```

提取脚本：

```js
const fs = require('fs');
const bag = JSON.parse(fs.readFileSync(
  'E:/CocosProjects/TestGame/TestGame/assets/prefabs/panels/EquipmentBagPanel.prefab',
  'utf8',
));

function findNode(arr, name) {
  for (let i = 0; i < arr.length; i++) {
    const o = arr[i];
    if (o && o.__type__ === 'cc.Node' && o._name === name) {
      return { index: i, ...o };
    }
  }
  return null;
}

console.log(JSON.stringify({
  root: findNode(bag, 'EquipmentBagPanel'),
  panelRoot: findNode(bag, 'panelRoot'),
  closeButton: findNode(bag, 'closeButton'),
}, null, 2));
```

### 3.1 root 节点

原始输出：

```json
{
  "index": 1,
  "__type__": "cc.Node",
  "_name": "EquipmentBagPanel",
  "_parent": null,
  "_children": [
    {
      "__id__": 2
    }
  ],
  "_active": true,
  "_components": [
    {
      "__id__": 64
    },
    {
      "__id__": 65
    },
    {
      "__id__": 66
    }
  ],
  "_prefab": {
    "__id__": 67
  },
  "_id": ""
}
```

### 3.2 panelRoot 节点

原始输出：

```json
{
  "index": 2,
  "__type__": "cc.Node",
  "_name": "panelRoot",
  "_parent": {
    "__id__": 1
  },
  "_children": [
    {
      "__id__": 3
    },
    {
      "__id__": 6
    },
    {
      "__id__": 9
    },
    {
      "__id__": 13
    },
    {
      "__id__": 17
    },
    {
      "__id__": 21
    },
    {
      "__id__": 25
    },
    {
      "__id__": 29
    },
    {
      "__id__": 33
    },
    {
      "__id__": 37
    },
    {
      "__id__": 41
    },
    {
      "__id__": 45
    },
    {
      "__id__": 55
    },
    {
      "__id__": 59
    }
  ],
  "_active": true,
  "_components": [
    {
      "__id__": 62
    },
    {
      "__id__": 63
    }
  ],
  "_prefab": {
    "__uuid__": "f4d5e6a7-b8c9-0123-defa-234567890123",
    "__expectedType__": "cc.Prefab"
  },
  "_id": ""
}
```

### 3.3 closeButton 节点

原始输出：

```json
{
  "index": 55,
  "__type__": "cc.Node",
  "_name": "closeButton",
  "_parent": {
    "__id__": 2
  },
  "_children": [],
  "_active": true,
  "_components": [
    {
      "__id__": 56
    },
    {
      "__id__": 57
    },
    {
      "__id__": 58
    }
  ],
  "_prefab": {
    "__uuid__": "f4d5e6a7-b8c9-0123-defa-234567890123",
    "__expectedType__": "cc.Prefab"
  },
  "_id": ""
}
```

### 3.4 BagPanel Prefab 结论

`EquipmentBagPanel.prefab` 的 root / panelRoot / closeButton 均未出现：

```text
EquipmentDetailPanel-root
EquipmentDetailPanel-slotPickerCloseBtn
```

结论：

```text
EquipmentBagPanel.prefab 本体正常。
污染不来自 EquipmentBagPanel.prefab 文件本体。
```

---

## 4. EquipmentDetailPanel.prefab 原始证据

来源文件：

```text
assets/prefabs/panels/EquipmentDetailPanel.prefab
```

提取脚本：

```js
const fs = require('fs');
const detail = JSON.parse(fs.readFileSync(
  'E:/CocosProjects/TestGame/TestGame/assets/prefabs/panels/EquipmentDetailPanel.prefab',
  'utf8',
));

function findNode(arr, name) {
  for (let i = 0; i < arr.length; i++) {
    const o = arr[i];
    if (o && o.__type__ === 'cc.Node' && o._name === name) {
      return { index: i, ...o };
    }
  }
  return null;
}

console.log(JSON.stringify({
  root: findNode(detail, 'EquipmentDetailPanel'),
  panelRoot: findNode(detail, 'panelRoot'),
  slotPickerCloseBtn: findNode(detail, 'slotPickerCloseBtn'),
}, null, 2));
```

### 4.1 root 节点

原始输出：

```json
{
  "index": 1,
  "__type__": "cc.Node",
  "_name": "EquipmentDetailPanel",
  "_parent": null,
  "_children": [
    {
      "__id__": 5
    }
  ],
  "_active": true,
  "_components": [
    {
      "__id__": 2
    },
    {
      "__id__": 3
    },
    {
      "__id__": 4
    }
  ],
  "_prefab": {
    "__id__": 0
  },
  "_id": "EquipmentDetailPanel-root"
}
```

### 4.2 panelRoot 节点

原始输出：

```json
{
  "index": 5,
  "__type__": "cc.Node",
  "_name": "panelRoot",
  "_parent": {
    "__id__": 1
  },
  "_children": [
    {
      "__id__": 8
    },
    {
      "__id__": 11
    },
    {
      "__id__": 14
    },
    {
      "__id__": 17
    },
    {
      "__id__": 20
    },
    {
      "__id__": 23
    },
    {
      "__id__": 26
    },
    {
      "__id__": 29
    },
    {
      "__id__": 32
    },
    {
      "__id__": 35
    },
    {
      "__id__": 39
    },
    {
      "__id__": 43
    },
    {
      "__id__": 47
    },
    {
      "__id__": 51
    },
    {
      "__id__": 55
    },
    {
      "__id__": 64
    },
    {
      "__id__": 78
    },
    {
      "__id__": 82
    }
  ],
  "_active": true,
  "_components": [
    {
      "__id__": 6
    },
    {
      "__id__": 7
    }
  ],
  "_prefab": {
    "__id__": 0
  },
  "_id": "EquipmentDetailPanel-panelRoot"
}
```

### 4.3 slotPickerCloseBtn 节点

原始输出：

```json
{
  "index": 85,
  "__type__": "cc.Node",
  "_name": "slotPickerCloseBtn",
  "_parent": {
    "__id__": 82
  },
  "_children": [],
  "_active": true,
  "_components": [
    {
      "__id__": 86
    },
    {
      "__id__": 87
    },
    {
      "__id__": 88
    }
  ],
  "_prefab": {
    "__id__": 0
  },
  "_id": "EquipmentDetailPanel-slotPickerCloseBtn"
}
```

### 4.4 DetailPanel Prefab 结论

`EquipmentDetailPanel.prefab` 中：

```text
root._id = EquipmentDetailPanel-root
panelRoot._id = EquipmentDetailPanel-panelRoot
slotPickerCloseBtn._id = EquipmentDetailPanel-slotPickerCloseBtn
```

这些 `_id` 在 prefab 本体中是各自唯一的、语义正确的。

结论：

```text
EquipmentDetailPanel.prefab 本体正常。
污染不是 DetailPanel prefab 内部重复导致。
```

---

## 5. duplicateIds 统计脚本

下面脚本可独立运行、可复现结果。

运行命令：

```powershell
node duplicate-scene-ids.js
```

脚本内容：

```js
const fs = require('fs');

const scenePath = 'E:/CocosProjects/TestGame/TestGame/assets/scenes/Phase8Main.scene';
const scene = JSON.parse(fs.readFileSync(scenePath, 'utf8'));

function pathOf(index) {
  const names = [];
  let current = index;
  let guard = 0;

  while (current != null && guard++ < 50) {
    const node = scene[current];
    if (!node || node.__type__ !== 'cc.Node') break;
    names.push(node._name || '(empty)');
    current = node._parent && node._parent.__id__;
  }

  return names.reverse().join('/');
}

const ids = new Map();

for (let i = 0; i < scene.length; i++) {
  const obj = scene[i];
  if (!obj || !obj._id) continue;

  if (!ids.has(obj._id)) {
    ids.set(obj._id, []);
  }

  ids.get(obj._id).push({
    index: i,
    type: obj.__type__,
    name: obj._name,
    path: obj.__type__ === 'cc.Node' ? pathOf(i) : null,
    parent: obj._parent && obj._parent.__id__,
    prefab: obj._prefab,
  });
}

const duplicateIds = [...ids.entries()]
  .filter(([, items]) => items.length > 1)
  .map(([id, items]) => ({
    id,
    count: items.length,
    nodes: items,
  }));

console.log(JSON.stringify(duplicateIds, null, 2));
```

---

## 6. duplicateIds 实际输出

实际输出摘要：

```text
duplicateIds = 2
```

完整重复 ID：

```text
1. EquipmentDetailPanel-root
   count = 2

2. EquipmentDetailPanel-slotPickerCloseBtn
   count = 42
```

### 6.1 EquipmentDetailPanel-root 输出

```json
{
  "id": "EquipmentDetailPanel-root",
  "count": 2,
  "nodes": [
    {
      "index": 69,
      "type": "cc.Node",
      "name": "EquipmentBagPanel",
      "path": "Canvas/UIRoot/EquipmentBagPanel",
      "parent": 5,
      "prefab": {
        "__id__": 134
      }
    },
    {
      "index": 135,
      "type": "cc.Node",
      "name": "EquipmentDetailPanel",
      "path": "Canvas/UIRoot/EquipmentDetailPanel",
      "parent": 5,
      "prefab": {
        "__id__": 223
      }
    }
  ]
}
```

### 6.2 EquipmentDetailPanel-slotPickerCloseBtn 输出

```json
{
  "id": "EquipmentDetailPanel-slotPickerCloseBtn",
  "count": 42
}
```

完整 42 个节点清单见下一节。

---

## 7. 42 个重复节点完整清单

重复 `_id`：

```text
EquipmentDetailPanel-slotPickerCloseBtn
```

完整清单：

| # | index | 所属面板 | 节点名称 | 节点路径 |
|---:|---:|---|---|---|
| 1 | 70 | EquipmentBagPanel | panelRoot | Canvas/UIRoot/EquipmentBagPanel/panelRoot |
| 2 | 71 | EquipmentBagPanel | titleLabel | Canvas/UIRoot/EquipmentBagPanel/panelRoot/titleLabel |
| 3 | 74 | EquipmentBagPanel | filterHintLabel | Canvas/UIRoot/EquipmentBagPanel/panelRoot/filterHintLabel |
| 4 | 77 | EquipmentBagPanel | typeAllBtn | Canvas/UIRoot/EquipmentBagPanel/panelRoot/typeAllBtn |
| 5 | 81 | EquipmentBagPanel | typeWeaponBtn | Canvas/UIRoot/EquipmentBagPanel/panelRoot/typeWeaponBtn |
| 6 | 85 | EquipmentBagPanel | typeArmorBtn | Canvas/UIRoot/EquipmentBagPanel/panelRoot/typeArmorBtn |
| 7 | 89 | EquipmentBagPanel | typeAccessoryBtn | Canvas/UIRoot/EquipmentBagPanel/panelRoot/typeAccessoryBtn |
| 8 | 93 | EquipmentBagPanel | qualityAllBtn | Canvas/UIRoot/EquipmentBagPanel/panelRoot/qualityAllBtn |
| 9 | 97 | EquipmentBagPanel | qualityCommonBtn | Canvas/UIRoot/EquipmentBagPanel/panelRoot/qualityCommonBtn |
| 10 | 101 | EquipmentBagPanel | qualityRareBtn | Canvas/UIRoot/EquipmentBagPanel/panelRoot/qualityRareBtn |
| 11 | 105 | EquipmentBagPanel | qualityEpicBtn | Canvas/UIRoot/EquipmentBagPanel/panelRoot/qualityEpicBtn |
| 12 | 109 | EquipmentBagPanel | qualityLegendaryBtn | Canvas/UIRoot/EquipmentBagPanel/panelRoot/qualityLegendaryBtn |
| 13 | 113 | EquipmentBagPanel | scrollView | Canvas/UIRoot/EquipmentBagPanel/panelRoot/scrollView |
| 14 | 114 | EquipmentBagPanel | view | Canvas/UIRoot/EquipmentBagPanel/panelRoot/scrollView/view |
| 15 | 115 | EquipmentBagPanel | contentNode | Canvas/UIRoot/EquipmentBagPanel/panelRoot/scrollView/view/contentNode |
| 16 | 122 | EquipmentBagPanel | closeButton | Canvas/UIRoot/EquipmentBagPanel/panelRoot/closeButton |
| 17 | 126 | EquipmentBagPanel | emptyHintNode | Canvas/UIRoot/EquipmentBagPanel/panelRoot/emptyHintNode |
| 18 | 136 | EquipmentDetailPanel | panelRoot | Canvas/UIRoot/EquipmentDetailPanel/panelRoot |
| 19 | 137 | EquipmentDetailPanel | nameLabel | Canvas/UIRoot/EquipmentDetailPanel/panelRoot/nameLabel |
| 20 | 140 | EquipmentDetailPanel | qualityLabel | Canvas/UIRoot/EquipmentDetailPanel/panelRoot/qualityLabel |
| 21 | 143 | EquipmentDetailPanel | levelLabel | Canvas/UIRoot/EquipmentDetailPanel/panelRoot/levelLabel |
| 22 | 146 | EquipmentDetailPanel | enhanceLevelLabel | Canvas/UIRoot/EquipmentDetailPanel/panelRoot/enhanceLevelLabel |
| 23 | 149 | EquipmentDetailPanel | powerLabel | Canvas/UIRoot/EquipmentDetailPanel/panelRoot/powerLabel |
| 24 | 152 | EquipmentDetailPanel | hpStatLabel | Canvas/UIRoot/EquipmentDetailPanel/panelRoot/hpStatLabel |
| 25 | 155 | EquipmentDetailPanel | atkStatLabel | Canvas/UIRoot/EquipmentDetailPanel/panelRoot/atkStatLabel |
| 26 | 158 | EquipmentDetailPanel | defStatLabel | Canvas/UIRoot/EquipmentDetailPanel/panelRoot/defStatLabel |
| 27 | 161 | EquipmentDetailPanel | equipStatusLabel | Canvas/UIRoot/EquipmentDetailPanel/panelRoot/equipStatusLabel |
| 28 | 164 | EquipmentDetailPanel | equipBtn | Canvas/UIRoot/EquipmentDetailPanel/panelRoot/equipBtn |
| 29 | 168 | EquipmentDetailPanel | unequipBtn | Canvas/UIRoot/EquipmentDetailPanel/panelRoot/unequipBtn |
| 30 | 172 | EquipmentDetailPanel | upgradeBtn | Canvas/UIRoot/EquipmentDetailPanel/panelRoot/upgradeBtn |
| 31 | 176 | EquipmentDetailPanel | enhanceBtn | Canvas/UIRoot/EquipmentDetailPanel/panelRoot/enhanceBtn |
| 32 | 180 | EquipmentDetailPanel | decomposeBtn | Canvas/UIRoot/EquipmentDetailPanel/panelRoot/decomposeBtn |
| 33 | 184 | EquipmentDetailPanel | previewContainer | Canvas/UIRoot/EquipmentDetailPanel/panelRoot/previewContainer |
| 34 | 185 | EquipmentDetailPanel | previewPowerLabel | Canvas/UIRoot/EquipmentDetailPanel/panelRoot/previewContainer/previewPowerLabel |
| 35 | 188 | EquipmentDetailPanel | previewCostLabel | Canvas/UIRoot/EquipmentDetailPanel/panelRoot/previewContainer/previewCostLabel |
| 36 | 193 | EquipmentDetailPanel | confirmDialog | Canvas/UIRoot/EquipmentDetailPanel/panelRoot/confirmDialog |
| 37 | 194 | EquipmentDetailPanel | confirmTextLabel | Canvas/UIRoot/EquipmentDetailPanel/panelRoot/confirmDialog/confirmTextLabel |
| 38 | 197 | EquipmentDetailPanel | confirmBtn | Canvas/UIRoot/EquipmentDetailPanel/panelRoot/confirmDialog/confirmBtn |
| 39 | 201 | EquipmentDetailPanel | cancelBtn | Canvas/UIRoot/EquipmentDetailPanel/panelRoot/confirmDialog/cancelBtn |
| 40 | 207 | EquipmentDetailPanel | closeButton | Canvas/UIRoot/EquipmentDetailPanel/panelRoot/closeButton |
| 41 | 211 | EquipmentDetailPanel | slotPickerContainer | Canvas/UIRoot/EquipmentDetailPanel/panelRoot/slotPickerContainer |
| 42 | 212 | EquipmentDetailPanel | slotPickerCloseBtn | Canvas/UIRoot/EquipmentDetailPanel/panelRoot/slotPickerContainer/slotPickerCloseBtn |

---

## 8. EquipmentBagPanel 被污染证据

直接证据来自 `Phase8Main.scene` 原始片段：

```json
{
  "index": 69,
  "__type__": "cc.Node",
  "_name": "EquipmentBagPanel",
  "_id": "EquipmentDetailPanel-root",
  "_active": false,
  "_parent": {
    "__id__": 5
  },
  "_children": [
    {
      "__id__": 70
    }
  ],
  "_components": [
    {
      "__id__": 131
    },
    {
      "__id__": 132
    },
    {
      "__id__": 133
    }
  ],
  "_prefab": {
    "__id__": 134
  }
}
```

同一事实也由 duplicateIds 脚本输出证明：

```json
{
  "index": 69,
  "type": "cc.Node",
  "name": "EquipmentBagPanel",
  "path": "Canvas/UIRoot/EquipmentBagPanel",
  "parent": 5,
  "prefab": {
    "__id__": 134
  }
}
```

结论：

```text
EquipmentBagPanel 被污染成立。
```

---

## 9. 污染来自 Scene 而不是 Prefab 本体

### 9.1 EquipmentBagPanel.prefab 正常

Prefab 原始证据：

```text
EquipmentBagPanel.prefab root._id = ""
EquipmentBagPanel.prefab panelRoot._id = ""
EquipmentBagPanel.prefab closeButton._id = ""
```

未出现：

```text
EquipmentDetailPanel-root
EquipmentDetailPanel-slotPickerCloseBtn
```

### 9.2 EquipmentDetailPanel.prefab 正常

Prefab 原始证据：

```text
EquipmentDetailPanel.prefab root._id = EquipmentDetailPanel-root
EquipmentDetailPanel.prefab panelRoot._id = EquipmentDetailPanel-panelRoot
EquipmentDetailPanel.prefab slotPickerCloseBtn._id = EquipmentDetailPanel-slotPickerCloseBtn
```

三者语义正确，且不是重复批量污染。

### 9.3 Phase8Main.scene 异常

Scene 原始证据：

```text
Phase8Main.scene EquipmentBagPanel._id = EquipmentDetailPanel-root
Phase8Main.scene EquipmentDetailPanel._id = EquipmentDetailPanel-root

Phase8Main.scene 中 42 个节点共享：
EquipmentDetailPanel-slotPickerCloseBtn
```

结论：

```text
Prefab 本体正常。
Phase8Main.scene 中 prefab instance 序列化异常。
污染来源为 Scene instance，不是 Prefab 文件本体。
```

---

## 10. 复核结论

二选一结论：

```text
A. Phase8Main.scene prefab instance 污染成立
```

证据链：

```text
1. Scene 原始片段显示：
   EquipmentBagPanel._id = EquipmentDetailPanel-root

2. Scene 原始片段显示：
   EquipmentDetailPanel._id = EquipmentDetailPanel-root

3. duplicateIds 脚本可复现输出：
   EquipmentDetailPanel-root count = 2

4. duplicateIds 脚本可复现输出：
   EquipmentDetailPanel-slotPickerCloseBtn count = 42

5. 42 个重复节点完整清单已经列出。

6. EquipmentBagPanel.prefab root / panelRoot / closeButton 均未携带 DetailPanel _id。

7. EquipmentDetailPanel.prefab root / panelRoot / slotPickerCloseBtn 本体语义正确，未出现批量重复。
```

最终判断：

```text
Phase8Main.scene prefab instance 污染成立。
Step11X8 Evidence Pack 补证完成。
Step11X8 可重新判定 PASS。
```

---

## 11. 后续最小修复建议

本报告只补证据，不执行修复。

推荐下一步：

```text
Phase10-Step11X9 Scene Prefab Instance ID Recovery
```

最小修复范围：

```text
只重建 Phase8Main.scene 中的 EquipmentBagPanel / EquipmentDetailPanel Scene 实例。
不修改 EquipmentPanel.ts。
不修改 EquipmentBagPanel.ts。
不修改 EquipmentDetailPanel.ts。
不修改 EquipmentMediator.ts。
不修改 Prefab 本体。
```

验收脚本：

```text
重新运行 duplicateIds 统计脚本。
期望：
duplicateIds = []

或至少：
EquipmentDetailPanel-root count = 1
EquipmentDetailPanel-slotPickerCloseBtn count = 1
```
