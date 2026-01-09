# Priority Forge

HTTP-based MCP server for cross-project task prioritization with JSON storage and auto-generated markdown output.

## Features

- **Priority Queue**: P0-P3 task prioritization across multiple projects
- **Auto-generated Markdown**: Human-readable `PROGRESS_TRACKER.md` regenerated on every write
- **MCP Protocol**: JSON-RPC 2.0 endpoint for AI assistant integration
- **REST API**: Full CRUD operations for all entities
- **V3 Ready**: Context switch tracking for future ML-based priority optimization

## Quick Start

```bash
# Clone the repo
git clone git@github.com:Unobtainiumrock/priority-forge.git
cd priority-forge

# Install dependencies
npm install

# Seed initial data (optional - creates sample projects/tasks)
npx tsx scripts/seed.ts

# Start the server
npm run dev
```

Server runs at `http://localhost:3456`

## MCP Integration

Configure your AI tools to connect to the MCP server:

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

## REST API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/status` | Full system status |
| GET | `/projects` | List all projects |
| GET | `/projects/:id` | Get project by ID |
| POST | `/projects` | Create project |
| PUT | `/projects/:id` | Update project |
| DELETE | `/projects/:id` | Delete project |
| GET | `/tasks` | List all tasks (sorted by priority) |
| GET | `/tasks/:id` | Get task by ID |
| GET | `/tasks/priority/:level` | Filter tasks by P0/P1/P2/P3 |
| GET | `/tasks/project/:projectId` | Filter tasks by project |
| POST | `/tasks` | Create task |
| PUT | `/tasks/:id` | Update task |
| DELETE | `/tasks/:id` | Delete task |
| POST | `/tasks/:id/complete` | Mark task complete with outcome |
| POST | `/tasks/:id/context-switch` | Log context switch (V3 training) |
| GET | `/data-gaps` | List data collection gaps |
| POST | `/data-gaps` | Create data gap |
| PUT | `/data-gaps/:id` | Update data gap |
| DELETE | `/data-gaps/:id` | Delete data gap |
| GET | `/decisions` | List decisions |
| POST | `/decisions` | Log a decision |
| POST | `/mcp` | MCP JSON-RPC 2.0 endpoint |

## MCP Tools

Once connected, your AI assistant can use these tools:

| Tool | Description |
|------|-------------|
| `get_status` | Get full system status (projects, tasks, gaps, decisions) |
| `get_priorities` | Get all tasks sorted by priority, optionally filter by level |
| `get_project` | Get details for a specific project by ID or name |
| `create_task` | Create a new task in the priority queue |
| `update_task` | Update an existing task's priority, status, or details |
| `complete_task` | Mark a task as completed/cancelled/deferred |
| `log_context_switch` | Log when switching away from a task (V3 training data) |
| `get_data_gaps` | Get all identified data collection gaps |
| `log_decision` | Record an architectural or design decision |

## Data Storage

| File | Purpose |
|------|---------|
| `data/progress.json` | Source of truth (JSON database) |
| `data/PROGRESS_TRACKER.md` | Auto-generated markdown (read-only) |

The markdown file is regenerated automatically on every write operation, providing a human-readable view that can be committed to git.

## Scripts

```bash
npm run dev      # Development with hot reload
npm run build    # Compile TypeScript
npm start        # Production (requires build first)
npm test         # Run tests
npx tsx scripts/seed.ts  # Seed with sample data
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3456` | Server port |

## Team Deployment

For team use, deploy to a shared server and update the URL in each tool's config:

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

## Roadmap

| Version | Status | Description |
|---------|--------|-------------|
| V1 | ✅ Current | JSON storage, REST API, MCP endpoint |
| V2 | 🔲 Planned | Heap-based priority queue with weighted scoring |
| V3 | 🔲 Future | Neural network tunes priority weights from completion data |

## License

MIT
