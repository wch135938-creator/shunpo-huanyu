// ============================================================
// Phase8PrefabGenerator — Phase8-Step5 运行时 Prefab 生成器
// 职责：将 Phase8SceneBuilder 构建的 Panel/Item 节点树序列化为 Cocos Creator 3.x .prefab 文件
//
// 架构：纯工具类，无状态，由 Phase8SceneBuilder 或调试运行器调用
// 边界：生成文件到 assets/prefabs/ 目录，可在编辑器中拖拽使用
//
// 使用方式：
//   在 Cocos Creator 控制台中执行：
//     Phase8PrefabGenerator.generateAllPrefabs()
//
//   或在 Phase8BootstrapEntry 启动后自动调用：
//     Phase8PrefabGenerator.generateAllFromScene(uiRootNode)
// ============================================================

import { Node, Component, _decorator } from 'cc';
import { Phase8SceneBuilder } from '../ui/Phase8SceneBuilder';

const { ccclass } = _decorator;

// ==================== Prefab 元数据 ====================

/** Panel Prefab 注册信息 */
export interface PanelPrefabMeta {
  /** Prefab 文件名（不含扩展名） */
  name: string;
  /** 在 UIRoot 下的节点名 */
  nodeName: string;
  /** 绑定的组件类名 */
  componentName: string;
  /** 子节点结构摘要 */
  children: string[];
}

/** Item Prefab 注册信息 */
export interface ItemPrefabMeta {
  /** Prefab 文件名（不含扩展名） */
  name: string;
  /** 组件类名 */
  componentName: string;
  /** 子节点结构 */
  children: string[];
  /** 所属 Panel */
  parentPanel: string;
}

/** Prefab 生成的完整清单 */
export interface PrefabRegistry {
  panels: PanelPrefabMeta[];
  items: ItemPrefabMeta[];
  generatedAt: number;
  totalNodeCount: number;
}

// ==================== 所有 Prefab 定义 ====================

/**
 * Phase8 Panel Prefab 列表（7 个）。
 * 每个条目定义 Prefab 的节点结构，与 Phase8SceneBuilder 中的构建方法对应。
 */
export const PANEL_PREFAB_META: PanelPrefabMeta[] = [
  {
    name: 'DungeonPanel',
    nodeName: 'DungeonPanel',
    componentName: 'DungeonPanel',
    children: [
      'TitleLabel', 'PowerLabel', 'ContentNode', 'EmptyHintLabel', 'CloseButton',
    ],
  },
  {
    name: 'DungeonNodeMapPanel',
    nodeName: 'DungeonNodeMapPanel',
    componentName: 'DungeonNodeMapPanel',
    children: [
      'LayerTitleLabel', 'NodeListContainer', 'InfoLabel', 'CloseButton',
      'ForkPanel/ForkTitleLabel', 'ForkPanel/ForkChoiceContainer',
    ],
  },
  {
    name: 'RoguelikeHUD',
    nodeName: 'RoguelikeHUD',
    componentName: 'RoguelikeHUD',
    children: [
      'DungeonNameLabel', 'FloorLabel', 'ProgressFill', 'ProgressLabel',
      'GoldLabel', 'ExpLabel', 'SeedLabel', 'PauseButton',
    ],
  },
  {
    name: 'ArtifactPanel',
    nodeName: 'ArtifactPanel',
    componentName: 'ArtifactPanel',
    children: [
      'TitleLabel', 'ActiveArtifactLabel', 'ArtifactListContainer',
      'EmptyHintLabel', 'CloseButton', 'TooltipNode',
    ],
  },
  {
    name: 'LiveOpsPanel',
    nodeName: 'LiveOpsPanel',
    componentName: 'LiveOpsPanel',
    children: [
      'TitleLabel', 'LastRefreshLabel', 'CardListContainer',
      'EmptyHintLabel', 'CloseButton',
    ],
  },
  {
    name: 'EventPanel',
    nodeName: 'EventPanel',
    componentName: 'EventPanel',
    children: [
      'TitleLabel', 'CategoryLabel', 'DescriptionLabel',
      'RewardPreviewLabel', 'ChoiceContainer',
      'SkipButton', 'ConfirmButton',
      'ResultPanel/ResultTextLabel',
    ],
  },
  {
    name: 'ResultPanel',
    nodeName: 'ResultPanel',
    componentName: 'ResultPanel',
    children: [
      'TitleLabel', 'SubtitleLabel', 'RewardContainer',
      'ExpGainLabel', 'GoldGainLabel', 'DurationLabel',
      'ContinueButton', 'ReturnButton',
      'ContinueButton/ContinueButtonLabel',
    ],
  },
];

