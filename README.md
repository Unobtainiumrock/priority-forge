# Priority Forge

[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Node.js 20+](https://img.shields.io/badge/node-20+-blue.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![GitHub release](https://img.shields.io/github/v/release/Unobtainiumrock/priority-forge?include_prereleases&sort=semver)](https://github.com/Unobtainiumrock/priority-forge/releases)
[![GitHub Actions CI](https://img.shields.io/github/actions/workflow/status/Unobtainiumrock/priority-forge/coverage.yml?branch=main&label=CI)](https://github.com/Unobtainiumrock/priority-forge/actions/workflows/coverage.yml)
[![codecov](https://codecov.io/gh/Unobtainiumrock/priority-forge/branch/main/graph/badge.svg)](https://codecov.io/gh/Unobtainiumrock/priority-forge)
[![Maintained](https://img.shields.io/badge/Maintained-yes-green.svg)](https://github.com/Unobtainiumrock/priority-forge/graphs/commit-activity)
[![GitHub issues](https://img.shields.io/github/issues/Unobtainiumrock/priority-forge.svg)](https://github.com/Unobtainiumrock/priority-forge/issues)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/Unobtainiumrock/priority-forge.svg)](https://github.com/Unobtainiumrock/priority-forge/pulls)

HTTP-based MCP server for cross-project task prioritization with heap-based priority scoring and auto-generated markdown output.

---

## Table of Contents

- [What is this and why should I use it?](#what-is-this-and-why-should-i-use-it)
- [Quick Start](#quick-start)
- [Features](#features)
- [Universal Task Tracking (V2.1)](#universal-task-tracking-v21)
- [MCP Integration](#mcp-integration)
- [Agent Rules](#agent-rules)
- [REST API Endpoints](#rest-api-endpoints)
- [MCP Protocol Support](#mcp-protocol-support)
- [V2 Priority Scoring](#v2-priority-scoring)
  - [Dynamic Rebalancing (V3)](#dynamic-rebalancing-v3)
- [Data Storage](#data-storage)
- [Workspaces (V4)](#workspaces-v4)
- [Scripts](#scripts)
- [Windows Support](#windows-support)
- [Environment Variables](#environment-variables)
- [Team Deployment](#team-deployment)
- [Troubleshooting](#troubleshooting)
- [V3 ML Training Data](#v3-ml-training-data)
- [Roadmap](#roadmap)
- [License](#license)

**📚 Additional Documentation:**
- [ML Architecture & Training Pipeline](docs/ML_ARCHITECTURE.md) — Detailed guide to the learning system, data collection, and model architecture

---

## What is this and why should I use it?

**The Problem:** When you're working with AI coding assistants (Claude, Cursor, etc.) across multiple projects, things slip through the cracks. You mention "we should fix that bug" in passing, but nobody tracks it. You finish a task but forget to mark it done. You have three projects with scattered TODO lists and no unified view of what's most important.

**The Solution:** Priority Forge is a task tracking server that your AI assistant connects to. Once connected, the AI:

- **Proactively captures tasks** from your conversations—you don't have to say "add this to the tracker"
- **Always knows what's most important** via a smart priority queue that weighs blocking dependencies, deadlines, and cross-project impact
- **Tracks task completion** so you build a history of how long things actually take (used to train smarter prioritization later)
- **Works across all your projects** with a single centralized source of truth

**Why this approach?** Traditional task trackers require you to context-switch: stop coding, open Jira/Linear/Notion, write a ticket, go back to coding. With Priority Forge, the AI does the tracking *while* you work. It's ambient task management—always on, never in the way.

**Works everywhere:** Because it uses the open MCP protocol, it works with Cursor, Claude Desktop, Droid, Claude Code, and any other MCP-compatible tool. No vendor lock-in.

---

## Quick Start

### One-Command Setup (Recommended)

```bash
# Clone the repo
git clone git@github.com:Unobtainiumrock/priority-forge.git
cd priority-forge

# Run the setup script - handles everything!
bash setup.sh
```

The setup script will:
1. Check for and install prerequisites (Node.js via Homebrew or nvm)
2. Install npm dependencies
3. Initialize your task database
4. **Interactively configure your AI tool** (Cursor, Droid, or Claude Code)
5. Verify everything works

### Manual Setup

If you prefer manual control:

```bash
# Clone the repo
git clone git@github.com:Unobtainiumrock/priority-forge.git
cd priority-forge

# Install dependencies
npm install

# Initialize your database (creates example project/task)
npm run seed

# Configure MCP for your AI tool (interactive)
npm run setup:mcp

# Start the server
npm run dev

# Verify everything works (optional)
npm run verify
```

Server runs at `http://localhost:3456`

> **Note**: The `data/progress.json` file is gitignored - each user maintains their own task database. Run the seed script to create your initial database.

---

## Features

- **V2 Heap-Based Priority Queue**: Weighted priority scoring with tunable heuristics
- **V2.1 Universal Coverage**: MCP Resources + Prompts work with ANY MCP client (Cursor, Droid, Claude Desktop, Claude Code)
- **Priority Factors**: Blocking count, cross-project impact, time sensitivity, effort/value ratio, dependency depth
- **Auto-generated Markdown**: Human-readable `PROGRESS_TRACKER.md` regenerated on every write
- **MCP Protocol**: JSON-RPC 2.0 endpoint for AI assistant integration
- **REST API**: Full CRUD operations for all entities
- **V3 Ready**: Context switch tracking for future ML-based priority optimization

##  Universal Task Tracking (V2.1)

The server provides **automatic context injection** via MCP Resources and Prompts that work with ANY MCP-compliant client:

### MCP Resources (Automatic Context)

| Resource URI | Purpose |
|--------------|---------|
| `progress://current-focus` | **READ FIRST** - Top priority task + active/blocked items |
| `progress://task-protocol` | Required protocol for task lifecycle management |
| `progress://full-queue` | Complete sorted task list (JSON) |

### MCP Prompts (Workflow Templates)

| Prompt | Purpose |
|--------|---------|
| `start_session` | Initialize work with proper task tracking |
| `complete_work` | Close out task with completion tracking |
| `switch_context` | Properly handle task switching |

### How Universal Coverage Works

1. **Initialize Response**: Server returns `instructions` field that guides AI behavior
2. **Resources**: Any client can call `resources/list` and `resources/read` to get context
3. **Tool Response Enhancement**: Every tool response includes protocol reminders
4. **Prompts**: Clients can use workflow templates via `prompts/list` and `prompts/get`

### REST Access (for testing)

```bash
# See current focus
curl http://localhost:3456/resources/current-focus

# Read protocol
curl http://localhost:3456/resources/protocol
```

This ensures 100% coverage regardless of which MCP client you use (Cursor, Droid, Claude Code, Claude Desktop, etc.).

## MCP Integration

If you used `./setup.sh` or `npm run setup:mcp`, MCP is already configured! Otherwise, configure manually:

<details>
<summary>Manual MCP Configuration (click to expand)</summary>

### Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "priority-forge": {
      "url": "http://localhost:3456/mcp"
    }
  }
}
```

Then restart Cursor completely.

### Droid (Factory CLI)

Add to `~/.factory/mcp.json`:

```json
{
  "mcpServers": {
    "priority-forge": {
      "type": "http",
      "url": "http://localhost:3456/mcp"
    }
  }
}
```

Then restart Droid or use `/mcp` to verify the connection.

### Claude Code CLI

Add to `~/.claude/mcp.json`:

```json
{
  "mcpServers": {
    "priority-forge": {
      "type": "http",
      "url": "http://localhost:3456/mcp"
    }
  }
}
```

Then restart Claude Code.

</details>

## Agent Rules

If you used `./setup.sh` or `npm run setup:mcp`, agent rules are already configured!

The setup script automatically copies the agent rules to the correct location for your AI tool. This is **critical** - without agent rules, the AI won't proactively check the tracker at session start.

### Configuration Summary

Here's a quick reference for all configuration file locations:

| Tool | MCP Config Location | Agent Rules Location |
|------|---------------------|----------------------|
| **Cursor** | `~/.cursor/mcp.json` | `~/.cursorrules` (global) or `.cursorrules` (project) |
| **Droid** | `~/.factory/mcp.json` | `~/.factory/AGENTS.md` |
| **Claude Code** | `~/.claude/mcp.json` | `~/.claude/AGENTS.md` |

<details>
<summary>Manual Agent Rules Configuration (click to expand)</summary>

Copy the contents of [`AGENT_RULES.md`](./AGENT_RULES.md) to the appropriate agent rules location above.

</details>

## REST API Endpoints

### Core Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check (includes version) |
| GET | `/status` | Full system status with top priority |

### V2 Priority Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/top-priority` | Single highest priority task |
| POST | `/recalculate` | Recalculate all priority scores |
| GET | `/heuristic-weights` | View weight configuration |
| PUT | `/heuristic-weights` | Update weights & recalculate |

### Projects

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/projects` | List all projects |
| GET | `/projects/:id` | Get project by ID |
| POST | `/projects` | Create project |
| PUT | `/projects/:id` | Update project |
| DELETE | `/projects/:id` | Delete project |

### Tasks

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/tasks` | List all tasks (sorted by priority score) |
| GET | `/tasks/top` | Get top priority task |
| GET | `/tasks/:id` | Get task by ID |
| GET | `/tasks/priority/:level` | Filter tasks by P0/P1/P2/P3 |
| GET | `/tasks/project/:projectId` | Filter tasks by project |
| POST | `/tasks` | Create task |
| PUT | `/tasks/:id` | Update task |
| DELETE | `/tasks/:id` | Delete task |
| POST | `/tasks/:id/complete` | Mark task complete with outcome |
| POST | `/tasks/:id/context-switch` | Log context switch (V3 training) |

### Data Gaps & Decisions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/data-gaps` | List data collection gaps |
| POST | `/data-gaps` | Create data gap |
| PUT | `/data-gaps/:id` | Update data gap |
| DELETE | `/data-gaps/:id` | Delete data gap |
| GET | `/decisions` | List decisions |
| POST | `/decisions` | Log a decision |

### MCP

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/mcp` | MCP JSON-RPC 2.0 endpoint |

## MCP Protocol Support

Once connected, your AI assistant has access to tools, resources, and prompts:

### Resources (V2.1 - Automatic Context)

| Method | Description |
|--------|-------------|
| `resources/list` | List available resources |
| `resources/read` | Read resource content by URI |

### Prompts (V2.1 - Workflow Templates)

| Method | Description |
|--------|-------------|
| `prompts/list` | List available prompts |
| `prompts/get` | Get prompt with arguments |

### Core Tools

| Tool | Description |
|------|-------------|
| `get_status` | Get full system status (projects, tasks, gaps, decisions, top priority) |
| `get_priorities` | Get all tasks sorted by priority, optionally filter by level |
| `get_project` | Get details for a specific project by ID or name |
| `create_task` | Create a new task in the priority queue |
| `update_task` | Update an existing task's priority, status, or details |
| `complete_task` | Mark a task as completed/cancelled/deferred |
| `get_data_gaps` | Get all identified data collection gaps |
| `log_decision` | Record an architectural or design decision |
| `create_project` | Register a new project with the task tracker |
| `suggest_tasks` | Analyze text and suggest potential tasks to create |

### V2 Tools

| Tool | Description |
|------|-------------|
| `get_top_priority` | Get single highest priority task with score explanation |
| `recalculate_priorities` | Recalculate all priority scores |
| `get_heuristic_weights` | View current weight configuration |
| `update_heuristic_weights` | Update weights and recalculate all priorities |

### V3 Training Tools

| Tool | Description |
|------|-------------|
| `log_context_switch` | Log when switching away from a task (training data) |
| `log_task_selection` | Log when user selects a task to work on |
| `export_training_data` | Export all ML training data for XGBoost |
| `get_ml_summary` | Get summary statistics of collected training data |

## V2 Priority Scoring

Tasks are scored using a weighted formula. **Lower score = higher priority**.

### Heuristic Weights (Default)

| Factor | Weight | Description |
|--------|--------|-------------|
| `blocking` | 10.0 | Tasks that unblock other work |
| `crossProject` | 5.0 | Tasks affecting multiple projects |
| `timeSensitive` | 8.0 | Deadline proximity |
| `effortValue` | 3.0 | Quick wins vs long slogs |
| `dependency` | 2.0 | Depth in dependency chain |

### Task Weights (Per Task)

| Factor | Range | Description |
|--------|-------|-------------|
| `blockingCount` | 0-10 | How many tasks this blocks |
| `crossProjectImpact` | 0-1 | Affects multiple projects? |
| `timeSensitivity` | 0-10 | 10 = overdue, 0 = no deadline |
| `effortValueRatio` | 0-9 | Quick wins score higher |
| `dependencyDepth` | 0-5 | How deep in dependency chain |

### Score Calculation

```
priorityScore = basePriority - (
  blocking × blockingCount +
  crossProject × crossProjectImpact +
  timeSensitive × timeSensitivity +
  effortValue × effortValueRatio +
  dependency × dependencyDepth
)
```

Where `basePriority` is: P0=0, P1=100, P2=200, P3=300

### Dynamic Rebalancing (V3)

**The queue automatically rebalances when the dependency graph changes:**

| Trigger | What Happens |
|---------|--------------|
| Task created with dependencies | All tasks recalculated (blocked tasks get higher priority) |
| Task completed | Dependent tasks' `dependencyDepth` decreases, queue reorders |
| Task deleted | If had dependents, all tasks recalculated |
| Task updated (deps changed) | Full recalculation of affected tasks |
| Heuristic weights changed | All tasks recalculated with new weights |

**Example:** If Task B depends on Task A, and Task C is added which also depends on A:
- Task A's `blockingCount` increases from 1 → 2
- Task A's priority score decreases (higher priority)
- Queue automatically reorders

All rebalancing events are logged for ML training (see V3 Training Data below)

## Data Storage

### V4 Architecture (Workspaces + Global ML)

| File | Purpose | Gitignored |
|------|---------|------------|
| `data/workspaces.json` | Workspace metadata (list, current) | ✅ Yes |
| `data/workspaces/{id}/progress.json` | Per-workspace tasks, projects, decisions | ✅ Yes |
| `data/ml-training.json` | **Global** ML training data (shared across workspaces) | ✅ Yes |
| `data/progress.json` | Legacy database (migrated on first run) | ✅ Yes |
| `data/progress.json.example` | Example database structure | ❌ No |

### Why Global ML Data?

ML training data (`completionRecords`, `taskSelectionEvents`, `dragReorderEvents`, etc.) is stored **globally** rather than per-workspace because:

1. **Training thresholds** - We need ~50+ selection events to train; fragmenting across workspaces makes this harder
2. **User behavior is consistent** - How you prioritize tasks is similar across contexts
3. **Transfer learning** - Patterns like "blocking tasks should be prioritized" are universal

Each ML event is tagged with `workspaceId` for optional filtering if needed.

> Each user maintains their own task database. The example file shows the expected structure.

## Workspaces (V4)

Workspaces allow you to organize tasks into separate contexts (e.g., "Work" vs "Personal", or different clients).

### MCP Tools

| Tool | Description |
|------|-------------|
| `list_workspaces` | List all available workspaces |
| `get_current_workspace` | Get the currently active workspace |
| `create_workspace` | Create a new workspace |
| `switch_workspace` | Switch to a different workspace |
| `delete_workspace` | Delete a workspace (cannot delete current) |
| `seed_workspace` | Seed empty workspace with example data |

### REST Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/workspaces` | List all workspaces |
| `GET` | `/workspaces/current` | Get current workspace |
| `POST` | `/workspaces` | Create workspace |
| `POST` | `/workspaces/:id/switch` | Switch to workspace |
| `DELETE` | `/workspaces/:id` | Delete workspace |

### What's Per-Workspace vs Global

| Per-Workspace | Global (Shared) |
|---------------|-----------------|
| Tasks | Heuristic weights |
| Projects | Completion records |
| Decisions | Selection events |
| Data gaps | Drag reorder events |
| Objectives | Online learner state |

## Scripts

```bash
# Setup & Configuration
bash setup.sh       # Full setup (prerequisites, deps, MCP config)
npm run setup:mcp   # Configure MCP for your AI tool (interactive)
npm run seed        # Initialize/reset database
npm run verify      # Verify setup is working

# Development
npm run dev         # Development with hot reload
npm run build       # Compile TypeScript
npm start           # Production (requires build first)
npm test            # Run tests
```

## Windows Support

Windows is not directly supported. Please use **WSL (Windows Subsystem for Linux)**:

1. Install WSL: https://docs.microsoft.com/en-us/windows/wsl/install
2. Open a WSL terminal
3. Clone and run setup from WSL

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3456` | Server port |

## Team Deployment

For team use with shared tasks, deploy to a shared server:

```json
{
  "mcpServers": {
    "priority-forge": {
      "type": "http",
      "url": "https://your-server.example.com/mcp"
    }
  }
}
```

For individual use, each team member runs their own local instance with their own tasks.

## Troubleshooting

### MCP errors after renaming/moving the directory

If you rename or move the `priority-forge` directory while the server is running, you'll get errors like:

```
ENOENT: no such file or directory, open '.../data/progress.json'
```

**Solution:** Restart the server from the new location:

```bash
# Kill any running server processes
pkill -f "priority-forge" || true

# Start fresh from the new directory
cd /path/to/priority-forge
npm run dev
```

### Server not responding

If `curl http://localhost:3456/health` returns nothing:

1. Check if the server is running: `ps aux | grep priority-forge`
2. Check if port 3456 is in use: `lsof -i :3456`
3. Restart the server: `npm run dev`

### MCP tools not appearing in AI assistant

1. Verify MCP config exists in the correct location for your tool
2. Restart your AI assistant completely (not just reload)
3. Run `npm run verify` to check server health

### MCP server showing wrong name or "Loading tools" stuck

If you previously configured the MCP server with a different name (e.g., `progress-tracker` instead of `priority-forge`), update your config to use the canonical name:

**Cursor** (`~/.cursor/mcp.json`):
```json
{
  "mcpServers": {
    "priority-forge": {
      "url": "http://localhost:3456/mcp"
    }
  }
}
```

**Droid** (`~/.factory/mcp.json`):
```json
{
  "mcpServers": {
    "priority-forge": {
      "type": "http",
      "url": "http://localhost:3456/mcp"
    }
  }
}
```

**Claude Code** (`~/.claude/mcp.json`):
```json
{
  "mcpServers": {
    "priority-forge": {
      "type": "http",
      "url": "http://localhost:3456/mcp"
    }
  }
}
```

After updating, restart your AI tool completely.

> **Note**: The server name in the config (e.g., `"priority-forge"`) is just a display label—it doesn't affect functionality. However, using the canonical name ensures consistency and makes troubleshooting easier.

### MCP Configuration Differences by Tool

| Tool | Config Location | Format | Notes |
|------|-----------------|--------|-------|
| **Cursor** | `~/.cursor/mcp.json` | `{ url }` | No `type` field needed for HTTP |
| **Droid** | `~/.factory/mcp.json` | `{ type, url }` | Requires `"type": "http"` |
| **Claude Code** | `~/.claude/mcp.json` | `{ type, url }` | Requires `"type": "http"` |

Droid and Claude Code require the explicit `"type": "http"` field because they support multiple transport types (HTTP, stdio, etc.). Cursor infers HTTP from the URL.

## V3 ML Training Data

Priority Forge collects training data for learning optimal priority weights. The system uses a **three-layer intelligence chain**:

```
LLM (semantic understanding) → Priority Forge (mathematical scoring) → User feedback (learning signal)
```

> 📚 **For comprehensive ML documentation, see [docs/ML_ARCHITECTURE.md](docs/ML_ARCHITECTURE.md)**

### Data Collected

| Event Type | What It Captures | Training Signal |
|------------|------------------|-----------------|
| `PriorityChangeEvent` | User changes task priority (P2→P0) | User override = disagreement with current scoring |
| `TaskSelectionEvent` | User picks a task to work on | Selection ≠ top recommendation = preference signal |
| `QueueRebalanceEvent` | Queue reorders after dependency change | How queue evolves over time |
| `TaskCompletionRecord` | Task completed with outcome | Actual completion time vs estimates |

### Using Training Data

```bash
# Export training data via API
curl http://localhost:3456/ml/export

# Or via MCP tool
# Call: export_training_data
```

The exported data includes:
- Raw events for custom analysis
- ML-ready format with nulls handled and features encoded
- Summary statistics (selection accuracy, data quality metrics)

### What Can Be Learned

| Learning Target | Model Type | Data Needed |
|-----------------|------------|-------------|
| Optimal heuristic weights | XGBoost | ~50+ selection events |
| Task completion time | Regression | ~100+ completion records |
| Queue dynamics | Sequence model | ~200+ rebalance events |

### Key Insight

The system **doesn't learn WHICH tasks should block others** — that semantic understanding stays with the LLM. It **learns HOW MUCH to weight blocking relationships** relative to other factors (deadlines, effort, cross-project impact).

> 📚 **Full details:** [ML Architecture & Training Pipeline](docs/ML_ARCHITECTURE.md)

## Roadmap

| Version | Status | Description |
|---------|--------|-------------|
| V1 | ✅ Complete | JSON storage, REST API, MCP endpoint, static P0-P3 |
| V2 | ✅ Complete | Heap-based priority queue with weighted scoring |
| V2.1 | ✅ Complete | Universal coverage via MCP Resources + Prompts |
| V3 | ✅ Complete | Dynamic rebalancing + ML training data collection |
| V4 | ✅ Current | Workspaces + global ML training data architecture |
| V5 | 🔲 Planned | Goal-conditioned learning with objectives |

## License

This project is licensed under the GNU General Public License v3.0 (GPL-3.0). See the [LICENSE](LICENSE) file for details.
