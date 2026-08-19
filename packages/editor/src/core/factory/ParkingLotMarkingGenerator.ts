import * as THREE from "three";
import type { FactoryManifest, FactoryParking, Point2 } from "./FactoryManifest";

interface PlanSegment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

const PARKING_GLYPHS: Record<string, string[]> = {
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01110"],
};

/**
 * Generates parking-lot markings as a dedicated campus layer.
 *
 * Stall grids are InstancedMesh geometry and are hidden at whole-campus camera
 * distances through LOD. PARKING ground labels remain visible at overview
 * distance because they are useful orientation landmarks and are far cheaper
 * than hundreds of individual stall-line segments.
 */
export class ParkingLotMarkingGenerator {
  private readonly white = new THREE.MeshBasicMaterial({
    color: 0xf7f9fa,
    depthTest: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });

  constructor(
    private readonly manifest: FactoryManifest,
    private readonly groundOffset = 0,
  ) {}

  create(): THREE.Group {
    const root = new THREE.Group();
    root.name = "PARKING_DETAILS";
    root.userData = {
      assetType: "parking_details",
      generatedBy: "ParkingLotMarkingGenerator",
    };

    if (!(this.manifest.parking?.length ?? 0)) return root;

    const slots = new THREE.LOD();
    slots.name = "PARKING_SLOTS";
    const nearDetail = new THREE.Group();
    nearDetail.name = "PARKING_SLOTS_NEAR";

    const labels = new THREE.Group();
    labels.name = "PARKING_LABELS";
    labels.userData = { assetType: "parking_labels" };

    for (const parking of this.manifest.parking ?? []) {
      nearDetail.add(this.createParkingGrid(parking));
      labels.add(this.createParkingLabel(parking));
    }

    const overview = new THREE.Group();
    overview.name = "PARKING_SLOTS_OVERVIEW";
    overview.userData = {
      assetType: "parking_slots_overview_placeholder",
      intentionallyEmpty: true,
    };

    const detailDistance = this.resolveParkingDetailDistance();
    slots.addLevel(nearDetail, 0);
    slots.addLevel(overview, detailDistance);
    slots.userData = {
      assetType: "parking_slots_lod",
      detailDistance,
      behavior: "show complete stall grids only at near/mid camera distance",
    };

    root.add(slots, labels);
    return root;
  }

  private createParkingGrid(item: FactoryParking): THREE.Group {
    const group = new THREE.Group();
    group.name = `${item.id}_SLOTS`;
    group.userData = {
      assetType: "parking_slots",
      parentAssetId: item.id,
      layout: "closed-stall-grid",
    };

    const slotWidth = 2.7;
    const slotDepth = 5.3;
    const lineWidth = 0.14;
    const lineHeight = 0.03;
    const segments: PlanSegment[] = [];
    const segmentKeys = new Set<string>();

    const pushSegment = (ax: number, ay: number, bx: number, by: number) => {
      const a = `${ax.toFixed(3)},${ay.toFixed(3)}`;
      const b = `${bx.toFixed(3)},${by.toFixed(3)}`;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (segmentKeys.has(key)) return;
      segmentKeys.add(key);
      segments.push({ ax, ay, bx, by });
    };

    // Always frame the complete parking polygon first. Row-grid segments are
    // deduplicated against this outer boundary below.
    pushSegment(item.x, item.y, item.x + item.w, item.y);
    pushSegment(item.x + item.w, item.y, item.x + item.w, item.y + item.h);
    pushSegment(item.x + item.w, item.y + item.h, item.x, item.y + item.h);
    pushSegment(item.x, item.y + item.h, item.x, item.y);

    if (item.w >= item.h) {
      const count = Math.max(1, Math.floor(item.w / slotWidth));
      const actualWidth = item.w / count;
      const depth = Math.min(slotDepth, item.h);
      const rowStarts = item.h >= slotDepth * 2.1 ? [item.y, item.y + item.h - depth] : [item.y];

      for (const startY of rowStarts) {
        pushSegment(item.x, startY, item.x + item.w, startY);
        pushSegment(item.x, startY + depth, item.x + item.w, startY + depth);
        for (let index = 0; index <= count; index++) {
          const x = item.x + index * actualWidth;
          pushSegment(x, startY, x, startY + depth);
        }
      }
    } else {
      const count = Math.max(1, Math.floor(item.h / slotWidth));
      const actualWidth = item.h / count;
      const depth = Math.min(slotDepth, item.w);
      const rowStarts = item.w >= slotDepth * 2.1 ? [item.x, item.x + item.w - depth] : [item.x];

      for (const startX of rowStarts) {
        pushSegment(startX, item.y, startX, item.y + item.h);
        pushSegment(startX + depth, item.y, startX + depth, item.y + item.h);
        for (let index = 0; index <= count; index++) {
          const y = item.y + index * actualWidth;
          pushSegment(startX, y, startX + depth, y);
        }
      }
    }

    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      this.white,
      segments.length,
    );
    mesh.name = `${item.id}_STALL_GRID`;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.renderOrder = 40;
    mesh.userData = {
      assetType: "parking_stall_line",
      parentAssetId: item.id,
      instanceCount: segments.length,
      surfaceLayer: "parking_marking",
    };

