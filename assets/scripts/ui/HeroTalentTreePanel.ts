// ============================================================
// HeroTalentTreePanel — Phase10-Step1 英雄天赋树面板
// 职责：展示成长路线 / 天赋节点 / 已解锁状态 / 天赋点
// 规范：继承 BasePanel / 纯 UI / 数据绑定 / 事件驱动刷新
//       Portrait布局 / 720×1280 适配 / 不出现越界
// 状态：UI 骨架 — 仅完成数据绑定，不要求最终美术
// ============================================================

import { _decorator, Node, Label, Button, ScrollView, Layout, Color } from 'cc';
import { BasePanel } from '../core/BasePanel';
import { EventManager } from '../core/EventManager';
import { HeroSystem } from '../hero/HeroSystem';
import type { GrowthRouteConfig } from '../hero/HeroTalentTypes';
import type { TalentConfig } from '../hero/HeroTalentTypes';
import type { HeroTalentBonus } from '../hero/HeroTalentTypes';

const { ccclass, property } = _decorator;

// ==================== 天赋节点显示数据 ====================

/** 天赋节点显示数据（UI 绑定用） */
export interface TalentNodeUIData {
  /** 天赋 ID */
  talentId: string;
  /** 天赋名称 */
  talentName: string;
  /** 是否已解锁 */
  unlocked: boolean;
  /** 解锁所需等级 */
  unlockLevel: number;
  /** 消耗天赋点 */
  cost: number;
  /** 效果描述 */
  effectDesc: string;
  /** 是否为下一个可解锁节点 */
  isNext: boolean;
}

/** 成长路线显示数据（UI 绑定用） */
export interface GrowthRouteUIData {
  /** 路线 ID */
  routeId: string;
  /** 路线名称 */
  routeName: string;
  /** 主属性 */
  mainStat: string;
  /** 解锁等级 */
  unlockLevel: number;
  /** 是否已选中 */
  isSelected: boolean;
  /** 是否已解锁（达到等级要求） */
  isUnlocked: boolean;
}

@ccclass('HeroTalentTreePanel')
export class HeroTalentTreePanel extends BasePanel {

  // ==================== 编辑器绑定 ====================

  @property({ type: Node, tooltip: '面板根节点' })
  panelRoot: Node | null = null;

  // ---- 标题区域 ----

  @property({ type: Label, tooltip: '面板标题' })
  titleLabel: Label | null = null;

  @property({ type: Label, tooltip: '英雄名称' })
  heroNameLabel: Label | null = null;

  // ---- 天赋点数区域 ----

  @property({ type: Label, tooltip: '天赋点数显示' })
  talentPointsLabel: Label | null = null;

  @property({ type: Label, tooltip: '已解锁天赋数量' })
  unlockedCountLabel: Label | null = null;

  // ---- 成长路线区域 ----

  @property({ type: Node, tooltip: '路线列表容器' })
  routeListContainer: Node | null = null;

  @property({ type: Label, tooltip: '当前路线名称' })
  currentRouteLabel: Label | null = null;

  // ---- 天赋树区域 ----

  @property({ type: Node, tooltip: '天赋节点列表容器' })
  talentListContainer: Node | null = null;

  @property({ type: ScrollView, tooltip: '天赋树滚动视图' })
  talentScrollView: ScrollView | null = null;

  // ---- 加成汇总区域 ----

  @property({ type: Label, tooltip: '加成汇总文本' })
  bonusSummaryLabel: Label | null = null;

  // ---- 按钮 ----

  @property({ type: Button, tooltip: '关闭按钮' })
  closeButton: Button | null = null;

  // ==================== 内部状态 ====================

  /** 当前查看的英雄 ID */
  private _heroId = '';

  /** HeroSystem 引用 */
  private _heroSystem: HeroSystem | null = null;

  // ==================== 生命周期 ====================

  onLoad(): void {
    super.onLoad();
    this._heroSystem = HeroSystem.getInstance();

    if (this.closeButton) {
      this.closeButton.node.on(Button.EventType.CLICK, this._onCloseClicked, this);
    }
  }

  onDestroy(): void {
    if (this.closeButton) {
      this.closeButton.node.off(Button.EventType.CLICK, this._onCloseClicked, this);
    }
    super.onDestroy();
  }

  // ==================== 事件注册 ====================

