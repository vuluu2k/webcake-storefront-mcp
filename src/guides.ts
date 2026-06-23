export const HTTP_FUNCTION_GUIDE = `
# HTTP Function Guide

## Syntax
export const [method]_[FunctionName] = (request) => { return result; }
- Method: lowercase (get, post, put, patch, delete)
- FunctionName: PascalCase
- Examples: get_Products, post_CreateOrder, delete_RemoveItem

## Request object
- request.params    — query params or body params
- request.customer  — logged-in customer { id, name, email, first_name, last_name, phone_number, avatar }
- request.account   — admin account { id, name, email, first_name, last_name, phone_number, avatar }
- request.data      — full request params (including query string)

## API endpoint after deploy
GET/POST/PUT/PATCH /api/v1/{site_id}/_functions/{FunctionName}

## webcake-data (Database SDK, built-in, no config needed)
import { DBConnection } from 'webcake-data';
const db = new DBConnection();
const Model = db.model('table_name');

### CRUD
- Model.create({ field: value })
- Model.insertMany([...])
- Model.find(filter).sort().limit().skip().select().exec()
- Model.findOne(filter, { select, sort, populate })
- Model.findById(id)
- Model.updateOne(filter, update)
- Model.findByIdAndUpdate(id, update)
- Model.updateMany(filter, update)
- Model.deleteOne(filter)
- Model.findByIdAndDelete(id)
- Model.deleteMany(filter)
- Model.countDocuments(filter)
- Model.exists(filter)

### QueryBuilder
Model.find().where('age').gte(25).lte(40).in('role', ['admin']).like('email', '%@ex.com').sort({ age: -1 }).limit(20).skip(10).select('name email').exec()

### Populate (joins)
Model.find().populate({ field: 'posts', table: 'posts', referenceField: 'user_id', select: 'title', where: {}, sort: {}, limit: 5 }).exec()

### Operators
where, eq, ne, gt, gte, lt, lte, in, nin, between, like, sort, limit, skip, select, populate

## Built-in Modules
- import { findArticleById, findArticle, createArticle, updateArticleById, deleteArticleById } from '@webcake/article'
- import { findCustomerById, findCustomerByPhone, findCustomerByEmail } from '@webcake/customer'
- import { addBonus } from '@webcake/promotion'
- import { getAccessToken } from '@webcake/token'
- import { sendMail } from '@webcake/app/automation'
All module functions take (request, ...args) and auto-use global token/site_id.

## Sandbox Globals (no import needed)
- fetch(url, options) — HTTP requests
- URLSearchParams — URL query building
- console.log/warn/error — logging (captured in debug mode)
- global.domain, global.siteId, global.token, global.headers

## Cron Jobs (jobs_config JSON)
{ "jobs": [{ "functionLocation": "backend/http_function", "functionName": "myFunc", "executionConfig": { "cronExpression": "0 2 * * *" } }] }
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
