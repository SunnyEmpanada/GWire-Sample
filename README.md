# Kognitos OpenAPI

OpenAPI specifications for the Kognitos REST API.

## Directory Structure

| Directory | Description |
|-----------|-------------|
| `/latest/` | Current GA release — PAT-eligible endpoints |

## Usage

Use these specs to generate SDKs, client libraries, or API documentation.

### Validate locally

```bash
npm install -g @stoplight/spectral-cli
spectral lint latest/openapi.yaml --ruleset .spectral.yaml
```

## Contributing

1. Fork and create a feature branch
2. Edit specs in `latest/`
3. Run `spectral lint` locally to validate
4. Open a PR — CI will validate automatically

## Release Flow

Merges to `main` trigger a semantic version release. New releases automatically notify downstream SDK repos (`kognitos-node`).

## License

[MIT](LICENSE)
