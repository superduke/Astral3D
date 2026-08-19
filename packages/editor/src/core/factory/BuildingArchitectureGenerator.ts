import * as THREE from "three";
import type { FactoryBuilding, FactoryManifest, Point2 } from "./FactoryManifest";
import { BuildingProfileRegistry, type BuildingStyleProfile } from "./BuildingProfileRegistry";
import { FactoryMaterialLibrary } from "./FactoryMaterialLibrary";
import {
  createInstancedAssetGroup,
  type AssetInstanceTransform,
} from "./ProceduralAssetFactory";

interface ResolvedFootprint {
  plan: Point2[];
  localPlan: Point2[];
  localWorld: THREE.Vector2[];
  center: Point2;
  width: number;
  depth: number;
}

interface EdgeInfo {
  a: THREE.Vector2;
  b: THREE.Vector2;
  index: number;
  length: number;
  direction: THREE.Vector2;
  outward: THREE.Vector2;
  angle: number;
}

interface InstancePlacement {
  position: THREE.Vector3;
  rotationY?: number;
  scale: THREE.Vector3;
}

/**
 * L2.5 industrial architecture grammar.
 *
 * The base builder remains responsible for stable semantic footprints. This
 * enhancer replaces the visible monolithic shell with deterministic profile-
 * driven massing, then adds facade bays, entrances and a service-aware roofscape.
 */
export class BuildingArchitectureGenerator {
  private readonly profiles = new BuildingProfileRegistry();
  private readonly materials = new FactoryMaterialLibrary();

  constructor(private readonly manifest: FactoryManifest) {}

  enhance(item: FactoryBuilding, buildingGroup: THREE.Group, inferredType: string): void {
    const footprint = this.resolveFootprint(item);
    if (!footprint.localPlan.length) return;

    const profile = this.profiles.resolve(item, inferredType);
    const frontEdgeIndex = this.resolveFrontEdgeIndex(footprint.plan);
    this.removeLegacyArchitecture(buildingGroup);

    const grammar = new THREE.Group();
    grammar.name = `${item.id}_ARCHITECTURE`;
    grammar.userData = {
      assetType: "building_architecture",
      parentAssetId: item.id,
      profile: profile.id,
      frontEdgeIndex,
      generatedBy: "BuildingArchitectureGenerator",
    };

    this.addMassing(grammar, item, footprint, profile, frontEdgeIndex);
    this.addEnvelope(grammar, item, footprint, profile, frontEdgeIndex);
    this.addEntrance(grammar, item, footprint, profile, frontEdgeIndex);
    this.addRoofscape(grammar, item, footprint, profile);

    buildingGroup.add(grammar);
    buildingGroup.userData.architectureProfile = profile.id;
    buildingGroup.userData.frontEdgeIndex = frontEdgeIndex;
    buildingGroup.userData.architectureStage = "grammar-v1";
  }

  private removeLegacyArchitecture(group: THREE.Group): void {
    for (const child of [...group.children]) {
      if (child.name.endsWith("_BODY")) {
        child.visible = false;
        continue;
      }
      const isLegacy =
        child.name.includes("_PARAPET_") ||
        child.name.includes("_WINDOW_BAND_") ||
        child.userData?.placement === "roof" ||
        child.name.endsWith("_FACADE_DETAILS");
      if (isLegacy) group.remove(child);
    }
  }

