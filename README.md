[![npm (scoped)](https://img.shields.io/npm/v/@xstd/async-ref-count.svg)](https://www.npmjs.com/package/@xstd/async-ref-count)
![npm](https://img.shields.io/npm/dm/@xstd/async-ref-count.svg)
![NPM](https://img.shields.io/npm/l/@xstd/async-ref-count.svg)
![npm type definitions](https://img.shields.io/npm/types/@xstd/async-ref-count.svg)
![coverage](https://img.shields.io/badge/coverage-100%25-green)
![AI generation](https://img.shields.io/badge/AI_generation-low-yellow)

<picture>
  <source height="64" media="(prefers-color-scheme: dark)" srcset="https://github.com/xstd-js/website/blob/main/assets/logo/png/logo-large-dark.png?raw=true">
  <source height="64" media="(prefers-color-scheme: light)" srcset="https://github.com/xstd-js/website/blob/main/assets/logo/png/logo-large-light.png?raw=true">
  <img height="64" alt="Shows a black logo in light color mode and a white one in dark color mode." src="https://github.com/xstd-js/website/blob/main/assets/logo/png/logo-large-light.png?raw=true">
</picture>

## @xstd/async-ref-count

An asynchronous ref counter used to open a resource only once and share it multiple times.

## 📦 Installation

```shell
yarn add @xstd/async-ref-count
# or
npm install @xstd/async-ref-count --save
```

## 📜 Documentation

An `AsyncRefCount` opens a resource only once, and shares it with every caller:

```ts
import { AsyncRefCount } from '@xstd/async-ref-count';

const factory = new AsyncRefCount(async (signal: AbortSignal) => {
  const value = await openResource(signal); // opened only once

  return {
    value,

    // called when the resource is no longer shared
    close: async (reason: unknown, signal: AbortSignal): Promise<void> => {
      await closeResource(value);
    },

    // optional: called when a shared reference is closed
    closeShared: async (): Promise<void> => {
      await releaseClient(value);
    },
  };
});
```

### Share

```ts
// opens the resource, or shares it if already opened
await using shared = await factory.open();

shared.value; // the shared value

// concurrent and subsequent `open()` calls share the same value
const other = await factory.open();
other.value === shared.value; // true

// the resource is closed when the last shared reference is released
```

### Abort an opening

```ts
const controller = new AbortController();

const promise = factory.open({ signal: controller.signal });
controller.abort('too slow');

// `promise` rejects with the abort reason
```

### Errors

- If the opening fails, every pending `open()` call rejects with the opening error: a new `open()` call retries the opening.
- If a close operation is aborted by a new `open()` call, the `close()` call which started it rejects with an `OpenAbortError`, and the resource stays opened for the new reference.
