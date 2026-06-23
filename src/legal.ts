/**
 * Privacy Policy + Terms of Service pages for the WebCake Storefront MCP connector.
 *
 * Hosted at /privacy (also /privacy-policy) and /terms (also /tos) so the
 * Claude Connectors Directory submission can point at stable, self-hosted URLs.
 * Plain self-contained HTML — no external deps, served by http.ts.
 */

const CONTACT_EMAIL = process.env.WEBCAKE_SUPPORT_EMAIL || "vuluu040320@gmail.com";
const LAST_UPDATED = "2026-06-23";

function page(title: string, bodyHtml: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} — WebCake Storefront MCP</title>
<style>
  :root{color-scheme:light dark}
  body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.65;color:#1e293b;background:#f8fafc}
  @media(prefers-color-scheme:dark){body{color:#e2e8f0;background:#0f172a}}
  main{max-width:760px;margin:0 auto;padding:48px 24px 80px}
  h1{font-size:1.9rem;margin:0 0 4px}
  h2{font-size:1.2rem;margin:32px 0 8px}
  .meta{color:#64748b;font-size:.9rem;margin-bottom:28px}
  a{color:#6d5efc}
  code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:rgba(127,127,127,.15);padding:1px 5px;border-radius:4px}
  ul{padding-left:22px}
  footer{margin-top:48px;padding-top:20px;border-top:1px solid rgba(127,127,127,.25);color:#64748b;font-size:.85rem}
</style></head>
<body><main>${bodyHtml}
<footer>WebCake Storefront MCP &middot; <a href="https://webcake.io">webcake.io</a> &middot; <a href="https://github.com/vuluu2k/webcake-storefront-mcp">source</a> &middot; Contact: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></footer>
</main></body></html>`;
}

export function privacyHtml(): string {
  return page(
    "Privacy Policy",
    `<h1>Privacy Policy</h1>
<div class="meta">Last updated: ${LAST_UPDATED}</div>
<p>WebCake Storefront MCP ("the connector") is a Model Context Protocol server that lets an AI assistant
build and manage storefront pages, products, articles, and orders in your
<a href="https://webcake.io">WebCake / StoreCake</a> account. This policy explains what data the connector
handles, why, who receives it, and how long it is kept.</p>

<h2>Categories of personal data we access</h2>
<ul>
  <li><strong>Your WebCake identity, JWT, and session ID.</strong> When you connect via OAuth, you log in to
  WebCake through the browser and the connector receives your bearer JWT and workspace session ID (<code>wsid</code>).
  These are used <em>solely</em> to call the WebCake / StoreCake backend API on your behalf. They are never
  shared with the AI assistant or any third party.</li>
  <li><strong>Storefront content you ask the assistant to create or edit.</strong> Page source, product details,
  article text, customer look-ups, and order data flow through the connector to your WebCake account.
  <em>Purpose:</em> to carry out the actions you request.</li>
  <li><strong>Images.</strong> When you ask the assistant to resize or process images, they are handled transiently
  in memory and forwarded to the WebCake CDN. No image is retained on the connector after the request completes.</li>
</ul>

<h2>What we store and for how long</h2>
<ul>
  <li><strong>OAuth tokens (in-process memory only).</strong> The connector holds your JWT and session ID in an
  in-memory token store <strong>only for the lifetime of the server process</strong>. There is no database;
  tokens are never written to disk by the connector. Access tokens expire automatically after ~1 hour, refresh
  tokens after ~30 days. A server restart clears all tokens.</li>
  <li><strong>Local CLI config (stdio mode).</strong> When you run <code>npx webcake-storefront-mcp login</code>,
  your token and session ID are saved to a local SQLite file on <em>your own machine</em> (at
  <code>~/.webcake-storefront-mcp.db</code> or similar). This file stays on your device and is not transmitted
  anywhere by the connector.</li>
  <li>The connector does <strong>not</strong> run an analytics database, does <strong>not</strong> sell or share
  data, and does <strong>not</strong> perform tracking or behavioral profiling.</li>
</ul>

<h2>Categories of recipients</h2>
<p>Your data is shared only with the services required to fulfil your request:</p>
<ul>
  <li><strong>WebCake / StoreCake API</strong> (<code>api.storefront.webcake.io</code>) — stores and serves
  your storefront pages, products, and orders; governed by WebCake's own terms.</li>
  <li><strong>WebCake CDN</strong> — hosts images and published page assets that you explicitly create or upload.</li>
</ul>

<h2>Data we do NOT collect</h2>
<p>The connector never asks for or stores payment-card data, passwords, health data, government identifiers,
or MFA/OTP codes. It operates only on the storefront content you explicitly instruct the assistant to
create — it does <strong>not</strong> read, reconstruct, or infer your conversation history.</p>

<h2>Data retention &amp; deletion</h2>
<p>OAuth tokens expire automatically or are cleared on server restart. You can revoke access at any time by
disconnecting the connector in Claude / ChatGPT settings, or by running <code>npx webcake-storefront-mcp logout</code>.
Storefront content you create lives in your WebCake account and is managed there. To request deletion of
anything else, contact us below.</p>

<h2>Security</h2>
<p>All traffic uses HTTPS. The connector implements OAuth 2.1 with PKCE; your raw WebCake token is never
exposed to the AI assistant — only resolved server-side per request via an opaque OAuth access token.</p>

<h2>Contact</h2>
<p>Questions or requests: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> or open an issue at
<a href="https://github.com/vuluu2k/webcake-storefront-mcp/issues">github.com/vuluu2k/webcake-storefront-mcp</a>.</p>`
  );
}

export function termsHtml(): string {
  return page(
    "Terms of Service",
    `<h1>Terms of Service</h1>
<div class="meta">Last updated: ${LAST_UPDATED}</div>
<p>By connecting to and using the WebCake Storefront MCP connector ("the service") you agree to these terms.</p>

<h2>What the service does</h2>
<p>The service exposes tools that let an AI assistant create, update, and manage storefront pages, products,
articles, customers, and orders in your WebCake / StoreCake account. It acts on your behalf using credentials
you authorize through the WebCake OAuth login flow.</p>

<h2>Your responsibilities</h2>
<ul>
  <li>You must have a valid WebCake / StoreCake account and the necessary permissions for any sites you target.</li>
  <li>You are responsible for all content you generate and publish through the service, and for complying with
  WebCake's terms of service and applicable law.</li>
  <li>Do not use the service to create, distribute, or publish unlawful, infringing, or harmful content.</li>
  <li>Do not attempt to use the service to access accounts or data you are not authorized to access.</li>
</ul>

<h2>Availability &amp; changes</h2>
<p>The service is provided "as is" without warranty of any kind. We may update, suspend, or discontinue it at
any time and may change these terms; continued use after a change constitutes acceptance of the new terms.</p>

<h2>Limitation of liability</h2>
<p>To the fullest extent permitted by applicable law, the operators of the connector are not liable for
indirect, incidental, or consequential damages arising from use of the service. The service relies on
third-party platforms (WebCake, the AI assistant host) whose own terms also apply.</p>

<h2>Intellectual property</h2>
<p>The connector is open-source software released under the MIT License. The WebCake trademarks and platform
are owned by their respective holders.</p>

<h2>Contact</h2>
<p><a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> &middot;
<a href="https://github.com/vuluu2k/webcake-storefront-mcp/issues">GitHub Issues</a></p>`
  );
}
