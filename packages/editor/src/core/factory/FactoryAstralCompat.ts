import * as THREE from "three";
import { App } from "@astral3d/engine";

type AstralExtendedObject3D = THREE.Object3D & {
  traverseByCondition?: (
    callback: (object: THREE.Object3D) => void,
    condition: (object: THREE.Object3D) => boolean,
  ) => void;
  isAncestor?: (parent: THREE.Object3D) => boolean;
};

/**
 * Astral3D bundles its own Three.js runtime and extends Object3D with editor
 * helpers such as traverseByCondition/isAncestor and a custom toJSON method.
 *
 * Factory Generator is compiled by the editor and therefore may create
 * objects from the editor's `three` module instead of the Three instance
 * bundled inside @astral3d/engine. App.addObject() detects those objects by
 * checking traverseByCondition. Its legacy compatibility path replaces the
 * object's prototype with Astral3D Object3D.prototype, which destroys subtype
 * methods on Mesh/Line/InstancedMesh (for example InstancedMesh.computeBoundingBox).
 *
 * Bridge the Astral3D extensions onto the object instances before App.addObject
 * sees them. We deliberately DO NOT replace prototypes, so every Three subtype
 * keeps its own raycast/bounds/instance APIs.
 */
export function prepareFactoryObjectForAstral<T extends THREE.Object3D>(root: T): T {
  const astralScene = App.scene as unknown as AstralExtendedObject3D;
  const astralTraverseByCondition = astralScene.traverseByCondition;
  const astralIsAncestor = astralScene.isAncestor;
  const astralToJSON = astralScene.toJSON;

  if (typeof astralTraverseByCondition !== "function") {
    throw new Error("Astral3D Object3D extension traverseByCondition is unavailable.");
  }

  root.traverse((object) => {
    const target = object as AstralExtendedObject3D;

    if (typeof target.traverseByCondition !== "function") {
      Object.defineProperty(target, "traverseByCondition", {
        value: astralTraverseByCondition,
        configurable: true,
        writable: true,
      });
    }

    if (typeof target.isAncestor !== "function" && typeof astralIsAncestor === "function") {
      Object.defineProperty(target, "isAncestor", {
        value: astralIsAncestor,
        configurable: true,
        writable: true,
      });
    }

    // Astral3D overrides Object3D.toJSON for its scene package format. Use the
    // same serializer without modifying the external Three prototype chain.
    if (typeof astralToJSON === "function" && target.toJSON !== astralToJSON) {
      Object.defineProperty(target, "toJSON", {
        value: astralToJSON,
        configurable: true,
        writable: true,
      });
    }
  });

  return root;
}

/**
 * Fail early with a useful diagnostic if a subtype was already flattened by a
 * prototype rewrite. This turns an opaque minified `computeBoundingBox` error
 * into a Factory Generator stage error.
 */
export function assertFactoryThreeSubtypes(root: THREE.Object3D): void {
  const broken: string[] = [];

  root.traverse((object) => {
    const candidate = object as THREE.Object3D & {
      isInstancedMesh?: boolean;
      computeBoundingBox?: () => void;
      getMatrixAt?: (index: number, matrix: THREE.Matrix4) => void;
      geometry?: unknown;
    };

    if (
      candidate.isInstancedMesh &&
      (typeof candidate.computeBoundingBox !== "function" ||
        typeof candidate.getMatrixAt !== "function")
    ) {
      broken.push(object.name || object.uuid);
    }

    const geometry = candidate.geometry as
      | { computeBoundingBox?: () => void; uuid?: string }
      | undefined;
    if (geometry && typeof geometry.computeBoundingBox !== "function") {
      broken.push(`${object.name || object.uuid}:geometry:${geometry.uuid ?? "unknown"}`);
    }
  });

  if (broken.length) {
    throw new Error(
      `Three subtype/prototype compatibility failed for ${broken.slice(0, 5).join(", ")}` +
        (broken.length > 5 ? ` (+${broken.length - 5} more)` : ""),
    );
  }
}
