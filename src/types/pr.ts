export type PullRequestState = "OPEN" | "CLOSED" | "MERGED";
export type CiState = "SUCCESS" | "FAILURE" | "PENDING" | "UNKNOWN";
export type ReviewState =
  | "REVIEW_REQUESTED"
  | "APPROVED"
  | "CHANGES_REQUESTED"
  | "COMMENTED"
  | "UNREVIEWED"
  | "DRAFT";

export interface AttentionScoreBreakdown {
  reviewRequestBoost: number;
  assigneeBoost: number;
  ciPenalty: number;
  stalenessBoost: number;
  draftPenalty: number;
  mentionBoost: number;
  sizeBoost: number;
  activityBoost: number;
  commitBoost: number;
  myLastActivityPenalty: number;
  finalScore: number;
}

export interface FlowViolationInfo {
  expectedTargets: string[];
  message: string;
}

export interface PullRequestListItem {
  id: string;
  repository: string;
  number: number;
  title: string;
  url: string;
  state: PullRequestState;
  draft: boolean;
  authorLogin: string;
  ciState: CiState;
  reviewState: ReviewState;
  labels: string[];
  assignees: string[];
  requestedReviewers: string[];
  milestone: string | null;
  updatedAt: string;
  createdAt: string;
  needsAttention: boolean;
  attentionReason: string | null;
  urgencyScore: number;
  hasConflicts: boolean | null;
  headRef: string | null;
  baseRef: string | null;
  flowPhase: string | null;
  flowViolation: FlowViolationInfo | null;
  riskLevel?: string | null;
}

export interface PullRequestDetail extends PullRequestListItem {
  body: string | null;
  projects: string[];
  scoreBreakdown: AttentionScoreBreakdown | null;
  aiSummary?: AiSummary | null;
  riskAssessment?: RiskAssessment | null;
}

export interface InboxResponse {
  items: PullRequestListItem[];
  total: number;
  badges: {
    needsReview: number;
    changesRequestedFollowUp: number;
    failingCi: number;
    hasConflicts: number;
    flowViolations: number;
  };
  syncedAt: string | null;
}

export interface AiSummary {
  summary: string;
  keyChanges: Array<{ file: string; description: string }>;
  changeType: "feature" | "bugfix" | "refactor" | "docs" | "chore" | "other";
}

export interface RiskAssessment {
  riskLevel: "low" | "medium" | "high" | "critical";
  riskFactors: Array<{
    category: "security" | "data" | "api" | "infrastructure" | "quality";
    description: string;
    severity: "low" | "medium" | "high";
  }>;
  explanation: string;
}

export interface LabelSuggestion {
  name: string;
  confidence: number;
  reason: string;
}

export interface ReviewerSuggestion {
  login: string;
  score: number;
  reasons: string[];
}

export interface PrRelationship {
  prIdA: string;
  prIdB: string;
  type: "related" | "depends-on" | "conflicts";
  reason: string;
}

export interface ApiError {
  error: string;
  details?: string;
}

export interface TrackedRepository {
  fullName: string;
  owner: string;
  name: string;
  defaultBranch?: string | null;
}

export interface TrackedReposResponse {
  trackedRepos: TrackedRepository[];
}

export interface AvailableReposResponse {
  repositories: TrackedRepository[];
}

export interface AddTrackedRepoRequest {
  fullName: string;
}

export interface RemoveTrackedRepoRequest {
  fullName: string;
}

export interface AuthUser {
  login?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
}

export interface AuthSessionResponse {
  authenticated: boolean;
  user: AuthUser | null;
}
