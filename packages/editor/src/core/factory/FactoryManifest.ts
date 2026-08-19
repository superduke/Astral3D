import type { FactoryGlbAssetContract } from "./FactoryGlbAssetSpec";

export interface Point2 {
  x: number;
  y: number;
}

export type FactoryBuildingType =
  | "fab"
  | "utility"
  | "office"
  | "warehouse"
  | "support"
  | "building";

export type FactoryAssetTemplate =
  | "hvac"
  | "exhaust_stack"
  | "scrubber"
  | "cooling_tower"
  | "transformer"
  | "street_light"
  | "tree"
  | "gas_cabinet"
  | "emergency_shower"
  | string;

export type FactoryScale = number | [number, number, number];

export interface FactoryBuilding {
  id: string;
  label?: string;
  type?: FactoryBuildingType | string;
  footprint?: Point2[];
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  z: number;
  floors?: number;
  facade?: {
    template?: string;
    windowBand?: boolean;
    panelWidth?: number;
    panelJoints?: boolean;
    louverBands?: number;
    loadingBayCount?: number;
    canopy?: boolean;
  };
  roof?: {
    parapet?: boolean;
    hvacCount?: number;
    exhaustCount?: number;
    scrubberCount?: number;
  };
  userData?: Record<string, unknown>;
}

export interface FactoryRoad {
  id: string;
  points: Array<[number, number]>;
  width: number;
}

export interface FactoryParking {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
}

export interface FactoryPipeRack {
  id: string;
  label?: string;
  path: Array<[number, number]>;
  width?: number;
  height?: number;
  columnSpacing?: number;
  tiers?: number;
  pipeCount?: number;
  userData?: Record<string, unknown>;
}

export interface FactoryGate {
  id: string;
  label?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  /** Rotation around Three.js Y axis, in degrees. */
  rotationDeg?: number;
}

export interface FactoryCampusDetails {
  roadMarkings?: boolean;
  parkingSlots?: boolean;
  perimeterFence?: boolean;
  fenceHeight?: number;
  fencePostSpacing?: number;
  gates?: FactoryGate[];
}

export interface FactoryAssetPosition {
  id?: string;
  x: number;
  y: number;
  elevation?: number;
  rotationDeg?: number;
  scale?: FactoryScale;
}

export interface FactoryAssetGrid {
  origin: Point2;
  rows: number;
  columns: number;
  spacingX: number;
  spacingY: number;
  elevation?: number;
  rotationDeg?: number;
  scale?: FactoryScale;
}

export interface FactoryAssetLine {
  start: Point2;
  end: Point2;
  count: number;
  elevation?: number;
  rotationDeg?: number;
  alignToLine?: boolean;
  scale?: FactoryScale;
}

/** Legacy v0 field retained for existing manifests. Prefer glb.anchor in v0.1. */
export type FactoryAssetAnchor = "origin" | "center-base";

export interface FactoryAssetRegistryEntry {
  /** Stable semantic asset-library key, e.g. semiconductor.coolingTower.A */
  id: string;
  label?: string;

  /**
   * Optional production model. When absent or loading fails, the procedural
   * fallback remains visible.
   */
  source?: {
    type: "glb";
    url: string;
  };

  /** Procedural template used while the real asset is unavailable. */
  fallbackTemplate?: FactoryAssetTemplate;

  /**
   * Factory GLB Asset Specification v0.1. New assets should put source-unit,
   * axis, anchor, validation and instancing policy here.
   */
  glb?: FactoryGlbAssetContract;

  /**
   * Legacy transform fields. They remain supported so existing manifests do
   * not change behavior while assets migrate to the v0.1 contract.
   */
  defaultScale?: FactoryScale;
  rotationOffsetDeg?: number;
  elevationOffset?: number;
  anchor?: FactoryAssetAnchor;

  userData?: Record<string, unknown>;
}

export interface FactoryAssetBatch {
  id: string;
  label?: string;

  /**
   * Stable registry key for the high-fidelity model. If the registry entry has
   * no GLB source, `template`/registry fallback is rendered procedurally.
   */
  asset?: string;

  /** Backward-compatible procedural fallback template. */
  template?: FactoryAssetTemplate;

  positions?: FactoryAssetPosition[];
  grid?: FactoryAssetGrid;
  line?: FactoryAssetLine;
  userData?: Record<string, unknown>;
}

export interface FactoryManifest {
  meta?: {
    name?: string;
    version?: string;
    unit?: string;
    coordinateSystem?: string;
    accuracy?: string;
    disclaimer?: string;
  };
  siteBoundary?: Point2[];
  buildings?: FactoryBuilding[];
  roads?: FactoryRoad[];
  parking?: FactoryParking[];
  greenAreas?: Point2[][];
  pipeRacks?: FactoryPipeRack[];
  campus?: FactoryCampusDetails;

  /** Optional asset-library entries used to upgrade procedural batches to GLB. */
  assetRegistry?: FactoryAssetRegistryEntry[];
  assets?: FactoryAssetBatch[];
}
