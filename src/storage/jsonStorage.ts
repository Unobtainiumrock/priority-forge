import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  Project,
  Task,
  DataGap,
  Decision,
  TaskCompletionRecord,
  ProgressDatabase,
  CreateProjectDTO,
  UpdateProjectDTO,
  CreateTaskDTO,
  UpdateTaskDTO,
  CreateDataGapDTO,
  UpdateDataGapDTO,
  CreateDecisionDTO,
  Priority,
} from '../types/schema';
import { StorageInterface } from './interface';

const DATA_DIR = path.join(__dirname, '../../data');
const DB_FILE = path.join(DATA_DIR, 'progress.json');

function getEmptyDatabase(): ProgressDatabase {
  return {
    version: 'v1',
    lastUpdated: new Date().toISOString(),
    projects: [],
    tasks: [],
    dataGaps: [],
    decisions: [],
    completionRecords: [],
  };
}

// In-memory context switch counter (resets on restart, persisted on task completion)
const contextSwitchCounts: Map<string, number> = new Map();

export class JsonStorage implements StorageInterface {
  private db: ProgressDatabase;
  private onWrite: (() => Promise<void>) | null = null;

  constructor() {
    this.db = this.load();
  }

  setOnWriteCallback(callback: () => Promise<void>) {
    this.onWrite = callback;
  }

