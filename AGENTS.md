## Language

- Work, think, and produce only English content: PRs, commits, files, code, docs, issues.
- Converse with the user in the user's language.

## Code layout

User preferences for TypeScript code organization — apply them to new code and preserve them when touching existing code:

- File and folder names are dash-cased: `with-busy-retry/with-busy-retry.ts`. Dots are also accepted for test files (`store.reads.test.ts`).
- One `.ts` file per folder. Name the folder after its file: `serve/serve.ts` + `serve/serve.test.ts`.
- Colocate tests with the code they cover: the test file sits next to its source file.
- Each file exposes, when possible, a single public export (one function or class). Related types may be exported alongside the function/class they describe.
- No barrel files: do not create `index.ts` re-export modules.
- No default exports: use named exports only.

## Code style

User preferences for TypeScript naming and typing — apply them to new code and preserve them when touching existing code:

- No abbreviations in variable names — spell names out. The only exceptions are universally standard ones (`for (let i = ...)`).
- No `private` keyword on methods or properties: use private fields (`#myMethod`) instead.
- Every TypeScript generic follows the pattern `G` + PascalCase name (`GResult`), never single letters.
- Use `readonly` as much as possible in types and interfaces.
