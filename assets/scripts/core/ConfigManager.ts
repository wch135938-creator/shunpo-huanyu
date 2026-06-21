// ============================================================
// ConfigManager — 统一配置管理器
// 职责：配置加载 / 缓存 / 查询 / 热重载
// 位置：Core 层基础设施
// 依赖：Cocos resources API
// ============================================================

import { resources, JsonAsset } from 'cc';
import { BaseManager } from './BaseManager';

export class ConfigManager extends BaseManager {

  // ==================== 静态路径常量 ====================
  // 所有配置路径集中定义，禁止业务代码硬编码

  /** 配置根目录（相对 resources/） */
  static readonly CONFIG_ROOT = 'config';

  /** 角色配置目录 */
  static readonly DIR_CARDS = 'config/cards';

  /** 技能配置目录 */
  static readonly DIR_SKILLS = 'config/skills';

  /** 关卡配置目录 */
  static readonly DIR_STAGES = 'config/stages';

  /** 掉落配置目录 */
  static readonly DIR_DROPS = 'config/drops';

  /** 系统配置目录 */
  static readonly DIR_SYSTEMS = 'config/systems';

  /** 本地化配置目录 */
  static readonly DIR_LOCALIZATION = 'config/localization';

  // ==================== 内部状态 ====================

  /** 配置缓存：path → 解析后的 JSON 对象 */
  private _cache: Map<string, object> = new Map();

  /** 正在加载中的 Promise：path → Promise（防并发重复加载） */
  private _pendingLoads: Map<string, Promise<object>> = new Map();

  // ==================== 异步加载 ====================

  /**
   * 加载单个配置文件并缓存
   *
   * @param path  配置路径（相对 resources/，不含扩展名）
   *              例如：'config/cards/hero_list'
   * @returns     解析后的配置对象
   */
  loadConfig<T extends object>(path: string): Promise<T> {
    // 1. 已缓存 → 直接返回
    const cached = this._cache.get(path);
    if (cached) {
      return Promise.resolve(cached as T);
    }

    // 2. 正在加载 → 复用同一个 Promise（防并发）
    const pending = this._pendingLoads.get(path);
    if (pending) {
      return pending as Promise<T>;
    }

    // 3. 发起加载
    const promise = this._doLoad<T>(path);
    this._pendingLoads.set(path, promise);

    return promise;
  }

  /**
   * 批量加载配置
   *
   * @param paths  配置路径数组
   * @returns      全部加载完成后 resolve
   */
  loadConfigs(paths: string[]): Promise<void> {
    const tasks = paths.map((p) => this.loadConfig(p));
    return Promise.all(tasks).then(() => {});
  }

  /** 执行实际的 resources.load 调用 */
  private _doLoad<T extends object>(path: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      resources.load(path, JsonAsset, (err, asset) => {
        // 清理 pending 记录（无论成功失败）
        this._pendingLoads.delete(path);

        if (err) {
          reject(new Error(`[ConfigManager] 加载失败: ${path}, ${err.message || err}`));
          return;
        }

        try {
          const data = asset.json as T;
          this._cache.set(path, data);
          resolve(data);
        } catch (e) {
          reject(new Error(`[ConfigManager] 解析失败: ${path}, ${e}`));
        }
      });
    });
  }

  // ==================== 同步查询 ====================

  /**
   * 获取已缓存的配置（同步，必须先 loadConfig）
   *
   * @param path  配置路径
   * @returns     配置对象，未加载时返回 null
   */
  getConfig<T extends object>(path: string): T | null {
    const data = this._cache.get(path);
    if (!data) return null;
    return data as T;
  }

  /**
   * 检查指定路径的配置是否已加载
   */
  isLoaded(path: string): boolean {
    return this._cache.has(path);
  }

  // ==================== 热重载 ====================

  /**
   * 清除缓存（编辑器模式下配合 loadConfig 实现热重载）
   *
   * @param path  不传则清除全部缓存
   */
  clearCache(path?: string): void {
    if (path) {
      this._cache.delete(path);
    } else {
      this._cache.clear();
    }
  }

  /**
   * 热重载指定配置：清除缓存 → 重新加载
   *
   * @param path  配置路径
   * @returns     重新加载后的配置对象
   */
  reloadConfig<T extends object>(path: string): Promise<T> {
    this.clearCache(path);
    return this.loadConfig<T>(path);
  }
}
