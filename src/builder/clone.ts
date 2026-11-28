// Clone a rendered web page into native BuilderX sections.
//
// 1. captureInPage() runs INSIDE the source page (Playwright page.evaluate, or the agent's own
//    browser via the script from get_clone_script): computed styles + real boxes, reduced to a
//    small tree — section → group(row|col) / box → text | image | button | form | video | …
//    Layout is read from geometry (who sits beside whom), not from flex/grid/float CSS, so it
//    works the same for any framework.
// 2. snapshotToSource() maps that tree onto the builder's own layout helpers (buildSection,
//    rowChildren/stackChildren via buildFromSpec): a row → `layout:"row"` container with
//    column widths from the measured boxes (collapses on tablet/mobile), a column → stack.
//    Nothing becomes custom code; what can't be mapped is counted in `notes`.
import { buildSection, walk } from "./page.js";

// Browser globals for captureInPage (the project compiles without the DOM lib).
declare const window: any, document: any, location: any, CSS: any;
declare function getComputedStyle(el: any): any;

// ── 1. In-page capture (self-contained: it is serialized with Function#toString) ──────────
export async function captureInPage(opts: any = {}): Promise<any> {
  const arr = (x: any): any[] => Array.from(x);
  const MAX = opts.maxNodes || 2500;
  const W = window.innerWidth;
  let count = 0;
  const skipped: Record<string, number> = {};
  const skip = (r: string) => {
    skipped[r] = (skipped[r] || 0) + 1;
  };
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const cs = (el: any) => getComputedStyle(el);
  /** The pinned layer an element sits in (itself or a fixed ancestor). */
  const fixedOf = (el: any) => {
    for (let e = el; e && e !== document.body; e = e.parentElement) if (cs(e).position === "fixed") return e;
    return null;
  };
  // Consent bars, newsletter/promo popups: accept or close them first so they neither hide nor
  // replace content (a modal's backdrop would otherwise be captured as a band).
  if (opts.dismiss !== false) {
    const ACCEPT = /^(chấp nhận|đồng ý|tôi đồng ý|accept|allow|agree|i agree|got it|đã hiểu|tôi đã hiểu)( tất cả| all| all cookies| cookies)?$/i;
    const CLOSE = /^(close|đóng|×|✕|✖|x|no,? thanks|không,? cảm ơn|để sau|bỏ qua|later|maybe later|skip)$/i;
    for (let round = 0; round < 2; round++) {
      let hit = 0;
      for (const el of arr(document.querySelectorAll("button,a,[role=button],[aria-label]"))) {
        const layer = fixedOf(el) || el.closest("[role=dialog],[aria-modal=true],dialog");
        if (!layer || !el.isConnected || el.tagName === "A" && /^(https?:|\/[^/#]|\.)/.test(el.getAttribute("href") || "")) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4 || cs(el).visibility === "hidden") continue;
        const t = (el.innerText || "").trim();
        const label = el.getAttribute("aria-label") || el.getAttribute("title") || "";
        const lr = layer.getBoundingClientRect();
        // A pinned header bar is navigation: only an explicit accept is clicked there.
        const bar = lr.width >= window.innerWidth * 0.9 && lr.top <= 8 && lr.height < window.innerHeight * 0.5;
        if (ACCEPT.test(t) || !bar && (CLOSE.test(t) || !t && /^(close|đóng|dismiss|tắt)\b/i.test(label))) {
          el.click();
          hit++;
        }
      }
      document.dispatchEvent(new (window as any).KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      if (!hit) break;
      skip("dismissed overlay (consent / popup)");
      await sleep(400);
    }
  }
  // Lazy content: walk the page once so images/sections that load on scroll exist. Instant
  // jumps: with `scroll-behavior: smooth` a plain scrollTo is still animating when we measure.
  const jump = (y: number) => window.scrollTo({ top: y, left: 0, behavior: "instant" });
  if (opts.scroll !== false) {
    const step = Math.max(400, window.innerHeight * 0.8);
    for (let y = 0; y < document.body.scrollHeight && y < 40000; y += step) {
      jump(y);
      await sleep(120);
    }
    jump(0);
    await sleep(300);
  }
  document.querySelectorAll("details").forEach((d: any) => (d.open = true));

  const box = (el: any) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + window.scrollX), y: Math.round(r.top + window.scrollY), w: Math.round(r.width), h: Math.round(r.height) };
  };
  const visible = (el: any) => {
    const s = cs(el);
    if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  const clear = (c: string) => !c || c === "transparent" || /rgba\([^)]*,\s*0\)$/.test(c);
  const abs = (u: string) => {
    try {
      return new URL(u, location.href).href;
    } catch {
      return u;
    }
  };
  const px = (v: string) => Math.round(parseFloat(v) || 0);
  const bgUrl = (s: any) => {
    // Computed style quotes the url: read up to the closing quote, a ")" in the name (a_(1).jpg) included.
    const m = /url\((["']?)(.*?)\1\)/.exec(s.backgroundImage || "");
    return m && m[2] ? abs(m[2]) : undefined;
  };
  const textStyle = (s: any) => {
    const o: any = { fontSize: px(s.fontSize), fontWeight: s.fontWeight, color: s.color, textAlign: s.textAlign };
    if (s.lineHeight !== "normal") o.lineHeight = +(parseFloat(s.lineHeight) / parseFloat(s.fontSize)).toFixed(2);
    if (s.letterSpacing !== "normal") o.letterSpacing = s.letterSpacing;
    if (s.textTransform !== "none") o.textTransform = s.textTransform;
    if (s.fontStyle !== "normal") o.fontStyle = s.fontStyle;
    if (s.textDecorationLine && s.textDecorationLine !== "none") o.textDecoration = s.textDecorationLine; // a struck old price
    o.fontFamily = s.fontFamily.split(",")[0].replace(/["']/g, "").trim();
    return o;
  };
  const boxStyle = (s: any) => {
    const o: any = {};
    if (!clear(s.backgroundColor)) o.bg = s.backgroundColor;
    const u = bgUrl(s);
    if (u) o.bgImage = u;
    if (/gradient\(/.test(s.backgroundImage)) o.gradient = s.backgroundImage.replace(/,?\s*url\([^)]*\)/g, "");
    if (px(s.borderTopWidth) > 0 && s.borderTopStyle !== "none" && !clear(s.borderTopColor)) o.border = `${px(s.borderTopWidth)}px ${s.borderTopStyle} ${s.borderTopColor}`;
    if (px(s.borderTopLeftRadius) > 0) o.radius = px(s.borderTopLeftRadius);
    if (s.boxShadow && s.boxShadow !== "none") o.shadow = s.boxShadow;
    return o;
  };
  const painted = (b: any) => !!(b.bg || b.bgImage || b.gradient || b.border || b.shadow);
  /** Pinned widgets (chat bubble, cookie bar, back-to-top, a modal and its backdrop) — not a
   *  pinned full-width header bar. */
  const overlay = (s: any, r: any) => s.position === "fixed" && !(r.w >= W * 0.9 && r.y - window.scrollY <= 8 && r.h < window.innerHeight * 0.5);
  /** The box that clips el's children: el or the nearest ancestor hiding overflow, else the viewport. */
  const clipOf = (el: any) => {
    for (let e = el; e && e !== document.body; e = e.parentElement)
      if (cs(e).overflowX !== "visible") {
        const r = box(e);
        return { x: r.x, w: r.w };
      }
    return { x: 0, w: W };
  };
  const pads = (s: any) => ({ t: px(s.paddingTop), r: px(s.paddingRight), b: px(s.paddingBottom), l: px(s.paddingLeft) });
  const INLINE = new Set(["A", "SPAN", "STRONG", "B", "EM", "I", "U", "SMALL", "BR", "SUP", "SUB", "MARK", "CODE", "S", "DEL", "LABEL", "ABBR", "TIME", "FONT", "Q", "CITE"]);
  // Text-only subtree laid out inline. A flex/grid row of spans, or a painted inline-block
  // (a pill button inside a line), is layout, not text.
  const textLeaf = (el: any): boolean => {
    if (/flex|grid/.test(cs(el).display) && el.children.length > 1) return false;
    const links = arr(el.children).filter((c) => c.tagName === "A");
    if (links.length >= 2 && links.length === el.children.length && !arr(el.childNodes).some((n) => n.nodeType === 3 && /[^\s|·•/-]/.test(n.textContent || ""))) return false;
    for (const c of arr(el.children)) {
      const d = cs(c).display;
      if (!INLINE.has(c.tagName) || /block|flex|grid|table/.test(d) && (d !== "inline-block" || painted(boxStyle(cs(c)))) || !textLeaf(c)) return false;
    }
    return ((el as any).innerText || "").trim().length > 0;
  };
  const esc = (t: string) => t.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" } as any)[c]);
  const richText = (el: any) => {
    const walk = (n: any): string => {
      if (n.nodeType === 3) return esc(n.textContent || "");
      if (n.nodeType !== 1) return "";
      const e = n as any;
      // Inline pieces kept apart by a margin (no space in the markup) keep a space between them.
      const inner = (px(cs(e).marginLeft) >= 4 ? " " : "") + arr(e.childNodes).map(walk).join("");
      const t = e.tagName;
      if (t === "BR") return "<br>";
      if (t === "B" || t === "STRONG" || (t === "SPAN" && +cs(e).fontWeight >= 600 && +cs(el).fontWeight < 600)) return `<b>${inner}</b>`;
      if (t === "I" || t === "EM") return `<i>${inner}</i>`;
      if (t === "U") return `<u>${inner}</u>`;
      if (t === "S" || t === "DEL" || t === "STRIKE") return `<s>${inner}</s>`;
      if (t === "A" && e.getAttribute("href")) return `<a href="${abs(e.getAttribute("href")!).replace(/"/g, "&quot;")}">${inner}</a>`;
      return inner;
    };
    return arr(el.childNodes).map(walk).join("").replace(/\s+/g, " ").trim();
  };
  const headingOf = (el: any) => {
    if (/^H[1-6]$/.test(el.tagName)) return el.tagName.toLowerCase();
    const h = el.closest("h1,h2,h3,h4,h5,h6");
    return h ? h.tagName.toLowerCase() : "p";
  };
  const isButton = (el: any, s: any) => {
    // A <button value="…"> (a radio/checkbox control) has no label: its value is data, not text.
    if (/^(radio|checkbox|switch)$/.test(el.getAttribute("role") || "")) return false;
    const t = (el.innerText || (el.tagName === "INPUT" ? el.value : "") || "").trim();
    if (!t || t.length > 60 || t.includes("\n")) return false;
    if (el.tagName === "BUTTON" || el.getAttribute("role") === "button") return true;
    const b = boxStyle(s);
    return el.tagName === "A" && (!!b.bg || !!b.gradient || !!b.border) && px(s.paddingLeft) + px(s.paddingRight) >= 12;
  };

  const form = (el: any, r: any, s: any) => {
    const fields: any[] = [];
    let submit = "";
    let submitStyle: any;
    for (const f of arr(el.querySelectorAll("input,select,textarea,button")) as any[]) {
      if (!visible(f)) continue;
      const type = String(f.type || "").toLowerCase();
      if (f.tagName === "BUTTON" || type === "submit") {
        if (!submit) {
          submit = (f.innerText || f.value || "").trim();
          const fs = cs(f);
          submitStyle = { ...boxStyle(fs), ...textStyle(fs), h: box(f).h };
        }
        continue;
      }
      if (type === "hidden") continue;
      if (type === "checkbox" || type === "radio") {
        skip(`form ${type}`);
        continue;
      }
      const lab = (f.id && (document.querySelector(`label[for="${CSS.escape(f.id)}"]`) as any)?.innerText) || (f.closest("label") as any)?.innerText || f.getAttribute("aria-label") || "";
      fields.push({
        tag: f.tagName.toLowerCase(), type, name: f.name || "", label: lab.trim(), placeholder: f.placeholder || "", required: !!f.required, h: box(f).h,
        style: { ...boxStyle(cs(f)), color: cs(f).color, fontSize: px(cs(f).fontSize) },
        ...(f.tagName === "SELECT" ? { options: arr(f.options).map((o: any) => o.text).slice(0, 30) } : {}),
      });
    }
    return { k: "form", ...r, fields, submit: submit || "Submit", submitStyle, style: boxStyle(s) };
  };

  // Lay children out the way they SIT: bands of vertically overlapping boxes → rows.
  // Path of child indexes from <body>: names the same container at another viewport width.
  const keyOf = (el: any) => {
    const p: number[] = [];
    for (let e = el; e && e !== document.body && e.parentElement; e = e.parentElement) p.unshift(arr(e.parentElement.children).indexOf(e));
    return p.join("/");
  };
  const arrange = (kids: any[], r: any, key?: string): any => {
    // A placeholder painted UNDER a picture (a loading skeleton, a tint) is never seen: drop it,
    // or it would be laid over the picture below. Paint order: z (positioned) first, then DOM order.
    const zv = (k: any) => k.z ?? -1;
    const within = (k: any, b: any) => k.x >= b.x - 2 && k.y >= b.y - 2 && k.x + k.w <= b.x + b.w + 2 && k.y + k.h <= b.y + b.h + 2;
    kids = kids.filter((k, i) => !(k.k === "box" && !k.content && kids.some((b, j) => b.k === "image" && within(k, b) && (zv(b) > zv(k) || (zv(b) === zv(k) && j > i)))));
    if (kids.length === 1) return kids[0];
    // Layers: a picture (or an empty painted box) with siblings laid ON it — a banner and its
    // caption, a card image and its badge — becomes a box painted with that picture holding the
    // siblings, instead of the caption stacked under the picture.
    const area = (k: any) => k.w * k.h;
    // (A scrim as big as the picture — a gradient over a banner — lies on it too.)
    const on = (k: any, b: any) => k !== b && (area(k) < area(b) || (area(k) === area(b) && b.k === "image" && k.k !== "image")) && k.x + k.w / 2 > b.x && k.x + k.w / 2 < b.x + b.w && k.y + k.h / 2 > b.y && k.y + k.h / 2 < b.y + b.h;
    const back = kids.filter((b) => b.k === "image" || (b.k === "box" && !b.content)).sort((a, b) => area(b) - area(a) || (b.k === "image" ? 1 : 0) - (a.k === "image" ? 1 : 0)).find((b) => kids.some((k) => on(k, b)));
    if (back) {
      const top = kids.filter((k) => on(k, back));
      const x = Math.min(...top.map((k) => k.x));
      const y = Math.min(...top.map((k) => k.y));
      const x2 = Math.max(...top.map((k) => k.x + k.w));
      const y2 = Math.max(...top.map((k) => k.y + k.h));
      const layer = {
        k: "box", x: back.x, y: back.y, w: back.w, h: back.h,
        style: back.k === "image" ? { bgImage: back.src, radius: back.radius } : back.style,
        pad: { t: Math.max(0, y - back.y), r: Math.max(0, back.x + back.w - x2), b: Math.max(0, back.y + back.h - y2), l: Math.max(0, x - back.x) },
        content: top.length === 1 ? top[0] : arrange(top, { x, y, w: x2 - x, h: y2 - y }),
      };
      const rest = kids.filter((k) => k !== back && !top.includes(k));
      return rest.length ? arrange([layer, ...rest], r, key) : layer;
    }
    const sorted = [...kids].sort((a, b) => a.y - b.y || a.x - b.x);
    const bands: any[][] = [];
    for (const k of sorted) {
      const band = bands[bands.length - 1];
      const bottom = band ? Math.max(...band.map((b) => b.y + b.h)) : -1;
      if (band && k.y < bottom - 4 && !band.some((b) => k.x < b.x + b.w - 4 && b.x < k.x + k.w - 4)) band.push(k);
      else bands.push([k]);
    }
    const rows = bands.map((b) => {
      if (b.length === 1) return b[0];
      b.sort((p, q) => p.x - q.x);
      const gaps = b.slice(1).map((k, i) => k.x - (b[i].x + b[i].w));
      const x = Math.min(...b.map((k) => k.x));
      const y = Math.min(...b.map((k) => k.y));
      return { k: "group", dir: "row", key, gap: Math.max(0, Math.round(gaps.reduce((n, g) => n + g, 0) / gaps.length)), x, y, w: Math.max(...b.map((k) => k.x + k.w)) - x, h: Math.max(...b.map((k) => k.y + k.h)) - y, kids: b };
    });
    if (rows.length === 1) return rows[0].k === "group" ? { ...rows[0], ...r } : rows[0];
    const vg = rows.slice(1).map((k, i) => k.y - (rows[i].y + rows[i].h));
    return { k: "group", dir: "col", gap: Math.max(0, Math.round(vg.reduce((n, g) => n + g, 0) / vg.length)), ...r, kids: rows };
  };

  /** Characters of text a captured node holds (left-out slides are not counted against coverage). */
  const textOf = (n: any): number => (n ? String(n.text || "").replace(/\s+/g, "").length + [n.content, n.body, ...(n.kids || [])].reduce((a, k) => a + textOf(k), 0) : 0);
  let offText = 0;
  const shift = (n: any, dx: number) => {
    if (!n) return;
    n.x += dx;
    for (const k of [n.content, n.body, ...(n.kids || [])]) shift(k, dx);
  };
  /** Stacking among siblings: positioned boxes paint over static ones, higher z-index on top. */
  const node = (el: any): any => {
    const n = nodeOf(el);
    if (n) {
      const s = cs(el);
      n.z = s.position === "static" ? undefined : parseInt(s.zIndex) || 0;
    }
    return n;
  };
  const nodeOf = (el: any): any => {
    if (++count > MAX) {
      skip("node limit");
      return null;
    }
    const t = el.tagName.toUpperCase();
    if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|LINK|META|HEAD)$/.test(t)) return null;
    if (!visible(el)) {
      // A 0×0 wrapper that doesn't clip (an inline <a> around absolutely placed content) still
      // shows its children; sr-only boxes clip, hidden ones are hidden.
      const s0 = cs(el);
      if (s0.display === "none" || s0.visibility === "hidden" || Number(s0.opacity) === 0 || s0.overflow !== "visible" || s0.clip !== "auto") return null;
      const kids = arr(el.children).map(node).filter(Boolean);
      if (kids.length < 2) return kids[0] || null;
      const x = Math.min(...kids.map((k) => k.x));
      const y = Math.min(...kids.map((k) => k.y));
      return arrange(kids, { x, y, w: Math.max(...kids.map((k) => k.x + k.w)) - x, h: Math.max(...kids.map((k) => k.y + k.h)) - y }, keyOf(el));
    }
    const s = cs(el);
    const r = box(el);
    if (overlay(s, r)) {
      skip("fixed overlay (chat widget, cookie bar, sticky button)");
      return null;
    }
    const he = el as any;
    // Carousel arrows: the slides are laid out as a grid (or the shown slide alone), nothing to page.
    if (r.w <= 64 && r.h <= 64 && (/^(go to )?(prev(ious)?|next|trước|sau|tiếp)( slide| item)?$/i.test((el.getAttribute("aria-label") || he.innerText || "").trim()) || /\b(prev|next)\b/i.test(String(el.className?.baseVal ?? el.className ?? "")))) {
      skip("carousel arrow");
      return null;
    }
    if (t === "IMG" || t === "PICTURE") {
      const img: any = t === "IMG" ? el : el.querySelector("img");
      // Lazy loaders park the real URL in data-* / srcset behind a placeholder (data: gif/svg).
      const set = (v: any) => String(v || "").split(",").map((p) => p.trim().split(/\s+/)[0]).filter(Boolean).pop();
      const cands = img ? [img.currentSrc, img.getAttribute("src"), img.dataset.src, img.dataset.lazySrc, img.dataset.original, set(img.getAttribute("srcset") || img.dataset.srcset), set(el.querySelector?.("source")?.getAttribute("srcset"))] : [];
      const src = cands.find((u) => u && !/^data:/.test(u)) || cands.find(Boolean);
      if (!src) return (skip("image without src"), null);
      return { k: "image", ...r, src: abs(src), alt: img.alt || "", radius: px(s.borderTopLeftRadius) || undefined, fit: s.objectFit };
    }
    if (t === "SVG") {
      const html = el.outerHTML;
      if (html.length > 12000) return (skip("large svg"), null);
      return { k: "icon", ...r, svg: html, color: s.color };
    }
    if (t === "VIDEO") {
      const v: any = el;
      const src = v.currentSrc || (el.querySelector("source") as any)?.src;
      return src ? { k: "video", ...r, src: abs(src), poster: v.poster || undefined } : (skip("video without src"), null);
    }
    if (t === "IFRAME") {
      const src = (el as any).src || "";
      const yt = /youtube(?:-nocookie)?\.com\/embed\/([\w-]{6,})|youtu\.be\/([\w-]{6,})/.exec(src);
      if (yt) return { k: "video", ...r, provider: "youtube", id: yt[1] || yt[2] };
      if (/google\.[^/]+\/maps|maps\.google\./.test(src)) return { k: "map", ...r, src };
      skip("iframe (third-party widget)");
      return null;
    }
    if (t === "HR") return { k: "line", ...r, color: s.borderTopColor };
    if (t === "DETAILS") {
      const sum = el.querySelector(":scope > summary");
      const kids = arr(el.children).filter((c) => c !== sum).map(node).filter(Boolean);
      return {
        k: "accordion", ...r, title: sum ? (sum.innerText || "").trim() : "", titleStyle: sum ? textStyle(cs(sum)) : undefined,
        style: boxStyle(s), body: kids.length === 1 ? kids[0] : kids.length ? arrange(kids, r) : null,
      };
    }
    if (t === "FORM") return form(el, r, s);
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(t)) {
      if (/^(submit|button)$/.test((el as any).type)) return { k: "button", ...r, text: (el as any).value, style: { ...boxStyle(s), ...textStyle(s) } };
      const f: any = el;
      // A site search box (header) → the storefront's own search input.
      if (f.type === "search" || /search|tìm/i.test(`${f.name} ${f.placeholder} ${f.getAttribute("aria-label") || ""}`))
        return { k: "search", ...r, placeholder: f.placeholder || "", style: { ...boxStyle(s), color: s.color, fontSize: px(s.fontSize), padL: px(s.paddingLeft) } };
      skip("field outside a form");
      return null;
    }
    if ((t === "A" || t === "BUTTON" || el.getAttribute("role") === "button") && isButton(he, s)) {
      const href = el.getAttribute("href");
      return { k: "button", ...r, text: he.innerText.trim(), href: href ? abs(href) : undefined, style: { ...boxStyle(s), ...textStyle(s), padX: px(s.paddingLeft) } };
    }
    const b = boxStyle(s);
    if (textLeaf(el)) {
      const href = t === "A" ? el.getAttribute("href") : null;
      // A whole-text link (menu item, footer link) → plain text + a click event, so it keeps
      // its own colour (rich-text <a> is forced blue/underlined by the storefront's .ql-editor a).
      const n = { k: "text", ...r, tag: headingOf(el), html: richText(el), text: he.innerText.trim(), href: href ? abs(href) : undefined, style: textStyle(s) };
      // The words, not the box: padding around a link is spacing between links (a row of them
      // would otherwise be glued together), and text spilling out of a short box is still shown.
      const rg = document.createRange();
      rg.selectNodeContents(el);
      const tr = rg.getBoundingClientRect();
      if (tr.width > 0) {
        const tx = Math.round(tr.left + window.scrollX);
        if (!painted(b) && tr.width < r.w - 4 && tx >= r.x - 1) Object.assign(n, { x: tx, w: Math.round(tr.width) });
        const bottom = Math.round(tr.bottom + window.scrollY);
        if (s.overflow === "visible" && bottom > r.y + r.h + 2) n.h = bottom - r.y;
      }
      return painted(b) ? { k: "box", ...r, style: b, pad: pads(s), content: n } : n;
    }
    let kids: any[] = [];
    for (const c of arr(el.children)) {
      const n = node(c);
      if (n) kids.push(n);
    }
    // A slider: some children sit wholly outside the box that clips them. One slide per view →
    // keep the slide on screen; several per view → keep them all, `slider` per row as shown.
    let slider = 0;
    const clip = clipOf(el);
    if (kids.some((k) => k.x >= clip.x + clip.w - 2 || k.x + k.w <= clip.x + 2)) {
      const on = kids.filter((k) => k.x + k.w / 2 > clip.x && k.x + k.w / 2 < clip.x + clip.w);
      if (on.length === 1 && on[0].w >= clip.w * 0.8) {
        for (const k of kids) if (k !== on[0]) (offText += textOf(k), skip("off-screen slide of a one-per-view carousel / marquee (the shown one is kept)"));
        kids = on;
      } else if (on.length) {
        slider = on.length;
        // A looping slider parks slides before the view: they go after the last one, so the grid
        // starts with the cards the visitor saw first.
        const before = kids.filter((k) => k.x + k.w / 2 <= clip.x);
        const ks = [...kids].sort((a, b) => a.x - b.x);
        const gap = ks.length > 1 ? Math.max(0, ks[1].x - ks[0].x - ks[0].w) : 0;
        const dx = Math.max(...kids.map((k) => k.x + k.w)) + gap - Math.min(...kids.map((k) => k.x));
        for (const k of before) shift(k, dx);
      }
    }
    const loose = arr(el.childNodes).filter((n) => n.nodeType === 3 && (n.textContent || "").trim()).map((n) => (n.textContent || "").trim()).join(" ");
    if (loose) kids.unshift({ k: "text", ...r, h: Math.max(16, px(s.lineHeight) || px(s.fontSize) * 1.4), tag: "p", html: esc(loose), text: loose, style: textStyle(s) });
    if (!kids.length) return painted(b) && r.h > 3 ? { k: "box", ...r, style: b, pad: pads(s) } : null;
    const content = kids.length === 1 ? kids[0] : arrange(kids, r, keyOf(el));
    if (slider && content.k === "group" && content.dir === "row") Object.assign(content, { slider, clipW: clip.w });
    return painted(b) ? { k: "box", ...r, style: b, pad: pads(s), content } : content;
  };

  // Sections: split the page into its vertical bands. A tall block whose children sit one
  // under the other (app root, <main>, a page wrapper) is replaced by those children; a
  // painted wrapper hands its background down to the bands that have none.
  const inherited = new Map<any, any>();
  const stacked = (kids: any[]) => {
    const rs = kids.map((k) => k.getBoundingClientRect()).sort((a: any, b: any) => a.top - b.top);
    return rs.every((r: any, i: number) => i === 0 || r.top >= rs[i - 1].bottom - 4);
  };
  // A zero-height wrapper (often around a fixed header) is see-through: take its children.
  const expand = (k: any, d = 0): any[] => {
    const h = k.getBoundingClientRect().height;
    if (h >= 8) return visible(k) ? [k] : [];
    return d < 4 && cs(k).display !== "none" ? arr(k.children).flatMap((c) => expand(c, d + 1)) : [];
  };
  let blocks = arr(document.body.children).flatMap((k) => expand(k));
  for (let i = 0; i < 12; i++) {
    let changed = false;
    const next: any[] = [];
    for (const b of blocks) {
      const rb = b.getBoundingClientRect();
      // Rails: empty decorative strips (gutter lines, borders) — not content, not layout.
      const rail = (k: any) => !(k.innerText || "").trim() && !k.querySelector("img,svg,video,iframe,picture") && k.getBoundingClientRect().width < rb.width * 0.1;
      const kids = arr(b.children).flatMap((k) => expand(k)).filter((k) => !rail(k));
      const bs = boxStyle(cs(b));
      const leaf = /^(IMG|PICTURE|SVG|VIDEO|IFRAME|FORM|HR)$/i.test(b.tagName) || textLeaf(b);
      // Fixed bars (a pinned header) overlap the flow: they are their own band, not layout.
      const flow = kids.filter((k) => cs(k).position !== "fixed");
      const wrapper = !leaf && (kids.length === 1 ? !painted(bs) || rb.height > window.innerHeight * 1.5 : kids.length > 1 && rb.height > window.innerHeight * 1.2 && stacked(flow));
      if (wrapper) {
        const bg = painted(bs) ? bs : inherited.get(b);
        for (const k of kids) if (bg && !inherited.has(k)) inherited.set(k, bg);
        next.push(...kids);
        changed = true;
      } else next.push(b);
    }
    blocks = next;
    if (!changed) break;
  }
  const sections: any[] = [];
  for (const b of blocks) {
    const s = cs(b);
    const r = box(b);
    if (r.h < 8) continue;
    // A band can be the child of a zero-height pinned wrapper: judge the layer it sits in.
    const pin = fixedOf(b);
    if (pin && overlay(cs(pin), box(pin))) {
      skip("fixed overlay (chat widget, cookie bar, sticky button)");
      continue;
    }
    const kids: any[] = [];
    const self = /^(IMG|PICTURE|SVG|VIDEO|IFRAME|FORM|HR)$/i.test(b.tagName) || textLeaf(b);
    if (self) kids.push(node(b));
    else for (const c of arr(b.children)) {
      const n = node(c);
      if (n) kids.push(n);
    }
    // The site header is a short band at the top: a <header> inside a product block lower down
    // (title/price/variants) is content.
    const atTop = r.y < 300 && r.h < 400;
    const role = atTop && (b.tagName === "HEADER" || b.querySelector(":scope > nav, header") || (s.position === "fixed" && r.y <= 8)) ? "header" : b.tagName === "FOOTER" ? "footer" : b.tagName === "NAV" ? "nav" : undefined;
    const content = kids.filter(Boolean);
    if (!content.length && !painted(boxStyle(s))) continue;
    const own = self ? {} : boxStyle(s);
    const style = own.bg || own.bgImage || own.gradient ? own : { ...(inherited.get(b) || {}), ...own };
    sections.push({ k: "section", ...r, key: keyOf(b), role, style, pad: pads(s), sticky: s.position === "sticky" || s.position === "fixed" || undefined, content: content.length === 1 ? content[0] : content.length ? arrange(content, r, keyOf(b)) : null });
  }
  // Thin bands with the same background as their neighbour (a section title above its grid)
  // belong to one section.
  const merged: any[] = [];
  for (const s of sections) {
    const prev = merged[merged.length - 1];
    if (prev && !prev.role && !s.role && JSON.stringify(prev.style) === JSON.stringify(s.style) && (s.h < 240 || prev.h < 240) && s.content && prev.content) {
      const kids = [...(prev.content.k === "group" && prev.content.dir === "col" ? prev.content.kids : [prev.content]), s.content];
      const y = prev.y;
      const h = s.y + s.h - prev.y;
      Object.assign(prev, { h, w: Math.max(prev.w, s.w), content: { k: "group", dir: "col", gap: Math.max(0, s.y - (prev.y + prev.h)) || 16, x: Math.min(prev.x, s.x), y, w: Math.max(prev.w, s.w), h, kids } });
    } else merged.push(s);
  }
  sections.length = 0;
  sections.push(...merged);
  // The text a visitor sees: innerText still holds visually-hidden subtrees (sr-only: 1px,
  // clipped), which no clone should show — leave them out of the coverage base. (Transparent
  // ones stay in: a reveal-on-scroll block that faded out again is content the capture lost.)
  const len = (e: any) => (e.innerText || "").replace(/\s+/g, "").length;
  const hidden = arr(document.body.querySelectorAll("*")).filter((e) => {
    if (!e.getClientRects().length) return false; // not rendered: innerText already skips it
    const r = e.getBoundingClientRect();
    const s = cs(e);
    return (r.width <= 1 || r.height <= 1) && (s.overflow !== "visible" || s.clip !== "auto");
  });
  const textTotal = len(document.body) - hidden.filter((e) => !hidden.some((h) => h !== e && h.contains(e))).reduce((n, e) => n + len(e), 0);
  // The page colour: body/html, else the colour most of the page's height is painted with
  // (an app root wrapper), so translucent bars and unpainted bands sit on the right colour.
  const weight: Record<string, number> = {};
  for (const s of sections) if (s.style?.bg && !/rgba\([^)]*,\s*0?\.\d+\)$/.test(s.style.bg)) weight[s.style.bg] = (weight[s.style.bg] || 0) + s.h;
  const dominant = Object.entries(weight).sort((a, b) => b[1] - a[1])[0];
  const pageBg = [document.body, document.documentElement].map((e) => cs(e).backgroundColor).find((c) => !clear(c))
    || (dominant && dominant[1] > sections.reduce((n, s) => n + s.h, 0) * 0.5 ? dominant[0] : "rgb(255, 255, 255)");
  return { url: location.href, title: document.title, viewport: { w: W, h: window.innerHeight }, pageBg, sections, skipped, textTotal, offscreenText: offText };
}

/** The capture as a script an agent can run in any browser tool (evaluate_script / javascript). */
export const CLONE_SCRIPT = `(${captureInPage.toString()})({})`;

/** In-page, at another viewport width: how many columns the first band of each keyed container
 *  shows now (its children side by side at the top). Self-contained, like captureInPage. */
export function probeColumns(keys: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of keys) {
    let el: any = document.body;
    for (const i of key.split("/").filter(Boolean)) el = el && el.children[+i];
    if (!el) continue;
    // Only what shows: a slider's off-screen slides are not columns.
    let clip = { left: 0, right: window.innerWidth };
    for (let e = el; e && e !== document.body; e = e.parentElement)
      if (getComputedStyle(e).overflowX !== "visible") {
        clip = e.getBoundingClientRect();
        break;
      }
    const rs = Array.from(el.children as any[]).map((c: any) => c.getBoundingClientRect()).filter((r: any) => r.width > 1 && r.height > 1 && r.left + r.width / 2 > clip.left && r.left + r.width / 2 < clip.right);
    if (!rs.length) continue;
    // The first band = boxes that overlap the topmost one vertically (centred items included).
    const first = rs.reduce((a: any, b: any) => (b.top < a.top ? b : a));
    out[key] = rs.filter((r: any) => r.top < first.bottom - 4).length;
  }
  return out;
}

/** In-page: for each keyed slider track, the width of one card as % of the window that clips it,
 *  and the gap between cards — how many cards a visitor sees at this width. Self-contained. */
export function probeSlides(keys: string[]): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  for (const key of keys) {
    let el: any = document.body;
    for (const i of key.split("/").filter(Boolean)) el = el && el.children[+i];
    if (!el) continue;
    let clip: any = { width: window.innerWidth };
    for (let e = el; e && e !== document.body; e = e.parentElement)
      if (getComputedStyle(e).overflowX !== "visible") {
        clip = e.getBoundingClientRect();
        break;
      }
    const rs = Array.from(el.children as any[]).map((c: any) => c.getBoundingClientRect()).filter((r: any) => r.width > 1 && r.height > 1).sort((a: any, b: any) => a.left - b.left);
    if (rs.length < 2 || !clip.width) continue;
    const w = rs.map((r: any) => r.width).sort((a: number, b: number) => a - b)[rs.length >> 1];
    out[key] = [+((w / clip.width) * 100).toFixed(2), Math.max(0, Math.round(rs[1].left - rs[0].right))];
  }
  return out;
}

