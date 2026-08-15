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

  /**
   * Preferred representation for CAD/DXF-derived buildings.
   * Coordinates are site-plan coordinates in meters.
   */
  footprint?: Point2[];

  /**
   * Backward-compatible rectangular representation.
   * Used only when `footprint` is absent.
   */
  x?: number;
  y?: number;
  w?: number;
  h?: number;

  /** Building height in meters. */
  z: number;
  floors?: number;

  facade?: {
    template?: string;
    windowBand?: boolean;
    panelWidth?: number;
    /** Vertical facade seam modules; enabled by default for FAB. */
    panelJoints?: boolean;
    /** Number of louver bands; Utility defaults to 2. */
    louverBands?: number;
    /** Auto-place loading doors on the longest facade edge. */
    loadingBayCount?: number;
    /** Whether loading bays receive a projecting canopy. */
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
  /** Site-plan route in meters. */
  path: Array<[number, number]>;
  width?: number;
  height?: number;
  /** Spacing between structural frames. */
  columnSpacing?: number;
  /** Number of horizontal structural tiers. */
  tiers?: number;
  /** Number of simplified process/utility pipes on the top tier. */
  pipeCount?: number;
  userData?: Record<string, unknown>;
}

export interface FactoryAssetPosition {
  id?: string;
  x: number;
  y: number;
  /** Vertical offset above site ground, in meters. */
  elevation?: number;
  /** Rotation around Three.js Y axis, in degrees. */
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
  assets?: FactoryAssetBatch[];
}
