import * as THREE from "three";
import { App } from "@astral3d/engine";
import { computeFactoryObjectBounds } from "./FactorySafeBounds";

export interface FactoryOverviewResult {
  framed: boolean;
  width: number;
  depth: number;
  height: number;
  distance?: number;
}

/**
 * One-shot camera framing for generated factory campuses.
 *
 * It deliberately does not replace Astral3D's CameraControls. The runtime only
 * computes a stable bird-eye overview from FactorySafeBounds and asks the
 * existing controls instance to move there, after which normal editor
 * navigation remains unchanged.
 */
export class FactoryCameraRuntime {
  constructor(private readonly root: THREE.Object3D) {}

  frameOverview(enableTransition = true): FactoryOverviewResult {
    const box = computeFactoryObjectBounds(this.root);
    if (box.isEmpty()) return { framed: false, width: 0, depth: 0, height: 0 };

    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const viewer = App.viewer;
    const controls = viewer?.modules?.controls;
    const camera = App.camera;

    if (!controls || !camera?.isPerspectiveCamera) {
      return {
        framed: false,
        width: size.x,
        depth: size.z,
        height: size.y,
      };
    }

    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const aspect = Math.max(camera.aspect || 1, 0.1);
    const verticalFov = THREE.MathUtils.degToRad(camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
    const limitingFov = Math.max(THREE.MathUtils.degToRad(12), Math.min(verticalFov, horizontalFov));
    const radius = Math.max(sphere.radius, 5);

    // Fitting a bounding sphere is slightly more conservative than fitToBox,
    // but guarantees that very wide, low factory campuses remain fully visible
    // from a deterministic oblique bird-eye direction.
    const distance = (radius / Math.sin(limitingFov / 2)) * 1.08;
    const direction = new THREE.Vector3(0.82, 1.08, 0.82).normalize();
    const position = center.clone().addScaledVector(direction, distance);

    controls.setLookAt(
      position.x,
      position.y,
      position.z,
      center.x,
      center.y,
      center.z,
      enableTransition,
    );

    return {
      framed: true,
      width: size.x,
      depth: size.z,
      height: size.y,
      distance,
    };
  }
}
