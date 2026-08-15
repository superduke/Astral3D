import * as THREE from "three";
import type {
  FactoryCampusDetails,
  FactoryGate,
  FactoryManifest,
  FactoryParking,
  FactoryRoad,
  Point2,
} from "./FactoryManifest";

export class CampusDetailGenerator {
  constructor(private readonly groundOffset = 0) {}

  create(manifest: FactoryManifest): THREE.Group {
    const group = new THREE.Group();
    group.name = "CAMPUS_DETAILS";
    group.userData = { assetType: "campus_details" };

    const config: FactoryCampusDetails = manifest.campus ?? {};

    if (config.roadMarkings !== false) {
      const roadMarkings = new THREE.Group();
      roadMarkings.name = "ROAD_MARKINGS";
      for (const road of manifest.roads ?? []) {
        roadMarkings.add(this.createRoadMarkings(road));
      }
      group.add(roadMarkings);
    }

    if (config.parkingSlots !== false) {
      const parkingSlots = new THREE.Group();
      parkingSlots.name = "PARKING_SLOTS";
      for (const parking of manifest.parking ?? []) {
        parkingSlots.add(this.createParkingSlots(parking));
      }
      group.add(parkingSlots);
    }

    if (config.perimeterFence !== false && (manifest.siteBoundary?.length ?? 0) >= 3) {
      group.add(
        this.createFence(
          manifest.siteBoundary!,
          config.fenceHeight ?? 2.4,
          config.fencePostSpacing ?? 6,
        ),
      );
    }

    if (config.gates?.length) {
      const gates = new THREE.Group();
      gates.name = "GATES";
      for (const gate of config.gates) gates.add(this.createGate(gate));
      group.add(gates);
    }

    return group;
  }

  private planToWorld(x: number, y: number, elevation = 0): THREE.Vector3 {
    return new THREE.Vector3(x, this.groundOffset + elevation, -y);
  }

  private createRoadMarkings(road: FactoryRoad): THREE.Group {
    const group = new THREE.Group();
    group.name = `${road.id}_MARKINGS`;
    group.userData = {
      assetType: "road_marking",
      parentAssetId: road.id,
    };

    const white = new THREE.MeshBasicMaterial({ color: 0xe8ecef });
    const yellow = new THREE.MeshBasicMaterial({ color: 0xd8b74f });
    const points = road.points ?? [];

    for (let index = 0; index < points.length - 1; index++) {
      const a = this.planToWorld(points[index][0], points[index][1], 0.115);
      const b = this.planToWorld(points[index + 1][0], points[index + 1][1], 0.115);
      const delta = b.clone().sub(a);
      const length = delta.length();
      if (length <= 0.001) continue;
      const tangent = delta.clone().normalize();
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

      const halfWidth = road.width / 2;
      for (const side of [-1, 1]) {
        const offset = Math.max(0.4, halfWidth - 0.45) * side;
        const center = a.clone().lerp(b, 0.5).addScaledVector(normal, offset);
        const edge = new THREE.Mesh(
          new THREE.BoxGeometry(0.09, 0.025, length),
          white,
        );
        edge.name = `${road.id}_EDGE_${index + 1}_${side > 0 ? "R" : "L"}`;
        edge.position.copy(center);
        edge.rotation.y = Math.atan2(tangent.x, tangent.z);
        group.add(edge);
      }

      const dashLength = 3.2;
      const gap = 4.0;
      const stride = dashLength + gap;
      const dashCount = Math.max(1, Math.floor(length / stride));
      for (let dashIndex = 0; dashIndex < dashCount; dashIndex++) {
        const distance = Math.min(
          length - dashLength / 2,
          dashIndex * stride + dashLength / 2 + 0.8,
        );
        const center = a.clone().addScaledVector(tangent, distance);
        const dash = new THREE.Mesh(
          new THREE.BoxGeometry(0.12, 0.03, dashLength),
          yellow,
        );
        dash.name = `${road.id}_CENTER_DASH_${index + 1}_${dashIndex + 1}`;
        dash.position.copy(center);
        dash.rotation.y = Math.atan2(tangent.x, tangent.z);
        group.add(dash);
      }
    }

    return group;
  }

