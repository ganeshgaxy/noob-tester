export type StepConfidence = "confident" | "uncertain";

export type StepCategory =
  | "functional"
  | "visual"
  | "accessibility"
  | "performance"
  | "security";

export type StepStatus =
  | "pending"
  | "passed"
  | "failed"
  | "skipped"
  | "blocked";

export interface TestStep {
  id: string;
  order: number;
  description: string;
  confidence: StepConfidence;
  category?: StepCategory;
  status: StepStatus;
  resultJson?: string;
  notes?: string;
}

export interface TestPlan {
  steps: TestStep[];
  overallStrategy: string;
  estimatedComplexity: "low" | "medium" | "high";
}

export interface StepResult {
  stepId: string;
  status: StepStatus;
  details: string;
  issues: string[];
  screenshotPaths: string[];
  duration?: number;
}

export interface AutomationResult {
  issues: import("./issue.js").Issue[];
  stepResults: StepResult[];
}
