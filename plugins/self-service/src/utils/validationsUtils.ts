export const isValidEntityName = (
    name: string,
    isTag: boolean = false,
  ): { valid: boolean; error?: string } => {
    const field = isTag ? 'Tag' : 'Name';
    if (!name || name.trim().length === 0) {
      return { valid: false, error: `${field} is required` };
    }
  
    const trimmedName = name.trim();
  
    if (trimmedName.length < 1) {
      return { valid: false, error: `${field} must be at least 1 character long` };
    }
  
    if (trimmedName.length > 63) {
      return { valid: false, error: `${field} must be at most 63 characters long` };
    }
  
    if (/^[-_.]/.test(trimmedName)) {
      return {
        valid: false,
        error: `${field} cannot start with a hyphen, underscore, or dot`,
      };
    }
  
    if (/[-_.]$/.test(trimmedName)) {
      return {
        valid: false,
        error: `${field} cannot end with a hyphen, underscore, or dot`,
      };
    }
  
    if (/[-_.]{2,}/.test(trimmedName)) {
      return {
        valid: false,
        error: `${field} cannot contain consecutive hyphens, underscores, or dots`,
      };
    }
  
    const validPattern = /^[a-z0-9A-Z]+([-_][a-z0-9A-Z]+)*$/;
    if (!validPattern.test(trimmedName)) {
      return {
        valid: false,
        error:
          `${field} must consist of alphanumeric characters [a-z0-9A-Z] separated by hyphens, underscores, or dots`,
      };
    }
  
    if (
      trimmedName.toLowerCase().endsWith('.yaml') ||
      trimmedName.toLowerCase().endsWith('.yml')
    ) {
      return {
        valid: false,
        error:
          `${field} should not end with .yaml or .yml. A .yaml extension will automatically be added to the generated EE definition file name.`,
      };
    }
  
    return { valid: true };
  };
