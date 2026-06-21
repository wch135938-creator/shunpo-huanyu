# Phase10-Step11N OpenMethod Override Debug Report

**日期:** 2026-06-08

**状态:** 代码修改完成，等待运行时验证

---

## 修改文件

```
assets/scripts/ui/EquipmentMediator.ts (2 处修改)
```

## 新增日志位置

### 1. `_openBagPanel()` (行 291-320)

**Task 1 — `open.toString()` 打印：**
```typescript
console.log(
  '[Step11N] bagPanel.open.toString =',
  String((this.bagPanel as any).open).slice(0, 500),
);
```

**Task 2 — 猴子补丁拦截（一次性，不重复）：**
```typescript
const bagAny = this.bagPanel as any;
if (!bagAny.__step11nOpenPatched) {
  bagAny.__step11nOpenPatched = true;
  const originalOpen = bagAny.open;
  // ... 打印 originalOpen typeof + toString
  bagAny.open = (...args: any[]) => {
    console.log('[Step11N][FORCE PATCH] bagPanel.open intercepted args =', args);
    return originalOpen.apply(bagAny, args);
  };
}
```

### 2. `_openDetailPanel()` (行 341-370)

同样的 Task 1 + Task 2 逻辑，日志前缀 `[Step11N] detailPanel.*`。

---

## 预期运行时输出

### 情况 A — 拦截到但没有源文件日志

```
[Step11N][FORCE PATCH] bagPanel.open intercepted args = [...]
```

出现但缺少 `[EquipmentBagPanel] open` / `_ensureInit`：

→ `originalOpen` 不是 `EquipmentBagPanel.ts` 中定义的 `open()`，或 `open` 内部日志因异常被跳过。

### 情况 B — 全部正常

```
[Step11N][FORCE PATCH] bagPanel.open intercepted args = [...]
[EquipmentBagPanel] open — heroId=... preselectedSlot=...
[EquipmentBagPanel] _ensureInit — 首次初始化开始
[EquipmentBagPanel] _bindEvents 完成 — 按钮事件已注册
```

→ 链路正常，之前是 Console 过滤/日志未刷新/时序问题。

### 情况 C — 完全没有 FORCE PATCH 输出

→ `_openBagPanel` 中实际调用位置不对，或 patch 未执行，或运行代码非最新编译产物。

---

## 下一步

运行项目，点击装备槽位打开背包，观察 Console 输出，对照上述三种情况判断。

根据判断结果：
- **情况 A** → 需要检查 `open` 是否被父类 `BasePanel` 或其他装饰器覆写
- **情况 B** → 日志过滤/时序问题，清除 Console 过滤器重试
- **情况 C** → 检查编译产物是否包含最新代码，重新构建
