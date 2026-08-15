import * as THREE from "three";
import type { FactoryPipeRack } from "./FactoryManifest";

interface SamplePoint {
  position: THREE.Vector3;
  tangent: THREE.Vector3;
}

export class PipeRackGenerator {
  constructor(private readonly groundOffset = 0) {}

  create(item: FactoryPipeRack): THREE.Group {
    const group = new THREE.Group();
    group.name = item.id;
    group.userData = {
      assetId: item.id,
      assetType: "pipe_rack",
      label: item.label ?? item.id,
      source: "factory-manifest",
      ...(item.userData ?? {}),
    };

    const path = item.path.map(
      ([x, y]) => new THREE.Vector3(x, this.groundOffset, -y),
    );
    if (path.length < 2) return group;

    const width = Math.max(2.5, item.width ?? 6);
    const height = Math.max(3.5, item.height ?? 6);
    const columnSpacing = Math.max(3, item.columnSpacing ?? 8);
    const tiers = Math.max(1, Math.min(item.tiers ?? 2, 4));
    const pipeCount = Math.max(1, Math.min(item.pipeCount ?? 6, 18));

    const steel = new THREE.MeshStandardMaterial({
      color: 0x68757c,
      roughness: 0.56,
      metalness: 0.42,
    });
    const pipeMaterial = new THREE.MeshStandardMaterial({
      color: 0x91a0a8,
      roughness: 0.48,
      metalness: 0.5,
    });

    const samples = this.samplePath(path, columnSpacing);
    this.addColumns(group, samples, width, height, steel);
    this.addCrossBeams(group, samples, width, height, tiers, steel);
    this.addLongitudinalBeams(group, path, width, height, tiers, steel);
    this.addPipes(group, path, width, height, tiers, pipeCount, pipeMaterial);

    return group;
  }

  private samplePath(path: THREE.Vector3[], spacing: number): SamplePoint[] {
    const samples: SamplePoint[] = [];

    for (let segment = 0; segment < path.length - 1; segment++) {
      const a = path[segment];
      const b = path[segment + 1];
      const delta = b.clone().sub(a);
      const length = delta.length();
      if (length <= 0.001) continue;
      const tangent = delta.clone().normalize();
      const count = Math.max(1, Math.floor(length / spacing));

      for (let index = 0; index <= count; index++) {
        if (segment > 0 && index === 0) continue;
        const t = index / count;
        samples.push({
          position: a.clone().lerp(b, t),
          tangent: tangent.clone(),
        });
      }
    }

    return samples;
  }

  private addColumns(
    group: THREE.Group,
    samples: SamplePoint[],
    width: number,
    height: number,
    material: THREE.Material,
  ): void {
    const geometry = new THREE.BoxGeometry(0.3, height, 0.3);
    const mesh = new THREE.InstancedMesh(geometry, material, samples.length * 2);
    mesh.name = `${group.name}_COLUMNS`;

    const matrix = new THREE.Matrix4();
    let instance = 0;
    for (const sample of samples) {
      const normal = new THREE.Vector3(-sample.tangent.z, 0, sample.tangent.x).normalize();
      for (const side of [-1, 1]) {
        const position = sample.position
          .clone()
          .addScaledVector(normal, (width / 2) * side);
        position.y = this.groundOffset + height / 2;
        matrix.makeTranslation(position.x, position.y, position.z);
        mesh.setMatrixAt(instance++, matrix);
      }
    }

    mesh.instanceMatrix.needsUpdate = true;
    mesh.userData = {
      assetType: "pipe_rack_column",
      parentAssetId: group.name,
    };
    group.add(mesh);
  }

  private addCrossBeams(
    group: THREE.Group,
    samples: SamplePoint[],
    width: number,
    height: number,
    tiers: number,
    material: THREE.Material,
  ): void {
    const geometry = new THREE.BoxGeometry(width + 0.45, 0.24, 0.28);
    const mesh = new THREE.InstancedMesh(
      geometry,
      material,
      samples.length * tiers,
    );
    mesh.name = `${group.name}_CROSS_BEAMS`;

    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);
    let instance = 0;

    for (const sample of samples) {
      const angle = Math.atan2(sample.tangent.x, sample.tangent.z);
      quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
      for (let tier = 0; tier < tiers; tier++) {
        const y = this.groundOffset + height * ((tier + 1) / tiers);
        matrix.compose(
          new THREE.Vector3(sample.position.x, y, sample.position.z),
          quaternion,
          scale,
        );
        mesh.setMatrixAt(instance++, matrix);
      }
    }

    mesh.instanceMatrix.needsUpdate = true;
    mesh.userData = {
      assetType: "pipe_rack_cross_beam",
      parentAssetId: group.name,
    };
    group.add(mesh);
  }

  private addLongitudinalBeams(
    group: THREE.Group,
    path: THREE.Vector3[],
    width: number,
    height: number,
    tiers: number,
    material: THREE.Material,
  ): void {
    for (let segment = 0; segment < path.length - 1; segment++) {
      const a = path[segment];
      const b = path[segment + 1];
      const tangent = b.clone().sub(a);
      const length = tangent.length();
      if (length <= 0.001) continue;
      tangent.normalize();
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
      const angle = Math.atan2(tangent.x, tangent.z);

      for (let tier = 0; tier < tiers; tier++) {
        const y = this.groundOffset + height * ((tier + 1) / tiers);
        for (const side of [-1, 1]) {
          const center = a.clone().lerp(b, 0.5).addScaledVector(normal, (width / 2) * side);
          center.y = y;
          const beam = new THREE.Mesh(
            new THREE.BoxGeometry(0.26, 0.26, length),
            material,
          );
          beam.name = `${group.name}_LONG_BEAM_${segment + 1}_${tier + 1}_${side > 0 ? "R" : "L"}`;
          beam.position.copy(center);
          beam.rotation.y = angle;
          beam.userData = {
            assetType: "pipe_rack_long_beam",
            parentAssetId: group.name,
          };
          group.add(beam);
        }
      }
    }
  }

  private addPipes(
    group: THREE.Group,
    path: THREE.Vector3[],
    width: number,
    height: number,
    tiers: number,
    pipeCount: number,
    material: THREE.Material,
  ): void {
    const tierIndex = tiers - 1;
    const y = this.groundOffset + height * ((tierIndex + 1) / tiers) + 0.35;
    const usableWidth = width * 0.76;

    for (let segment = 0; segment < path.length - 1; segment++) {
      const a = path[segment];
      const b = path[segment + 1];
      const tangent = b.clone().sub(a);
      const length = tangent.length();
      if (length <= 0.001) continue;
      tangent.normalize();
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
      const midpoint = a.clone().lerp(b, 0.5);

      for (let pipe = 0; pipe < pipeCount; pipe++) {
        const lateral =
          pipeCount === 1
            ? 0
            : -usableWidth / 2 + (usableWidth * pipe) / (pipeCount - 1);
        const center = midpoint.clone().addScaledVector(normal, lateral);
        center.y = y;

        const radius = 0.10 + (pipe % 3) * 0.035;
        const geometry = new THREE.CylinderGeometry(radius, radius, length, 10);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = `${group.name}_PIPE_${segment + 1}_${pipe + 1}`;
        mesh.position.copy(center);
        mesh.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          tangent,
        );
        mesh.userData = {
          assetType: "utility_pipe",
          parentAssetId: group.name,
          pipeIndex: pipe,
        };
        group.add(mesh);
      }
    }
  }
}
