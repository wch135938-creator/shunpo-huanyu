// ============================================================
// SkillUpgradePanel — Phase10-Step2 技能升级面板 UI 骨架
// 职责：显示技能等级、升级按钮、升级数据绑定
// 边界：仅 UI 展示与数据绑定，不包含业务逻辑
// 规范：Portrait 720×1280 / BasePanel 继承 / 数据绑定
// ============================================================

import { _decorator, Component, Node, Label, Button, Sprite, Color } from 'cc';
import { BasePanel } from '../core/BasePanel';
import { SkillSystem } from './SkillSystem';
import type { SkillUpgradeEntry } from './SkillUpgradeRepository';

const { ccclass, property } = _decorator;

@ccclass('SkillUpgradePanel')
export class SkillUpgradePanel extends BasePanel {

  // ==================== UI 节点引用 ====================

  @property({ type: Label, tooltip: '技能名称文本' })
  skillNameLabel: Label | null = null;

  @property({ type: Label, tooltip: '当前等级文本' })
  currentLevelLabel: Label | null = null;

  @property({ type: Label, tooltip: '伤害倍率文本' })
  damageMultiplierLabel: Label | null = null;

  @property({ type: Label, tooltip: '能量消耗文本' })
  energyCostLabel: Label | null = null;

  @property({ type: Label, tooltip: '冷却时间文本' })
  cooldownLabel: Label | null = null;

  @property({ type: Label, tooltip: '升级消耗文本' })
  upgradeCostLabel: Label | null = null;

  @property({ type: Button, tooltip: '升级按钮' })
  upgradeButton: Button | null = null;

  @property({ type: Label, tooltip: '下一级预览文本' })
  nextLevelPreviewLabel: Label | null = null;

  @property({ type: Node, tooltip: '升级面板根节点' })
  upgradePanel: Node | null = null;

  // ==================== 内部状态 ====================

  /** 当前展示的技能 ID */
  private _currentSkillId: string = '';

  /** 当前展示的技能名称 */
  private _currentSkillName: string = '';

  // ==================== 数据绑定 ====================

  /**
   * 绑定技能数据到 UI。
   *
   * @param skillId   技能 ID
   * @param skillName 技能名称
   */
  bindSkill(skillId: string, skillName: string): void {
    this._currentSkillId = skillId;
    this._currentSkillName = skillName;

    if (this.skillNameLabel) {
      this.skillNameLabel.string = skillName;
    }

    this.refreshUI();
  }

  /**
   * 刷新 UI 显示（根据当前绑定技能 ID 读取最新数据）。
   */
  refreshUI(): void {
    if (!this._currentSkillId) return;

    const skillSystem = SkillSystem.getInstance();
    const currentLevel = skillSystem.getSkillLevel(this._currentSkillId);
    const upgradeDataList = skillSystem.getSkillUpgradeData(this._currentSkillId);

    // 当前等级数据
    const currentData = upgradeDataList.find((e) => e.level === currentLevel);
    // 下一级数据
    const nextData = upgradeDataList.find((e) => e.level === currentLevel + 1);

    // 更新等级显示
    if (this.currentLevelLabel) {
      this.currentLevelLabel.string = `Lv.${currentLevel}`;
    }

    // 更新伤害倍率
    if (this.damageMultiplierLabel && currentData) {
      this.damageMultiplierLabel.string = `伤害倍率: ×${currentData.damageMultiplier}`;
    }

    // 更新能量消耗
    if (this.energyCostLabel && currentData) {
      this.energyCostLabel.string = `消耗: ${currentData.energyCost}`;
    }

    // 更新冷却时间
    if (this.cooldownLabel && currentData) {
      const cooldownSec = (currentData.cooldownMs / 1000).toFixed(1);
      this.cooldownLabel.string = `冷却: ${cooldownSec}s`;
    }

    // 更新下一级预览
    if (this.nextLevelPreviewLabel) {
      if (nextData) {
        this.nextLevelPreviewLabel.string =
          `Lv.${nextData.level} → 伤害 ×${nextData.damageMultiplier} | 消耗: ${nextData.upgradeCost}`;
      } else {
        this.nextLevelPreviewLabel.string = '已满级';
      }
    }

    // 更新升级消耗
    if (this.upgradeCostLabel && nextData) {
      this.upgradeCostLabel.string = `升级消耗: ${nextData.upgradeCost}`;
    } else if (this.upgradeCostLabel) {
      this.upgradeCostLabel.string = '已满级';
    }

    // 升级按钮状态
    if (this.upgradeButton) {
      this.upgradeButton.interactable = nextData !== undefined;
    }
  }

  // ==================== UI 事件回调 ====================

  /**
   * 升级按钮点击回调。
   * 在 Cocos Creator 编辑器中绑定到升级按钮的 ClickEvents。
   */
  onUpgradeButtonClick(): void {
    if (!this._currentSkillId) return;

    const skillSystem = SkillSystem.getInstance();
    const success = skillSystem.upgradeSkill(this._currentSkillId);

    if (success) {
      console.log(`[SkillUpgradePanel] 技能 ${this._currentSkillId} 升级成功`);
      this.refreshUI();
    } else {
      console.warn(`[SkillUpgradePanel] 技能 ${this._currentSkillId} 升级失败`);
    }
  }

  // ==================== 生命周期 ====================

  protected onShow(): void {
    this.refreshUI();
  }

  protected onClose(): void {
    this._currentSkillId = '';
    this._currentSkillName = '';
  }
}
