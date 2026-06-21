// ============================================================
// Phase8LocalizationBinder — Phase8-Step5 本地化文本绑定器
// 职责：将 phase8_ui_texts.json 中的文本 Key 绑定到 Panel/Item Prefab 的 Label 节点
//
// 绑定策略：
//   1. 静态文本（标题、按钮等） — 在 Panel.open() 时通过 getText() 绑定
//   2. 动态文本（倒计时、数值等） — 在数据刷新时通过 formatText() 拼接
//   3. 列表项文本 — 通过模板 setup() 方法传入已翻译文本
//
// 使用方式：
//   const l10n = Phase8LocalizationBinder.getInstance();
//   l10n.initialize();
//   const text = l10n.getText('dungeon_panel_title'); // → "选择地牢"
//   const formatted = l10n.formatText('nodemap_layer', [3]); // → "第 3 层"
//
// 架构：纯工具层，依赖 ConfigManager 读取本地化配置
// 边界：不直接操作 UI 节点，由 Panel 调用 getText() 后自行设置 Label.string
// ============================================================

import { ConfigManager } from '../core/ConfigManager';

// ==================== 类型 ====================

/** 本地化语言代码 */
export type LocaleCode = 'zh' | 'en';

/** 本地化文本表 */
interface LocalizationTable {
  [key: string]: string;
}

/** 本地化配置容器结构 */
interface L10nConfigContainer {
  version: number;
  name: string;
  data: Record<string, LocalizationTable>;
}

// ==================== Panel ↔ Key 映射表 ====================

/**
 * Panel/Item 节点 → 本地化 Key 的绑定映射。
 *
 * 当 Panel.open() 时，按照此映射表将对应 Key 的翻译文本设置到 Label。
 */
export const PANEL_L10N_BINDINGS: Record<string, Record<string, string>> = {
  // DungeonPanel
  'DungeonPanel.TitleLabel': 'dungeon_panel_title',
  'DungeonPanel.PowerLabel': 'dungeon_panel_power', // 拼接格式: "战力: {0}"
  'DungeonPanel.EmptyHintLabel': 'dungeon_panel_empty',
  'DungeonPanel.CloseButton': '', // 固定文本 "✕"

  // DungeonNodeMapPanel
  'DungeonNodeMapPanel.LayerTitleLabel': 'nodemap_layer', // 拼接格式: "第 {0} 层"
  'DungeonNodeMapPanel.InfoLabel': '',
  'DungeonNodeMapPanel.CloseButton': '',
  'DungeonNodeMapPanel.ForkPanel.ForkTitleLabel': 'nodemap_choose_direction',

  // RoguelikeHUD
  'RoguelikeHUD.FloorLabel': 'hud_floor_format', // 拼接格式: "{0} / {1}"
  'RoguelikeHUD.GoldLabel': 'hud_gold', // 拼接格式: "💰 {0}"
  'RoguelikeHUD.ExpLabel': 'hud_exp', // 拼接格式: "✨ {0}"
  'RoguelikeHUD.SeedLabel': 'hud_seed', // 拼接格式: "种子: {0}"
  'RoguelikeHUD.PauseButton': 'hud_pause',

  // ArtifactPanel
  'ArtifactPanel.TitleLabel': 'artifact_panel_title',
  'ArtifactPanel.ActiveArtifactLabel': '', // 动态: '已激活: {0} Lv.{1}' 或 '未激活任何神器'
  'ArtifactPanel.EmptyHintLabel': 'artifact_panel_empty',
  'ArtifactPanel.CloseButton': '',

  // LiveOpsPanel
  'LiveOpsPanel.TitleLabel': 'liveops_panel_title',
  'LiveOpsPanel.LastRefreshLabel': 'liveops_panel_refresh_time', // 拼接格式: "刷新时间: {0}"
  'LiveOpsPanel.EmptyHintLabel': 'liveops_panel_empty',
  'LiveOpsPanel.CloseButton': '',

  // EventPanel
  'EventPanel.TitleLabel': '', // 动态: 事件名称
  'EventPanel.CategoryLabel': '', // 动态: "{icon} {category}"
  'EventPanel.DescriptionLabel': '', // 动态: 事件描述
  'EventPanel.RewardPreviewLabel': '', // 动态
  'EventPanel.SkipButton': 'event_panel_skip',
  'EventPanel.ConfirmButton': 'event_panel_confirm',

  // ResultPanel
  'ResultPanel.TitleLabel': '', // 动态: '✨ 胜利 ✨' / '💀 失败'
  'ResultPanel.SubtitleLabel': '', // 动态
  'ResultPanel.ExpGainLabel': 'result_panel_exp_gain', // 拼接格式: "经验 +{0}"
  'ResultPanel.GoldGainLabel': 'result_panel_gold_gain', // 拼接格式: "金币 +{0}"
  'ResultPanel.ContinueButton.Label': 'result_panel_continue',
  'ResultPanel.ReturnButton.Label': 'result_panel_return',
};