  private createParkingSlots(item: FactoryParking): THREE.Group {
    const group = new THREE.Group();
    group.name = `${item.id}_SLOTS`;
    group.userData = {
      assetType: "parking_slots",
      parentAssetId: item.id,
    };

    const lineMaterial = new THREE.MeshBasicMaterial({ color: 0xf1f3f4 });
    const slotWidth = 2.7;
    const slotDepth = 5.3;
    const lineWidth = 0.07;
    const y = this.groundOffset + 0.095;

    if (item.w >= item.h) {
      const count = Math.max(1, Math.floor(item.w / slotWidth));
      const actualWidth = item.w / count;
      const rows = item.h >= slotDepth * 2.1 ? [0, 1] : [0];
      for (let index = 0; index <= count; index++) {
        const x = item.x + index * actualWidth;
        for (const row of rows) {
          const startY = row === 0 ? item.y : item.y + item.h - slotDepth;
          const line = new THREE.Mesh(
            new THREE.BoxGeometry(lineWidth, 0.025, Math.min(slotDepth, item.h)),
            lineMaterial,
          );
          const center = this.planToWorld(x, startY + Math.min(slotDepth, item.h) / 2, 0.095);
          line.position.set(center.x, y, center.z);
          group.add(line);
        }
      }
    } else {
      const count = Math.max(1, Math.floor(item.h / slotWidth));
      const actualWidth = item.h / count;
      const rows = item.w >= slotDepth * 2.1 ? [0, 1] : [0];
      for (let index = 0; index <= count; index++) {
        const planY = item.y + index * actualWidth;
        for (const row of rows) {
          const startX = row === 0 ? item.x : item.x + item.w - slotDepth;
          const line = new THREE.Mesh(
            new THREE.BoxGeometry(Math.min(slotDepth, item.w), 0.025, lineWidth),
            lineMaterial,
          );
          const center = this.planToWorld(startX + Math.min(slotDepth, item.w) / 2, planY, 0.095);
          line.position.set(center.x, y, center.z);
          group.add(line);
        }
      }
    }

    return group;
  }

  private createFence(
    boundary: Point2[],
    height: number,
    postSpacing: number,
  ): THREE.Group {
    const group = new THREE.Group();
    group.name = "PERIMETER_FENCE";
    group.userData = { assetType: "perimeter_fence" };

    const steel = new THREE.MeshStandardMaterial({
      color: 0x59656b,
      roughness: 0.58,
      metalness: 0.42,
    });
    const postGeometry = new THREE.BoxGeometry(0.12, height, 0.12);
    const postTransforms: THREE.Matrix4[] = [];

    for (let edgeIndex = 0; edgeIndex < boundary.length; edgeIndex++) {
      const aPlan = boundary[edgeIndex];
      const bPlan = boundary[(edgeIndex + 1) % boundary.length];
      const a = this.planToWorld(aPlan.x, aPlan.y);
      const b = this.planToWorld(bPlan.x, bPlan.y);
      const delta = b.clone().sub(a);
      const length = delta.length();
      if (length <= 0.001) continue;
      const tangent = delta.clone().normalize();
      const count = Math.max(1, Math.ceil(length / Math.max(2, postSpacing)));

      for (let index = 0; index < count; index++) {
        const t = index / count;
        const position = a.clone().lerp(b, t);
        position.y = this.groundOffset + height / 2;
        postTransforms.push(new THREE.Matrix4().makeTranslation(position.x, position.y, position.z));
      }

      for (const railY of [height * 0.35, height * 0.78]) {
        const rail = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, 0.08, length),
          steel,
        );
        rail.name = `FENCE_RAIL_${edgeIndex + 1}_${railY}`;
        rail.position.copy(a.clone().lerp(b, 0.5));
        rail.position.y = this.groundOffset + railY;
        rail.rotation.y = Math.atan2(tangent.x, tangent.z);
        group.add(rail);
      }
    }

    if (postTransforms.length) {
      const posts = new THREE.InstancedMesh(postGeometry, steel, postTransforms.length);
      posts.name = "FENCE_POSTS";
      postTransforms.forEach((matrix, index) => posts.setMatrixAt(index, matrix));
      posts.instanceMatrix.needsUpdate = true;
      posts.userData = {
        assetType: "fence_post",
        instanceCount: postTransforms.length,
      };
      group.add(posts);
    }

    return group;
  }

  private createGate(item: FactoryGate): THREE.Group {
    const group = new THREE.Group();
    group.name = item.id;
    group.userData = {
      assetId: item.id,
      assetType: "site_gate",
      label: item.label ?? item.id,
    };

    const width = Math.max(4, item.width ?? 10);
    const height = Math.max(2.2, item.height ?? 3.2);
    const angle = THREE.MathUtils.degToRad(item.rotationDeg ?? 0);
    const steel = new THREE.MeshStandardMaterial({
      color: 0x47535a,
      roughness: 0.52,
      metalness: 0.45,
    });
    const warning = new THREE.MeshStandardMaterial({
      color: 0xd6b34d,
      roughness: 0.55,
      metalness: 0.18,
    });

    const left = new THREE.Mesh(new THREE.BoxGeometry(0.35, height, 0.35), steel);
    const right = left.clone();
    const top = new THREE.Mesh(new THREE.BoxGeometry(width, 0.32, 0.38), steel);
    const barrier = new THREE.Mesh(new THREE.BoxGeometry(width * 0.82, 0.14, 0.18), warning);

    left.position.set(-width / 2, height / 2, 0);
    right.position.set(width / 2, height / 2, 0);
    top.position.set(0, height, 0);
    barrier.position.set(0, 1.0, 0.25);

    group.add(left, right, top, barrier);
    const world = this.planToWorld(item.x, item.y);
    group.position.set(world.x, this.groundOffset, world.z);
    group.rotation.y = angle;
    return group;
  }
}
