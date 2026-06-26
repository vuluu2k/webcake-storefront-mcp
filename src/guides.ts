export const HTTP_FUNCTION_GUIDE = `
# HTTP Function Guide

## Syntax
export const [method]_[FunctionName] = async (request) => { return result; }
- Method: lowercase (get, post, put, patch, delete) — picked from the export-name prefix.
- FunctionName: keep it stable; it becomes the endpoint name.
- Make it async; the return value is JSON-serialized and sent back to the caller.
- Examples: get_Products, post_CreateOrder, delete_RemoveItem

## The request argument
Your function is called with ONE object: { params, customer, site_id, account, data }.
- request.params    — the arguments the caller passed (query string for GET, body for POST/…).
- request.customer  — the logged-in storefront customer (when authenticated), else {}. Fields: id, name, email, first_name, last_name, phone_number, avatar.
- request.account   — the logged-in admin account (when called by an admin), else {}.
- request.site_id   — the current site id (string).
- request.data      — extra request data (usually {}).
IMPORTANT: pass request through to the @webcake/* module functions (their first arg).

## Endpoint after deploy
ANY method → /api/v1/{site_id}/_functions/{FunctionName}
The caller receives your return value as data.result. From the storefront, the
webcake-fn client (api.method_FunctionName(params)) returns that result directly.

## webcake-data — Database SDK (built-in). This is the MAIN way to read/write a site's collections.
import { DBConnection } from 'webcake-data';
const db = new DBConnection();              // auto-uses the sandbox global site/token
const Model = db.model('collection_name');  // 'collection_name' = the table_name of a collection

The API is Mongoose-DOCUMENT style: filters are plain MongoDB-style OBJECTS, chains are
DIRECTLY AWAITABLE (NO .exec()), and you select fields with an ARRAY. Every document has an
\`id\` (UUID string) plus \`inserted_at\` / \`updated_at\`.

### Read
- await Model.findOne(filter)                          → one doc (or null)
- await Model.findOne(filter, { populate:{ field, select:[...] } })
- await Model.find(filter).select([...]).populate({...}).sort({...}).limit(n)   → array (await the CHAIN; no .exec())
- await Model.countDocuments(filter)                   → number

filter is a MongoDB-style object. Operators go INSIDE the field value:
  { thanh_vien: userId }                                 // equals
  { status: { $in: [0, 1, 2] } }                         // in a list
  { trang_thai_tg: { $ne: 3 } }                          // not equal
  // also $nin, $gt, $gte, $lt, $lte, $exists — the usual MongoDB query operators.

Chain methods on a Model.find(filter):
  .select(["id", "name", "diem_so"])                    // ARRAY of field names to return
  .sort({ inserted_at: -1 })                            // 1 ascending, -1 descending (multi-key ok)
  .limit(20)  .skip(0)
  .populate({ field: "thanh_vien", select: ["id", "name", "avatar"] })

### Populate (resolve a reference field)
A reference field stores the related row's \`id\` (a string). \`.populate({ field, select:[...] })\`
replaces it with the related OBJECT (only the selected fields). After populate, read it as an
object; before/without populate it's the raw id string. Handle both:
  const id = typeof row.thanh_vien === "object" ? row.thanh_vien.id : row.thanh_vien;
populate also works as a 2nd-arg option on findOne: Model.findOne(filter, { populate:{ field, select:[...] } }).

### Write
- await Model.create(doc)                               → created doc (use doc.id afterwards)
- await Model.findOneAndUpdate(filter, update, { new: true })   → the UPDATED doc ({ new:true } = return the new version)
- await Model.updateOne(filter, update)                 → write result
- await Model.updateMany(filter, update)                → bulk update matching rows
- await Model.deleteMany(filter)                        → delete matching rows
(update is a plain object of the fields to set, e.g. { status: 1, ty_le_thang: 75 }.)

### Real example pattern (from a production function)
const Members = db.model("thanh_vien_ps");
const rows = await Members
  .find({ playspace: psId, status: { $in: [0, 1, 2] } })
  .select(["id", "thanh_vien", "tien_con_lai", "status"])
  .populate({ field: "thanh_vien", select: ["id", "name", "avatar"] })
  .sort({ status: 1, inserted_at: 1 })
  .limit(50);
const count = await Members.countDocuments({ playspace: psId, status: { $in: [0, 1, 2] } });
const created = await Members.create({ thanh_vien: userId, playspace: psId, status: 0 });
await Members.updateOne({ id: created.id }, { tien_con_lai: 100000 });

### Common patterns (battle-tested in production functions)
- FIND-OR-CREATE (ensure a row exists):
    let row = await M.findOne({ key: v });
    if (!row) row = await M.create({ key: v, ...defaults });
    return row;
- UPSERT + read back the new version:
    const updated = await M.findOneAndUpdate({ key: v }, { field: x }, { new: true });
- COUNT then DENORMALIZE onto a parent (cheap reads later):
    const n = await Members.countDocuments({ playspace: psId, status: { $in: [0,1,2] } });
    await PlaySpace.updateOne({ id: psId }, { so_thanh_vien: n });
- MULTI-TABLE write (no transactions — do the steps in order, validate first):
    for (const it of items) await Members.updateOne({ id: it.id }, { tien_con_lai: it.bal });
    await PlaySpace.updateOne({ id: psId }, { tien_con_lai: total });
    await History.create({ playspace: psId, items });           // append an audit/history row
- SOFT DELETE (keep history) — set a status instead of deleteMany:
    await M.updateOne({ id }, { status: INACTIVE });            // and filter it out with { status: { $ne: INACTIVE } }
- REFERENCE id helpers (a ref field is an id string, or an object after populate):
    const toId = (v) => (v && typeof v === "object" ? String(v.id || "") : String(v || ""));
    const toNumber = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
- STATUS as numeric enums (define constants up top): const STATUS = { OWNER:0, ACTIVE:1, GUEST:2, INACTIVE:3 };
  then query with { status: { $in: [STATUS.OWNER, STATUS.ACTIVE] } }.
- ALWAYS guard auth + wrap in try/catch returning a coded mess:
    const userId = request.customer?.id ?? ""; if (!userId) return { mess: "NO_ACCOUNT_CALL" };
    try { /* … */ return { mess: "OK", ...data }; } catch (err) { console.error(err?.message || err); return { mess: "SYSTEM_ERROR" }; }

## Custom data TABLES (collections) — end-to-end (VERIFIED flow)
A "collection" is a custom DB table. To stand one up and use it from a function:
1. Create the table + columns with the MCP tools: create_collection({ name, columns:[{name,type},…] })
   then update_collection_columns to change them. (Types: string|text|integer|float|boolean|
   naive_datetime|binary_id|map|array.) The table always has id/inserted_at/updated_at/creator_id.
2. READ rows directly with the MCP tool query_collection_records({ table_name, where, order_by }).
3. WRITE rows from an HTTP function via webcake-data — db.model(table) gives full CRUD on it:
   const T = db.model("my_table");
   const row = await T.create({ email: "a@b.com" });          // insert
   await T.updateOne({ id: row.id }, { email: "c@d.com" });    // update
   await T.deleteMany({ email: "a@b.com" });                   // delete
   const rows = await T.find({ … }).select([…]).limit(50);     // query
   (There is NO direct dashboard record-INSERT API — record writes MUST go through a function.
    Deploy the function with the update_http_function MCP tool, then call it with run_function.)

## Built-in @webcake/* modules (first arg is always request; they auth via global.token — these run
## INSIDE the function sandbox, so they reach the /cms_function endpoints the dashboard JWT can't)
Thin wrappers over the backend's /cms_function/{site_id}/... endpoints. Pass request so
they pick up site_id. Below is EXACTLY what each call sends to the backend + what it returns.

- '@webcake/article'  (backend: /cms_function/{site}/blog/article…)
    findArticleById(request, id, opts?)
        GET .../blog/article/{id}?opts=<json>   → the article object ({} if not found)
    findArticle(request, payload, opts?)
        GET .../blog/article/all?<payload>&filters=<json>&opts=<json>
        payload: { filters?:{...}, page?, limit? }   → { data:[...], ... }
    createArticle(request, data)            POST .../blog/article   → full response
        data the backend accepts: { name (required), summary, content (HTML),
        images: string[] (hosted URLs), tags: string[], status_approval,
        render_inserted_at, render_expired_at }.  slug is auto-generated; the article is
        auto-filed under the default blog category (this endpoint takes NO category_id —
        use the create_article MCP tool if you need explicit category linkage).
        creator_id/customer_id come from the authenticated request.
    updateArticleById(request, id, data)    PATCH .../blog/article/{id}   (same fields) → response
    deleteArticleById(request, id)          DELETE .../blog/article/{id}  → response

- '@webcake/customer'  (backend: /cms_function/{site}/customer/…)  → customer object ({} if none).
    The object has at least { id, name, avatar, email, phone_number }. ALWAYS check \`customer?.id\`
    before using it (returns {} when not found). Confirmed against a real production function.
    findCustomerById(request, id)       GET .../customer/identity/{id}
    findCustomerByPhone(request, phone) GET .../customer/phone/{phone}
    findCustomerByEmail(request, email) GET .../customer/email/{email}
    Typical lookup-by-anything helper: try a code/sku table first, else normalize the phone and
    call findCustomerByPhone, else (has "@") findCustomerByEmail, else findCustomerById.

- '@webcake/promotion'  (backend: /cms_function/{site}/promotion/add_bonus)  — confirmed in real code
    addBonus(request, data)   POST add_bonus → response.
        It ADDS REWARD POINTS to a customer. data: { customer_id (required),
        point (number, required), message? (defaults "Bạn được cộng điểm") }.
        e.g. await addBonus(request, { customer_id: "abc", point: 10, message: "Cộng 10 điểm" }).

- '@webcake/token'  (backend: /external/oauth/token)
    getAccessToken(request)   → access_token string (throws if none).
        Needs request.x_storecake_refresh_token present (sent as x-storecake-refresh-token).

- '@webcake/app/automation'  (backend: /cms_function/{site}/application/automation/send_mail)
    sendMail(request, automationId, data)   → response (throws if send fails).
        Sends body { automation_id, data }. automation_id MUST be a valid UUID of an
        automation set up on the site — find it with the MCP tool list_automations.
        data is the payload passed into that automation/email template.

## File / media uploads → CDN url
Three ways, all returning a permanent CDN url:

1) A client POSTs a real file (multipart/form-data) to your function — it is auto-stored on
   the CDN and request.params.<field> / request.data.<field> is simply its CDN url (string).
   Use it directly, no upload call needed. (A function never sees raw file bytes.)

2) Upload from inside the function with '@webcake/media':
       import { upload } from '@webcake/media';
       const url = await upload(request, { url: someRemoteUrl });          // rehost a link
       const url = await upload(request, { base64, content_type });        // bytes you hold
   - { url }  — rehost a remote file (image/video/any); the SERVER fetches it (no base64).
     Use for an AI-generated image url, an external API's file, etc.
   - { base64, content_type } — content the function built/holds (data URI or raw base64;
     content_type e.g. "image/png", "application/pdf"). Throws on failure.

3) Direct call (admin/server, with the site's cms admin token):
       POST /api/v1/cms_function/{site_id}/media/upload   (Authorization: Bearer <token>)
       multipart field "file"  OR  JSON { url }  OR  JSON { base64, content_type }
       → { success: true, data: "<cdn url>" }

All three save the file into the site's media library under a dedicated, non-deletable
folder ("API Uploads") and count toward the site's storage quota (BASIC < 3GB, STANDARD
< 8GB, PRO unlimited). Over quota: upload() / the direct call return an error; a multipart
file POSTed to a function comes through as null for that field.

## Sandbox globals (no import)
- fetch(url, options)            — HTTP requests; response.ok/status/text()/json().
- URLSearchParams                — build/parse query strings.
- console.log / warn / error     — captured in debug mode (returned in data.logs).
- encodeURIComponent / decodeURIComponent / encodeURI / decodeURI
- global.domain, global.siteId, global.token, global.headers
- Standard JS: JSON, Math, Date, Object, Array, String, Number, Map, Set, Promise, Error.
NOT available: require()/import at runtime, Buffer, crypto, fs, process, setTimeout/setInterval, eval/Function.

## Limits
Runs sandboxed: ~4 MB memory, ~30 s timeout. The return value MUST be JSON-serializable.

## Cron jobs (jobs_config JSON)
{ "jobs": [{ "functionLocation": "backend/http_function", "functionName": "myFunc", "executionConfig": { "cronExpression": "0 2 * * *" } }] }

## Example (real-world shape)
Declare the models + db ONCE at module top, then one export per endpoint. Read the caller from
request.customer?.id (auth) and the inputs from request.params. Return a plain JSON object —
the convention is { mess: "OK", ...data } on success or { mess: "ERROR_CODE" } on failure.
import { DBConnection } from 'webcake-data';
import { findCustomerById } from '@webcake/customer';

const db = new DBConnection();
const Members = db.model('thanh_vien_ps');

export const post_MyMembers = async (request) => {
  const userId = request.customer?.id ?? "";        // the logged-in storefront customer
  if (!userId) return { mess: "NO_ACCOUNT_CALL" };
  const { playspace = "" } = request.params || {};  // POST body params
  try {
    const rows = await Members
      .find({ playspace, status: { $in: [0, 1, 2] } })
      .select(["id", "thanh_vien", "tien_con_lai", "status"])
      .populate({ field: "thanh_vien", select: ["id", "name", "avatar"] })
      .sort({ status: 1, inserted_at: 1 })
      .limit(50);
    const data = rows.map((row) => {
      const m = row.thanh_vien || {};                // populated object
      return { thanh_vien_ps: row.id, ten: m.name || "", tien: Number(row.tien_con_lai) || 0 };
    });
    return { mess: "OK", data };
  } catch (err) {
    console.error(err?.message || err);
    return { mess: "SYSTEM_ERROR" };
  }
};
`;

