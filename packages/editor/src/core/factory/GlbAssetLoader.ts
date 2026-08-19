import type * as THREE from "three";
import { Loader } from "@astral3d/engine";

interface LoadedGlb {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

/**
 * Loads Factory GLB assets through Astral3D's own loader stack so DRACO,
 * KTX2 and Meshopt behaviour stays identical to the editor/runtime. The
 * engine exports Loader as a singleton, not as a GLTFLoader constructor.
 */
export class GlbAssetLoader {
  private readonly cache = new Map<string, Promise<LoadedGlb>>();

  load(url: string): Promise<LoadedGlb> {
    const cached = this.cache.get(url);
    if (cached) return cached;

    const pending = this.loadInternal(url).catch((error) => {
      // Do not leave a rejected promise permanently cached. A later retry can
      // succeed after an asset is deployed/fixed while procedural fallback
      // continues to protect the current scene.
      this.cache.delete(url);
      throw error;
    });
    this.cache.set(url, pending);
    return pending;
  }

  private async loadInternal(url: string): Promise<LoadedGlb> {
    const loader = await Loader.createGLTFLoader();
    try {
      const gltf = await loader.loadAsync(url);
      return {
        scene: gltf.scene,
        animations: gltf.animations ?? [],
      };
    } finally {
      Loader.disposeGLTFLoaderEffects(loader);
    }
  }

  clear(url?: string): void {
    if (url) this.cache.delete(url);
    else this.cache.clear();
  }
}
