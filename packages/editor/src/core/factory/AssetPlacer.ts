import * as THREE from "three";
import type {
  FactoryAssetBatch,
  FactoryAssetPosition,
} from "./FactoryManifest";
import {
  createInstancedAssetGroup,
  type AssetInstanceTransform,
} from "./ProceduralAssetFactory";

export class AssetPlacer {
  constructor(private readonly groundOffset = 0) {}

  createBatch(batch: FactoryAssetBatch): THREE.Group {
    const positions = this.expandPositions(batch);
    const transforms: AssetInstanceTransform[] = positions.map((item, index) => ({
      id: item.id ?? `${batch.id}_${String(index + 1).padStart(3, "0")}`,
      position: new THREE.Vector3(
        item.x,
        this.groundOffset + (item.elevation ?? 0),
        -item.y,
      ),
      rotationY: THREE.MathUtils.degToRad(item.rotationDeg ?? 0),
      scale: this.toScale(item.scale),
    }));

    return createInstancedAssetGroup(
      batch.id,
      batch.template,
      transforms,
      {
        label: batch.label ?? batch.id,
        source: "factory-manifest",
        ...(batch.userData ?? {}),
      },
    );
  }

  private expandPositions(batch: FactoryAssetBatch): FactoryAssetPosition[] {
    const result: FactoryAssetPosition[] = [...(batch.positions ?? [])];

    if (batch.grid) {
      const {
        origin,
        rows,
        columns,
        spacingX,
        spacingY,
        rotationDeg = 0,
        elevation = 0,
        scale,
      } = batch.grid;

      const angle = THREE.MathUtils.degToRad(rotationDeg);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
          const localX = column * spacingX;
          const localY = row * spacingY;
          const rotatedX = localX * cos - localY * sin;
          const rotatedY = localX * sin + localY * cos;
          result.push({
            x: origin.x + rotatedX,
            y: origin.y + rotatedY,
            elevation,
            rotationDeg,
            scale,
          });
        }
      }
    }

    if (batch.line) {
      const {
        start,
        end,
        count,
        elevation = 0,
        scale,
        rotationDeg,
        alignToLine = true,
      } = batch.line;

      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const autoRotation = THREE.MathUtils.radToDeg(Math.atan2(dy, dx));

      for (let i = 0; i < count; i++) {
        const t = count <= 1 ? 0 : i / (count - 1);
        result.push({
          x: start.x + dx * t,
          y: start.y + dy * t,
          elevation,
          scale,
          rotationDeg: rotationDeg ?? (alignToLine ? autoRotation : 0),
        });
      }
    }

    return result;
  }

  private toScale(scale?: number | [number, number, number]): THREE.Vector3 {
    if (Array.isArray(scale)) return new THREE.Vector3(scale[0], scale[1], scale[2]);
    const value = scale ?? 1;
    return new THREE.Vector3(value, value, value);
  }
}
