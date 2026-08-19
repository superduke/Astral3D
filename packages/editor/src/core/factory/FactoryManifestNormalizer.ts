import type { FactoryManifest, Point2 } from "./FactoryManifest";

export interface FactoryManifestNormalizationResult {
  origin: Point2;
  width: number;
  depth: number;
  rebased: boolean;
  warning?: string;
}

function collectPlanPoints(manifest: FactoryManifest): Point2[] {
  const points: Point2[] = [];
  const push = (x?: number, y?: number) => {
    if (Number.isFinite(x) && Number.isFinite(y)) points.push({ x: x!, y: y! });
  };

  manifest.siteBoundary?.forEach((point) => push(point.x, point.y));
  for (const building of manifest.buildings ?? []) {
    if (building.footprint?.length) {
      building.footprint.forEach((point) => push(point.x, point.y));
    } else {
      push(building.x, building.y);
      if (
        Number.isFinite(building.x) &&
        Number.isFinite(building.y) &&
        Number.isFinite(building.w) &&
        Number.isFinite(building.h)
      ) {
        push(building.x! + building.w!, building.y! + building.h!);
      }
    }
  }
  for (const road of manifest.roads ?? []) road.points?.forEach(([x, y]) => push(x, y));
  for (const item of manifest.parking ?? []) {
    push(item.x, item.y);
    push(item.x + item.w, item.y + item.h);
  }
  for (const polygon of manifest.greenAreas ?? []) polygon.forEach((point) => push(point.x, point.y));
  for (const rack of manifest.pipeRacks ?? []) rack.path.forEach(([x, y]) => push(x, y));
  for (const gate of manifest.campus?.gates ?? []) push(gate.x, gate.y);
  for (const batch of manifest.assets ?? []) {
    batch.positions?.forEach((item) => push(item.x, item.y));
    if (batch.grid) push(batch.grid.origin.x, batch.grid.origin.y);
    if (batch.line) {
      push(batch.line.start.x, batch.line.start.y);
      push(batch.line.end.x, batch.line.end.y);
    }
  }
  return points;
}

function translatePoint(point: Point2, origin: Point2): void {
  point.x -= origin.x;
  point.y -= origin.y;
}

/**
 * Rebase all plan-space coordinates around the factory extent before any
 * BufferGeometry or InstancedMesh data is created. This avoids writing large
 * CAD / survey coordinates directly into Float32 GPU attributes.
 *
 * The operation mutates the manifest intentionally so every downstream stage
 * (procedural scene, semantic anchors, GLB replacement, EHS runtime) shares the
 * exact same local coordinate frame.
 */
export function normalizeFactoryManifestCoordinates(
  manifest: FactoryManifest,
): FactoryManifestNormalizationResult {
  const points = collectPlanPoints(manifest);
  if (!points.length) {
    return { origin: { x: 0, y: 0 }, width: 0, depth: 0, rebased: false };
  }

  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const origin = {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
  };
  const width = maxX - minX;
  const depth = maxY - minY;

  // Keep exact already-local plans stable. A small translation is visually
  // irrelevant and can otherwise create noisy diffs when serializing scenes.
  const rebased = Math.abs(origin.x) > 1e-6 || Math.abs(origin.y) > 1e-6;
  if (rebased) {
    manifest.siteBoundary?.forEach((point) => translatePoint(point, origin));

    for (const building of manifest.buildings ?? []) {
      building.footprint?.forEach((point) => translatePoint(point, origin));
      if (Number.isFinite(building.x)) building.x! -= origin.x;
      if (Number.isFinite(building.y)) building.y! -= origin.y;
    }

    for (const road of manifest.roads ?? []) {
      road.points?.forEach((point) => {
        point[0] -= origin.x;
        point[1] -= origin.y;
      });
    }

    for (const item of manifest.parking ?? []) {
      item.x -= origin.x;
      item.y -= origin.y;
    }

    for (const polygon of manifest.greenAreas ?? []) {
      polygon.forEach((point) => translatePoint(point, origin));
    }

    for (const rack of manifest.pipeRacks ?? []) {
      rack.path.forEach((point) => {
        point[0] -= origin.x;
        point[1] -= origin.y;
      });
    }

    for (const gate of manifest.campus?.gates ?? []) {
      gate.x -= origin.x;
      gate.y -= origin.y;
    }

    for (const batch of manifest.assets ?? []) {
      batch.positions?.forEach((item) => {
        item.x -= origin.x;
        item.y -= origin.y;
      });
      if (batch.grid) translatePoint(batch.grid.origin, origin);
      if (batch.line) {
        translatePoint(batch.line.start, origin);
        translatePoint(batch.line.end, origin);
      }
    }
  }

  if (manifest.meta) {
    const meta = manifest.meta as typeof manifest.meta & {
      sourcePlanOrigin?: Point2;
      localCoordinateFrame?: string;
    };
    meta.sourcePlanOrigin = origin;
    meta.localCoordinateFrame = "CENTER_REBASED_X_EAST_Y_NORTH";
  }

  const horizontal = Math.max(width, depth);
  let warning: string | undefined;
  if (horizontal > 20_000) {
    warning = `园区平面跨度 ${horizontal.toFixed(1)}m，疑似单位/比例异常或包含远离主体的 CAD 实体。`;
  } else if (horizontal > 0 && horizontal < 20) {
    warning = `园区平面跨度仅 ${horizontal.toFixed(2)}m，疑似单位/比例异常。`;
  }

  return { origin, width, depth, rebased, warning };
}
