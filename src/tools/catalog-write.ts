// Write tools for catalog DATA — products, product categories, blog categories — so a
// generated site has real content to render (grid-product / grid-category / post-list
// bindings resolve only when these exist). Articles already have create_article.
//
// The category endpoints are COMMAND-based and the CALLER must generate the new id
// (the response is a generic {code:success}), so we mint a UUID and return it.
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebcakeCmsApi } from "../api.js";
import type { Handle } from "../server.js";

const variationSpec = z.object({
  retail_price: z.number().describe("Selling price (what the customer pays)"),
  original_price: z.number().optional().describe("List/compare-at price (defaults to retail_price)"),
  remain_quantity: z.number().optional().describe("Stock quantity (default 100)"),
  custom_id: z.string().optional().describe("SKU for this variation (auto-generated if omitted)"),
  images: z.array(z.string()).optional().describe("Hosted image URLs for this variation"),
  weight: z.number().optional().describe("Weight in grams (default 0)"),
  fields: z
    .array(z.object({ name: z.string(), value: z.string() }))
    .optional()
    .describe("Attribute values for this variation, e.g. [{name:'Color',value:'Đen'},{name:'Size',value:'M'}]"),
});

export function registerCatalogWriteTools(server: McpServer, api: WebcakeCmsApi, handle: Handle) {
  server.tool(
    "create_product",
    `Create a product so the storefront has real merchandise (grid-product / slider-product bindings need this).
Simple use: pass name + price (+ images, category_ids). One default variation with the price/stock is created for you.
Advanced use: pass attributes (e.g. Color/Size) + variations for a multi-SKU product.
Images must be HOSTED URLs — get them from search_images or upload_images first. The backend generates id, slug and publishes the product.`,
    {
      name: z.string().describe("Product name"),
      price: z.number().optional().describe("Selling price (used when you don't pass variations). Required unless variations are given."),
      original_price: z.number().optional().describe("List/compare-at price for the simple single-variation case"),
      stock: z.number().default(100).describe("Stock quantity for the simple single-variation case"),
      sku: z.string().optional().describe("SKU / custom_id for the simple case (auto-generated if omitted)"),
      images: z.array(z.string()).optional().describe("Hosted image URLs (search_images/upload_images). First image becomes the product thumbnail."),
      description: z.string().optional().describe("Product description (HTML allowed)"),
      category_ids: z.array(z.string()).optional().describe("Product category IDs to file the product under (from create_product_category / list_categories)"),
      attributes: z
        .array(z.object({ name: z.string(), values: z.array(z.string()) }))
        .optional()
        .describe("Variant axes, e.g. [{name:'Color',values:['Đen','Trắng']},{name:'Size',values:['S','M','L']}]"),
      variations: z.array(variationSpec).optional().describe("Explicit per-SKU variations. Omit to auto-build one from price/stock/sku."),
    },
    ({ name, price, original_price, stock, sku, images, description, category_ids, attributes, variations }) =>
      handle(async () => {
        let vars = variations;
        if (!vars || !vars.length) {
          if (price == null) throw new Error("Provide `price` (or explicit `variations`) to create a product.");
          vars = [
            {
              custom_id: sku || `SKU-${randomUUID().slice(0, 8)}`,
              retail_price: price,
              original_price: original_price ?? price,
              remain_quantity: stock ?? 100,
              images: images || [],
              weight: 0,
              fields: [],
            },
          ];
        } else {
          // Normalise: fill SKU / original_price / stock defaults per variation.
          vars = vars.map((v) => ({
            custom_id: v.custom_id || `SKU-${randomUUID().slice(0, 8)}`,
            retail_price: v.retail_price,
            original_price: v.original_price ?? v.retail_price,
            remain_quantity: v.remain_quantity ?? 100,
            images: v.images || [],
            weight: v.weight ?? 0,
            fields: v.fields || [],
            is_hidden: false,
          }));
        }

        const productParams: any = {
          name,
          variations: vars,
          ...(description ? { description } : {}),
          ...(attributes ? { product_attributes: attributes } : {}),
          ...(category_ids ? { categories: category_ids } : {}),
          ...(images && images.length ? { image: images[0] } : {}),
        };

        const res: any = await api.createProduct(productParams);
        const data = res?.data;
        const productId = data?.attributes?.id || data?.id || data?.product?.id || null;
        return {
          success: true,
          product_id: productId,
          name,
          slug: data?.attributes?.slug || data?.slug || null,
          variations: vars.length,
          categories: category_ids || [],
          raw: productId ? undefined : res, // surface raw response only if we couldn't find the id
        };
      })
  );

  server.tool(
    "create_product_category",
    `Create a product category (so grid-category / a category page has something to show, and products can be filed under it).
Returns the new category id — pass it to create_product's category_ids. Image must be a hosted URL.`,
    {
      name: z.string().describe("Category name"),
      image: z.string().optional().describe("Hosted image URL for the category card"),
      description: z.string().optional().describe("Category description"),
      parent_id: z.string().optional().describe("Parent category id for a sub-category"),
    },
    ({ name, image, description, parent_id }) =>
      handle(async () => {
        const id = randomUUID();
        const commands: any[] = [
          { name: "create_category", data: { id, name, ...(parent_id ? { parent_id } : {}) } },
        ];
        if (image) commands.push({ name: "image_category", data: { id, image } });
        if (description) {
          commands.push({
            name: "multi_description",
            data: { id, multi_description: [{ id: randomUUID(), title: name, description }] },
          });
        }

        await api.createProductCategory(commands);
        return { success: true, category_id: id, name, ...(parent_id ? { parent_id } : {}) };
      })
  );

  server.tool(
    "create_blog_category",
    `Create a blog/article category. Returns the new category id — pass it to create_article's category_id so posts are grouped (post-list / blog pages bind to it). Image must be a hosted URL.`,
    {
      name: z.string().describe("Blog category name"),
      image: z.string().optional().describe("Hosted image URL"),
      description: z.string().optional().describe("Category description"),
    },
    ({ name, image, description }) =>
      handle(async () => {
        const id = randomUUID();
        const commands: any[] = [{ name: "create_category", data: { id, name } }];
        if (description) commands.push({ name: "description_category", data: { id, description } });
        if (image) commands.push({ name: "image_category", data: { id, image } });

        await api.createBlogCategory(commands);
        return { success: true, category_id: id, name };
      })
  );
}