export const CUSTOM_CODE_GUIDE = `
# Custom Code Guide

Custom code is stored in site settings (applies to entire site, not per page).

## Injection points
- code_before_head: HTML/script inserted before </head> (meta tags, external CSS, tracking scripts)
- code_before_body: HTML/script inserted before </body> (DOM-ready JS, widgets)
- code_custom_css: Custom CSS (auto-wrapped in <style>)
- code_custom_javascript: Custom JavaScript

## webcake-fn (call HTTP functions from frontend)
Add CDN to code_before_head:
<script src="https://cdn.jsdelivr.net/npm/webcake-fn/dist/webcake-fn.umd.min.js"></script>

Then use window.api in code_custom_javascript or code_before_body:
- api.get_Products({ category: 'shoes' })
- api.post_CreateOrder({ items: [...] })
- Method lowercase + FunctionName matching backend export

## Available globals
- window.pubsub.subscribe(event, callback) / window.pubsub.publish(event, data)
- window.useNotification(type, { title, message }) — type: 'success' | 'error' | 'warning'
- window.resizeLink(url, width, height) — returns { webp, cdn }
- window.SITE_DATA, window.DATA_ORDER — site context

## Error handling
try { const r = await api.post_X(params); } catch (e) { window.useNotification('error', { title: 'Error', message: e.message }); }
`;
