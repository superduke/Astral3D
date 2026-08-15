import * as THREE from "three";
import type {
  FactoryManifest,
  FactoryBuilding,
  FactoryRoad,
  FactoryParking,
  Point2,
} from "./FactoryManifest";
import { AssetPlacer } from "./AssetPlacer";
import {
  createInstancedAssetGroup,
  type AssetInstanceTransform,
} from "./ProceduralAssetFactory";

export interface FactorySceneBuilderOptions {
  rootName?: string;
  groundOffset?: number;
}

interface ResolvedFootprint {
  plan: Point2[];
  localPlan: Point2[];
  localWorld: THREE.Vector2[];
  center: Point2;
  width: number;
  depth: number;
}

type RoofZone = "center" | "edge" | "side";

export class FactorySceneBuilder {
  private readonly manifest: FactoryManifest;
  private readonly options: Required<FactorySceneBuilderOptions>;

  constructor(manifest: FactoryManifest, options: FactorySceneBuilderOptions = {}) {
    this.manifest = manifest;
    this.options = {
      rootName: options.rootName ?? manifest.meta?.name ?? "FACTORY_GENERATED",
      groundOffset: options.groundOffset ?? 0,
    };
  }

  build(): THREE.Group {
    this.validate();

    const root = new THREE.Group();
    root.name = this.options.rootName;
    root.userData = {
      generatedBy: "Astral3D.FactoryGenerator",
      manifestMeta: this.manifest.meta ?? {},
    };

    const site = this.group("SITE");
    const buildings = this.group("BUILDINGS");
    const roads = this.group("ROADS");
    const parking = this.group("PARKING");
    const green = this.group("GREEN");
    const assets = this.group("ASSETS");
    root.add(site, buildings, roads, parking, green, assets);

    if (this.manifest.siteBoundary?.length) {
      site.add(this.createBoundary(this.manifest.siteBoundary));
    }

    for (const item of this.manifest.buildings ?? []) {
      buildings.add(this.createBuilding(item));
    }

    for (const item of this.manifest.roads ?? []) {
      roads.add(this.createRoad(item));
    }

    for (const item of this.manifest.parking ?? []) {
      parking.add(this.createParking(item));
    }

    for (const [index, polygon] of (this.manifest.greenAreas ?? []).entries()) {
      green.add(
        this.createGreenArea(
          polygon,
          `GREEN_${String(index + 1).padStart(3, "0")}`,
        ),
      );
    }

    const assetPlacer = new AssetPlacer(this.options.groundOffset);
    for (const batch of this.manifest.assets ?? []) {
      assets.add(assetPlacer.createBatch(batch));
    }

    this.centerRoot(root);
    return root;
  }

  private group(name: string): THREE.Group {
    const group = new THREE.Group();
    group.name = name;
    return group;
  }

  private validate(): void {
    if (
      this.manifest.meta?.unit &&
      this.manifest.meta.unit.toLowerCase() !== "meter"
    ) {
      console.warn(
        `[FactoryGenerator] Manifest unit is ${this.manifest.meta.unit}; generator assumes meters.`,
      );
    }

    for (const building of this.manifest.buildings ?? []) {
      if (!Number.isFinite(building.z) || building.z <= 0) {
        throw new Error(`Building height must be > 0: ${building.id}`);
      }

      if (building.footprint?.length) {
        if (building.footprint.length < 3) {
          throw new Error(`Building footprint requires >= 3 points: ${building.id}`);
        }
        if (
          !building.footprint.every(
            (point) => Number.isFinite(point.x) && Number.isFinite(point.y),
          )
        ) {
          throw new Error(`Invalid footprint coordinate: ${building.id}`);
        }
      } else {
        const values = [building.x, building.y, building.w, building.h];
        if (!values.every((value) => Number.isFinite(value))) {
          throw new Error(
            `Building ${building.id} requires footprint or x/y/w/h rectangle fields.`,
          );
        }
        if ((building.w ?? 0) <= 0 || (building.h ?? 0) <= 0) {
          throw new Error(`Building rectangle dimensions must be > 0: ${building.id}`);
        }
      }
    }
  }

  private planToWorld(x: number, y: number): THREE.Vector3 {
    return new THREE.Vector3(x, this.options.groundOffset, -y);
  }

  private createBoundary(points: Point2[]): THREE.LineLoop {
    const geometry = new THREE.BufferGeometry().setFromPoints(
      points.map((point) => this.planToWorld(point.x, point.y)),
    );
    const material = new THREE.LineBasicMaterial({ color: 0x92a6b8 });
    const line = new THREE.LineLoop(geometry, material);
    line.name = "SITE_BOUNDARY";
    line.userData = { assetType: "site_boundary" };
    return line;
  }