/**
 * Item Prefab 中使用的本地化 Key 列表。
 * 这些 Key 在创建 Item 时由模板的 setup() 方法使用。
 */
export const ITEM_L10N_KEY_REFERENCES: Record<string, string[]> = {
  DungeonItem: [
    'dungeon_panel_enter', 'dungeon_panel_recommend_power', 'dungeon_panel_layers',
    'difficulty_normal', 'difficulty_hard', 'difficulty_expert',
  ],
  NodeMapItem: [
    'nodemap_node_battle', 'nodemap_node_event', 'nodemap_node_boss',
    'nodemap_node_reward', 'nodemap_node_shop', 'nodemap_node_empty',
    'nodemap_visited', 'nodemap_available',
  ],
  ForkChoiceItem: ['nodemap_choose_direction'],
  ArtifactItem: [
    'artifact_rarity_common', 'artifact_rarity_rare',
    'artifact_rarity_epic', 'artifact_rarity_legendary',
    'artifact_panel_level', 'artifact_panel_activate', 'artifact_panel_locked',
  ],
  LiveOpsCard: [
    'liveops_status_active', 'liveops_status_upcoming', 'liveops_status_ended',
    'liveops_countdown_ended',
  ],
  EventChoiceButton: [
    'event_choice_accept', 'event_choice_fight', 'event_choice_flee',
    'event_choice_buy', 'event_choice_leave', 'event_choice_blessing',
    'event_choice_curse_accept', 'event_choice_curse_resist',
    'event_choice_story_a', 'event_choice_story_b', 'event_choice_story_c',
    'event_choice_boss_fight', 'event_choice_boss_avoid',
    'event_choice_investigate', 'event_choice_ignore', 'event_choice_continue',
  ],
  RewardItem: [
    'reward_type_gold', 'reward_type_exp', 'reward_type_equipment',
    'reward_type_item', 'reward_type_currency',
  ],
};

// ==================== 主类 ====================

export class Phase8LocalizationBinder {
  private static _instance: Phase8LocalizationBinder | null = null;

  private _configManager: ConfigManager;
  private _currentLocale: LocaleCode = 'zh';
  private _fallbackLocale: LocaleCode = 'zh';
  private _tables: Map<LocaleCode, LocalizationTable> = new Map();
  private _ready = false;

  // ==================== 单例 ====================

  static getInstance(): Phase8LocalizationBinder {
    if (!Phase8LocalizationBinder._instance) {
      Phase8LocalizationBinder._instance = new Phase8LocalizationBinder();
    }
    return Phase8LocalizationBinder._instance;
  }

  private constructor() {
    this._configManager = ConfigManager.getInstance();
  }

  // ==================== 初始化 ====================

  /**
   * 初始化本地化绑定器。
   *
   * 从 ConfigManager 加载 phase8_ui_texts.json 配置。
   */
  initialize(): boolean {
    if (this._ready) return true;

    try {
      const container = this._configManager.getConfig<L10nConfigContainer>(
        'config/localization/phase8_ui_texts',
      );

      if (!container?.data) {
        console.warn('[Phase8LocalizationBinder] 本地化配置未加载');
        return false;
      }

      // 加载所有语言表
      for (const [locale, table] of Object.entries(container.data)) {
        this._tables.set(locale as LocaleCode, table);
      }

      this._ready = true;
      const keyCount = Object.keys(this._tables.get('zh') ?? {}).length;
      console.log(`[Phase8LocalizationBinder] 已加载 ${this._tables.size} 种语言, zh: ${keyCount} 个 key`);

      return true;
    } catch (e) {
      console.error('[Phase8LocalizationBinder] 初始化失败:', e);
      return false;
    }
  }

