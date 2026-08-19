import * as THREE from "three";
import type { FactoryBuilding } from "./FactoryManifest";

export class BuildingFacadeGenerator {
  create(
    item: FactoryBuilding,
    polygon: THREE.Vector2[],
    buildingType: string,
  ): THREE.Group {
    const group = new THREE.Group();
    group.name = `${item.id}_FACADE_DETAILS`;
    group.userData = {
      assetType: "facade_details",
      parentAssetId: item.id,
    };

    const panelWidth = Math.max(2.5, item.facade?.panelWidth ?? 6);
    const panelJoints = item.facade?.panelJoints ?? buildingType === "fab";
    if (panelJoints) {
      this.addPanelJoints(group, item, polygon, panelWidth);
    }

    const louverBands = Math.max(
      0,
      Math.min(
        item.facade?.louverBands ?? (buildingType === "utility" ? 2 : 0),
        6,
      ),
    );
    if (louverBands > 0) {
      this.addLouverBands(group, item, polygon, louverBands);
    }

    const loadingBayCount = Math.max(
      0,
      Math.min(
        item.facade?.loadingBayCount ??
          (buildingType === "warehouse" ? 4 : buildingType === "support" ? 2 : 0),
        12,
      ),
    );
    if (loadingBayCount > 0) {
      this.addLoadingBays(
        group,
        item,
        polygon,
        loadingBayCount,
        item.facade?.canopy !== false,
      );
    }

    return group;
  }

