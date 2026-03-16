/**
 * GitHub OAuth helpers for user authentication.
 *
 * Flow:
 *  1. Redirect user to `getAuthorizationUrl(state)`
 *  2. GitHub calls back to /api/auth/github/callback?code=...&state=...
 *  3. Exchange code for access token via `exchangeCodeForToken(code)`
 *  4. Fetch user info via `getAuthenticatedUser(accessToken)`
 */

const GITHUB_OAUTH_BASE = "https://github.com";
const GITHUB_API_BASE = "https://api.github.com";

export type OAuthConfig = {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
};

export type GitHubUser = {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatarUrl: string;
};

export type OAuthTokenResponse = {
  accessToken: string;
  tokenType: string;
  scope: string;
};

/**
 * Returns the GitHub OAuth authorization URL to redirect the user to.
 */
export function getAuthorizationUrl(config: OAuthConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.callbackUrl,
    scope: "read:user user:email read:org",
    state,
  });
  return `${GITHUB_OAUTH_BASE}/login/oauth/authorize?${params.toString()}`;
}

/**
 * Exchanges the OAuth callback code for an access token.
 */
export async function exchangeCodeForToken(
  config: OAuthConfig,
  code: string
): Promise<OAuthTokenResponse> {
  const response = await fetch(`${GITHUB_OAUTH_BASE}/login/oauth/access_token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.callbackUrl,
    }),
  });

  if (!response.ok) {
    throw new Error(`GitHub OAuth token exchange failed: ${response.status}`);
  }

  const data = (await response.json()) as Record<string, string>;

  if (data["error"]) {
    throw new Error(`GitHub OAuth error: ${data["error_description"] ?? data["error"]}`);
  }

  return {
    accessToken: data["access_token"] ?? "",
    tokenType: data["token_type"] ?? "bearer",
    scope: data["scope"] ?? "",
  };
}

/**
 * Returns the authenticated GitHub user's profile.
 */
export async function getAuthenticatedUser(accessToken: string): Promise<GitHubUser> {
  const response = await fetch(`${GITHUB_API_BASE}/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub user fetch failed: ${response.status}`);
  }

  const data = (await response.json()) as Record<string, unknown>;

  return {
    id: data["id"] as number,
    login: data["login"] as string,
    name: (data["name"] as string | null) ?? null,
    email: (data["email"] as string | null) ?? null,
    avatarUrl: data["avatar_url"] as string,
  };
}
