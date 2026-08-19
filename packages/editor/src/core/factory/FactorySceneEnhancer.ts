import * as THREE from "three";
import type { FactoryBuilding, FactoryManifest } from "./FactoryManifest";
import { BuildingArchitectureGenerator } from "./BuildingArchitectureGenerator";
import { CampusDetailGenerator } from "./CampusDetailGenerator";
import { EquipmentYardGenerator } from "./EquipmentYardGenerator";
import { PipeRackGenerator } from "./PipeRackGenerator";
import { FactoryVisualTuner } from "./FactoryVisualTuner";

export class FactorySceneEnhancer {
  private readonly architectureGenerator: BuildingArchitectureGenerator;

  constructor(
    private readonly manifest: FactoryManifest,
    private readonly groundOffset = 0,
  ) {
    this.architectureGenerator = new BuildingArchitectureGenerator(manifest);
  }

  apply(root: THREE.Group): THREE.Group {
    this.enhanceBuildings(root);
    this.addPipeRacks(root);
    this.addEquipmentYards(root);
    this.addCampusDetails(root);
    new FactoryVisualTuner(this.groundOffset).apply(root, this.manifest);
    root.userData.enhancementStage = "L2.5-architecture-grammar-v1";
    return root;
  }

  private enhanceBuildings(root: THREE.Group): void {
    const buildingsRoot = root.getObjectByName("BUILDINGS");
    if (!buildingsRoot) return;

    for (const item of this.manifest.buildings ?? []) {
      const buildingGroup = buildingsRoot.getObjectByName(item.id) as THREE.Group | undefined;
      if (!buildingGroup) continue;
      this.architectureGenerator.enhance(
        item,
        buildingGroup,
        this.inferBuildingType(item),
      );
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

  private addEquipmentYards(root: THREE.Group): void {
    const yards = new EquipmentYardGenerator(this.manifest, this.groundOffset).create();
    if (yards.children.length) root.add(yards);
  }

  private addCampusDetails(root: THREE.Group): void {
    const details = new CampusDetailGenerator(this.groundOffset).create(this.manifest);
    if (details.children.length) root.add(details);
  }

  private inferBuildingType(item: FactoryBuilding): string {
    if (item.type) return item.type.toLowerCase();
    const value = `${item.id} ${item.label ?? ""}`.toUpperCase();
    if (value.includes("FAB")) return "fab";
    if (value.includes("UTILITY")) return "utility";
    if (value.includes("WAREHOUSE")) return "warehouse";
    if (value.includes("ADMIN") || value.includes("OFFICE") || value.includes("R&D")) {
      return "office";
    }
    if (value.includes("SUPPORT") || value.includes("SERVICE")) return "support";
    return "building";
  }
}
