# MapGIS

Monorepo con **Bun workspaces**. Tres paquetes bajo `packages/`: la app Ionic, el servidor HTTP, y utilidades compartidas.

## Inicio rápido

```bash
bun install          # instalar dependencias de todos los paquetes
bun dev              # arrancar todos los paquetes en modo desarrollo
bun dev:app          # solo la app Ionic (Vite)

```

## Estructura

```
packages/
├── mapgis/    → @mapgis/app     Ionic React + Capacitor
└── shared/    → @mapgis/shared  Tipos, constantes, utilidades
```

## Bun — por qué y cómo

Bun es runtime, bundler, test runner y gestor de paquetes, todo en uno. En este proyecto lo usamos por tres razones:

1. **Velocidad** — instala dependencias hasta 25× más rápido que npm.
2. **Workspaces nativos** — resuelve paquetes del monorepo directo del filesystem, sin symlinks en `node_modules`.
3. **Zero-config** — levanta TypeScript y JSX sin plugins ni loaders extra.

### Gestión de dependencias

Todas las dependencias se instalan **desde la raíz**. Bun las hoistea a `node_modules/` en la raíz automáticamente.

| Acción | Comando |
|---|---|
| Instalar todo | `bun install` |
| Agregar dependencia a un paquete | `bun add <paquete> --filter @mapgis/app` |
| Agregar dependencia de desarrollo | `bun add -d <paquete> --filter @mapgis/server` |
| Agregar a la raíz | `bun add -d <paquete>` |
| Remover dependencia | `bun remove <paquete> --filter @mapgis/shared` |

> **Regla**: siempre usá `--filter` para apuntar al paquete correcto. Si lo omitís, la dependencia va a la raíz, y eso solo tiene sentido para herramientas compartidas (typescript, linters, etc.).

### Scripts con workspaces

| Comando | Qué ejecuta |
|---|---|
| `bun dev` | `dev` en todos los paquetes que tengan ese script |
| `bun run --filter @mapgis/app build` | `build` solo en la app |
| `bun run --filter './packages/*' test` | `test` en todos los paquetes |
| `bun run --filter '@mapgis/*' lint` | `lint` en todos los paquetes con prefijo `@mapgis/` |

### Agregar un paquete nuevo

1. Crear la carpeta: `mkdir -p packages/nuevo/src`
2. Crear `packages/nuevo/package.json` con `"name": "@mapgis/nuevo"`
3. Crear `packages/nuevo/tsconfig.json` (extender `../../tsconfig.json`)
4. Crear entry point: `packages/nuevo/src/index.ts`
5. Ejecutar `bun install` desde la raíz

El paquete queda disponible para importar desde cualquier otro como `import { algo } from "@mapgis/nuevo"`.

### tsconfig — convención

- **Raíz** (`tsconfig.json`): configuración base con `noEmit: true`. Define `references` a los paquetes que extienden de ella.
- **shared**: extiende la base con `"extends": "../../tsconfig.json"` y sobrescribe lo necesario (`noEmit: false`, `outDir`, `rootDir`).
- **mapgis** (app): tiene su propio `tsconfig.json` sin extender la raíz, porque necesita `lib: ["DOM"]`, `jsx: "react-jsx"` y `moduleResolution: "Node"` para Vite.

## Verificación

- [ ] `bun install` no tira errores
- [ ] `bun dev:app` levanta Vite sin errores
- [ ] `bun run --filter '*' build` compila todos los paquetes
