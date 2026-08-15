import * as THREE from "three";
import type { FactoryAssetRegistryEntry } from "./FactoryManifest";
import { FactoryGlbAssetNormalizer } from "./FactoryGlbAssetNormalizer";
import {
  FactoryGlbAssetValidator,
  type FactoryGlbValidationResult,
} from "./FactoryGlbAssetValidator";
import { GlbAssetLoader } from "./GlbAssetLoader";

export interface FactoryGlbTemplate {
  object: THREE.Group;
  validation: FactoryGlbValidationResult;
}

/**
 * Caches the normalized/validated template, not only the raw URL load. This
 * prevents repeated bounds scans, axis correction and anchor computation when
 * multiple batches reference the same registry asset.
 */
export class FactoryGlbTemplateCache {
  private readonly loader = new GlbAssetLoader();
  private readonly normalizer = new FactoryGlbAssetNormalizer();
  private readonly validator = new FactoryGlbAssetValidator();
  private readonly cache = new Map<string, Promise<FactoryGlbTemplate>>();

  get(entry: FactoryAssetRegistryEntry): Promise<FactoryGlbTemplate> {
    if (!entry.source?.url) {
      return Promise.reject(
        new Error(`Registry asset has no GLB URL: ${entry.id}`),
      );
    }

    const key = this.key(entry);
    const existing = this.cache.get(key);
    if (existing) return existing;

    const promise = this.prepare(entry).catch((error) => {
      this.cache.delete(key);
      throw error;
    });
    this.cache.set(key, promise);
    return promise;
  }

  clear(): void {
    this.cache.clear();
    this.loader.clear();
  }

  private async prepare(
    entry: FactoryAssetRegistryEntry,
  ): Promise<FactoryGlbTemplate> {
    const source = await this.loader.load(entry.source!.url);
    const object = this.normalizer.normalize(source, entry);
    const validation = this.validator.validate(object, entry);

    for (const warning of validation.warnings) {
      console.warn(`[FactoryGLB:${entry.id}] ${warning}`);
    }
    if (!validation.valid) {
      throw new Error(validation.errors.join(" "));
    }

    object.userData.glbValidation = {
      triangles: validation.stats.triangles,
      materials: validation.stats.materials,
      dimensions: validation.stats.dimensions,
      instancingCompatible: validation.instancingCompatible,
    };
    return { object, validation };
  }

  private key(entry: FactoryAssetRegistryEntry): string {
    return JSON.stringify({
      id: entry.id,
      url: entry.source?.url,
      glb: entry.glb,
      defaultScale: entry.defaultScale,
      rotationOffsetDeg: entry.rotationOffsetDeg,
      anchor: entry.anchor,
    });
  }
}
