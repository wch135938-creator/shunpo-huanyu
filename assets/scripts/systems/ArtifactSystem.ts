// ============================================================
// ArtifactSystem — Phase7-Step7 神器系统
// 职责：管理神器解锁 / 等级提升 / 查询 / 校验
// 边界：逻辑层，不操作 UI、Canvas、Camera
// ============================================================

import { BaseSystem } from '../core/BaseSystem';
import type { ArtifactConfig, ArtifactState, ArtifactInventory } from '../data/artifact_types';
import { createDefaultArtifactInventory, VALID_ARTIFACT_RARITIES } from '../data/artifact_types';
import type { ValidationResult, ValidationIssue, ValidationSeverity } from '../save/SaveValidator';

/** 神器系统接口 */
export interface IArtifactSystem {
  /** 解锁神器 */
  unlockArtifact(artifactId: string, config: ArtifactConfig): ArtifactState | null;
  /** 提升神器等级 */
  levelUpArtifact(artifactId: string): ArtifactState | null;
  /** 激活神器 */
  activateArtifact(artifactId: string): boolean;
  /** 获取当前激活的神器 */
  getActiveArtifact(): ArtifactState | null;
  /** 获取所有神器 */
  getAllArtifacts(): ArtifactState[];
  /** 根据 ID 获取神器 */
  getArtifact(artifactId: string): ArtifactState | null;
  /** 校验神器状态 */
  validateArtifact(artifactId: string): ValidationResult;
  /** 校验神器配置 */
  validateArtifactConfigs(configs: ArtifactConfig[]): ValidationResult;
}

export class ArtifactSystem extends BaseSystem implements IArtifactSystem {
  // ==================== 内部状态 ====================

  /** 神器背包 */
  private _inventory: ArtifactInventory;

  // ==================== 构造 ====================

  constructor() {
    super();
    this._inventory = createDefaultArtifactInventory();
  }

  // ==================== 初始化 ====================

  /** 加载存档中的神器数据 */
  loadInventory(inventory: ArtifactInventory): void {
    if (!inventory || !Array.isArray(inventory.artifacts)) {
      this._inventory = createDefaultArtifactInventory();
      return;
    }
    this._inventory = {
      artifacts: [...inventory.artifacts],
      activeArtifactId: inventory.activeArtifactId ?? null,
    };
  }

  /** 导出存档数据 */
  getInventory(): ArtifactInventory {
    return {
      artifacts: this._inventory.artifacts.map((a) => ({ ...a })),
      activeArtifactId: this._inventory.activeArtifactId,
    };
  }

  // ==================== 神器管理 ====================

  /** 解锁新神器 */
  unlockArtifact(artifactId: string, config: ArtifactConfig): ArtifactState | null {
    if (!artifactId || !config) {
      console.error('[ArtifactSystem] unlockArtifact: artifactId 或 config 为空');
      return null;
    }

    // 检查是否已存在
    const existing = this._findArtifact(artifactId);
    if (existing) {
      console.warn(`[ArtifactSystem] 神器 ${artifactId} 已解锁，跳过`);
      return existing;
    }

    const state: ArtifactState = {
      artifactId,
      level: 1,
      obtainedAt: Date.now(),
    };

    this._inventory.artifacts.push(state);

    // 如果是第一个神器，自动激活
    if (this._inventory.artifacts.length === 1) {
      this._inventory.activeArtifactId = artifactId;
    }

    return { ...state };
  }

  /** 提升神器等级 */
  levelUpArtifact(artifactId: string): ArtifactState | null {
    const existing = this._findArtifact(artifactId);
    if (!existing) {
      console.error(`[ArtifactSystem] levelUpArtifact: 神器 ${artifactId} 不存在`);
      return null;
    }

    existing.level += 1;
    return { ...existing };
  }

  /** 激活指定神器 */
  activateArtifact(artifactId: string): boolean {
    const existing = this._findArtifact(artifactId);
    if (!existing) {
      console.error(`[ArtifactSystem] activateArtifact: 神器 ${artifactId} 不存在`);
      return false;
    }

    this._inventory.activeArtifactId = artifactId;
    return true;
  }

