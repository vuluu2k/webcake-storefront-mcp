// Tests call tools by their own name. Family members (families.ts) aren't registered on their
// own, so resolve a name the way invoke_tool does: registered tool first, else the registry.
import { toolEntries } from "../dist/tools/registry.js";

export function toolsOf(server) {
  const registered = server._registeredTools;
  return new Proxy(registered, {
    get(target, name) {
      if (typeof name !== "string") return target[name];
      if (target[name]) return target[name];
      const e = toolEntries(server).get(name);
      return e && { handler: (args, extra) => e.handler(args, extra ?? {}), annotations: {}, inputSchema: { shape: e.shape } };
    },
  });
}
