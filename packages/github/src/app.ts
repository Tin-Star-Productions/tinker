import { App } from "@octokit/app";

export type GitHubAppConfig = {
  appId: string;
  privateKey: string;
  webhookSecret: string;
  clientId: string;
  clientSecret: string;
};

/**
 * Creates and returns a singleton GitHub App instance.
 * Call once at process startup; reuse the returned `app` everywhere.
 */
export function createGitHubApp(config: GitHubAppConfig): App {
  return new App({
    appId: config.appId,
    privateKey: config.privateKey,
    webhooks: { secret: config.webhookSecret },
    oauth: {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    },
  });
}

/**
 * Returns an Octokit client authenticated as a specific installation.
 * Use this when making API calls on behalf of an installed org/repo.
 */
export async function getInstallationOctokit(
  app: App,
  installationId: number
) {
  return app.getInstallationOctokit(installationId);
}
