// ============================================================
// HeroRepository — Phase9 英雄配置仓库
// 职责：通过 ConfigManager 加载/缓存 hero_data.json，提供同步查询
// 边界：不包含业务逻辑、不修改配置、不涉及运行时状态
// ============================================================

import { BaseSystem } from '../core/BaseSystem';
import { ConfigManager } from '../core/ConfigManager';
import type { HeroConfig, HeroDataList } from './HeroTypes';

export class HeroRepository extends BaseSystem {

  // ==================== 配置路径常量 ====================

  /** hero_data.json 路径（相对 resources/，不含扩展名） */
  static readonly HERO_DATA_PATH = `${ConfigManager.CONFIG_ROOT}/heroes/hero_data`;

  // ==================== 内部状态 ====================

  /** 英雄配置缓存：heroId → HeroConfig */
  private _configMap: Map<string, HeroConfig> = new Map();

  /** 配置是否已加载 */
  private _loaded = false;

  // ==================== 初始化 ====================

  /**
   * 加载 hero_data.json 配置。
   *
   * 调用方应在使用 HeroRepository 前执行一次。
   * 重复调用会复用 ConfigManager 缓存。
   */
  async loadConfig(): Promise<void> {
    const configManager = ConfigManager.getInstance();
    const data = await configManager.loadConfig<HeroDataList>(HeroRepository.HERO_DATA_PATH);

    this._configMap = this._buildConfigMap(data);
    this._loaded = true;
  }

  /** 是否已加载配置 */
  isLoaded(): boolean {
    return this._loaded;
  }

  // ==================== 同步查询 ====================

  /**
   * 获取单个英雄配置。
   *
   * @param heroId  英雄 ID
   * @returns       英雄配置，不存在时返回 null
   */
  getHeroConfig(heroId: string): HeroConfig | null {
    return this._configMap.get(heroId) ?? null;
  }

  /**
   * 获取所有英雄配置列表。
   *
   * @returns  英雄配置数组
   */
  getAllHeroConfigs(): HeroConfig[] {
    return Array.from(this._configMap.values());
  }

  /**
   * 获取所有英雄 ID 列表。
   *
   * @returns  英雄 ID 数组
   */
  getAllHeroIds(): string[] {
    return Array.from(this._configMap.keys());
  }

  /**
   * 判断英雄配置是否存在。
   *
   * @param heroId  英雄 ID
   * @returns       是否存在对应配置
   */
  hasHero(heroId: string): boolean {
    return this._configMap.has(heroId);
  }

  /**
   * 获取已缓存英雄配置数量。
   */
  getHeroCount(): number {
    return this._configMap.size;
  }

  // ==================== 内部方法 ====================

  /** 从 HeroDataList 构建配置映射 */
  private _buildConfigMap(data: HeroDataList): Map<string, HeroConfig> {
    const map = new Map<string, HeroConfig>();

    for (const entry of data.data) {
      // 深拷贝数组字段，防止共享引用被意外修改
      map.set(entry.id, {
        ...entry,
        defaultSkillIds: [...entry.defaultSkillIds],
        baseStats: { ...entry.baseStats },
        growthStats: { ...entry.growthStats },
      });
    }

    if (map.size === 0) {
      throw new Error('[HeroRepository] hero_data.json 未包含任何英雄配置');
    }

    return map;
  }
}
