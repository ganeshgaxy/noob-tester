export type RunStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type InputType = "ticket" | "confluence" | "text" | "file";

/** Artifact types that can be captured during a run. */
export type CaptureType = "screenshot" | "snapshot" | "video" | "har" | "console" | "trace";

export interface RunConfig {
  targetUrl?: string;
  /** Which artifact types to capture during exploration. Defaults to all if omitted. */
  capture?: CaptureType[];
  /** Secret target name (from `noob-tester secrets`) — used for login credentials. */
  secretTarget?: string;
  /** Secret role within the target (default: "default"). */
  secretRole?: string;
  [key: string]: unknown;
}

export interface RunResult {
  runId: string;
  status: RunStatus;
  totalCost: number;
  totalTokens: number;
  issueCount: number;
  summary: string;
}