  private addPanelJoints(
    group: THREE.Group,
    item: FactoryBuilding,
    polygon: THREE.Vector2[],
    panelWidth: number,
  ): void {
    const material = new THREE.MeshStandardMaterial({
      color: 0xaab4ba,
      roughness: 0.78,
      metalness: 0.12,
    });

    polygon.forEach((a, edgeIndex) => {
      const b = polygon[(edgeIndex + 1) % polygon.length];
      const edge = b.clone().sub(a);
      const length = edge.length();
      if (length < panelWidth * 1.4) return;

      const direction = edge.normalize();
      const count = Math.floor(length / panelWidth);
      for (let i = 1; i < count; i++) {
        const distance = (length * i) / count;
        const point = a.clone().addScaledVector(direction, distance);
        const joint = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, item.z * 0.96, 0.14),
          material,
        );
        joint.name = `${item.id}_PANEL_JOINT_${edgeIndex + 1}_${i}`;
        joint.position.set(point.x, item.z * 0.48, point.y);
        joint.rotation.y = -Math.atan2(direction.y, direction.x);
        joint.userData = {
          assetType: "facade_panel_joint",
          parentAssetId: item.id,
        };
        group.add(joint);
      }
    });
  }

  private addLouverBands(
    group: THREE.Group,
    item: FactoryBuilding,
    polygon: THREE.Vector2[],
    bandCount: number,
  ): void {
    const candidates = polygon
      .map((a, index) => ({
        a,
        b: polygon[(index + 1) % polygon.length],
        index,
        length: a.distanceTo(polygon[(index + 1) % polygon.length]),
      }))
      .filter((edge) => edge.length >= 12)
      .sort((a, b) => b.length - a.length)
      .slice(0, 2);

    const frameMaterial = new THREE.MeshStandardMaterial({
      color: 0x596970,
      roughness: 0.58,
      metalness: 0.32,
    });
    const bladeMaterial = new THREE.MeshStandardMaterial({
      color: 0x718088,
      roughness: 0.62,
      metalness: 0.28,
    });

    candidates.forEach((edge) => {
      const dx = edge.b.x - edge.a.x;
      const dz = edge.b.y - edge.a.y;
      const length = Math.hypot(dx, dz);
      if (length <= 0.001) return;
      const angle = -Math.atan2(dz, dx);
      const coverage = 0.58;
      const bandLength = length * coverage;
      const height = Math.max(2.2, Math.min(4.2, item.z * 0.18));

      for (let band = 0; band < bandCount; band++) {
        const y = item.z * (0.30 + band * 0.20);
        const frame = new THREE.Mesh(
          new THREE.BoxGeometry(bandLength, height, 0.18),
          frameMaterial,
        );
        frame.name = `${item.id}_LOUVER_FRAME_${edge.index + 1}_${band + 1}`;
        frame.position.set(
          (edge.a.x + edge.b.x) / 2,
          y,
          (edge.a.y + edge.b.y) / 2,
        );
        frame.rotation.y = angle;
        group.add(frame);

        const bladeCount = Math.max(4, Math.floor(height / 0.42));
        for (let blade = 0; blade < bladeCount; blade++) {
          const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(bandLength * 0.96, 0.08, 0.26),
            bladeMaterial,
          );
          mesh.name = `${item.id}_LOUVER_${edge.index + 1}_${band + 1}_${blade + 1}`;
          mesh.position.copy(frame.position);
          mesh.position.y = y - height / 2 + ((blade + 0.5) * height) / bladeCount;
          mesh.rotation.y = angle;
          mesh.rotation.x = -0.35;
          mesh.userData = {
            assetType: "louver",
            parentAssetId: item.id,
          };
          group.add(mesh);
        }
      }
    });
  }

  private addLoadingBays(
    group: THREE.Group,
    item: FactoryBuilding,
    polygon: THREE.Vector2[],
    count: number,
    canopyEnabled: boolean,
  ): void {
    const edges = polygon
      .map((a, index) => ({
        a,
        b: polygon[(index + 1) % polygon.length],
        index,
        length: a.distanceTo(polygon[(index + 1) % polygon.length]),
      }))
      .sort((a, b) => b.length - a.length);

    const edge = edges[0];
    if (!edge || edge.length < 14) return;

    const direction = edge.b.clone().sub(edge.a).normalize();
    const normal = new THREE.Vector2(-direction.y, direction.x);
    const doorWidth = Math.max(3.8, Math.min(6.5, edge.length / (count * 1.7)));
    const doorHeight = Math.max(3.6, Math.min(5.5, item.z * 0.28));
    const doorMaterial = new THREE.MeshStandardMaterial({
      color: 0x59666d,
      roughness: 0.56,
      metalness: 0.35,
    });
    const canopyMaterial = new THREE.MeshStandardMaterial({
      color: 0x9aa8af,
      roughness: 0.58,
      metalness: 0.28,
    });

    for (let index = 0; index < count; index++) {
      const t = (index + 1) / (count + 1);
      const point = edge.a.clone().lerp(edge.b, t);
      const outside = point.clone().addScaledVector(normal, 0.18);
      const angle = -Math.atan2(direction.y, direction.x);

      const door = new THREE.Mesh(
        new THREE.BoxGeometry(doorWidth, doorHeight, 0.22),
        doorMaterial,
      );
      door.name = `${item.id}_LOADING_BAY_${String(index + 1).padStart(2, "0")}`;
      door.position.set(outside.x, doorHeight / 2 + 0.12, outside.y);
      door.rotation.y = angle;
      door.userData = {
        assetType: "loading_bay",
        parentAssetId: item.id,
      };
      group.add(door);

      if (!canopyEnabled) continue;
      const canopyCenter = point.clone().addScaledVector(normal, 1.45);
      const canopy = new THREE.Mesh(
        new THREE.BoxGeometry(doorWidth + 0.8, 0.18, 2.8),
        canopyMaterial,
      );
      canopy.name = `${item.id}_CANOPY_${String(index + 1).padStart(2, "0")}`;
      canopy.position.set(canopyCenter.x, doorHeight + 0.65, canopyCenter.y);
      canopy.rotation.y = angle;
      canopy.userData = {
        assetType: "canopy",
        parentAssetId: item.id,
      };
      group.add(canopy);
    }
  }
}
