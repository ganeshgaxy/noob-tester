export interface GapAnalysis {
  knownFacts: string[];
  unknowns: string[];
  assumptions: string[];
  blockedItems: string[];
}

export interface RequirementsAnalysis {
  explicitRequirements: string[];
  implicitRequirements: string[];
  missingRequirements: string[];
  ambiguousRequirements: string[];
}

export interface FeasibilityAnalysis {
  testable: boolean;
  blockers: string[];
  risks: string[];
  recommendedApproach: string;
}

export interface CodebaseInsight {
  filePath: string;
  relevance: string;
  notes: string;
}

export interface AnalysisResult {
  taskSummary: string;
  gapAnalysis: GapAnalysis;
  requirementsAnalysis: RequirementsAnalysis;
  feasibilityAnalysis: FeasibilityAnalysis;
  codebaseInsights: CodebaseInsight[];
}
