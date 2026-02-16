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
  finalScore: number;
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
}

export interface PullRequestDetail extends PullRequestListItem {
  body: string | null;
  projects: string[];
  scoreBreakdown: AttentionScoreBreakdown | null;
}

export interface InboxResponse {
  items: PullRequestListItem[];
  total: number;
  badges: {
    needsReview: number;
    changesRequestedFollowUp: number;
    failingCi: number;
    hasConflicts: number;
  };
  syncedAt: string | null;
}

export interface ApiError {
  error: string;
  details?: string;
}

export interface TrackedRepository {
  fullName: string;
  owner: string;
  name: string;
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
