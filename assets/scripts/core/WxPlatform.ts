// ============================================================
// WxPlatform — 微信平台统一封装层
// 职责：所有 wx.* 调用的唯一出口，提供环境检测 + API 安全壳
// 位置：Core 层基础设施
// 规范：
//   · 项目中 wx.* 调用仅允许存在于本文件
//   · 业务模块禁止直接调用 wx.*
//   · 非微信环境自动降级，不抛异常
//   · 禁止 any — 全部明确类型
// ============================================================

// ==================== 全局微信类型声明 ====================

/** 微信小游戏全局对象（运行时注入） */
declare global {
  const wx: WxGlobal | undefined;
}

// ==================== 接口定义 ====================

/** 微信全局对象上的静态方法（最小声明） */
interface WxGlobal {
  getSystemInfoSync(): WxNativeSystemInfo;
  getStorageSync(key: string): unknown;
  setStorageSync(key: string, data: unknown): void;
  removeStorageSync(key: string): void;
  clearStorageSync(): void;
  login(opts: WxCallbackOpts<{ code: string }>): void;
  createRewardedVideoAd(opts: { adUnitId: string }): WxNativeRewardedVideoAd;
  getNetworkType(opts: WxCallbackOpts<WxNetworkType>): void;
  shareAppMessage(opts: WxShareParams): void;
  getBatteryInfoSync(): { level: number; isCharging: boolean };
}

interface WxCallbackOpts<T> {
  success?: (res: T) => void;
  fail?: (err: { errMsg: string }) => void;
  complete?: () => void;
}

interface WxNativeSystemInfo {
  platform: string;
  model: string;
  pixelRatio: number;
  screenWidth: number;
  screenHeight: number;
  windowWidth: number;
  windowHeight: number;
  language: string;
  version: string;
  system: string;
  brand: string;
  SDKVersion: string;
}

interface WxNativeRewardedVideoAd {
  show(): Promise<void>;
  load(): Promise<void>;
  destroy(): void;
  onClose(callback: (res: { isEnded: boolean }) => void): void;
  onError(callback: (err: { errMsg: string }) => void): void;
}

// ==================== 对外类型 ====================

/** 系统信息（标准化字段） */
export interface WxSystemInfo {
  /** 平台 'ios' | 'android' | 'windows' | 'mac' | 'devtools' */
  platform: string;
  /** 设备型号 */
  model: string;
  /** 像素比 */
  pixelRatio: number;
  /** 屏幕宽度（px） */
  screenWidth: number;
  /** 屏幕高度（px） */
  screenHeight: number;
  /** 可用窗口宽度（px） */
  windowWidth: number;
  /** 可用窗口高度（px） */
  windowHeight: number;
  /** 系统语言 */
  language: string;
  /** 微信版本号 */
  version: string;
  /** 操作系统 */
  system: string;
  /** 设备品牌 */
  brand: string;
  /** 微信 SDK 版本 */
  sdkVersion: string;
}

/** 登录取消 */
export interface WxLoginResult {
  code: string;
}

/** 激励视频广告包装 */
export interface WxRewardedVideoAd {
  show(): Promise<void>;
  load(): Promise<void>;
  destroy(): void;
  onClose(callback: (res: WxAdCloseResult) => void): void;
  onError(callback: (err: WxAdErrorResult) => void): void;
}

export interface WxAdCloseResult {
  isEnded: boolean;
}

export interface WxAdErrorResult {
  errMsg: string;
}

/** 分享参数 */
export interface WxShareParams {
  title: string;
  imageUrl?: string;
  query?: string;
}

/** 电量信息 */
export interface WxBatteryInfo {
  level: number;
  isCharging: boolean;
}

/** 网络类型 */
export type WxNetworkType = 'wifi' | '2g' | '3g' | '4g' | '5g' | 'unknown' | 'none';

/** 运行平台标识 */
export type RuntimePlatform = 'wx' | 'editor' | 'browser';

// ==================== 默认值 ====================

