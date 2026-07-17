export class ExecutePermissionStore {
  private userToTemplates = new Map<string, Set<string>>();

  update(templateToUsers: Map<string, string[]>): void {
    const newMap = new Map<string, Set<string>>();
    for (const [templateId, usernames] of templateToUsers) {
      for (const username of usernames) {
        const templates = newMap.get(username) ?? new Set<string>();
        templates.add(templateId);
        newMap.set(username, templates);
      }
    }
    this.userToTemplates = newMap;
  }

  getTemplateIdsForUser(username: string): string[] {
    return [...(this.userToTemplates.get(username) ?? [])];
  }

  hasExecutePermission(username: string, templateId: string): boolean {
    return this.userToTemplates.get(username)?.has(templateId) ?? false;
  }

  get size(): number {
    return this.userToTemplates.size;
  }
}

export const executePermissionStore = new ExecutePermissionStore();