  private resolveFootprint(item: FactoryBuilding): ResolvedFootprint {
    const plan = item.footprint?.length
      ? item.footprint.map((point) => ({ ...point }))
      : [
          { x: item.x!, y: item.y! },
          { x: item.x! + item.w!, y: item.y! },
          { x: item.x! + item.w!, y: item.y! + item.h! },
          { x: item.x!, y: item.y! + item.h! },
        ];

    const xs = plan.map((point) => point.x);
    const ys = plan.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const center = {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
    };

    const localPlan = plan.map((point) => ({
      x: point.x - center.x,
      y: point.y - center.y,
    }));

    return {
      plan,
      localPlan,
      localWorld: localPlan.map((point) => new THREE.Vector2(point.x, -point.y)),
      center,
      width: maxX - minX,
      depth: maxY - minY,
    };
  }

  private createBuilding(item: FactoryBuilding): THREE.Group {
    const type = this.inferBuildingType(item);
    const footprint = this.resolveFootprint(item);
    const group = new THREE.Group();
    group.name = item.id;
    group.userData = {
      assetId: item.id,
      assetType: type,
      label: item.label ?? item.id,
      source: "factory-manifest",
      dimensions: {
        width: footprint.width,
        depth: footprint.depth,
        height: item.z,
      },
      footprint: footprint.plan,
      ...(item.userData ?? {}),
    };

    const body = this.createBuildingBody(item, footprint.localPlan, type);
    group.add(body);

    if (item.roof?.parapet !== false) {
      this.addParapet(group, item, footprint.localWorld);
    }

    if (type === "fab" || item.facade?.windowBand) {
      this.addWindowBands(group, item, footprint.localWorld);
    }

    this.addRoofEquipment(group, item, footprint.localWorld, type);

    const center = this.planToWorld(footprint.center.x, footprint.center.y);
    group.position.set(center.x, this.options.groundOffset, center.z);
    return group;
  }

