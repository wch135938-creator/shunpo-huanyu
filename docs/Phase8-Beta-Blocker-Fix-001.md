# Phase8-Beta-Blocker-Fix-001

## 日期

2026-06-03

## 严重级别

**Blocker** — 阻止 Cocos Creator 打开 Phase8Main.scene

## 现象

Cocos Creator 打开 Phase8Main.scene 时，脚本编译阶段报错，场景无法正常加载。

## 根因

`assets/scripts/debug/Phase6Step3IntegrationRunner.ts` 中 3 个 test 方法内部使用了 `await` 关键字，但方法签名缺少 `async` 声明：

| 方法 | 行号 | 内部 await 位置 |
|------|------|-----------------|
| `_test08DropHistorySave()` | 575 | L584 `await this._loadAllConfigs()` |
| `_test09SaveAndLoad()` | 641 | L670 `await Promise.all([...])` |
| `_test10OldSaveCompatibility()` | 730 | L765 `await this._loadAllConfigs()` |

TypeScript 编译规则：`await` 表达式**只能**出现在 `async` 函数内。这三个方法的签名只返回 `TestResult`，缺少 `async` 关键字，导致 tsc 编译失败 → Cocos Creator 打开场景时报阻塞错误。

## 修复内容

### 1. 方法签名修正（3 处）

```diff
- private _test08DropHistorySave(): TestResult {
+ private async _test08DropHistorySave(): Promise<TestResult> {

- private _test09SaveAndLoad(): TestResult {
+ private async _test09SaveAndLoad(): Promise<TestResult> {

- private _test10OldSaveCompatibility(): TestResult {
+ private async _test10OldSaveCompatibility(): Promise<TestResult> {
```

### 2. 调用点修正（3 处）

在 `_run()` 方法中加入 `await`：

```diff
- this._results.push(this._test08DropHistorySave());
+ this._results.push(await this._test08DropHistorySave());

- this._results.push(this._test09SaveAndLoad());
+ this._results.push(await this._test09SaveAndLoad());

- this._results.push(this._test10OldSaveCompatibility());
+ this._results.push(await this._test10OldSaveCompatibility());
```

### 3. `_loadAllConfigs()` 防御性重构

将 `Promise.all` 并发加载改为**顺序加载 + 单系统 try-catch 隔离**，防止单个系统加载失败拖垮全部配置加载：

- 4 个系统依次加载，各自捕获异常
- 单个系统失败 → 记录日志 + 标记 failed，继续加载下一个
- 全部成功才打印"全部配置加载完成"，否则打印警告

```diff
- await Promise.all([
-   this._dungeonSystem.loadConfig(),
-   this._dropSystem.loadConfig(),
-   this._equipSystem.loadConfig(),
-   this._progressSystem.loadConfig(),
- ]);
- console.log(`${TAG} 全部配置加载完成`);
+ // 逐个加载，隔离错误 — 单个系统失败不阻塞其他系统
+ for (const sys of systems) {
+   try {
+     await sys.loader();
+   } catch (e) {
+     failed.push(sys.name);
+   }
+ }
```

## 修改文件

| 文件 | 修改次数 |
|------|---------|
| `assets/scripts/debug/Phase6Step3IntegrationRunner.ts` | 5 |

## 验证方法

1. 在 Cocos Creator 中打开 Phase8Main.scene — 不再报编译错误
2. 运行场景 — `Phase6Step3IntegrationRunner` 正常执行 14 个测试用例
3. 日志中 **不** 出现 TypeScript 编译错误
