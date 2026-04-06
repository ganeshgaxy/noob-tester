/** Row types matching the SQL schema. */

export interface RunRow {
  id: string;
  created_at: string;
  updated_at: string;
  status: string;
  input_type: string;
  input_ref: string;
  input_full: string;
  target_url: string | null;
  config_json: string;
  total_cost: number;
  total_tokens: number;
  summary: string | null;
  phase: number;
  capture_config: string | null;
  secret_target: string | null;
  secret_role: string | null;
}

export interface ActionLogRow {
  id: string;
  run_id: string;
  created_at: string;
  phase: number;
  agent_name: string;
  prompt_hash: string | null;
  prompt_text: string;
  result_json: string | null;
  result_text: string | null;
  cost_usd: number | null;
  tokens_used: number | null;
  duration_ms: number | null;
  status: string;
  error_message: string | null;
  outcome_summary: string | null;
}

export interface AnalysisRow {
  id: string;
  run_id: string;
  created_at: string;
  analysis_type: string;
  content_json: string;
  confidence: number | null;
  summary: string | null;
}

export interface TestPlanRow {
  id: string;
  run_id: string;
  created_at: string;
  plan_json: string;
  test_notes: string | null;
  analysis_run_id: string | null;
}

export interface TestStepRow {
  id: string;
  plan_id: string;
  run_id: string;
  step_order: number;
  description: string;
  confidence: string;
  category: string | null;
  status: string;
  executed_at: string | null;
  result_json: string | null;
  notes: string | null;
}

export interface IssueRow {
  id: string;
  run_id: string;
  step_id: string | null;
  created_at: string;
  category: string;
  severity: string;
  title: string;
  description: string;
  location: string | null;
  screenshot_path: string | null;
  video_path: string | null;
  console_log: string | null;
  network_data: string | null;
  raw_output: string | null;
  is_retry: number;
  retry_count: number;
}

export interface FailurePatternRow {
  id: string;
  created_at: string;
  updated_at: string;
  pattern_hash: string;
  category: string;
  location_pattern: string;
  title_pattern: string;
  occurrence_count: number;
  first_seen_run: string;
  last_seen_run: string;
  severity_mode: string;
  notes: string | null;
  is_known_issue: number;
}

export interface RawOutputRow {
  id: string;
  run_id: string;
  action_id: string | null;
  created_at: string;
  source: string;
  output_type: string;
  content: string | null;
  file_path: string | null;
  metadata_json: string | null;
}

export interface RunPackEntryRow {
  id: string;
  run_pack_id: string;
  ticket_id: string;
  run_id: string;
  session_id: string | null;
  test_case_id: string;
  tc_title: string | null;
  fresh_or_existing: string;
  status: string;
  results: string | null;
  logs: string | null;
  observations: string | null;
  issues: string | null;
  artifacts: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  target_url: string | null;
  secret_target: string | null;
  secret_role: string | null;
  capture_config: string | null;
  runner: string | null;
}

export interface RunArtifactRow {
  id: string;
  run_id: string;
  run_pack_id: string | null;
  entry_id: string | null;
  session_id: string | null;
  ticket_id: string | null;
  action_index: number;
  action_desc: string | null;
  page_url: string | null;
  artifact_type: string;
  file_path: string | null;
  content: string | null;
  metadata: string | null;
  created_at: string;
}

export interface CodeChunkRow {
  id: string;
  repo_url: string;
  file_path: string;
  chunk_index: number;
  content: string;
  language: string | null;
  created_at: string;
  metadata_json: string | null;
}

export interface UiMapRow {
  id: string;
  name: string;
  description: string | null;
  repo_urls: string;
  target_urls: string;
  ticket_ids: string;
  created_at: string;
  updated_at: string;
}

export interface UiMapPageRow {
  id: string;
  ui_map_id: string;
  url_pattern: string;
  page_title: string | null;
  description: string | null;
  snapshot_path: string | null;
  screenshot_path: string | null;
  auth_required: number;
  auth_roles: string;
  related_code: string;
  related_repos: string;
  ticket_ids: string;
  target_parity: string;
  status: string;
  last_verified_at: string | null;
  last_verified_run: string | null;
  created_by_run: string | null;
  created_by_session: string | null;
  created_by_ticket: string | null;
  updated_by_run: string | null;
  updated_by_ticket: string | null;
  created_at: string;
  updated_at: string;
}

export interface UiMapElementRow {
  id: string;
  page_id: string;
  ui_map_id: string;
  selector: string;
  alt_selectors: string;
  element_type: string;
  element_role: string | null;
  element_text: string | null;
  element_name: string | null;
  position_hint: string | null;
  action_type: string | null;
  action_result: string | null;
  related_code: string | null;
  related_repos: string;
  ticket_ids: string;
  auth_roles: string;
  target_parity: string;
  times_used: number;
  times_succeeded: number;
  times_failed: number;
  status: string;
  last_used_at: string | null;
  last_used_run: string | null;
  created_by_run: string | null;
  created_by_session: string | null;
  created_by_ticket: string | null;
  created_by_testcase: string | null;
  updated_by_run: string | null;
  updated_by_ticket: string | null;
  created_at: string;
  updated_at: string;
}

