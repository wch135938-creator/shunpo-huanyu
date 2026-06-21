// ============================================================
// LocalStorageAdapter — 微信本地存储适配器
// 职责：封装存储逻辑，通过 WxPlatform 访问微信 API，非微信环境降级
// 位置：Save 层
// 规范：
//   · 不直接调用 wx.* — 统一通过 WxPlatform
//   · 业务模块不直接引用本文件，统一通过 SaveManager 操作
// ============================================================

import { ISaveAdapter } from './ISaveAdapter';
import { SaveContainer } from './SaveContainer';
import { WxPlatform } from '../core/WxPlatform';

export class LocalStorageAdapter implements ISaveAdapter {

  // ==================== 降级存储（非微信环境）====================

  /** 编辑器 / 浏览器预览时的内存降级存储 */
  private static _fallbackMap: Map<string, string> = new Map();

  // ==================== 平台引用 ====================

  private get _platform(): WxPlatform {
    return WxPlatform.getInstance();
  }

  // ==================== ISaveAdapter 实现 ====================

  write(key: string, data: SaveContainer): boolean {
    try {
      const jsonStr = JSON.stringify(data);

      // 优先走微信存储，失败则降级到本地 Map
      if (this._platform.setStorageSync(key, jsonStr)) {
        return true;
      }

      LocalStorageAdapter._fallbackMap.set(key, jsonStr);
      return true;
    } catch (e) {
      console.error(`[LocalStorageAdapter] 写入失败: ${key}`, e);
      return false;
    }
  }

  read(key: string): SaveContainer | null {
    try {
      // 优先从微信存储读取
      let jsonStr: string | null = null;

      if (this._platform.isWechat()) {
        const raw = this._platform.getStorageSync(key);
        if (typeof raw === 'string') {
          jsonStr = raw;
        } else if (raw !== null && raw !== undefined) {
          // 微信有时直接返回对象，兼容处理
          return raw as SaveContainer;
        }
      }

      // 降级：从本地 Map 读取
      if (!jsonStr) {
        jsonStr = LocalStorageAdapter._fallbackMap.get(key) ?? null;
      }

      if (!jsonStr) return null;

      return JSON.parse(jsonStr) as SaveContainer;
    } catch (e) {
      console.error(`[LocalStorageAdapter] 读取失败: ${key}`, e);
      return null;
    }
  }

  delete(key: string): boolean {
    try {
      this._platform.removeStorageSync(key);
      LocalStorageAdapter._fallbackMap.delete(key);
      return true;
    } catch (e) {
      console.error(`[LocalStorageAdapter] 删除失败: ${key}`, e);
      return false;
    }
  }

  exists(key: string): boolean {
    try {
      if (this._platform.isWechat()) {
        const raw = this._platform.getStorageSync(key);
        if (raw !== null && raw !== undefined && raw !== '') {
          return true;
        }
      }
      return LocalStorageAdapter._fallbackMap.has(key);
    } catch {
      return false;
    }
  }
}
