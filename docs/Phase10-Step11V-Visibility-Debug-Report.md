# Phase10-Step11V Visibility Debug Report

## 结论

**SlotItem 完全不可见，根因已定位。**

---

## 根因

### SlotItem 宽度 660 > 容器宽度 640，Layout 水平排列导致全部推出屏幕右侧

| 关键数据 | 值 | 判断 |
|----------|-----|------|
| Canvas 可视宽度 | 720px | 基准 |
| slotContainer 宽度 | 640px | 正常 |
| slotContainer 位置 | (0, 110) → worldPos (640, 470) | 正常 |
| SlotItem 宽度 | **660px** | ❌ 比容器还宽 |
| Layout type | **1 (HORIZONTAL)** | ❌ 3 个 660px 节点水平排列 |
| child[1] worldPos.x | **1322** | ❌ 屏幕外 (720+) |
| child[2] worldPos.x | **1998** | ❌ 屏幕外 |
| child[3] worldPos.x | **2674** | ❌ 屏幕外 |

### 可视化

```
Canvas 可视区域:   |<--------- 720px --------->|

slotContainer:          [         640px         ]  worldX=640~1280
                         可见范围内只有一小段容器

SlotItem[0] bg:     [____________660px____________]  worldX=326~986  (大部分可视)
SlotItem[1]:                              [____________660px____________]  worldX=992~1652  (小部分可视)
SlotItem[2]:                                                  [____________660px____________]  worldX=1668~2328  (完全不可视)
SlotItem[3]:                                                                      [____________660px____________]  worldX=2344~3004  (完全不可视)
```

Layout 水平排列 + spacing=16 → 3 个 660px 宽的 SlotItem 在容器内本地坐标分别为 x=682, 1358, 2034，映射到世界坐标 x=1322, 1998, 2674，全部在 720px 画布右侧之外。

---

## 已排除项

| 项目 | 状态 | 证据 |
|------|------|------|
| 节点 active | ✅ 正常 | active=true, activeInHierarchy=true |
| UIOpacity | ✅ 正常 | 不存在，无透明度遮挡 |
| Widget | ✅ 正常 | slotContainer 和 SlotItem 均无 Widget |
| 父节点链 | ✅ 正常 | panelRoot→EquipmentPanel→UIRoot→Canvas→Scene，全部 active |
| Layer | ✅ 正常 | 33554432 (UI_2D) |
| Label 内容 | ✅ 正常 | "武器"/"护甲"/"饰品" 正确渲染 |
| UIRoot 可见性 | ✅ 正常 | worldPos 在可视范围内 |

---

## 修复方向（待审核，本文不执行修复）

### 方案 A：缩小 SlotItem 宽度

将 SlotItem Prefab 的 UITransform 宽度从 660 改为容器能容纳的值（如 640 或更小）。

### 方案 B：Layout 改为垂直排列

将 slotContainer 的 Layout type 从 HORIZONTAL 改为 VERTICAL，并将容器高度设为能容纳 3 个 100px 子节点。

### 方案 C：动态调整 SlotItem 宽度

在 `_renderSlots()` 中根据容器宽度动态设置每个 SlotItem 的宽度。

---

## 诊断日志摘要

```
[Step11V] Step1 — slotContainer: w=640 h=360 pos=(0,110) worldPos=(640,470)
[Step11V] Step3 — SlotItem: w=660 h=100 anchor=(0.5,0.5)  ← 比容器宽20px
[Step11V] Step2 — child[1]: worldPos=(1322,470)  ← 屏幕外
[Step11V] Step2 — child[2]: worldPos=(1998,470)  ← 屏幕外
[Step11V] Step2 — child[3]: worldPos=(2674,470)  ← 屏幕外
[Step11V] Step5 — Layout: type=1(HORIZONTAL) spacing=(16,16) constraint=1 num=3
```
