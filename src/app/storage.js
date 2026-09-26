import { STORAGE } from './config.js';

/**
 * @typedef {object} KeyValueStore
 * @property {(key: string) => Promise<unknown>} get  Resolves `undefined` when the key is absent.
 * @property {(key: string, value: unknown) => Promise<void>} set  Value must be structured-cloneable.
 * @property {(key: string) => Promise<void>} remove
 * @property {() => Promise<string[]>} keys
 * @property {(prefix?: string) => Promise<Array<[string, unknown]>>} entries  Records whose key starts with `prefix`, in key order.
 * @property {(entries: ReadonlyArray<readonly [string, unknown]>) => Promise<void>} setMany  Writes all or none, in one transaction.
 */

/**
 * @typedef {object} Storage
 * @property {'persistent' | 'memory'} mode  `memory` means IndexedDB was unavailable; nothing survives a restart.
 * @property {Error | null} error  Why persistent storage is unavailable, if it is.
 * @property {KeyValueStore} letters  Entries, their photos, the draft and letter details; see letters/logic/storage.js.
 */

/**
 * @typedef {object} Backend
 * @property {(scope: string, key: string) => Promise<unknown>} get
 * @property {(scope: string, key: string, value: unknown) => Promise<void>} set
 * @property {(scope: string, key: string) => Promise<void>} remove
 * @property {(scope: string) => Promise<string[]>} keys
 * @property {(scope: string, prefix: string) => Promise<Array<[string, unknown]>>} entries
 * @property {(scope: string, entries: ReadonlyArray<readonly [string, unknown]>) => Promise<void>} setMany
 */

const STORE = 'kv';

// Records are keyed by [scope, key]: every namespace shares one object store,
// so new kinds of data need no schema change.

// Letters have lived under this scope since they were first kept (by the
// module that New Entry and Archive replaced). The name is only a storage key;
// keeping it means existing letters are read in place, with no migration.
// Earlier versions also wrote `app`, `user` (profile, contacts) and `m:callme`
// records; nothing reads them now, and they are left untouched.
const LETTERS_SCOPE = 'm:message-in-a-bottle';

/**
 * Entry `i` upgrades the database from version `i` to `i + 1`, so the database
 * version is always `MIGRATIONS.length`. Append new migrations; never edit,
 * reorder, or remove one that has shipped. A migration that throws aborts the
 * upgrade and leaves the existing data untouched.
 * @type {Array<(db: IDBDatabase, tx: IDBTransaction) => void>}
 */
const MIGRATIONS = [
  (db) => {
    db.createObjectStore(STORE);
  },

  // v2: profile and contacts became shared user data. They move, unchanged,
  // from the Settings module's namespace to `user`; the retired Home
  // selection key is dropped.
  (db, tx) => {
    const store = tx.objectStore(STORE);
    store.delete(['app', 'selectedModule']);
    const cursor = store.openCursor(IDBKeyRange.bound(['m:settings'], ['m:settings', []]));
    cursor.onsuccess = () => {
      const entry = cursor.result;
      if (!entry) return;
      store.put(entry.value, ['user', /** @type {IDBValidKey[]} */ (entry.key)[1]]);
      entry.delete();
      entry.continue();
    };
  },
];

const DB_VERSION = MIGRATIONS.length;

/** @returns {Promise<Storage>} Never rejects; falls back to memory when IndexedDB is unusable. */
export async function openStorage() {
  try {
    return createStorage(await createIndexedDbBackend(), 'persistent', null);
  } catch (error) {
    return createStorage(createMemoryBackend(), 'memory', toError(error));
  }
}

/**
 * @param {Backend} backend
 * @param {Storage['mode']} mode
 * @param {Error | null} error
 * @returns {Storage}
 */
function createStorage(backend, mode, error) {
  let persistenceRequested = mode !== 'persistent';

  // Letters are user data, so the first write asks the browser not to evict
  // storage under pressure. Silent on iOS; the app works either way.
  function requestPersistence() {
    if (persistenceRequested) return;
    persistenceRequested = true;
    const manager = navigator.storage;
    if (typeof manager?.persist !== 'function') return;
    manager
      .persisted()
      .then((persisted) => persisted || manager.persist())
      .catch(() => {});
  }

  /**
   * @param {string} scope
   * @param {() => void} [afterWrite]
   * @returns {KeyValueStore}
   */
  const scoped = (scope, afterWrite) =>
    Object.freeze({
      get: (key) => backend.get(scope, key),
      set: (key, value) => backend.set(scope, key, value).then(afterWrite),
      remove: (key) => backend.remove(scope, key),
      keys: () => backend.keys(scope),
      entries: (prefix = '') => backend.entries(scope, prefix),
      setMany: (entries) => backend.setMany(scope, entries).then(afterWrite),
    });

  return Object.freeze({
    mode,
    error,
    letters: scoped(LETTERS_SCOPE, requestPersistence),
  });
}

