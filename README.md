# GitHub Pull & Multi-Account Deployer

A multi-account GitHub repository manager, folder deployer, ZIP extractor, and Git clone automation dashboard with real-time log streaming.

Migrated from Python (`github.py`) to a modern Node.js full-stack React + Express + Vite architecture.

## Features

- **Multi-Account GitHub Support**: Connect multiple GitHub accounts using Personal Access Tokens (`GH_TOKENS`), inspect rate limits, switch between accounts seamlessly, and test new tokens.
- **Auto Deploy Folder**: Select any workspace or local folder, initialize Git, configure user credentials, create remote GitHub repository automatically if missing, commit, and push.
- **Unzip & Deploy ZIP**: Drag-and-drop ZIP archive upload, automatic extraction, directory flattening, junk file cleanup (`.DS_Store`, `__pycache__`, etc.), and direct push to GitHub.
- **Clone / Pull Repositories**: Clone public or private repositories into the workspace or run `git pull` if the directory already exists.
- **Repository Manager**: Explore repositories with search, visibility filtering (Public / Private / Forks), clone URL copy, and safe deletion confirmation modals.
- **Real-Time Live Logs**: Terminal stream for live command execution with colored ANSI logging, autoscroll, and copy actions.
- **WebSocket Streaming**: Integrated WebSocket server at `/ws` on port 3000.
- **Telegram Bot Integration**: Supports `TELEGRAM_BOT_TOKEN` for status checks and notifications.

## Getting Started

1. Set your GitHub tokens in environment variables (`GH_TOKENS=ghp_...`) or add them directly in the UI under **Accounts & Bot**.
2. Run `npm run dev` to start the server and dashboard on port 3000.
