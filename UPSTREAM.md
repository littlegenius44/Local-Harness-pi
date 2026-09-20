# Upstream provenance

This reference identifies the source and dependency inputs of Local-Harness-pi. The machine-readable authority is [source-lock.json](docs/upstream/source-lock.json); run `pnpm run check:local-harness:sources` to verify it against the approved constants, direct Pi dependencies, lockfile resolutions, and private product package policy.

| Project | Use | License |
|---|---|---|
| DeepSeek Harness | Imported source baseline; owns the product platform and durable Session | [MIT](https://github.com/deepseek-ai/deepseek-harness/blob/b2e3b2a0125854567a4a5fcba75782e42fe84901/LICENSE) |
| Pi | npm execution dependency; `pi-ai` and, when the kernel package is present, `pi-agent-core` remain exactly version `0.85.1` | [MIT](https://github.com/earendil-works/pi/blob/acaa253cc8e3f159e6100b6f3874861b1f0bfc99/LICENSE) |
| OpenAI Codex | Design reference only; no Codex source is redistributed | [Apache-2.0](https://github.com/openai/codex/blob/73a1148c9c775c2a4616ce5096291740a00ed68a/LICENSE) |

The imported DSH [license](LICENSE) and [repository rules](docs/upstream/dsh-root-agents.md) remain available. Source updates require an explicit provenance change and a compatibility review separate from feature changes. A source-lock check verifies declared inputs and package resolutions; it does not claim that modified application files still match an upstream tree byte for byte.

## Product identity

Local-Harness-pi is not an official OpenAI or DeepSeek product. Product-visible branding follows the [fixed DSH brand guidelines](https://github.com/deepseek-ai/deepseek-harness/blob/b2e3b2a0125854567a4a5fcba75782e42fe84901/BRAND_GUIDELINES.md). DSH npm scopes, plugin identifiers, the `dsh-app` protocol, preload names, environment variable names, and historical source documentation are upstream compatibility identifiers. They do not identify a second product. True upstream attribution remains in notices and About information.

Packages named `@local-harness/*` are private product components, use the root version, and omit npm publication configuration. They retain the workspace's artifact, export, and TypeScript reference checks.
