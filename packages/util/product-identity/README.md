---
description: "Display Local-Harness-pi identity and offline license notices in Host-owned product surfaces."
kind: "package-library"
---
# @local-harness/product-identity

English | [中文](README.zh.md)

## Summary

Host consumers can display the product name, release version, upstream attribution, and offline third-party notices without network access. Desktop About information and Host-owned product responses use the shared values. This private library does not activate a plugin or modify a conversation.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----
<a id="use-this-package"></a>
## Use this package

Use the exports in [src/index.ts](src/index.ts) from Host code that renders identity or notices. `productIdentity` contains fixed metadata; `thirdPartyNotices` contains the UTF-8 notice text. The package has no mount configuration and no independent installation workflow.

-----
<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The module exports immutable metadata and static notice text without runtime dependencies. [Upstream provenance](../../../UPSTREAM.md) owns source policy. No runtime invariant companion is needed because this library has no independently evolving state or observations to reconcile.

</details>

-----
<a id="model-experience"></a>
## Model Experience

None, as this library only supplies Host-owned identity and license text.

#### KV Cache effect

This package does not construct model input and does not change prompt cache prefixes.

## Known Limitations and Deferred Work
<a id="known-limitations-and-deferred-work"></a>

- The exported Pi version is attribution metadata; it does not establish that the Pi kernel is connected.
- The values are release constants, not a runtime scan of installed dependencies.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
