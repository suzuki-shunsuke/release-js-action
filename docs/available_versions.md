# Available versions

Actions released by release-js-action don't work on the default branch and feature branches because built JavaScript files aren't committed to those branches.

[suzuki-shunsuke/lock-action](https://github.com/suzuki-shunsuke/lock-action) uses release-js-action, so we describe available versions using lock-action.

For instance, `suzuki-shunsuke/lock-action@main` doesn't work.

:x: This never works as `dist/index.js` doesn't exist.

```yaml
uses: suzuki-shunsuke/lock-action@main
```

```yaml
uses: suzuki-shunsuke/lock-action@feature-1
```

The following versions are available.

1. [Release versions](https://github.com/suzuki-shunsuke/lock-action/releases)

e.g.

```yaml
uses: suzuki-shunsuke/lock-action@v0.1.1
```

2. [Pull Request versions](https://github.com/suzuki-shunsuke/lock-action/branches/all?query=pr%2F&lastTab=overview): These versions are removed when we feel unnecessary. These versions are used to test pull requests.

```yaml
uses: suzuki-shunsuke/lock-action@pr/37
```

3. [latest branch](https://github.com/suzuki-shunsuke/lock-action/tree/latest): [This branch is built by CI when the main branch is updated](https://github.com/suzuki-shunsuke/lock-action/blob/latest/.github/workflows/main.yaml). Note that we push commits to the latest branch forcibly.

```yaml
uses: suzuki-shunsuke/lock-action@latest
```

Pull Request versions and the latest branch are unstable.
These versions are for testing.
You should use the latest release version in production.
