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

    // AddObjectCommand intentionally selects a newly-created object. That is
    // useful for normal editor work, but selecting an entire campus produces a
    // giant yellow selection box + transform gizmo that obscures visual audit.
    // Overview mode is therefore a clean viewing state; users can explicitly
    // select individual semantic assets afterwards.
    App.deselect();

    const aspect = Math.max(camera.aspect || 1, 0.1);
    const verticalFov = THREE.MathUtils.degToRad(camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
    const tanV = Math.tan(verticalFov / 2);
    const tanH = Math.tan(horizontalFov / 2);

    // Visual audit showed that the previous ~61° elevation read almost like a
    // CAD Top view: footprint comparison was easy, but building height, facade
    // bands and rooftop equipment were visually flattened. Use a ~52° 3/4
    // digital-twin overview instead. The asymmetric azimuth avoids a perfectly
    // axial/isometric look and keeps both primary building facades readable.
    const direction = new THREE.Vector3(0.82, 1.35, 0.66).normalize();
    const worldUp = new THREE.Vector3(0, 1, 0);
    const viewRight = new THREE.Vector3().crossVectors(worldUp, direction).normalize();
    const viewUp = new THREE.Vector3().crossVectors(direction, viewRight).normalize();

    // Fit the actual eight Box3 corners in camera space instead of fitting a
    // conservative bounding sphere. Factory sites are broad and shallow, so a
    // sphere wastes a large amount of screen space on wide displays.
    let requiredDistance = 1;
    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) {
          const relative = new THREE.Vector3(x, y, z).sub(center);
          const towardCamera = relative.dot(direction);
          const horizontal = Math.abs(relative.dot(viewRight));
          const vertical = Math.abs(relative.dot(viewUp));
          requiredDistance = Math.max(
            requiredDistance,
            towardCamera + horizontal / Math.max(tanH, 1e-4),
            towardCamera + vertical / Math.max(tanV, 1e-4),
          );
        }
      }
    }

    // Keep a small presentation margin without shrinking the campus back into
    // the center of an ultrawide viewport. The exact fit is already conservative
    // because all eight world-space bounds corners participate.
    const distance = Math.max(requiredDistance * 1.06, 10);
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
