# ML Architecture & Training Pipeline

This document describes the machine learning architecture for Priority Forge's learned priority scoring.

## Current State (V3)

### Data Collection

Priority Forge collects four types of training events:

#### 1. Priority Change Events
When a user manually changes a task's priority level (e.g., P2 → P0).

```typescript
interface PriorityChangeEvent {
  taskId: string;
  oldPriority: Priority;      // P0-P3
  newPriority: Priority;
  oldScore: number;           // Computed score before
  newScore: number;           // Computed score after
  queuePositionBefore: number; // Rank in queue before
  queuePositionAfter: number;  // Rank in queue after
  timestamp: string;
}
```

**Training Signal:** User disagreed with current scoring → learn to adjust weights.

#### 2. Task Selection Events
When a user selects a task to work on (especially if not the top recommendation).

```typescript
interface TaskSelectionEvent {
  selectedTaskId: string;
  selectedTaskRank: number;    // Where was it in the queue?
  topTaskId: string;           // What did we recommend?
  wasTopSelected: boolean;     // Did user follow recommendation?
  queueSize: number;
  timestamp: string;
}
```

**Training Signal:** User preference between competing tasks.

#### 3. Queue Rebalance Events
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

#### 4. Task Completion Records
When a task is marked complete.

```typescript
interface TaskCompletionRecord {
  taskId: string;
  actualCompletionTime: number;  // Hours from creation to done
  wasBlocking: boolean;
  userOverrideCount: number;     // How many times priority was changed
  contextSwitchCount: number;
  outcome: 'completed' | 'cancelled' | 'deferred';
  initialPriorityScore: number;
  finalPriorityScore: number;
}
```

**Training Signal:** Actual outcomes for retrospective learning.

---

## Learning Targets

### Target 1: Optimal Heuristic Weights (XGBoost)

**Goal:** Learn better values for `blocking`, `crossProject`, `timeSensitive`, `effortValue`, `dependency` multipliers.

**Approach:** Pairwise ranking loss
- For each `TaskSelectionEvent` where `wasTopSelected = false`:
  - User preferred task at rank N over task at rank 1
  - Learn weights that would have ranked the selected task higher

**Model:** XGBoost with ranking objective (`rank:pairwise`)

**Features per task:**
- `blockingCount`, `crossProjectImpact`, `timeSensitivity`, `effortValueRatio`, `dependencyDepth`
- `priority` (P0=0, P1=1, P2=2, P3=3)
- `effort` (low=1, medium=2, high=3)
- `hasDependencies`, `hasBlocking`

**Data Requirements:** ~50+ selection events where user disagreed with recommendation.

### Target 2: Completion Time Prediction (Regression)

**Goal:** Predict how long a task will take to complete.

**Features:**
- Task properties (effort, priority, blocking status)
- Queue context (position, queue size)
- Historical completion times for similar tasks

**Model:** XGBoost regressor or simple neural network

**Data Requirements:** ~100+ completion records with accurate timing.

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
| Completion records | 50 | 200 | 500+ |
| Rebalance events | 20 | 100 | 300+ |
| Tasks with effort | 50% | 80% | 95% |
| Tasks with dependencies | 20% | 40% | 60% |

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
    "completions": [...],
    "tasks": [...],
    "rebalances": [...]
  },
  "summary": {
    "totalCompletions": 47,
    "totalPriorityChanges": 12,
    "totalSelections": 89,
    "totalRebalances": 156,
    "selectionAccuracy": 73.2
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