  protected registerEvents(): void {
    const em = EventManager.getInstance();
    em.on(HeroSystem.TALENT_UNLOCKED, this._onTalentChanged, this);
    em.on(HeroSystem.ROUTE_SELECTED, this._onRouteChanged, this);
    em.on(HeroSystem.HERO_UPDATED, this._onHeroUpdated, this);
  }

  protected unregisterEvents(): void {
    const em = EventManager.getInstance();
    em.off(HeroSystem.TALENT_UNLOCKED, this._onTalentChanged, this);
    em.off(HeroSystem.ROUTE_SELECTED, this._onRouteChanged, this);
    em.off(HeroSystem.HERO_UPDATED, this._onHeroUpdated, this);
  }

  // ==================== 公共接口 ====================

  /**
   * 打开指定英雄的天赋树面板。
   *
   * @param heroId    英雄 ID
   * @param heroName  英雄名称（用于标题显示）
   */
  openForHero(heroId: string, heroName: string): void {
    if (!this._heroSystem) return;

    this._heroId = heroId;

    // 设置标题
    if (this.titleLabel) {
      this.titleLabel.string = '天赋树';
    }
    if (this.heroNameLabel) {
      this.heroNameLabel.string = heroName;
    }

    // 刷新所有显示
    this._refreshAll();

    this.show();
  }

  // ==================== 刷新逻辑 ====================

  /** 刷新所有显示 */
  private _refreshAll(): void {
    if (!this._heroSystem) return;

    const heroId = this._heroId;
    const bonus = this._heroSystem.getHeroTalentBonus(heroId);

    // 刷新天赋点数
    this._refreshTalentPoints(bonus);

    // 刷新路线列表
    this._refreshRouteList();

    // 刷新天赋节点
    this._refreshTalentNodes();

    // 刷新加成汇总
    this._refreshBonusSummary(bonus);
  }

  /** 刷新天赋点数显示 */
  private _refreshTalentPoints(bonus: HeroTalentBonus): void {
    if (this.talentPointsLabel) {
      this.talentPointsLabel.string = `天赋点: ${bonus.talentPoints}`;
    }
    if (this.unlockedCountLabel) {
      this.unlockedCountLabel.string = `已解锁: ${bonus.unlockedTalentCount} 个天赋`;
    }
  }

  /** 刷新路线列表 */
  private _refreshRouteList(): void {
    if (!this._heroSystem || !this.routeListContainer) return;

    const heroId = this._heroId;
    const routes = this._heroSystem.getHeroGrowthRoutes(heroId);
    const selectedRouteId = this._heroSystem.getSelectedRouteId(heroId);
    const heroState = this._heroSystem.getHero(heroId);
    const heroLevel = heroState ? heroState.level : 0;

    // 更新当前路线标签
    if (this.currentRouteLabel) {
      const selectedRoute = routes.find((r) => r.routeId === selectedRouteId);
      if (selectedRoute) {
        this.currentRouteLabel.string = `当前路线: ${selectedRoute.routeName}`;
      } else {
        this.currentRouteLabel.string = '当前路线: 未选择';
      }
    }

    // 生成路线显示数据
    const routeUIData: GrowthRouteUIData[] = routes.map((r) => ({
      routeId: r.routeId,
      routeName: r.routeName,
      mainStat: r.mainStat,
      unlockLevel: r.unlockLevel,
      isSelected: r.routeId === selectedRouteId,
      isUnlocked: heroLevel >= r.unlockLevel,
    }));

    // 更新容器中的标签（简化实现：遍历子节点设置文本）
    this._populateRouteList(routeUIData);
  }

  /** 填充路线列表（简化骨架实现） */
  private _populateRouteList(routes: GrowthRouteUIData[]): void {
    if (!this.routeListContainer) return;

    const children = this.routeListContainer.children;
    for (let i = 0; i < children.length && i < routes.length; i++) {
      const routeNode = children[i];
      const label = routeNode.getComponentInChildren(Label);
      if (label) {
        const r = routes[i];
        let text = `${r.routeName} (${r.mainStat}) Lv.${r.unlockLevel}`;
        if (r.isSelected) text += ' [当前]';
        if (!r.isUnlocked) text += ' [锁定]';
        label.string = text;
      }
    }
  }

