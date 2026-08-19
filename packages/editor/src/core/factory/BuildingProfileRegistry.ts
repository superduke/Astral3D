import type { FactoryBuilding } from "./FactoryManifest";
import type { FactoryMaterialKey } from "./FactoryMaterialLibrary";

export interface BuildingStyleProfile {
  id: string;
  type: string;
  massing: {
    plinthHeight: number;
    mechanicalBandRatio: number;
    roofScreenHeight: number;
    upperSetback: number;
    penthouseRatio: number;
    serviceAnnex: boolean;
  };
  envelope: {
    panelWidth: number;
    panelJoints: boolean;
    cornerTrim: boolean;
    windowMode: "none" | "ribbon" | "front-bays";
    windowBayWidth: number;
    louverRows: number;
    loadingBayCount: number;
  };
  entrance: {
    enabled: boolean;
    width: number;
    depth: number;
    height: number;
    canopyDepth: number;
  };
  roof: {
    screen: boolean;
    clusterSpacing: number;
    serviceCorridor: number;
    edgeSetback: number;
  };
  materials: {
    body: FactoryMaterialKey;
    accent: FactoryMaterialKey;
    plinth: FactoryMaterialKey;
    glass: FactoryMaterialKey;
    trim: FactoryMaterialKey;
    roof: FactoryMaterialKey;
  };
}

