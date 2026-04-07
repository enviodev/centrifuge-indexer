## centrifuge indexer

Envio indexer for [Centrifuge](https://centrifuge.io) protocol contracts and cross-chain messages.

See the [Envio documentation](https://docs.envio.dev) for indexer setup, codegen, and deployment.

### Run

```bash
pnpm dev
```

Visit http://localhost:8080 to see the GraphQL Playground, local password is `testing`.

### Generate files from `config.yaml` or `schema.graphql`

```bash
pnpm codegen
```

### Pre-requisites

- [Node.js v22+ (v24 recommended)](https://nodejs.org/en/download/current)
- [pnpm (use v8 or newer)](https://pnpm.io/installation)
- [Docker](https://www.docker.com/products/docker-desktop/) or [Podman](https://podman.io/)
