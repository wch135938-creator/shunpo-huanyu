# 技术架构设计

## 文件定位

本文件定义项目技术架构规范。

所有代码实现必须遵循本文件。

优先级：

00-project-vision.md

↓

CLAUDE.md

↓

10-tech-architecture.md

---

# 技术目标

本项目采用：

* AI辅助开发
* 一人开发
* 长期迭代

架构必须满足：

* 易维护
* 易扩展
* 易理解
* 易测试
* AI易协作

---

# 技术栈

## 游戏引擎

Cocos Creator 3.x

## 开发语言

TypeScript

## 目标平台

微信小游戏

---

# 项目目录结构

```text
assets/

├── art/
├── audio/
├── config/
├── prefabs/
├── resources/
├── scenes/
├── scripts/
└── ui/
```

---

# Scripts目录规范

```text
scripts/

├── core/
├── battle/
├── card/
├── data/
├── managers/
├── save/
├── systems/
├── ui/
├── utils/
└── extensions/
```

---

# Core层规范

Core层为项目基础设施层。

允许：

* BaseManager
* BasePanel
* BaseSystem
* EventManager
* GameState
* GameConst

禁止：

* 业务逻辑
* 卡牌逻辑
* 战斗逻辑

---

# 组件化规范

## 基本原则

所有功能必须组件化。

禁止：

* 超大脚本
* 超大类
* God Object

---

## 文件长度

推荐：

* 单文件 < 300行

警戒：

* 单文件 > 500行

超过500行必须考虑拆分。

---

## 单一职责原则

一个类只负责一个职责。

禁止：

一个类同时负责：

* UI
* 数据
* 网络
* 配置

---

# UI架构规范

## UI与逻辑分离

禁止：

UI直接实现业务逻辑。

正确流程：

UI

↓

Manager

↓

System

↓

Data

---

## UI命名

统一格式：

```text
RolePanel
BagPanel
DrawCardPanel
```

---

## UI资源

UI Prefab：

assets/ui/

UI脚本：

scripts/ui/

禁止混放。

---

# Manager体系

## Manager职责

负责：

* 模块协调
* 生命周期管理
* 系统调度

不负责：

* 核心业务计算

---

## 必须存在

AudioManager

UIManager

BattleManager

ConfigManager

SaveManager

AdManager

EventManager

---

# System体系

## 职责

负责：

核心业务逻辑。

例如：

BattleSystem

CardSystem

RewardSystem

ProgressSystem

---

# Data体系

## 职责

负责：

数据存储与状态管理。

例如：

PlayerData

CardData

InventoryData

StageData

---

## 禁止

禁止：

UI直接修改Data。

必须经过：

System或Manager。

---

# 配置驱动规范

## 核心原则

所有数值必须配置化。

禁止硬编码。

---

## 必须配置化内容

* 角色属性
* 技能数值
* 装备属性
* 掉落概率
* 抽卡概率
* 广告奖励
* 关卡配置
* Boss配置

---

## 配置目录

```text
config/

├── cards/
├── skills/
├── stages/
├── drops/
├── systems/
└── localization/
```

---

# 事件系统规范

统一使用：

EventManager

---

## 禁止

禁止：

系统之间直接耦合调用。

推荐：

BattleSystem

↓

EventManager

↓

UI

---

# 广告系统规范

所有广告必须通过：

AdManager

统一管理。

---

## 禁止

禁止：

UI直接调用微信广告API。

---

# 微信接口规范

统一封装：

WxPlatform

---

## 禁止

禁止业务代码直接调用：

wx.xxx

---

# 存档系统

统一入口：

SaveManager

---

## 存储内容

* 玩家等级
* 卡牌数据
* 装备数据
* 广告记录
* 系统设置
* 新手引导状态

---

# 资源管理规范

## 加载原则

采用：

* 分包加载
* 按需加载
* 异步加载

---

## 图集规范

优先使用：

Sprite Atlas

减少DrawCall。

---

# 性能优化规范

## 目标

稳定：

30FPS+

---

## 禁止

* 高频Instantiate
* 高频Destroy
* 超大粒子系统
* 超大纹理
* 大量实时计算
* 频繁GC

---

## 对象池

频繁创建对象：

必须使用对象池。

例如：

* 伤害数字
* 子弹
* 特效

---

# Debug系统

开发阶段必须提供：

* GM面板
* FPS显示
* 日志开关
* 一键加资源
* 一键升级
* 快速抽卡
* 快速通关

---

# AI协作要求

所有AI开发前：

必须阅读：

* CLAUDE.md
* 00-project-vision.md
* 10-tech-architecture.md
* 15-development-rules.md

---

# 最终原则

如果设计方案违反本文件：

必须优先修改设计方案。

不得破坏架构规范。
