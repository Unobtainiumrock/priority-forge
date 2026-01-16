# ML Architecture & Training Pipeline

This document describes the machine learning architecture for Priority Forge's learned priority scoring.

---

## Table of Contents

1. [System Architecture: The Intelligence Chain](#system-architecture-the-intelligence-chain)
2. [How the Learning Loop Works](#how-the-learning-loop-works)
3. [Data Collection (V3)](#data-collection-v3)
   - [Priority Change Events](#1-priority-change-events)
   - [Task Selection Events](#2-task-selection-events)
   - [Queue Rebalance Events](#3-queue-rebalance-events)
   - [Task Completion Records](#4-task-completion-records)
4. [Learning Targets](#learning-targets)
   - [Optimal Heuristic Weights (XGBoost)](#target-1-optimal-heuristic-weights-xgboost)
   - [Completion Time Prediction](#target-2-completion-time-prediction-regression)
   - [Queue Trajectory Learning (V4+)](#target-3-queue-trajectory-learning-future---v4)
5. [Model Architecture Comparison](#model-architecture-comparison)
   - [XGBoost Limitations](#xgboost-limitations)
   - [When to Switch to Neural Models](#when-to-switch-to-neural-models)
6. [Goal-Conditioned Learning (V4 Prep)](#goal-conditioned-learning-v4-prep)
7. [Training Pipeline](#training-pipeline)
8. [Data Quality Requirements](#data-quality-requirements)
9. [Transition Plan: XGBoost → Neural](#transition-plan-xgboost--neural)
10. [API Reference](#api-reference)

---

## System Architecture: The Intelligence Chain

Priority Forge is a **scoring engine**, not a semantic planner. The "intelligence" of task prioritization comes from a collaboration between three layers:

```
┌─────────────────────────────────────────────────────────────────┐
│                    LLM (Semantic Understanding)                 │
│         Creates tasks with dependencies and blocking info       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                Priority Forge (Mathematical Scoring)            │
│       Computes optimal ordering from dependency graph           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                   User Feedback (Learning Signal)               │
│           Corrections tune the heuristic weights                │
└─────────────────────────────────────────────────────────────────┘
```

### What Each Layer Does

| Layer | Responsibility | Example |
|-------|----------------|---------|
| **LLM** | Identifies task relationships | "Implement auth" → creates task with `blocking: "all-protected-routes"` |
| **Priority Forge** | Computes scores from graph | Sees 5 tasks depend on auth → `blockingCount = 5` → high priority |
| **User** | Corrects mistakes | Bumps task from P2→P0 → logged as training signal |

### Where the "Smartness" Comes From

1. **The LLM's semantic understanding** when it calls `create_task` with appropriate `dependencies` and `blocking` fields
2. **The auto-capture guidelines** (`progress://auto-capture` resource) that instruct the LLM how to identify blockers
3. **User corrections** that train better weights over time

### What Priority Forge Actually Computes

Priority Forge takes whatever dependency graph it's given and computes optimal ordering. The quality of that ordering depends on:

- ✅ LLM correctly identifies "X blocks Y" relationships
- ✅ LLM uses `dependencies` field appropriately  
- ✅ User provides feedback when ordering is wrong

### Key Insight

**The system doesn't learn WHICH tasks should block others** — that semantic understanding stays with the LLM. 

**It learns HOW MUCH to weight blocking relationships** relative to other factors (deadlines, effort, cross-project impact, etc.).

---

## How the Learning Loop Works

```
┌──────────────────────┐     ┌──────────────────────┐     ┌──────────────────────┐
│  LLM creates task    │ ──→ │   Queue rebalances   │ ──→ │ User works on task   │
│  with dependencies   │     │   automatically      │     │ (maybe not top one)  │
└──────────────────────┘     └──────────────────────┘     └──────────┬───────────┘
                                                                     │
                                                                     ↓
┌──────────────────────┐     ┌──────────────────────┐     ┌──────────────────────┐
│  Future scoring      │ ←── │  Train XGBoost on    │ ←── │ TaskSelectionEvent   │
│  reflects user prefs │     │  collected signals   │     │ logged (disagreed)   │
└──────────────────────┘     └──────────────────────┘     └──────────────────────┘
```

### Example Flow

1. **LLM creates tasks:**
   - Task A: "Set up database" (P1)
   - Task B: "Build API endpoints" with `dependencies: ["task-a"]` (P1)
   - Task C: "Create frontend" with `dependencies: ["task-b"]` (P1)

2. **Priority Forge computes:**
   - Task A: `blockingCount = 2` (blocks B and C) → score = 70
   - Task B: `blockingCount = 1`, `dependencyDepth = 1` → score = 85
   - Task C: `blockingCount = 0`, `dependencyDepth = 2` → score = 95

3. **Queue shows:** A → B → C (correct topological order!)

4. **User completes Task A:**
   - `QueueRebalanceEvent` logged
   - Task B's `dependencyDepth` drops to 0
   - Queue reorders automatically

---

## Data Collection (V3)

Priority Forge collects four types of training events:

### 1. Priority Change Events

When a user manually changes a task's priority level (e.g., P2 → P0).

```typescript
interface PriorityChangeEvent {
  taskId: string;
  oldPriority: Priority;       // P0-P3
  newPriority: Priority;
  oldScore: number;            // Computed score before
  newScore: number;            // Computed score after
  queuePositionBefore: number; // Rank in queue before
  queuePositionAfter: number;  // Rank in queue after
  timestamp: string;
}
```

**Training Signal:** User disagreed with current scoring → learn to adjust weights.

### 2. Task Selection Events

When a user selects a task to work on (especially if not the top recommendation).

```typescript
interface TaskSelectionEvent {
  selectedTaskId: string;
  selectedTaskRank: number;    // Where was it in the queue?
  topTaskId: string;           // What did we recommend?
  wasTopSelected: boolean;     // Did user follow recommendation?
  queueSize: number;
  timestamp: string;
  
  // V3.4: Enhanced learning signals for skipped tasks
  skippedTaskIds?: string[];   // ALL tasks ranked higher that user ignored
  
  // V3.4: Pairwise preferences (the ML gold!)
  implicitPreferences?: Array<{
    preferredTaskId: string;   // Task user selected
    skippedTaskId: string;     // Task ranked higher but ignored
    scoreDiff: number;         // selected_score - skipped_score
  }>;
  
  // V3.4: Feature snapshot of selected task
  selectedTaskFeatures?: {
    priority: Priority;
    priorityScore: number;
    weights: TaskWeights;
    effort?: Effort;
    hasDeadline: boolean;
    hasBlocking: boolean;
    hasDependencies: boolean;
  };
}
```

**Training Signals:**
- `wasTopSelected: false`: User disagreed with our top recommendation
- `skippedTaskIds`: All tasks the user considered but rejected (rich implicit feedback)
- `implicitPreferences`: Pairwise ranking preferences (user prefers selected over ALL skipped)
- `selectedTaskFeatures`: Feature snapshot for offline retraining

**V3.4 Enhancement:** When user selects task at rank 5 instead of rank 1, we now generate 4 pairwise preferences: "user prefers task-5 over task-1, task-2, task-3, task-4". This is the same ML gold as drag-and-drop reordering but captured passively.

### 3. Queue Rebalance Events

When the queue reorders due to dependency graph changes.

```typescript
interface QueueRebalanceEvent {
  trigger: 'task_created' | 'task_completed' | 'task_deleted' | 'task_updated' | 'weights_changed';
  significantChanges: Array<{
    taskId: string;
    rankBefore: number;
    rankAfter: number;
    scoreBefore: number;
    scoreAfter: number;
  }>;
  topTasksBefore: string[];
  topTasksAfter: string[];
  timestamp: string;
}
```

**Training Signal:** How queue dynamics evolve over time.

### 4. Task Completion Records

When a task is marked complete.

```typescript
interface TaskCompletionRecord {
  taskId: string;
  actualCompletionTime: number;  // Hours from creation to done (queue + work)
  wasBlocking: boolean;
  userOverrideCount: number;     // How many times priority was changed
  contextSwitchCount: number;
  outcome: 'completed' | 'cancelled' | 'deferred';
  initialPriorityScore: number;
  finalPriorityScore: number;
  // V3.3: Work duration tracking
  startedAt?: string;            // When work actually began (status → in_progress)
  actualWorkTime?: number;       // Hours from startedAt to completedAt
}
```

**Training Signals:**
- `actualCompletionTime`: Total time in system (queue time + work time)
- `actualWorkTime`: Actual effort duration (V3.3) - critical for effort estimation learning
- `startedAt`: Enables distinguishing queue time from work time

**V3.3 Requirement:** Agents MUST call `update_task(status: "in_progress")` when starting work to capture `startedAt`. Without this, `actualWorkTime` cannot be computed.

---

## Learning Targets

### Target 1: Optimal Heuristic Weights (XGBoost)

**Goal:** Learn better values for `blocking`, `crossProject`, `timeSensitive`, `effortValue`, `dependency` multipliers.

**Approach:** Pairwise ranking loss
- For each `TaskSelectionEvent` where `wasTopSelected = false`:
  - User preferred task at rank N over ALL tasks ranked 1 to N-1
  - **V3.4**: Use `implicitPreferences` array directly - each entry is a training pair
  - Learn weights that would have ranked the selected task higher

**Model:** XGBoost with ranking objective (`rank:pairwise`)

**Features per task:**
- `blockingCount`, `crossProjectImpact`, `timeSensitivity`, `effortValueRatio`, `dependencyDepth`
- `priority` (P0=0, P1=1, P2=2, P3=3)
- `effort` (low=1, medium=2, high=3)
- `hasDependencies`, `hasBlocking`

**Data Requirements:** 
- ~50+ selection events where user disagreed with recommendation
- **V3.4 Enhanced**: Use `mlReady.selectionPairs` combined with drag reorder pairs
- Each non-top selection generates multiple pairs (richer signal than before)

**Training Data Sources:**
1. `mlReady.selectionPairs` - From task selections (passive)
2. `dragReorderEvents.implicitPreferences` - From UI drag-and-drop (explicit)
3. Both can be combined into unified pairwise training set

### Target 2: Completion Time Prediction (Regression)

**Goal:** Predict how long a task will take to complete.

**V3.3 Enhancement:** With `actualWorkTime` separate from queue time, we can now train two distinct models:

| Model | Target Variable | What It Predicts |
|-------|-----------------|------------------|
| Queue Time Model | `actualCompletionTime - actualWorkTime` | How long a task will sit in backlog |
| Work Time Model | `actualWorkTime` | Actual effort duration |

**Features:**
- Task properties (effort, priority, blocking status)
- Queue context (position, queue size)
- Historical completion times for similar tasks
- **V3.3 new:** `hasWorkTimeData` flag to weight reliable samples higher

**Model:** XGBoost regressor or simple neural network

**Data Requirements:** 
- ~100+ completion records for queue time prediction
- ~50+ completion records with `actualWorkTime` (requires `startedAt`) for work time prediction

### Target 3: Queue Trajectory Learning (Future - V4+)

**Goal:** Learn to optimize sequences of task completions toward objectives.

**Approach:** Sequence modeling or reinforcement learning
- Model queue state as observation
- Task selection as action
- Objective progress as reward

**Model Options:**
- LSTM/Transformer for sequence prediction
- DQN/PPO for policy learning

**Data Requirements:** ~200+ rebalance events with objective progress.

---

## Model Architecture Comparison

| Target | Current Model | Future Model | Can Fine-tune? |
|--------|---------------|--------------|----------------|
| Heuristic weights | XGBoost | XGBoost | No (retrain from scratch, but fast) |
| Completion time | XGBoost | Neural net | Yes (neural net) |
| Queue trajectory | N/A | LSTM/RL | Yes (continue training) |

### XGBoost Limitations

XGBoost is a tree-based model that:
- ✅ Works great for tabular features
- ✅ Handles missing values gracefully
- ✅ Fast training (<1 second for our data size)
- ❌ Cannot be "fine-tuned" in the neural net sense
- ❌ Cannot learn sequences or trajectories
- ❌ Feature space must be fixed at training time

### When to Switch to Neural Models

Consider neural networks when:
1. Adding goal-conditioning (requires learning task-objective relationships)
2. Learning temporal patterns (sequence of selections over time)
3. Transfer learning between users/projects

---

## Goal-Conditioned Learning (V4 Prep)

### Schema Extensions

```typescript
interface Objective {
  id: string;
  name: string;
  description: string;
  targetDate?: string;
  status: 'active' | 'achieved' | 'abandoned';
  keyResults: Array<{
    metric: string;
    target: number;
    current: number;
  }>;
  linkedTaskIds: string[];
  linkedProjectIds: string[];
}

interface ObjectiveProgressEvent {
  objectiveId: string;
  progressPercent: number;
  queueSnapshot: Array<{ taskId: string; rank: number; score: number }>;
  tasksCompletedSinceLastSnapshot: string[];
  timestamp: string;
}
```

### How Goal Conditioning Changes the Model

**Without goals (current):**
```
Score = f(task_features, heuristic_weights)
```
Model learns: "What task properties do humans prioritize?"

**With goals (V4):**
```
Score = f(task_features, heuristic_weights, objective_context, objective_progress)
```
Model learns: "Given where we are and where we want to be, which task best advances our objectives?"

### Model Requirements for Goals

| Requirement | XGBoost | Neural Net |
|-------------|---------|------------|
| Fixed feature space | ✅ Possible (add goal features) | ✅ Yes |
| Variable-length objectives | ❌ Needs flattening | ✅ Attention/pooling |
| Learning task-goal relationships | ❌ Limited | ✅ Embedding layers |
| Trajectory optimization | ❌ No | ✅ LSTM/Transformer |

**Recommendation:** V4 should use a hybrid approach:
1. Keep XGBoost for initial weight tuning (fast, works now)
2. Add neural ranker for goal-conditioned scoring
3. Use RL for longer-horizon planning (V5+)

---

## Training Pipeline

### Current (V3)

```
1. Collect events (automatic via storage hooks)
2. Export training data (export_training_data tool)
3. Train XGBoost locally (user runs Python script)
4. Update heuristic weights via API (update_heuristic_weights)
```

### Future (V4+)

```
1. Collect events with objective context
2. Export to training format
3. Train neural ranker with objective embeddings
4. Deploy model via inference endpoint
5. Score tasks in real-time with model predictions
```

---

## Data Quality Requirements

| Metric | Minimum | Good | Excellent |
|--------|---------|------|-----------|
| Selection events | 50 | 200 | 500+ |
| Selection accuracy | N/A | 70%+ | 85%+ |
| **Selections with pairwise data** | 10 | 50 | 200+ |
| **Total selection pairs** | 20 | 100 | 500+ |
| Completion records | 50 | 200 | 500+ |
| **Completions with `actualWorkTime`** | 10 | 50 | 100+ |
| Rebalance events | 20 | 100 | 300+ |
| Tasks with effort | 50% | 80% | 95% |
| Tasks with dependencies | 20% | 40% | 60% |

### V3.4 Selection Pairwise Quality

The new `implicitPreferences` field captures when users skip higher-ranked tasks. This data is critical for pairwise ranking loss training:

- **Rich signal**: Each non-top selection generates N-1 pairwise preferences (where N = selected rank)
- **Passive collection**: Unlike drag-and-drop, this happens naturally during task selection
- **Combined with drag data**: Selection pairs and drag pairs can be merged for training

### V3.3 Work Duration Quality

The new `actualWorkTime` metric requires agents to call `update_task(status: "in_progress")` before starting work. Track this via `completionsWithWorkTime` in the data quality summary.

**Why it matters:** Without `actualWorkTime`, we can only predict total time (queue + work), which is less actionable than predicting actual effort duration separately.

### Checking Data Quality

```bash
# Via MCP tool
# Call: get_ml_summary

# Via API
curl http://localhost:3456/ml/summary
```

---

## Transition Plan: XGBoost → Neural

### Phase 1: Prove Value with XGBoost (Current)
- Collect selection/completion data
- Train XGBoost to tune heuristic weights
- Measure improvement in selection accuracy

### Phase 2: Add Goal Features to XGBoost (V4a)
- Add objectives to schema
- Flatten goal features (goal_count, closest_deadline, avg_progress)
- Train XGBoost with extended features

### Phase 3: Neural Ranker (V4b)
- Implement neural ranking model
- Use task + objective embeddings
- Fine-tune from XGBoost predictions as pseudo-labels

### Phase 4: Sequence Optimization (V5+)
- Add LSTM/Transformer for trajectory modeling
- Implement RL for long-horizon planning
- Learn to achieve objectives efficiently

---

## API Reference

### Export Training Data

```bash
curl http://localhost:3456/ml/export
```

Returns:
```json
{
  "completionRecords": [...],
  "priorityChangeEvents": [...],
  "taskSelectionEvents": [...],
  "queueRebalanceEvents": [...],
  "mlReady": {
    "completions": [
      {
        "taskId": "TASK-001",
        "completionTimeHours": 5.2,
        "workTimeHours": 1.5,          // V3.3: Actual work duration
        "queueTimeHours": 3.7,         // V3.3: Time in backlog
        "hasWorkTimeData": 1,          // V3.3: 1 if reliable, 0 if imputed
        "wasBlocking": 1,
        "outcome": "completed",
        "initialScore": 45,
        "finalScore": 45,
        "scoreDelta": 0
      }
    ],
    "tasks": [...],
    "rebalances": [...],
    "selectionPairs": [                // V3.4: Pairwise preferences from task selections
      {
        "preferredTaskId": "TASK-005",
        "skippedTaskId": "TASK-001",
        "scoreDiff": 15.2,             // positive = heuristics got it wrong
        "timestamp": "2026-01-16T12:00:00Z",
        "queueSize": 10
      }
    ]
  },
  "summary": {
    "totalCompletions": 47,
    "totalPriorityChanges": 12,
    "totalSelections": 89,
    "totalRebalances": 156,
    "selectionAccuracy": 73.2,
    "dataQuality": {
      "completionsWithScores": 47,
      "completionsWithWorkTime": 12,   // V3.3: Tracks reliable work time data
      "tasksWithEffort": 35,
      "tasksWithDependencies": 18,
      "rebalancesWithSignificantChanges": 23,
      "selectionsWithPairwiseData": 45, // V3.4: Selections with skipped task data
      "totalSelectionPairs": 127        // V3.4: Total pairwise preferences
    }
  }
}
```

### Get ML Summary

```bash
curl http://localhost:3456/ml/summary
```

Returns:
```json
{
  "summary": {...},
  "currentWeights": {...},
  "recommendation": "Selection accuracy below 70% - consider retraining",
  "dataReadiness": {
    "hasEnoughCompletions": true,
    "hasEnoughSelections": true,
    "readyForTraining": true
  }
}
```