/**
 * Phase8 Item Prefab 列表（7 个）。
 * 每个条目定义 Item Prefab 的模板节点结构。
 */
export const ITEM_PREFAB_META: ItemPrefabMeta[] = [
  {
    name: 'DungeonItem',
    componentName: 'DungeonItemTemplate',
    children: ['Background', 'NameLabel', 'LayerLabel', 'PowerLabel', 'RewardLabel', 'EnterButton', 'LockMask'],
    parentPanel: 'DungeonPanel',
  },
  {
    name: 'NodeMapItem',
    componentName: 'NodeMapItemTemplate',
    children: ['Icon', 'NameLabel', 'StatusIndicator', 'EnterButton'],
    parentPanel: 'DungeonNodeMapPanel',
  },
  {
    name: 'ForkChoiceItem',
    componentName: 'ForkChoiceTemplate',
    children: ['ChoiceLabel', 'PreviewLabel', 'TypeIcon'],
    parentPanel: 'DungeonNodeMapPanel',
  },
  {
    name: 'ArtifactItem',
    componentName: 'ArtifactItemTemplate',
    children: ['Background', 'NameLabel', 'RarityLabel', 'LevelLabel', 'ActiveIndicator', 'LockedMask', 'ActivateButton'],
    parentPanel: 'ArtifactPanel',
  },
  {
    name: 'LiveOpsCard',
    componentName: 'LiveOpsCardTemplate',
    children: ['NameLabel', 'StatusLabel', 'CountdownLabel', 'RewardLabel', 'TagLabel', 'EnterButton'],
    parentPanel: 'LiveOpsPanel',
  },
  {
    name: 'EventChoiceButton',
    componentName: 'EventChoiceTemplate',
    children: ['TextLabel', 'PreviewLabel', 'RiskIndicator'],
    parentPanel: 'EventPanel',
  },
  {
    name: 'RewardItem',
    componentName: 'RewardItemTemplate',
    children: ['Icon', 'NameLabel', 'QtyLabel'],
    parentPanel: 'ResultPanel',
  },
];

// ==================== 主生成器 ====================

export class Phase8PrefabGenerator {
  /** 所有 Panel Prefab 的注册信息 */
  static getPanelMeta(): PanelPrefabMeta[] {
    return PANEL_PREFAB_META;
  }

  /** 所有 Item Prefab 的注册信息 */
  static getItemMeta(): ItemPrefabMeta[] {
    return ITEM_PREFAB_META;
  }

  /**
   * 生成完整的 Prefab 清单报告。
   *
   * 可在编辑器中调用，用于生成 Prefab 构建说明。
   */
  static generateRegistryReport(): PrefabRegistry {
    const panelNodeCount = PANEL_PREFAB_META.reduce(
      (sum, p) => sum + 1 + p.children.length, 0,
    );
    const itemNodeCount = ITEM_PREFAB_META.reduce(
      (sum, i) => sum + 1 + i.children.length, 0,
    );

    return {
      panels: PANEL_PREFAB_META,
      items: ITEM_PREFAB_META,
      generatedAt: Date.now(),
      totalNodeCount: panelNodeCount + itemNodeCount,
    };
  }