/** In-page: how far each keyed section's content sits from its left/right edge at this width (a
 *  centred max-width container, side padding) — measured on what shows: pictures and text. */
export function probeInsets(keys: string[]): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  const W = window.innerWidth;
  for (const key of keys) {
    let el: any = document.body;
    for (const i of key.split("/").filter(Boolean)) el = el && el.children[+i];
    if (!el) continue;
    const box = el.getBoundingClientRect();
    let l = Infinity;
    let r = -Infinity;
    for (const e of Array.from(el.querySelectorAll("*")) as any[]) {
      const leaf = /^(IMG|SVG|VIDEO|PICTURE|INPUT|BUTTON)$/i.test(e.tagName) || Array.from(e.childNodes as any[]).some((n: any) => n.nodeType === 3 && n.textContent.trim());
      if (!leaf) continue;
      const b = e.getBoundingClientRect();
      if (b.width < 2 || b.height < 2 || b.left < -1 || b.right > W + 1) continue;
      l = Math.min(l, b.left);
      r = Math.max(r, b.right);
    }
    if (l < r) out[key] = [Math.round(l - box.left), Math.round(box.right - r)];
  }
  return out;
}

/** borderRadius the way real pages store it: four corners (value-formats: 99% "Npx Npx Npx Npx"). */
const corners = (r: number) => `${r}px ${r}px ${r}px ${r}px`;
const PROBE_WIDTHS: Record<string, number> = { bp2: 1100, bp3: 768, bp4: 390 };

