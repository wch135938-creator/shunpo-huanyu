// ============================================================
// Phase9Bootstrap — Phase9 系统统一初始化编排器
// 职责：初始化 / 恢复 / 保存 所有 Phase9 系统
// 镜像 Phase8Bootstrap 模式，不操作 UI / Canvas / Camera
//
// 初始化顺序：
//   1. HeroSystem          — 英雄管理（最底层依赖）
//   2. SkillSystem         — 技能管理
//   3. FormationSystem     — 阵容管理（依赖 Hero + Skill）
//   4. ChapterSystem       — 章节管理
//   5. TutorialSystem      — 新手引导
//   6. AnalyticsSystem     — 本地埋点
//   7. BattleFXManager     — 战斗表现层
//   8. BattleManager       — 战斗管理入口
//
// Save/Restore 流程：
//   restoreFromSave():
//     SaveManager.loadHeroData()      → HeroSystem.restore()
//     SaveManager.loadSkillData()     → SkillSystem.restore()
//     SaveManager.loadFormationData() → FormationSystem.restore()
//     SaveManager.loadChapterData()   → ChapterSystem.restore()
//     (TutorialSystem 自行从 SaveManager 恢复)
//     SaveManager.loadAnalyticsData() → AnalyticsSystem.restore()
//
//   saveAll():
//     HeroSystem.save()      → SaveManager.saveHeroData()
//     SkillSystem.save()     → SaveManager.saveSkillData()
//     FormationSystem.save() → SaveManager.saveFormationData()
//     ChapterSystem.save()   → SaveManager.saveChapterData()
//     (TutorialSystem 自行保存到 SaveManager)
//     AnalyticsSystem 通过 registerSaveCallback 在需要时触发落盘
// ============================================================

import { BaseManager } from '../core/BaseManager';
import { EventManager } from '../core/EventManager';
import { SaveManager } from '../save/SaveManager';
import { HeroSystem } from '../hero/HeroSystem';
import { SkillSystem } from '../skill/SkillSystem';
import { FormationSystem } from '../formation/FormationSystem';
import { ChapterSystem } from '../chapter/ChapterSystem';
import { TutorialSystem } from '../tutorial/TutorialSystem';
import { AnalyticsSystem } from '../analytics/AnalyticsSystem';
import { BattleFXManager } from '../battlefx/BattleFXManager';
import { BattleManager } from '../managers/BattleManager';

// ==================== 事件常量 ====================

export const Phase9Event = {
  /** Phase9 所有系统初始化完成 */
  BOOTSTRAP_READY: 'phase9:bootstrapReady',
  /** Phase9 初始化失败 */
  BOOTSTRAP_FAILED: 'phase9:bootstrapFailed',
  /** Phase9 存档恢复完成 */
  RESTORE_COMPLETE: 'phase9:restoreComplete',
  /** Phase9 存档保存完成 */
  SAVE_COMPLETE: 'phase9:saveComplete',
} as const;

// ==================== 事件载荷接口 ====================

export interface Phase9BootstrapReadyEvent {
  systemCount: number;
  systems: string[];
}

export interface Phase9BootstrapFailedEvent {
  error: string;
  system: string;
}

export interface Phase9RestoreCompleteEvent {
  restoredSystems: string[];
}

export class Phase9Bootstrap extends BaseManager {

  // ===== 单例 =====

  static getInstance(): Phase9Bootstrap {
    return super.getInstance<Phase9Bootstrap>();
  }

  // ===== 依赖 =====

  private _eventManager: EventManager;
  private _saveManager: SaveManager;
  private _heroSystem: HeroSystem;
  private _skillSystem: SkillSystem;
  private _formationSystem: FormationSystem;
  private _chapterSystem: ChapterSystem;
  private _tutorialSystem: TutorialSystem;
  private _analyticsSystem: AnalyticsSystem;
  private _battleFXManager: BattleFXManager;
  private _battleManager: BattleManager;

  // ===== 内部状态 =====

  private _ready = false;
  private _restored = false;
  private _saveCallbackRegistered = false;
  /** R3-R1: 本次启动是否执行了章节迁移且产生了数据变更（需强制落盘） */
  private _chapterMigrationChanged = false;

  // ===== 构造 =====

