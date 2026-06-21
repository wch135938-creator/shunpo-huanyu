// ============================================================
// ISaveAdapter — 存储适配器接口
// 职责：定义读写接口，隔绝底层存储实现
// 位置：Save 层
// ============================================================

import { SaveContainer } from './SaveContainer';

export interface ISaveAdapter {
  /** 写入存档，返回是否成功 */
  write(key: string, data: SaveContainer): boolean;

  /** 读取存档，不存在时返回 null */
  read(key: string): SaveContainer | null;

  /** 删除存档 */
  delete(key: string): boolean;

  /** 检查存档是否存在 */
  exists(key: string): boolean;
}
