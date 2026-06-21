// ============================================================
// ComboSkillPanel — Phase10-Step2 连携技能面板 UI 骨架
// 职责：显示连携技能列表、连携效果说明、触发条件
// 边界：仅 UI 展示与数据绑定，不包含业务逻辑
// 规范：Portrait 720×1280 / BasePanel 继承 / 数据绑定
// ============================================================

import { _decorator, Component, Node, Label, Button, Prefab, instantiate, ScrollView, Color } from 'cc';
import { BasePanel } from '../core/BasePanel';
import { SkillSystem } from './SkillSystem';
import { ComboSkillRepository } from './ComboSkillRepository';
import type { ComboSkillEntry } from './ComboSkillRepository';

const { ccclass, property } = _decorator;

@ccclass('ComboSkillPanel')
export class ComboSkillPanel extends BasePanel {

  // ==================== UI 节点引用 ====================

  @property({ type: Node, tooltip: '连携列表容器' })
  comboListContainer: Node | null = null;

  @property({ type: Prefab, tooltip: '连携条目预制体' })
  comboItemPrefab: Prefab | null = null;

  @property({ type: Label, tooltip: '连携标题' })
  titleLabel: Label | null = null;

  @property({ type: Label, tooltip: '连携名称文本' })
  comboNameLabel: Label | null = null;

  @property({ type: Label, tooltip: '连携效果描述文本' })
  comboEffectLabel: Label | null = null;

  @property({ type: Label, tooltip: '触发条件文本' })
  comboConditionLabel: Label | null = null;

  @property({ type: Label, tooltip: '当前触发状态文本' })
  triggerStatusLabel: Label | null = null;

  // ==================== 内部状态 ====================

  /** 当前选中的连携 ID */
  private _selectedComboId: string = '';

  /** 当前已装备的技能 ID 列表（用于触发检测） */
  private _equippedSkillIds: string[] = [];

  // ==================== 数据绑定 ====================

  /**
   * 刷新连携技能列表。
   *
   * 从 ComboSkillRepository 读取所有连携配置并显示。
   */
  refreshComboList(): void {
    const comboRepo = ComboSkillRepository.getInstance();
    if (!comboRepo.isLoaded()) {
      console.warn('[ComboSkillPanel] ComboSkillRepository 未加载配置');
      return;
    }

    const allCombos = comboRepo.getAllComboEntries();

    if (this.titleLabel) {
      this.titleLabel.string = `连携技能 (${allCombos.length})`;
    }

    // 清除旧列表项
    if (this.comboListContainer) {
      this.comboListContainer.removeAllChildren();

      // 为每个连携创建列表项
      for (const combo of allCombos) {
        if (this.comboItemPrefab) {
          const itemNode = instantiate(this.comboItemPrefab);
          itemNode.parent = this.comboListContainer;

          // 尝试绑定子节点数据
          const nameLabel = itemNode.getChildByName('ComboName')?.getComponent(Label);
          if (nameLabel) {
            nameLabel.string = combo.comboName;
          }

          const descLabel = itemNode.getChildByName('ComboDesc')?.getComponent(Label);
          if (descLabel) {
            descLabel.string = combo.description;
          }

          // 绑定点击事件
          const btn = itemNode.getComponent(Button);
          if (btn) {
            const comboId = combo.comboId;
            btn.node.on(Button.EventType.CLICK, () => {
              this.selectCombo(comboId);
            });
          }
        }
      }
    }
  }

  /**
   * 选中某个连携技能，显示详细信息。
   *
   * @param comboId  连携 ID
   */
  selectCombo(comboId: string): void {
    this._selectedComboId = comboId;

    const comboRepo = ComboSkillRepository.getInstance();
    const entry = comboRepo.getComboEntry(comboId);

    if (!entry) {
      console.warn(`[ComboSkillPanel] 连携不存在: ${comboId}`);
      return;
    }

    // 更新详情
    if (this.comboNameLabel) {
      this.comboNameLabel.string = entry.comboName;
    }

    if (this.comboEffectLabel) {
      const effectPercent = (entry.effectValue * 100).toFixed(0);
      this.comboEffectLabel.string =
        `效果类型: ${entry.effectType}\n效果数值: +${effectPercent}%\n${entry.description}`;
    }

    if (this.comboConditionLabel) {
      const requiredSkills = entry.skillIds.join(', ');
      this.comboConditionLabel.string = `触发条件: ${requiredSkills}`;
    }

    // 检查当前是否已触发
    this._updateTriggerStatus(entry);
  }

  /**
   * 设置当前已装备的技能 ID 列表（用于触发状态检测）。
   *
   * @param skillIds  已装备技能 ID 列表
   */
  setEquippedSkills(skillIds: string[]): void {
    this._equippedSkillIds = [...skillIds];
    if (this._selectedComboId) {
      this.selectCombo(this._selectedComboId);
    }
  }

  // ==================== 私有方法 ====================

  /**
   * 更新当前连携的触发状态。
   */
  private _updateTriggerStatus(entry: ComboSkillEntry): void {
    if (!this.triggerStatusLabel) return;

    const isTriggered = entry.skillIds.every((id) =>
      this._equippedSkillIds.includes(id),
    );

    if (isTriggered) {
      this.triggerStatusLabel.string = '✅ 已触发';
      this.triggerStatusLabel.color = Color.GREEN;
    } else {
      const missing = entry.skillIds.filter(
        (id) => !this._equippedSkillIds.includes(id),
      );
      this.triggerStatusLabel.string = `❌ 未触发 (缺少: ${missing.join(', ')})`;
      this.triggerStatusLabel.color = Color.RED;
    }
  }

  // ==================== 生命周期 ====================

  protected onShow(): void {
    this.refreshComboList();
  }

  protected onClose(): void {
    this._selectedComboId = '';
    this._equippedSkillIds = [];
  }
}
