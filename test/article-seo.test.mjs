// Offline check: article SEO fields merge into meta_tags the way the dashboard stores them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeSeoTags } from "../dist/tools/articles.js";

const tag = (property, content) => ({ type: "meta", props: { property, content } });

test("seo fields overwrite by property, '' clears, untouched tags are kept", () => {
  const existing = [tag("page_title", "Old"), tag("og:image", "x.png"), tag("custom", "keep")];
  const out = mergeSeoTags({ page_title: "New", meta_description: "Desc", og_image: "" }, existing);
  assert.deepEqual(out, [tag("custom", "keep"), tag("page_title", "New"), tag("meta_description", "Desc")]);
});

test("og fields map to og:* properties", () => {
  assert.deepEqual(mergeSeoTags({ og_title: "T" }), [tag("og:title", "T")]);
});

test("advanced: canonical is a link, robots a name-meta, structured_data replaces all JSON-LD", () => {
  const existing = [{ type: "script", props: { type: "application/ld+json" }, children: "{}" }, tag("og:type", "website")];
  const out = mergeSeoTags({ canonical: "https://x/a", robots: "noindex, nofollow", og_type: "article", structured_data: [{ name: "FAQ", json: '{"@type":"FAQPage"}' }] }, existing);
  assert.deepEqual(out, [
    tag("og:type", "article"),
    { type: "link", props: { rel: "canonical", href: "https://x/a" } },
    { type: "meta", props: { name: "robots", content: "noindex, nofollow" } },
    { type: "script", props: { type: "application/ld+json" }, meta: { displayName: "FAQ" }, children: '{"@type":"FAQPage"}' },
  ]);
});

test("custom_tags add/replace by name/property/rel; remove_tags drops any tag by key", () => {
  const existing = [{ type: "meta", props: { name: "author", content: "Old" } }, tag("og:url", "u"), tag("page_title", "T")];
  const out = mergeSeoTags({ remove_tags: ["og:url"], custom_tags: [{ type: "meta", props: { name: "author", content: "New" } }] }, existing);
  assert.deepEqual(out, [tag("page_title", "T"), { type: "meta", props: { name: "author", content: "New" } }]);
});