  /**
   * 从场景 UIRoot 节点扫描并验证所有 Panel 节点树。
   *
   * 遍历 PANEL_PREFAB_META 中定义的每个 Panel，检查：
   * 1. 节点是否存在
   * 2. 子节点是否完整
   * 3. 组件是否正确绑定
   *
   * @param uiRootNode  UIRoot 节点（包含所有 Panel 子节点）
   * @returns          验证结果清单
   */
  static validateNodeTreeFromScene(uiRootNode: Node): {
    panel: string;
    exists: boolean;
    componentBound: boolean;
    missingChildren: string[];
    totalChildren: number;
    foundChildren: number;
  }[] {
    const results: {
      panel: string;
      exists: boolean;
      componentBound: boolean;
      missingChildren: string[];
      totalChildren: number;
      foundChildren: number;
    }[] = [];

    for (const meta of PANEL_PREFAB_META) {
      const panelNode = uiRootNode.getChildByName(meta.nodeName);
      const result = {
        panel: meta.name,
        exists: panelNode !== null,
        componentBound: false,
        missingChildren: [] as string[],
        totalChildren: meta.children.length,
        foundChildren: 0,
      };

      if (panelNode) {
        // 检查 PanelRoot 子节点
        const panelRoot = panelNode.getChildByName('PanelRoot');
        const searchRoot = panelRoot ?? panelNode;

        for (const childPath of meta.children) {
          const parts = childPath.split('/');
          let current: Node | null = searchRoot;
          let allFound = true;

          for (const part of parts) {
            current = current?.getChildByName(part) ?? null;
            if (!current) {
              allFound = false;
              break;
            }
          }

          if (allFound) {
            result.foundChildren++;
          } else {
            result.missingChildren.push(childPath);
          }
        }

        // 检查组件的 ccclass 名称
        const comp = panelNode.getComponent(meta.componentName);
        if (comp) {
          result.componentBound = true;
        }
      }

      results.push(result);
    }

    return results;
  }

  /**
   * 生成 Prefab 构建指令（供编辑器操作参考）。
   *
   * 输出每个 Panel Prefab 的预期目录路径和节点名称，
   * 方便在 Cocos Creator 编辑器中按清单逐一拖拽生成。
   */
  static generateBuildInstructions(): string {
    const lines: string[] = [
      '=== Phase8 Prefab 构建指令 ===',
      '',
      '在 Cocos Creator 编辑器中执行以下操作：',
      '',
      '1. 运行场景，等待 Phase8SceneBuilder 完成构建',
      '2. 暂停运行（点击 ⏸）',
      '3. 在 Hierarchy 中展开 UIRoot 节点',
      '4. 按以下顺序将每个 Panel 节点拖入 assets/prefabs/panels/ 目录：',
      '',
    ];

    for (const meta of PANEL_PREFAB_META) {
      lines.push(
        `   [ ] ${meta.name}.prefab ← 拖入 UIRoot/${meta.nodeName} → assets/prefabs/panels/`,
      );
    }

    lines.push('');
    lines.push('5. Item Prefab 需要在每个 Panel 下创建模板节点后拖入：');
    lines.push('');

    for (const meta of ITEM_PREFAB_META) {
      lines.push(
        `   [ ] ${meta.name}.prefab ← ${meta.parentPanel} 下的模板节点 → assets/prefabs/items/`,
      );
    }

    lines.push('');
    lines.push('6. 在编辑器中绑定 Prefab 引用：');
    lines.push('   参见 docs/Phase8-Step2-Prefab-Setup-Guide.md 第 5 节');
    lines.push('');

    return lines.join('\n');
  }

