import * as THREE from "three";
import { Loader } from "@astral3d/engine";

/**
 * Loads production GLB assets through Astral3D's own Loader configuration so
 * DRACO, KTX2 and Meshopt support stay consistent with normal editor imports.
 */
export class GlbAssetLoader {
  private readonly loader = new Loader();
  private readonly cache = new Map<string, Promise<THREE.Object3D>>();

  load(url: string): Promise<THREE.Object3D> {
    const existing = this.cache.get(url);
    if (existing) return existing;

    const promise = this.loadUncached(url).catch((error) => {
      // A transient/CORS failure should not poison the cache forever.
      this.cache.delete(url);
      throw error;
    });
    this.cache.set(url, promise);
    return promise;
  }

  clear(url?: string): void {
    if (url) this.cache.delete(url);
    else this.cache.clear();
  }

  private async loadUncached(url: string): Promise<THREE.Object3D> {
    const gltfLoader = await this.loader.createGLTFLoader();
    try {
      const result = await gltfLoader.loadAsync(url);
      const scene = result.scene;
      scene.name = url.split("/").pop() || "factory-asset.glb";
      scene.animations.push(...result.animations);
      return scene;
    } finally {
      this.loader.disposeGLTFLoaderEffects(gltfLoader);
    }
  }
}
