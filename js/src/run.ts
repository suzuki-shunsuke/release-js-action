import { glob } from "glob";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as github from "@actions/github";
import * as commit from "./commit";

const waitAfterCommit = () =>
  new Promise((resolve) => setTimeout(resolve, 1000));

export const main = async () => {
  const version = core.getInput("version", { required: true });
  const pr = core.getInput("pr");
  const files = core.getMultilineInput("files");
  const isComment = core.getBooleanInput("is_comment");
  const githubToken = core.getInput("github_token", { required: true });

  const { owner, repo } = github.context.repo;

  const baseRevision = (
    await exec.getExecOutput("git", ["rev-parse", "HEAD"])
  ).stdout.trim();

  let branch = `release-${version}`;
  if (version === "latest" || version.startsWith("pr/")) {
    branch = version;
  }
  core.setOutput("branch", branch);

  const distFiles = await glob("**/dist/**", {
    ignore: ["**/node_modules/**", ".git/**"],
    nodir: true,
  });

  const octokit = github.getOctokit(githubToken);

  await deleteBranch(octokit, branch);

  let sha = baseRevision;
  if (distFiles.length !== 0 || files.length !== 0) {
    const result = await commit.createCommit(octokit, {
      owner,
      repo,
      branch,
      message: `chore: prepare release ${version}\nbase revision: ${baseRevision}`,
      baseSHA: sha,
      files: distFiles.concat(files).filter((f) => f !== ""),
    });
    sha = result?.commit.sha || baseRevision;
    await waitAfterCommit();
  }

  core.setOutput("sha", sha);

  if (pr && version.startsWith("v")) {
    await exec.exec(
      "aqua",
      [
        "exec",
        "--",
        "github-comment",
        "post",
        "-var",
        `repo:${process.env.GITHUB_SERVER_URL}/${owner}/${repo}`,
        "-pr",
        pr,
        "-k",
        "pre-release",
        "-var",
        `tag:${version}`,
      ],
      {
        env: {
          ...process.env,
          GITHUB_TOKEN: githubToken,
        },
      },
    );
  }

  if (version.startsWith("pr/") && isComment) {
    const prNumber = version.substring(3);
    await exec.exec(
      "aqua",
      [
        "exec",
        "--",
        "github-comment",
        "post",
        "-pr",
        prNumber,
        "-k",
        "create-pr-branch",
        "-var",
        `repo:${process.env.GITHUB_SERVER_URL}/${owner}/${repo}`,
        "-var",
        `pr:${prNumber}`,
      ],
      {
        env: {
          ...process.env,
          GITHUB_TOKEN: githubToken,
        },
      },
    );
  }
};

const deleteBranch = async (octokit: commit.GitHub, branch: string) => {
  const { owner, repo } = github.context.repo;
  const branchExists = await octokit.rest.repos
    .getBranch({
      owner,
      repo,
      branch,
    })
    .then(() => true)
    .catch(() => false);

  if (branchExists) {
    await octokit.rest.git.deleteRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    });
  }
};
