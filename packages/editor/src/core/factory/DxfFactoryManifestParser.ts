import { DxfParser } from "@astral3d/engine";
import type {
  FactoryBuilding,
  FactoryManifest,
  FactoryParking,
  FactoryPipeRack,
  FactoryRoad,
  Point2,
} from "./FactoryManifest";

export interface DxfFactoryManifestParserOptions {
  name?: string;
  defaultBuildingHeight?: number;
  defaultRoadWidth?: number;
  defaultPipeRackWidth?: number;
  defaultPipeRackHeight?: number;
  layerMap?: Partial<{
    siteBoundary: string;
    buildingFootprint: string;
    roadCenterline: string;
    pipeRackCenterline: string;
    parking: string;
    green: string;
  }>;
}

interface DxfPointLike {
  x: number;
  y: number;
  z?: number;
}

interface DxfEntityLike {
  type?: string;
  layer?: string;
  shape?: boolean;
  width?: number;
  vertices?: DxfPointLike[];
  text?: string;
  startPoint?: DxfPointLike;
  endPoint?: DxfPointLike;
}

interface DxfTextLabel {
  text: string;
  position: Point2;
}

const DEFAULT_LAYER_MAP = {
  siteBoundary: "SITE_BOUNDARY",
  buildingFootprint: "BUILDING_FOOTPRINT",
  roadCenterline: "ROAD_CENTERLINE",
  pipeRackCenterline: "PIPE_RACK_CENTERLINE",
  parking: "PARKING",
  green: "GREEN",
};

export class DxfFactoryManifestParser {
  private readonly options: Required<
    Omit<DxfFactoryManifestParserOptions, "layerMap">
  > & {
    layerMap: typeof DEFAULT_LAYER_MAP;
  };

  constructor(options: DxfFactoryManifestParserOptions = {}) {
    this.options = {
      name: options.name ?? "DXF Factory Site",
      defaultBuildingHeight: options.defaultBuildingHeight ?? 18,
      defaultRoadWidth: options.defaultRoadWidth ?? 12,
      defaultPipeRackWidth: options.defaultPipeRackWidth ?? 6,
      defaultPipeRackHeight: options.defaultPipeRackHeight ?? 6.5,
      layerMap: {
        ...DEFAULT_LAYER_MAP,
        ...(options.layerMap ?? {}),
      },
    };
  }

  parse(source: string): FactoryManifest {
    const parser = new DxfParser();
    const dxf = parser.parseSync(source) as { entities?: DxfEntityLike[] } | null;
    if (!dxf?.entities?.length) {
      throw new Error("DXF contains no parseable ENTITIES section.");
    }

    const siteBoundaries: Point2[][] = [];
    const buildings: FactoryBuilding[] = [];
    const roads: FactoryRoad[] = [];
    const pipeRacks: FactoryPipeRack[] = [];
    const parking: FactoryParking[] = [];
    const greenAreas: Point2[][] = [];
    const textLabels: DxfTextLabel[] = [];

    let buildingIndex = 0;
    let roadIndex = 0;
    let pipeRackIndex = 0;
    let parkingIndex = 0;

    for (const entity of dxf.entities) {
      if (entity.type === "TEXT" && entity.text?.trim()) {
        const position = entity.startPoint ?? entity.endPoint;
        if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) {
          textLabels.push({
            text: entity.text.trim(),
            position: { x: position.x, y: position.y },
          });
        }
        continue;
      }

      const layer = (entity.layer ?? "").toUpperCase();
      const points = this.entityPoints(entity);
      if (points.length < 2) continue;

      if (layer === this.options.layerMap.siteBoundary.toUpperCase()) {
        if (points.length >= 3) siteBoundaries.push(this.removeClosingDuplicate(points));
        continue;
      }

      if (layer === this.options.layerMap.buildingFootprint.toUpperCase()) {
        if (points.length < 3) continue;
        buildingIndex++;
        buildings.push({
          id: `BLDG_${String(buildingIndex).padStart(3, "0")}`,
          label: `Building ${buildingIndex}`,
          type: "building",
          footprint: this.removeClosingDuplicate(points),
          z: this.options.defaultBuildingHeight,
          roof: { parapet: true },
        });
        continue;
      }

      if (layer === this.options.layerMap.roadCenterline.toUpperCase()) {
        roadIndex++;
        roads.push({
          id: `ROAD_${String(roadIndex).padStart(3, "0")}`,
          points: points.map((point) => [point.x, point.y] as [number, number]),
          width:
            Number.isFinite(entity.width) && (entity.width ?? 0) > 0
              ? entity.width!
              : this.options.defaultRoadWidth,
        });
        continue;
      }

      if (layer === this.options.layerMap.pipeRackCenterline.toUpperCase()) {
        pipeRackIndex++;
        pipeRacks.push({
          id: `PIPE_RACK_${String(pipeRackIndex).padStart(3, "0")}`,
          label: `Pipe Rack ${pipeRackIndex}`,
          path: points.map((point) => [point.x, point.y] as [number, number]),
          width: this.options.defaultPipeRackWidth,
          height: this.options.defaultPipeRackHeight,
          columnSpacing: 8,
          tiers: 2,
          pipeCount: 6,
        });
        continue;
      }

      if (layer === this.options.layerMap.parking.toUpperCase()) {
        if (points.length < 3) continue;
        parkingIndex++;
        parking.push(
          this.polygonToParking(
            this.removeClosingDuplicate(points),
            `PARK_${String(parkingIndex).padStart(3, "0")}`,
          ),
        );
        continue;
      }

      if (layer === this.options.layerMap.green.toUpperCase()) {
        if (points.length >= 3) greenAreas.push(this.removeClosingDuplicate(points));
      }
    }

