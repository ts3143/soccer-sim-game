import type { DBSchema, IDBPDatabase, StoreKey, StoreNames, StoreValue } from "idb";

/**
 * Map key for a row: numbers and strings as they are; compound keys (arrays, e.g. a
 * club-season's [cid, season]) as their JSON text. IndexedDB itself gets the real key.
 */
type CacheKey = string | number;

interface Entry {
  key: IDBValidKey;
  value: unknown;
}

/** The untyped store operations flush() needs; idb's generics can't express "any store of S". */
interface WritableStore {
  put(value: unknown, key?: IDBValidKey): Promise<IDBValidKey>;
  delete(key: IDBValidKey): Promise<void>;
}

/**
 * In-memory cache over a league database (the ZenGM pattern). The cached stores
 * are loaded once and then read from memory; writes mark rows dirty and reach
 * IndexedDB together, in one transaction, on flush(). The game calls flush()
 * after each Play action. Stores that are not cached (past seasons) are read
 * from IndexedDB directly.
 */
export class Cache<S extends DBSchema> {
  readonly db: IDBPDatabase<S>;
  private readonly rows = new Map<StoreNames<S>, Map<CacheKey, Entry>>();
  private readonly keyPaths = new Map<StoreNames<S>, string | string[] | null>();
  private readonly dirty = new Map<StoreNames<S>, Set<CacheKey>>();
  private readonly deleted = new Map<StoreNames<S>, Map<CacheKey, IDBValidKey>>();

  private constructor(db: IDBPDatabase<S>) {
    this.db = db;
  }

  /** Loads every row of the given stores into memory. */
  static async open<S extends DBSchema>(
    db: IDBPDatabase<S>,
    storeNames: readonly StoreNames<S>[],
  ): Promise<Cache<S>> {
    const cache = new Cache(db);
    const tx = db.transaction(storeNames, "readonly");
    for (const store of storeNames) {
      const objectStore = tx.objectStore(store);
      cache.keyPaths.set(store, objectStore.keyPath);
      const rows = new Map<CacheKey, Entry>();
      let cursor = await objectStore.openCursor();
      while (cursor) {
        const key = cursor.key as IDBValidKey;
        rows.set(toCacheKey(key), { key, value: cursor.value });
        cursor = await cursor.continue();
      }
      cache.rows.set(store, rows);
    }
    await tx.done;
    return cache;
  }

  get<N extends StoreNames<S>>(store: N, key: StoreKey<S, N>): StoreValue<S, N> | undefined {
    return this.storeRows(store).get(toCacheKey(key))?.value as StoreValue<S, N> | undefined;
  }

  getAll<N extends StoreNames<S>>(store: N): StoreValue<S, N>[] {
    return [...this.storeRows(store).values()].map((entry) => entry.value) as StoreValue<S, N>[];
  }

  /** Stores a row. Pass `key` for stores without a key path (like `meta`). */
  put<N extends StoreNames<S>>(store: N, value: StoreValue<S, N>, key?: StoreKey<S, N>): void {
    const idbKey = key === undefined ? this.keyFromValue(store, value) : (key as IDBValidKey);
    const cacheKey = toCacheKey(idbKey);
    this.storeRows(store).set(cacheKey, { key: idbKey, value });
    this.mark(store, cacheKey);
    this.deleted.get(store)?.delete(cacheKey);
  }

  delete<N extends StoreNames<S>>(store: N, key: StoreKey<S, N>): void {
    const idbKey = key as IDBValidKey;
    const cacheKey = toCacheKey(idbKey);
    this.storeRows(store).delete(cacheKey);
    this.dirty.get(store)?.delete(cacheKey);
    const deletes = this.deleted.get(store) ?? new Map<CacheKey, IDBValidKey>();
    this.deleted.set(store, deletes);
    deletes.set(cacheKey, idbKey);
  }

  get hasUnsavedChanges(): boolean {
    return this.dirty.size > 0 || this.deleted.size > 0;
  }

  /** Writes all dirty rows to IndexedDB in one transaction. */
  async flush(): Promise<void> {
    const stores = [...new Set([...this.dirty.keys(), ...this.deleted.keys()])];
    if (stores.length === 0) return;

    // Take the pending changes before awaiting, so writes made during the flush
    // stay dirty for the next one instead of being lost.
    const batches = stores.map((store) => ({
      store,
      puts: [...(this.dirty.get(store) ?? [])],
      deletes: [...(this.deleted.get(store) ?? new Map<CacheKey, IDBValidKey>())],
    }));
    this.dirty.clear();
    this.deleted.clear();

    const tx = this.db.transaction(stores, "readwrite");
    const requests: Promise<unknown>[] = [];
    for (const { store, puts, deletes } of batches) {
      const objectStore = tx.objectStore(store) as unknown as WritableStore;
      const inlineKeys = this.keyPaths.get(store) !== null;
      for (const cacheKey of puts) {
        const entry = this.storeRows(store).get(cacheKey);
        if (!entry) continue; // deleted since it was marked
        requests.push(
          inlineKeys ? objectStore.put(entry.value) : objectStore.put(entry.value, entry.key),
        );
      }
      for (const [, idbKey] of deletes) requests.push(objectStore.delete(idbKey));
    }
    try {
      await Promise.all([...requests, tx.done]);
    } catch (error) {
      // Nothing was written (the transaction aborted): mark everything again.
      for (const { store, puts, deletes } of batches) {
        for (const cacheKey of puts)
          if (this.storeRows(store).has(cacheKey)) this.mark(store, cacheKey);
        for (const [cacheKey, idbKey] of deletes) {
          if (!this.storeRows(store).has(cacheKey))
            this.delete(store, idbKey as StoreKey<S, typeof store>);
        }
      }
      throw error;
    }
  }

  private storeRows(store: StoreNames<S>): Map<CacheKey, Entry> {
    const rows = this.rows.get(store);
    if (!rows) throw new Error(`Cache: store "${String(store)}" is not cached`);
    return rows;
  }

  private keyFromValue(store: StoreNames<S>, value: unknown): IDBValidKey {
    const keyPath = this.keyPaths.get(store);
    if (!keyPath)
      throw new Error(`Cache: store "${String(store)}" has no key path; pass a key to put()`);
    const record = value as Record<string, unknown>;
    const key = Array.isArray(keyPath) ? keyPath.map((path) => record[path]) : record[keyPath];
    return key as IDBValidKey;
  }

  private mark(store: StoreNames<S>, key: CacheKey): void {
    const set = this.dirty.get(store) ?? new Set<CacheKey>();
    this.dirty.set(store, set);
    set.add(key);
  }
}

function toCacheKey(key: unknown): CacheKey {
  if (typeof key === "string" || typeof key === "number") return key;
  if (
    Array.isArray(key) &&
    key.every((part) => typeof part === "string" || typeof part === "number")
  ) {
    return JSON.stringify(key);
  }
  throw new Error(`Cache: unsupported key ${String(key)} (use strings, numbers or arrays of them)`);
}