    const xAxis = new THREE.Vector3(1, 0, 0);
    segments.forEach((segment, index) => {
      const a = this.planToWorld(segment.ax, segment.ay, 0.112);
      const b = this.planToWorld(segment.bx, segment.by, 0.112);
      const delta = b.clone().sub(a);
      const length = delta.length();
      const tangent = length > 0.0001 ? delta.multiplyScalar(1 / length) : xAxis;
      const quaternion = new THREE.Quaternion().setFromUnitVectors(xAxis, tangent);
      const matrix = new THREE.Matrix4().compose(
        a.clone().lerp(b, 0.5),
        quaternion,
        new THREE.Vector3(length, lineHeight, lineWidth),
      );
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    return group;
  }

  private createParkingLabel(item: FactoryParking): THREE.Group {
    const group = new THREE.Group();
    group.name = `${item.id}_PARKING_LABEL`;
    group.userData = {
      assetType: "parking_label",
      parentAssetId: item.id,
      text: "PARKING",
    };

    const text = "PARKING";
    const glyphWidth = 5;
    const glyphHeight = 7;
    const gap = 1;
    const totalColumns = text.length * glyphWidth + (text.length - 1) * gap;
    const longSide = Math.max(item.w, item.h);
    const shortSide = Math.min(item.w, item.h);
    const targetWidth = Math.min(longSide * 0.52, 32);
    const pixel = Math.max(0.32, Math.min(targetWidth / totalColumns, shortSide / 10));
    const litCells: Array<{ x: number; z: number }> = [];

    let cursor = 0;
    for (const letter of text) {
      const glyph = PARKING_GLYPHS[letter];
      for (let row = 0; row < glyphHeight; row++) {
        for (let column = 0; column < glyphWidth; column++) {
          if (glyph[row][column] !== "1") continue;
          litCells.push({
            x: (cursor + column + 0.5 - totalColumns / 2) * pixel,
            z: (row + 0.5 - glyphHeight / 2) * pixel,
          });
        }
      }
      cursor += glyphWidth + gap;
    }

    const pixels = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      this.white,
      litCells.length,
    );
    pixels.name = `${item.id}_PARKING_TEXT_PIXELS`;
    pixels.renderOrder = 40;
    pixels.userData = {
      assetType: "parking_label_pixel",
      parentAssetId: item.id,
      text: "PARKING",
      instanceCount: litCells.length,
      surfaceLayer: "parking_marking",
    };

    const rotationY = item.w >= item.h ? 0 : Math.PI / 2;
    const quaternion = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      rotationY,
    );
    const center = this.resolveLabelCenter(item);
    const worldCenter = this.planToWorld(center.x, center.y, 0.116);
    const cellSize = pixel * 0.84;

    litCells.forEach((cell, index) => {
      const local = new THREE.Vector3(cell.x, 0, cell.z).applyQuaternion(quaternion);
      const matrix = new THREE.Matrix4().compose(
        worldCenter.clone().add(local),
        quaternion,
        new THREE.Vector3(cellSize, 0.03, cellSize),
      );
      pixels.setMatrixAt(index, matrix);
    });
    pixels.instanceMatrix.needsUpdate = true;
    pixels.computeBoundingSphere();
    group.add(pixels);
    return group;
  }

  private resolveLabelCenter(item: FactoryParking): Point2 {
    const slotDepth = 5.3;
    if (item.w >= item.h) {
      if (item.h >= slotDepth * 2.1) {
        return { x: item.x + item.w / 2, y: item.y + item.h / 2 };
      }
      if (item.h > slotDepth + 3) {
        return {
          x: item.x + item.w / 2,
          y: item.y + slotDepth + (item.h - slotDepth) / 2,
        };
      }
    } else {
      if (item.w >= slotDepth * 2.1) {
        return { x: item.x + item.w / 2, y: item.y + item.h / 2 };
      }
      if (item.w > slotDepth + 3) {
        return {
          x: item.x + slotDepth + (item.w - slotDepth) / 2,
          y: item.y + item.h / 2,
        };
      }
    }
    return { x: item.x + item.w / 2, y: item.y + item.h / 2 };
  }

  private planToWorld(x: number, y: number, elevation = 0): THREE.Vector3 {
    return new THREE.Vector3(x, this.groundOffset + elevation, -y);
  }

  private resolveParkingDetailDistance(): number {
    const span = this.estimateCampusSpan();
    return Math.max(220, Math.min(700, span * 0.72));
  }

  private estimateCampusSpan(): number {
    const points: Point2[] = [];
    points.push(...(this.manifest.siteBoundary ?? []));

    for (const building of this.manifest.buildings ?? []) {
      if (building.footprint?.length) {
        points.push(...building.footprint);
      } else if (
        Number.isFinite(building.x) &&
        Number.isFinite(building.y) &&
        Number.isFinite(building.w) &&
        Number.isFinite(building.h)
      ) {
        const x = building.x!;
        const y = building.y!;
        const w = building.w!;
        const h = building.h!;
        points.push({ x, y }, { x: x + w, y: y + h });
      }
    }

    for (const road of this.manifest.roads ?? []) {
      for (const [x, y] of road.points ?? []) points.push({ x, y });
    }

    for (const parking of this.manifest.parking ?? []) {
      points.push(
        { x: parking.x, y: parking.y },
        { x: parking.x + parking.w, y: parking.y + parking.h },
      );
    }

    if (!points.length) return 600;
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    return Math.max(
      Math.max(...xs) - Math.min(...xs),
      Math.max(...ys) - Math.min(...ys),
      1,
    );
  }
}