    this.applyBuildingLabels(buildings, textLabels);
    const siteBoundary = this.pickLargestPolygon(siteBoundaries);

    return {
      meta: {
        name: this.options.name,
        version: "dxf-import-0.3",
        unit: "meter",
        coordinateSystem: "LOCAL_CARTESIAN_NORTH_UP",
        accuracy: "derived from DXF entities",
      },
      siteBoundary,
      buildings,
      roads,
      parking,
      greenAreas,
      pipeRacks,
    };
  }

  private entityPoints(entity: DxfEntityLike): Point2[] {
    if (
      entity.type !== "LWPOLYLINE" &&
      entity.type !== "POLYLINE" &&
      entity.type !== "LINE"
    ) {
      return [];
    }

    return (entity.vertices ?? [])
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
      .map((point) => ({ x: point.x, y: point.y }));
  }

  private applyBuildingLabels(
    buildings: FactoryBuilding[],
    labels: DxfTextLabel[],
  ): void {
    const usedIds = new Set<string>();

    buildings.forEach((building, index) => {
      const polygon = building.footprint ?? [];
      const label = labels.find((item) => this.pointInPolygon(item.position, polygon));
      if (!label) {
        usedIds.add(building.id);
        return;
      }

      const type = this.inferBuildingType(label.text);
      let id = this.toAssetId(label.text) || `BLDG_${String(index + 1).padStart(3, "0")}`;
      if (usedIds.has(id)) {
        id = `${id}_${String(index + 1).padStart(2, "0")}`;
      }
      usedIds.add(id);

      building.id = id;
      building.label = label.text;
      building.type = type;
      building.facade = {
        ...(building.facade ?? {}),
        windowBand: type === "fab" || type === "office",
        panelJoints: type === "fab",
        panelWidth: type === "fab" ? 6 : undefined,
        louverBands: type === "utility" ? 2 : undefined,
        loadingBayCount:
          type === "warehouse" ? 4 : type === "support" ? 2 : undefined,
        canopy: type === "warehouse" || type === "support" ? true : undefined,
      };
      building.roof = {
        ...(building.roof ?? {}),
        parapet: true,
      };
    });
  }

  private inferBuildingType(label: string): string {
    const value = label.toUpperCase();
    if (value.includes("FAB")) return "fab";
    if (value.includes("UTILITY")) return "utility";
    if (value.includes("WAREHOUSE")) return "warehouse";
    if (
      value.includes("ADMIN") ||
      value.includes("OFFICE") ||
      value.includes("R&D") ||
      value.includes("RND")
    ) {
      return "office";
    }
    if (value.includes("SUPPORT") || value.includes("SERVICE")) return "support";
    return "building";
  }

  private toAssetId(label: string): string {
    return label
      .trim()
      .toUpperCase()
      .replace(/&/g, "_AND_")
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48);
  }

  private pointInPolygon(point: Point2, polygon: Point2[]): boolean {
    if (polygon.length < 3) return false;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x;
      const yi = polygon[i].y;
      const xj = polygon[j].x;
      const yj = polygon[j].y;
      const intersects =
        yi > point.y !== yj > point.y &&
        point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
      if (intersects) inside = !inside;
    }
    return inside;
  }

  private removeClosingDuplicate(points: Point2[]): Point2[] {
    if (points.length < 2) return points;
    const first = points[0];
    const last = points[points.length - 1];
    if (Math.hypot(first.x - last.x, first.y - last.y) < 1e-6) {
      return points.slice(0, -1);
    }
    return points;
  }

  private polygonToParking(points: Point2[], id: string): FactoryParking {
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
      id,
      label: id,
      x: minX,
      y: minY,
      w: maxX - minX,
      h: maxY - minY,
    };
  }

  private pickLargestPolygon(polygons: Point2[][]): Point2[] | undefined {
    if (!polygons.length) return undefined;
    return [...polygons].sort(
      (a, b) => Math.abs(this.polygonArea(b)) - Math.abs(this.polygonArea(a)),
    )[0];
  }

  private polygonArea(points: Point2[]): number {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const current = points[i];
      const next = points[(i + 1) % points.length];
      area += current.x * next.y - next.x * current.y;
    }
    return area / 2;
  }
}
