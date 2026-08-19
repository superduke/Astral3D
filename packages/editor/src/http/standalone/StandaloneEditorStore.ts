const DB_NAME = "astral3d-standalone";
const DB_VERSION = 1;
const PROJECT_STORE = "projects";

interface StandaloneProjectRecord extends ISceneFetchData {
  sceneJson?: ISceneJson | Record<string, unknown>;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

class StandaloneEditorStore {
  private dbPromise?: Promise<IDBDatabase>;

  private open(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(PROJECT_STORE)) {
          db.createObjectStore(PROJECT_STORE, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Failed to open standalone database"));
    });

    return this.dbPromise;
  }

  private clean(record: StandaloneProjectRecord): ISceneFetchData {
    const metadata = { ...record } as StandaloneProjectRecord;
    delete metadata.sceneJson;
    return metadata as ISceneFetchData;
  }

  async list(params: Service.ListPageQueryParams): Promise<Service.ListPageResult<ISceneFetchData>> {
    const db = await this.open();
    const transaction = db.transaction(PROJECT_STORE, "readonly");
    const records = await requestResult(
      transaction.objectStore(PROJECT_STORE).getAll() as IDBRequest<StandaloneProjectRecord[]>,
    );

    const query = (params.query ?? params.search ?? "").trim().toLowerCase();
    const filtered = query
      ? records.filter((item) =>
          `${item.sceneName ?? ""} ${item.sceneIntroduction ?? ""}`.toLowerCase().includes(query),
        )
      : records;

    filtered.sort((a, b) => {
      const left = Date.parse(a.updateTime ?? a.createTime ?? "") || 0;
      const right = Date.parse(b.updateTime ?? b.createTime ?? "") || 0;
      return params.order === "asc" ? left - right : right - left;
    });

    const offset = Math.max(0, Number(params.offset) || 0);
    const limit = Math.max(1, Number(params.limit) || 10);
    const total = filtered.length;
    const pages = total === 0 ? 0 : Math.ceil(total / limit);

    return {
      current: Math.floor(offset / limit) + 1,
      items: filtered.slice(offset, offset + limit).map((item) => this.clean(item)),
      pageSize: limit,
      pages,
      total,
    };
  }

  async get(id: string): Promise<ISceneFetchData | undefined> {
    const record = await this.getRecord(id);
    return record ? this.clean(record) : undefined;
  }

  async add(data: Partial<ISceneFetchData>): Promise<ISceneFetchData> {
    const db = await this.open();
    const now = new Date().toISOString();
    const id = this.createId();
    const record: StandaloneProjectRecord = {
      id,
      sceneType: data.sceneType ?? "通用场景",
      sceneName: data.sceneName?.trim() || "Standalone Project",
      sceneIntroduction: data.sceneIntroduction ?? "",
      sceneVersion: Number(data.sceneVersion) || 1,
      projectType: Number(data.projectType) || 0,
      coverPicture: data.coverPicture ?? "",
      hasDrawing: Boolean(data.hasDrawing),
      zip: "",
      zipSize: data.zipSize ?? "0B",
      exampleSceneId: data.exampleSceneId,
      createTime: now,
      updateTime: now,
    };

    const transaction = db.transaction(PROJECT_STORE, "readwrite");
    transaction.objectStore(PROJECT_STORE).put(record);
    await transactionDone(transaction);
    return this.clean(record);
  }

  async update(id: string, data: Partial<ISceneFetchData>): Promise<ISceneFetchData> {
    const db = await this.open();
    const existing = await this.getRecord(id);
    if (!existing) throw new Error(`Standalone project not found: ${id}`);

    const record: StandaloneProjectRecord = {
      ...existing,
      ...data,
      id,
      updateTime: new Date().toISOString(),
    };

    const transaction = db.transaction(PROJECT_STORE, "readwrite");
    transaction.objectStore(PROJECT_STORE).put(record);
    await transactionDone(transaction);
    return this.clean(record);
  }

  async remove(id: string): Promise<void> {
    const db = await this.open();
    const transaction = db.transaction(PROJECT_STORE, "readwrite");
    transaction.objectStore(PROJECT_STORE).delete(id);
    await transactionDone(transaction);
  }

  async saveScene(
    id: string,
    sceneInfo: Partial<ISceneFetchData>,
    sceneJson: ISceneJson | Record<string, unknown>,
  ): Promise<ISceneFetchData> {
    const db = await this.open();
    const existing = await this.getRecord(id);
    if (!existing) throw new Error(`Standalone project not found: ${id}`);

    const record: StandaloneProjectRecord = {
      ...existing,
      ...sceneInfo,
      id,
      zip: "",
      sceneJson,
      updateTime: new Date().toISOString(),
    };

    const transaction = db.transaction(PROJECT_STORE, "readwrite");
    transaction.objectStore(PROJECT_STORE).put(record);
    await transactionDone(transaction);
    return this.clean(record);
  }

  async getSceneJson(id: string): Promise<ISceneJson | Record<string, unknown> | undefined> {
    return (await this.getRecord(id))?.sceneJson;
  }

  private async getRecord(id: string): Promise<StandaloneProjectRecord | undefined> {
    const db = await this.open();
    const transaction = db.transaction(PROJECT_STORE, "readonly");
    return requestResult(
      transaction.objectStore(PROJECT_STORE).get(id) as IDBRequest<StandaloneProjectRecord | undefined>,
    );
  }

  private createId(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return `local-${crypto.randomUUID()}`;
    }
    return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export const standaloneEditorStore = new StandaloneEditorStore();
