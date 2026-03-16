export type ProcessRunJobData = {
  githubRunId: number;
  repoId: string;
  installationId: number;
};

export type SyncInstallationJobData = {
  action: "created" | "deleted";
  installationId: number;
  githubOrgId: number;
  githubOrgLogin: string;
  repositoryIds?: number[];
  repositoryFullNames?: string[];
};
