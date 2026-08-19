import * as THREE from "three";
import { App } from "@astral3d/engine";
import type { FactoryAssetRegistryEntry, FactoryScale } from "./FactoryManifest";
import type {
  FactoryGlbAnchor,
  FactoryGlbAxis,
  FactoryGlbScale,
  FactoryGlbUnit,
} from "./FactoryGlbAssetSpec";
import { FACTORY_GLB_ASSET_SPEC_VERSION } from "./FactoryGlbAssetSpec";
import { computeFactoryObjectBounds } from "./FactorySafeBounds";

const UNIT_TO_METERS: Record<FactoryGlbUnit, number> = {
  meter: 1,
  centimeter: 0.01,
  millimeter: 0.001,
  inch: 0.0254,
  foot: 0.3048,
};

/** Converts external GLB conventions to the canonical Factory runtime space. */
export class FactoryGlbAssetNormalizer {
  normalize(
    source: THREE.Object3D,
    entry: FactoryAssetRegistryEntry,
  ): THREE.Group {
    const contract = entry.glb;
    if (
      contract?.specVersion &&
      contract.specVersion !== FACTORY_GLB_ASSET_SPEC_VERSION
    ) {
      throw new Error(
        `Unsupported Factory GLB spec ${contract.specVersion}: ${entry.id}`,
      );
    }

    const unit = contract?.unit ?? "meter";
    const unitScale = UNIT_TO_METERS[unit];
    if (!Number.isFinite(unitScale)) {
      throw new Error(`Unsupported GLB unit for ${entry.id}: ${String(unit)}`);
    }

    const up = this.axisVector(contract?.coordinate?.upAxis ?? "+Y");
    const forward = this.axisVector(
      contract?.coordinate?.forwardAxis ?? "-Z",
    );
    this.validateBasis(up, forward, entry.id);

    const wrapper = new THREE.Group();
    wrapper.name = `${entry.id}_NORMALIZED`;

    const correction = new THREE.Group();
    correction.name = `${entry.id}_CORRECTION`;
    correction.scale.copy(
      this.toScale(contract?.defaultScale ?? entry.defaultScale),
    );

    const rotationDeg = contract?.defaultRotationDeg ?? [
      0,
      entry.rotationOffsetDeg ?? 0,
      0,
    ];
    correction.rotation.set(
      THREE.MathUtils.degToRad(rotationDeg[0]),
      THREE.MathUtils.degToRad(rotationDeg[1]),
      THREE.MathUtils.degToRad(rotationDeg[2]),
      "XYZ",
    );

    const basis = new THREE.Group();
    basis.name = `${entry.id}_BASIS`;
    basis.scale.setScalar(unitScale);
    basis.quaternion.copy(this.sourceToCanonicalQuaternion(up, forward));

    const model = App.cloneObject(source);
    model.name = `${entry.id}_MODEL`;
    basis.add(model);
    correction.add(basis);
    wrapper.add(correction);
    wrapper.updateMatrixWorld(true);

    this.applyAnchor(
      wrapper,
      correction,
      contract?.anchor ?? entry.anchor ?? "center-base",
      contract?.customAnchor,
      entry.id,
    );

    wrapper.userData = {
      registryAssetId: entry.id,
      sourceUrl: entry.source?.url,
      preparedAssetSource: true,
      glbSpecVersion: contract?.specVersion ?? FACTORY_GLB_ASSET_SPEC_VERSION,
      normalizedUnit: "meter",
      normalizedUpAxis: "+Y",
      normalizedForwardAxis: "-Z",
    };
    wrapper.updateMatrixWorld(true);
    return wrapper;
  }

  private applyAnchor(
    wrapper: THREE.Group,
    correction: THREE.Group,
    anchor: FactoryGlbAnchor,
    customAnchor: [number, number, number] | undefined,
    assetId: string,
  ): void {
    if (anchor === "origin") return;

    if (anchor === "custom") {
      if (!customAnchor || customAnchor.some((value) => !Number.isFinite(value))) {
        throw new Error(`custom anchor requires a finite [x,y,z]: ${assetId}`);
      }
      correction.updateMatrix();
      const point = new THREE.Vector3(...customAnchor).applyMatrix4(
        correction.matrix,
      );
      correction.position.sub(point);
      wrapper.updateMatrixWorld(true);
      return;
    }

    const box = computeFactoryObjectBounds(wrapper);
    if (box.isEmpty()) {
      throw new Error(`Cannot compute center-base anchor for empty GLB: ${assetId}`);
    }
    const center = box.getCenter(new THREE.Vector3());
    correction.position.x -= center.x;
    correction.position.z -= center.z;
    correction.position.y -= box.min.y;
    wrapper.updateMatrixWorld(true);
  }

  private sourceToCanonicalQuaternion(
    up: THREE.Vector3,
    forward: THREE.Vector3,
  ): THREE.Quaternion {
    // GLB source basis expressed in canonical coordinates. Since forward is
    // defined as viewing direction, local +Z is the opposite (back) vector.
    const right = forward.clone().cross(up).normalize();
    const back = forward.clone().negate().normalize();
    const sourceBasis = new THREE.Matrix4().makeBasis(right, up, back);
    return new THREE.Quaternion().setFromRotationMatrix(sourceBasis.invert());
  }

  private validateBasis(
    up: THREE.Vector3,
    forward: THREE.Vector3,
    assetId: string,
  ): void {
    if (Math.abs(up.dot(forward)) > 1e-6) {
      throw new Error(
        `GLB upAxis and forwardAxis must be perpendicular: ${assetId}`,
      );
    }
  }

  private axisVector(axis: FactoryGlbAxis): THREE.Vector3 {
    switch (axis) {
      case "+X":
        return new THREE.Vector3(1, 0, 0);
      case "-X":
        return new THREE.Vector3(-1, 0, 0);
      case "+Y":
        return new THREE.Vector3(0, 1, 0);
      case "-Y":
        return new THREE.Vector3(0, -1, 0);
      case "+Z":
        return new THREE.Vector3(0, 0, 1);
      case "-Z":
        return new THREE.Vector3(0, 0, -1);
      default:
        throw new Error(`Unsupported GLB axis: ${String(axis)}`);
    }
  }

  private toScale(scale?: FactoryGlbScale | FactoryScale): THREE.Vector3 {
    if (Array.isArray(scale)) {
      return new THREE.Vector3(scale[0], scale[1], scale[2]);
    }
    const value = scale ?? 1;
    return new THREE.Vector3(value, value, value);
  }
}
