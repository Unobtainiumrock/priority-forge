/**
 * Generic Min-Heap implementation for V2 priority queue
 * Lower priority scores = higher priority (extracted first)
 */

export interface HeapItem {
  id: string;
  priorityScore: number;
}

export class MinHeap<T extends HeapItem> {
  private heap: T[] = [];
  private idToIndex: Map<string, number> = new Map();

  constructor(items: T[] = []) {
    if (items.length > 0) {
      this.buildHeap(items);
    }
  }

  /**
   * Build heap from array in O(n) time
   */
  private buildHeap(items: T[]): void {
    this.heap = [...items];
    this.idToIndex.clear();
    
    // Build index map
    for (let i = 0; i < this.heap.length; i++) {
      this.idToIndex.set(this.heap[i].id, i);
    }
    
    // Heapify from bottom up
    for (let i = Math.floor(this.heap.length / 2) - 1; i >= 0; i--) {
      this.siftDown(i);
    }
  }

  /**
   * Get parent index
   */
  private parent(i: number): number {
    return Math.floor((i - 1) / 2);
  }

  /**
   * Get left child index
   */
  private leftChild(i: number): number {
    return 2 * i + 1;
  }

  /**
   * Get right child index
   */
  private rightChild(i: number): number {
    return 2 * i + 2;
  }

  /**
   * Swap two elements and update index map
   */
  private swap(i: number, j: number): void {
    this.idToIndex.set(this.heap[i].id, j);
    this.idToIndex.set(this.heap[j].id, i);
    [this.heap[i], this.heap[j]] = [this.heap[j], this.heap[i]];
  }

  /**
   * Restore heap property by moving element up
   */
  private siftUp(i: number): void {
    while (i > 0 && this.heap[this.parent(i)].priorityScore > this.heap[i].priorityScore) {
      this.swap(i, this.parent(i));
      i = this.parent(i);
    }
  }

  /**
   * Restore heap property by moving element down
   */
  private siftDown(i: number): void {
    let minIndex = i;
    const left = this.leftChild(i);
    const right = this.rightChild(i);

    if (left < this.heap.length && this.heap[left].priorityScore < this.heap[minIndex].priorityScore) {
      minIndex = left;
    }

    if (right < this.heap.length && this.heap[right].priorityScore < this.heap[minIndex].priorityScore) {
      minIndex = right;
    }

    if (minIndex !== i) {
      this.swap(i, minIndex);
      this.siftDown(minIndex);
    }
  }

  /**
   * View highest priority item without removing
   */
  peek(): T | null {
    return this.heap.length > 0 ? this.heap[0] : null;
  }

  /**
   * Remove and return highest priority item
   */
  pop(): T | null {
    if (this.heap.length === 0) return null;
    
    const result = this.heap[0];
    this.idToIndex.delete(result.id);
    
    if (this.heap.length === 1) {
      this.heap.pop();
      return result;
    }

    // Move last element to root and sift down
    const last = this.heap.pop()!;
    this.heap[0] = last;
    this.idToIndex.set(last.id, 0);
    this.siftDown(0);
    
    return result;
  }

  /**
   * Add new item to heap
   */
  push(item: T): void {
    this.heap.push(item);
    const idx = this.heap.length - 1;
    this.idToIndex.set(item.id, idx);
    this.siftUp(idx);
  }

  /**
   * Update an existing item and re-heapify
   */
  update(id: string, updatedItem: T): boolean {
    const idx = this.idToIndex.get(id);
    if (idx === undefined) return false;

    const oldScore = this.heap[idx].priorityScore;
    this.heap[idx] = updatedItem;
    
    // Update ID mapping if ID changed
    if (id !== updatedItem.id) {
      this.idToIndex.delete(id);
      this.idToIndex.set(updatedItem.id, idx);
    }

    // Re-heapify based on score change direction
    if (updatedItem.priorityScore < oldScore) {
      this.siftUp(idx);
    } else if (updatedItem.priorityScore > oldScore) {
      this.siftDown(idx);
    }
    
    return true;
  }

  /**
   * Remove item by ID
   */
  remove(id: string): T | null {
    const idx = this.idToIndex.get(id);
    if (idx === undefined) return null;

    const item = this.heap[idx];
    this.idToIndex.delete(id);

    if (idx === this.heap.length - 1) {
      this.heap.pop();
      return item;
    }

    // Replace with last element
    const last = this.heap.pop()!;
    this.heap[idx] = last;
    this.idToIndex.set(last.id, idx);

    // Re-heapify
    const parentIdx = this.parent(idx);
    if (idx > 0 && this.heap[parentIdx].priorityScore > this.heap[idx].priorityScore) {
      this.siftUp(idx);
    } else {
      this.siftDown(idx);
    }

    return item;
  }

  /**
   * Get item by ID without removing
   */
  get(id: string): T | null {
    const idx = this.idToIndex.get(id);
    return idx !== undefined ? this.heap[idx] : null;
  }

  /**
   * Check if ID exists in heap
   */
  has(id: string): boolean {
    return this.idToIndex.has(id);
  }

  /**
   * Get heap size
   */
  size(): number {
    return this.heap.length;
  }

  /**
   * Check if heap is empty
   */
  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  /**
   * Get sorted array (ascending by priority score)
   */
  toSortedArray(): T[] {
    return [...this.heap].sort((a, b) => a.priorityScore - b.priorityScore);
  }

  /**
   * Get raw heap array (for serialization)
   */
  toArray(): T[] {
    return [...this.heap];
  }

  /**
   * Rebuild entire heap (useful after bulk updates)
   */
  rebuild(): void {
    this.buildHeap(this.heap);
  }
}

