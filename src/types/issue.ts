export type IssueCategory =
  | "ui"
  | "accessibility"
  | "network"
  | "console"
  | "visual"
  | "layout"
  | "content"
  | "functional"
  | "performance";

export type IssueSeverity =
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "info";

export interface Issue {
  id: string;
  runId: string;
  stepId?: string;
  category: IssueCategory;
  severity: IssueSeverity;
  title: string;
  description: string;
  location?: string;
  screenshotPath?: string;
  videoPath?: string;
  consoleLog?: string;
  networkData?: string;
  rawOutput?: string;
  isRetry: boolean;
  retryCount: number;
}
