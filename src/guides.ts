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

## webcake-data — Database SDK (built-in)
import { DBConnection } from 'webcake-data';
const db = new DBConnection();              // auto-uses the sandbox global site/token
const Model = db.model('collection_name');

### Model CRUD (all async unless noted)
- Model.create(doc)                         → created doc
- Model.insertMany([doc, ...])              → array
- Model.find(filter)                        → QueryBuilder (NOT a promise — chain then .exec()/await)
- Model.findOne(filter, { select, sort, populate })
- Model.findById(id, { select, populate })
- Model.updateOne(filter, update)           → { acknowledged, matchedCount, modifiedCount }
- Model.findByIdAndUpdate(id, update, { new: true })
- Model.findOneAndUpdate(filter, update)
- Model.updateMany(filter, update)
- Model.deleteOne(filter)                   → { acknowledged, deletedCount }
- Model.findByIdAndDelete(id) / Model.findOneAndDelete(filter)
- Model.deleteMany(filter)
- Model.countDocuments(filter)              → number
- Model.exists(filter)                      → boolean

### QueryBuilder (from Model.find())
Chain then terminate with .exec() (or just await the chain):
Model.find().where('age').gte(25).lte(40).in('role',['admin']).like('email','%@ex.com')
  .sort({ age:-1 }).limit(20).skip(10).select('name email').exec()
Operators: where, eq, ne, gt, gte, lt, lte, in, nin, between, like, sort, limit, skip, select, populate.

### Populate (join another collection)
Model.find().populate({
  field:'posts', table:'posts', referenceField:'user_id',
  select:'title', where:{}, sort:{ created_at:-1 }, limit:5, skip:0, justOne:false
}).exec()

## Built-in @webcake/* modules (first arg is always request; they auth via global.token)
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

- '@webcake/customer'  (backend: /cms_function/{site}/customer/…)  → customer object ({} if none)
    findCustomerById(request, id)     GET .../customer/identity/{id}
    findCustomerByPhone(request, phone) GET .../customer/phone/{phone}
    findCustomerByEmail(request, email) GET .../customer/email/{email}

- '@webcake/promotion'  (backend: /cms_function/{site}/promotion/add_bonus)
    addBonus(request, data)   POST add_bonus → response.
        It ADDS REWARD POINTS to a customer. data: { customer_id (required),
        point (number, required), message? (defaults "Bạn được cộng điểm") }.

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

## Example
import { DBConnection } from 'webcake-data';
import { findCustomerById } from '@webcake/customer';
export const post_RecentOrders = async (request) => {
  const { params, customer } = request;
  const db = new DBConnection();
  const orders = await db.model('orders')
    .find().where('customer_id').eq(customer.id || params.customer_id)
    .sort({ created_at:-1 }).limit(10)
    .populate({ field:'items', table:'order_items', referenceField:'order_id', limit:50 })
    .exec();
  return { count: orders.length, orders };
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
