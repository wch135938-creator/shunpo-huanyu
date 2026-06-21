// ============================================================
// ComboSkillRepository — Phase10-Step2 连携技能配置仓库
// 职责：通过 ConfigManager 加载/缓存 skill_combo_config.json
// 边界：纯配置查询，不修改系统状态，不依赖 UI
// ============================================================

import { BaseSystem } from '../core/BaseSystem';
import { ConfigManager } from '../core/ConfigManager';

// ==================== 类型定义 ====================

/** 连携技能配置单条数据 */
export interface ComboSkillEntry {
  /** 连携 ID */
  comboId: string;
  /** 连携名称 */
  comboName: string;
  /** 触发连携需要的技能 ID 列表 */
  skillIds: string[];
  /** 效果类型 */
  effectType: string;
  /** 效果数值 */
  effectValue: number;
  /** 连携描述 */
  description: string;
}

/** skill_combo_config.json 顶层结构 */
export interface ComboSkillDataList {
  version: string;
  name: string;
  data: ComboSkillEntry[];
}

export class ComboSkillRepository extends BaseSystem {

  // ==================== 配置路径常量 ====================

  static readonly COMBO_CONFIG_PATH = `${ConfigManager.CONFIG_ROOT}/skill/skill_combo_config`;

  // ==================== 内部状态 ====================

  /** 配置缓存：comboId → ComboSkillEntry */
  private _dataMap: Map<string, ComboSkillEntry> = new Map();

  /** 配置是否已加载 */
  private _loaded = false;

  // ==================== 初始化 ====================

  /**
   * 加载 skill_combo_config.json 配置。
   */
  async loadConfig(): Promise<void> {
    const configManager = ConfigManager.getInstance();
    const data = await configManager.loadConfig<ComboSkillDataList>(
      ComboSkillRepository.COMBO_CONFIG_PATH,
    );

    this._dataMap = this._buildDataMap(data);
    this._loaded = true;
  }

  /** 是否已加载配置 */
  isLoaded(): boolean {
    return this._loaded;
  }

  // ==================== 同步查询 ====================

  /**
   * 获取单个连携技能配置。
   *
   * @param comboId  连携 ID
   * @returns        连携配置，不存在时返回 null
   */
  getComboEntry(comboId: string): ComboSkillEntry | null {
    return this._dataMap.get(comboId) ?? null;
  }

  /**
   * 获取所有连携技能配置。
   */
  getAllComboEntries(): ComboSkillEntry[] {
    return Array.from(this._dataMap.values()).map((e) => ({ ...e }));
  }

  /**
   * 根据技能 ID 列表查找匹配的连携。
   *
   * 检查所有连携配置，如果某个连携的 skillIds 全部包含在给定列表中，
   * 则认为该连携被触发。
   *
   * @param skillIds  当前使用的技能 ID 列表
   * @returns         匹配的连携配置列表
   */
  findMatchingCombos(skillIds: string[]): ComboSkillEntry[] {
    const skillSet = new Set(skillIds);
    const matches: ComboSkillEntry[] = [];

    for (const entry of this._dataMap.values()) {
      if (entry.skillIds.every((id) => skillSet.has(id))) {
        matches.push({ ...entry });
      }
    }

    return matches;
  }

  /**
   * 判断是否存在指定连携。
   */
  hasCombo(comboId: string): boolean {
    return this._dataMap.has(comboId);
  }

  /**
   * 获取已缓存连携配置数量。
   */
  getComboCount(): number {
    return this._dataMap.size;
  }

  // ==================== 内部方法 ====================

  private _buildDataMap(data: ComboSkillDataList): Map<string, ComboSkillEntry> {
    const map = new Map<string, ComboSkillEntry>();

    for (const entry of data.data) {
      map.set(entry.comboId, { ...entry });
    }

    if (map.size === 0) {
      throw new Error('[ComboSkillRepository] skill_combo_config.json 未包含任何连携配置');
    }

    return map;
  }
}