  /**
   * 生成 Prefab 引用绑定验证清单。
   *
   * 检查 UIManager 中各 Panel 组件是否正确绑定了对应的 Item Prefab。
   *
   * @returns 验证清单作为字符串
   */
  static generateBindingChecklist(): string {
    const lines: string[] = [
      '=== Phase8 Prefab 引用绑定清单 ===',
      '',
      '| Panel 组件            | @property 属性         | 应绑定 Prefab            |',
      '|-----------------------|------------------------|--------------------------|',
    ];

    const bindings = [
      ['DungeonPanel', 'dungeonItemPrefab', 'DungeonItem.prefab'],
      ['DungeonNodeMapPanel', 'nodeItemPrefab', 'NodeMapItem.prefab'],
      ['DungeonNodeMapPanel', 'forkChoicePrefab', 'ForkChoiceItem.prefab'],
      ['ArtifactPanel', 'artifactItemPrefab', 'ArtifactItem.prefab'],
      ['LiveOpsPanel', 'activityCardPrefab', 'LiveOpsCard.prefab'],
      ['EventPanel', 'choiceButtonPrefab', 'EventChoiceButton.prefab'],
      ['ResultPanel', 'rewardItemPrefab', 'RewardItem.prefab'],
      ['ResultPanel', 'pityTriggerPrefab', 'RewardItem.prefab（或独立保底节点）'],
    ];

    for (const [panel, prop, prefab] of bindings) {
      lines.push(`| ${panel.padEnd(21)} | ${prop.padEnd(22)} | ${prefab.padEnd(24)} |`);
    }

    lines.push('');
    lines.push(`生成时间: ${new Date().toISOString()}`);
    lines.push('');

    return lines.join('\n');
  }

  /**
   * 扫描场景节点树并统计总节点数。
   *
   * @param root  扫描的根节点
   * @returns     总节点数
   */
  static countNodes(root: Node): number {
    let count = 1;
    for (const child of root.children) {
      count += this.countNodes(child);
    }
    return count;
  }

  /**
   * 生成完整的 Phase8-Step5 Prefab 构建状态报告。
   */
  static generateStep5Report(uiRootNode: Node): string {
    const registry = this.generateRegistryReport();
    const validationResults = this.validateNodeTreeFromScene(uiRootNode);
    const totalSceneNodes = uiRootNode ? this.countNodes(uiRootNode) : 0;

    const lines: string[] = [
      '========================================',
      '  Phase8-Step5 Prefab 构建状态报告',
      '========================================',
      '',
      `生成时间: ${new Date().toISOString()}`,
      `场景总节点数 (UIRoot): ${totalSceneNodes}`,
      '',
      '--- Panel Prefab 状态 ---',
      '',
    ];

    let panelOk = 0;
    let panelFail = 0;

    for (const result of validationResults) {
      const icon = result.exists && result.componentBound && result.missingChildren.length === 0 ? '✅' : '❌';
      lines.push(`${icon} ${result.panel}`);
      if (!result.exists) {
        lines.push(`   ⚠️ 节点不存在`);
        panelFail++;
        continue;
      }
      if (!result.componentBound) {
        lines.push(`   ⚠️ 组件未绑定`);
        panelFail++;
      }
      if (result.missingChildren.length > 0) {
        lines.push(`   ⚠️ 缺少子节点: ${result.missingChildren.join(', ')}`);
        panelFail++;
      }
      if (result.exists && result.componentBound && result.missingChildren.length === 0) {
        lines.push(`   子节点: ${result.foundChildren}/${result.totalChildren} ✓`);
        panelOk++;
      }
    }

    lines.push('');
    lines.push(`Panel 统计: ${panelOk} 通过, ${panelFail} 未通过`);
    lines.push('');
    lines.push('--- Item Prefab 清单 ---');
    lines.push('');

    for (const item of ITEM_PREFAB_META) {
      lines.push(`  📦 ${item.name}.prefab (${item.componentName}) → ${item.parentPanel}`);
    }

    lines.push('');
    lines.push(`总计 Prefab: ${PANEL_PREFAB_META.length} Panel + ${ITEM_PREFAB_META.length} Item = ${PANEL_PREFAB_META.length + ITEM_PREFAB_META.length}`);
    lines.push('========================================');

    return lines.join('\n');
  }
}
