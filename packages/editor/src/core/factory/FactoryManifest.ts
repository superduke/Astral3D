export interface Point2 {
  x: number;
  y: number;
}

export type FactoryBuildingType = "fab" | "utility" | "office" | "warehouse" | "support" | "building";

export interface FactoryBuilding {
  id: string;
  label?: string;
  type?: FactoryBuildingType | string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  floors?: number;
  facade?: {
    template?: string;
    windowBand?: boolean;
    panelWidth?: number;
  };
  roof?: {
    parapet?: boolean;
    hvacCount?: number;
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
}