/** @returns {Promise<Backend>} */
async function createIndexedDbBackend() {
  /** @type {Promise<IDBDatabase> | null} */
  let connection = null;

  const connect = () => {
    const pending = openDatabase().then(
      (db) => {
        db.onversionchange = () => {
          db.close();
          connection = null;
        };
        db.onclose = () => {
          connection = null;
        };
        return db;
      },
      (error) => {
        connection = null;
        throw error;
      },
    );
    connection = pending;
    return pending;
  };

  await connect();

  /**
   * @template T
   * @param {IDBTransactionMode} mode
   * @param {Operation<T>} operation
   * @returns {Promise<T>}
   */
  async function run(mode, operation) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await transact(await (connection ?? connect()), mode, operation);
      } catch (error) {
        // iOS can drop idle IndexedDB connections; reconnect once before failing.
        if (attempt === 0 && error instanceof DOMException && error.name === 'InvalidStateError') {
          connection = null;
          continue;
        }
        throw error;
      }
    }
  }

  return {
    get: (scope, key) => run('readonly', (store) => store.get([scope, key])),
    set: async (scope, key, value) => {
      await run('readwrite', (store) => store.put(value, [scope, key]));
    },
    remove: async (scope, key) => {
      await run('readwrite', (store) => store.delete([scope, key]));
    },
    keys: async (scope) => {
      const keys = await run('readonly', (store) => store.getAllKeys(prefixRange(scope, '')));
      return keys.map(recordKey);
    },
    entries: (scope, prefix) =>
      run('readonly', (store) => {
        const range = prefixRange(scope, prefix);
        // Both requests walk the same range in key order within one transaction, so they line up.
        const keys = store.getAllKeys(range);
        const values = store.getAll(range);
        return () => keys.result.map((key, i) => /** @type {[string, unknown]} */ ([recordKey(key), values.result[i]]));
      }),
    setMany: async (scope, entries) => {
      await run('readwrite', (store) => {
        for (const [key, value] of entries) store.put(value, [scope, key]);
        return () => undefined;
      });
    },
  };
}

/**
 * Keys `[scope, k]` where `k` starts with `prefix`. Arrays sort after strings,
 * so `[scope, []]` bounds a whole scope; otherwise the bound is the prefix with
 * its last character incremented.
 * @param {string} scope
 * @param {string} prefix
 */
function prefixRange(scope, prefix) {
  const upper = prefix
    ? [scope, prefix.slice(0, -1) + String.fromCharCode(prefix.charCodeAt(prefix.length - 1) + 1)]
    : [scope, []];
  return IDBKeyRange.bound([scope, prefix], upper, false, true);
}

/** @param {IDBValidKey} key */
function recordKey(key) {
  return String(/** @type {IDBValidKey[]} */ (key)[1]);
}

/** @returns {Promise<IDBDatabase>} */
function openDatabase() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not supported in this browser.'));
      return;
    }

    let settled = false;
    // Some WebKit versions never answer indexedDB.open(); don't let startup hang on it.
    const timer = setTimeout(() => {
      settled = true;
      reject(new Error('Timed out opening IndexedDB.'));
    }, STORAGE.openTimeoutMs);

    /** @param {() => void} settle */
    const finish = (settle) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      settle();
    };

    /** @type {IDBOpenDBRequest} */
    let request;
    try {
      request = indexedDB.open(STORAGE.databaseName, DB_VERSION);
    } catch (error) {
      finish(() => reject(error));
      return;
    }

    request.onupgradeneeded = (event) => {
      const db = request.result;
      const tx = /** @type {IDBTransaction} */ (request.transaction);
      for (let version = event.oldVersion; version < DB_VERSION; version += 1) {
        MIGRATIONS[version](db, tx);
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      if (settled) {
        db.close();
        return;
      }
      finish(() => resolve(db));
    };
    request.onerror = () => {
      finish(() => reject(request.error ?? new Error('Could not open IndexedDB.')));
    };
  });
}

/**
 * Issues requests on the store and returns either the request whose result is
 * wanted, or a function that reads the result once the transaction commits.
 * @template T
 * @typedef {(store: IDBObjectStore) => IDBRequest<T> | (() => T)} Operation
 */

/**
 * @template T
 * @param {IDBDatabase} db
 * @param {IDBTransactionMode} mode
 * @param {Operation<T>} operation
 * @returns {Promise<T>} Settles when the transaction commits, so writes are durable on resolve.
 */
function transact(db, mode, operation) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    /** @type {() => T} */
    let read;
    try {
      const outcome = operation(tx.objectStore(STORE));
      read = typeof outcome === 'function' ? outcome : () => outcome.result;
    } catch (error) {
      // e.g. an uncloneable value: requests queued before it must not commit.
      try {
        tx.abort();
      } catch {
        // Already finished; nothing was written.
      }
      reject(error);
      return;
    }
    tx.oncomplete = () => resolve(read());
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Storage transaction aborted.'));
  });
}

/** @returns {Backend} */
function createMemoryBackend() {
  /** @type {Map<string, unknown>} */
  const records = new Map();
  /** @param {string} scope @param {string} key */
  const id = (scope, key) => `${scope}\u0000${key}`;
  // Copy values like IndexedDB does, so callers can't observe shared mutation.
  /** @param {unknown} value */
  const copy = (value) => (typeof structuredClone === 'function' ? structuredClone(value) : value);

  return {
    get: async (scope, key) => copy(records.get(id(scope, key))),
    set: async (scope, key, value) => {
      records.set(id(scope, key), copy(value));
    },
    remove: async (scope, key) => {
      records.delete(id(scope, key));
    },
    keys: async (scope) => {
      const prefix = id(scope, '');
      return [...records.keys()].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
    },
    entries: async (scope, prefix) => {
      const scopePrefix = id(scope, '');
      const start = id(scope, prefix);
      return [...records.entries()]
        .filter(([k]) => k.startsWith(start))
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, value]) => /** @type {[string, unknown]} */ ([k.slice(scopePrefix.length), copy(value)]));
    },
    setMany: async (scope, entries) => {
      // Copy everything first so a failure part-way writes nothing.
      const copies = entries.map(([key, value]) => /** @type {const} */ ([id(scope, key), copy(value)]));
      for (const [k, value] of copies) records.set(k, value);
    },
  };
}

/** @param {unknown} value */
function toError(value) {
  return value instanceof Error ? value : new Error(String(value));
}
