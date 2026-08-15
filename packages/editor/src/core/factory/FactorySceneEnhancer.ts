import * as THREE from "three";
import type { FactoryBuilding, FactoryManifest, Point2 } from "./FactoryManifest";
import { BuildingFacadeGenerator } from "./BuildingFacadeGenerator";
import { CampusDetailGenerator } from "./CampusDetailGenerator";
import { PipeRackGenerator } from "./PipeRackGenerator";
import { FactoryVisualTuner } from "./FactoryVisualTuner";

export class FactorySceneEnhancer {
  private readonly facadeGenerator = new BuildingFacadeGenerator();

  constructor(
    private readonly manifest: FactoryManifest,
    private readonly groundOffset = 0,
  ) {}

  apply(root: THREE.Group): THREE.Group {
    this.enhanceBuildings(root);
    this.addPipeRacks(root);
    this.addCampusDetails(root);
    new FactoryVisualTuner(this.groundOffset).apply(root, this.manifest);
    root.userData.enhancementStage = "L2.5";
    return root;
  }

  private enhanceBuildings(root: THREE.Group): void {
    const buildingsRoot = root.getObjectByName("BUILDINGS");
    if (!buildingsRoot) return;

    for (const item of this.manifest.buildings ?? []) {
      const buildingGroup = buildingsRoot.getObjectByName(item.id) as THREE.Group | undefined;
      if (!buildingGroup) continue;

      const polygon = this.resolveLocalWorldFootprint(item);
      const type = this.inferBuildingType(item);
      const details = this.facadeGenerator.create(item, polygon, type);
      if (details.children.length) buildingGroup.add(details);
    }
  }

  private addPipeRacks(root: THREE.Group): void {
    if (!this.manifest.pipeRacks?.length) return;

    const pipeRackRoot = new THREE.Group();
    pipeRackRoot.name = "PIPE_RACKS";
    pipeRackRoot.userData = { assetType: "pipe_rack_collection" };

    const generator = new PipeRackGenerator(this.groundOffset);
    for (const item of this.manifest.pipeRacks) {
      pipeRackRoot.add(generator.create(item));
    }

    root.add(pipeRackRoot);
  }

  private addCampusDetails(root: THREE.Group): void {
    const details = new CampusDetailGenerator(this.groundOffset).create(this.manifest);
    if (details.children.length) root.add(details);
  }

  private resolveLocalWorldFootprint(item: FactoryBuilding): THREE.Vector2[] {
    const plan = this.resolveFootprint(item);
    if (!plan.length) return [];
    const xs = plan.map((point) => point.x);
    const ys = plan.map((point) => point.y);
    const center = {
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      y: (Math.min(...ys) + Math.max(...ys)) / 2,
    };

    return plan.map(
      (point) =>
        new THREE.Vector2(point.x - center.x, -(point.y - center.y)),
    );
  }

  private resolveFootprint(item: FactoryBuilding): Point2[] {
    if (item.footprint?.length) {
      return item.footprint.map((point) => ({ ...point }));
    }

    if (
      !Number.isFinite(item.x) ||
      !Number.isFinite(item.y) ||
      !Number.isFinite(item.w) ||
      !Number.isFinite(item.h)
    ) {
      return [];
    }

    return [
      { x: item.x!, y: item.y! },
      { x: item.x! + item.w!, y: item.y! },
      { x: item.x! + item.w!, y: item.y! + item.h! },
      { x: item.x!, y: item.y! + item.h! },
    ];
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
}
