// ============================================================
// SkillRepository — Phase9 技能配置仓库
// 职责：通过 ConfigManager 加载/缓存 skill_data.json，提供同步查询
// 边界：不包含业务逻辑、不修改配置、不涉及运行时状态
// ============================================================

import { BaseSystem } from '../core/BaseSystem';
import { ConfigManager } from '../core/ConfigManager';
import type { SkillConfig, SkillDataList } from './SkillTypes';

export class SkillRepository extends BaseSystem {

  // ==================== 配置路径常量 ====================

  /** skill_data.json 路径（相对 resources/，不含扩展名） */
  static readonly SKILL_DATA_PATH = `${ConfigManager.CONFIG_ROOT}/skills/skill_data`;

  // ==================== 内部状态 ====================

  /** 技能配置缓存：skillId → SkillConfig */
  private _configMap: Map<string, SkillConfig> = new Map();

  /** 配置是否已加载 */
  private _loaded = false;

  // ==================== 初始化 ====================

  /**
   * 加载 skill_data.json 配置。
   *
   * 调用方应在使用 SkillRepository 前执行一次。
   * 重复调用会复用 ConfigManager 缓存。
   */
  async loadConfig(): Promise<void> {
    const configManager = ConfigManager.getInstance();
    const data = await configManager.loadConfig<SkillDataList>(SkillRepository.SKILL_DATA_PATH);

    this._configMap = this._buildConfigMap(data);
    this._loaded = true;
  }

  /** 是否已加载配置 */
  isLoaded(): boolean {
    return this._loaded;
  }

  // ==================== 同步查询 ====================

  /**
   * 获取单个技能配置。
   *
   * @param skillId  技能 ID
   * @returns        技能配置，不存在时返回 null
   */
  getSkillConfig(skillId: string): SkillConfig | null {
    return this._configMap.get(skillId) ?? null;
  }

  /**
   * 获取所有技能配置列表。
   *
   * @returns  技能配置数组
   */
  getAllSkillConfigs(): SkillConfig[] {
    return Array.from(this._configMap.values());
  }

  /**
   * 获取所有技能 ID 列表。
   *
   * @returns  技能 ID 数组
   */
  getAllSkillIds(): string[] {
    return Array.from(this._configMap.keys());
  }

  /**
   * 判断技能配置是否存在。
   *
   * @param skillId  技能 ID
   * @returns        是否存在对应配置
   */
  hasSkill(skillId: string): boolean {
    return this._configMap.has(skillId);
  }

  /**
   * 获取已缓存技能配置数量。
   */
  getSkillCount(): number {
    return this._configMap.size;
  }

  // ==================== 内部方法 ====================

  /** 从 SkillDataList 构建配置映射 */
  private _buildConfigMap(data: SkillDataList): Map<string, SkillConfig> {
    const map = new Map<string, SkillConfig>();

    for (const entry of data.data) {
      // 深拷贝 effects 数组，防止共享引用被意外修改
      map.set(entry.id, {
        ...entry,
        effects: entry.effects.map((eff) => ({ ...eff })),
      });
    }

    if (map.size === 0) {
      throw new Error('[SkillRepository] skill_data.json 未包含任何技能配置');
    }

    return map;
  }
}
