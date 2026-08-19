import * as THREE from "three";

export interface FactoryGlbBatchRuntimeDiagnostic {
  batchId: string;
  registryAssetId?: string;
  renderSource: "glb-instanced" | "glb-shared-clone";
  expectedInstances: number;
  semanticInstances: number;
  meshParts: number;
  estimatedDrawCalls: number;
  uniqueTriangles: number;
  renderedTriangles: number;
  semanticMappingValid: boolean;
  problems: string[];
}

export interface FactoryGlbRuntimeDiagnosticReport {
  glbBatches: number;
  instancedBatches: number;
  sharedCloneBatches: number;
  instancedMeshParts: number;
  semanticInstances: number;
  estimatedDrawCalls: number;
  uniqueTriangles: number;
  renderedTriangles: number;
  semanticMappingValid: boolean;
  batches: FactoryGlbBatchRuntimeDiagnostic[];
  problems: string[];
}

function trianglesForGeometry(geometry: THREE.BufferGeometry): number {
  const count = geometry.index?.count ?? geometry.attributes.position?.count ?? 0;
  return Math.floor(count / 3);
}

function drawCallsForMesh(mesh: THREE.Mesh): number {
  if (!Array.isArray(mesh.material)) return 1;
  if (mesh.geometry.groups.length) return mesh.geometry.groups.length;
  return Math.max(1, mesh.material.length);
}

function isGlbBatchRoot(object: THREE.Object3D): object is THREE.Group {
  const renderSource = object.userData?.renderSource;
  return (
    object.type === "Group" &&
    (renderSource === "glb-instanced" || renderSource === "glb-shared-clone") &&
    Number.isFinite(object.userData?.instanceCount)
  );
}

function inspectInstancedBatch(group: THREE.Group): FactoryGlbBatchRuntimeDiagnostic {
  const expectedInstances = Number(group.userData.instanceCount ?? 0);
  const registryAssetId =
    typeof group.userData.registryAssetId === "string"
      ? group.userData.registryAssetId
      : undefined;
  const problems: string[] = [];
  const semanticIds = new Set<string>();
  let meshParts = 0;
  let estimatedDrawCalls = 0;
  let uniqueTriangles = 0;
  let renderedTriangles = 0;

  group.traverse((node) => {
    const mesh = node as THREE.InstancedMesh;
    if (!mesh.isInstancedMesh) return;
    meshParts++;
    estimatedDrawCalls += drawCallsForMesh(mesh);
    const triangles = trianglesForGeometry(mesh.geometry);
    uniqueTriangles += triangles;
    renderedTriangles += triangles * mesh.count;

    if (mesh.count !== expectedInstances) {
      problems.push(
        `${mesh.name || "InstancedMesh"}: count=${mesh.count}, expected=${expectedInstances}.`,
      );
    }

    const instanceAssetIds = mesh.userData?.instanceAssetIds;
    if (!Array.isArray(instanceAssetIds)) {
      problems.push(`${mesh.name || "InstancedMesh"}: missing instanceAssetIds[].`);
      return;
    }
    if (instanceAssetIds.length !== expectedInstances) {
      problems.push(
        `${mesh.name || "InstancedMesh"}: instanceAssetIds=${instanceAssetIds.length}, expected=${expectedInstances}.`,
      );
    }
    for (const assetId of instanceAssetIds) {
      if (typeof assetId === "string" && assetId) semanticIds.add(assetId);
    }
  });

  if (!meshParts) problems.push("Instanced GLB batch contains no InstancedMesh parts.");
  if (semanticIds.size !== expectedInstances) {
    problems.push(
      `semantic assetId coverage=${semanticIds.size}, expected=${expectedInstances}.`,
    );
  }

  return {
    batchId: group.name,
    registryAssetId,
    renderSource: "glb-instanced",
    expectedInstances,
    semanticInstances: semanticIds.size,
    meshParts,
    estimatedDrawCalls,
    uniqueTriangles,
    renderedTriangles,
    semanticMappingValid: problems.length === 0,
    problems,
  };
}

function inspectSharedCloneBatch(group: THREE.Group): FactoryGlbBatchRuntimeDiagnostic {
  const expectedInstances = Number(group.userData.instanceCount ?? 0);
  const registryAssetId =
    typeof group.userData.registryAssetId === "string"
      ? group.userData.registryAssetId
      : undefined;
  const problems: string[] = [];
  const semanticIds = new Set<string>();
  let meshParts = 0;
  let estimatedDrawCalls = 0;
  let uniqueTriangles = 0;
  let renderedTriangles = 0;
  const geometrySeen = new Set<THREE.BufferGeometry>();

  for (const child of group.children) {
    const assetId = child.userData?.assetId;
    if (typeof assetId === "string" && assetId) semanticIds.add(assetId);
  }

  group.traverse((node) => {
    if (node === group) return;
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    meshParts++;
    estimatedDrawCalls += drawCallsForMesh(mesh);
    const triangles = trianglesForGeometry(mesh.geometry);
    renderedTriangles += triangles;
    if (!geometrySeen.has(mesh.geometry)) {
      geometrySeen.add(mesh.geometry);
      uniqueTriangles += triangles;
    }
  });

  if (semanticIds.size !== expectedInstances) {
    problems.push(
      `semantic clone coverage=${semanticIds.size}, expected=${expectedInstances}.`,
    );
  }

  return {
    batchId: group.name,
    registryAssetId,
    renderSource: "glb-shared-clone",
    expectedInstances,
    semanticInstances: semanticIds.size,
    meshParts,
    estimatedDrawCalls,
    uniqueTriangles,
    renderedTriangles,
    semanticMappingValid: problems.length === 0,
    problems,
  };
}

/**
 * Runtime acceptance diagnostics for GLB replacement batches. This inspects
 * the final Astral3D scene graph after fallback replacement, so it verifies
 * the actual render path and semantic instance mapping rather than merely the
 * registry policy that was requested.
 */
export function inspectFactoryGlbRuntime(
  root: THREE.Object3D,
): FactoryGlbRuntimeDiagnosticReport {
  const batchRoots: THREE.Group[] = [];
  root.traverse((object) => {
    if (isGlbBatchRoot(object)) batchRoots.push(object);
  });

  const batches = batchRoots.map((group) =>
    group.userData.renderSource === "glb-instanced"
      ? inspectInstancedBatch(group)
      : inspectSharedCloneBatch(group),
  );
  const problems = batches.flatMap((batch) =>
    batch.problems.map((problem) => `${batch.batchId}: ${problem}`),
  );

  return {
    glbBatches: batches.length,
    instancedBatches: batches.filter((batch) => batch.renderSource === "glb-instanced").length,
    sharedCloneBatches: batches.filter((batch) => batch.renderSource === "glb-shared-clone").length,
    instancedMeshParts: batches
      .filter((batch) => batch.renderSource === "glb-instanced")
      .reduce((sum, batch) => sum + batch.meshParts, 0),
    semanticInstances: batches.reduce((sum, batch) => sum + batch.semanticInstances, 0),
    estimatedDrawCalls: batches.reduce((sum, batch) => sum + batch.estimatedDrawCalls, 0),
    uniqueTriangles: batches.reduce((sum, batch) => sum + batch.uniqueTriangles, 0),
    renderedTriangles: batches.reduce((sum, batch) => sum + batch.renderedTriangles, 0),
    semanticMappingValid: problems.length === 0,
    batches,
    problems,
  };
}