  constructor() {
    super();
    this._eventManager = EventManager.getInstance();
    this._saveManager = SaveManager.getInstance();
    this._heroSystem = HeroSystem.getInstance();
    this._skillSystem = SkillSystem.getInstance();
    this._formationSystem = FormationSystem.getInstance();
    this._chapterSystem = ChapterSystem.getInstance();
    this._tutorialSystem = TutorialSystem.getInstance();
    this._analyticsSystem = AnalyticsSystem.getInstance();
    this._battleFXManager = BattleFXManager.getInstance();
    this._battleManager = BattleManager.getInstance();
  }

  // ================================================================
  // 初始化
  // ================================================================

  /**
   * 异步初始化所有 Phase9 系统。
   *
   * 调用时机：游戏启动时，在 Phase8Bootstrap 完成后调用。
   * 可重复调用（幂等）— 已 ready 时直接返回。
   *
   * 初始化顺序严格遵循依赖关系：
   *   Hero → Skill → Formation → Chapter → Tutorial → Analytics → BattleFX → Battle
   */
  async initialize(): Promise<void> {
    if (this._ready) {
      console.warn('[Phase9Bootstrap] 已初始化，跳过重复 initialize');
      return;
    }

    console.log('[Phase9Bootstrap] INIT');

    const initializedSystems: string[] = [];

    try {
      // 1. HeroSystem（最底层，其他系统可能依赖）
      await this._heroSystem.initialize();
      initializedSystems.push('HeroSystem');
      console.log('[Phase9Bootstrap] ✅ HeroSystem 初始化完成');

      // 2. SkillSystem
      await this._skillSystem.initialize();
      initializedSystems.push('SkillSystem');
      console.log('[Phase9Bootstrap] ✅ SkillSystem 初始化完成');

      // 3. FormationSystem（依赖 Hero + Skill）
      await this._formationSystem.initialize();
      initializedSystems.push('FormationSystem');
      console.log('[Phase9Bootstrap] ✅ FormationSystem 初始化完成');

      // 4. ChapterSystem
      await this._chapterSystem.initialize();
      initializedSystems.push('ChapterSystem');
      console.log('[Phase9Bootstrap] ✅ ChapterSystem 初始化完成');

      // 5. TutorialSystem（内部自行从 SaveManager 恢复）
      await this._tutorialSystem.initialize(false);
      initializedSystems.push('TutorialSystem');
      console.log('[Phase9Bootstrap] ✅ TutorialSystem 初始化完成');

      // 6. AnalyticsSystem
      this._analyticsSystem.initialize();
      initializedSystems.push('AnalyticsSystem');
      console.log('[Phase9Bootstrap] ✅ AnalyticsSystem 初始化完成');

      // 7. BattleFXManager
      this._battleFXManager.init();
      initializedSystems.push('BattleFXManager');
      console.log('[Phase9Bootstrap] ✅ BattleFXManager 初始化完成');

      // 8. BattleManager（加载战斗配置）
      await this._battleManager.initialize();
      initializedSystems.push('BattleManager');
      console.log('[Phase9Bootstrap] ✅ BattleManager 初始化完成');

      this._ready = true;

      this._eventManager.emit(Phase9Event.BOOTSTRAP_READY, {
        systemCount: initializedSystems.length,
        systems: initializedSystems,
      } satisfies Phase9BootstrapReadyEvent);

      console.log(
        `[Phase9Bootstrap] 全部初始化完成，共 ${initializedSystems.length} 个系统: ` +
        initializedSystems.join(', '),
      );
    } catch (err) {
      const lastSystem = initializedSystems.length > 0
        ? initializedSystems[initializedSystems.length - 1]
        : 'unknown';

      console.error(
        `[Phase9Bootstrap] 初始化失败 (system=${lastSystem}):`,
        err,
      );

      this._eventManager.emit(Phase9Event.BOOTSTRAP_FAILED, {
        error: String(err),
        system: lastSystem,
      } satisfies Phase9BootstrapFailedEvent);

      throw err;
    }
  }

  // ================================================================
  // 存档恢复
  // ================================================================