  // ==================== API ====================

  /** 获取本地化文本 */
  getText(key: string, locale?: LocaleCode): string {
    const loc = locale ?? this._currentLocale;
    const table = this._tables.get(loc) ?? this._tables.get(this._fallbackLocale);
    return table?.[key] ?? key;
  }

  /**
   * 获取格式化后的本地化文本。
   *
   * 使用 {0}, {1}, {2}... 作为占位符，与 phase8_ui_texts.json 格式一致。
   *
   * @example
   *   formatText('nodemap_layer', [3]) // → "第 3 层"
   *   formatText('hud_floor_format', [1, 3]) // → "1 / 3"
   *   formatText('hud_gold', [500]) // → "💰 500"
   */
  formatText(key: string, args: (string | number)[], locale?: LocaleCode): string {
    let template = this.getText(key, locale);
    for (let i = 0; i < args.length; i++) {
      template = template.replace(`{${i}}`, String(args[i]));
    }
    return template;
  }

  /** 获取当前语言 */
  getCurrentLocale(): LocaleCode {
    return this._currentLocale;
  }

  /** 设置当前语言 */
  setLocale(locale: LocaleCode): void {
    this._currentLocale = locale;
    console.log(`[Phase8LocalizationBinder] 切换语言: ${locale}`);
  }

  /** 是否已初始化 */
  isReady(): boolean {
    return this._ready;
  }

  // ==================== Panel 批量绑定 ====================

  /**
   * 获取指定 Panel/节点的绑定 Key。
   *
   * @param panelName   Panel 名称 (e.g. "DungeonPanel")
   * @param nodeName    节点名称 (e.g. "TitleLabel")
   * @returns           本地化 Key，无绑定时返回空字符串
   */
  getBindingKey(panelName: string, nodeName: string): string {
    const fullKey = `${panelName}.${nodeName}`;
    return PANEL_L10N_BINDINGS[fullKey] ?? '';
  }

  /** 获取 Panel 所有绑定的 Key 映射 */
  getPanelBindings(panelName: string): Record<string, string> {
    const result: Record<string, string> = {};
    const prefix = `${panelName}.`;

    for (const [key, value] of Object.entries(PANEL_L10N_BINDINGS)) {
      if (key.startsWith(prefix)) {
        result[key.slice(prefix.length)] = value;
      }
    }

    return result;
  }

  /** 获取所有 Panel 绑定 */
  getAllPanelBindings(): Record<string, Record<string, string>> {
    return PANEL_L10N_BINDINGS;
  }

  /** 获取 Item 模板引用的本地化 Key */
  getItemKeyReferences(itemName: string): string[] {
    return ITEM_L10N_KEY_REFERENCES[itemName] ?? [];
  }

  // ==================== 工具 ====================

  /** 获取当前语言下所有可用 Key 的数量 */
  getKeyCount(locale?: LocaleCode): number {
    const loc = locale ?? this._currentLocale;
    const table = this._tables.get(loc) ?? this._tables.get(this._fallbackLocale);
    return table ? Object.keys(table).length : 0;
  }

  /**
   * 检查 Key 是否存在于当前语言表。
   */
  hasKey(key: string, locale?: LocaleCode): boolean {
    const loc = locale ?? this._currentLocale;
    const table = this._tables.get(loc) ?? this._tables.get(this._fallbackLocale);
    return table ? key in table : false;
  }

  /**
   * 验证所有 Panel 绑定 Key 是否都存在。
   *
   * @returns  缺失的 Key 列表
   */
  validatePanelBindings(): { missingKeys: string[]; totalKeys: number; validKeys: number } {
    const missingKeys: string[] = [];
    let totalKeys = 0;
    let validKeys = 0;

    for (const binding of Object.values(PANEL_L10N_BINDINGS)) {
      if (!binding) continue; // 动态文本（空字符串）跳过
      totalKeys++;
      if (this.hasKey(binding)) {
        validKeys++;
      } else {
        missingKeys.push(binding);
      }
    }

    return { missingKeys, totalKeys, validKeys };
  }
}
