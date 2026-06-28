// ============================================================
// ConfigManager — 统一配置管理器
// 职责：配置加载 / 缓存 / 查询 / 热重载
// 位置：Core 层基础设施
// 依赖：Cocos resources API
// ============================================================

import { resources, JsonAsset, assetManager } from 'cc';
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

  /** 邮箱 / 兑换码 / 登录奖励配置 */
  static readonly OPERATIONS_CONFIG = 'config/systems/operations_config';

  /** 本地化配置目录 */
  static readonly DIR_LOCALIZATION = 'config/localization';

  private static readonly CONFIG_UUID_FALLBACK: Record<string, string> = {
    'config/cards/hero_list': 'bf367ec9-162b-4714-bd33-33b478455115',
    'config/cards/hero_star': '838a23d4-bc22-4fd1-8fde-e70fc2c43cb0',
    'config/chapter/chapter_event_config': 'fe1e1dfb-8f7b-4d4a-877a-eb4401e239fa',
    'config/chapter/dynamic_enemy_config': '13496117-aa41-4c6a-9c0d-34af3e22763f',
    'config/chapter/stage_extension_config': '05274c83-f080-487e-8bfa-131e145593f3',
    'config/chapters/chapter_data': 'a1b2c3d4-0010-4a10-b010-000000000010',
    'config/drops/drop_table': '2305d241-78bc-41ac-a16b-af1c832ae5fa',
    'config/enemies/boss_data': 'e5f6a7b8-c9d0-4123-e4f5-a6b7c8d9e0f1',
    'config/enemies/enemy_data': 'd4e5f6a7-b8c9-4012-d3e4-f5a6b7c8d9e0',
    'config/hero/hero_growth_config': 'ea7749c1-505e-4031-aca2-78023b20359a',
    'config/hero/hero_talent_config': 'c3d4e5f6-a7b8-9012-cdef-123456789012',
    'config/heroes/hero_data': '9b0037a9-073c-4767-84fe-30778b88689a',
    'config/icons/phase8_icon_mapping': '17107dd8-f524-4f3f-8eda-dc8f98c21421',
    'config/localization/phase8_ui_texts': '99274900-d911-4ee0-afc1-c0df0b2caf2e',
    'config/reward/chapter_reward_config': '1b21756a-4ff0-4b01-bbee-b52726c3306b',
    'config/reward/enemy_reward_config': '4d2c45a2-bf2f-4d00-b03f-341bc5b97777',
    'config/reward/event_reward_config': 'e7db1492-67c9-4515-bb1c-9e4b5bb6f8e2',
    'config/reward/reward_pool_config': '99168f6f-d149-463d-9ae5-863cec05b06f',
    'config/skill/skill_combo_config': 'c5a0e3b9-4f6d-4c1a-d7e8-f9a0b1c2d3e4',
    'config/skill/skill_upgrade_config': 'b4f9d2a8-3e5c-4b0f-c6d7-e8f9a0b1c2d3',
    'config/skills/skill_data': '02d4f67e-8d53-42d2-a1ee-6f0ed53f3479',
    'config/stages/enemy_data': 'a6beec27-dd5f-4790-be22-e3fd2d38a749',
    'config/stages/stage_data': 'd7033f3d-b4db-4d33-b324-02ef1d071de0',
    'config/systems/artifact_config': '478373cc-39de-43aa-b0d8-ee25de868b9f',
    'config/systems/boss_config': 'c1eec695-d499-4e98-9314-db72c24bc8ad',
    'config/systems/dungeon_config': '99a7a088-2972-422f-8883-a49c1a9e767f',
    'config/systems/dungeon_v2_config': 'f46d52e7-8a9f-4d85-bf6b-11839334acb5',
    'config/systems/equipment_config': '62dae379-cdd5-4b02-870c-be7360f0a34d',
    'config/systems/event_config': '526a71c4-c1eb-49a9-9a91-c51922c9ac82',
    'config/systems/event_pool_config': '73252f29-e8a2-462d-9ecc-771e80219dbd',
    'config/systems/global_const': '28137d42-2c97-4b09-94a2-465c917e8a28',
    'config/systems/level_config': '16777afd-62a5-4649-ad40-f75b46278705',
    'config/systems/liveops_config': 'e5875b72-a62f-44ea-9a19-81f18b2a97d6',
    'config/systems/operations_config': '1fe542c5-62df-433a-a8f4-d3ab1b92779d',
    'config/systems/power_config': 'd01d9699-057b-43e7-bc3c-325594e7eb06',
    'config/systems/reward_pool_config': '5ba0b0aa-c3a5-4df9-b8fc-8fb31f74ea47',
    'config/systems/special_event_config': '958099ee-a048-4da1-8492-c554eb162d86',
    'config/tutorial/tutorial_data': '5de3dd80-047c-4702-9bd2-e80e3a415294',
  };

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
    return this._loadJsonAsset<T>(path, true)
      .catch(() => this._loadJsonAsset<T>(path, false))
      .catch(() => this._loadJsonByBundle<T>(path))
      .catch(() => this._loadJsonByPreviewFetch<T>(path))
      .then((data) => {
        this._pendingLoads.delete(path);
        this._cache.set(path, data);
        return data;
      })
      .catch((err) => {
        this._pendingLoads.delete(path);
        throw err;
      });
  }

  private _loadJsonAsset<T extends object>(path: string, typed: boolean): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const done = (err: Error | null, asset: JsonAsset | null) => {
        if (err) {
          reject(new Error(`[ConfigManager] 加载失败: ${path}, ${err.message || err}`));
          return;
        }

        try {
          resolve(this._extractJson<T>(path, asset));
        } catch (e) {
          reject(new Error(`[ConfigManager] 解析失败: ${path}, ${e}`));
        }
      };

      if (typed) {
        resources.load(path, JsonAsset, done);
      } else {
        resources.load(path, done);
      }
    });
  }

  private _extractJson<T extends object>(path: string, asset: JsonAsset | null): T {
    if (!asset) {
      throw new Error('asset is null');
    }

    const assetLike = asset as JsonAsset & {
      json?: unknown;
      _nativeAsset?: unknown;
      text?: string;
    };

    try {
      const json = assetLike.json;
      if (json && typeof json === 'object') {
        return json as T;
      }
    } catch (e) {
      console.warn(`[ConfigManager] asset.json 读取失败，尝试备用字段: ${path}`, e);
    }

    if (typeof assetLike.text === 'string') {
      return JSON.parse(assetLike.text) as T;
    }

    if (typeof assetLike._nativeAsset === 'string') {
      return JSON.parse(assetLike._nativeAsset) as T;
    }

    if (assetLike._nativeAsset && typeof assetLike._nativeAsset === 'object') {
      return assetLike._nativeAsset as T;
    }

    throw new Error(`unsupported json asset shape: ${path}`);
  }

  private _loadJsonByBundle<T extends object>(path: string): Promise<T> {
    return this._loadJsonByBundlePath<T>(path)
      .catch(() => this._loadJsonByUuid<T>(path));
  }

  private _loadJsonByBundlePath<T extends object>(path: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const manager = assetManager as unknown as {
        getBundle?: (name: string) => {
          load: (
            path: string,
            type: typeof JsonAsset,
            callback: (err: Error | null, asset: JsonAsset | null) => void,
          ) => void;
        } | null;
      };
      const bundle = manager.getBundle?.('resources');

      if (!bundle) {
        reject(new Error('resources bundle unavailable'));
        return;
      }

      bundle.load(path, JsonAsset, (err, asset) => {
        if (err) {
          reject(err);
          return;
        }

        try {
          resolve(this._extractJson<T>(path, asset));
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  private _loadJsonByUuid<T extends object>(path: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const uuid = ConfigManager.CONFIG_UUID_FALLBACK[path];
      if (!uuid) {
        reject(new Error(`uuid fallback missing: ${path}`));
        return;
      }

      const manager = assetManager as unknown as {
        loadAny?: (
          request: { uuid: string },
          callback: (err: Error | null, asset: JsonAsset | null) => void,
        ) => void;
      };

      if (!manager.loadAny) {
        reject(new Error('assetManager.loadAny unavailable'));
        return;
      }

      manager.loadAny({ uuid }, (err, asset) => {
        if (err) {
          reject(err);
          return;
        }

        try {
          resolve(this._extractJson<T>(path, asset));
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  private _loadJsonByPreviewFetch<T extends object>(path: string): Promise<T> {
    const host = globalThis as typeof globalThis & {
      fetch?: (input: string) => Promise<{ ok: boolean; text: () => Promise<string> }>;
    };
    const urls = [
      `assets/resources/${path}.json`,
      `/assets/resources/${path}.json`,
      `${path}.json`,
    ];

    const loadNext = (index: number): Promise<T> => {
      if (index >= urls.length) {
        return Promise.reject(new Error(`[ConfigManager] Preview source json load failed: ${path}`));
      }

      if (!host.fetch) {
        return Promise.reject(new Error('[ConfigManager] fetch unavailable'));
      }

      const url = urls[index];
      return host.fetch(url)
        .then((response) => {
          if (!response.ok) {
            throw new Error(`HTTP load failed: ${url}`);
          }
          return response.text();
        })
        .then((text) => JSON.parse(text) as T)
        .catch(() => loadNext(index + 1));
    };

    return loadNext(0);
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
