"use strict";
/* Тестовая Firestore в памяти (только для тестов).
   Повторяет важные правила настоящей Firestore:
   - в транзакции все чтения должны идти до записей;
   - create() падает, если документ существует; update() — если не существует;
   - set(..., {merge:true}) объединяет вложенные объекты;
   - транзакции выполняются последовательно (сериализуемость);
   - failNext / failAll имитируют недоступность базы. */
const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const isObj = v => v && typeof v === "object" && !Array.isArray(v);
function deepMerge(a, b) {
  const out = isObj(a) ? clone(a) : {};
  for (const [k, v] of Object.entries(b)) out[k] = isObj(v) && isObj(out[k]) ? deepMerge(out[k], v) : clone(v);
  return out;
}
class Snap { constructor(id, data) { this.id = id; this.exists = data !== undefined; this._d = data; } data() { return clone(this._d); } }

class FakeFirestore {
  constructor() { this.store = new Map(); this.failAll = false; this.failNext = 0; this._chain = Promise.resolve(); this.writes = 0; }
  _check() { if (this.failAll || this.failNext > 0) { if (this.failNext > 0) this.failNext--; const e = new Error("UNAVAILABLE: fake outage"); e.code = 14; throw e; } }
  _key(c, id) { return c + "/" + id; }
  _get(c, id) { return this.store.get(this._key(c, id)); }
  _put(c, id, d) { this.writes++; this.store.set(this._key(c, id), clone(d)); }
  collection(c) {
    const db = this;
    return { doc(id) {
      if (typeof id !== "string" || !id || id.includes("/")) throw new Error("bad doc id " + id);
      return {
        _c: c, _id: id, id,
        async get() { db._check(); return new Snap(id, clone(db._get(c, id))); },
        async set(d, o) { db._check(); db._applySet(c, id, d, o); },
        async update(d) { db._check(); db._applyUpdate(c, id, d); },
        async delete() { db._check(); db.store.delete(db._key(c, id)); }
      };
    } };
  }
  _applySet(c, id, d, o) { const cur = this._get(c, id); this._put(c, id, o && o.merge ? deepMerge(cur, d) : d); }
  _applyUpdate(c, id, d) { const cur = this._get(c, id); if (cur === undefined) { const e = new Error("NOT_FOUND"); e.code = 5; throw e; } this._put(c, id, Object.assign(clone(cur), clone(d))); }
  _applyCreate(c, id, d) { if (this._get(c, id) !== undefined) { const e = new Error("ALREADY_EXISTS"); e.code = 6; throw e; } this._put(c, id, d); }
  runTransaction(fn) {
    const run = async () => {
      this._check();
      const ops = []; let wrote = false;
      const tx = {
        get: async ref => { if (wrote) throw new Error("Firestore: reads must come before writes in a transaction"); this._check(); return new Snap(ref._id, clone(this._get(ref._c, ref._id))); },
        set: (ref, d, o) => { wrote = true; ops.push(() => this._applySet(ref._c, ref._id, d, o)); return tx; },
        update: (ref, d) => { wrote = true; ops.push(() => this._applyUpdate(ref._c, ref._id, d)); return tx; },
        create: (ref, d) => { wrote = true; ops.push(() => this._applyCreate(ref._c, ref._id, d)); return tx; },
        delete: ref => { wrote = true; ops.push(() => this.store.delete(this._key(ref._c, ref._id))); return tx; }
      };
      const res = await fn(tx);
      const snapshot = new Map(this.store);
      try { for (const op of ops) op(); } catch (e) { this.store = snapshot; throw e; } // атомарность
      return res;
    };
    const p = this._chain.then(run, run);
    this._chain = p.catch(() => {});
    return p;
  }
  dump(c) { const out = {}; for (const [k, v] of this.store) if (k.startsWith(c + "/")) out[k.slice(c.length + 1)] = clone(v); return out; }
}
module.exports = { FakeFirestore };
