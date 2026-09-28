---
description: "Run the DSH-owned agent lifecycle through Pi's low-level serial loop while keeping DSH Session authoritative."
kind: "package-reference"
---
# @local-harness/pi-agent-loop

English | [中文](README.zh.md)

## Summary

This private Host package is the replaceable kernel boundary for Local-Harness-pi. It maps immutable DSH step snapshots into Pi's low-level loop and translates Pi ordering events back into DSH facts. DSH Session remains the only recovery source, and V1 tool execution is sequential.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

`KernelDriver` and its event vocabulary contain only product and DSH types. Pi-specific message and stream types stay behind the package boundary. Each step rebuilds its provider request from the DSH Session-derived context; the Pi in-memory transcript is never provider authority.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`kernel-driver.ts` owns the stable product seam. The converters map DSH facts into process-local Pi values, while the model bridge consumes immutable step snapshots. The package adds no persistence store and never owns a second Session write handle.

</details>

-----

<a id="model-experience"></a>
## Model Experience

### DSH-derived conversation request

#### What the model sees

The provider sees the system prompt, derived `DSH Session` messages, and tool schemas assembled for the accepted step. It does not see the Pi in-memory transcript as a separate source.

#### Token effect

This package adds no independent text. Its token effect is exactly the DSH-derived request selected for the current step.

#### KV Cache effect

The package preserves the DSH-derived request order. A changed system prompt, tool snapshot, model route, or session surface generation may change the provider prefix at the next step.

## Known Limitations and Deferred Work
<a id="known-limitations-and-deferred-work"></a>

- V1 tools execute sequentially. Parallel execution is deferred to `PARALLEL-110`.
- Only the Pi kernel is implemented; the boundary is retained for future kernels without exposing a selector for unavailable implementations.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Keep Pi imports out of `kernel-driver.ts`. Recovery and provider request construction must continue to read DSH Session state.

</details>
