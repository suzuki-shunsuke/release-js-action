import { glob } from "glob";
import * as fs from "fs/promises";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as github from "@actions/github";
import * as commit from "@suzuki-shunsuke/commit-ts";
import { basename, dirname } from "path";
import * as yaml from "js-yaml";
import { z } from "zod";

const Action = z.object({
  runs: z.optional(z.object({
    steps: z.optional(z.array(z.object({
      uses: z.optional(z.string()),
    }))),
  })),
});
type Action = z.infer<typeof Action>;

const waitAfterCommit = () => new Promise(resolve => setTimeout(resolve, 1000));

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
      message:
        `chore: prepare release ${version}\nbase revision: ${baseRevision}`,
      baseSHA: sha,
      files: distFiles.concat(files).filter(f => f !== ""),
    } as commit.Options);
    sha = result?.commit.sha || baseRevision;
    await waitAfterCommit();
  }

  sha = await fixActionVersions(
    octokit,
    version,
    owner,
    repo,
    branch,
    baseRevision,
    sha,
  );
  core.setOutput("sha", sha);

  if (pr && version.startsWith("v")) {
    await exec.exec("aqua", [
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
    ], {
      env: {
        ...process.env,
        GITHUB_TOKEN: githubToken,
      },
    });
  }
};

const deleteBranch = async (
  octokit: commit.GitHub,
  branch: string,
) => {
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

const listActionFiles = async () => {
  return (await exec.getExecOutput("git", ["ls-files"], {
    silent: true,
  }))?.stdout
    .trim()
    .split("\n")
    .filter(
      (file: string) => {
        const base = basename(file);
        return base === "action.yml" || base === "action.yaml";
      },
    );
};

type ActionFile = {
  content: string;
  path: string;
  name: string;
  dependencies: Set<string>;
};

const readActionFile = async (
  repo: string,
  file: string,
  pattern: RegExp,
): Promise<ActionFile> => {
  const dir = dirname(file);
  const content = await fs.readFile(file, "utf-8");
  const action = Action.parse(yaml.load(content));
  const actions = new Set<string>();
  for (const step of action.runs?.steps ?? []) {
    if (!step.uses) {
      continue;
    }
    const found = step.uses.match(pattern);
    if (found === null) {
      continue;
    }
    actions.add(found[1]);
  }
  return {
    content,
    path: file,
    name: dir === "." ? repo : `${repo}/${dir}`,
    dependencies: actions,
  };
};

const fixActionVersions = async (
  octokit: commit.GitHub,
  version: string,
  owner: string,
  repo: string,
  branch: string,
  baseSHA: string,
  sha: string,
): Promise<string> => {
  const actionFiles = await listActionFiles();
  if (actionFiles.length === 0) {
    core.info("No action files found, skipping version pinning.");
    return sha;
  }
  const repoFullName = `${owner}/${repo}`;

  const actionPattern = new RegExp(`^(${repoFullName}(?:/.*)?)@main$`);
  const actions: ActionFile[] = [];
  for (const file of actionFiles) {
    const action = await readActionFile(repoFullName, file, actionPattern);
    core.info(`action name=${action.name} path=${action.path} dependencies=${JSON.stringify([...action.dependencies])}`);
    actions.push(action);
  }
  while (true) {
    const changedFiles = new Set<string>();
    const pinnedActions = new Set<string>();
    for (const action of actions) {
      if (action.dependencies.size !== 0) {
        continue;
      }
      pinnedActions.add(action.name);
      // action does not depend on other actions
      // So pin the action
      for (const act of actions) {
        if (!act.dependencies.has(action.name)) {
          continue;
        }
        // act depends on action
        // Fix content and remove action from dependencies
        core.info(`Pinning action ${action.name} to ${sha}`);
        act.content = act.content.replaceAll(
          `uses: ${action.name}@main`,
          `uses: ${action.name}@${sha}`,
        );
        changedFiles.add(act.path);
      }
    }
    if (changedFiles.size === 0) {
      break;
    }
    // Fix files
    for (const act of actions) {
      if (changedFiles.has(act.path)) {
        core.info(`Updating action file ${act.path}`);
        await fs.writeFile(act.path, act.content, "utf-8");
      }
    }
    for (const pinnedAction of pinnedActions) {
      for (const action of actions) {
        action.dependencies.delete(pinnedAction);
      }
    }
    // create a commit
    const result = await commit.createCommit(octokit, {
      owner,
      repo,
      branch,
      message: `chore: prepare release ${version}\nbase revision: ${baseSHA}`,
      baseBranch: branch,
      baseSHA: sha,
      files: [...changedFiles],
    });
    sha = result?.commit.sha || sha;
    await waitAfterCommit();
  }
  return sha;
};
