import type { NextApiRequest, NextApiResponse } from "next";

type VersionResponse = {
  ok: true;
  now: string;
  commitSha: string | null;
  branch: string | null;
  railway: {
    gitCommitSha: string | null;
    gitBranch: string | null;
    deploymentId: string | null;
    environmentName: string | null;
    serviceName: string | null;
  };
  github: {
    sha: string | null;
    ref: string | null;
  };
  vercel: {
    gitCommitSha: string | null;
    gitCommitRef: string | null;
  };
  node: {
    version: string;
  };
};

export default function handler(
  _req: NextApiRequest,
  res: NextApiResponse<VersionResponse>,
) {
  res.setHeader("Cache-Control", "no-store, max-age=0");

  const railwayGitCommitSha = process.env.RAILWAY_GIT_COMMIT_SHA ?? null;
  const railwayGitBranch = process.env.RAILWAY_GIT_BRANCH ?? null;

  const githubSha = process.env.GITHUB_SHA ?? null;
  const githubRef = process.env.GITHUB_REF_NAME ?? process.env.GITHUB_REF ?? null;

  const vercelGitCommitSha = process.env.VERCEL_GIT_COMMIT_SHA ?? null;
  const vercelGitCommitRef = process.env.VERCEL_GIT_COMMIT_REF ?? null;

  res.status(200).json({
    ok: true,
    now: new Date().toISOString(),
    commitSha: railwayGitCommitSha ?? githubSha ?? vercelGitCommitSha ?? null,
    branch: railwayGitBranch ?? githubRef ?? vercelGitCommitRef ?? null,
    railway: {
      gitCommitSha: railwayGitCommitSha,
      gitBranch: railwayGitBranch,
      deploymentId: process.env.RAILWAY_DEPLOYMENT_ID ?? null,
      environmentName: process.env.RAILWAY_ENVIRONMENT_NAME ?? null,
      serviceName: process.env.RAILWAY_SERVICE_NAME ?? null,
    },
    github: {
      sha: githubSha,
      ref: githubRef,
    },
    vercel: {
      gitCommitSha: vercelGitCommitSha,
      gitCommitRef: vercelGitCommitRef,
    },
    node: {
      version: process.version,
    },
  });
}

