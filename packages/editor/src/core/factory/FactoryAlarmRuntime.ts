import * as THREE from "three";
import { App } from "@astral3d/engine";
import { FactorySemanticRuntime } from "./FactorySemanticRuntime";
import { prepareFactoryObjectForAstral } from "./FactoryAstralCompat";
import {
  FactoryTwinStateStore,
  type FactoryAlarmSeverity,
  type FactoryTwinAssetState,
} from "./FactoryTwinStateStore";

export interface RaiseFactoryAlarmOptions {
  severity?: FactoryAlarmSeverity;
  message?: string;
  focus?: boolean;
}

export class FactoryAlarmRuntime {
  readonly stateStore: FactoryTwinStateStore;

  private readonly markerRoot = new THREE.Group();
  private readonly markers = new Map<string, THREE.Group>();
  private readonly unsubscribe: () => void;

  constructor(
    private readonly root: THREE.Group,
    private readonly semantics: FactorySemanticRuntime,
    stateStore?: FactoryTwinStateStore,
  ) {
    this.stateStore = stateStore ?? new FactoryTwinStateStore();
    this.markerRoot.name = "EHS_ALARMS";
    this.markerRoot.userData = { assetType: "ehs_alarm_collection" };
    prepareFactoryObjectForAstral(this.markerRoot);
    App.addObject(this.markerRoot, root);

    this.unsubscribe = this.stateStore.subscribe((state) => {
      if (state.alarm) this.upsertMarker(state);
      else this.removeMarker(state.assetId);
    });
  }

  raise(assetId: string, options: RaiseFactoryAlarmOptions = {}): boolean {
    const anchor = this.semantics.getAssetAnchor(assetId);
    if (!anchor) return false;

    this.stateStore.patch(assetId, {
      alarm: true,
      severity: options.severity ?? "critical",
      message: options.message ?? "EHS alarm",
    });

    if (options.focus !== false) {
      this.semantics.focusAsset(assetId, true);
    }
    return true;
  }

  clear(assetId: string): void {
    this.stateStore.clearAlarm(assetId);
  }

  dispose(): void {
    this.unsubscribe();
    this.markers.clear();
    if (this.markerRoot.parent) {
      App.removeObject(this.markerRoot);
    }
  }

  private upsertMarker(state: FactoryTwinAssetState): void {
    const anchor = this.semantics.getAssetAnchor(state.assetId);
    if (!anchor) return;

    let marker = this.markers.get(state.assetId);
    if (!marker) {
      marker = this.createMarker(state.assetId, state.severity ?? "critical");
      this.markers.set(state.assetId, marker);
      prepareFactoryObjectForAstral(marker);
      App.addObject(marker, this.markerRoot);
    } else {
      this.applySeverity(marker, state.severity ?? "critical");
    }

    this.root.updateMatrixWorld(true);
    const local = this.root.worldToLocal(anchor.position.clone());
    marker.position.copy(local);
    marker.position.y += 3.5;
    marker.userData = {
      ...marker.userData,
      assetId: state.assetId,
      severity: state.severity,
      message: state.message,
      updatedAt: state.updatedAt,
    };
  }

  private removeMarker(assetId: string): void {
    const marker = this.markers.get(assetId);
    if (!marker) return;
    this.markers.delete(assetId);
    if (marker.parent) App.removeObject(marker);
  }

  private createMarker(
    assetId: string,
    severity: FactoryAlarmSeverity,
  ): THREE.Group {
    const group = new THREE.Group();
    group.name = `ALARM_${assetId}`;
    group.userData = {
      assetId,
      assetType: "ehs_alarm_marker",
      transient: true,
    };

    const material = new THREE.MeshBasicMaterial({
      color: this.severityColor(severity),
      transparent: true,
      opacity: 0.9,
      depthTest: false,
      depthWrite: false,
    });

    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.75, 20, 12),
      material,
    );
    beacon.name = "BEACON";
    beacon.renderOrder = 1000;
    group.add(beacon);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.2, 0.16, 10, 36),
      material.clone(),
    );
    ring.name = "ALARM_RING";
    ring.rotation.x = Math.PI / 2;
    ring.renderOrder = 999;
    group.add(ring);

    const outerRing = new THREE.Mesh(
      new THREE.TorusGeometry(3.1, 0.08, 8, 42),
      material.clone(),
    );
    outerRing.name = "ALARM_RING_OUTER";
    outerRing.rotation.x = Math.PI / 2;
    outerRing.renderOrder = 998;
    group.add(outerRing);

    return group;
  }

  private applySeverity(
    marker: THREE.Group,
    severity: FactoryAlarmSeverity,
  ): void {
    const color = new THREE.Color(this.severityColor(severity));
    marker.traverse((object) => {
      if (!object.isMesh) return;
      const mesh = object as THREE.Mesh;
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      for (const material of materials) {
        if (material instanceof THREE.MeshBasicMaterial) {
          material.color.copy(color);
        }
      }
    });
  }

  private severityColor(severity: FactoryAlarmSeverity): number {
    switch (severity) {
      case "info":
        return 0x27a7ff;
      case "warning":
        return 0xffb020;
      case "critical":
      default:
        return 0xff2d2d;
    }
  }
}