  /**
   * 从 SaveManager 恢复所有 Phase9 系统数据。
   *
   * 调用时机：initialize() 完成后。
   * 如果 SaveManager 中无 Phase9 数据，各系统使用默认状态。
   *
   * @returns 恢复的系统列表
   */
  restoreFromSave(): string[] {
    const restored: string[] = [];

    try {
      // 1. HeroSystem
      const heroData = this._saveManager.loadHeroData();
      if (heroData && Object.keys(heroData.heroStates).length > 0) {
        this._heroSystem.restore(heroData);
        restored.push('HeroSystem');
        console.log('[Phase9Bootstrap] 📥 HeroSystem 从存档恢复');
      } else {
        console.log('[Phase9Bootstrap] 📥 HeroSystem 无存档数据，使用默认状态');
      }

      // 2. SkillSystem
      const skillData = this._saveManager.loadSkillData();
      if (skillData && (
        Object.keys(skillData.skillStates).length > 0 ||
        Object.keys(skillData.heroSkillLoadouts).length > 0
      )) {
        this._skillSystem.restore(skillData);
        restored.push('SkillSystem');
        console.log('[Phase9Bootstrap] 📥 SkillSystem 从存档恢复');
      } else {
        console.log('[Phase9Bootstrap] 📥 SkillSystem 无存档数据，使用默认状态');
      }

      // 3. FormationSystem
      const formationData = this._saveManager.loadFormationData();
      if (formationData && Object.keys(formationData.presets).length > 0) {
        this._formationSystem.restore(formationData);
        restored.push('FormationSystem');
        console.log('[Phase9Bootstrap] 📥 FormationSystem 从存档恢复');
      } else {
        // ★ 无存档数据时也调用 restore(null) 触发自动回填
        this._formationSystem.restore(null as unknown as import('../save/FormationSaveData').FormationSaveData);
        console.log('[Phase9Bootstrap] 📥 FormationSystem 无存档数据，自动填充默认阵容');
      }

      // 4. ChapterSystem
      const chapterData = this._saveManager.loadChapterData();
      if (chapterData && Object.keys(chapterData.chapterProgress).length > 0) {
        this._chapterSystem.restore(chapterData);
        restored.push('ChapterSystem');
        console.log('[Phase9Bootstrap] 📥 ChapterSystem 从存档恢复');

        // R3-R1: 六关制→十关制旧存档迁移
        // 在 restore() 之后、任何后续解锁重判之前执行
        const configFingerprint = this._chapterSystem.getConfigFingerprint();
        const migrationChanged = this._chapterSystem.normalizeProgress(configFingerprint);
        if (migrationChanged) {
          // 迁移结果立即写入 SaveManager 内存
          const updatedChapterData = this._chapterSystem.save();
          this._saveManager.saveChapterData(updatedChapterData);
          this._chapterMigrationChanged = true;
          console.log('[Phase9Bootstrap] 🔄 旧存档章节进度已迁移至十关制');
        }
      } else {
        console.log('[Phase9Bootstrap] 📥 ChapterSystem 无存档数据，使用默认状态');
      }

      // 5. TutorialSystem（内部自行从 SaveManager 恢复，已在 initialize 时完成）

      // 6. AnalyticsSystem
      const analyticsData = this._saveManager.loadAnalyticsData();
      if (analyticsData && analyticsData.totalSessions > 0) {
        this._analyticsSystem.restore(analyticsData);
        restored.push('AnalyticsSystem');
        console.log('[Phase9Bootstrap] 📥 AnalyticsSystem 从存档恢复');
      } else {
        console.log('[Phase9Bootstrap] 📥 AnalyticsSystem 无存档数据，使用默认状态');
      }

      // 注册 Analytics 保存回调
      this._registerAnalyticsSaveCallback();

      // R3-R1: 章节迁移变更后强制落盘
      // 确保即使玩家无后续操作（不战斗/不切换页面/不触发保存）也能持久化
      if (this._chapterMigrationChanged) {
        const saved = this._saveManager.save();
        if (saved) {
          console.log('[Phase9Bootstrap] 💾 迁移后的章节进度已持久化落盘');
        } else {
          console.error('[Phase9Bootstrap] ⚠️ 迁移后的章节进度落盘失败，将在下次自动保存时重试');
        }
      }

      this._restored = true;

      this._eventManager.emit(Phase9Event.RESTORE_COMPLETE, {
        restoredSystems: restored,
      } satisfies Phase9RestoreCompleteEvent);

      console.log(
        `[Phase9Bootstrap] 存档恢复完成，恢复 ${restored.length} 个系统: ` +
        (restored.length > 0 ? restored.join(', ') : '(无)'),
      );
    } catch (err) {
      console.error('[Phase9Bootstrap] 存档恢复失败:', err);
    }

    return restored;
  }

  // ================================================================
  // 存档保存
  // ================================================================