  private load(): ProgressDatabase {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DB_FILE)) {
      const empty = getEmptyDatabase();
      fs.writeFileSync(DB_FILE, JSON.stringify(empty, null, 2));
      return empty;
    }
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw) as ProgressDatabase;
  }

  private async save(): Promise<void> {
    this.db.lastUpdated = new Date().toISOString();
    fs.writeFileSync(DB_FILE, JSON.stringify(this.db, null, 2));
    if (this.onWrite) {
      await this.onWrite();
    }
  }

  async getAll(): Promise<ProgressDatabase> {
    return this.db;
  }

  // Projects
  async getProjects(): Promise<Project[]> {
    return this.db.projects;
  }

  async getProject(id: string): Promise<Project | null> {
    return this.db.projects.find(p => p.id === id) || null;
  }

  async createProject(data: CreateProjectDTO): Promise<Project> {
    const now = new Date().toISOString();
    const project: Project = {
      id: uuidv4(),
      name: data.name,
      path: data.path,
      status: data.status || 'active',
      primaryFocus: data.primaryFocus,
      createdAt: now,
      updatedAt: now,
    };
    this.db.projects.push(project);
    await this.save();
    return project;
  }

  async updateProject(id: string, data: UpdateProjectDTO): Promise<Project | null> {
    const idx = this.db.projects.findIndex(p => p.id === id);
    if (idx === -1) return null;
    
    this.db.projects[idx] = {
      ...this.db.projects[idx],
      ...data,
      updatedAt: new Date().toISOString(),
    };
    await this.save();
    return this.db.projects[idx];
  }

  async deleteProject(id: string): Promise<boolean> {
    const idx = this.db.projects.findIndex(p => p.id === id);
    if (idx === -1) return false;
    this.db.projects.splice(idx, 1);
    await this.save();
    return true;
  }

  // Tasks
  async getTasks(): Promise<Task[]> {
    // Sort by priority (P0 first)
    const priorityOrder: Record<Priority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
    return [...this.db.tasks].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  }

  async getTask(id: string): Promise<Task | null> {
    return this.db.tasks.find(t => t.id === id) || null;
  }

  async getTasksByPriority(priority: Priority): Promise<Task[]> {
    return this.db.tasks.filter(t => t.priority === priority);
  }

  async getTasksByProject(projectId: string): Promise<Task[]> {
    return this.db.tasks.filter(t => t.project === projectId);
  }

  async createTask(data: CreateTaskDTO): Promise<Task> {
    const now = new Date().toISOString();
    const task: Task = {
      id: uuidv4(),
      priority: data.priority,
      task: data.task,
      project: data.project,
      status: data.status || 'not_started',
      blocking: data.blocking,
      dependencies: data.dependencies,
      notes: data.notes,
      createdAt: now,
      updatedAt: now,
    };
    this.db.tasks.push(task);
    await this.save();
    return task;
  }

  async updateTask(id: string, data: UpdateTaskDTO): Promise<Task | null> {
    const idx = this.db.tasks.findIndex(t => t.id === id);
    if (idx === -1) return null;
    
    this.db.tasks[idx] = {
      ...this.db.tasks[idx],
      ...data,
      updatedAt: new Date().toISOString(),
    };
    await this.save();
    return this.db.tasks[idx];
  }

  async deleteTask(id: string): Promise<boolean> {
    const idx = this.db.tasks.findIndex(t => t.id === id);
    if (idx === -1) return false;
    this.db.tasks.splice(idx, 1);
    contextSwitchCounts.delete(id);
    await this.save();
    return true;
  }

  // Data Gaps
  async getDataGaps(): Promise<DataGap[]> {
    const priorityOrder: Record<Priority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
    return [...this.db.dataGaps].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  }

  async getDataGap(id: string): Promise<DataGap | null> {
    return this.db.dataGaps.find(d => d.id === id) || null;
  }

  async createDataGap(data: CreateDataGapDTO): Promise<DataGap> {
    const now = new Date().toISOString();
    const gap: DataGap = {
      id: uuidv4(),
      element: data.element,
      coverage: data.coverage,
      priority: data.priority,
      impact: data.impact,
      effort: data.effort,
      createdAt: now,
      updatedAt: now,
    };
    this.db.dataGaps.push(gap);
    await this.save();
    return gap;
  }

  async updateDataGap(id: string, data: UpdateDataGapDTO): Promise<DataGap | null> {
    const idx = this.db.dataGaps.findIndex(d => d.id === id);
    if (idx === -1) return null;
    
    this.db.dataGaps[idx] = {
      ...this.db.dataGaps[idx],
      ...data,
      updatedAt: new Date().toISOString(),
    };
    await this.save();
    return this.db.dataGaps[idx];
  }

  async deleteDataGap(id: string): Promise<boolean> {
    const idx = this.db.dataGaps.findIndex(d => d.id === id);
    if (idx === -1) return false;
    this.db.dataGaps.splice(idx, 1);
    await this.save();
    return true;
  }

  // Decisions
  async getDecisions(): Promise<Decision[]> {
    return [...this.db.decisions].sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }

  async createDecision(data: CreateDecisionDTO): Promise<Decision> {
    const decision: Decision = {
      id: uuidv4(),
      date: data.date,
      decision: data.decision,
      rationale: data.rationale,
      createdAt: new Date().toISOString(),
    };
    this.db.decisions.push(decision);
    await this.save();
    return decision;
  }

  // V3 Prep: Context Switch Tracking
  async logContextSwitch(taskId: string): Promise<void> {
    const count = contextSwitchCounts.get(taskId) || 0;
    contextSwitchCounts.set(taskId, count + 1);
  }

  async completeTask(
    taskId: string,
    outcome: 'completed' | 'cancelled' | 'deferred'
  ): Promise<TaskCompletionRecord | null> {
    const task = await this.getTask(taskId);
    if (!task) return null;

    const completedAt = new Date().toISOString();
    const createdAt = new Date(task.createdAt).getTime();
    const completedTime = new Date(completedAt).getTime();
    const hoursElapsed = (completedTime - createdAt) / (1000 * 60 * 60);

    const record: TaskCompletionRecord = {
      id: uuidv4(),
      taskId,
      actualCompletionTime: Math.round(hoursElapsed * 100) / 100,
      wasBlocking: !!task.blocking,
      userOverrideCount: 0, // TODO: Track priority changes
      contextSwitchCount: contextSwitchCounts.get(taskId) || 0,
      outcome,
      completedAt,
    };

    this.db.completionRecords.push(record);
    contextSwitchCounts.delete(taskId);

    // Update task status
    await this.updateTask(taskId, { status: 'complete' });

    return record;
  }

  async getCompletionRecords(): Promise<TaskCompletionRecord[]> {
    return this.db.completionRecords;
  }
}

export const storage = new JsonStorage();
