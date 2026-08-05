import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HTTP_METHODS = new Set(['delete', 'get', 'patch', 'post', 'put']);

function normalizePath(prefix, route) {
  const joined = `/${[prefix, route].filter(Boolean).join('/')}`.replace(/\/+/g, '/');
  return joined.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

export function controllerRoutes(source, fileName = 'controller') {
  const controller = source.match(/@Controller\(\s*(?:'([^']*)')?\s*\)/);
  if (!controller) throw new Error(`${fileName}: missing static @Controller decorator`);
  const prefix = controller[1] ?? '';
  const routePattern = /@(Get|Post|Put|Patch|Delete)\(\s*(?:'([^']*)')?\s*\)/g;
  const decoratorCount = [...source.matchAll(/@(Get|Post|Put|Patch|Delete)\(/g)].length;
  const routes = [...source.matchAll(routePattern)].map(
    (match) => `${match[1].toUpperCase()} ${normalizePath(prefix, match[2] ?? '')}`,
  );
  if (routes.length !== decoratorCount) {
    throw new Error(`${fileName}: route decorators must use static string paths`);
  }
  return routes;
}

export function openApiRoutes(source) {
  const routes = [];
  let currentPath = null;
  for (const line of source.split(/\r?\n/)) {
    const pathMatch = line.match(/^  (\/[^:]*):\s*$/);
    if (pathMatch) {
      currentPath = pathMatch[1];
      continue;
    }
    const methodMatch = line.match(/^    ([a-z]+):\s*$/);
    if (currentPath && methodMatch && HTTP_METHODS.has(methodMatch[1])) {
      routes.push(`${methodMatch[1].toUpperCase()} ${currentPath}`);
    }
  }
  return routes;
}

export function compareRoutes(controllerRouteList, openApiRouteList) {
  const controllers = new Set(controllerRouteList);
  const documented = new Set(openApiRouteList);
  return {
    missing: [...controllers].filter((route) => !documented.has(route)).sort(),
    stale: [...documented].filter((route) => !controllers.has(route)).sort(),
  };
}

async function controllerFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await controllerFiles(target)));
    else if (entry.name.endsWith('.controller.ts')) files.push(target);
  }
  return files;
}

export async function checkRepository(rootDirectory) {
  const sourceDirectory = path.join(rootDirectory, 'apps', 'api', 'src');
  const routes = [];
  for (const file of await controllerFiles(sourceDirectory)) {
    routes.push(
      ...controllerRoutes(await readFile(file, 'utf8'), path.relative(rootDirectory, file)),
    );
  }
  const specification = await readFile(path.join(rootDirectory, 'api', 'openapi.yaml'), 'utf8');
  return compareRoutes(routes, openApiRoutes(specification));
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const result = await checkRepository(root);
  if (result.missing.length || result.stale.length) {
    if (result.missing.length)
      process.stderr.write(`Missing from OpenAPI:\n${result.missing.join('\n')}\n`);
    if (result.stale.length)
      process.stderr.write(`Not implemented by controllers:\n${result.stale.join('\n')}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write('OpenAPI route parity passed.\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