  /**
   * 收集所有 Phase9 系统数据并写入 SaveManager。
   *
   * 调用时机：
   *   - 定期自动保存（由 SaveManager 触发）
   *   - 手动保存
   *   - 游戏退出 / 切后台
   *
   * 注意：TutorialSystem 内部自行写入 SaveManager，此处不重复保存。
   */
  saveAll(): void {
    if (!this._ready) {
      console.warn('[Phase9Bootstrap] saveAll: 尚未初始化，跳过保存');
      return;
    }

    try {
      // HeroSystem
      const heroSaveData = this._heroSystem.save();
      this._saveManager.saveHeroData(heroSaveData);

      // SkillSystem
      const skillSaveData = this._skillSystem.save();
      this._saveManager.saveSkillData(skillSaveData);

      // FormationSystem
      const formationSaveData = this._formationSystem.save();
      this._saveManager.saveFormationData(formationSaveData);

      // ChapterSystem
      const chapterSaveData = this._chapterSystem.save();
      this._saveManager.saveChapterData(chapterSaveData);

      // TutorialSystem — 内部自行处理（调用 save() 触发内部 _save）
      this._tutorialSystem.save();

      // AnalyticsSystem — 通过 registerSaveCallback 异步落盘
      // 此处强制同步一次
      this._syncAnalyticsSave();

      this._eventManager.emit(Phase9Event.SAVE_COMPLETE, {});

      console.log('[Phase9Bootstrap] 💾 所有 Phase9 数据已保存');
    } catch (err) {
      console.error('[Phase9Bootstrap] saveAll 失败:', err);
    }
  }

  // ================================================================
  // Analytics 保存回调注册
  // ================================================================

  /**
   * 注册 AnalyticsSystem 的保存回调到 SaveManager。
   *
   * 当 AnalyticsSystem 需要落盘时（如会话结束、缓存满），
   * 通过此回调将数据写入 SaveManager 并标记脏。
   */
  private _registerAnalyticsSaveCallback(): void {
    if (this._saveCallbackRegistered) return;

    this._analyticsSystem.registerSaveCallback(() => {
      this._syncAnalyticsSave();
      this._saveManager.markDirty();
    });

    this._saveCallbackRegistered = true;
    console.log('[Phase9Bootstrap] 🔗 AnalyticsSystem 保存回调已注册');
  }

  /**
   * 同步 AnalyticsSystem 数据到 SaveManager。
   */
  private _syncAnalyticsSave(): void {
    const analyticsData = this._analyticsSystem.getSaveData();
    this._saveManager.saveAnalyticsData(analyticsData);
  }

  // ================================================================
  // 销毁
  // ================================================================

  /**
   * 销毁所有 Phase9 系统。
   *
   * 调用时机：游戏退出 / 场景卸载时。
   * 流程：
   *   1. 保存所有数据
   *   2. AnalyticsSystem.destroy()（结束会话、清理监听）
   *   3. BattleFXManager.cleanup()
   */
  destroy(): void {
    if (!this._ready) return;

    console.log('[Phase9Bootstrap] DESTROY');

    // 1. 最终保存
    this.saveAll();
    this._saveManager.save(); // 强制落盘

    // 2. AnalyticsSystem 销毁（发射 GAME_EXIT、结束会话、清理监听）
    this._analyticsSystem.destroy();

    // 3. BattleFXManager 清理
    this._battleFXManager.cleanup();

    this._ready = false;
    this._restored = false;
    this._saveCallbackRegistered = false;

    console.log('[Phase9Bootstrap] 已销毁');
  }

  // ================================================================
  // 状态查询
  // ================================================================

  /** 是否已完成初始化 */
  isReady(): boolean {
    return this._ready;
  }

  /** 是否已从存档恢复 */
  isRestored(): boolean {
    return this._restored;
  }

  // ================================================================
  // 系统引用（供外部获取）
  // ================================================================

  getHeroSystem(): HeroSystem {
    return this._heroSystem;
  }

  getSkillSystem(): SkillSystem {
    return this._skillSystem;
  }

  getFormationSystem(): FormationSystem {
    return this._formationSystem;
  }

  getChapterSystem(): ChapterSystem {
    return this._chapterSystem;
  }

  getTutorialSystem(): TutorialSystem {
    return this._tutorialSystem;
  }

  getAnalyticsSystem(): AnalyticsSystem {
    return this._analyticsSystem;
  }

  getBattleFXManager(): BattleFXManager {
    return this._battleFXManager;
  }

  getBattleManager(): BattleManager {
    return this._battleManager;
  }
}
