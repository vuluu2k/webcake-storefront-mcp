// Write a page source into a scratch HOMEPAGE of a LOCAL builderx_api running in Docker and rebuild
// its CSS the way the site /save does (cache_page_css), via rpc into the running node. Dev machine
// only — used by fidelity.mjs and render-smoke.mjs. Nothing else on the site is touched.
//   FIDELITY_SITE / FIDELITY_PAGE (required), FIDELITY_CONTAINER (builderx_api),
//   FIDELITY_NODE (builderx_api@builderx_api), FIDELITY_COOKIE (mycookie), FIDELITY_RENDER.
import { execFileSync } from "node:child_process";

export function localBackend(tag = "lb") {
  const SITE = process.env.FIDELITY_SITE;
  const PAGE = process.env.FIDELITY_PAGE;
  if (!SITE || !PAGE) {
    console.error("Set FIDELITY_SITE and FIDELITY_PAGE (a scratch homepage on your LOCAL builderx_api). Nothing else is touched.");
    process.exit(2);
  }
  const CONTAINER = process.env.FIDELITY_CONTAINER || "builderx_api";
  const NODE = process.env.FIDELITY_NODE || "builderx_api@builderx_api";
  const COOKIE = process.env.FIDELITY_COOKIE || "mycookie";
  const RENDER = process.env.FIDELITY_RENDER || `http://demo.localhost:24679/${SITE}`;
  const rpc = (expr, input = "") =>
    execFileSync("docker", ["exec", "-i", CONTAINER, "elixir", "--sname", `${tag}${process.pid}${Date.now() % 1000}`, "--cookie", COOKIE, "-e", expr], { input, encoding: "utf8", maxBuffer: 1 << 26 });
  const evalOnNode = (code) => rpc(`code = IO.read(:all); {v, _} = :rpc.call(:"${NODE}", Code, :eval_string, [code]); IO.puts("=> #{inspect(v)}")`, code).split("\n").filter((l) => l.startsWith("=> ")).pop();
  const BUILD_CSS = `
site = BuilderxApi.Citus.get(BuilderxApi.Sites.Site, "${SITE}")
theme = BuilderxApi.SiteStyles.SiteStyles.get_theme(site.id)
{:ok, ps} = BuilderxApi.Pages.get_page_source_by_page_id("${PAGE}", "${SITE}")
app_css = %Qwik{site_id: site.id, page_id: "${PAGE}", source: Jason.decode!(ps.source), settings: Jason.decode!(site.settings), colors: theme[:colors], typographies: BuilderxApi.BuildService.build_typographies(theme), source_cart: BuilderxApi.GlobalSources.GlobalSources.get_source_cart(site.id), popups: BuilderxApi.GlobalSources.GlobalSources.get_global_sources(site.id, "popup"), custom_fonts: BuilderxApi.Fonts.Fonts.load_font_groups(site.id)} |> Qwik.build(only_css: true) |> Statics.build_css()
{:ok, _} = BuilderxApi.Pages.update_page_source(ps, %{app_css: app_css})
byte_size(app_css)`;
  // base64: no quoting or #{} interpolation to worry about inside the Elixir code.
  const writeSource = (json) =>
    evalOnNode(`json = Base.decode64!("${Buffer.from(json).toString("base64")}")
{:ok, ps} = BuilderxApi.Pages.get_page_source_by_page_id("${PAGE}", "${SITE}")
{:ok, _} = BuilderxApi.Pages.update_page_source(ps, %{source: json})
${BUILD_CSS}`);
  // The node's debug logs share our stdout: the payload travels base64 between markers.
  const readSource = () => {
    const out = rpc(`{:ok, ps} = :rpc.call(:"${NODE}", BuilderxApi.Pages, :get_page_source_by_page_id, ["${PAGE}", "${SITE}"]); IO.puts("<<<" <> Base.encode64(ps.source) <> ">>>")`);
    const m = /<<<([A-Za-z0-9+/=]+)>>>/.exec(out);
    return m ? Buffer.from(m[1], "base64").toString("utf8") : "";
  };
  return { SITE, PAGE, RENDER, writeSource, readSource };
}
