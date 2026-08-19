import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const astralRoot = path.resolve(scriptDir, "..");
const workspaceRoot = path.resolve(astralRoot, "..");
const packageRequire = createRequire(
  path.join(astralRoot, "packages/editor/package.json"),
);
const { NodeIO } = packageRequire("@gltf-transform/core");
const {
  EXTMeshoptCompression,
  KHRMaterialsSpecular,
} = packageRequire("@gltf-transform/extensions");
const {
  dedup,
  meshopt,
  prune,
  textureCompress,
} = packageRequire("@gltf-transform/functions");
const { MeshoptEncoder } = packageRequire("meshoptimizer");
const stagingRoot = path.join(workspaceRoot, "factory_asset_staging");
const productionRoot = path.join(
  astralRoot,
  "packages/editor/public/static/factory/assets",
);

const assets = [
  ["transformer-a", "transformer-a.glb"],
  ["hvac-a", "hvac-a.glb"],
  ["cooling-tower-a", "cooling-tower-a.glb"],
  ["exhaust-stack-a", "exhaust-stack-a.glb"],
  ["scrubber-a", "scrubber-a.glb"],
  ["tree-a", "tree-a.glb"],
  ["gas-cabinet-a", "gas-cabinet-a.glb"],
  ["emergency-shower-a", "emergency-shower-a.glb"],
  ["street-light-a", "street-light-a.glb"],
];

const assetCards = {
  "transformer-a": {
    registryId: "semiconductor.transformer.A",
    fallbackTemplate: "transformer",
    defaultScale: 5.35,
    visualGate: "pass",
  },
  "hvac-a": {
    registryId: "semiconductor.hvac.A",
    fallbackTemplate: "hvac",
    defaultScale: 4.68,
    visualGate: "pass",
  },
  "cooling-tower-a": {
    registryId: "semiconductor.coolingTower.A",
    fallbackTemplate: "cooling_tower",
    defaultScale: 8.51,
    visualGate: "pass",
  },
  "exhaust-stack-a": {
    registryId: "semiconductor.exhaustStack.A",
    fallbackTemplate: "exhaust_stack",
    defaultScale: 5.59,
    visualGate: "pass",
  },
  "scrubber-a": {
    registryId: "semiconductor.scrubber.A",
    fallbackTemplate: "scrubber",
    defaultScale: 6.03,
    visualGate: "pass",
  },
  "tree-a": {
    registryId: "campus.tree.A",
    fallbackTemplate: "tree",
    defaultScale: 4.7,
    visualGate: "warn-ground-disc",
  },
  "gas-cabinet-a": {
    registryId: "semiconductor.gasCabinet.A",
    fallbackTemplate: "gas_cabinet",
    defaultScale: 2.18,
    visualGate: "pass",
  },
  "emergency-shower-a": {
    registryId: "ehs.emergencyShower.A",
    fallbackTemplate: "emergency_shower",
    defaultScale: 2.07,
    visualGate: "pass",
  },
  "street-light-a": {
    registryId: "campus.streetLight.A",
    fallbackTemplate: "street_light",
    defaultScale: 6.09,
    visualGate: "pass",
  },
};

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function triangleCount(document) {
  let triangles = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const indices = primitive.getIndices();
      const positions = primitive.getAttribute("POSITION");
      triangles += Math.floor(
        (indices?.getCount() ?? positions?.getCount() ?? 0) / 3,
      );
    }
  }
  return triangles;
}

await MeshoptEncoder.ready;
await mkdir(productionRoot, { recursive: true });

const io = new NodeIO()
  .registerExtensions([EXTMeshoptCompression, KHRMaterialsSpecular])
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder });
const records = [];

for (const [assetName, fileName] of assets) {
  const input = path.join(stagingRoot, assetName, "raw", fileName);
  const output = path.join(productionRoot, fileName);
  const sourceBytes = await readFile(input);
  const document = await io.read(input);

  await document.transform(
    dedup(),
    prune(),
    textureCompress({ resize: [1024, 1024] }),
    meshopt({ encoder: MeshoptEncoder, level: "high" }),
  );
  await io.write(output, document);

  const outputBytes = await readFile(output);
  records.push({
    assetName,
    fileName,
    sourceBytes: sourceBytes.byteLength,
    outputBytes: outputBytes.byteLength,
    sourceSha256: sha256(sourceBytes),
    outputSha256: sha256(outputBytes),
    meshes: document.getRoot().listMeshes().length,
    materials: document.getRoot().listMaterials().length,
    textures: document.getRoot().listTextures().length,
    animations: document.getRoot().listAnimations().length,
    skins: document.getRoot().listSkins().length,
    triangles: triangleCount(document),
    output,
  });
  console.log(
    `${assetName}: ${(sourceBytes.byteLength / 1048576).toFixed(1)} MB → ${(outputBytes.byteLength / 1048576).toFixed(1)} MB`,
  );
}

await import("node:fs/promises").then(({ writeFile }) =>
  writeFile(
    path.join(stagingRoot, "normalization-record.json"),
    `${JSON.stringify({ generatedAt: new Date().toISOString(), records }, null, 2)}\n`,
  ),
);

await import("node:fs/promises").then(({ writeFile }) =>
  writeFile(
    path.join(stagingRoot, "asset-cards.json"),
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        stage: "connected-candidate",
        provenance:
          "Imagegen reference + Hunyuan 3D 3.1 PBR; generated for Astral3D project",
        records: records.map((record) => ({
          ...record,
          ...assetCards[record.assetName],
          runtimeSource: `/static/factory/assets/${record.fileName}`,
          validation: {
            static: record.animations === 0 && record.skins === 0,
            singleMaterial: record.materials <= 1,
            withinFileBudget: record.outputBytes <= 8 * 1024 * 1024,
          },
        })),
      },
      null,
      2,
    )}\n`,
  ),
);
