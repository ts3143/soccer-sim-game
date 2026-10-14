import type { DBSchema, IDBPDatabase, StoreKey, StoreNames, StoreValue } from "idb";

/** Keys the cache can hold in a Map (IndexedDB also allows dates and arrays; we don't use them). */
type CacheKey = string | number;

/** The untyped store operations flush() needs; idb's generics can't express "any store of S". */
interface WritableStore {
  put(value: unknown, key?: IDBValidKey): Promise<IDBValidKey>;
  delete(key: IDBValidKey): Promise<void>;
}

/**
 * In-memory cache over a league database (the ZenGM pattern). The cached stores
 * are loaded once and then read from memory; writes mark rows dirty and reach
 * IndexedDB together, in one transaction, on flush(). The game calls flush()
 * after each Play action. Stores that are not cached (past seasons, M1+) are
 * read from IndexedDB directly.
 */
export class Cache<S extends DBSchema> {
  readonly db: IDBPDatabase<S>;
  private readonly rows = new Map<StoreNames<S>, Map<CacheKey, unknown>>();
  private readonly keyPaths = new Map<StoreNames<S>, string | null>();
  private readonly dirty = new Map<StoreNames<S>, Set<CacheKey>>();
  private readonly deleted = new Map<StoreNames<S>, Set<CacheKey>>();

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
      const keyPath = objectStore.keyPath;
      if (Array.isArray(keyPath))
        throw new Error(`Cache: compound key paths are not supported (${String(store)})`);
      cache.keyPaths.set(store, keyPath);
      const rows = new Map<CacheKey, unknown>();
      let cursor = await objectStore.openCursor();
      while (cursor) {
        rows.set(toCacheKey(cursor.key), cursor.value);
        cursor = await cursor.continue();
      }
      cache.rows.set(store, rows);
    }
    await tx.done;
    return cache;
  }

  get<N extends StoreNames<S>>(store: N, key: StoreKey<S, N>): StoreValue<S, N> | undefined {
    return this.storeRows(store).get(toCacheKey(key)) as StoreValue<S, N> | undefined;
  }

  getAll<N extends StoreNames<S>>(store: N): StoreValue<S, N>[] {
    return [...this.storeRows(store).values()] as StoreValue<S, N>[];
  }

  /** Stores a row. Pass `key` for stores without a key path (like `meta`). */
  put<N extends StoreNames<S>>(store: N, value: StoreValue<S, N>, key?: StoreKey<S, N>): void {
    const cacheKey = key === undefined ? this.keyFromValue(store, value) : toCacheKey(key);
    this.storeRows(store).set(cacheKey, value);
    this.mark(this.dirty, store, cacheKey);
    this.deleted.get(store)?.delete(cacheKey);
  }

  delete<N extends StoreNames<S>>(store: N, key: StoreKey<S, N>): void {
    const cacheKey = toCacheKey(key);
    this.storeRows(store).delete(cacheKey);
    this.mark(this.deleted, store, cacheKey);
    this.dirty.get(store)?.delete(cacheKey);
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
      deletes: [...(this.deleted.get(store) ?? [])],
    }));
    this.dirty.clear();
    this.deleted.clear();

    const tx = this.db.transaction(stores, "readwrite");
    const requests: Promise<unknown>[] = [];
    for (const { store, puts, deletes } of batches) {
      const objectStore = tx.objectStore(store) as unknown as WritableStore;
      const inlineKeys = this.keyPaths.get(store) !== null;
      for (const key of puts) {
        const value = this.storeRows(store).get(key);
        requests.push(inlineKeys ? objectStore.put(value) : objectStore.put(value, key));
      }
      for (const key of deletes) requests.push(objectStore.delete(key));
    }
    try {
      await Promise.all([...requests, tx.done]);
    } catch (error) {
      // Nothing was written (the transaction aborted): mark everything dirty again.
      for (const { store, puts, deletes } of batches) {
        for (const key of puts)
          if (!this.deleted.get(store)?.has(key)) this.mark(this.dirty, store, key);
        for (const key of deletes)
          if (!this.dirty.get(store)?.has(key)) this.mark(this.deleted, store, key);
      }
      throw error;
    }
  }

  private storeRows(store: StoreNames<S>): Map<CacheKey, unknown> {
    const rows = this.rows.get(store);
    if (!rows) throw new Error(`Cache: store "${String(store)}" is not cached`);
    return rows;
  }

  private keyFromValue(store: StoreNames<S>, value: unknown): CacheKey {
    const keyPath = this.keyPaths.get(store);
    if (!keyPath)
      throw new Error(`Cache: store "${String(store)}" has no key path; pass a key to put()`);
    return toCacheKey((value as Record<string, unknown>)[keyPath]);
  }

  private mark(
    marks: Map<StoreNames<S>, Set<CacheKey>>,
    store: StoreNames<S>,
    key: CacheKey,
  ): void {
    const set = marks.get(store) ?? new Set<CacheKey>();
    marks.set(store, set);
    set.add(key);
  }
}

function toCacheKey(key: unknown): CacheKey {
  if (typeof key === "string" || typeof key === "number") return key;
  throw new Error(`Cache: unsupported key ${String(key)} (use strings or numbers)`);
}
