# Ubuntu Release Stability Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the repository so the Ubuntu-targeted app can install from source cleanly, pass current lint/typecheck checks, keep key profile import behavior working, and publish a new GitHub version without altering prior releases.

**Architecture:** Keep the existing Electron + React + TypeScript structure intact and make focused fixes at the seams where the current repo is broken: profile import IPC/data flow, package manager lifecycle scripts, type drift, and release/version metadata. Avoid broad refactors. Verify by running the repository's existing checks plus targeted regression commands.

**Tech Stack:** Electron, electron-vite, React, TypeScript, pnpm, ESLint, GitHub releases

---

## Chunk 1: Branch And Guardrails

### Task 1: Capture baseline state and create a fix branch

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `docs/superpowers/plans/2026-04-12-ubuntu-release-stability.md`

- [ ] **Step 1: Record baseline repo state**

Run: `git status --short --branch && git remote -v`
Expected: current branch, pending lockfile change from prior verification, and GitHub origin visible

- [ ] **Step 2: Create a dedicated branch for the repair**

Run: `git checkout -b fix/ubuntu-release-stability`
Expected: branch switches cleanly without altering prior history

- [ ] **Step 3: Reconfirm current failures before implementation**

Run: `./node_modules/.bin/tsc --noEmit -p tsconfig.node.json --composite false`
Expected: FAIL with the current main-process type errors

Run: `./node_modules/.bin/tsc --noEmit -p tsconfig.web.json --composite false`
Expected: FAIL with the current renderer type error around URI import

Run: `./node_modules/.bin/eslint . --ext .js,.jsx,.cjs,.mjs,.ts,.tsx,.cts,.mts`
Expected: FAIL with current lint errors

## Chunk 2: Import And Type Drift Fixes

### Task 2: Repair URI import data flow

**Files:**

- Modify: `src/renderer/src/components/profiles/uri-import-modal.tsx`
- Modify: `src/shared/types.d.ts`
- Modify: `src/main/config/profile.ts`
- Test: targeted typecheck and lint commands for touched files

- [ ] **Step 1: Confirm failing renderer type check**

Run: `./node_modules/.bin/tsc --noEmit -p tsconfig.web.json --composite false`
Expected: FAIL citing `rawContent` missing on `Partial<IProfileItem>`

- [ ] **Step 2: Implement the minimal contract for pasted URI content**

Make these changes:

- extend the shared profile item type with a field used only during creation for pasted content
- update the renderer import modal to pass the correct field and satisfy lint rules
- update profile creation logic so local imports prefer pasted content when present and still support file-based local imports

- [ ] **Step 3: Re-run renderer checks**

Run: `./node_modules/.bin/tsc --noEmit -p tsconfig.web.json --composite false`
Expected: PASS

Run: `./node_modules/.bin/eslint src/renderer/src/components/profiles/uri-import-modal.tsx src/main/config/profile.ts src/shared/types.d.ts --ext .ts,.tsx`
Expected: PASS

### Task 3: Fix main-process type drift and unused code errors

**Files:**

- Modify: `src/main/services/SubscriptionService.ts`
- Modify: `src/shared/types.d.ts`
- Modify: `scripts/prepare.mjs`

- [ ] **Step 1: Confirm failing node type check**

Run: `./node_modules/.bin/tsc --noEmit -p tsconfig.node.json --composite false`
Expected: FAIL on `SysProxyMode` mismatch and unused imports/variables

- [ ] **Step 2: Implement minimal fixes**

Make these changes:

- remove dead imports
- align `SysProxyMode` checks with the actual shared type or expand the type only if the UI and config support it consistently
- remove or intentionally wire unused prepare helpers so ESLint no longer fails

- [ ] **Step 3: Re-run node checks**

Run: `./node_modules/.bin/tsc --noEmit -p tsconfig.node.json --composite false`
Expected: PASS

Run: `./node_modules/.bin/eslint src/main/services/SubscriptionService.ts scripts/prepare.mjs src/shared/types.d.ts --ext .ts,.mjs`
Expected: PASS

## Chunk 3: Package And Lifecycle Repair

### Task 4: Make install/prepare lifecycle scripts reliable

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Reproduce lifecycle weakness**

Run: `corepack pnpm install --frozen-lockfile`
Expected: FAIL before the fixes due to lockfile mismatch or lifecycle issues

- [ ] **Step 2: Apply the minimal packaging fixes**

Make these changes:

- replace recursive `pnpm` script invocations inside lifecycle hooks with direct `node` commands where appropriate
- ensure lockfile matches `package.json`
- keep the documented Ubuntu build flow (`install -> prepare -> build:linux`) intact

- [ ] **Step 3: Re-run installation checks**

Run: `corepack pnpm install --frozen-lockfile`
Expected: PASS

## Chunk 4: Whole-Repo Verification

### Task 5: Run full repository checks after fixes

**Files:**

- Modify: any files required by prior tasks only

- [ ] **Step 1: Run type checks**

Run: `./node_modules/.bin/tsc --noEmit -p tsconfig.node.json --composite false`
Expected: PASS

Run: `./node_modules/.bin/tsc --noEmit -p tsconfig.web.json --composite false`
Expected: PASS

- [ ] **Step 2: Run lint**

Run: `./node_modules/.bin/eslint . --ext .js,.jsx,.cjs,.mjs,.ts,.tsx,.cts,.mts`
Expected: PASS

- [ ] **Step 3: Run repository review command**

Run: `./node_modules/.bin/prettier --check package.json src/main/services/SubscriptionService.ts src/main/config/profile.ts src/renderer/src/components/profiles/uri-import-modal.tsx scripts/prepare.mjs src/shared/types.d.ts`
Expected: PASS

## Chunk 5: Version, Git, And Release

### Task 6: Publish a new preserved version

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json` if regeneration changes it
- Modify: `pnpm-lock.yaml`
- Optionally modify: `changelog.md`

- [ ] **Step 1: Bump patch version for the repaired release**

Update version metadata from `1.0.0` to the next patch release, unless the repo already uses another in-flight version.

- [ ] **Step 2: Re-run lockfile/version-sensitive checks**

Run: `corepack pnpm install --frozen-lockfile`
Expected: PASS with version metadata aligned

- [ ] **Step 3: Commit the repair**

Run: `git add ... && git commit -m "fix: stabilize ubuntu build and release flow"`
Expected: clean commit on the dedicated branch

- [ ] **Step 4: Push the branch**

Run: `git push -u origin fix/ubuntu-release-stability`
Expected: remote branch created while `main` and old releases remain untouched

- [ ] **Step 5: Tag the new release**

Run: `git tag v1.0.1 && git push origin v1.0.1`
Expected: new tag published without deleting or mutating prior tags/releases

- [ ] **Step 6: Report release outcome**

Capture:

- pushed branch name
- new tag
- commands used for verification
- any remaining risks if GitHub release artifacts still require Actions to complete
