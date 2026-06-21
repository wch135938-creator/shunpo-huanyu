# Phase10-Step11AY — Script Registry Root Cause Audit

项目：《瞬破寰宇》  
技术栈：Cocos Creator 3.8.8 / TypeScript / 微信小游戏  
审计日期：2026-06-16  
审计对象：Cocos Creator Add Component 无法识别 TypeScript 组件  
工程路径：`D:\My Project\TestGame`

---

## 0. 审计结论摘要

当前问题不是单个脚本写法错误，也不是 `BasePanel.ts` 继承链错误。

项目内证据显示：

```text
DungeonNodeMapPanel.ts 已被 AssetDB 导入
DungeonNodeMapPanel.ts 已进入 editor / preview 编译图
编译产物中存在 ccclass('DungeonNodeMapPanel')
编译产物中存在 _RF.push(..., "DungeonNodeMapPanel")
脚本 .meta 正常
脚本 uuid 无冲突
@ccclass 名称无冲突
tsconfig.cocos.json 正常生成
```

因此，当前根因判断为：

```text
项目源码层脚本注册链路基本正常；
Add Component 搜索失败更可能发生在 Cocos Creator Editor 的组件菜单索引 / UI 搜索索引 / 全局缓存层。
```

同时，本次扫描未在磁盘上发现：

```text
assets/**/TestPanelX.ts
assets/**/TestPanelX.ts.meta
```

所以 `TestPanelX` 当前不能作为“已导入但不可搜索”的磁盘证据。

---

## 1. 当前问题

用户反馈：

```text
Cocos Creator 的 Add Component 无法识别任何新建 TypeScript 组件
已删除 library/
已删除 temp/
工程内没有 local/
重启 Cocos Creator 后无恢复
控制台无红色报错
BasePanel.ts 审计正常
新建最小测试脚本 TestPanelX 也无法被搜索到
DungeonNodeMapPanel.ts 也无法被搜索到
```

最小测试脚本预期形态：

```ts
import { _decorator, Component } from 'cc';
const { ccclass } = _decorator;

@ccclass('TestPanelX')
export class TestPanelX extends Component {}
```

---

## 2. 审计范围

本次只读扫描：

```text
package.json
tsconfig.json
temp/tsconfig.cocos.json
assets/scripts/**/*.ts
assets/scripts/**/*.ts.meta
library/.assets*
temp/programming/packer-driver/targets/editor
temp/programming/packer-driver/targets/preview
temp/asset-db/log
temp/programming/packer-driver/logs
settings/v2/packages
profiles/v2/packages
CocosCreator 用户缓存路径只读枚举
```

本次未修改：

```text
源码
Scene
Prefab
配置
library
temp
全局 Cocos 缓存
```

仅新增本审计报告。

---

## 3. 关键证据

### 3.1 temp / library 已被重新生成

当前项目中存在：

```text
library/
temp/
```

时间证据：

```text
temp/startup.json                         2026-06-16 20:23
temp/tsconfig.cocos.json                  2026-06-16 20:26
temp/programming/.../editor/*.json        2026-06-16 20:27
library/.assets                           2026-06-16 20:35
```

结论：

```text
用户删除 library/temp 后，Cocos Creator 已经重新生成缓存。
```

---

### 3.2 tsconfig 链路正常

项目根 `tsconfig.json`：

```json
{
  "extends": "./temp/tsconfig.cocos.json",
  "compilerOptions": {
    "strict": false
  }
}
```

当前 `temp/tsconfig.cocos.json` 已生成，包含：

```text
experimentalDecorators = true
isolatedModules = true
moduleResolution = node
noEmit = true
db://assets/* -> D:\My Project\TestGame\assets\*
```

结论：

```text
未发现 tsconfig 缺失或装饰器配置错误。
```

---

### 3.3 DungeonNodeMapPanel 已进入 Cocos 编译图

`temp/programming/packer-driver/targets/editor/assembly-record.json` 中存在：

```text
file:///D:/My%20Project/TestGame/assets/scripts/ui/DungeonNodeMapPanel.ts
  -> 04ab3989532b9692a61b6d2f3c31382c9cd1cb9b
```

`temp/programming/packer-driver/targets/editor/import-map.json` 中存在：

```text
DungeonNodeMapPanel.ts
  -> ./chunks/04/04ab3989532b9692a61b6d2f3c31382c9cd1cb9b.js
```

preview target 中同样存在对应记录。

结论：

```text
DungeonNodeMapPanel.ts 已被 Cocos 编译系统纳入 editor / preview target。
```

---

### 3.4 DungeonNodeMapPanel 编译产物中存在 ccclass 注册代码

编译产物：

