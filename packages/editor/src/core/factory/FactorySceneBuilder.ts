import * as THREE from "three";
import type { FactoryManifest, FactoryBuilding, FactoryRoad, FactoryParking, Point2 } from "./FactoryManifest";

export interface FactorySceneBuilderOptions {
  rootName?: string;
  groundOffset?: number;
}

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
    root.add(site, buildings, roads, parking, green);

    if (this.manifest.siteBoundary?.length) site.add(this.createBoundary(this.manifest.siteBoundary));
    for (const item of this.manifest.buildings ?? []) buildings.add(this.createBuilding(item));
    for (const item of this.manifest.roads ?? []) roads.add(this.createRoad(item));
    for (const item of this.manifest.parking ?? []) parking.add(this.createParking(item));
    for (const [index, polygon] of (this.manifest.greenAreas ?? []).entries()) {
      green.add(this.createGreenArea(polygon, `GREEN_${String(index + 1).padStart(3, "0")}`));
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
    if (this.manifest.meta?.unit && this.manifest.meta.unit.toLowerCase() !== "meter") {
      console.warn(`[FactoryGenerator] Manifest unit is ${this.manifest.meta.unit}; MVP assumes meters.`);
    }
    for (const b of this.manifest.buildings ?? []) {
      if (![b.x, b.y, b.w, b.h, b.z].every(Number.isFinite)) throw new Error(`Invalid building: ${b.id}`);
      if (b.w <= 0 || b.h <= 0 || b.z <= 0) throw new Error(`Building dimensions must be > 0: ${b.id}`);
    }
  }

  private planToWorld(x: number, y: number): THREE.Vector3 {
    return new THREE.Vector3(x, this.options.groundOffset, -y);
  }

  private createBoundary(points: Point2[]): THREE.LineLoop {
    const geometry = new THREE.BufferGeometry().setFromPoints(points.map(p => this.planToWorld(p.x, p.y)));
    const material = new THREE.LineBasicMaterial({ color: 0x92a6b8 });
    const line = new THREE.LineLoop(geometry, material);
    line.name = "SITE_BOUNDARY";
    line.userData = { assetType: "site_boundary" };
    return line;
  }

  private createBuilding(item: FactoryBuilding): THREE.Group {
    const type = this.inferBuildingType(item);
    const group = new THREE.Group();
    group.name = item.id;
    group.userData = {
      assetId: item.id,
      assetType: type,
      label: item.label ?? item.id,
      source: "factory-manifest",
      dimensions: { width: item.w, depth: item.h, height: item.z },
      ...(item.userData ?? {}),
    };

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(item.w, item.z, item.h),
      new THREE.MeshStandardMaterial({ color: this.getBuildingColor(type), roughness: 0.68, metalness: 0.08 }),
    );
    body.name = `${item.id}_BODY`;
    body.position.y = item.z / 2;
    group.add(body);

    if (item.roof?.parapet !== false) this.addParapet(group, item);
    if (type === "fab" || item.facade?.windowBand) this.addWindowBands(group, item);
    if (type === "fab" || type === "utility") this.addRoofEquipment(group, item, item.roof?.hvacCount);

    const center = this.planToWorld(item.x + item.w / 2, item.y + item.h / 2);
    group.position.set(center.x, this.options.groundOffset, center.z);
    return group;
  }

  private addParapet(group: THREE.Group, item: FactoryBuilding): void {
    const t = Math.max(0.35, Math.min(item.w, item.h) * 0.006);
    const h = Math.max(0.8, Math.min(1.8, item.z * 0.04));
    const y = item.z + h / 2;
    const material = new THREE.MeshStandardMaterial({ color: 0xc7ced3, roughness: 0.75 });
    const specs: Array<[number, number, number, number]> = [
      [item.w, h, t, item.h / 2 - t / 2],
      [item.w, h, t, -item.h / 2 + t / 2],
      [t, h, item.h, item.w / 2 - t / 2],
      [t, h, item.h, -item.w / 2 + t / 2],
    ];
    specs.forEach(([w, ph, d, offset], i) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, ph, d), material);
      mesh.name = `${item.id}_PARAPET_${i + 1}`;
      if (i < 2) mesh.position.set(0, y, offset);
      else mesh.position.set(offset, y, 0);
      group.add(mesh);
    });
  }

  private addWindowBands(group: THREE.Group, item: FactoryBuilding): void {
    const bandHeight = Math.max(1.2, Math.min(2.4, item.z * 0.07));
    const bandY = item.z * 0.58;
    const thickness = 0.12;
    const glass = new THREE.MeshStandardMaterial({ color: 0x5f8396, roughness: 0.32, metalness: 0.1 });
    const front = new THREE.Mesh(new THREE.BoxGeometry(item.w * 0.82, bandHeight, thickness), glass);
    front.name = `${item.id}_WINDOW_BAND_S`;
    front.position.set(0, bandY, item.h / 2 + thickness / 2);
    group.add(front);
    const back = front.clone();
    back.name = `${item.id}_WINDOW_BAND_N`;
    back.position.z = -item.h / 2 - thickness / 2;
    group.add(back);
  }

  private addRoofEquipment(group: THREE.Group, item: FactoryBuilding, requested?: number): void {
    const count = Math.max(2, Math.min(requested ?? (this.inferBuildingType(item) === "fab" ? 8 : 4), 24));
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);
    const cellW = item.w / (cols + 1);
    const cellD = item.h / (rows + 1);
    const unitW = Math.max(2.4, Math.min(7, cellW * 0.55));
    const unitD = Math.max(2.4, Math.min(6, cellD * 0.52));
    const unitH = Math.max(1.4, Math.min(3.2, item.z * 0.08));
    const material = new THREE.MeshStandardMaterial({ color: 0x87959e, roughness: 0.58, metalness: 0.34 });

    for (let i = 0; i < count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(unitW, unitH, unitD), material);
      mesh.name = `${item.id}_ROOF_UNIT_${String(i + 1).padStart(2, "0")}`;
      mesh.position.set(
        (col - (cols - 1) / 2) * cellW,
        item.z + unitH / 2 + 0.18,
        (row - (rows - 1) / 2) * cellD,
      );
      mesh.userData = { assetType: "roof_equipment", parentAssetId: item.id };
      group.add(mesh);
    }
  }

  private inferBuildingType(item: FactoryBuilding): string {
    if (item.type) return item.type.toLowerCase();
    const s = `${item.id} ${item.label ?? ""}`.toUpperCase();
    if (s.includes("FAB")) return "fab";
    if (s.includes("UTILITY")) return "utility";
    if (s.includes("WAREHOUSE")) return "warehouse";
    if (s.includes("ADMIN") || s.includes("OFFICE") || s.includes("R&D")) return "office";
    if (s.includes("SUPPORT") || s.includes("SERVICE")) return "support";
    return "building";
  }

  private getBuildingColor(type: string): number {
    switch (type) {
      case "fab": return 0xe0e6ea;
      case "utility": return 0xb6c1c9;
      case "warehouse": return 0xc8cfd4;
      case "office": return 0xa3b6c2;
      case "support": return 0xc0c8cd;
      default: return 0xcbd2d8;
    }
  }

  private createRoad(item: FactoryRoad): THREE.Group {
    const group = this.group(item.id);
    group.userData = { assetId: item.id, assetType: "road", width: item.width };
    const asphalt = new THREE.MeshStandardMaterial({ color: 0x46505a, roughness: 0.94 });
    const points = item.points ?? [];
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = this.planToWorld(points[i][0], points[i][1]);
      const p2 = this.planToWorld(points[i + 1][0], points[i + 1][1]);
      const dx = p2.x - p1.x;
      const dz = p2.z - p1.z;
      const length = Math.hypot(dx, dz);
      if (length <= 0) continue;
      const road = new THREE.Mesh(new THREE.BoxGeometry(item.width, 0.12, length), asphalt);
      road.name = `${item.id}_SEG_${i + 1}`;
      road.position.set((p1.x + p2.x) / 2, this.options.groundOffset + 0.04, (p1.z + p2.z) / 2);
      road.rotation.y = Math.atan2(dx, dz);
      group.add(road);
    }
    return group;
  }

  private createParking(item: FactoryParking): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(item.w, 0.08, item.h),
      new THREE.MeshStandardMaterial({ color: 0x59636b, roughness: 0.95 }),
    );
    mesh.name = item.id;
    const world = this.planToWorld(item.x + item.w / 2, item.y + item.h / 2);
    mesh.position.set(world.x, this.options.groundOffset + 0.03, world.z);
    mesh.userData = { assetId: item.id, assetType: "parking", label: item.label ?? item.id };
    return mesh;
  }

  private createGreenArea(points: Point2[], id: string): THREE.Mesh {
    const shape = new THREE.Shape();
    if (points.length) {
      shape.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) shape.lineTo(points[i].x, points[i].y);
      shape.closePath();
    }
    const geometry = new THREE.ShapeGeometry(shape);
    geometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x668564, roughness: 1, side: THREE.DoubleSide }));
    mesh.name = id;
    mesh.position.y = this.options.groundOffset + 0.02;
    mesh.userData = { assetId: id, assetType: "green_area" };
    return mesh;
  }

  private centerRoot(root: THREE.Group): void {
    const box = new THREE.Box3().setFromObject(root);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    root.position.x -= center.x;
    root.position.z -= center.z;
    root.userData.originalPlanCenter = { x: center.x, z: center.z };
  }
}
