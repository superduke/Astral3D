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

export interface FactoryAssetBatch {
  id: string;
  label?: string;
  template: FactoryAssetTemplate;
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
  assets?: FactoryAssetBatch[];
}
