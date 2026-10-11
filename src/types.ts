import type { CodexSelectionPolicy } from "./selection.ts";

export interface PoolSpec {
  home: string;
  selection?: CodexSelectionPolicy;
  accounts: string[];
  args?: string[];
  from?: Record<string, string>;
}

export interface Pool extends PoolSpec {
  name: string;
}

export type Pools = Record<string, PoolSpec>;

export interface RateWindow {
  usedPercent?: number;
  windowDurationMins?: number;
  resetsAt?: number;
}

export interface RateLimits {
  planType?: string | null;
  primary?: RateWindow | null;
  secondary?: RateWindow | null;
  rateLimitReachedType?: string | null;
}

export interface AccountUsage {
  resetCredits: number | null;
  rateLimits: RateLimits | null;
}

export interface AccountRow {
  account: string;
  authenticated?: boolean;
  plan?: string | null;
  resetCredits?: number | null;
  resetError?: string;
  rateLimits?: RateLimits | null;
}

export interface AccountListing {
  current?: string;
  accounts: AccountRow[];
}
