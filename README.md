# CodeMap

**Antes de tocarlo, entiéndelo.**

CodeMap convierte un repositorio público de **GitHub, GitLab o Bitbucket** en un mapa interactivo de sus archivos: quién importa a quién, qué archivos sostienen al resto y dónde se concentra el cambio.

La mayor parte del trabajo real no es empezar proyectos, es heredarlos. Esta herramienta nace de eso: tener una primera vista del sistema antes de abrir el primer archivo.

## Qué muestra

- **Dependencias.** Un grafo de fuerzas con cada archivo como nodo y cada import como arista, agrupado por carpeta.
- **Archivos clave.** Los más importados. Si los rompes, se rompe todo lo demás.
- **Zonas calientes.** Commits × tamaño sobre los últimos 1.000 commits. Los archivos grandes que cambian mucho suelen concentrar bugs y revisiones lentas; en el mapa aparecen rodeados de anillos, como curvas de nivel.
- **Inspector.** Al seleccionar un archivo: líneas, autores, último cambio, quién lo usa y qué usa.

## Dónde funciona

Pega `usuario/proyecto` (se asume GitHub) o la URL del repositorio, en HTTPS o SSH:

- `github.com/vuejs/pinia`
- `gitlab.com/grupo/subgrupo/proyecto` — incluidos subgrupos y enlaces `/-/tree/...`
- `bitbucket.org/workspace/repo`

## Qué entiende

| Ecosistema | Resolución |
| --- | --- |
| TypeScript / JavaScript | rutas relativas, `index`, imports ESM `.js` → `.ts`, `paths` y `baseUrl` de `tsconfig`/`jsconfig`, alias `@/` y `~/`, workspaces de npm |
| Vue / Svelte | bloques `<script>` de los componentes |
| Python | imports absolutos y relativos, paquetes con `__init__.py`, layout `src/` |
| PHP | `use` con autoload PSR-4 de Composer, `require`/`include` |

## Cómo funciona

```
navegador ──SSE──▶ servidor Fastify
                     ├─ git clone --depth 1000 --filter=blob:none
                     ├─ escaneo de archivos fuente y configs
                     ├─ extracción y resolución de imports
                     └─ git log --name-only → churn por archivo
```

El análisis se transmite por *server-sent events*, así la interfaz enseña cada fase en vivo. Los resultados se guardan en caché 30 minutos y las peticiones simultáneas al mismo repo comparten un único clon.

El mapa se pinta en `<canvas>` con `d3-force`, con zoom, búsqueda (`Ctrl/⌘ + K`), modo claro y oscuro, y foco animado sobre cada archivo. Las transiciones de texto y contadores usan `motion`.

## Stack

React 19 · TypeScript · Vite · d3-force · motion · Fastify · Node 24 · Docker

## Ejecutar en local

Necesitas Node 20.11+ y `git`.

```bash
npm install
npm run dev
```

La web queda en `http://localhost:5173` y la API en `http://localhost:8787`.

```bash
npm test
npm run typecheck
```

### Con Docker

```bash
docker build -t codemap .
docker run --rm -p 8787:8787 codemap
```

Opcionalmente, `GITHUB_TOKEN` sube el límite de la API de GitHub usada para los metadatos del repo.

## Límites

- Solo repositorios públicos de GitHub, GitLab.com y Bitbucket Cloud.
- Hasta 5.000 archivos fuente y archivos de hasta 512 KB.
- La resolución de imports es estática: imports generados en tiempo de ejecución no aparecen.

## Licencia

MIT © Luis Felipe Hoyos Vega
