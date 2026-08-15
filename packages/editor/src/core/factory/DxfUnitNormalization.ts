import type { FactoryManifest, Point2 } from "./FactoryManifest";

export interface DxfUnitNormalizationOptions {
  defaultRoadWidth?: number;
}

export interface DxfUnitNormalizationResult {
  code?: number;
  sourceUnit: string;
  scaleToMeter: number;
  converted: boolean;
  note: string;
}

interface DxfUnitDefinition {
  label: string;
  scaleToMeter: number;
}

// AutoCAD $INSUNITS values that are relevant to architectural / factory CAD.
// Unknown or unitless drawings are intentionally not guessed: a wrong automatic
// scale is more damaging than an explicit visual-audit warning.
const DXF_UNITS: Record<number, DxfUnitDefinition> = {
  1: { label: "inch", scaleToMeter: 0.0254 },
  2: { label: "foot", scaleToMeter: 0.3048 },
  3: { label: "mile", scaleToMeter: 1609.344 },
  4: { label: "millimeter", scaleToMeter: 0.001 },
  5: { label: "centimeter", scaleToMeter: 0.01 },
  6: { label: "meter", scaleToMeter: 1 },
  7: { label: "kilometer", scaleToMeter: 1000 },
  10: { label: "yard", scaleToMeter: 0.9144 },
  14: { label: "decimeter", scaleToMeter: 0.1 },
  15: { label: "decameter", scaleToMeter: 10 },
  16: { label: "hectometer", scaleToMeter: 100 },
};

function readInsUnitsCode(source: string): number | undefined {
  const lines = source.replace(/\r/g, "").split("\n");
  for (let index = 0; index < lines.length; index++) {
    if (lines[index].trim().toUpperCase() !== "$INSUNITS") continue;

    // HEADER variables are encoded as group-code/value pairs. $INSUNITS is
    // normally followed by group code 70 and its integer value.
    const end = Math.min(lines.length - 1, index + 10);
    for (let cursor = index + 1; cursor < end; cursor++) {
      if (lines[cursor].trim() !== "70") continue;
      const value = Number(lines[cursor + 1]?.trim());
      if (Number.isInteger(value)) return value;
    }
  }
  return undefined;
}

function scalePoint(point: Point2, scale: number): void {
  point.x *= scale;
  point.y *= scale;
}

export function normalizeDxfManifestToMeters(
  manifest: FactoryManifest,
  source: string,
  options: DxfUnitNormalizationOptions = {},
): DxfUnitNormalizationResult {
  const code = readInsUnitsCode(source);

  if (code === undefined) {
    return {
      sourceUnit: "unspecified",
      scaleToMeter: 1,
      converted: false,
      note: "DXF 未声明 $INSUNITS；暂按米解释，并由场景尺寸审计检查比例。",
    };
  }

  if (code === 0) {
    return {
      code,
      sourceUnit: "unitless",
      scaleToMeter: 1,
      converted: false,
      note: "DXF $INSUNITS=0（无单位）；暂按米解释，并由场景尺寸审计检查比例。",
    };
  }

  const unit = DXF_UNITS[code];
  if (!unit) {
    return {
      code,
      sourceUnit: `INSUNITS:${code}`,
      scaleToMeter: 1,
      converted: false,
      note: `DXF $INSUNITS=${code} 当前未自动换算；暂按米解释。`,
    };
  }

  const scale = unit.scaleToMeter;
  if (scale !== 1) {
    manifest.siteBoundary?.forEach((point) => scalePoint(point, scale));

    for (const building of manifest.buildings ?? []) {
      building.footprint?.forEach((point) => scalePoint(point, scale));
      if (Number.isFinite(building.x)) building.x! *= scale;
      if (Number.isFinite(building.y)) building.y! *= scale;
      if (Number.isFinite(building.w)) building.w! *= scale;
      if (Number.isFinite(building.h)) building.h! *= scale;
    }

    for (const road of manifest.roads ?? []) {
      road.points?.forEach((point) => {
        point[0] *= scale;
        point[1] *= scale;
      });

      // Parser defaults are already expressed in meters. Only scale a DXF
      // polyline width when it differs from the configured default.
      if (
        Number.isFinite(road.width) &&
        Number.isFinite(options.defaultRoadWidth) &&
        Math.abs(road.width - options.defaultRoadWidth!) > 1e-6
      ) {
        road.width *= scale;
      }
    }

    for (const item of manifest.parking ?? []) {
      item.x *= scale;
      item.y *= scale;
      item.w *= scale;
      item.h *= scale;
    }

    for (const polygon of manifest.greenAreas ?? []) {
      polygon.forEach((point) => scalePoint(point, scale));
    }

    for (const rack of manifest.pipeRacks ?? []) {
      rack.path.forEach((point) => {
        point[0] *= scale;
        point[1] *= scale;
      });
    }
  }

  if (manifest.meta) manifest.meta.unit = "meter";

  return {
    code,
    sourceUnit: unit.label,
    scaleToMeter: scale,
    converted: scale !== 1,
    note:
      scale === 1
        ? "DXF 单位：meter。"
        : `DXF 单位：${unit.label}，已按 ×${scale} 换算为米。`,
  };
}
