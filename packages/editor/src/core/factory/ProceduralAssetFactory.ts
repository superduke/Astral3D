import * as THREE from "three";

export interface AssetInstanceTransform {
  id: string;
  position: THREE.Vector3;
  rotationY?: number;
  scale?: THREE.Vector3;
}

interface ProceduralAssetPart {
  name: string;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  offset?: THREE.Vector3;
  rotation?: THREE.Euler;
  scale?: THREE.Vector3;
}

const material = (color: number, roughness = 0.65, metalness = 0.15) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

const cache = new Map<string, ProceduralAssetPart[]>();

function buildTemplate(template: string): ProceduralAssetPart[] {
  switch (template.toLowerCase()) {
    case "hvac":
      return [
        {
          name: "body",
          geometry: new THREE.BoxGeometry(4.8, 1.8, 3.4),
          material: material(0x8b989f, 0.58, 0.32),
          offset: new THREE.Vector3(0, 0.9, 0),
        },
        {
          name: "fan",
          geometry: new THREE.CylinderGeometry(0.9, 0.9, 0.28, 20),
          material: material(0x5f6b72, 0.5, 0.4),
          offset: new THREE.Vector3(0, 1.94, 0),
        },
      ];

    case "exhaust_stack":
      return [
        {
          name: "stack",
          geometry: new THREE.CylinderGeometry(0.55, 0.68, 6.5, 20),
          material: material(0x9ba6ac, 0.5, 0.45),
          offset: new THREE.Vector3(0, 3.25, 0),
        },
        {
          name: "cap",
          geometry: new THREE.CylinderGeometry(0.78, 0.78, 0.22, 20),
          material: material(0x66727a, 0.48, 0.42),
          offset: new THREE.Vector3(0, 6.56, 0),
        },
      ];

    case "scrubber":
      return [
        {
          name: "vessel",
          geometry: new THREE.CylinderGeometry(1.8, 1.8, 5.4, 24),
          material: material(0x78909c, 0.56, 0.28),
          offset: new THREE.Vector3(0, 2.7, 0),
        },
        {
          name: "top",
          geometry: new THREE.CylinderGeometry(0.7, 1.45, 1.1, 24),
          material: material(0x667b86, 0.54, 0.3),
          offset: new THREE.Vector3(0, 5.95, 0),
        },
      ];

    case "cooling_tower":
      return [
        {
          name: "tower",
          geometry: new THREE.CylinderGeometry(3.5, 4.5, 7.5, 24),
          material: material(0xa9b5bb, 0.72, 0.08),
          offset: new THREE.Vector3(0, 3.75, 0),
        },
        {
          name: "fan",
          geometry: new THREE.CylinderGeometry(2.1, 2.1, 0.35, 24),
          material: material(0x69777e, 0.5, 0.34),
          offset: new THREE.Vector3(0, 7.68, 0),
        },
      ];

    case "transformer":
      return [
        {
          name: "body",
          geometry: new THREE.BoxGeometry(4.4, 2.8, 3.2),
          material: material(0x697c70, 0.68, 0.2),
          offset: new THREE.Vector3(0, 1.4, 0),
        },
        {
          name: "top",
          geometry: new THREE.BoxGeometry(3.5, 0.35, 2.4),
          material: material(0x55665d, 0.58, 0.28),
          offset: new THREE.Vector3(0, 2.98, 0),
        },
      ];

    case "street_light":
      return [
        {
          name: "pole",
          geometry: new THREE.CylinderGeometry(0.09, 0.13, 6.2, 10),
          material: material(0x59636a, 0.5, 0.5),
          offset: new THREE.Vector3(0, 3.1, 0),
        },
        {
          name: "lamp",
          geometry: new THREE.BoxGeometry(1.25, 0.16, 0.42),
          material: material(0x77848b, 0.42, 0.45),
          offset: new THREE.Vector3(0.52, 6.12, 0),
        },
      ];

    case "tree":
      return [
        {
          name: "trunk",
          geometry: new THREE.CylinderGeometry(0.22, 0.32, 2.4, 10),
          material: material(0x6f5c47, 0.95, 0),
          offset: new THREE.Vector3(0, 1.2, 0),
        },
        {
          name: "crown",
          geometry: new THREE.ConeGeometry(1.8, 4.2, 12),
          material: material(0x607d5c, 0.95, 0),
          offset: new THREE.Vector3(0, 4.0, 0),
        },
      ];

    default:
      return [
        {
          name: "placeholder",
          geometry: new THREE.BoxGeometry(2, 2, 2),
          material: material(0xb0bac0, 0.7, 0.08),
          offset: new THREE.Vector3(0, 1, 0),
        },
      ];
  }
}

function getTemplate(template: string): ProceduralAssetPart[] {
  const key = template.toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;
  const parts = buildTemplate(key);
  cache.set(key, parts);
  return parts;
}

export function createInstancedAssetGroup(
  id: string,
  template: string,
  transforms: AssetInstanceTransform[],
  userData: Record<string, unknown> = {},
): THREE.Group {
  const group = new THREE.Group();
  group.name = id;
  group.userData = {
    assetId: id,
    assetType: template,
    instanced: true,
    instanceCount: transforms.length,
    ...userData,
  };

  if (!transforms.length) return group;

  const parts = getTemplate(template);
  const instanceIds = transforms.map((item) => item.id);

  for (const part of parts) {
    const mesh = new THREE.InstancedMesh(part.geometry, part.material, transforms.length);
    mesh.name = `${id}_${part.name.toUpperCase()}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = {
      assetType: template,
      batchAssetId: id,
      part: part.name,
      instanceAssetIds: instanceIds,
    };

    const partMatrix = new THREE.Matrix4().compose(
      part.offset ?? new THREE.Vector3(),
      new THREE.Quaternion().setFromEuler(part.rotation ?? new THREE.Euler()),
      part.scale ?? new THREE.Vector3(1, 1, 1),
    );

    transforms.forEach((item, index) => {
      const instanceMatrix = new THREE.Matrix4().compose(
        item.position,
        new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          item.rotationY ?? 0,
        ),
        item.scale ?? new THREE.Vector3(1, 1, 1),
      );
      const matrix = new THREE.Matrix4().multiplyMatrices(instanceMatrix, partMatrix);
      mesh.setMatrixAt(index, matrix);
    });

    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }

  return group;
}
