# Repository Agent Guide

## Purpose
This repository contains a Discord meme retrieval system with three runnable workspaces:
- `bot`
- `api`
- `dashboard`

The shared operational docs live under `docs/`. Keep them current whenever a runtime contract, command, folder shape, or environment variable changes.

## Package Manager
- Use `yarn`.
- Do not introduce `npm`, `pnpm`, or `bun` lockfiles.

## Workspace Commands
- Install: `yarn install`
- API dev: `yarn dev:api`
- Bot dev: `yarn dev:bot`
- Dashboard dev: `yarn dev:dashboard`
- Chroma dev: `yarn dev:chroma`
- Register slash commands: `yarn register:commands`
- Full validation: `yarn typecheck && yarn test && yarn build`

## Implementation Rules
- Keep the ML pipeline API-centric.
- Keep the dashboard aligned with the `vite-react-boilerplate` folder shape: `app`, `routes`, `features`, `components`, `lib`, `store`.
- Prefer explicit logging and graceful error handling around Discord, Chroma, and Python worker boundaries.
- Keep `.env.example` in sync with real runtime needs.
- Keep `README.md` and `docs/` aligned with actual commands and file paths.

## Testing Expectations
- Add or update unit tests for segmentation logic, queue behavior, contextual tagging, and route contracts when behavior changes.
- Run focused workspace checks while iterating, then run root validation before closing the task.

## Documentation Rule
If any of the following change, update documentation in the same task:
- public API routes
- environment variables
- local startup commands
- folder structure
- slash command behavior
- similarity or segmentation semantics
