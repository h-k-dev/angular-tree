# STYLE.md

How code is written in this repo. Derived from how we actually write, not from a generic style guide. Signals-first, headless-first, DX over cleverness.

## Philosophy

1. **Think in derivations, not events.** State is a pyramid: atomic signals at the bottom, `computed()` combinators in the middle, the view on top. If you're writing a method whose job is "recalculate X", X should have been a `computed()`.
2. **Components orchestrate or render — never both.** Smart components coordinate headless/presentational children, unify their state behind computeds, and fan out commands. They own no DOM complexity.
3. **Flat over clever.** A `switch` on a string union beats a handler registry. An explicit spread-array beats a reducer. Abstraction must be earned by the third duplication.
4. **Quarantine the untyped world.** Legacy backends, wire formats, and third-party quirks get typed at exactly one boundary. Inside that boundary, `any` is allowed and documented. Outside it, `any` is a review blocker.

## State & Signals

- Atomic state: `signal()`. Derived state: `computed()`. Two-way component contract: `model()`. Inputs: `input()` / `input.required()`.
- **`computed()` must be pure.** No counters, no `nextId++`, no logging, no writes. If it needs a side effect, it's not a computed — initialize once in a field, or use an effect (sparingly).

```ts
// ❌ side effect + identity changes when unrelated deps change
_id = computed(() => this.tableId() || `table-${Table.nextId++}__${this.displayType()}`);

// ✅ mint once, derive the override only
readonly #generatedId = `table-${Table.nextId++}`;
_id = computed(() => this.tableId() || this.#generatedId);
```

- `linkedSignal()` only when the value is genuinely *writable but derived-by-default*. If nothing ever writes it, it's a `computed()` — downgrade it.
- Guard-style helpers (`hasData`, `isCaseReferred`) are standalone pure functions or arrow fields; they take values, not `this` state, so they're testable in isolation.

## Dependency Injection

- `inject()` only. No constructor parameter DI.
- Services live in **ECMAScript `#private` fields**: `#dialog = inject(MatDialog)`. Never mix with TypeScript `private` for injected services — one convention, enforced in review.
- **Exception:** Angular query members (`contentChildren`, `viewChild`, …) cannot be ES-private (NG1053) — use TS `private readonly` there, with a comment naming the exception.
- Scoped/session-like services acquired in initializers (`#upload = inject(Upload).session(...)`), released in `ngOnDestroy`.

## Components

- **Templates and styles live in sibling files** (`templateUrl: './x.html'`, `styleUrl: './x.scss'`) — never inline. Scaffold with the CLI (`ng generate component`) so the files exist from the start; current CLI defaults, no file suffixes.
- **The host element IS the container — no divitis.** Style `:host` instead of wrapping the template in a root `<div>`. Every wrapper element must earn its place (positioning context, ARIA role, drag host, conditional rendering); a wrapper that only carries a layout class belongs on `:host`.
- `host: {}` metadata for host bindings — no `@HostBinding`/`@HostListener`.
- State exposed to CSS via **data attributes**, not class soup: `'[attr.data-multi-select]': "..."`. Style against `[data-multi-select]`.
- Children accessed via `viewChild()` signals; multi-view façades (table/tree) normalize their children behind a single computed:

```ts
selections = computed(() =>
  this.displayType() === 'table'
    ? this.matTable()?.selectionColumn()?.selected() ?? []
    : this.tree()?.selection().map((n) => n.data) ?? [],
);
```

- Commands fan out (`reload()` calls every child); queries unify (one `selections()` regardless of view).

## Actions & Dispatch

- Row/bulk actions are **discriminated string unions** dispatched in a `switch`. Exhaustive: add a `default` with `satisfies never` on the value so new actions fail the build, not review.
- **Signatures never lie.** `bulkDownload(rows: Row[])` must not be called with a single `Row`. If both arities are real, overload or accept `Row | Row[]` and normalize on line one.
- **No `console.log` placeholders.** Unimplemented actions throw or call a `notImplemented('toWorkbench')` helper that snackbars in dev. A log line ships silently; a throw gets fixed.

## Async & Lazy Loading

- Dialogs and heavy features are **always** dynamically imported at the call site:

```ts
import('./delete/delete').then(({ Delete }) => this.#dialog.open(Delete, { data }));
```

- **Bridge callback APIs to promises before branching on their results.** Callback-style APIs (`FileSystemFileEntry.file(cb)`) complete *after* your synchronous code:

```ts
// ❌ race: files is still empty at the check
fileEntry.file((f) => files.push(f));
if (files.length === 0) return;

// ✅ promisify, then await all
const files = (
  await Promise.all(
    entries
      .filter((e) => e.fileEntry.isFile)
      .map((e) => new Promise<File>((res, rej) => (e.fileEntry as FileSystemFileEntry).file(res, rej))),
  )
).filter((f): f is File => f instanceof File);
```

- `AbortController` per user-triggered request; pass the signal down.

## Boundaries & Typing

- The untyped backend filter DSL lives behind `*Clause` signals and builder utilities. `any` is permitted **only there**, and each one carries a reason:

```ts
/** LB3 filter fragment — untyped by the wire format, validated by hasData(). */
cpVisibleClause = signal<any>(undefined);
```

- Better: alias it once (`type Lb3Clause = unknown`) and narrow at the seam — `unknown` forces the guard, `any` merely hopes for it. New code uses the alias; `any` is grandfathered, not grown.
- Defensive comments state *consequences*, not mechanics: `// Backend crashes if the filter is invalid` is good; `// check the filter` is noise.

## Naming

| Pattern | Meaning |
|---|---|
| `bulk*` | Operates on the current multi-selection |
| `is*` / `has*` | Boolean signal, computed, or guard |
| `*Clause` | One fragment of a backend filter, composed by `and()`/`where` |
| `#name` | Injected service or true private |
| `_name` | Internal-but-bindable (template needs it, consumers don't) |
| `smart*` | Heuristic dispatch — tries strategies in priority order |

- **No `Service`/`Directive`/`Component`/`Pipe` class suffixes** (modern Angular style guide). The name says what it does: `TreeController`, not `TreeControllerService`; `TreeNodeToggle`, not `TreeNodeToggleDirective`. File names match, without type suffixes (`tree-controller.ts`, not `tree-controller.service.ts`).
- **Scaffold via `ng generate`**, never by hand — keeps file layout, tsconfig references, and naming aligned with current CLI defaults.

## Comments

- Comment **why** and **what breaks**, never what the code visibly does.
- JSDoc on public inputs/outputs; one-liners elsewhere.
- A comment admitting uncertainty ("filter one last time just to be absolutely safe") is a TODO in disguise — either make the invariant real and delete the comment, or keep the guard and state the concrete failure it prevents.

## Review Checklist (the recurring ones)

- [ ] Any inline `template:`/`styles:`? → sibling `.html`/`.scss` via `templateUrl`/`styleUrl`
- [ ] Any root `<div>` wrapper doing what `:host` could do?
- [ ] Any `computed()` with a side effect?
- [ ] Any `linkedSignal` that's never written? → `computed`
- [ ] Any `private x = inject(...)`? → `#x`
- [ ] Any callback API result used before it resolved?
- [ ] Any call site whose argument shape disagrees with the signature?
- [ ] Any `console.log` standing in for a feature?
- [ ] Any new `any` outside the LB3 boundary?
