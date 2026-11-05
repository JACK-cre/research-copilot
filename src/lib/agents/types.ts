export type AgentName =
  | 'planner'
  | 'researcher'
  | 'librarian'
  | 'assembler'
  | 'writer'
  | 'critic'
  | 'presenter'
  | 'tutor';

export type AgentTraceStatus = 'ok' | 'skipped' | 'failed';

export interface AgentTraceStep {
  agent: AgentName;
  title: string;
  status: AgentTraceStatus;
  summary: string;
  durationMs: number;
}

export interface CriticReport {
  score: number;
  issues: string[];
  shouldRevise: boolean;
}