  /** 刷新天赋节点列表 */
  private _refreshTalentNodes(): void {
    if (!this._heroSystem || !this.talentListContainer) return;

    const heroId = this._heroId;
    const allTalents = this._heroSystem.getHeroTalents(heroId);
    const selectedRouteId = this._heroSystem.getSelectedRouteId(heroId);
    const unlockedTalents = this._heroSystem.getUnlockedTalents(heroId);
    const unlockedIds = new Set(unlockedTalents.map((t) => t.talentId));
    const heroState = this._heroSystem.getHero(heroId);
    const heroLevel = heroState ? heroState.level : 0;

    // 过滤当前路线天赋
    const routeTalents = selectedRouteId
      ? allTalents.filter((t) => t.routeId === selectedRouteId)
      : allTalents;

    // 生成显示数据
    const uidData: TalentNodeUIData[] = routeTalents.map((t) => {
      const isUnlocked = unlockedIds.has(t.talentId);
      const canUnlock = !isUnlocked && heroLevel >= t.unlockLevel;

      // 判断是否为下一个可解锁节点
      let isNext = false;
      if (!isUnlocked && canUnlock) {
        // 检查前置是否已解锁（链上上一个节点）
        const allUnlockedIds = new Set(unlockedTalents.map((u) => u.talentId));
        // 检查是否有任何已解锁天赋的 nextTalentId 指向此天赋
        for (const ut of unlockedTalents) {
          const utConfig = allTalents.find((a) => a.talentId === ut.talentId);
          if (utConfig && utConfig.nextTalentId === t.talentId) {
            isNext = true;
            break;
          }
        }
        // 如果是第一个节点（无前置）也标记为 next
        if (!isNext) {
          const hasPrereq = allTalents.some((a) => a.nextTalentId === t.talentId);
          if (!hasPrereq) {
            isNext = true;
          }
        }
      }

      return {
        talentId: t.talentId,
        talentName: t.talentName,
        unlocked: isUnlocked,
        unlockLevel: t.unlockLevel,
        cost: t.cost,
        effectDesc: `${t.effectType}: +${(t.effectValue * 100).toFixed(0)}%`,
        isNext,
      };
    });

    this._populateTalentNodes(uidData);
  }

  /** 填充天赋节点（简化骨架实现） */
  private _populateTalentNodes(nodes: TalentNodeUIData[]): void {
    if (!this.talentListContainer) return;

    const children = this.talentListContainer.children;
    for (let i = 0; i < children.length && i < nodes.length; i++) {
      const talentNode = children[i];
      const labels = talentNode.getComponentsInChildren(Label);
      const n = nodes[i];

      // 简单的节点显示：名称 + 状态
      let statusIcon = n.unlocked ? '✅' : (n.isNext ? '🔓' : '🔒');
      const displayText = `${statusIcon} ${n.talentName} Lv.${n.unlockLevel} (${n.cost}点) ${n.effectDesc}`;

      if (labels.length > 0) {
        labels[0].string = displayText;
      }
    }
  }

  /** 刷新加成汇总 */
  private _refreshBonusSummary(bonus: HeroTalentBonus): void {
    if (!this.bonusSummaryLabel) return;

    const lines: string[] = ['[天赋加成汇总]'];

    if (bonus.bonuses.length === 0) {
      lines.push('（无已解锁天赋）');
    } else {
      for (const entry of bonus.bonuses) {
        const config = this._heroSystem?.getHeroTalents(this._heroId)
          .find((t) => t.talentId === entry.sourceTalentId);
        const name = config ? config.talentName : entry.sourceTalentId;
        const pct = (entry.value * 100).toFixed(0);
        lines.push(`${name}: ${entry.effectType} +${pct}%`);
      }

      // 添加汇总
      lines.push('---');
      for (const [type, value] of Object.entries(bonus.bonusSummary)) {
        const pct = (value * 100).toFixed(0);
        lines.push(`总计 ${type}: +${pct}%`);
      }
    }

    this.bonusSummaryLabel.string = lines.join('\n');
  }

  // ==================== 事件回调 ====================

  private _onTalentChanged(data: Record<string, unknown>): void {
    if (data.heroId === this._heroId) {
      this._refreshAll();
    }
  }

  private _onRouteChanged(data: Record<string, unknown>): void {
    if (data.heroId === this._heroId) {
      this._refreshAll();
    }
  }

  private _onHeroUpdated(data: Record<string, unknown>): void {
    if (data.heroId === this._heroId) {
      this._refreshAll();
    }
  }

  private _onCloseClicked(): void {
    this.hide();
  }
}
