// Optional MongoDB sync layer for the image alt cache.
// Activates when MONGO_URI env var is set. Silently no-op when absent.

const MONGO_URI = process.env.MONGO_URI || "";
const MONGO_DB = process.env.MONGO_DB || "webcake_mcp";
const MONGO_COLLECTION = process.env.MONGO_COLLECTION || "image_alt_cache";

let _client: any = null;
let _collection: any = null;
let _connecting: Promise<any> | null = null;

async function connect() {
  if (!MONGO_URI) return null;
  if (_collection) return _collection;
  if (_connecting) return _connecting;

  _connecting = (async () => {
    try {
      const { MongoClient } = await import("mongodb");
      _client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
      await _client.connect();
      const db = _client.db(MONGO_DB);
      _collection = db.collection(MONGO_COLLECTION);
      await _collection.createIndex({ url_key: 1 }, { unique: true });
      return _collection;
    } catch (e) {
      _connecting = null;
      throw e;
    }
  })();

  return _connecting;
}

export function isMongoEnabled() {
  return !!MONGO_URI;
}

export async function mongoUpsertAlts(items: any[]) {
  if (!isMongoEnabled()) return { ok: false, reason: "MONGO_URI not set" };
  const col = await connect();
  if (!col) return { ok: false, reason: "no collection" };
  if (!items.length) return { ok: true, upserted: 0 };
  const now = Date.now();
  const ops = items.map((it: any) => ({
    updateOne: {
      filter: { url_key: it.url_key },
      update: {
        $set: {
          url_key: it.url_key,
          url: it.url,
          alt: it.alt,
          source: it.source || "ai",
          updated_at: now,
        },
        $setOnInsert: { created_at: now },
      },
      upsert: true,
    },
  }));
  const res = await col.bulkWrite(ops, { ordered: false });
  return { ok: true, upserted: res.upsertedCount, modified: res.modifiedCount };
}

export async function mongoFindAlts(urlKeys: any[]) {
  if (!isMongoEnabled() || !urlKeys.length) return new Map();
  const col = await connect();
  if (!col) return new Map();
  const cursor = col.find({ url_key: { $in: urlKeys } });
  const map = new Map();
  for await (const doc of cursor) {
    map.set(doc.url_key, doc);
  }
  return map;
}

export async function mongoListAlts(limit = 100, offset = 0) {
  if (!isMongoEnabled()) return { total: 0, entries: [] };
  const col = await connect();
  if (!col) return { total: 0, entries: [] };
  const total = await col.countDocuments();
  const entries = await col
    .find({}, { projection: { _id: 0 } })
    .sort({ updated_at: -1 })
    .skip(offset)
    .limit(limit)
    .toArray();
  return { total, entries };
}

export async function mongoCloseQuietly() {
  if (_client) {
    try { await _client.close(); } catch { /* ignore */ }
    _client = null;
    _collection = null;
    _connecting = null;
  }
}
