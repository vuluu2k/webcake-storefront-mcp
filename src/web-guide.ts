/**
 * Marketing landing page for the WebCake Storefront MCP connector.
 *
 * Served at GET / when the client sends Accept: text/html or is a known bot UA.
 * Programmatic requests (healthcheck probes, MCP clients) still get JSON.
 */

const GITHUB_URL = "https://github.com/vuluu2k/webcake-storefront-mcp";
const NPM_URL = "https://www.npmjs.com/package/webcake-storefront-mcp";
const WEBCAKE_URL = "https://webcake.io";

const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" fill="url(#g)"/>
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#3FBB57"/>
    <stop offset="100%" stop-color="#108B67"/>
  </linearGradient></defs>
  <text x="16" y="22" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="700" font-size="17" fill="white">S</text>
  <circle cx="24" cy="9" r="4" fill="#FFD591"/>
</svg>`;

export function faviconSvg(): string {
  return FAVICON_SVG;
}

export function landingHtml(origin = ""): string {
  const mcpUrl = `${origin}/mcp`;
  const npxCmd = `npx webcake-storefront-mcp@latest`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>WebCake Storefront MCP — Build storefronts with AI</title>
<meta name="description" content="An MCP server that exposes ~101 tools for building and managing WebCake / StoreCake storefronts from any AI assistant — Claude, Cursor, Windsurf, and more.">
<meta property="og:type" content="website">
<meta property="og:title" content="WebCake Storefront MCP">
<meta property="og:description" content="Build, edit, and publish storefront pages, products, articles, and more — straight from your AI assistant.">
<meta property="og:image" content="${origin}/favicon.svg">
<meta property="og:url" content="${origin}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="WebCake Storefront MCP">
<meta name="twitter:description" content="~101 MCP tools for AI-powered storefront building on WebCake / StoreCake.">
<meta name="twitter:image" content="${origin}/favicon.svg">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<style>
:root {
  --green: #108B67;
  --green-light: #3FBB57;
  --accent: #FFD591;
  --bg: #f8fafc;
  --bg2: #f1f5f9;
  --text: #1e293b;
  --muted: #64748b;
  --border: rgba(0,0,0,.08);
  --card: #fff;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f172a;
    --bg2: #1e293b;
    --text: #e2e8f0;
    --muted: #94a3b8;
    --border: rgba(255,255,255,.08);
    --card: #1e293b;
  }
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:var(--bg);color:var(--text);line-height:1.6}
a{color:var(--green);text-decoration:none}
a:hover{text-decoration:underline}
.container{max-width:900px;margin:0 auto;padding:0 24px}

/* Nav */
nav{border-bottom:1px solid var(--border);padding:14px 0}
.nav-inner{display:flex;align-items:center;justify-content:space-between}
.nav-logo{display:flex;align-items:center;gap:10px;font-weight:700;font-size:1.05rem;color:var(--text);text-decoration:none}
.nav-logo svg{flex-shrink:0}
.nav-links{display:flex;align-items:center;gap:20px;font-size:.9rem}
.nav-links a{color:var(--muted)}
.nav-links a:hover{color:var(--text);text-decoration:none}
.btn{display:inline-flex;align-items:center;gap:6px;padding:8px 18px;border-radius:8px;font-size:.9rem;font-weight:600;cursor:pointer;border:none;transition:opacity .15s}
.btn-primary{background:var(--green);color:#fff}
.btn-primary:hover{opacity:.88;text-decoration:none}
.btn-outline{background:transparent;color:var(--text);border:1px solid var(--border)}
.btn-outline:hover{background:var(--bg2);text-decoration:none}

/* Hero */
.hero{padding:80px 0 64px;text-align:center}
.hero-badge{display:inline-flex;align-items:center;gap:6px;background:var(--bg2);border:1px solid var(--border);border-radius:99px;padding:5px 14px;font-size:.82rem;color:var(--muted);margin-bottom:28px}
.hero h1{font-size:clamp(2rem,5vw,3.2rem);font-weight:800;line-height:1.15;letter-spacing:-.02em;margin-bottom:20px}
.hero h1 span{color:var(--green)}
.hero p{font-size:1.15rem;color:var(--muted);max-width:580px;margin:0 auto 36px}
.hero-actions{display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap}
.hero-mcp{margin-top:40px;background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:18px 24px;display:inline-block;text-align:left;max-width:620px;width:100%}
.hero-mcp label{font-size:.78rem;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:8px}
.hero-mcp-row{display:flex;align-items:center;gap:10px}
.hero-mcp code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.95rem;flex:1;word-break:break-all;color:var(--text)}
.copy-btn{background:var(--card);border:1px solid var(--border);border-radius:6px;padding:5px 10px;font-size:.8rem;color:var(--muted);cursor:pointer;white-space:nowrap;transition:background .15s}
.copy-btn:hover{background:var(--bg2)}

/* Badges */
.badges{display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;margin:28px 0}
.badges img{height:20px}

/* Features */
.section{padding:56px 0}
.section-label{font-size:.82rem;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--green);margin-bottom:10px}
.section h2{font-size:clamp(1.5rem,3vw,2.1rem);font-weight:700;letter-spacing:-.01em;margin-bottom:12px}
.section p.lead{color:var(--muted);font-size:1.05rem;max-width:560px;margin-bottom:40px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px}
.card{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:26px}
.card-icon{font-size:1.6rem;margin-bottom:12px}
.card h3{font-size:1rem;font-weight:700;margin-bottom:6px}
.card p{font-size:.9rem;color:var(--muted)}

/* Tools list */
.tools-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px}
.tool-chip{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:9px 14px;font-size:.83rem;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--text)}

/* Install */
.install-block{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:32px;margin-top:32px}
.install-block h3{font-size:1.1rem;font-weight:700;margin-bottom:6px}
.install-block p{color:var(--muted);font-size:.9rem;margin-bottom:18px}
.code-block{background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:16px 20px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9rem;position:relative}
.code-block .copy-btn{position:absolute;top:10px;right:10px}
.install-tabs{display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap}
.tab-btn{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:6px 14px;font-size:.85rem;cursor:pointer;color:var(--muted);transition:all .15s}
.tab-btn.active,.tab-btn:hover{background:var(--green);color:#fff;border-color:var(--green)}

/* Footer */
footer{border-top:1px solid var(--border);padding:40px 0;text-align:center;color:var(--muted);font-size:.88rem}
footer a{color:var(--muted)}
footer a:hover{color:var(--text)}
.footer-links{display:flex;align-items:center;justify-content:center;gap:20px;flex-wrap:wrap;margin-bottom:12px}

@media(max-width:600px){
  .hero{padding:52px 0 40px}
  .hero-mcp-row{flex-direction:column;align-items:flex-start}
  nav .btn-outline{display:none}
}
</style>
</head>
<body>

<nav>
  <div class="container">
    <div class="nav-inner">
      <a class="nav-logo" href="/">
        <svg width="28" height="28" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
          <rect width="32" height="32" rx="7" fill="url(#ng)"/>
          <defs><linearGradient id="ng" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#3FBB57"/><stop offset="100%" stop-color="#108B67"/>
          </linearGradient></defs>
          <text x="16" y="22" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="700" font-size="17" fill="white">S</text>
          <circle cx="24" cy="9" r="4" fill="#FFD591"/>
        </svg>
        WebCake Storefront MCP
      </a>
      <div class="nav-links">
        <a href="${GITHUB_URL}" target="_blank" rel="noopener">GitHub</a>
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
        <a class="btn btn-primary" href="${WEBCAKE_URL}" target="_blank" rel="noopener">Get WebCake</a>
      </div>
    </div>
  </div>
</nav>

<main>
  <div class="hero">
    <div class="container">
      <div class="hero-badge">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
        ~101 tools &middot; Model Context Protocol
      </div>
      <h1>Build your <span>storefront</span><br>from a prompt</h1>
      <p>An MCP server that connects any AI assistant to your WebCake / StoreCake account — create pages, manage products, publish articles, and more without leaving your IDE.</p>
      <div class="hero-actions">
        <a class="btn btn-primary" href="${GITHUB_URL}" target="_blank" rel="noopener">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.604-3.369-1.342-3.369-1.342-.454-1.155-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.268 2.75 1.026A9.578 9.578 0 0112 6.836a9.59 9.59 0 012.504.337c1.909-1.294 2.747-1.026 2.747-1.026.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z"/></svg>
          GitHub
        </a>
        <a class="btn btn-outline" href="${NPM_URL}" target="_blank" rel="noopener">npm package</a>
      </div>

      <div class="badges">
        <a href="${NPM_URL}" target="_blank" rel="noopener"><img src="https://img.shields.io/npm/v/webcake-storefront-mcp?label=npm&color=108B67" alt="npm version"></a>
        <a href="${NPM_URL}" target="_blank" rel="noopener"><img src="https://img.shields.io/npm/dm/webcake-storefront-mcp?color=3FBB57" alt="npm downloads"></a>
        <a href="${GITHUB_URL}/blob/main/LICENSE" target="_blank" rel="noopener"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
      </div>

      <div class="hero-mcp">
        <label>Remote MCP URL (paste into Claude / Cursor / Windsurf)</label>
        <div class="hero-mcp-row">
          <code id="mcp-url">${mcpUrl}</code>
          <button class="copy-btn" onclick="copyText('mcp-url',this)">Copy</button>
        </div>
      </div>
    </div>
  </div>

  <div class="section" style="background:var(--bg2);padding-top:56px;padding-bottom:56px">
    <div class="container">
      <div class="section-label">Why Storefront MCP</div>
      <h2>Everything you need to run a storefront, as MCP tools</h2>
      <p class="lead">Drop it into your AI IDE and describe what you want — the assistant calls the right tools automatically.</p>
      <div class="grid">
        <div class="card">
          <div class="card-icon">🏗️</div>
          <h3>Page builder</h3>
          <p>Create, edit, and publish full storefront pages — sections, layout, custom CSS/JS, and global sections — from natural language.</p>
        </div>
        <div class="card">
          <div class="card-icon">🛍️</div>
          <h3>Product & collection management</h3>
          <p>List collections, inspect schemas, query records, and manage the catalog that powers your store.</p>
        </div>
        <div class="card">
          <div class="card-icon">📝</div>
          <h3>Articles & content</h3>
          <p>Full CRUD for blog articles — create, draft, update, publish, and delete — with full content control.</p>
        </div>
        <div class="card">
          <div class="card-icon">⚙️</div>
          <h3>CMS file & function editing</h3>
          <p>Read, write, and deploy HTTP functions and CMS files directly. Debug and run functions in place.</p>
        </div>
        <div class="card">
          <div class="card-icon">👥</div>
          <h3>Customer & order data</h3>
          <p>Look up customers by ID, phone, or email. Read order data. Send transactional emails via the automation API.</p>
        </div>
        <div class="card">
          <div class="card-icon">🔐</div>
          <h3>OAuth 2.1 + PKCE</h3>
          <p>Secure per-user authentication — listed in the Claude Connectors Directory. No token in the URL required.</p>
        </div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="container">
      <div class="section-label">Tools</div>
      <h2>~101 tools across 6 categories</h2>
      <p class="lead">Every tool is typed with Zod schemas and returns structured data the model can reason about.</p>
      <div class="tools-grid">
        <div class="tool-chip">list_pages</div>
        <div class="tool-chip">get_page</div>
        <div class="tool-chip">create_page</div>
        <div class="tool-chip">update_page</div>
        <div class="tool-chip">delete_page</div>
        <div class="tool-chip">publish_page</div>
        <div class="tool-chip">get_page_contents</div>
        <div class="tool-chip">update_page_contents</div>
        <div class="tool-chip">get_page_custom_code</div>
        <div class="tool-chip">update_page_custom_code</div>
        <div class="tool-chip">list_global_sections</div>
        <div class="tool-chip">get_global_section</div>
        <div class="tool-chip">list_cms_files</div>
        <div class="tool-chip">get_http_function</div>
        <div class="tool-chip">create_http_function</div>
        <div class="tool-chip">update_http_function</div>
        <div class="tool-chip">delete_http_function</div>
        <div class="tool-chip">debug_http_function</div>
        <div class="tool-chip">run_http_function</div>
        <div class="tool-chip">list_collections</div>
        <div class="tool-chip">get_collection_schema</div>
        <div class="tool-chip">query_collection</div>
        <div class="tool-chip">list_articles</div>
        <div class="tool-chip">get_article</div>
        <div class="tool-chip">create_article</div>
        <div class="tool-chip">update_article</div>
        <div class="tool-chip">delete_article</div>
        <div class="tool-chip">get_customer</div>
        <div class="tool-chip">send_email</div>
        <div class="tool-chip">get_site_custom_code</div>
        <div class="tool-chip">update_site_custom_code</div>
        <div class="tool-chip">+ many more…</div>
      </div>
    </div>
  </div>

  <div class="section" style="background:var(--bg2);padding-top:56px;padding-bottom:56px">
    <div class="container">
      <div class="section-label">Get started</div>
      <h2>Two ways to connect</h2>
      <p class="lead">Use the hosted remote URL for instant setup, or run locally via npx for full control.</p>

      <div class="install-block">
        <h3>Option 1 — Remote (recommended)</h3>
        <p>Paste the MCP URL into your AI assistant. OAuth login handles authentication automatically.</p>
        <div class="code-block">
          <code id="remote-url">${mcpUrl}</code>
          <button class="copy-btn" onclick="copyText('remote-url',this)">Copy</button>
        </div>
      </div>

      <div class="install-block" style="margin-top:16px">
        <h3>Option 2 — Local via npx</h3>
        <p>Run the MCP server on your own machine. Great for development or offline use.</p>
        <div class="install-tabs">
          <button class="tab-btn active" onclick="showTab('npx',this)">npx</button>
          <button class="tab-btn" onclick="showTab('login',this)">login flow</button>
          <button class="tab-btn" onclick="showTab('env',this)">env vars</button>
        </div>
        <div id="tab-npx" class="code-block">
          <code id="npx-cmd">${npxCmd} serve --port 3000</code>
          <button class="copy-btn" onclick="copyText('npx-cmd',this)">Copy</button>
        </div>
        <div id="tab-login" class="code-block" style="display:none">
          <code id="login-cmd">${npxCmd} login</code>
          <button class="copy-btn" onclick="copyText('login-cmd',this)">Copy</button>
        </div>
        <div id="tab-env" class="code-block" style="display:none">
          <code id="env-cmd">WEBCAKE_TOKEN=your_jwt WEBCAKE_SITE_ID=your_site ${npxCmd}</code>
          <button class="copy-btn" onclick="copyText('env-cmd',this)">Copy</button>
        </div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="container" style="text-align:center">
      <div class="section-label">Open source</div>
      <h2>MIT licensed, community-driven</h2>
      <p class="lead" style="margin:0 auto 32px">Contributions welcome. Open an issue or PR on GitHub.</p>
      <a class="btn btn-primary" href="${GITHUB_URL}" target="_blank" rel="noopener" style="margin:0 auto">View on GitHub</a>
    </div>
  </div>
</main>

<footer>
  <div class="container">
    <div class="footer-links">
      <a href="${GITHUB_URL}" target="_blank" rel="noopener">GitHub</a>
      <a href="${NPM_URL}" target="_blank" rel="noopener">npm</a>
      <a href="${WEBCAKE_URL}" target="_blank" rel="noopener">WebCake</a>
      <a href="/privacy">Privacy Policy</a>
      <a href="/terms">Terms of Service</a>
    </div>
    <p>WebCake Storefront MCP &copy; ${new Date().getFullYear()} &middot; MIT License</p>
  </div>
</footer>

<script>
function copyText(id, btn) {
  const el = document.getElementById(id);
  if (!el) return;
  navigator.clipboard.writeText(el.textContent || '').then(() => {
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = orig; }, 1500);
  }).catch(() => {
    const r = document.createRange();
    r.selectNodeContents(el);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(r);
  });
}
function showTab(name, btn) {
  ['npx','login','env'].forEach(t => {
    const el = document.getElementById('tab-' + t);
    if (el) el.style.display = t === name ? '' : 'none';
  });
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}
</script>
</body>
</html>`;
}