  private createBuildingBody(
    item: FactoryBuilding,
    localPlan: Point2[],
    type: string,
  ): THREE.Mesh {
    const shape = new THREE.Shape();
    shape.moveTo(localPlan[0].x, localPlan[0].y);
    for (let i = 1; i < localPlan.length; i++) {
      shape.lineTo(localPlan[i].x, localPlan[i].y);
    }
    shape.closePath();

    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: item.z,
      bevelEnabled: false,
      steps: 1,
      curveSegments: 1,
    });
    geometry.rotateX(-Math.PI / 2);
    geometry.computeVertexNormals();

    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: this.getBuildingColor(type),
        roughness: 0.68,
        metalness: 0.08,
      }),
    );
    mesh.name = `${item.id}_BODY`;
    return mesh;
  }

  private addParapet(
    group: THREE.Group,
    item: FactoryBuilding,
    polygon: THREE.Vector2[],
  ): void {
    const bounds = this.getPolygonBounds(polygon);
    const thickness = Math.max(
      0.35,
      Math.min(bounds.width, bounds.depth) * 0.006,
    );
    const height = Math.max(0.8, Math.min(1.8, item.z * 0.04));
    const material = new THREE.MeshStandardMaterial({
      color: 0xc7ced3,
      roughness: 0.75,
    });

    this.forEachEdge(polygon, (a, b, index) => {
      const mesh = this.createEdgeBox(
        a,
        b,
        height,
        thickness,
        item.z + height / 2,
        material,
        `${item.id}_PARAPET_${index + 1}`,
      );
      if (mesh) group.add(mesh);
    });
  }

  private addWindowBands(
    group: THREE.Group,
    item: FactoryBuilding,
    polygon: THREE.Vector2[],
  ): void {
    const bandHeight = Math.max(1.2, Math.min(2.4, item.z * 0.07));
    const thickness = 0.12;
    const glass = new THREE.MeshStandardMaterial({
      color: 0x5f8396,
      roughness: 0.32,
      metalness: 0.1,
    });

    this.forEachEdge(polygon, (a, b, index) => {
      if (a.distanceTo(b) < 10) return;
      const mesh = this.createEdgeBox(
        a,
        b,
        bandHeight,
        thickness,
        item.z * 0.58,
        glass,
        `${item.id}_WINDOW_BAND_${index + 1}`,
        0.82,
      );
      if (mesh) group.add(mesh);
    });
  }

  private createEdgeBox(
    a: THREE.Vector2,
    b: THREE.Vector2,
    height: number,
    thickness: number,
    y: number,
    material: THREE.Material,
    name: string,
    coverage = 1,
  ): THREE.Mesh | null {
    const dx = b.x - a.x;
    const dz = b.y - a.y;
    const length = Math.hypot(dx, dz);
    if (length <= 0.001) return null;

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(length * coverage, height, thickness),
      material,
    );
    mesh.name = name;
    mesh.position.set((a.x + b.x) / 2, y, (a.y + b.y) / 2);
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(dx / length, 0, dz / length),
    );
    return mesh;
  }

  private addRoofEquipment(
    group: THREE.Group,
    item: FactoryBuilding,
    polygon: THREE.Vector2[],
    type: string,
  ): void {
    const hvacCount = Math.max(
      0,
      Math.min(item.roof?.hvacCount ?? (type === "fab" ? 10 : type === "utility" ? 6 : 0), 48),
    );
    const exhaustCount = Math.max(
      0,
      Math.min(item.roof?.exhaustCount ?? (type === "fab" ? 6 : type === "utility" ? 2 : 0), 48),
    );
    const scrubberCount = Math.max(
      0,
      Math.min(item.roof?.scrubberCount ?? 0, 16),
    );

    const configs: Array<{
      template: string;
      count: number;
      zone: RoofZone;
      scale?: THREE.Vector3;
    }> = [
      { template: "hvac", count: hvacCount, zone: "center" },
      {
        template: "exhaust_stack",
        count: exhaustCount,
        zone: "edge",
        scale: new THREE.Vector3(0.82, 0.82, 0.82),
      },
      {
        template: "scrubber",
        count: scrubberCount,
        zone: "side",
        scale: new THREE.Vector3(0.85, 0.85, 0.85),
      },
    ];

    for (const config of configs) {
      if (!config.count) continue;
      const transforms = this.generateRoofTransforms(
        polygon,
        config.count,
        item.z + 0.18,
        config.zone,
        `${item.id}_${config.template}`,
        config.scale,
      );
      if (!transforms.length) continue;

      group.add(
        createInstancedAssetGroup(
          `${item.id}_${config.template.toUpperCase()}`,
          config.template,
          transforms,
          {
            parentAssetId: item.id,
            placement: "roof",
          },
        ),
      );
    }
  }

  private generateRoofTransforms(
    polygon: THREE.Vector2[],
    count: number,
    elevation: number,
    zone: RoofZone,
    idPrefix: string,
    scale?: THREE.Vector3,
  ): AssetInstanceTransform[] {
    const bounds = this.getPolygonBounds(polygon);
    const zoneRange =
      zone === "edge"
        ? { minX: 0.12, maxX: 0.88, minZ: 0.1, maxZ: 0.3 }
        : zone === "side"
          ? { minX: 0.68, maxX: 0.9, minZ: 0.28, maxZ: 0.82 }
          : { minX: 0.16, maxX: 0.84, minZ: 0.28, maxZ: 0.78 };

    const columns = Math.max(1, Math.ceil(Math.sqrt(count * 1.7)));
    const rows = Math.max(1, Math.ceil(count / columns));
    const transforms: AssetInstanceTransform[] = [];

    for (let row = 0; row < rows && transforms.length < count; row++) {
      for (let column = 0; column < columns && transforms.length < count; column++) {
        const tx = (column + 0.5) / columns;
        const tz = (row + 0.5) / rows;
        const nx = zoneRange.minX + (zoneRange.maxX - zoneRange.minX) * tx;
        const nz = zoneRange.minZ + (zoneRange.maxZ - zoneRange.minZ) * tz;
        const point = new THREE.Vector2(
          bounds.minX + bounds.width * nx,
          bounds.minZ + bounds.depth * nz,
        );
        if (!this.pointInPolygon(point, polygon)) continue;

        transforms.push({
          id: `${idPrefix}_${String(transforms.length + 1).padStart(3, "0")}`,
          position: new THREE.Vector3(point.x, elevation, point.y),
          scale: scale?.clone(),
        });
      }
    }

    // Concave footprints can reject too many zone-grid candidates. Fill remaining
    // instances from a denser whole-footprint scan instead of silently losing count.
    if (transforms.length < count) {
      const denseColumns = Math.max(4, columns * 2);
      const denseRows = Math.max(4, rows * 2);
      for (let row = 0; row < denseRows && transforms.length < count; row++) {
        for (let column = 0; column < denseColumns && transforms.length < count; column++) {
          const point = new THREE.Vector2(
            bounds.minX + bounds.width * ((column + 0.5) / denseColumns),
            bounds.minZ + bounds.depth * ((row + 0.5) / denseRows),
          );
          if (!this.pointInPolygon(point, polygon)) continue;
          if (
            transforms.some(
              (item) =>
                Math.hypot(
                  item.position.x - point.x,
                  item.position.z - point.y,
                ) < 2.5,
            )
          ) {
            continue;
          }
          transforms.push({
            id: `${idPrefix}_${String(transforms.length + 1).padStart(3, "0")}`,
            position: new THREE.Vector3(point.x, elevation, point.y),
            scale: scale?.clone(),
          });
        }
      }
    }

    return transforms;
  }

  private pointInPolygon(point: THREE.Vector2, polygon: THREE.Vector2[]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x;
      const zi = polygon[i].y;
      const xj = polygon[j].x;
      const zj = polygon[j].y;
      const intersects =
        zi > point.y !== zj > point.y &&
        point.x < ((xj - xi) * (point.y - zi)) / (zj - zi) + xi;
      if (intersects) inside = !inside;
    }
    return inside;
  }

  private getPolygonBounds(polygon: THREE.Vector2[]) {
    const xs = polygon.map((point) => point.x);
    const zs = polygon.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    return {
      minX,
      maxX,
      minZ,
      maxZ,
      width: maxX - minX,
      depth: maxZ - minZ,
    };
  }

  private forEachEdge(
    polygon: THREE.Vector2[],
    callback: (a: THREE.Vector2, b: THREE.Vector2, index: number) => void,
  ): void {
    polygon.forEach((point, index) => {
      callback(point, polygon[(index + 1) % polygon.length], index);
    });
  }

  private inferBuildingType(item: FactoryBuilding): string {
    if (item.type) return item.type.toLowerCase();
    const value = `${item.id} ${item.label ?? ""}`.toUpperCase();
    if (value.includes("FAB")) return "fab";
    if (value.includes("UTILITY")) return "utility";
    if (value.includes("WAREHOUSE")) return "warehouse";
    if (
      value.includes("ADMIN") ||
      value.includes("OFFICE") ||
      value.includes("R&D")
    ) {
      return "office";
    }
    if (value.includes("SUPPORT") || value.includes("SERVICE")) return "support";
    return "building";
  }

  private getBuildingColor(type: string): number {
    switch (type) {
      case "fab":
        return 0xe0e6ea;
      case "utility":
        return 0xb6c1c9;
      case "warehouse":
        return 0xc8cfd4;
      case "office":
        return 0xa3b6c2;
      case "support":
        return 0xc0c8cd;
      default:
        return 0xcbd2d8;
    }
  }

  private createRoad(item: FactoryRoad): THREE.Group {
    const group = this.group(item.id);
    group.userData = {
      assetId: item.id,
      assetType: "road",
      width: item.width,
    };
    const asphalt = new THREE.MeshStandardMaterial({
      color: 0x46505a,
      roughness: 0.94,
    });
    const points = item.points ?? [];

    for (let i = 0; i < points.length - 1; i++) {
      const p1 = this.planToWorld(points[i][0], points[i][1]);
      const p2 = this.planToWorld(points[i + 1][0], points[i + 1][1]);
      const dx = p2.x - p1.x;
      const dz = p2.z - p1.z;
      const length = Math.hypot(dx, dz);
      if (length <= 0) continue;

      const road = new THREE.Mesh(
        new THREE.BoxGeometry(item.width, 0.12, length),
        asphalt,
      );
      road.name = `${item.id}_SEG_${i + 1}`;
      road.position.set(
        (p1.x + p2.x) / 2,
        this.options.groundOffset + 0.04,
        (p1.z + p2.z) / 2,
      );
      road.rotation.y = Math.atan2(dx, dz);
      group.add(road);
    }

    return group;
  }

  private createParking(item: FactoryParking): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(item.w, 0.08, item.h),
      new THREE.MeshStandardMaterial({
        color: 0x59636b,
        roughness: 0.95,
      }),
    );
    mesh.name = item.id;
    const world = this.planToWorld(
      item.x + item.w / 2,
      item.y + item.h / 2,
    );
    mesh.position.set(
      world.x,
      this.options.groundOffset + 0.03,
      world.z,
    );
    mesh.userData = {
      assetId: item.id,
      assetType: "parking",
      label: item.label ?? item.id,
    };
    return mesh;
  }

  private createGreenArea(points: Point2[], id: string): THREE.Mesh {
    const shape = new THREE.Shape();
    if (points.length) {
      shape.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        shape.lineTo(points[i].x, points[i].y);
      }
      shape.closePath();
    }

    const geometry = new THREE.ShapeGeometry(shape);
    geometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: 0x668564,
        roughness: 1,
        side: THREE.DoubleSide,
      }),
    );
    mesh.name = id;
    mesh.position.y = this.options.groundOffset + 0.02;
    mesh.userData = {
      assetId: id,
      assetType: "green_area",
    };
    return mesh;
  }

  private centerRoot(root: THREE.Group): void {
    const box = new THREE.Box3().setFromObject(root);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    root.position.x -= center.x;
    root.position.z -= center.z;
    root.userData.originalPlanCenter = {
      x: center.x,
      z: center.z,
    };
  }
}