/** Capture with a Playwright page: the 1440 snapshot plus, per breakpoint, the column count each
 *  row really shows there (snap.columns) — the source's own responsive layout, not a guess. */
export async function capturePage(page: any, width = 1440): Promise<any> {
  await page.setViewportSize({ width, height: 900 });
  const snap = await page.evaluate(captureInPage, {});
  const keys = new Set<string>();
  const sliders = new Set<string>();
  const walkKeys = (n: any) => {
    if (!n || typeof n !== "object") return;
    if (n.k === "group" && n.key) keys.add(n.key);
    if (n.slider && n.key) sliders.add(n.key);
    for (const k of n.kids || []) walkKeys(k);
    walkKeys(n.content);
  };
  for (const s of snap.sections || []) walkKeys(s);
  const bands = (snap.sections || []).map((s: any) => s.key).filter(Boolean);
  snap.columns = {};
  snap.slides = {};
  snap.insets = {};
  for (const [bp, w] of Object.entries(PROBE_WIDTHS)) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(250);
    snap.columns[bp] = await page.evaluate(probeColumns, [...keys]);
    if (sliders.size) snap.slides[bp] = await page.evaluate(probeSlides, [...sliders]);
    snap.insets[bp] = await page.evaluate(probeInsets, bands);
  }
  await page.setViewportSize({ width, height: 900 });
  return snap;
}

