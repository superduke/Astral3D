export const FACTORY_GLB_ASSET_SPEC_VERSION = "0.1" as const;

export type FactoryGlbAssetSpecVersion = typeof FACTORY_GLB_ASSET_SPEC_VERSION;

export type FactoryGlbUnit =
  | "meter"
  | "centimeter"
  | "millimeter"
  | "inch"
  | "foot";

export type FactoryGlbAxis =
  | "+X"
  | "-X"
  | "+Y"
  | "-Y"
  | "+Z"
  | "-Z";

export type FactoryGlbAnchor = "origin" | "center-base" | "custom";

export type FactoryGlbInstancingMode =
  | "auto"
  | "instanced"
  | "shared-clone";

export interface FactoryGlbCoordinateSpec {
  /** Source-file up direction. Canonical factory space is +Y up. */
  upAxis?: FactoryGlbAxis;

  /**
   * Source-file forward direction. Canonical factory forward is -Z, matching
   * Manifest +Y / North -> Three.js -Z.
   */
  forwardAxis?: FactoryGlbAxis;
}

export interface FactoryGlbInstancingSpec {
  /**
   * auto: use InstancedMesh when the loaded hierarchy is static/compatible,
   * otherwise use shared-resource clones.
   */
  mode?: FactoryGlbInstancingMode;
}

export interface FactoryGlbMaterialPolicy {
  /** Soft validation budget. Exceeding it reports a warning, not a load error. */
  maxMaterials?: number;

  /** Transparent materials can be undesirable for dense repeated equipment. */
  allowTransparent?: boolean;
}

export interface FactoryGlbValidationPolicy {
  /** Soft triangle budget for a single normalized source asset. */
  maxTriangles?: number;

  /** Reject a GLB whose normalized dimensions exceed this value in meters. */
  maxDimensionMeters?: number;
}

export interface FactoryGlbLodLevel {
  /** Maximum camera distance for this LOD. Last level may omit it. */
  maxDistance?: number;
  url: string;
}

export interface FactoryGlbLodSpec {
  levels: FactoryGlbLodLevel[];
}

/**
 * Factory GLB Asset Specification v0.1.
 *
 * Canonical runtime contract:
 * - right-handed Three.js coordinates
 * - +Y up
 * - -Z forward / Manifest north
 * - 1 runtime unit = 1 meter
 * - transforms are normalized before Manifest placement is applied
 */
export interface FactoryGlbAssetContract {
  specVersion?: FactoryGlbAssetSpecVersion;
  unit?: FactoryGlbUnit;
  coordinate?: FactoryGlbCoordinateSpec;
  anchor?: FactoryGlbAnchor;

  /**
   * Anchor point in canonical, meter-based coordinates after unit/axis
   * normalization and before defaultRotationDeg/defaultScale are applied.
   * Required when anchor === "custom".
   */
  customAnchor?: [number, number, number];

  /** Asset-level rotation in canonical XYZ axes, expressed in degrees. */
  defaultRotationDeg?: [number, number, number];

  instancing?: FactoryGlbInstancingSpec;
  materialPolicy?: FactoryGlbMaterialPolicy;
  validation?: FactoryGlbValidationPolicy;
  lod?: FactoryGlbLodSpec;
}
