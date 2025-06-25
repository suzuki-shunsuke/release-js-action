import { glob } from "glob";
import * as fs from "fs/promises";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as github from "@actions/github";

export const main = async () => {
  const version = core.getInput("version", { required: true });
  const pr = core.getInput("pr");
  const isComment = core.getBooleanInput("is_comment");
  const githubToken = core.getInput("github_token", { required: true });

  const octokit = github.getOctokit(githubToken);
  const { owner, repo } = github.context.repo;

  const baseRevision = (
    await exec.getExecOutput("git", ["rev-parse", "HEAD"])
  ).stdout.trim();

  let branch = `release-${version}`;
  if (version === "latest" || version.startsWith("pr/")) {
    branch = version;
  }
  core.setOutput("branch", branch);

  const distDirs = await glob("**/dist", {
    ignore: ["node_modules/**", ".git/**"],
  });
  if (distDirs.length > 0) {
    await exec.exec("git", ["add", "-f", ...distDirs]);
  }

  const fixedFiles = await fixActionVersions(version, owner, repo);

  const currentBranch = (
    await exec.getExecOutput("git", ["branch", "--show-current"])
  ).stdout.trim();

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

  await exec.exec("aqua", [
    "-c",
    `${process.env.GITHUB_ACTION_PATH}/aqua/aqua.yaml`,
    "exec",
    "--",
    "ghcp",
    "commit",
    "-r",
    `${owner}/${repo}`,
    "--parent",
    currentBranch,
    "-b",
    branch,
    "-m",
    `chore: release ${version}\nbase revision: ${baseRevision}`,
  ].concat(fixedFiles), {
    env: {
      ...process.env,
      GITHUB_TOKEN: githubToken,
    },
  });

  if (pr && version.startsWith("v")) {
    await exec.exec("aqua", [
      "-c",
      `${process.env.GITHUB_ACTION_PATH}/aqua/aqua.yaml`,
      "exec",
      "--",
      "github-comment",
      "post",
      "-config",
      `${process.env.GITHUB_ACTION_PATH}/github-comment.yaml`,
      "-var",
      `repo:${process.env.GITHUB_SERVER_URL}/${owner}/${repo}`,
      "-pr",
      pr,
      "-k",
      "pre-release",
      "-var",
      `tag:${version}`,
    ], {
      env: {
        ...process.env,
        GITHUB_TOKEN: githubToken,
      },
    });
  }

  if (version.startsWith("pr/") && isComment) {
    const prNumber = version.substring(3);
    await exec.exec("aqua", [
      "-c",
      `${process.env.GITHUB_ACTION_PATH}/aqua/aqua.yaml`,
      "exec",
      "--",
      "github-comment",
      "post",
      "-config",
      `${process.env.GITHUB_ACTION_PATH}/github-comment.yaml`,
      "-pr",
      prNumber,
      "-k",
      "create-pr-branch",
      "-var",
      `repo:${process.env.GITHUB_SERVER_URL}/${owner}/${repo}`,
      "-var",
      `pr:${prNumber}`,
    ], {
      env: {
        ...process.env,
        GITHUB_TOKEN: githubToken,
      },
    });
  }
};

async function fixActionVersions(
  version: string,
  owner: string,
  repo: string,
): Promise<string[]> {
  const actionFiles = (await exec.getExecOutput("git", ["ls-files"]))?.stdout
    .trim()
    .split("\n")
    .filter(
      (file) => file.endsWith("action.yml") || file.endsWith("action.yaml"),
    );
  if (actionFiles.length === 0) {
    return [];
  }
  const modifiedFiles: string[] = [];
  const re = new RegExp(`uses: ${owner}/${repo}/(.*)@main`);
  for (const file of actionFiles) {
    const content = await fs.readFile(file, "utf-8");
    const newContent = content.replace(
      re,
      `uses: ${owner}/${repo}/$1@${version}`,
    );
    if (content !== newContent) {
      await fs.writeFile(file, newContent);
      modifiedFiles.push(file);
    }
  }
  return modifiedFiles;
}
