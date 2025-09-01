// token-ai/core/tools-registry.js

// Minimal global tool registry with optional lazy loaders.

const handlers = new Map(); // name -> async (args) => any
const lazyLoaders = new Map(); // name -> async () => (args) => any

export function hasTool(name){
  return handlers.has(name) || lazyLoaders.has(name);
}

export function registerTool(name, fn){
  if (typeof fn !== 'function') throw new Error('registerTool requires a function');
  handlers.set(String(name), fn);
  lazyLoaders.delete(String(name));
}

export function registerLazyTool(name, loader){
  if (typeof loader !== 'function') throw new Error('registerLazyTool requires a function');
  if (!handlers.has(String(name))) lazyLoaders.set(String(name), loader);
}

export function getTool(name){
  const n = String(name);
  if (handlers.has(n)) return handlers.get(n);
  if (lazyLoaders.has(n)) {
    // Resolve loader and cache the resulting handler
    const loader = lazyLoaders.get(n);
    return async (args) => {
      if (handlers.has(n)) return handlers.get(n)(args);
      const h = await Promise.resolve().then(() => loader());
      if (typeof h === 'function') {
        handlers.set(n, h);
        lazyLoaders.delete(n);
        return h(args);
      }
      throw new Error(`Tool loader for ${n} did not return a function`);
    };
  }
  return null;
}

