export type FactoryAlarmSeverity = "info" | "warning" | "critical";

export interface FactoryTwinAssetState {
  assetId: string;
  online?: boolean;
  status?: string;
  alarm?: boolean;
  severity?: FactoryAlarmSeverity;
  message?: string;
  telemetry?: Record<string, string | number | boolean | null>;
  updatedAt: number;
}

export type FactoryTwinStateListener = (
  state: FactoryTwinAssetState,
  previous?: FactoryTwinAssetState,
) => void;

/**
 * Small in-memory digital-twin state store. The transport layer (REST,
 * WebSocket, MQTT bridge, mock scenario, etc.) only needs to call patch().
 */
export class FactoryTwinStateStore {
  private readonly states = new Map<string, FactoryTwinAssetState>();
  private readonly listeners = new Set<FactoryTwinStateListener>();

  get(assetId: string): FactoryTwinAssetState | undefined {
    return this.states.get(assetId);
  }

  all(): FactoryTwinAssetState[] {
    return [...this.states.values()];
  }

  patch(
    assetId: string,
    patch: Partial<Omit<FactoryTwinAssetState, "assetId" | "updatedAt">>,
  ): FactoryTwinAssetState {
    const previous = this.states.get(assetId);
    const next: FactoryTwinAssetState = {
      ...(previous ?? { assetId }),
      ...patch,
      assetId,
      updatedAt: Date.now(),
    };
    this.states.set(assetId, next);
    this.emit(next, previous);
    return next;
  }

  clearAlarm(assetId: string): FactoryTwinAssetState {
    return this.patch(assetId, {
      alarm: false,
      severity: undefined,
      message: undefined,
    });
  }

  remove(assetId: string): void {
    this.states.delete(assetId);
  }

  clear(): void {
    this.states.clear();
  }

  subscribe(listener: FactoryTwinStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(
    state: FactoryTwinAssetState,
    previous?: FactoryTwinAssetState,
  ): void {
    for (const listener of this.listeners) {
      listener(state, previous);
    }
  }
}