export interface UiMapNavigationRow {
  id: string;
  ui_map_id: string;
  from_page_id: string;
  to_page_id: string;
  via_element_id: string | null;
  nav_type: string;
  conditions: string;
  ticket_ids: string;
  auth_roles: string;
  target_parity: string;
  status: string;
  times_used: number;
  created_by_run: string | null;
  created_by_ticket: string | null;
  updated_by_run: string | null;
  updated_by_ticket: string | null;
  created_at: string;
  updated_at: string;
}

export interface UiMapFormRow {
  id: string;
  page_id: string;
  ui_map_id: string;
  form_selector: string | null;
  form_name: string | null;
  fields: string;
  submit_element_id: string | null;
  success_indicator: string | null;
  error_indicator: string | null;
  sample_values: string;
  ticket_ids: string;
  auth_roles: string;
  target_parity: string;
  status: string;
  created_by_run: string | null;
  created_by_ticket: string | null;
  updated_by_run: string | null;
  updated_by_ticket: string | null;
  created_at: string;
  updated_at: string;
}

export interface ImpactAreaRow {
  id: string;
  analysis_id: string;
  run_id: string;
  area_type: string;
  description: string;
  severity: string | null;
  affected: string | null;
  created_at: string;
}

export interface CoverageGapRow {
  id: string;
  plan_id: string;
  run_id: string;
  gap_description: string;
  severity: string | null;
  category: string | null;
  created_at: string;
}

export interface PhaseTransitionRow {
  id: string;
  run_id: string;
  session_id: string | null;
  from_phase: number;
  to_phase: number;
  transitioned_at: string;
}

export interface ApiMapRow {
  id: string;
  name: string;
  description: string | null;
  base_url: string | null;
  repo_urls: string;
  ticket_ids: string;
  created_at: string;
  updated_at: string;
}

export interface ApiMapEndpointRow {
  id: string;
  api_map_id: string;
  method: string;
  path: string;
  summary: string | null;
  auth_type: string;
  auth_roles: string;
  request_content_type: string;
  status: string;
  times_called: number;
  times_succeeded: number;
  times_failed: number;
  avg_response_ms: number;
  last_status_code: number | null;
  last_called_at: string | null;
  last_called_run: string | null;
  created_by_run: string | null;
  created_by_ticket: string | null;
  updated_by_run: string | null;
  ticket_ids: string;
  created_at: string;
  updated_at: string;
}

export interface ApiMapParamRow {
  id: string;
  endpoint_id: string;
  api_map_id: string;
  name: string;
  location: string;
  param_type: string;
  required: number;
  description: string | null;
  example_value: string | null;
  validation: string | null;
  created_at: string;
}

export interface ApiMapResponseRow {
  id: string;
  endpoint_id: string;
  api_map_id: string;
  status_code: number;
  description: string | null;
  schema_json: string | null;
  example_json: string | null;
  created_at: string;
}

export interface ApiMapChainRow {
  id: string;
  api_map_id: string;
  from_endpoint_id: string;
  to_endpoint_id: string;
  chain_type: string;
  description: string | null;
  ticket_ids: string;
  created_by_run: string | null;
  created_at: string;
}

export interface TicketContextRow {
  id: string;
  ticket_id: string;
  context_type: string;
  file_path: string;
  fetched_at: string;
  ttl_minutes: number;
  source: string | null;
  size_bytes: number;
}

export interface BlockerRow {
  id: string;
  plan_id: string;
  run_id: string;
  ticket_id: string | null;
  description: string;
  severity: string | null;
  status: string;
  resolved_at: string | null;
  resolution: string | null;
  created_at: string;
}

export interface CoverageMapRow {
  id: string;
  test_case_id: string;
  repo_name: string;
  file_path: string;
  function_name: string | null;
  link_type: string;
  confidence: number;
  created_at: string;
}

export interface RcaResultRow {
  id: string;
  run_pack_id: string;
  entry_id: string;
  test_case_id: string;
  classification: string;
  confidence: number;
  root_cause: string;
  evidence_summary: string | null;
  failure_pattern_id: string | null;
  suggested_action: string | null;
  created_at: string;
}

export interface VisualBaselineRow {
  id: string;
  ui_map_page_id: string;
  url_pattern: string;
  viewport: string;
  baseline_path: string;
  baseline_hash: string | null;
  source_run_id: string | null;
  source_entry_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface VisualDiffRow {
  id: string;
  baseline_id: string;
  run_id: string;
  entry_id: string | null;
  current_path: string;
  diff_score: number | null;
  description: string | null;
  is_regression: number;
  reviewed: number;
  created_at: string;
}

export interface A11yIssueRow {
  id: string;
  run_id: string;
  run_pack_id: string | null;
  entry_id: string | null;
  page_url: string;
  ui_map_page_id: string | null;
  rule_id: string;
  impact: string;
  wcag_criteria: string | null;
  wcag_level: string | null;
  description: string;
  html_snippet: string | null;
  selector: string | null;
  help_url: string | null;
  created_at: string;
}
