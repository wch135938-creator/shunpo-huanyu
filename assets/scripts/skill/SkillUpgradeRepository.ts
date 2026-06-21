// ============================================================
// SkillUpgradeRepository — Phase10-Step2 技能升级配置仓库
// 职责：通过 ConfigManager 加载/缓存 skill_upgrade_config.json
// 边界：纯配置查询，不修改系统状态，不依赖 UI
// ============================================================

import { BaseSystem } from '../core/BaseSystem';
import { ConfigManager } from '../core/ConfigManager';

// ==================== 类型定义 ====================

/** 技能升级配置单条数据 */
export interface SkillUpgradeEntry {
  /** 技能 ID */
  skillId: string;
  /** 等级 */
  level: number;
  /** 伤害倍率 */
  damageMultiplier: number;
  /** 能量消耗 */
  energyCost: number;
  /** 冷却时间（毫秒） */
  cooldownMs: number;
  /** 升级消耗（金币） */
  upgradeCost: number;
}

/** skill_upgrade_config.json 顶层结构 */
export interface SkillUpgradeDataList {
  version: string;
  name: string;
  data: SkillUpgradeEntry[];
}

export class SkillUpgradeRepository extends BaseSystem {

  // ==================== 配置路径常量 ====================

  static readonly UPGRADE_CONFIG_PATH = `${ConfigManager.CONFIG_ROOT}/skill/skill_upgrade_config`;

  // ==================== 内部状态 ====================

  /** 配置缓存：skillId → level → SkillUpgradeEntry */
  private _dataMap: Map<string, Map<number, SkillUpgradeEntry>> = new Map();

  /** 配置是否已加载 */
  private _loaded = false;

  // ==================== 初始化 ====================

  /**
   * 加载 skill_upgrade_config.json 配置。
   */
  async loadConfig(): Promise<void> {
    const configManager = ConfigManager.getInstance();
    const data = await configManager.loadConfig<SkillUpgradeDataList>(
      SkillUpgradeRepository.UPGRADE_CONFIG_PATH,
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
   * 获取技能在指定等级的升级配置。
   *
   * @param skillId  技能 ID
   * @param level    等级
   * @returns        升级配置条目，不存在时返回 null
   */
  getUpgradeEntry(skillId: string, level: number): SkillUpgradeEntry | null {
    const skillMap = this._dataMap.get(skillId);
    if (!skillMap) return null;
    return skillMap.get(level) ?? null;
  }

  /**
   * 获取技能所有等级的升级配置。
   *
   * @param skillId  技能 ID
   * @returns        升级配置数组，不存在时返回空数组
   */
  getAllUpgradeEntries(skillId: string): SkillUpgradeEntry[] {
    const skillMap = this._dataMap.get(skillId);
    if (!skillMap) return [];
    return Array.from(skillMap.values()).sort((a, b) => a.level - b.level);
  }

  /**
   * 获取技能当前等级配置（最高已配置等级）。
   *
   * @param skillId  技能 ID
   * @returns        最高等级，无配置时返回 0
   */
  getMaxConfiguredLevel(skillId: string): number {
    const skillMap = this._dataMap.get(skillId);
    if (!skillMap || skillMap.size === 0) return 0;
    return Math.max(...Array.from(skillMap.keys()));
  }

  /**
   * 判断技能是否存在升级配置。
   */
  hasUpgradeConfig(skillId: string): boolean {
    return this._dataMap.has(skillId);
  }

  /**
   * 获取所有有升级配置的技能 ID 列表。
   */
  getAllSkillIds(): string[] {
    return Array.from(this._dataMap.keys());
  }

  // ==================== 内部方法 ====================

  private _buildDataMap(data: SkillUpgradeDataList): Map<string, Map<number, SkillUpgradeEntry>> {
    const map = new Map<string, Map<number, SkillUpgradeEntry>>();

    for (const entry of data.data) {
      if (!map.has(entry.skillId)) {
        map.set(entry.skillId, new Map());
      }
      map.get(entry.skillId)!.set(entry.level, { ...entry });
    }

    if (map.size === 0) {
      throw new Error('[SkillUpgradeRepository] skill_upgrade_config.json 未包含任何升级配置');
    }

    return map;
  }
}