// ── 2. Snapshot → native page source ─────────────────────────────────────────────────────
interface Ctx {
  pageBg?: string;
  /** bp → container key → columns the source shows at that width. */
  columns?: Record<string, Record<string, number>>;
  /** bp → slider key → [card width % of its window, gap px] at that width. */
  slides?: Record<string, Record<string, [number, number]>>;
  notes: Record<string, number>;
  text: number;
  fonts: Record<string, number>;
  images: string[];
  W: number;
}
const note = (c: Ctx, k: string) => (c.notes[k] = (c.notes[k] || 0) + 1);

/** rgba(…, a<1) can't be shown over the storefront's white page: lay it over `base` instead. */
const over = (color: string, base?: string) => (base && /rgba\([^)]*,\s*0?\.\d+\)$/.test(color) ? `linear-gradient(${color}, ${color}), ${base}` : color);

/** A url as an unquoted CSS url(): brackets, quotes and spaces escaped (a_(1).jpg would end the url). */
export const cssUrl = (u: string) => u.replace(/[()'"\s]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`);

/** Every image a source points at: element src (specials / config, any layer) and url(…) in any
 *  style string. rehost rewrites the same places, so whatever validatePage's IMAGE_HOST can see. */
const URL_RE = /url\(\s*(["']?)(.*?)\1\s*\)/g;
function eachImage(source: any, fn: (url: string, node: any) => string | void) {
  let node: any;
  const visit = (o: any, key?: string): any => {
    if (typeof o === "string") {
      if (key === "src" && /^(https?:|data:image\/|\/\/)/.test(o)) return fn(o, node) ?? o;
      if (key === "text" || !o.includes("url(")) return o;
      let cut = false;
      const v = o.replace(URL_RE, (m, q, u) => {
        if (!u) return m;
        const to = fn(u, node);
        if (to === "") return (cut = true), "";
        return `url(${q}${to ?? u}${q})`;
      });
      // A removed layer leaves no stray comma behind ("…, url(x) #fff" → "…, #fff").
      return cut ? v.replace(/(^|,)\s*(?=,|$)/g, "$1").replace(/^\s*,\s*|\s*,\s*$/g, "").trim() || "transparent" : v;
    }
    if (!o || typeof o !== "object") return o;
    for (const k of Object.keys(o)) if (k !== "children") o[k] = visit(o[k], k);
    return o;
  };
  walk(source, (n: any) => {
    node = n;
    for (const k of Object.keys(n)) if (k !== "children" && k !== "id" && k !== "type") n[k] = visit(n[k], k);
    return n;
  });
}
export function imageRefs(source: any): string[] {
  const out = new Set<string>();
  eachImage(source, (u) => void out.add(u));
  return [...out];
}
/** Point every reference to a key of `map` at its value (in place); "" takes a url(…) layer out.
 *  `seen` hears which element held each url. */
export function rewriteImages(source: any, map: Map<string, string>, seen?: (url: string, node: any) => void) {
  eachImage(source, (u, n) => {
    if (map.has(u)) seen?.(u, n);
    return map.get(u);
  });
}

const bgStyle = (st: any = {}, base?: string) => {
  const o: any = {};
  if (st.bgImage) {
    // The colour stays under the image: if the image can't load the text keeps its contrast.
    o.background = `${st.gradient ? `${st.gradient}, ` : ""}url(${cssUrl(st.bgImage)})${st.bg ? ` ${st.bg}` : ""}`;
    o["background-size"] = "cover";
    o["background-position-x"] = "center";
    o["background-position-y"] = "center";
    o["background-repeat"] = "no-repeat";
  } else if (st.gradient) o.background = base ? `${st.gradient}, ${base}` : st.gradient;
  else if (st.bg) o.background = over(st.bg, base);
  // Split keys: element CSS reads borderWidth/borderStyle/borderColor (real pages use them).
  const b = st.border && /^(\d+)px (\w+) (.+)$/.exec(st.border);
  if (b) Object.assign(o, { borderWidth: `${b[1]}px`, borderStyle: b[2], borderColor: b[3] });
  if (st.radius) o.borderRadius = corners(st.radius);
  if (st.shadow) o.boxShadow = st.shadow;
  return o;
};

const fontStyle = (c: Ctx, st: any = {}) => {
  const o: any = {};
  if (st.fontSize) o.fontSize = `${st.fontSize}px`;
  if (st.fontWeight && st.fontWeight !== "400") o.fontWeight = String(st.fontWeight);
  if (st.color) o.color = st.color;
  if (st.lineHeight) o.lineHeight = String(st.lineHeight);
  if (st.textAlign && st.textAlign !== "start") o.textAlign = st.textAlign === "end" ? "right" : st.textAlign;
  if (st.letterSpacing) o.letterSpacing = st.letterSpacing;
  if (st.textTransform) o.textTransform = st.textTransform;
  if (st.fontStyle) o.fontStyle = st.fontStyle;
  if (st.textDecoration) o.textDecoration = st.textDecoration;
  if (st.fontFamily) c.fonts[st.fontFamily] = (c.fonts[st.fontFamily] || 0) + 1;
  return o;
};

const painted = (st: any = {}) => !!(st.bg || st.bgImage || st.gradient || st.border || st.shadow);

const link = (href?: string) => {
  if (!href || /^javascript:/i.test(href)) return undefined;
  if (/^tel:/i.test(href)) return [{ action: "phone_call", trigger: "click", phone_call_number: href.slice(4) }];
  return [{ action: "open_link", trigger: "click", link_target: href, link_target_url: "_self" }];
};

const FIELD: Record<string, string> = { email: "email", tel: "phone-number", textarea: "text-area", select: "select", date: "input-date", number: "input-number" };

/** The area a node sits in (its column / its parent's content box). */
type Area = { x: number; w: number };
const inner = (n: any): Area => ({ x: n.x + (n.pad?.l || 0), w: Math.max(1, n.w - (n.pad?.l || 0) - (n.pad?.r || 0)) });
/** Where a box sits inside its area: fill | center | right | left. */
function alignIn(n: any, p?: Area): string | undefined {
  if (!p || !n.w) return undefined;
  if (n.w >= p.w * 0.92) return "fill";
  const off = n.x + n.w / 2 - (p.x + p.w / 2);
  if (Math.abs(off) <= p.w * 0.06) return "center";
  if (n.x + n.w >= p.x + p.w * 0.94 && n.x - p.x > p.w * 0.2) return "right";
  return "left";
}
/** A narrower-than-its-area block keeps its share of the width. */
const share = (n: any, p?: Area) => (p && n.w && n.w < p.w * 0.92 ? { widthUnit: "%", relWidth: Math.max(5, Math.round((n.w / p.w) * 100)) } : undefined);

/** Small pictures (avatars, logos, icons) keep their pixel width when the row collapses;
 *  larger ones keep their share of the column. */
const small = (n: any, area?: Area) => !!n.w && ((n.w <= 48 && n.h <= 48) || (n.w <= 240 && (!area || n.w < area.w * 0.6 || n.w >= area.w * 0.92)));
const fixedOrShare = (n: any, area?: Area) => (small(n, area) ? { widthUnit: "px" } : share(n, area));
/** A fixed-width picture can't "fill": centre it when it filled its own column. */
const placeOf = (n: any, area?: Area) => {
  const a = alignIn(n, area);
  return small(n, area) && a === "fill" ? "center" : a;
};

/** One-line labels stay on one line on desktop/laptop; on tablet/phone they may wrap (as the
 *  source's own responsive CSS usually lets them) rather than push the page wider than the screen. */
const WRAP_SMALL = { bp3: { style: { whiteSpace: "normal" } }, bp4: { style: { whiteSpace: "normal" } } };

function spec(n: any, c: Ctx, area?: Area): any {
  if (!n) return null;
  switch (n.k) {
    case "text":
      c.text += String(n.text || "").replace(/\s+/g, "").length;
      const style = { ...fontStyle(c, n.style), height: n.h };
      const at = area && n.w < area.w * 0.7 ? alignIn(n, area) : undefined;
      // A short label on one line in the source stays on one line (fonts differ in width).
      const oneLine = n.style?.fontSize && n.h <= n.style.fontSize * (n.style.lineHeight || 1.4) * 1.3;
      const keepLine = oneLine && String(n.text || "").length <= 40;
      if (keepLine) style.whiteSpace = "nowrap";
      if ((at === "right" || at === "center") && (!style.textAlign || style.textAlign === "left")) style.textAlign = at;
      if (/<a href/.test(n.html || "")) note(c, "links inside a sentence keep the storefront's link style (blue, underlined)");
      const events = link(n.href);
      if (events) style.cursor = "pointer";
      return { type: "text", opts: { text: n.html || n.text, specials: { tag: n.tag || "p" }, style, ...(events ? { events } : {}), ...(keepLine ? { responsive: WRAP_SMALL } : {}) } };
    case "image":
      return { type: "image", opts: { src: n.src, width: n.w, height: n.h, align: placeOf(n, area), config: fixedOrShare(n, area), specials: n.alt ? { image_alt: n.alt } : undefined, style: { ...(n.radius ? { borderRadius: corners(n.radius) } : {}), ...(n.fit && n.fit !== "fill" ? { objectFit: n.fit } : {}) } } };
    case "icon": {
      note(c, "svg icon → image (data URI; rehost_images uploads it as PNG)");
      const svg = /xmlns=/.test(n.svg) ? n.svg : n.svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
      const src = `data:image/svg+xml;base64,${Buffer.from(svg.replace(/currentColor/g, n.color || "#000")).toString("base64")}`;
      return { type: "image", opts: { src, width: n.w, height: n.h, align: placeOf(n, area) ?? "left", config: fixedOrShare(n, area) } };
    }
    case "button": {
      c.text += String(n.text || "").replace(/\s+/g, "").length;
      const st = n.style || {};
      const events = link(n.href);
      if (n.href && /#/.test(n.href) && n.href.split("#")[0] === "") note(c, "anchor link kept as a URL — retarget it with scroll_to");
      return {
        type: "button",
        opts: {
          text: n.text,
          ...(String(n.text || "").length <= 40 ? { responsive: WRAP_SMALL } : {}),
          style: { ...bgStyle(st, c.pageBg), ...fontStyle(c, st), height: n.h, ...(String(n.text || "").length <= 40 ? { whiteSpace: "nowrap" } : {}), ...(st.padX ? { paddingLeft: `${st.padX}px`, paddingRight: `${st.padX}px` } : {}) },
          ...(events ? { events } : {}),
          align: alignIn(n, area) ?? "left",
        },
      };
    }
    case "line":
      return { type: "line", opts: { style: { borderColor: n.color } } };
    case "search": {
      // The page's own magnifier is captured beside it: no second icon. The box (border, radius,
      // fill) is the input-search's input* config — the same on hover/focus as at rest.
      const st = n.style || {};
      const bd = st.border && /^(\d+)px \w+ (.+)$/.exec(st.border);
      const frame = {
        ...(bd ? { inputBorderWidth: +bd[1], inputBorderColor: bd[2], inputBorderColorHover: bd[2], inputBorderColorFocus: bd[2], inputBorderType: "all", inputBorderTypeHover: "all", inputBorderTypeFocus: "all" } : {}),
        ...(st.radius ? { inputBorderRadius: st.radius } : {}),
        ...(st.bg ? { inputBackground: st.bg, inputBackgroundHover: st.bg, inputBackgroundFocus: st.bg } : {}),
        ...(st.padL ? { inputPadding: st.padL } : {}),
      };
      return { type: "input-search", opts: { specials: { placeholder: n.placeholder, showIcon: false }, style: { height: n.h, ...(st.fontSize ? { fontSize: `${st.fontSize}px` } : {}), ...(st.color ? { color: st.color } : {}) }, align: alignIn(n, area), config: { ...(share(n, area) || {}), ...frame } } };
    }
    case "accordion": {
      // <details> = the storefront's collapse: <details> + summary from specials.name, body in a
      // collapse-content grid (builderx_api build_collapse; the editor's collapse picker).
      c.text += String(n.title || "").replace(/\s+/g, "").length;
      const body = n.body ? spec(n.body, c, area) : null;
      return {
        type: "collapse",
        opts: { specials: { name: n.title }, style: { ...fontStyle(c, n.titleStyle), ...bgStyle(n.style) } },
        children: [{ type: "collapse-content", autoRows: true, opts: { config: { heightUnit: "auto" } }, children: body ? [body] : [] }],
      };
    }
    case "video":
      const place = { align: alignIn(n, area), config: share(n, area), style: { height: n.h } };
      if (n.provider === "youtube") return { type: "video", opts: { ...place, specials: { type: "youtube", id: n.id, src: `https://www.youtube.com/watch?v=${n.id}` } } };
      return { type: "video", opts: { ...place, src: n.src, thumbnail: n.poster } };
    case "map":
      note(c, "google map: embed iframe kept — set the address in the googlemap element if it differs");
      return { type: "googlemap", opts: { iframe: `<iframe src="${n.src}" width="100%" height="${n.h}" style="border:0" loading="lazy"></iframe>`, width: n.w, height: n.h } };
    case "form": {
      note(c, "form rebuilt natively as a subscribe (lead) form — check its type and field names before going live");
      const children = (n.fields || []).map((f: any) => {
        const type = FIELD[f.tag === "input" ? f.type : f.tag] || "input";
        const label = f.label || f.placeholder || f.name;
        const fs = f.style || {};
        return { type, opts: { specials: { field_name: f.name || label, label, placeholder: f.placeholder || label, required: !!f.required, show_label: !!f.label }, style: { height: f.h } } };
      });
      const sst = n.submitStyle || {};
      children.push({ type: "submit-button", opts: { specials: { text: n.submit }, style: { ...bgStyle(sst), ...fontStyle(c, sst), ...(sst.h ? { height: sst.h } : {}) } } });
      c.text += String(n.submit || "").length;
      // A lead/contact/newsletter form = "subscribe" (customer_data is a logged-in profile form,
      // hidden for visitors; form_order is a checkout).
      // The renderer styles every field from the FORM's style (+ config.backgroundInput), so the
      // first field's frame goes on the form.
      const f0 = (n.fields || [])[0]?.style || {};
      const { background, ...frame } = bgStyle(f0);
      if (painted(n.style)) note(c, "form box background/border dropped (the form's style styles its fields)");
      return {
        type: "form",
        opts: { specials: { type: "subscribe" }, style: { ...frame, ...(f0.color ? { color: f0.color } : {}), ...(f0.fontSize ? { fontSize: `${f0.fontSize}px` } : {}) }, ...(background ? { config: { backgroundInput: background } } : {}) },
        children, rowGap: 12,
      };
    }
    case "box": {
      const inside = n.content ? spec(n.content, c, inner(n)) : null;
      // A stack inside measured its own insets from this box's edge (padding + offsets): they win.
      const ins = (inside?.type === "container" && !inside.opts?.style?.background && inside.pad) || {};
      const pad: any = Object.fromEntries(["t", "r", "b", "l"].map((k) => [k, ins[k] ?? n.pad?.[k] ?? 0]));
      const style = { ...bgStyle(n.style), ...(pad.t || pad.l || pad.r || pad.b ? { padding: `${pad.t}px ${pad.r}px ${pad.b}px ${pad.l}px` } : {}), height: n.h };
      // A swatch / dot / divider keeps its size (and place) instead of stretching across its cell.
      if (!inside) return { type: "rectangle", opts: { style: { ...bgStyle(n.style), height: n.h, width: n.w }, align: placeOf(n, area) ?? "left", config: fixedOrShare(n, area) } };
      // A painted wrapper around one group → the group's own container gets the paint.
      const own = { align: alignIn(n, area), config: share(n, area) };
      if (inside.type === "container" && !inside.opts?.style?.background) return { ...inside, opts: { ...(inside.opts || {}), ...own, style: { ...(inside.opts?.style || {}), ...style } } };
      return { type: "container", autoRows: true, opts: { style, ...own }, children: [inside] };
    }
    case "group": {
      if (n.dir === "row") {
        // Each column runs from its child's left edge to the next child's (the last one to the
        // row's right edge), so space-between / offsets survive; the child is aligned inside it.
        const ks = [...(n.kids || [])].sort((a: any, b: any) => a.x - b.x);
        const gap = Math.max(0, Math.min(n.gap ?? 24, 120));
        const left = ks[0].x;
        const right = Math.max(...ks.map((k: any) => k.x + k.w));
        const cols: Area[] = ks.map((k: any, i: number) => {
          const start = i === 0 ? left : k.x;
          const end = i < ks.length - 1 ? ks[i + 1].x - gap : right;
          return { x: start, w: Math.max(1, end - start) };
        });
        const kids = ks.map((k: any, i: number) => spec(k, c, cols[i]));
        const keep = kids.map((k, i) => [k, cols[i], ks[i]] as const).filter(([k]) => k);
        if (!keep.length) return null;
        if (keep.length === 1) return keep[0][0];
        const span = { x: left, w: right - left };
        // A row of small pieces (menu links, icons, footer bits) stays a row on phones; real
        // columns (cards, split hero) collapse 2 → 1 as usual.
        const piece = (k: any) => k.w <= 240 && (["text", "button", "icon", "image"].includes(k.k) || (k.k === "box" && k.content?.k === "text"));
        const small = ks.every(piece) && (span.w <= 900 || ks.length <= 4);
        // Hug only a cluster (pills, a menu): pieces spread apart (space-between) keep
        // position-based columns, or the measured gap alone would overflow a phone.
        const cluster = small && gap <= 48;
        // Columns: a small piece or a cluster of them sizes to its content (max-c); real content
        // shares the rest by its measured width (fr). With no fr column left, the column before the
        // widest gap absorbs the free space — that is what space-between looked like.
        const hugs = (k: any) => piece(k) || (k.k === "group" && k.dir === "row" && (k.kids || []).every(piece));
        const total = keep.reduce((s, [, a]) => s + a.w, 0) || 1;
        const colWidths: any[] = keep.map(([, a, k]) => (!cluster && hugs(k) ? { unit: "max-c" } : { unit: "fr", value: Math.max(1, Math.round((a.w / total) * 24)) }));
        if (!cluster && colWidths.every((w) => w.unit === "max-c")) {
          let at = 0;
          let widest = -1;
          for (let i = 0; i < keep.length - 1; i++) {
            const g = keep[i + 1][2].x - (keep[i][2].x + keep[i][2].w);
            if (g > widest) [widest, at] = [g, i];
          }
          colWidths[at] = { unit: "fr", value: 1 };
        }
        // In a content-sized column a text must size to its words (the factory default is 230px).
        keep.forEach(([k], i) => {
          if ((cluster || colWidths[i].unit === "max-c") && k.type === "text") k.opts = { ...k.opts, config: { ...(k.opts.config || {}), widthUnit: "auto" } };
        });
        const n2 = keep.length;
        if (n.slider && n.slider < n2) return carousel(n, c, keep.map(([k]) => k), ks, gap);
        // A slider shows `slider` cards per view: all of them are kept, wrapped that many per row.
        const view = n.slider ? Math.min(n2, n.slider) : n2;
        // Measured: the columns the source really shows at laptop/tablet/phone width.
        const measured: Record<string, number> = view < n2 ? { bp1: view, bp2: view } : {};
        for (const bp of ["bp2", "bp3", "bp4"]) {
          const v = n.key ? c.columns?.[bp]?.[n.key] : undefined;
          if (v) measured[bp] = Math.max(1, Math.min(view, v));
        }
        const collapse = Object.keys(measured).length ? measured : small ? { bp3: n2, bp4: n2 } : undefined;
        // Small pieces hug their content; their row keeps its desktop share only on desktop.
        const rowShare = share(span, area);
        const bp = (g: number) => ({ ...(small && rowShare ? { relWidth: 100 } : {}), ...(gap > g ? { columnGap: g } : {}) });
        // A desktop gutter (space-between can measure 100px+) shrinks on tablet/phone.
        const responsive = Object.keys(bp(24)).length ? { bp3: { config: bp(24) }, bp4: { config: bp(16) } } : undefined;
        return {
          type: "container", layout: "row", columnGap: gap, colWidths, ...(cluster ? { hug: true } : {}), ...(collapse ? { collapse } : {}),
          children: keep.map(([k]) => k), opts: { align: alignIn(span, area), config: rowShare, ...(responsive ? { responsive } : {}) },
        };
      }
      // Insets of the stack's content from its box: padding (and offsets such as a vertically
      // centred caption on a banner). Small side insets and any top/bottom one are kept as padding;
      // a wide side inset is a narrower column, placed by alignment instead.
      const ks = n.kids || [];
      const x0 = Math.min(...ks.map((k: any) => k.x));
      const x1 = Math.max(...ks.map((k: any) => k.x + k.w));
      const y0 = Math.min(...ks.map((k: any) => k.y));
      const y1 = Math.max(...ks.map((k: any) => k.y + k.h));
      const side = (v: number) => (v >= 4 && v <= 64 ? Math.round(v) : undefined);
      const end = (v: number) => (v >= 4 && v <= 160 ? Math.round(v) : undefined);
      const ins: any = { t: end(y0 - n.y), r: side(n.x + n.w - x1), b: end(n.y + n.h - y1), l: side(x0 - n.x) };
      const box = { x: n.x + (ins.l || 0), w: Math.max(1, n.w - (ins.l || 0) - (ins.r || 0)) };
      const kids = ks.map((k: any) => spec(k, c, box)).filter(Boolean);
      if (!kids.length) return null;
      if (kids.length === 1) return kids[0];
      const padded = Object.values(ins).some((v) => v);
      const css = (p: any) => `${p.t || 0}px ${p.r || 0}px ${p.b || 0}px ${p.l || 0}px`;
      return { type: "container", rowGap: Math.min(n.gap ?? 16, 160), autoRows: true, children: kids, ...(padded ? { pad: ins, opts: { style: { padding: css(ins) } } } : {}) };
    }
    default:
      note(c, `unmapped ${n.k}`);
      return null;
  }
}

/** A multi-card slider → the builder's carousel (a track of cards that slides by arrows/swipe):
 *  every card kept, each `relSlideWidth` % of the window wide per breakpoint as measured, so the
 *  same number of cards shows on desktop, tablet and phone. */
function carousel(n: any, c: Ctx, children: any[], ks: any[], gap: number) {
  const ws = ks.map((k: any) => k.w).sort((a: number, b: number) => a - b);
  const cw = ws[ws.length >> 1];
  const pct = (v: number) => Math.max(5, Math.min(100, +v.toFixed(2)));
  const desk = pct(n.clipW ? (cw / n.clipW) * 100 : 100 / n.slider);
  // Not probed (a snapshot from get_clone_script): ~3 cards on a tablet, ~2 on a phone.
  const guess: Record<string, [number, number]> = { bp3: [Math.max(desk, 31), Math.min(gap, 16)], bp4: [Math.max(desk, 45), Math.min(gap, 12)] };
  const responsive: any = {};
  for (const bp of ["bp2", "bp3", "bp4"]) {
    const m = (n.key && c.slides?.[bp]?.[n.key]) || guess[bp];
    if (m) responsive[bp] = { config: { relSlideWidth: pct(m[0]), columnGap: Math.min(m[1], 120) } };
  }
  note(c, "slider → native carousel (every card kept, cards per view as measured; arrows + swipe)");
  return {
    type: "carousel", columnGap: gap, children,
    opts: {
      width: n.w, height: n.h, align: "fill",
      config: { slideItems: children.length, slideWidth: cw, slideWidthUnit: "%", relSlideWidth: desk, columnGap: gap },
      specials: { type: "controls", autoplay: "off", arrowColor: "rgba(0, 0, 0, 0.75)" },
      responsive,
    },
  };
}

/** The section grid's side margins per breakpoint (genGridByBp: 10px laptop, 5px tablet/phone)
 *  would put content 5px from the edge where the source keeps a centred max-width container or
 *  side padding. Each full-width child of a section takes the measured content share of the
 *  width at that breakpoint, centred — so 1000–1319px desktops/laptops look like the source. */
const GRID_MARGIN: Record<string, number> = { bp2: 10, bp3: 5, bp4: 5 };
function inset(children: any[], key: string | undefined, insets?: Record<string, Record<string, [number, number]>>) {
  if (!key || !insets) return;
  const per: Record<string, any> = {};
  for (const [bp, W] of Object.entries(PROBE_WIDTHS)) {
    const m = insets[bp]?.[key];
    if (!m) continue;
    const [l, r] = m;
    const cell = W - 2 * GRID_MARGIN[bp];
    const wide = (l > GRID_MARGIN[bp] + 8 || r > GRID_MARGIN[bp] + 8) && Math.abs(l - r) <= 24;
    per[bp] = wide
      ? { widthUnit: "%", relWidth: Math.max(50, Math.min(100, +(((W - l - r) / cell) * 100).toFixed(2))), constraintX: ["centerLeft"] }
      : { widthUnit: "%", relWidth: 100, constraintX: ["left", "right"] };
  }
  if (!Object.values(per).some((p) => p.relWidth < 100)) return;
  for (const ch of children) {
    const o = (ch.opts = ch.opts || {});
    // Only what fills the column: a block that already keeps its own share is placed by it.
    if (o.config?.relWidth != null || (o.align && o.align !== "fill")) continue;
    const rs = (o.responsive = { ...(o.responsive || {}) });
    for (const [bp, cfg] of Object.entries(per)) rs[bp] = { ...(rs[bp] || {}), config: { ...(rs[bp]?.config || {}), ...cfg } };
  }
}

/** A captured page → { sections } built with the builder's own layout helpers. */
export function snapshotToSource(snap: any, opts: { skipChrome?: boolean } = {}) {
  const c: Ctx = { pageBg: snap?.pageBg, columns: snap?.columns, slides: snap?.slides, notes: {}, text: 0, fonts: {}, images: [], W: snap?.viewport?.w || 1440 };
  const white = (col?: string) => !col || /^rgba?\(255, 255, 255(, 1)?\)$/.test(col);
  const sections: any[] = [];
  const roles: string[] = [];
  for (const s of snap?.sections || []) {
    if (opts.skipChrome && (s.role === "header" || s.role === "footer" || s.role === "nav")) {
      note(c, `${s.role} skipped (the site's own global header/footer is used)`);
      continue;
    }
    const content = s.content;
    // The section's children: a column group stacks; anything else is one child.
    const childNodes = content?.k === "group" && content.dir === "col" ? content.kids : content ? [content] : [];
    const children = childNodes.map((n: any) => spec(n, c, inner(s))).filter(Boolean);
    inset(children, s.key, snap?.insets);
    const pad = s.pad || {};
    const firstY = childNodes.length ? Math.min(...childNodes.map((n: any) => n.y)) : s.y;
    const lastY = childNodes.length ? Math.max(...childNodes.map((n: any) => n.y + n.h)) : s.y + s.h;
    const padY = Math.max(0, Math.min(160, Math.round(((firstY - s.y) + (s.y + s.h - lastY)) / 2) || pad.t || 0));
    // A section with no paint of its own shows the source page's background (dark sites).
    const st = s.style?.bg || s.style?.bgImage || s.style?.gradient || white(c.pageBg) ? s.style : { ...s.style, bg: c.pageBg };
    const section = buildSection(children, {
      style: bgStyle(st, white(c.pageBg) ? undefined : c.pageBg),
      padY,
      rowGap: content?.k === "group" && content.dir === "col" ? Math.min(content.gap ?? 16, 160) : undefined,
      autoRows: true,
    });
    if (s.sticky) note(c, "sticky/fixed header captured as a normal section — set it sticky in the editor if needed");
    sections.push(section);
    roles.push(s.role || "content");
  }
  // Every picture the source points at (src, background url(…) in any layer): rehost_images uploads them.
  c.images = imageRefs({ sections });
  for (const [k, n] of Object.entries(snap?.skipped || {})) c.notes[`skipped: ${k}`] = n as number;
  // Base: the text a visitor sees, minus the slides deliberately left out (noted above).
  const base = (snap?.textTotal || 0) - (snap?.offscreenText || 0);
  const coverage = base > 0 ? Math.min(100, Math.round((c.text / base) * 100)) : undefined;
  if (snap?.offscreenText) c.notes[`left-out slides held ${snap.offscreenText} characters of text (not counted in text_coverage_pct)`] = 1;
  const fonts = Object.entries(c.fonts).sort((a, b) => b[1] - a[1]).map(([f]) => f).slice(0, 4);
  return {
    source: { sections },
    roles,
    stats: { sections: sections.length, text_coverage_pct: coverage, images: c.images.length },
    fonts,
    images: c.images,
    notes: Object.entries(c.notes).map(([k, n]) => `${k}${n > 1 ? ` ×${n}` : ""}`),
  };
}
