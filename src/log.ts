const levels = { debug: 0, info: 1, warn: 2, error: 3 };
type Level = keyof typeof levels;

export function logger(module: string) {
  return (action: string, fields: Record<string, string | number> = {}, level: Level = "info") => {
    const requested = process.env.LOG_LEVEL ?? "warn";
    const threshold = requested in levels ? levels[requested as Level] : levels.warn;
    if (levels[level] < threshold) return;
    const context = Object.entries(fields)
      .map(([key, value]) => `${key}=${value}`)
      .join(" ");
    console.error(`[ha-switch:${module}:${action}]${context ? ` ${context}` : ""}`);
  };
}
