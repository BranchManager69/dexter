Token AI as a Git Subtree

Overview
- Parent repo: BranchManager69/degenduel
- Subtree folder: token-ai/
- Separate repo (new): BranchManager69/token-ai

Initial Split (already done)
- Create split branch: `git subtree split --prefix=token-ai -b token-ai-history`
- Create GitHub repo: `gh repo create BranchManager69/token-ai --private --description "Token AI agent + socials orchestrator (split from BranchManager69/degenduel)" --disable-issues --disable-wiki`
- Add remote (HTTPS recommended): `git remote add tokenai https://github.com/BranchManager69/token-ai.git`
- Push split history: `git push -u tokenai token-ai-history:main`
- Optional cleanup: `git branch -D token-ai-history`

Day‑to‑Day Sync
- Push parent → token-ai repo:
  - One‑liner: `git subtree push --prefix=token-ai tokenai main`
  - Or (more explicit): `git push tokenai $(git subtree split --prefix=token-ai HEAD):main`

- Pull token-ai repo → parent (update folder):
  - `git subtree pull --prefix=token-ai tokenai main --squash`

Remotes & Auth
- See remotes: `git remote -v`
- If you added SSH remote but don’t have SSH keys, switch to HTTPS:
  - `git remote set-url tokenai https://github.com/BranchManager69/token-ai.git`
  - `gh auth setup-git` (configures credential helper for HTTPS pushes)

Notes
- Subtree uses committed history. Commit changes in the parent before pushing.
- token-ai currently reads config from the parent (e.g., ../../config/prisma.js). For standalone use, provide equivalent env/config or add a small shim.

