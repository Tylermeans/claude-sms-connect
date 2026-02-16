/**
 * ProjectRegistry - Multi-project state management for Claude Code sessions
 *
 * Tracks multiple simultaneous Claude Code projects with unique IDs, enforces
 * global arming state, and provides rate limiting support.
 *
 * DESIGN PRINCIPLES:
 * - Starts disarmed (armed=false) per RELAY-09 requirement (OFF by default)
 * - Returns boolean from register() to trigger welcome SMS on first registration (RELAY-10)
 * - Preserves lastNotified and registeredAt when updating existing projects
 * - Map preserves insertion order (ES2015 spec) for consistent numbered display
 * - canNotify() respects both arming state and 5-second rate limit (OPS-01)
 */

export interface ProjectMetadata {
  /** Tmux session identifier for routing responses */
  sessionId: string;
  /** Human-readable name for SMS display */
  projectName: string;
  /** Timestamp for rate limiting (0 = never notified) */
  lastNotified: number;
  /** Timestamp for tracking registration time */
  registeredAt: number;
}

/**
 * ProjectRegistry singleton for managing multiple Claude Code projects
 *
 * Provides registration, lookup, rate limiting, and arming controls for
 * multi-project SMS notification workflow.
 */
export class ProjectRegistry {
  /** Project storage with insertion order preserved (ES2015 Map spec) */
  private projects: Map<string, ProjectMetadata> = new Map();

  /** Global arming state - controls whether ANY notifications can be sent */
  private armed = false;

  /**
   * Register or update a project in the registry.
   *
   * Returns true if this is the first registration (triggers welcome SMS per RELAY-10).
   * When updating existing project, preserves lastNotified and registeredAt.
   *
   * @param projectId - Unique project identifier
   * @param sessionId - Tmux session identifier for routing
   * @param projectName - Human-readable project name
   * @returns true if first registration, false if updating existing
   */
  register(projectId: string, sessionId: string, projectName: string): boolean {
    const existing = this.projects.get(projectId);
    const isFirstRegistration = !existing;

    const metadata: ProjectMetadata = {
      sessionId,
      projectName,
      lastNotified: existing?.lastNotified ?? 0,
      registeredAt: existing?.registeredAt ?? Date.now(),
    };

    this.projects.set(projectId, metadata);

    if (isFirstRegistration) {
      console.log(`[ProjectRegistry] New project registered: ${projectId} (${projectName})`);
    } else {
      console.log(`[ProjectRegistry] Project updated: ${projectId} (${projectName})`);
    }

    return isFirstRegistration;
  }

  /**
   * Get all active projects as array.
   *
   * Map preserves insertion order (ES2015 spec), ensuring consistent
   * numbered display for SMS routing.
   *
   * @returns Array of all registered projects in insertion order
   */
  getActiveProjects(): ProjectMetadata[] {
    return Array.from(this.projects.values());
  }

  /**
   * Get project by 0-indexed position.
   *
   * Used for routing numbered SMS responses ("1 Y" -> index 0).
   * Map iteration order is guaranteed (ES2015 spec).
   *
   * @param index - Zero-based index position
   * @returns Project metadata or undefined if index out of bounds
   */
  getByIndex(index: number): ProjectMetadata | undefined {
    const projects = this.getActiveProjects();
    return projects[index];
  }

  /**
   * Get project metadata by ID.
   *
   * @param projectId - Unique project identifier
   * @returns Project metadata or undefined if not found
   */
  get(projectId: string): ProjectMetadata | undefined {
    return this.projects.get(projectId);
  }

  /**
   * Check if a project can send a notification.
   *
   * Enforces both global arming state and per-project rate limiting (OPS-01).
   *
   * RULES:
   * - If armed === false, returns false (no notifications allowed)
   * - If lastNotified === 0, returns true (never notified before)
   * - Otherwise checks if 5+ seconds have elapsed since last notification
   *
   * @param projectId - Unique project identifier
   * @returns true if notification allowed, false otherwise
   */
  canNotify(projectId: string): boolean {
    if (!this.armed) {
      return false;
    }

    const project = this.projects.get(projectId);
    if (!project) {
      return false;
    }

    // Never notified before - allow
    if (project.lastNotified === 0) {
      return true;
    }

    // Check 5-second rate limit (OPS-01)
    const elapsedMs = Date.now() - project.lastNotified;
    const canNotify = elapsedMs >= 5000;

    return canNotify;
  }

  /**
   * Record that a notification was sent for a project.
   *
   * Updates lastNotified timestamp for rate limiting.
   *
   * @param projectId - Unique project identifier
   */
  recordNotification(projectId: string): void {
    const project = this.projects.get(projectId);
    if (project) {
      project.lastNotified = Date.now();
      console.log(`[ProjectRegistry] Notification recorded for ${projectId}`);
    }
  }

  /**
   * Set global armed state.
   *
   * When armed=false, NO notifications will be sent (RELAY-09).
   * When armed=true, notifications respect per-project rate limits.
   *
   * @param armed - New armed state
   */
  setArmed(armed: boolean): void {
    const previous = this.armed;
    this.armed = armed;
    console.log(`[ProjectRegistry] Armed state changed: ${previous} -> ${armed}`);
  }

  /**
   * Get current global armed state.
   *
   * @returns true if armed (notifications enabled), false otherwise
   */
  isArmed(): boolean {
    return this.armed;
  }

  /**
   * Remove a project from the registry.
   *
   * Used for cleanup when tmux session no longer exists (OPS-05).
   *
   * @param projectId - Unique project identifier
   * @returns true if project was removed, false if not found
   */
  remove(projectId: string): boolean {
    const existed = this.projects.has(projectId);
    const deleted = this.projects.delete(projectId);

    if (deleted) {
      console.log(`[ProjectRegistry] Project removed: ${projectId}`);
    }

    return existed;
  }

  /**
   * Get total number of registered projects.
   *
   * @returns Count of active projects
   */
  count(): number {
    return this.projects.size;
  }
}

// Export singleton instance for application use
export const projectRegistry = new ProjectRegistry();