  private addMassing(
    target: THREE.Group,
    item: FactoryBuilding,
    footprint: ResolvedFootprint,
    profile: BuildingStyleProfile,
    frontEdgeIndex: number,
  ): void {
    const plinthHeight = Math.min(profile.massing.plinthHeight, item.z * 0.12);
    const mechanicalHeight = Math.max(
      0,
      Math.min(item.z * profile.massing.mechanicalBandRatio, item.z * 0.32),
    );
    const mainHeight = Math.max(item.z * 0.58, item.z - mechanicalHeight);

    const main = this.createExtrudedVolume(
      footprint.localPlan,
      mainHeight,
      profile.materials.body,
      `${item.id}_MAIN_VOLUME`,
    );
    target.add(main);

    const plinth = this.createExtrudedVolume(
      footprint.localPlan,
      plinthHeight,
      profile.materials.plinth,
      `${item.id}_PLINTH`,
    );
    plinth.position.y = 0.02;
    target.add(plinth);

    if (mechanicalHeight > 0.35) {
      const insetScale = this.insetScale(footprint, profile.massing.upperSetback);
      const upperPlan = footprint.localPlan.map((point) => ({
        x: point.x * insetScale.x,
        y: point.y * insetScale.y,
      }));
      const mechanical = this.createExtrudedVolume(
        upperPlan,
        mechanicalHeight,
        profile.materials.accent,
        `${item.id}_MECHANICAL_VOLUME`,
      );
      mechanical.position.y = mainHeight;
      target.add(mechanical);
    }

    const penthouseRatio = profile.massing.penthouseRatio;
    if (penthouseRatio > 0.01 && footprint.width > 18 && footprint.depth > 14) {
      const width = Math.max(8, footprint.width * penthouseRatio);
      const depth = Math.max(7, footprint.depth * Math.min(0.3, penthouseRatio));
      const height = Math.max(2.2, Math.min(4.2, item.z * 0.12));
      const penthouse = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        this.materials.get(profile.materials.accent),
      );
      penthouse.name = `${item.id}_ROOF_PENTHOUSE`;
      penthouse.position.set(
        footprint.width * 0.12,
        item.z + height / 2,
        -footprint.depth * 0.08,
      );
      penthouse.castShadow = true;
      penthouse.receiveShadow = true;
      penthouse.userData = { assetType: "roof_penthouse", parentAssetId: item.id };
      target.add(penthouse);
    }