  /** 获取当前激活的神器 */
  getActiveArtifact(): ArtifactState | null {
    if (!this._inventory.activeArtifactId) return null;
    const existing = this._findArtifact(this._inventory.activeArtifactId);
    return existing ? { ...existing } : null;
  }

  /** 获取所有神器 */
  getAllArtifacts(): ArtifactState[] {
    return this._inventory.artifacts.map((a) => ({ ...a }));
  }

  /** 根据 ID 获取神器 */
  getArtifact(artifactId: string): ArtifactState | null {
    const existing = this._findArtifact(artifactId);
    return existing ? { ...existing } : null;
  }

  /** 获取神器数量 */
  getArtifactCount(): number {
    return this._inventory.artifacts.length;
  }

  // ==================== 校验 ====================

  /** 校验单个神器状态 */
  validateArtifact(artifactId: string): ValidationResult {
    const issues: ValidationIssue[] = [];
    const existing = this._findArtifact(artifactId);

    if (!existing) {
      issues.push(this._issue('artifact', 'error', `神器 ${artifactId} 不存在`));
      return this._result(issues);
    }

    if (!existing.artifactId || typeof existing.artifactId !== 'string') {
      issues.push(this._issue('artifact.artifactId', 'error', 'artifactId 无效'));
    }

    if (typeof existing.level !== 'number' || !Number.isFinite(existing.level) || existing.level < 1) {
      issues.push(this._issue('artifact.level', 'error', `level 无效: ${existing.level}`));
    } else if (existing.level > 1000) {
      issues.push(this._issue('artifact.level', 'warning', `level 异常偏高: ${existing.level}`));
    }

    if (typeof existing.obtainedAt !== 'number' || existing.obtainedAt <= 0) {
      issues.push(this._issue('artifact.obtainedAt', 'error', 'obtainedAt 无效'));
    }

    return this._result(issues);
  }

  /** 校验神器配置列表 */
  validateArtifactConfigs(configs: ArtifactConfig[]): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (!configs || configs.length === 0) {
      return this._result([]); // 空配置不报错
    }

    // ID 唯一性
    const idSet = new Set<string>();
    for (const config of configs) {
      if (idSet.has(config.id)) {
        issues.push(this._issue(`artifactConfig.${config.id}`, 'error', '神器配置 ID 重复'));
      }
      idSet.add(config.id);
    }

    // 逐条校验
    for (const config of configs) {
      const base = `artifactConfig.${config.id}`;

      // rarity 合法性
      if (!config.rarity || !VALID_ARTIFACT_RARITIES.includes(config.rarity)) {
        issues.push(this._issue(
          `${base}.rarity`,
          'error',
          `无效的稀有度: ${config.rarity}（有效值: ${VALID_ARTIFACT_RARITIES.join(', ')}）`,
        ));
      }

      // effectRefs 合法性
      if (!config.effectRefs || !Array.isArray(config.effectRefs) || config.effectRefs.length === 0) {
        issues.push(this._issue(`${base}.effectRefs`, 'warning', 'effectRefs 为空'));
      } else {
        for (const ref of config.effectRefs) {
          if (!ref || typeof ref !== 'string') {
            issues.push(this._issue(`${base}.effectRefs`, 'error', `无效的效果引用: ${ref}`));
          }
        }
      }

      // version 合法性
      if (typeof config.version !== 'number' || config.version < 1) {
        issues.push(this._issue(`${base}.version`, 'error', `version 无效: ${config.version}`));
      }

      // nameKey 合法性
      if (!config.nameKey || typeof config.nameKey !== 'string') {
        issues.push(this._issue(`${base}.nameKey`, 'warning', 'nameKey 缺失'));
      }
    }

    return this._result(issues);
  }

  // ==================== 内部辅助 ====================

  private _findArtifact(artifactId: string): ArtifactState | null {
    return this._inventory.artifacts.find((a) => a.artifactId === artifactId) ?? null;
  }

  private _issue(path: string, severity: ValidationSeverity, message: string): ValidationIssue {
    return { path, severity, message };
  }

  private _result(issues: ValidationIssue[]): ValidationResult {
    const errors = issues.filter((i) => i.severity === 'error');
    const warnings = issues.filter((i) => i.severity === 'warning');

    return {
      valid: errors.length === 0,
      issues,
      errorCount: errors.length,
      warningCount: warnings.length,
    };
  }
}
