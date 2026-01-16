# Development Roadmap

This document outlines future development phases for Priority Forge, with a focus on enabling embedding-based ML training.

---

## Table of Contents

1. [Current State (V3)](#current-state-v3)
2. [V5+: Embedding-Ready Training Data](#v5-embedding-ready-training-data)
   - [Problem Statement](#problem-statement)
   - [Enhanced Schema Specification](#enhanced-schema-specification)
   - [Example Data Format](#example-data-format)
   - [Data Collection Strategies](#data-collection-strategies)
3. [Implementation Phases](#implementation-phases)
4. [Open Questions](#open-questions)

---

## Current State (V4.0)

The V4.0 training data is well-suited for **tabular ML** (XGBoost with numerical features) but insufficient for **embedding-based approaches**.

### What V4.0 Captures

| Data Type | Fields | Textual Content |
|-----------|--------|-----------------|
| completionRecords | taskId, completionTime, **startedAt, actualWorkTime**, wasBlocking, outcome | Minimal (IDs only) |
| priorityChangeEvents | taskId, old/new priority, scores | Minimal (IDs only) |
| taskSelectionEvents | taskId | IDs only |
| tasks | id, task, project, notes, blocking, **startedAt** | Short descriptions (~5-10 words) |

### V4.0 Additions (Work Duration Tracking)

V4.0 adds critical temporal data for effort estimation:

| Field | Location | Description |
|-------|----------|-------------|
| `startedAt` | WeightedTask | When work began (status → in_progress) |
| `startedAt` | TaskCompletionRecord | Snapshot of when work started |
| `actualWorkTime` | TaskCompletionRecord | Hours from startedAt → completedAt |
| `completionsWithWorkTime` | Data quality metrics | Tracks reliable work time samples |

**ML Impact:** Enables training separate models for:
- **Queue time prediction**: How long will a task sit in backlog?
- **Work time prediction**: How long will actual work take?

### V4.0 Limitations for Embeddings

1. **Task descriptions average 5-10 words** — insufficient for semantic understanding
2. **No conversational context** — the "why" behind task creation is lost
3. **No work artifacts** — no links to files, commits, or code changes
4. **Sparse notes field** — free text exists but is underutilized

---

## V5+: Embedding-Ready Training Data

### Problem Statement

To enable embedding-based learning (transformers, semantic search, LLM fine-tuning), we need rich textual context that captures:

- **What** the task actually involves (detailed description)
- **Why** it matters (rationale, business context)
- **How** it was completed (artifacts, learnings)
- **Relationships** to other work (semantic similarity, not just explicit dependencies)

### Enhanced Schema Specification

```typescript
interface EmbeddingReadyTask {
  // === Existing V3 Fields ===
  id: string;
  priority: Priority;
  task: string;                    // Short description (keep for backwards compat)
  project: string;
  status: TaskStatus;
  effort?: EffortLevel;
  blocking?: string;
  dependencies?: string[];
  notes?: string;
  deadline?: string;
  
  // === NEW: Rich Context for Embeddings ===
  
  /**
   * Detailed description of what the task involves.
   * Target: 50-200 words covering scope, approach, and acceptance criteria.
   */
  longDescription?: string;
  
  /**
   * Conversational context from when the task was created.
   * Auto-captured from the LLM conversation that spawned this task.
   */
  conversationContext?: string;
  
  /**
   * Files and directories relevant to this task.
   * Auto-captured from IDE context or explicitly linked.
   */
  relatedFiles?: string[];
  
  /**
   * Technical domains this task belongs to.
   * Used for semantic clustering and transfer learning.
   */
  technicalDomains?: string[];
  
  /**
   * Summary of what was done when task was completed.
   * Captures learnings, decisions made, and actual approach taken.
   */
  completionSummary?: string;
  
  /**
   * Git commit hashes associated with this task.
   * Links code changes to task outcomes.
   */
  linkedCommits?: string[];
  
  /**
   * Semantic tags for similarity matching.
   * More flexible than rigid technicalDomains.
   */
  tags?: string[];
}

interface EmbeddingReadyCompletionRecord {
  // === Existing V4.0 Fields ===
  taskId: string;
  actualCompletionTime: number;     // Total time (queue + work)
  wasBlocking: boolean;
  userOverrideCount: number;
  contextSwitchCount: number;
  outcome: 'completed' | 'cancelled' | 'deferred';
  initialPriorityScore: number;
  finalPriorityScore: number;
  // V4.0 additions
  startedAt?: string;               // When work began
  actualWorkTime?: number;          // Hours of actual work
  
  // === NEW: Rich Context for V5+ ===
  
  /**
   * Snapshot of the task's full context at completion time.
   * Includes longDescription, conversationContext, etc.
   */
  taskSnapshot: Partial<EmbeddingReadyTask>;
  
  /**
   * User-provided summary of how the task was completed.
   * What approach was taken? What was learned?
   */
  completionNotes?: string;
  
  /**
   * Files that were modified during task completion.
   * Captured from git diff or IDE activity.
   */
  filesModified?: string[];
  
  /**
   * Was the original approach changed mid-task?
   * Useful for learning about task estimation accuracy.
   */
  approachChanged?: boolean;
  
  /**
   * Blockers encountered during execution.
   * Free text describing what slowed things down.
   */
  blockersEncountered?: string;
}

interface EmbeddingReadySelectionEvent {
  // === Existing V3 Fields ===
  selectedTaskId: string;
  selectedTaskRank: number;
  topTaskId: string;
  wasTopSelected: boolean;
  queueSize: number;
  timestamp: string;
  
  // === NEW: Rich Context ===
  
  /**
   * Why did the user select this task over the recommended one?
   * Auto-captured from conversation or explicit prompt.
   */
  selectionRationale?: string;
  
  /**
   * Snapshot of current work context.
   * What files are open? What was the user working on?
   */
  workContext?: {
    openFiles?: string[];
    recentCommits?: string[];
    currentBranch?: string;
  };
  
  /**
   * Full task descriptions for pairwise comparison learning.
   * Enables learning semantic preferences.
   */
  selectedTaskSnapshot: Partial<EmbeddingReadyTask>;
  topTaskSnapshot: Partial<EmbeddingReadyTask>;
}
```

### Example Data Format

This example shows the target richness for embedding-ready training data:

```json
{
  "id": "CVR-001",
  "priority": "P0",
  "task": "Add conversion pixel/postback endpoint",
  "project": "rtb-auction",
  "status": "complete",
  "blocking": "CVR data collection",
  "effort": "medium",
  
  "longDescription": "Implement server-side endpoint to receive conversion postback events from Shopify webhooks and Roundly pixel fires. Must handle 3 event types: purchase, lead, pageview. Store in conversions table with campaign_id linkage via click_id. Ensure idempotency via conversion_id deduplication. Target latency <50ms p99.",
  
  "conversationContext": "User asked about CVR tracking gaps in RTB system. Discovered existing Gravity endpoint handles Roundly/Shopify/General conversions but integration with rtb-auction predictor was missing. Decision: wire existing endpoint rather than build new one.",
  
  "relatedFiles": [
    "services/event-ingestion/main.go",
    "services/internal-dsp/internal/pacing/predictor.go",
    "proto/conversion.proto"
  ],
  
  "technicalDomains": ["ad-tech", "event-tracking", "attribution", "webhooks"],
  
  "completionSummary": "Discovered conversions-api already existed in gravity-engine repo (Railway deployment). No new endpoint needed. Wired existing domain_conversion_rate from campaign_engagement_stats into predictor.go CVR baseline. Chose per-domain CVR over per-campaign to handle cold-start better.",
  
  "linkedCommits": ["a1b2c3d", "e4f5g6h"],
  
  "tags": ["cvr", "conversion-tracking", "gravity-integration", "data-pipeline"]
}
```

**Completion Record Example:**

```json
{
  "taskId": "CVR-001",
  "actualCompletionTime": 2.51,
  "wasBlocking": true,
  "outcome": "completed",
  "initialPriorityScore": -50,
  "finalPriorityScore": -50,
  
  "taskSnapshot": {
    "longDescription": "Implement server-side endpoint to receive conversion postback events...",
    "technicalDomains": ["ad-tech", "event-tracking", "attribution"]
  },
  
  "completionNotes": "Task was simpler than expected - existing infrastructure covered 90% of requirements. Main work was discovery and wiring, not implementation.",
  
  "filesModified": [
    "services/internal-dsp/internal/pacing/predictor.go"
  ],
  
  "approachChanged": true,
  "blockersEncountered": "Initially unclear where conversions API lived. Had to trace through gravity-engine-workers to find it was in main gravity-engine repo."
}
```

### Data Collection Strategies

#### 1. Auto-Capture from Conversations

When `create_task` is called, capture the preceding conversation context:

```typescript
// In MCP handler
function createTask(params: CreateTaskParams, conversationContext?: string) {
  const task = {
    ...params,
    conversationContext: conversationContext || extractRecentContext(),
  };
}
```

#### 2. IDE Integration for File Linking

Leverage Cursor's file context to auto-populate `relatedFiles`:

```typescript
// When task is created, capture open files
const relatedFiles = getCurrentlyOpenFiles();
```

#### 3. Completion Prompts

When completing a task, prompt for rich completion data:

```typescript
function completeTask(taskId: string, outcome: Outcome) {
  // Optionally prompt user for completion context
  const completionNotes = await promptUser(
    "Brief summary of how this was completed (optional):"
  );
}
```

#### 4. Git Integration

Link commits to tasks via branch naming or commit message parsing:

```bash
# Convention: branch names include task ID
git checkout -b CVR-001-conversion-endpoint

# Or commit messages reference task
git commit -m "[CVR-001] Wire domain CVR into predictor"
```

---

## Implementation Phases

### Phase 1: Schema Extension (Non-Breaking)

- Add optional embedding fields to existing schema
- All new fields are optional for backwards compatibility
- Update TypeScript types in `src/types/schema.ts`

### Phase 2: Conversation Context Capture

- Implement conversation buffer in MCP handler
- Auto-populate `conversationContext` on task creation
- Store last N messages that led to task creation

### Phase 3: IDE Context Integration

- Capture open files on task creation
- Link files modified during task completion (git diff)
- Populate `relatedFiles` automatically

### Phase 4: Completion Enrichment

- Add completion prompt flow
- Capture `completionSummary` and `blockersEncountered`
- Track `approachChanged` via comparison with initial description

### Phase 5: Embedding Generation & Training

- Generate embeddings from rich text fields
- Train transformer-based ranker using pairwise comparison
- Implement semantic similarity for task clustering

---

## Open Questions

1. **Privacy/Sensitivity**: Should conversation context be filtered for sensitive info?

2. **Storage Growth**: Rich text significantly increases storage. Implement archival strategy?

3. **Embedding Model Choice**: OpenAI embeddings vs. local models (sentence-transformers)?

4. **Real-time vs. Batch**: Generate embeddings on task creation or in batch jobs?

5. **Minimum Viable Richness**: What's the minimum text length for useful embeddings?

---

## References

- [ML_ARCHITECTURE.md](./ML_ARCHITECTURE.md) — Current V3 ML pipeline documentation
- [XGBoost Ranking](https://xgboost.readthedocs.io/en/latest/tutorials/learning_to_rank.html) — Current ranking approach
- [Sentence Transformers](https://www.sbert.net/) — Potential embedding model for V5+

