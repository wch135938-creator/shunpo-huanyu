// ============================================================
// GrowthSaveData — Phase4A 成长存档数据结构 / Phase7-Step5 多轨成长
// 职责：持久化角色成长主数据与账号成长汇总缓存
//        Phase7-Step5: 新增 heroProgressV2List 可选字段
// 位置：Save 层
// ============================================================

import type { HeroProgressData } from '../data/hero_progress_data';
import type { PlayerProgressData } from '../data/player_progress_data';
import type { HeroProgressStateV2 } from '../data/roguelike_types';

export interface GrowthSaveData {
  /** 账号成长、最高关卡、总战力缓存数据 */
  playerProgress: PlayerProgressData;
  /** 角色成长主数据列表（V1） */
  heroProgressList: HeroProgressData[];
  /** Phase7-Step5: 英雄多轨成长状态列表（V2，optional 兼容旧存档） */
  heroProgressV2List?: HeroProgressStateV2[];
}