    if (profile.massing.serviceAnnex) {
      const edge = this.edgeInfos(footprint.localWorld)[frontEdgeIndex];
      if (edge && edge.length > 24) {
        const annexWidth = Math.min(18, edge.length * 0.18);
        const annexDepth = Math.max(5.5, Math.min(9, footprint.depth * 0.1));
        const annexHeight = Math.max(5.5, Math.min(item.z * 0.42, 10));
        const center = edge.a
          .clone()
          .lerp(edge.b, 0.78)
          .addScaledVector(edge.outward, annexDepth / 2 - 0.25);
        const annex = new THREE.Mesh(
          new THREE.BoxGeometry(annexWidth, annexHeight, annexDepth),
          this.materials.get(profile.materials.accent),
        );
        annex.name = `${item.id}_SERVICE_ANNEX`;
        annex.position.set(center.x, annexHeight / 2, center.y);
        annex.rotation.y = edge.angle;
        annex.castShadow = true;
        annex.receiveShadow = true;
        annex.userData = { assetType: "service_annex", parentAssetId: item.id };
        target.add(annex);
      }
    }
  }

  private addEnvelope(
    target: THREE.Group,
    item: FactoryBuilding,
    footprint: ResolvedFootprint,
    profile: BuildingStyleProfile,
    frontEdgeIndex: number,
  ): void {
    const mainHeight = item.z * (1 - Math.min(profile.massing.mechanicalBandRatio, 0.32));
    const panelWidth = Math.max(2.5, item.facade?.panelWidth ?? profile.envelope.panelWidth);
    const panelJoints = item.facade?.panelJoints ?? profile.envelope.panelJoints;

    if (panelJoints) {
      const placements: InstancePlacement[] = [];
      for (const edge of this.edgeInfos(footprint.localWorld)) {
        const count = Math.floor(edge.length / panelWidth);
        for (let index = 1; index < count; index++) {
          const point = edge.a
            .clone()
            .lerp(edge.b, index / count)
            .addScaledVector(edge.outward, 0.1);
          placements.push({
            position: new THREE.Vector3(point.x, mainHeight * 0.5, point.y),
            rotationY: edge.angle,
            scale: new THREE.Vector3(0.09, mainHeight * 0.94, 0.14),
          });
        }
      }
      this.addInstances(
        target,
        `${item.id}_PANEL_JOINTS`,
        placements,
        this.materials.get(profile.materials.trim),
        "facade_panel_joint",
        item.id,
      );
    }

    if (profile.envelope.cornerTrim) {
      const placements = footprint.localWorld.map((point) => ({
        position: new THREE.Vector3(point.x, mainHeight * 0.5, point.y),
        scale: new THREE.Vector3(0.24, mainHeight, 0.24),
      }));
      this.addInstances(
        target,
        `${item.id}_CORNER_TRIM`,
        placements,
        this.materials.get(profile.materials.trim),
        "corner_trim",
        item.id,
      );
    }

    const windowMode =
      item.facade?.windowBand === true && profile.envelope.windowMode === "none"
        ? "ribbon"
        : profile.envelope.windowMode;
    if (windowMode !== "none") {
      this.addWindows(target, item, footprint, profile, frontEdgeIndex, mainHeight, windowMode);
    }

    const louverRows = Math.max(
      0,
      Math.min(item.facade?.louverBands ?? profile.envelope.louverRows, 5),
    );
    if (louverRows > 0) {
      this.addLouvers(target, item, footprint, louverRows, mainHeight);
    }

    const loadingBayCount = Math.max(
      0,
      Math.min(item.facade?.loadingBayCount ?? profile.envelope.loadingBayCount, 12),
    );
    if (loadingBayCount > 0) {
      this.addLoadingBays(target, item, footprint, profile, loadingBayCount);
    }
  }

  private addWindows(
    target: THREE.Group,
    item: FactoryBuilding,
    footprint: ResolvedFootprint,
    profile: BuildingStyleProfile,
    frontEdgeIndex: number,
    mainHeight: number,
    mode: "front-bays" | "ribbon",
  ): void {
    const edges = this.edgeInfos(footprint.localWorld);
    const candidates =
      mode === "ribbon"
        ? edges.filter((edge) => edge.length >= 12)
        : edges.filter((edge) => edge.index === frontEdgeIndex);
    const placements: InstancePlacement[] = [];

    for (const edge of candidates) {
      const count = Math.max(2, Math.floor((edge.length * 0.72) / profile.envelope.windowBayWidth));
      const width = Math.max(2.3, Math.min(4.2, (edge.length * 0.68) / count));
      const rows =
        mode === "ribbon"
          ? 1
          : Math.max(1, Math.min(item.floors ?? Math.round(mainHeight / 4.2), 6));
      const height = mode === "ribbon" ? 1.35 : Math.max(1.6, Math.min(2.4, mainHeight / (rows + 1)));

      for (let row = 0; row < rows; row++) {
        const y =
          mode === "ribbon"
            ? mainHeight * 0.58
            : ((row + 0.72) / rows) * Math.min(mainHeight - 1, mainHeight * 0.86);
        for (let column = 0; column < count; column++) {
          const point = edge.a
            .clone()
            .lerp(edge.b, 0.16 + (0.68 * (column + 0.5)) / count)
            .addScaledVector(edge.outward, 0.12);
          placements.push({
            position: new THREE.Vector3(point.x, y, point.y),
            rotationY: edge.angle,
            scale: new THREE.Vector3(width, height, 0.16),
          });
        }
      }
    }

    this.addInstances(
      target,
      `${item.id}_WINDOW_MODULES`,
      placements,
      this.materials.get(profile.materials.glass),
      "facade_window",
      item.id,
    );
  }

  private addLouvers(
    target: THREE.Group,
    item: FactoryBuilding,
    footprint: ResolvedFootprint,
    rows: number,
    mainHeight: number,
  ): void {
    const edges = this.edgeInfos(footprint.localWorld)
      .filter((edge) => edge.length >= 14)
      .sort((a, b) => b.length - a.length)
      .slice(0, 2);
    const placements: InstancePlacement[] = [];

    for (const edge of edges) {
      const bladeCount = 9;
      const bandWidth = edge.length * 0.58;
      for (let row = 0; row < rows; row++) {
        const centerY = mainHeight * (0.38 + row * 0.18);
        for (let blade = 0; blade < bladeCount; blade++) {
          const y = centerY - 1.5 + (3 * (blade + 0.5)) / bladeCount;
          const point = edge.a.clone().lerp(edge.b, 0.5).addScaledVector(edge.outward, 0.14);
          placements.push({
            position: new THREE.Vector3(point.x, y, point.y),
            rotationY: edge.angle,
            scale: new THREE.Vector3(bandWidth, 0.09, 0.28),
          });
        }
      }
    }

    this.addInstances(
      target,
      `${item.id}_LOUVERS`,
      placements,
      this.materials.get("louverMetal"),
      "louver",
      item.id,
    );
  }

  private addLoadingBays(
    target: THREE.Group,
    item: FactoryBuilding,
    footprint: ResolvedFootprint,
    profile: BuildingStyleProfile,
    count: number,
  ): void {
    const edge = this.edgeInfos(footprint.localWorld).sort((a, b) => b.length - a.length)[0];
    if (!edge || edge.length < 14) return;

    const doorWidth = Math.max(3.8, Math.min(6, edge.length / (count * 1.7)));
    const doorHeight = Math.max(3.4, Math.min(5.2, item.z * 0.32));
    const doors: InstancePlacement[] = [];
    const canopies: InstancePlacement[] = [];

    for (let index = 0; index < count; index++) {
      const point = edge.a.clone().lerp(edge.b, (index + 1) / (count + 1));
      const doorPoint = point.clone().addScaledVector(edge.outward, 0.13);
      doors.push({
        position: new THREE.Vector3(doorPoint.x, doorHeight / 2 + 0.12, doorPoint.y),
        rotationY: edge.angle,
        scale: new THREE.Vector3(doorWidth, doorHeight, 0.22),
      });
      const canopyPoint = point.clone().addScaledVector(edge.outward, 1.4);
      canopies.push({
        position: new THREE.Vector3(canopyPoint.x, doorHeight + 0.65, canopyPoint.y),
        rotationY: edge.angle,
        scale: new THREE.Vector3(doorWidth + 0.8, 0.18, 2.8),
      });
    }

    this.addInstances(
      target,
      `${item.id}_LOADING_DOORS`,
      doors,
      this.materials.get("loadingDoor"),
      "loading_bay",
      item.id,
    );
    if (item.facade?.canopy !== false) {
      this.addInstances(
        target,
        `${item.id}_LOADING_CANOPIES`,
        canopies,
        this.materials.get(profile.materials.trim),
        "canopy",
        item.id,
      );
    }
  }

  private addEntrance(
    target: THREE.Group,
    item: FactoryBuilding,
    footprint: ResolvedFootprint,
    profile: BuildingStyleProfile,
    frontEdgeIndex: number,
  ): void {
    const override = item.facade?.entrance;
    const enabled = override?.enabled ?? profile.entrance.enabled;
    if (!enabled) return;

    const requestedEdge =
      override?.edgeIndex !== undefined && Number.isInteger(override.edgeIndex)
        ? Math.max(0, Math.min(override.edgeIndex, footprint.localWorld.length - 1))
        : frontEdgeIndex;
    const edge = this.edgeInfos(footprint.localWorld)[requestedEdge];
    if (!edge || edge.length < 8) return;

    const width = Math.min(override?.width ?? profile.entrance.width, edge.length * 0.42);
    const depth = override?.depth ?? profile.entrance.depth;
    const height = Math.min(override?.height ?? profile.entrance.height, item.z * 0.42);
    const canopyDepth = override?.canopyDepth ?? profile.entrance.canopyDepth;
    const t = Math.max(0.2, Math.min(0.8, override?.offset ?? 0.5));
    const anchor = edge.a.clone().lerp(edge.b, t);

    const vestibuleCenter = anchor.clone().addScaledVector(edge.outward, depth / 2 - 0.15);
    const vestibule = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      this.materials.get(profile.materials.glass),
    );
    vestibule.name = `${item.id}_ENTRANCE_VESTIBULE`;
    vestibule.position.set(vestibuleCenter.x, height / 2, vestibuleCenter.y);
    vestibule.rotation.y = edge.angle;
    vestibule.castShadow = true;
    vestibule.receiveShadow = true;
    vestibule.userData = { assetType: "entrance", parentAssetId: item.id };
    target.add(vestibule);

    const canopyCenter = anchor.clone().addScaledVector(edge.outward, depth + canopyDepth / 2 - 0.3);
    const canopy = new THREE.Mesh(
      new THREE.BoxGeometry(width + 2, 0.26, canopyDepth),
      this.materials.get(profile.materials.trim),
    );
    canopy.name = `${item.id}_ENTRANCE_CANOPY`;
    canopy.position.set(canopyCenter.x, height - 0.35, canopyCenter.y);
    canopy.rotation.y = edge.angle;
    canopy.castShadow = true;
    canopy.userData = { assetType: "entrance_canopy", parentAssetId: item.id };
    target.add(canopy);

    const landingCenter = anchor.clone().addScaledVector(edge.outward, depth + 1.4);
    const landing = new THREE.Mesh(
      new THREE.BoxGeometry(width + 3, 0.22, 2.5),
      this.materials.get("architecturalConcrete"),
    );
    landing.name = `${item.id}_ENTRANCE_LANDING`;
    landing.position.set(landingCenter.x, 0.12, landingCenter.y);
    landing.rotation.y = edge.angle;
    landing.receiveShadow = true;
    landing.userData = { assetType: "entrance_landing", parentAssetId: item.id };
    target.add(landing);
  }

  private addRoofscape(
    target: THREE.Group,
    item: FactoryBuilding,
    footprint: ResolvedFootprint,
    profile: BuildingStyleProfile,
  ): void {
    if (profile.roof.screen && item.roof?.screen !== false) {
      const screenHeight = Math.max(
        0.8,
        Math.min(item.roof?.screenHeight ?? profile.massing.roofScreenHeight, 3),
      );
      const placements: InstancePlacement[] = [];
      for (const edge of this.edgeInfos(footprint.localWorld)) {
        if (edge.length < 10) continue;
        const center = edge.a.clone().lerp(edge.b, 0.5).addScaledVector(edge.outward, -1);
        placements.push({
          position: new THREE.Vector3(center.x, item.z + screenHeight / 2, center.y),
          rotationY: edge.angle,
          scale: new THREE.Vector3(edge.length * 0.82, screenHeight, 0.18),
        });
      }
      this.addInstances(
        target,
        `${item.id}_ROOF_SCREEN`,
        placements,
        this.materials.get(profile.materials.accent),
        "roof_screen",
        item.id,
      );
    }

    const configs: Array<{ template: string; count: number; scale?: THREE.Vector3 }> = [
      {
        template: "hvac",
        count: Math.max(0, Math.min(item.roof?.hvacCount ?? (profile.type === "fab" ? 10 : profile.type === "utility" ? 6 : 0), 48)),
      },
      {
        template: "exhaust_stack",
        count: Math.max(0, Math.min(item.roof?.exhaustCount ?? (profile.type === "fab" ? 6 : profile.type === "utility" ? 2 : 0), 48)),
        scale: new THREE.Vector3(0.82, 0.82, 0.82),
      },
      {
        template: "scrubber",
        count: Math.max(0, Math.min(item.roof?.scrubberCount ?? 0, 16)),
        scale: new THREE.Vector3(0.85, 0.85, 0.85),
      },
    ];

    for (let configIndex = 0; configIndex < configs.length; configIndex++) {
      const config = configs[configIndex];
      if (!config.count) continue;
      const transforms = this.generateClusteredRoofTransforms(
        footprint.localWorld,
        config.count,
        item.z + 0.24,
        profile,
        `${item.id}_${config.template}`,
        configIndex,
        config.scale,
      );
      if (!transforms.length) continue;
      target.add(
        createInstancedAssetGroup(
          `${item.id}_${config.template.toUpperCase()}`,
          config.template,
          transforms,
          {
            parentAssetId: item.id,
            placement: "roof",
            layout: "clustered-service-aware",
          },
        ),
      );
    }
  }

  private generateClusteredRoofTransforms(
    polygon: THREE.Vector2[],
    count: number,
    elevation: number,
    profile: BuildingStyleProfile,
    idPrefix: string,
    clusterIndex: number,
    scale?: THREE.Vector3,
  ): AssetInstanceTransform[] {
    const bounds = this.bounds(polygon);
    const edgeSetback = Math.min(
      profile.roof.edgeSetback,
      Math.min(bounds.width, bounds.depth) * 0.18,
    );
    const minX = bounds.minX + edgeSetback;
    const maxX = bounds.maxX - edgeSetback;
    const minZ = bounds.minZ + edgeSetback;
    const maxZ = bounds.maxZ - edgeSetback;
    const width = Math.max(1, maxX - minX);
    const depth = Math.max(1, maxZ - minZ);
    const corridor = Math.min(profile.roof.serviceCorridor, width * 0.18);
    const spacing = Math.max(4.5, profile.roof.clusterSpacing);
    const transforms: AssetInstanceTransform[] = [];

    const clusterCenters = [
      new THREE.Vector2(minX + width * 0.28, minZ + depth * 0.34),
      new THREE.Vector2(minX + width * 0.72, minZ + depth * 0.66),
      new THREE.Vector2(minX + width * 0.72, minZ + depth * 0.3),
    ];
    const cluster = clusterCenters[clusterIndex % clusterCenters.length];
    const columns = Math.max(2, Math.ceil(Math.sqrt(count * 1.5)));
    const rows = Math.max(1, Math.ceil(count / columns));

    for (let row = 0; row < rows && transforms.length < count; row++) {
      for (let column = 0; column < columns && transforms.length < count; column++) {
        const x = cluster.x + (column - (columns - 1) / 2) * spacing;
        const z = cluster.y + (row - (rows - 1) / 2) * spacing;
        const point = new THREE.Vector2(x, z);
        if (x < minX || x > maxX || z < minZ || z > maxZ) continue;
        if (Math.abs(x - (minX + width / 2)) < corridor / 2) continue;
        if (!this.pointInPolygon(point, polygon)) continue;
        transforms.push({
          id: `${idPrefix}_${String(transforms.length + 1).padStart(3, "0")}`,
          position: new THREE.Vector3(x, elevation, z),
          scale: scale?.clone(),
        });
      }
    }

    if (transforms.length < count) {
      const step = Math.max(4, spacing * 0.78);
      for (let z = minZ + step / 2; z < maxZ && transforms.length < count; z += step) {
        for (let x = minX + step / 2; x < maxX && transforms.length < count; x += step) {
          if (Math.abs(x - (minX + width / 2)) < corridor / 2) continue;
          const point = new THREE.Vector2(x, z);
          if (!this.pointInPolygon(point, polygon)) continue;
          if (transforms.some((existing) => Math.hypot(existing.position.x - x, existing.position.z - z) < step * 0.65)) continue;
          transforms.push({
            id: `${idPrefix}_${String(transforms.length + 1).padStart(3, "0")}`,
            position: new THREE.Vector3(x, elevation, z),
            scale: scale?.clone(),
          });
        }
      }
    }
    return transforms;
  }

  private addInstances(
    target: THREE.Group,
    name: string,
    placements: InstancePlacement[],
    material: THREE.Material,
    assetType: string,
    parentAssetId: string,
  ): void {
    if (!placements.length) return;
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = {
      assetType,
      parentAssetId,
      instanceCount: placements.length,
      generatedBy: "BuildingArchitectureGenerator",
    };

    const q = new THREE.Quaternion();
    placements.forEach((placement, index) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), placement.rotationY ?? 0);
      const matrix = new THREE.Matrix4().compose(placement.position, q.clone(), placement.scale);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    target.add(mesh);
  }

  private createExtrudedVolume(
    plan: Point2[],
    height: number,
    materialKey: BuildingStyleProfile["materials"]["body"],
    name: string,
  ): THREE.Mesh {
    const shape = new THREE.Shape();
    shape.moveTo(plan[0].x, plan[0].y);
    for (let index = 1; index < plan.length; index++) shape.lineTo(plan[index].x, plan[index].y);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: height,
      bevelEnabled: false,
      steps: 1,
      curveSegments: 1,
    });
    geometry.rotateX(-Math.PI / 2);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, this.materials.get(materialKey));
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  private resolveFrontEdgeIndex(plan: Point2[]): number {
    if (!plan.length) return 0;
    if (!this.manifest.roads?.length) {
      let longest = 0;
      let best = -1;
      plan.forEach((point, index) => {
        const next = plan[(index + 1) % plan.length];
        const length = Math.hypot(next.x - point.x, next.y - point.y);
        if (length > longest) {
          longest = length;
          best = index;
        }
      });
      return Math.max(0, best);
    }

    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    plan.forEach((point, index) => {
      const next = plan[(index + 1) % plan.length];
      const midpoint = { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 };
      for (const road of this.manifest.roads ?? []) {
        for (let segment = 0; segment < road.points.length - 1; segment++) {
          const a = { x: road.points[segment][0], y: road.points[segment][1] };
          const b = { x: road.points[segment + 1][0], y: road.points[segment + 1][1] };
          const distance = this.distancePointToSegment(midpoint, a, b);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestIndex = index;
          }
        }
      }
    });
    return bestIndex;
  }

  private distancePointToSegment(p: Point2, a: Point2, b: Point2): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared <= 0.000001) return Math.hypot(p.x - a.x, p.y - a.y);
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
    return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
  }

  private edgeInfos(polygon: THREE.Vector2[]): EdgeInfo[] {
    const area = this.signedArea(polygon);
    return polygon.map((a, index) => {
      const b = polygon[(index + 1) % polygon.length];
      const delta = b.clone().sub(a);
      const length = delta.length();
      const direction = length > 0 ? delta.clone().multiplyScalar(1 / length) : new THREE.Vector2(1, 0);
      const outward =
        area > 0
          ? new THREE.Vector2(direction.y, -direction.x)
          : new THREE.Vector2(-direction.y, direction.x);
      return {
        a,
        b,
        index,
        length,
        direction,
        outward,
        angle: -Math.atan2(direction.y, direction.x),
      };
    });
  }

  private signedArea(polygon: THREE.Vector2[]): number {
    let area = 0;
    for (let index = 0; index < polygon.length; index++) {
      const a = polygon[index];
      const b = polygon[(index + 1) % polygon.length];
      area += a.x * b.y - b.x * a.y;
    }
    return area / 2;
  }

  private insetScale(footprint: ResolvedFootprint, inset: number): { x: number; y: number } {
    return {
      x: Math.max(0.82, 1 - (inset * 2) / Math.max(footprint.width, 1)),
      y: Math.max(0.82, 1 - (inset * 2) / Math.max(footprint.depth, 1)),
    };
  }

  private bounds(polygon: THREE.Vector2[]) {
    const xs = polygon.map((point) => point.x);
    const zs = polygon.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    return { minX, maxX, minZ, maxZ, width: maxX - minX, depth: maxZ - minZ };
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
    const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    const localPlan = plan.map((point) => ({ x: point.x - center.x, y: point.y - center.y }));
    return {
      plan,
      localPlan,
      localWorld: localPlan.map((point) => new THREE.Vector2(point.x, -point.y)),
      center,
      width: maxX - minX,
      depth: maxY - minY,
    };
  }
}