const DEFAULT_SYSTEM_INFO: WxSystemInfo = {
  platform: 'devtools',
  model: 'Editor',
  pixelRatio: 1,
  screenWidth: 750,
  screenHeight: 1334,
  windowWidth: 750,
  windowHeight: 1334,
  language: 'zh_CN',
  version: '0.0.0',
  system: 'Editor',
  brand: 'Editor',
  sdkVersion: '0.0.0',
};

// ==================== 平台封装 ====================

export class WxPlatform {

  // ==================== 单例 ====================

  private static instance: WxPlatform;

  static getInstance(): WxPlatform {
    if (!this.instance) this.instance = new WxPlatform();
    return this.instance;
  }

  private constructor() {}

  // ==================== 平台能力检测 ====================

  /** 是否微信小游戏环境 */
  isWechat(): boolean {
    return typeof wx !== 'undefined' && typeof wx.getSystemInfoSync === 'function';
  }

  /** 是否 PC 端（Windows / Mac） */
  isPC(): boolean {
    const p = this.getSystemInfo().platform;
    return p === 'windows' || p === 'mac';
  }

  /** 是否 iOS */
  isIOS(): boolean {
    return this.getSystemInfo().platform === 'ios';
  }

  /** 是否 Android */
  isAndroid(): boolean {
    return this.getSystemInfo().platform === 'android';
  }

  /** 获取运行时平台标识 */
  getPlatform(): RuntimePlatform {
    if (!this.isWechat()) {
      // 检测是否 Cocos 编辑器环境（通过 editor 对象是否存在）
      return typeof globalThis !== 'undefined' &&
        typeof (globalThis as Record<string, unknown>)['Editor'] !== 'undefined'
        ? 'editor'
        : 'browser';
    }
    return 'wx';
  }

  // ==================== 系统信息 ====================

  /**
   * 获取系统信息（同步）
   * 非微信环境返回默认值
   */
  getSystemInfo(): WxSystemInfo {
    if (!this.isWechat()) {
      return { ...DEFAULT_SYSTEM_INFO };
    }

    try {
      const raw = wx!.getSystemInfoSync();
      return {
        platform: raw.platform || '',
        model: raw.model || '',
        pixelRatio: raw.pixelRatio || 1,
        screenWidth: raw.screenWidth || 0,
        screenHeight: raw.screenHeight || 0,
        windowWidth: raw.windowWidth || 0,
        windowHeight: raw.windowHeight || 0,
        language: raw.language || '',
        version: raw.version || '',
        system: raw.system || '',
        brand: raw.brand || '',
        sdkVersion: raw.SDKVersion || '',
      };
    } catch (e) {
      console.error('[WxPlatform] getSystemInfo 异常', e);
      return { ...DEFAULT_SYSTEM_INFO };
    }
  }

  /** 获取微信 SDK 版本号 */
  getSDKVersion(): string {
    return this.getSystemInfo().sdkVersion;
  }

  /** 获取电量信息（同步，非微信返回默认值） */
  getBatteryInfoSync(): WxBatteryInfo {
    if (!this.isWechat()) {
      return { level: 100, isCharging: false };
    }

    try {
      const raw = wx!.getBatteryInfoSync();
      return {
        level: Math.round(raw.level * 100),
        isCharging: raw.isCharging,
      };
    } catch {
      return { level: 100, isCharging: false };
    }
  }

  // ==================== 本地存储 ====================

  /**
   * 同步写入本地存储
   * 非微信环境返回 false（由上层 LocalStorageAdapter 降级）
   */
  setStorageSync(key: string, data: unknown): boolean {
    if (!this.isWechat()) return false;

    try {
      wx!.setStorageSync(key, data);
      return true;
    } catch (e) {
      console.error(`[WxPlatform] setStorageSync 失败: ${key}`, e);
      return false;
    }
  }

  /** 同步读取本地存储，不存在时返回 null */
  getStorageSync(key: string): unknown {
    if (!this.isWechat()) return null;

    try {
      const raw = wx!.getStorageSync(key);
      if (raw === '' || raw === undefined) return null;
      return raw;
    } catch (e) {
      console.error(`[WxPlatform] getStorageSync 失败: ${key}`, e);
      return null;
    }
  }

