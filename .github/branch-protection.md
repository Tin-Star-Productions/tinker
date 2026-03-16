# Branch Protection Rules

Apply these settings in GitHub → Settings → Branches.

## `main` branch

- ✅ Require a pull request before merging
  - Required approvals: **1**
  - Dismiss stale reviews when new commits are pushed
- ✅ Require status checks to pass before merging
  - Required checks: `lint`, `test`, `build`
  - Require branches to be up to date before merging
- ✅ Require conversation resolution before merging
- ✅ Do not allow bypassing the above settings
- ✅ Restrict who can push to matching branches (admins only)

## `staging` branch

- ✅ Require a pull request before merging
  - Required approvals: **1**
- ✅ Require status checks to pass before merging
  - Required checks: `lint`, `test`, `build`
- ✅ Do not allow bypassing the above settings

## All branches

- ✅ Require signed commits (recommended once team is set up with GPG)