```text
temp/programming/packer-driver/targets/editor/chunks/04/04ab3989532b9692a61b6d2f3c31382c9cd1cb9b.js
```

其中包含：

```text
_RF.push({}, "b36ceMdSntHB45QgpuqMfJi", "DungeonNodeMapPanel", undefined)
ccclass('DungeonNodeMapPanel')
export DungeonNodeMapPanel
class DungeonNodeMapPanel extends BasePanel
```

结论：

```text
DungeonNodeMapPanel 不是“未编译”或“未声明 ccclass”。
```

---

### 3.5 AssetDB 索引包含脚本资产

`library/.assets-data.json` 中存在：

```json
"b36ce31d-4a7b-4707-8e50-829baa31f262": {
  "url": "db://assets/scripts/ui/DungeonNodeMapPanel.ts",
  "value": {},
  "versionCode": 1
}
```

`library/.assets-info.json` 中存在：

```text
map/scripts\ui\DungeonNodeMapPanel.ts
uuid = b36ce31d-4a7b-4707-8e50-829baa31f262
```

同类证据也存在于：

```text
EquipmentPanel.ts
EquipmentMediator.ts
BasePanel.ts
```

结论：

```text
AssetDB 主索引没有丢失这些脚本资产。
```

---

### 3.6 脚本 meta 正常

`assets/scripts/ui/DungeonNodeMapPanel.ts.meta`：

```json
{
  "ver": "4.0.24",
  "importer": "typescript",
  "imported": true,
  "uuid": "b36ce31d-4a7b-4707-8e50-829baa31f262",
  "files": [],
  "subMetas": {},
  "userData": {}
}
```

`EquipmentPanel.ts.meta`、`BasePanel.ts.meta` 同样为：

```text
importer = typescript
imported = true
uuid 有效
```

全项目脚本 meta 扫描：

```text
ts 文件数 = 230
ts.meta 文件数 = 231
缺失 .meta = 0
重复 meta uuid = 0
importer 异常 = 0
imported=false = 0
```

唯一异常：

```text
assets/scripts/ui/EquipmentListItem.ts.meta 为孤儿 meta
对应 EquipmentListItem.ts 不存在
```

判断：

```text
该孤儿 meta 不足以解释 Add Component 全局搜索失败。
```

---

### 3.7 @ccclass 名称无冲突

扫描 `assets/scripts/**/*.ts`：

```text
识别到 @ccclass 组件类 = 51
重复 @ccclass 名称 = 0
```

关键组件：

```text
BasePanel             @ccclass('BasePanel')             extends Component
DungeonNodeMapPanel   @ccclass('DungeonNodeMapPanel')   extends BasePanel
EquipmentPanel        @ccclass('EquipmentPanel')        extends BasePanel
EquipmentMediator     @ccclass('EquipmentMediator')     extends Component
```

结论：

```text
未发现 ccclass 名称冲突导致组件菜单注册失败。
```

---

### 3.8 TestPanelX 当前未落盘

全项目搜索：

```text
assets/**/TestPanelX.ts
assets/**/TestPanelX.ts.meta
```

结果：

```text
未发现
```

结论：

```text
当前磁盘状态下，TestPanelX 不能作为 Cocos 已导入但 Add Component 不显示的证据。
若用户曾在编辑器中新建 TestPanelX，需要确认文件是否保存到 assets/ 下。
```

---

### 3.9 当前日志未显示编译红错

扫描：

```text
temp/asset-db/log/*.log
temp/logs/*.log
temp/programming/packer-driver/logs/*.log
```

关键结果：

```text
未发现 TestPanelX 导入记录
DungeonNodeMapPanel 有 resolve/import 记录
未发现与 DungeonNodeMapPanel 相关的 compile error
temp/logs/project.log 当前为空文件
```

结论：

```text
当前没有证据支持“TypeScript 编译红错导致所有组件不可见”。
```

---

## 4. 排除项

### 4.1 排除 BasePanel 根因

证据：

```text
BasePanel.ts.meta 正常
BasePanel.ts 已进入编译图
DungeonNodeMapPanel 编译产物中正确 extends BasePanel
未发现 BasePanel 编译错误
```

结论：

```text
BasePanel 不是当前 Add Component 搜索失败的直接根因。
```

---

### 4.2 排除单个脚本未导入

以 `DungeonNodeMapPanel.ts` 为例：

```text
AssetDB 有索引
compiler import-map 有记录
editor chunk 有产物
ccclass 装饰器存在
_RF.push 注册信息存在
```

结论：

```text
DungeonNodeMapPanel 不是“没有被 Cocos 识别为脚本资产”。
```

---

### 4.3 排除 meta uuid 冲突

证据：

```text
全项目 .ts.meta uuid 无重复
@ccclass 名称无重复
```