  /** 同步删除本地存储 */
  removeStorageSync(key: string): boolean {
    if (!this.isWechat()) return false;

    try {
      wx!.removeStorageSync(key);
      return true;
    } catch (e) {
      console.error(`[WxPlatform] removeStorageSync 失败: ${key}`, e);
      return false;
    }
  }

  /** 清空全部本地存储 */
  clearStorageSync(): boolean {
    if (!this.isWechat()) return false;

    try {
      wx!.clearStorageSync();
      return true;
    } catch (e) {
      console.error('[WxPlatform] clearStorageSync 失败', e);
      return false;
    }
  }

  // ==================== 登录（P1 预留） ====================

  /**
   * 微信登录
   * 非微信环境返回 reject
   */
  login(): Promise<WxLoginResult> {
    return new Promise<WxLoginResult>((resolve, reject) => {
      if (!this.isWechat()) {
        reject(new Error('[WxPlatform] login: 非微信环境，无法登录'));
        return;
      }

      try {
        wx!.login({
          success: (res) => {
            if (res.code) {
              resolve({ code: res.code });
            } else {
              reject(new Error('[WxPlatform] login: 未获取到 code'));
            }
          },
          fail: (err) => {
            reject(new Error(`[WxPlatform] login 失败: ${err.errMsg}`));
          },
        });
      } catch (e) {
        reject(new Error(`[WxPlatform] login 异常: ${e}`));
      }
    });
  }

  // ==================== 激励视频广告（P1 预留） ====================

  /**
   * 创建激励视频广告实例
   * 非微信环境返回 null
   */
  createRewardedVideoAd(adUnitId: string): WxRewardedVideoAd | null {
    if (!this.isWechat()) {
      console.warn('[WxPlatform] createRewardedVideoAd: 非微信环境，返回 null');
      return null;
    }

    try {
      const nativeAd = wx!.createRewardedVideoAd({ adUnitId });

      // 包装为平台标准接口
      return {
        show: (): Promise<void> => nativeAd.show(),
        load: (): Promise<void> => nativeAd.load(),
        destroy: (): void => { nativeAd.destroy(); },
        onClose: (callback): void => { nativeAd.onClose(callback); },
        onError: (callback): void => { nativeAd.onError(callback); },
      };
    } catch (e) {
      console.error('[WxPlatform] createRewardedVideoAd 异常', e);
      return null;
    }
  }

  /**
   * 播放激励视频广告
   * 非微信环境返回 reject
   */
  showRewardedVideoAd(ad: WxRewardedVideoAd | null): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!ad) {
        reject(new Error('[WxPlatform] showRewardedVideoAd: ad 实例为空'));
        return;
      }

      ad.show().then(resolve).catch((err: WxAdErrorResult) => {
        reject(new Error(`[WxPlatform] 广告播放失败: ${err.errMsg}`));
      });
    });
  }

  // ==================== 分享（P2 预留） ====================

  /**
   * 分享消息
   * 非微信环境返回 reject
   */
  shareAppMessage(params: WxShareParams): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.isWechat()) {
        reject(new Error('[WxPlatform] shareAppMessage: 非微信环境，无法分享'));
        return;
      }

      try {
        wx!.shareAppMessage({
          title: params.title,
          imageUrl: params.imageUrl,
          query: params.query,
        });
        resolve();
      } catch (e) {
        reject(new Error(`[WxPlatform] shareAppMessage 异常: ${e}`));
      }
    });
  }

  // ==================== 网络状态（P1 预留） ====================

  /**
   * 获取网络类型
   * 非微信环境返回 'unknown'
   */
  getNetworkType(): Promise<WxNetworkType> {
    return new Promise<WxNetworkType>((resolve) => {
      if (!this.isWechat()) {
        resolve('unknown');
        return;
      }

      try {
        wx!.getNetworkType({
          success: (res) => { resolve(res as unknown as WxNetworkType); },
          fail: () => { resolve('unknown'); },
        });
      } catch {
        resolve('unknown');
      }
    });
  }

  // ==================== 云开发（V2 预留） ====================

  /**
   * 获取云开发实例
   * V2 阶段实现，当前返回 null
   */
  getCloud(): null {
    console.warn('[WxPlatform] getCloud: V2 阶段实现，当前返回 null');
    return null;
  }
}
