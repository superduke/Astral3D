import * as THREE from "three";

export type FactoryMaterialKey =
  | "industrialMetalPanelLight"
  | "industrialMetalPanelMid"
  | "industrialMetalPanelDark"
  | "darkConcretePlinth"
  | "architecturalConcrete"
  | "curtainWallBlueGrey"
  | "louverMetal"
  | "roofMembrane"
  | "galvanizedSteel"
  | "loadingDoor"
  | "equipmentPad"
  | "safetyYellow";

export interface FactoryPbrTextureSet {
  baseColor?: string;
  normal?: string;
  orm?: string;
  emissive?: string;
  format?: "image" | "ktx2";
}

export interface FactoryMaterialSpec {
  color: number;
  roughness: number;
  metalness: number;
  envMapIntensity?: number;
  textureSet?: FactoryPbrTextureSet;
}

/**
 * Shared PBR material vocabulary for generated factory architecture.
 *
 * Texture URLs are metadata by design. Astral3D's loader/renderer owns KTX2
 * transcoder setup; procedural generation stays synchronous and deterministic.
 */
export class FactoryMaterialLibrary {
  private readonly cache = new Map<FactoryMaterialKey, THREE.MeshStandardMaterial>();

  private readonly specs: Record<FactoryMaterialKey, FactoryMaterialSpec> = {
    industrialMetalPanelLight: { color: 0xdde4e8, roughness: 0.62, metalness: 0.12, envMapIntensity: 0.72 },
    industrialMetalPanelMid: { color: 0xaab7bf, roughness: 0.58, metalness: 0.18, envMapIntensity: 0.72 },
    industrialMetalPanelDark: { color: 0x66747d, roughness: 0.52, metalness: 0.24, envMapIntensity: 0.78 },
    darkConcretePlinth: { color: 0x4c555b, roughness: 0.94, metalness: 0, envMapIntensity: 0.36 },
    architecturalConcrete: { color: 0xb7bec1, roughness: 0.9, metalness: 0, envMapIntensity: 0.4 },
    curtainWallBlueGrey: { color: 0x496d80, roughness: 0.22, metalness: 0.16, envMapIntensity: 1 },
    louverMetal: { color: 0x59676f, roughness: 0.5, metalness: 0.38, envMapIntensity: 0.82 },
    roofMembrane: { color: 0x737d82, roughness: 0.9, metalness: 0.02, envMapIntensity: 0.4 },
    galvanizedSteel: { color: 0x9ea9ae, roughness: 0.43, metalness: 0.5, envMapIntensity: 0.92 },
    loadingDoor: { color: 0x49565e, roughness: 0.58, metalness: 0.3, envMapIntensity: 0.7 },
    equipmentPad: { color: 0x8b9091, roughness: 0.96, metalness: 0, envMapIntensity: 0.3 },
    safetyYellow: { color: 0xe0ad36, roughness: 0.58, metalness: 0.06, envMapIntensity: 0.5 },
  };

  get(key: FactoryMaterialKey): THREE.MeshStandardMaterial {
    const cached = this.cache.get(key);
    if (cached) return cached;
    const spec = this.specs[key];
    const material = new THREE.MeshStandardMaterial({
      color: spec.color,
      roughness: spec.roughness,
      metalness: spec.metalness,
      envMapIntensity: spec.envMapIntensity ?? 1,
    });
    material.name = `FACTORY_MAT_${key}`;
    material.userData = { factoryMaterialKey: key, pbrTextureSet: spec.textureSet };
    this.cache.set(key, material);
    return material;
  }

  describe(key: FactoryMaterialKey): Readonly<FactoryMaterialSpec> {
    return this.specs[key];
  }
}