结论：

```text
不是脚本 uuid 冲突或 ccclass 名称冲突。
```

---

### 4.4 排除 tsconfig 装饰器配置错误

证据：

```text
experimentalDecorators = true
编译产物中已生成 ccclass(...) 调用
```

结论：

```text
不是 TypeScript decorator 配置错误。
```

---

## 5. 根因判断

### 最可能根因

```text
Cocos Creator Editor 的 Add Component 组件菜单索引 / UI 搜索索引 / 全局缓存层异常。
```

原因：

```text
项目源码层：通过
脚本 meta 层：通过
AssetDB 索引层：通过
编译图层：通过
ccclass 编译产物层：通过
Add Component UI：失败
```

该现象说明失败点不在 `assets/scripts` 代码本身，而在更靠后的 Editor 消费链路：

```text
compiled ccclass
  -> Editor class registry
  -> Add Component menu/search model
  -> Inspector UI search
```

当前证据指向最后两层。

---

### 次要风险

#### 风险 1：全局 CocosCreator 缓存未清

项目内 `library/`、`temp/` 已重建，但用户全局缓存仍存在：

```text
C:\Users\81566\AppData\Roaming\CocosCreator\Cache
C:\Users\81566\AppData\Roaming\CocosCreator\Code Cache
C:\Users\81566\AppData\Roaming\CocosCreator\GPUCache
C:\Users\81566\.CocosCreator\profiles
```

这些缓存不会因为删除项目内 `library/` / `temp/` 自动消失。

判断：

```text
若 Add Component UI 搜索模型被全局缓存污染，重启编辑器不一定恢复。
```

#### 风险 2：TestPanelX 未落盘

当前项目中未发现 `TestPanelX.ts`。

判断：

```text
TestPanelX 无法搜索到的原因，在当前磁盘状态下首先是文件不存在或未保存到 assets/。
```

#### 风险 3：孤儿 meta

存在：

```text
assets/scripts/ui/EquipmentListItem.ts.meta
```

但不存在：

```text
assets/scripts/ui/EquipmentListItem.ts
```

判断：

```text
该问题应记录，但不构成 Add Component 全局失效的主因。
```

---

## 6. 对当前现象的逐项回答

### Q1：DungeonNodeMapPanel.ts 是否已被 Cocos 编译？

```text
是
```

证据：

```text
assembly-record.json 有记录
import-map.json 有记录
editor chunk 有编译产物
preview target 有对应记录
```

### Q2：DungeonNodeMapPanel 是否有 ccclass 注册？

```text
是
```

证据：

```text
ccclass('DungeonNodeMapPanel')
_RF.push(..., "DungeonNodeMapPanel")
```

### Q3：Add Component 搜不到 DungeonNodeMapPanel 是否由脚本未导入导致？

```text
否
```

当前证据不支持该判断。

### Q4：是否由 BasePanel 导致？

```text
否
```

BasePanel 链路正常。

### Q5：是否由 tsconfig 导致？

```text
否
```

`temp/tsconfig.cocos.json` 正常，且产物已经生成装饰器代码。

### Q6：是否由 meta uuid 冲突导致？

```text
否
```

全项目 `.ts.meta` uuid 无重复。

### Q7：TestPanelX 为什么搜不到？

```text
当前磁盘上不存在 TestPanelX.ts / TestPanelX.ts.meta。
```

因此本次审计无法证明 `TestPanelX` 已经进入 Cocos 导入链路。

### Q8：当前最可信的根因是什么？

```text
Editor Add Component 菜单 / 搜索索引 / 全局缓存异常。
```

---

## 7. 当前阶段判定

```text
Phase10-Step11AY
Script Registry Root Cause Audit
状态：FAIL
```

失败原因：

```text
Add Component 搜索仍不可用
当前无法通过 Inspector 正常添加或绑定新脚本组件
Phase10-Step11 的手动 Scene 修复链路因此继续阻塞
```

---

## 8. 是否允许进入 Phase10-Step12

```text
禁止
```

原因：

```text
Phase10-Step11 尚未 FINAL PASS
Add Component / Inspector 组件注册链路不可用
无法可靠完成 Phase10Main.scene 的手动组件绑定与验收
```

---

## 9. 最终审计结论

```text
FAIL
```

最终判断：

```text
项目内脚本、meta、AssetDB、编译图、ccclass 编译产物均未显示阻断性异常。
当前问题更像 Cocos Creator Editor 组件菜单/搜索索引或全局缓存层异常，而不是 TypeScript 组件源码错误。
```

---

## 10. 本次未执行事项

```text
未修改源码
未删除缓存
未修改 Scene
未修改 Prefab
未创建 TestPanelX.ts
未执行修复
```