const profiles: Record<string, BuildingStyleProfile> = {
  "semiconductor-fab-modern-v1": {
    id: "semiconductor-fab-modern-v1",
    type: "fab",
    massing: {
      plinthHeight: 1.15,
      mechanicalBandRatio: 0.18,
      roofScreenHeight: 2.1,
      upperSetback: 1.4,
      penthouseRatio: 0.34,
      serviceAnnex: true,
    },
    envelope: {
      panelWidth: 6,
      panelJoints: true,
      cornerTrim: true,
      windowMode: "ribbon",
      windowBayWidth: 4.2,
      louverRows: 2,
      loadingBayCount: 0,
    },
    entrance: { enabled: true, width: 8.5, depth: 4.2, height: 5.2, canopyDepth: 3.2 },
    roof: { screen: true, clusterSpacing: 7.5, serviceCorridor: 4.5, edgeSetback: 5.0 },
    materials: {
      body: "industrialMetalPanelLight",
      accent: "industrialMetalPanelDark",
      plinth: "darkConcretePlinth",
      glass: "curtainWallBlueGrey",
      trim: "galvanizedSteel",
      roof: "roofMembrane",
    },
  },
  "semiconductor-utility-industrial-v1": {
    id: "semiconductor-utility-industrial-v1",
    type: "utility",
    massing: {
      plinthHeight: 0.9,
      mechanicalBandRatio: 0.25,
      roofScreenHeight: 1.3,
      upperSetback: 0.7,
      penthouseRatio: 0.2,
      serviceAnnex: true,
    },
    envelope: {
      panelWidth: 5.2,
      panelJoints: true,
      cornerTrim: true,
      windowMode: "none",
      windowBayWidth: 4,
      louverRows: 3,
      loadingBayCount: 2,
    },
    entrance: { enabled: true, width: 5.5, depth: 2.8, height: 4.2, canopyDepth: 2.4 },
    roof: { screen: false, clusterSpacing: 6.5, serviceCorridor: 4, edgeSetback: 3.5 },
    materials: {
      body: "industrialMetalPanelMid",
      accent: "industrialMetalPanelDark",
      plinth: "darkConcretePlinth",
      glass: "curtainWallBlueGrey",
      trim: "galvanizedSteel",
      roof: "roofMembrane",
    },
  },
  "semiconductor-office-modern-v1": {
    id: "semiconductor-office-modern-v1",
    type: "office",
    massing: {
      plinthHeight: 0.75,
      mechanicalBandRatio: 0.08,
      roofScreenHeight: 1.1,
      upperSetback: 1.8,
      penthouseRatio: 0.18,
      serviceAnnex: false,
    },
    envelope: {
      panelWidth: 4.8,
      panelJoints: false,
      cornerTrim: true,
      windowMode: "front-bays",
      windowBayWidth: 3.6,
      louverRows: 0,
      loadingBayCount: 0,
    },
    entrance: { enabled: true, width: 9, depth: 4.5, height: 6.2, canopyDepth: 4 },
    roof: { screen: true, clusterSpacing: 8, serviceCorridor: 4, edgeSetback: 5 },
    materials: {
      body: "architecturalConcrete",
      accent: "industrialMetalPanelDark",
      plinth: "darkConcretePlinth",
      glass: "curtainWallBlueGrey",
      trim: "galvanizedSteel",
      roof: "roofMembrane",
    },
  },
  "semiconductor-warehouse-logistics-v1": {
    id: "semiconductor-warehouse-logistics-v1",
    type: "warehouse",
    massing: {
      plinthHeight: 0.75,
      mechanicalBandRatio: 0.05,
      roofScreenHeight: 0.8,
      upperSetback: 0,
      penthouseRatio: 0,
      serviceAnnex: false,
    },
    envelope: {
      panelWidth: 7.2,
      panelJoints: true,
      cornerTrim: true,
      windowMode: "none",
      windowBayWidth: 4,
      louverRows: 0,
      loadingBayCount: 5,
    },
    entrance: { enabled: true, width: 4.8, depth: 2.4, height: 4.2, canopyDepth: 2.2 },
    roof: { screen: false, clusterSpacing: 9, serviceCorridor: 4, edgeSetback: 4 },
    materials: {
      body: "industrialMetalPanelLight",
      accent: "industrialMetalPanelDark",
      plinth: "darkConcretePlinth",
      glass: "curtainWallBlueGrey",
      trim: "galvanizedSteel",
      roof: "roofMembrane",
    },
  },
  "semiconductor-support-service-v1": {
    id: "semiconductor-support-service-v1",
    type: "support",
    massing: {
      plinthHeight: 0.7,
      mechanicalBandRatio: 0.12,
      roofScreenHeight: 0.9,
      upperSetback: 0.6,
      penthouseRatio: 0.16,
      serviceAnnex: false,
    },
    envelope: {
      panelWidth: 5.5,
      panelJoints: true,
      cornerTrim: true,
      windowMode: "ribbon",
      windowBayWidth: 4,
      louverRows: 1,
      loadingBayCount: 2,
    },
    entrance: { enabled: true, width: 5.5, depth: 2.8, height: 4.3, canopyDepth: 2.5 },
    roof: { screen: false, clusterSpacing: 8, serviceCorridor: 4, edgeSetback: 4 },
    materials: {
      body: "industrialMetalPanelLight",
      accent: "industrialMetalPanelDark",
      plinth: "darkConcretePlinth",
      glass: "curtainWallBlueGrey",
      trim: "galvanizedSteel",
      roof: "roofMembrane",
    },
  },
  "industrial-generic-v1": {
    id: "industrial-generic-v1",
    type: "building",
    massing: {
      plinthHeight: 0.75,
      mechanicalBandRatio: 0.1,
      roofScreenHeight: 0.9,
      upperSetback: 0.6,
      penthouseRatio: 0.12,
      serviceAnnex: false,
    },
    envelope: {
      panelWidth: 6,
      panelJoints: true,
      cornerTrim: true,
      windowMode: "ribbon",
      windowBayWidth: 4,
      louverRows: 0,
      loadingBayCount: 0,
    },
    entrance: { enabled: true, width: 5.5, depth: 2.8, height: 4.4, canopyDepth: 2.5 },
    roof: { screen: false, clusterSpacing: 8, serviceCorridor: 4, edgeSetback: 4 },
    materials: {
      body: "industrialMetalPanelLight",
      accent: "industrialMetalPanelDark",
      plinth: "darkConcretePlinth",
      glass: "curtainWallBlueGrey",
      trim: "galvanizedSteel",
      roof: "roofMembrane",
    },
  },
};

const defaultsByType: Record<string, string> = {
  fab: "semiconductor-fab-modern-v1",
  utility: "semiconductor-utility-industrial-v1",
  office: "semiconductor-office-modern-v1",
  warehouse: "semiconductor-warehouse-logistics-v1",
  support: "semiconductor-support-service-v1",
  building: "industrial-generic-v1",
};

export class BuildingProfileRegistry {
  resolve(item: FactoryBuilding, inferredType: string): BuildingStyleProfile {
    const requested = item.facade?.template;
    const id = requested && profiles[requested] ? requested : defaultsByType[inferredType] ?? defaultsByType.building;
    return profiles[id];
  }

  get(id: string): BuildingStyleProfile | undefined {
    return profiles[id];
  }

  list(): ReadonlyArray<BuildingStyleProfile> {
    return Object.values(profiles);
  }
}
