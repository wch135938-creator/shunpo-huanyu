# AI开发规则

## 文件定位

本文件用于约束：

* Claude Code
* DeepSeek
* GPT
* 其他AI开发工具

所有AI开发行为必须遵守本文件。

---

# 优先级

执行顺序：

00-project-vision.md

↓

CLAUDE.md

↓

10-tech-architecture.md

↓

15-development-rules.md

↓

其他文档

---

# 开发流程

每次接到开发任务：

必须先阅读：

* CLAUDE.md
* 00-project-vision.md
* 10-tech-architecture.md
* 15-development-rules.md

再开始开发。

---

# 命名规范

## Manager

统一：

```text
XxxManager
```

示例：

```text
AudioManager
UIManager
SaveManager
```

---

## System

统一：

```text
XxxSystem
```

示例：

```text
BattleSystem
CardSystem
RewardSystem
```

---

## UI

统一：

```text
XxxPanel
```

示例：

```text
RolePanel
BagPanel
```

---

## Popup

统一：

```text
XxxPopup
```

---

## Data

统一：

```text
XxxData
```

---

## Config

统一：

```text
XxxConfig
```

---

# 编码原则

## 可读性优先

代码必须：

* 易读
* 易维护
* 易扩展

---

## 单一职责

一个类只负责一个职责。

---

## 模块化

优先拆分模块。

避免巨型文件。

---

## 避免重复代码

发现重复逻辑：

优先抽取公共模块。

---

# 注释规范

复杂逻辑必须注释。

说明：

* 目的
* 原理
* 注意事项

---

# 配置规则

禁止硬编码。

---

## 错误示例

```ts
damage = 999;
dropRate = 0.2;
```

---

## 正确示例

```ts
damage = CardConfig.damage;
dropRate = DropConfig.rate;
```

---

# 修改规则

## 禁止大规模重构

未经明确要求：

禁止：

* 重命名核心系统
* 修改项目结构
* 推翻现有架构

---

## 优先扩展

优先新增。

谨慎修改旧系统。

---

## 保护已有接口

禁止修改：

* Public接口
* 数据结构
* 配置格式

除非明确要求。

---

# UI开发规则

禁止：

UI直接处理业务逻辑。

---

正确流程：

UI

↓

Manager

↓

System

↓

Data

---

# 广告开发规则

所有广告逻辑：

统一进入：

AdManager

---

禁止：

任何UI直接调用广告接口。

---

# 微信开发规则

所有微信能力：

统一通过：

WxPlatform

调用。

---

禁止：

业务代码直接调用：

wx.xxx

---

# TypeScript规范

## 类型定义

优先使用明确类型。

避免：

any

---

## 函数长度

推荐：

< 50行

---

## 类长度

推荐：

< 300行

---

## 文件长度

推荐：

< 500行

---

# Git规范

## 单功能提交

一次提交：

一个功能。

---

## 禁止

禁止：

多个系统混合提交。

---

# 输出规范

AI输出代码时：

必须说明：

* 修改文件
* 新增文件
* 修改原因

---

# Debug规范

新增系统时：

优先考虑：

* 日志输出
* 调试入口
* 错误处理

---

# AI禁止事项

禁止：

* 重复造轮子
* 无意义封装
* 创建同功能系统
* 删除核心代码
* 修改已有接口
* 引入未使用代码

---

# 微信小游戏专项规则

优先考虑：

* 包体大小
* 性能
* 兼容性
* 加载速度

而不是：

炫技实现。

---

# 最终原则

当存在多个实现方案时：

优先选择：

* 简单
* 稳定
* 易维护
* 易扩展

的方案。

禁止为了展示技术而增加复杂度。
