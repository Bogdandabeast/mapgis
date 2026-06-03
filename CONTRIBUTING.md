# Guía de Contribución — MapGIS

## Git — GitHub Flow

Trabajamos con **GitHub Flow**. Simple, rápido, centrado en PRs.

```
main ─────────────────────────────────────────────────
  │
  ├── feat/login ──▶ PR ──▶ CI ✅ ──▶ review ✅ ──▶ squash merge
  │
  ├── fix/map-crash ──▶ PR ──▶ CI ✅ ──▶ review ✅ ──▶ squash merge
  │
  └── chore/update-deps ──▶ PR ──▶ CI ✅ ──▶ squash merge
```

**Reglas**:
- `main` siempre deployable. Si algo se rompe, se revierte.
- Todo cambio entra por PR. No se pushea directo a `main`.
- Ramas viven 1–3 días. Si tarda más, el PR está muy grande.

## Ramas

| Prefijo | Uso | Ejemplo |
|---|---|---|
| `feat/` | Feature nueva | `feat/create-plan`, `feat/google-oauth` |
| `fix/` | Bug fix | `fix/auth-token-expiry`, `fix/map-zoom` |
| `chore/` | Tareas, deps, tooling | `chore/update-bun`, `chore/eslint-config` |
| `docs/` | Solo documentación | `docs/api-reference`, `docs/readme` |
| `refactor/` | Refactor sin cambio de comportamiento | `refactor/plan-service` |
| `test/` | Solo tests | `test/plan-creation-e2e` |

**Nombre**: `tipo/descripcion-breve` en minúsculas, sin tildes, guiones para espacios.

## Ciclo de un cambio

### 1. Empezar
```bash
git checkout main
git pull origin main
git checkout -b feat/mi-feature
```

### 2. Desarrollar
Commits frecuentes y atómicos siguiendo [Conventional Commits](https://www.conventionalcommits.org/):
```bash
git commit -m "feat(app): add login screen"
git commit -m "feat(supabase): add auth provider hook"
git commit -m "test(app): add login form validation tests"
```

El hook `commit-msg` valida el formato antes de cada commit.

> **Tests con el código**: cada feature incluye sus tests en los mismos commits. No "commit de tests" separado al final.

### 3. Pre-commit hook
Antes de cada commit se ejecuta automáticamente:
- `eslint --fix` sobre los archivos `.ts/.tsx` modificados (solo staged files)
- Si hay errores de lint, el commit se rechaza

### 4. Abrir PR
```bash
git push origin feat/mi-feature
# Abrir PR en GitHub desde la rama → main
```

### 5. Revisión

| Paso | Quién | Qué |
|---|---|---|
| 1. CI checks | GitHub Actions | lint, typecheck, test — deben pasar todos ✅ |
| 2. AI review | Revisor automático | Sugerencias de código, bugs, patrones (no vinculante) |
| 3. Human review | El otro desarrollador | Revisión de lógica, UX, arquitectura (vinculante) |

**El PR solo mergea si**: CI ✅ + 1 human approval ✅.

### 6. Merge
```bash
# Squash merge desde la UI de GitHub
# El mensaje del squash es el título del PR (conventional commit)
```

### 7. Limpiar
```bash
git checkout main
git pull origin main
git branch -d feat/mi-feature     # borrar local
# La rama remota se borra automáticamente al mergear
```

## PRs — Reglas de tamaño

| Líneas cambiadas | Acción |
|---|---|
| 0–200 | PR directo, 1 revisor |
| 200–400 | PR aceptable, revisión más cuidadosa |
| 400+ | **Partir en PRs encadenados** (stacked PRs). Ver sección abajo. |

> El hook `pre-commit` + CI evitan que escapes de lint o type errors. Pero el tamaño del PR lo controlamos nosotros.

### PRs encadenados (stacked)

Cuando un cambio es grande, lo partimos en PRs que dependen uno del otro:

```
PR #1 ──▶ feat/plan-schema         ← schema de DB, migraciones
              │
PR #2 ──▶ feat/plan-service        ← queries, depende de #1
              │
PR #3 ──▶ feat/plan-ui             ← pantalla de crear plan, depende de #2
```

Cada PR mergea a `main` de forma independiente. `main` nunca se rompe porque cada PR es un incremento funcional.

## Convenciones de commit

Seguimos [Conventional Commits](https://www.conventionalcommits.org/):

```
<tipo>[-(scope)]: <descripción>

[cuerpo opcional]
```

**Tipos válidos**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`, `build`, `revert`, `spec`, `design`

**Scopes válidos**: `app`, `supabase`, `shared`, `root`, `ci`, `docs`, `deps`

**Ejemplos**:
```
feat(app): add login screen with email/password
feat(supabase): add profiles table and RLS policies
fix(app): prevent map crash on zoom level 0
chore(root): update bun to v1.4.0
docs: add contributing guide
spec: add supabase-auth requirements
design: add detailed screen wireframes
```

## Releases

- Cada merge a `main` es deployable
- Tags semánticos: `v1.0.0`, `v1.1.0`, `v2.0.0`
- El CI/CD deploya automáticamente desde `main`
- Android: se sube a Play Console internal track
- Web: se deploya al VPS + Cloudflare cache purge

## Rollback

Si un deploy a `main` rompe algo:
```bash
git revert <commit-del-squash-merge>
git push origin main
# CI/CD redeploya con el revert
```

No se force-pushea. No se reescribe historial de `main`.

## Code Review — checklist

Al revisar un PR, verificá:

- [ ] El código hace lo que dice el título del PR
- [ ] Los tests cubren el happy path + 1 edge case
- [ ] No hay código comentado ni `console.log`
- [ ] Las queries a la DB tienen RLS considerada
- [ ] Los tipos de TypeScript son correctos (no `any` sin justificación)
- [ ] La UI funciona en mobile (<768px) y desktop
- [ ] No hay secretos hardcodeados (usar `import.meta.env`)
