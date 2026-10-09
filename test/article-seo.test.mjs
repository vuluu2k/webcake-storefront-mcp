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
