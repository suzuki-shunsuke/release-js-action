# release-js-action

[![DeepWiki](https://img.shields.io/badge/DeepWiki-suzuki--shunsuke%2Frelease--js--action-blue.svg?logo=data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACwAAAAyCAYAAAAnWDnqAAAAAXNSR0IArs4c6QAAA05JREFUaEPtmUtyEzEQhtWTQyQLHNak2AB7ZnyXZMEjXMGeK/AIi+QuHrMnbChYY7MIh8g01fJoopFb0uhhEqqcbWTp06/uv1saEDv4O3n3dV60RfP947Mm9/SQc0ICFQgzfc4CYZoTPAswgSJCCUJUnAAoRHOAUOcATwbmVLWdGoH//PB8mnKqScAhsD0kYP3j/Yt5LPQe2KvcXmGvRHcDnpxfL2zOYJ1mFwrryWTz0advv1Ut4CJgf5uhDuDj5eUcAUoahrdY/56ebRWeraTjMt/00Sh3UDtjgHtQNHwcRGOC98BJEAEymycmYcWwOprTgcB6VZ5JK5TAJ+fXGLBm3FDAmn6oPPjR4rKCAoJCal2eAiQp2x0vxTPB3ALO2CRkwmDy5WohzBDwSEFKRwPbknEggCPB/imwrycgxX2NzoMCHhPkDwqYMr9tRcP5qNrMZHkVnOjRMWwLCcr8ohBVb1OMjxLwGCvjTikrsBOiA6fNyCrm8V1rP93iVPpwaE+gO0SsWmPiXB+jikdf6SizrT5qKasx5j8ABbHpFTx+vFXp9EnYQmLx02h1QTTrl6eDqxLnGjporxl3NL3agEvXdT0WmEost648sQOYAeJS9Q7bfUVoMGnjo4AZdUMQku50McDcMWcBPvr0SzbTAFDfvJqwLzgxwATnCgnp4wDl6Aa+Ax283gghmj+vj7feE2KBBRMW3FzOpLOADl0Isb5587h/U4gGvkt5v60Z1VLG8BhYjbzRwyQZemwAd6cCR5/XFWLYZRIMpX39AR0tjaGGiGzLVyhse5C9RKC6ai42ppWPKiBagOvaYk8lO7DajerabOZP46Lby5wKjw1HCRx7p9sVMOWGzb/vA1hwiWc6jm3MvQDTogQkiqIhJV0nBQBTU+3okKCFDy9WwferkHjtxib7t3xIUQtHxnIwtx4mpg26/HfwVNVDb4oI9RHmx5WGelRVlrtiw43zboCLaxv46AZeB3IlTkwouebTr1y2NjSpHz68WNFjHvupy3q8TFn3Hos2IAk4Ju5dCo8B3wP7VPr/FGaKiG+T+v+TQqIrOqMTL1VdWV1DdmcbO8KXBz6esmYWYKPwDL5b5FA1a0hwapHiom0r/cKaoqr+27/XcrS5UwSMbQAAAABJRU5ErkJggg==)](https://deepwiki.com/suzuki-shunsuke/release-js-action) [![License](http://img.shields.io/badge/license-mit-blue.svg?style=flat-square)](https://raw.githubusercontent.com/suzuki-shunsuke/release-js-action/main/LICENSE) | [action.yaml](action.yaml)

GitHub Action to release JavaScript Actions.

This action creates a commit with `dist` directories and pushes a branch to release a new version.
It supports three kinds of releases:

1. `pr/<pull request number>`: Create or update `pr/<pull request number>` branch when pull requests are updated
1. `latest`: Update `latest` branch when the default branch is updated
1. GitHub Releases (vX.Y.Z, vX.Y.Z-a): Create a tag and a GitHub Release

## Background

If you write JavaScript Actions in TypeScript, you need to build TypeScript to JavaScript and commit it.
But adding compiled files has some problems:

- Sometimes we forget to build
- We can't find if JavaScript is built with the latest code
- It's bothersome to ask contributors to build
- Maybe the build result is different by environment
  - Maybe people build TypeScript using different Node.js version
- Huge changes of compiled files makes hard to review changes
  - Sometimes the amount of changes is over 10,000 lines
  - Even if we hide compiled files using .gitattribute, huge changes are troublesome
- Attackers can add malicious code to compiled files
  - If compiled files are huge, it's hard to find malicious code by code review
- Compiled files may cause conflicts

To solve these issues, we stop adding compiled files in the default branch and feature branches by adding `dist` to `.gitignore`.
Instead, we build TypeScript in CI and create branches to release them.
This means the default branch and feature branches don't work as JavaScript Action anymore.
Instead, we specify the following versions.

1. `pr/<pull request number>`: branches where pull request branches are built
1. `latest`: A branch where the default branch is built
1. GitHub Releases

For example, [release-js-action](https://github.com/suzuki-shunsuke/release-js-action) uses this action.
The following versions don't work:

```yaml
- uses: suzuki-shunsuke/release-js-action@main
```

```yaml
- uses: suzuki-shunsuke/release-js-action@feature-branch-1
```

Instead, the following versions are available:

```yaml
- uses: suzuki-shunsuke/release-js-action@pr/82
```

```yaml
- uses: suzuki-shunsuke/release-js-action@latest
```

```yaml
- uses: suzuki-shunsuke/release-js-action@v0.1.3
```

## How To Use

1. If you have already added `dist` to the default or feature branches, you need to remove them
1. Add `dist` to `.gitignore`
1. Add GitHub Actions workflows using this action

In workflows,

> [!WARNING]
> This action doesn't build TypeScript to JavaScript.
> You need to do it yourself before using this action

1. Build `dist` directories
1. Use this action

e.g.

- [`pr/<pull request number>`](https://github.com/suzuki-shunsuke/release-js-action/blob/main/.github/workflows/wc-create-pr-branch.yaml)

<details>
<summary>Example Workflow (`Pull Request`)</summary>

```yaml
---
name: wc-create-pr-branch
run-name: wc-create-pr-branch (${{inputs.pr}})
on:
  workflow_call:
    inputs:
      pr:
        description: "Pull Request Number"
        required: true
        type: number
      is_comment:
        description: If the comment is posted
        required: false
        default: false
        type: boolean
jobs:
  create-pr-branch:
    timeout-minutes: 30
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
      - run: gh pr checkout "$PR"
        if: inputs.pr != ''
        env:
          GITHUB_TOKEN: ${{github.token}}
          PR: ${{inputs.pr}}
      - run: npm ci
      - run: npm run build

      - uses: suzuki-shunsuke/release-js-action@7586139c29abe68e2bc84395ac4300f20112b764 # v0.1.8
        with:
          version: pr/${{inputs.pr}}
          is_comment: ${{inputs.is_comment}}
```

</details>

- [latest](https://github.com/suzuki-shunsuke/release-js-action/blob/main/.github/workflows/main.yaml)

<details>
<summary>Example Workflow (latest)</summary>

```yaml
name: Update the latest branch
on:
  push:
    branches:
      - main
jobs:
  build:
    timeout-minutes: 15
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
      - run: npm ci
      - run: npm run build
      - uses: suzuki-shunsuke/release-js-action@7586139c29abe68e2bc84395ac4300f20112b764 # v0.1.8
        with:
          version: latest
```

</details>

- [Release](https://github.com/suzuki-shunsuke/release-js-action/blob/main/.github/workflows/release.yaml)

<details>
<summary>Example Workflow (Release)</summary>

```yaml
---
name: Release
run-name: Release ${{inputs.tag}}
on:
  workflow_dispatch:
    inputs:
      tag:
        description: "tag"
        required: true
      pr:
        description: "pr number (pre-release)"
        required: false
jobs:
  release:
    timeout-minutes: 30
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
      - run: gh pr checkout "$PR"
        if: inputs.pr != ''
        env:
          GITHUB_TOKEN: ${{github.token}}
          PR: ${{inputs.pr}}
      - run: npm ci
      - run: npm run build

      - uses: suzuki-shunsuke/release-js-action@7586139c29abe68e2bc84395ac4300f20112b764 # v0.1.8
        with:
          version: ${{inputs.tag}}
          pr: ${{inputs.pr}}
```

</details>

This action requires the following permissions:

- `contents: write`: Create branches
- `pull-requests: write`: Post comments to pull requests

### GitHub Enterprise Server

If you use GitHub Enterprise Server, you need to set the following environment variables:

- `GH_ENTERPRISE_TOKEN`
- `GH_HOST`
- `GITHUB_API`

```yaml
- uses: suzuki-shunsuke/release-js-action@964d814f9200bb928f4713098c38218881cfc493 # v0.1.0
  with:
    version: ${{inputs.tag}}
    pr: ${{inputs.pr}}
  env:
    GH_ENTERPRISE_TOKEN: ${{github.token}}
    GH_HOST: github.example.com
    GITHUB_API: https://github.example.com/api/v3/
```

## Inputs / Outputs

Please see [action.yaml](action.yaml).

## Available versions

[Please see the document.](docs/available_versions.md)
