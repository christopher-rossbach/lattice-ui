/**
 * Collect all app state from localStorage and return it as a JSON string
 * suitable for pasting into initialState.ts.
 */
export function collectCurrentDefaults(): string {
  const get = (key: string) => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  const primaryGraph = get('lattice-state-v1-primary');
  const secondaryGraph = get('lattice-state-v1-secondary');
  const savedLattices = get('lattice-saves-v1');

  // Checks storage contains checks, functions, autoRun, and customCodes
  const checksRaw = get('lattice-checks-v1');
  let checksAndHelpers = null;
  if (checksRaw && typeof checksRaw === 'object') {
    checksAndHelpers = {
      checks: Array.isArray(checksRaw.checks)
        ? checksRaw.checks.map((c: any) => ({
            id: c.id,
            name: c.name,
            code: c.code,
            expanded: false,
          }))
        : [],
      autoRun: checksRaw.autoRun ?? false,
      functions: Array.isArray(checksRaw.functions)
        ? checksRaw.functions.map((f: any) => ({
            id: f.id,
            name: f.name,
            code: f.code,
            expanded: false,
          }))
        : [],
      customCodes: Array.isArray(checksRaw.customCodes) ? checksRaw.customCodes : [],
    };
  }

  const defaults = {
    primaryGraph,
    secondaryGraph,
    savedLattices,
    checksAndHelpers,
  };

  return JSON.stringify(defaults, null, 2);
}
