# Priority Forge

HTTP-based MCP server for cross-project task prioritization with heap-based priority scoring and auto-generated markdown output.

---

## What is this and why should I use it?

**The Problem:** When you're working with AI coding assistants (Claude, Cursor, etc.) across multiple projects, things slip through the cracks. You mention "we should fix that bug" in passing, but nobody tracks it. You finish a task but forget to mark it done. You have three projects with scattered TODO lists and no unified view of what's most important.

**The Solution:** Priority Forge is a task tracking server that your AI assistant connects to. Once connected, the AI:

- **Proactively captures tasks** from your conversations—you don't have to say "add this to the tracker"
- **Always knows what's most important** via a smart priority queue that weighs blocking dependencies, deadlines, and cross-project impact
- **Tracks task completion** so you build a history of how long things actually take (used to train smarter prioritization later)
- **Works across all your projects** with a single source of truth, while optionally syncing to per-project markdown files

**Why this approach?** Traditional task trackers require you to context-switch: stop coding, open Jira/Linear/Notion, write a ticket, go back to coding. With Priority Forge, the AI does the tracking *while* you work. It's ambient task management—always on, never in the way.

**Works everywhere:** Because it uses the open MCP protocol, it works with Cursor, Claude Desktop, Droid, Claude Code, and any other MCP-compatible tool. No vendor lock-in.

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

## Quick Start

```bash
# Clone the repo
git clone git@github.com:Unobtainiumrock/priority-forge.git
cd priority-forge

# Install dependencies
npm install

# Initialize your database (creates example project/task)
npx tsx scripts/seed.ts

# Start the server
npm run dev
```

Server runs at `http://localhost:3456`

> **Note**: The `data/progress.json` file is gitignored - each user maintains their own task database. Run the seed script to create your initial database.

## MCP Integration

Configure your AI tools to connect to the MCP server:

### Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "progress-tracker": {
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
    "progress-tracker": {
      "type": "http",
      "url": "http://localhost:3456/mcp"
    }
  }
}
```

Then restart Droid or use `/mcp` to verify the connection.

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "progress-tracker": {
      "type": "http",
      "url": "http://localhost:3456/mcp"
    }
  }
}
```

Then restart Claude Desktop.

## Agent Rules (Critical)

Connecting the MCP server is only half the setup. You also need to configure your AI assistant to **proactively check the tracker at session start**. Without this, the AI won't use the tracker unless you explicitly ask.

👉 **Copy the contents of [`AGENT_RULES.md`](./AGENT_RULES.md) to the appropriate location:**

| Client | Where to copy it |
|--------|------------------|
| **Cursor** | `.cursorrules` in your project root (or `~/.cursorrules` for global) |
| **Droid** | `~/.factory/AGENTS.md` |
| **Claude Desktop / Code** | Paste at start of conversation, or use a custom prompt template |

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

## Data Storage

| File | Purpose |
|------|---------|
| `data/progress.json` | Source of truth (JSON database) - **gitignored** |
| `data/progress.json.example` | Example database structure |
| `data/PROGRESS_TRACKER.md` | Auto-generated markdown - **gitignored** |

> Each user maintains their own task database. The example file shows the expected structure.

## Scripts

```bash
npm run dev      # Development with hot reload
npm run build    # Compile TypeScript
npm start        # Production (requires build first)
npm test         # Run tests

# Initialize new database
npx tsx scripts/seed.ts
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3456` | Server port |

## Team Deployment

For team use with shared tasks, deploy to a shared server:

```json
{
  "mcpServers": {
    "progress-tracker": {
      "type": "http",
      "url": "https://your-server.example.com/mcp"
    }
  }
}
```

For individual use, each team member runs their own local instance with their own tasks.

## Roadmap

| Version | Status | Description |
|---------|--------|-------------|
| V1 | ✅ Complete | JSON storage, REST API, MCP endpoint, static P0-P3 |
| V2 | ✅ Complete | Heap-based priority queue with weighted scoring |
| V2.1 | ✅ Current | Universal coverage via MCP Resources + Prompts |
| V3 | 🔲 Planned | Neural network tunes priority weights from completion data |

## License

MIT
