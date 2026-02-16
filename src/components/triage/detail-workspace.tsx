"use client";

import type { FormEvent } from "react";
import type { PullRequestDetail, PullRequestListItem } from "@/types/pr";
import styles from "../pr-attention-manager.module.css";
import {
  TRIAGE_CONTROL_IDS,
  type MutateTarget,
  type PendingReviewMode,
  type ReviewEvent,
} from "./contracts";
import { Disclosure } from "./disclosure";

interface DetailWorkspaceProps {
  selectedId: string | null;
  selectedListItem: PullRequestListItem | null;
  detail: PullRequestDetail | null;
  detailLoading: boolean;
  detailError: string | null;
  writing: boolean;
  commentBody: string;
  reviewBody: string;
  reviewEvent: ReviewEvent;
  pendingReviewMode: PendingReviewMode;
  pendingReviewId: string;
  labelName: string;
  assigneeLogin: string;
  reviewerLogin: string;
  propTitle: string;
  propBody: string;
  propState: "open" | "closed";
  milestoneNumber: string;
  projectIdsCsv: string;
  onCommentBodyChange: (value: string) => void;
  onReviewBodyChange: (value: string) => void;
  onReviewEventChange: (value: ReviewEvent) => void;
  onPendingReviewModeChange: (value: PendingReviewMode) => void;
  onPendingReviewIdChange: (value: string) => void;
  onLabelNameChange: (value: string) => void;
  onAssigneeLoginChange: (value: string) => void;
  onReviewerLoginChange: (value: string) => void;
  onPropTitleChange: (value: string) => void;
  onPropBodyChange: (value: string) => void;
  onPropStateChange: (value: "open" | "closed") => void;
  onMilestoneNumberChange: (value: string) => void;
  onProjectIdsCsvChange: (value: string) => void;
  onSubmitComment: (event: FormEvent<HTMLFormElement>) => void;
  onSubmitQuickReview: (event: FormEvent<HTMLFormElement>) => void;
  onSubmitPendingReview: (event: FormEvent<HTMLFormElement>) => void;
  onSubmitProperties: (event: FormEvent<HTMLFormElement>) => void;
  onMutateStringItem: (target: MutateTarget, value: string, method: "POST" | "DELETE") => void;
  advancedActionsOpen: boolean;
  onAdvancedActionsOpenChange: (open: boolean) => void;
}

export function DetailWorkspace({
  selectedId,
  selectedListItem,
  detail,
  detailLoading,
  detailError,
  writing,
  commentBody,
  reviewBody,
  reviewEvent,
  pendingReviewMode,
  pendingReviewId,
  labelName,
  assigneeLogin,
  reviewerLogin,
  propTitle,
  propBody,
  propState,
  milestoneNumber,
  projectIdsCsv,
  onCommentBodyChange,
  onReviewBodyChange,
  onReviewEventChange,
  onPendingReviewModeChange,
  onPendingReviewIdChange,
  onLabelNameChange,
  onAssigneeLoginChange,
  onReviewerLoginChange,
  onPropTitleChange,
  onPropBodyChange,
  onPropStateChange,
  onMilestoneNumberChange,
  onProjectIdsCsvChange,
  onSubmitComment,
  onSubmitQuickReview,
  onSubmitPendingReview,
  onSubmitProperties,
  onMutateStringItem,
  advancedActionsOpen,
  onAdvancedActionsOpenChange,
}: DetailWorkspaceProps) {
  return (
    <article
      id={TRIAGE_CONTROL_IDS.detailPanel}
      data-control-id={TRIAGE_CONTROL_IDS.detailPanel}
      className={styles.detailPanel}
      tabIndex={-1}
    >
      {!selectedId && <p className={styles.subtleText}>Select a pull request to view details.</p>}

      {selectedId && detailLoading && <p className={styles.subtleText}>Loading details...</p>}

      {selectedId && !detailLoading && detail && (
        <>
          <header className={styles.panelHeader}>
            <div>
              <h2>
                {detail.repository} #{detail.number}
              </h2>
              <p className={styles.listItemTitle}>{detail.title}</p>
            </div>
            <a
              id={TRIAGE_CONTROL_IDS.openOnGithub}
              data-control-id={TRIAGE_CONTROL_IDS.openOnGithub}
              data-shortcut-target={TRIAGE_CONTROL_IDS.openOnGithub}
              href={detail.url}
              target="_blank"
              rel="noreferrer"
              className={styles.linkButton}
            >
              Open on GitHub
            </a>
          </header>

          <div className={styles.detailGrid}>
            <p>
              <strong>Author:</strong> {detail.authorLogin}
            </p>
            <p>
              <strong>State:</strong> {detail.state}
            </p>
            <p>
              <strong>Review:</strong> {detail.reviewState}
            </p>
            <p>
              <strong>CI:</strong> {detail.ciState}
            </p>
            <p>
              <strong>Updated:</strong> {new Date(detail.updatedAt).toLocaleString()}
            </p>
            <p>
              <strong>Urgency:</strong> {Math.round(detail.urgencyScore)}
            </p>
          </div>

          <section className={styles.tagSection}>
            <h3>Labels</h3>
            <div className={styles.tagRow}>
              {(detail.labels.length ? detail.labels : ["No labels"]).map((label) => (
                <span key={label} className={styles.tagPill}>
                  {label}
                </span>
              ))}
            </div>
          </section>

          <section className={styles.tagSection}>
            <h3>Assignees</h3>
            <div className={styles.tagRow}>
              {(detail.assignees.length ? detail.assignees : ["No assignees"]).map((assignee) => (
                <span key={assignee} className={styles.tagPill}>
                  {assignee}
                </span>
              ))}
            </div>
          </section>

          <section className={styles.tagSection}>
            <h3>Requested reviewers</h3>
            <div className={styles.tagRow}>
              {(detail.requestedReviewers.length ? detail.requestedReviewers : ["No requested reviewers"]).map(
                (reviewer) => (
                  <span key={reviewer} className={styles.tagPill}>
                    {reviewer}
                  </span>
                ),
              )}
            </div>
          </section>

          {detail.body && (
            <section className={styles.bodySection}>
              <h3>Description</h3>
              <pre>{detail.body}</pre>
            </section>
          )}

          <section className={styles.scoreSection}>
            <h3>Score Breakdown</h3>
            {detail.scoreBreakdown ? (
              <div className={styles.scoreGrid}>
                <p>Review request: +{detail.scoreBreakdown.reviewRequestBoost}</p>
                <p>Assigned to you: +{detail.scoreBreakdown.assigneeBoost}</p>
                <p>CI penalty: +{detail.scoreBreakdown.ciPenalty}</p>
                <p>Staleness: +{detail.scoreBreakdown.stalenessBoost}</p>
                <p>Mentions: +{detail.scoreBreakdown.mentionBoost}</p>
                <p>Draft penalty: -{detail.scoreBreakdown.draftPenalty}</p>
              </div>
            ) : (
              <p className={styles.subtleText}>No score breakdown available.</p>
            )}
          </section>

          <section className={styles.actionsSection}>
            <h3>Write Actions</h3>
            <div className={styles.actionsGrid}>
              <form onSubmit={onSubmitComment}>
                <h4>Comment</h4>
                <textarea
                  id={TRIAGE_CONTROL_IDS.commentBody}
                  data-control-id={TRIAGE_CONTROL_IDS.commentBody}
                  data-shortcut-target={TRIAGE_CONTROL_IDS.commentBody}
                  value={commentBody}
                  onChange={(event) => {
                    onCommentBodyChange(event.target.value);
                  }}
                  placeholder="Write a comment"
                  rows={3}
                />
                <button
                  id={TRIAGE_CONTROL_IDS.commentSubmit}
                  data-control-id={TRIAGE_CONTROL_IDS.commentSubmit}
                  data-shortcut-target={TRIAGE_CONTROL_IDS.commentSubmit}
                  type="submit"
                  disabled={writing || !commentBody.trim()}
                >
                  Post comment
                </button>
              </form>

              <form onSubmit={onSubmitQuickReview}>
                <h4>Quick review</h4>
                <select
                  id={TRIAGE_CONTROL_IDS.reviewEvent}
                  data-control-id={TRIAGE_CONTROL_IDS.reviewEvent}
                  data-shortcut-target={TRIAGE_CONTROL_IDS.reviewEvent}
                  value={reviewEvent}
                  onChange={(event) => {
                    onReviewEventChange(event.target.value as ReviewEvent);
                  }}
                >
                  <option value="COMMENT">Comment</option>
                  <option value="APPROVE">Approve</option>
                  <option value="REQUEST_CHANGES">Request changes</option>
                </select>
                <textarea
                  id={TRIAGE_CONTROL_IDS.reviewBody}
                  data-control-id={TRIAGE_CONTROL_IDS.reviewBody}
                  data-shortcut-target={TRIAGE_CONTROL_IDS.reviewBody}
                  value={reviewBody}
                  onChange={(event) => {
                    onReviewBodyChange(event.target.value);
                  }}
                  placeholder="Optional review body"
                  rows={3}
                />
                <button
                  id={TRIAGE_CONTROL_IDS.reviewQuickSubmit}
                  data-control-id={TRIAGE_CONTROL_IDS.reviewQuickSubmit}
                  data-shortcut-target={TRIAGE_CONTROL_IDS.reviewQuickSubmit}
                  type="submit"
                  disabled={writing}
                >
                  Submit review
                </button>
              </form>
            </div>

            <Disclosure
              title="Advanced actions"
              toggleId={TRIAGE_CONTROL_IDS.advancedActionsToggle}
              open={advancedActionsOpen}
              onOpenChange={onAdvancedActionsOpenChange}
              toggleClassName={styles.clearButton}
              contentClassName={styles.actionsSection}
            >
              <div className={styles.actionsGrid}>
                <form onSubmit={onSubmitPendingReview}>
                  <h4>Pending review modes</h4>
                  <select
                    id={TRIAGE_CONTROL_IDS.pendingReviewMode}
                    data-control-id={TRIAGE_CONTROL_IDS.pendingReviewMode}
                    data-shortcut-target={TRIAGE_CONTROL_IDS.pendingReviewMode}
                    value={pendingReviewMode}
                    onChange={(event) => {
                      onPendingReviewModeChange(event.target.value as PendingReviewMode);
                    }}
                  >
                    <option value="pending_create">Pending: create</option>
                    <option value="pending_submit">Pending: submit</option>
                    <option value="pending_delete">Pending: delete</option>
                  </select>

                  {(pendingReviewMode === "pending_submit" || pendingReviewMode === "pending_delete") && (
                    <input
                      id={TRIAGE_CONTROL_IDS.pendingReviewId}
                      data-control-id={TRIAGE_CONTROL_IDS.pendingReviewId}
                      data-shortcut-target={TRIAGE_CONTROL_IDS.pendingReviewId}
                      type="text"
                      value={pendingReviewId}
                      onChange={(event) => {
                        onPendingReviewIdChange(event.target.value);
                      }}
                      placeholder="Pending review ID"
                    />
                  )}

                  <textarea
                    value={reviewBody}
                    onChange={(event) => {
                      onReviewBodyChange(event.target.value);
                    }}
                    placeholder="Optional review body"
                    rows={3}
                    disabled={pendingReviewMode === "pending_delete"}
                  />

                  <button
                    id={TRIAGE_CONTROL_IDS.pendingReviewSubmit}
                    data-control-id={TRIAGE_CONTROL_IDS.pendingReviewSubmit}
                    data-shortcut-target={TRIAGE_CONTROL_IDS.pendingReviewSubmit}
                    type="submit"
                    disabled={writing}
                  >
                    {pendingReviewMode === "pending_create"
                      ? "Create pending review"
                      : pendingReviewMode === "pending_submit"
                        ? "Submit pending review"
                        : "Delete pending review"}
                  </button>
                </form>

                <div>
                  <h4>Labels</h4>
                  <div className={styles.inlineActions}>
                    <input
                      id={TRIAGE_CONTROL_IDS.labelInput}
                      data-control-id={TRIAGE_CONTROL_IDS.labelInput}
                      data-shortcut-target={TRIAGE_CONTROL_IDS.labelInput}
                      type="text"
                      value={labelName}
                      onChange={(event) => {
                        onLabelNameChange(event.target.value);
                      }}
                      placeholder="label-name"
                    />
                    <button
                      id={TRIAGE_CONTROL_IDS.labelAdd}
                      data-control-id={TRIAGE_CONTROL_IDS.labelAdd}
                      data-shortcut-target={TRIAGE_CONTROL_IDS.labelAdd}
                      type="button"
                      disabled={writing || !labelName.trim()}
                      onClick={() => {
                        onMutateStringItem("labels", labelName, "POST");
                      }}
                    >
                      Add
                    </button>
                    <button
                      id={TRIAGE_CONTROL_IDS.labelRemove}
                      data-control-id={TRIAGE_CONTROL_IDS.labelRemove}
                      data-shortcut-target={TRIAGE_CONTROL_IDS.labelRemove}
                      type="button"
                      disabled={writing || !labelName.trim()}
                      onClick={() => {
                        onMutateStringItem("labels", labelName, "DELETE");
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>

                <div>
                  <h4>Assignees</h4>
                  <div className={styles.inlineActions}>
                    <input
                      id={TRIAGE_CONTROL_IDS.assigneeInput}
                      data-control-id={TRIAGE_CONTROL_IDS.assigneeInput}
                      data-shortcut-target={TRIAGE_CONTROL_IDS.assigneeInput}
                      type="text"
                      value={assigneeLogin}
                      onChange={(event) => {
                        onAssigneeLoginChange(event.target.value);
                      }}
                      placeholder="github-login"
                    />
                    <button
                      id={TRIAGE_CONTROL_IDS.assigneeAdd}
                      data-control-id={TRIAGE_CONTROL_IDS.assigneeAdd}
                      data-shortcut-target={TRIAGE_CONTROL_IDS.assigneeAdd}
                      type="button"
                      disabled={writing || !assigneeLogin.trim()}
                      onClick={() => {
                        onMutateStringItem("assignees", assigneeLogin, "POST");
                      }}
                    >
                      Add
                    </button>
                    <button
                      id={TRIAGE_CONTROL_IDS.assigneeRemove}
                      data-control-id={TRIAGE_CONTROL_IDS.assigneeRemove}
                      data-shortcut-target={TRIAGE_CONTROL_IDS.assigneeRemove}
                      type="button"
                      disabled={writing || !assigneeLogin.trim()}
                      onClick={() => {
                        onMutateStringItem("assignees", assigneeLogin, "DELETE");
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>

                <div>
                  <h4>Reviewers</h4>
                  <div className={styles.inlineActions}>
                    <input
                      id={TRIAGE_CONTROL_IDS.reviewerInput}
                      data-control-id={TRIAGE_CONTROL_IDS.reviewerInput}
                      data-shortcut-target={TRIAGE_CONTROL_IDS.reviewerInput}
                      type="text"
                      value={reviewerLogin}
                      onChange={(event) => {
                        onReviewerLoginChange(event.target.value);
                      }}
                      placeholder="github-login"
                    />
                    <button
                      id={TRIAGE_CONTROL_IDS.reviewerAdd}
                      data-control-id={TRIAGE_CONTROL_IDS.reviewerAdd}
                      data-shortcut-target={TRIAGE_CONTROL_IDS.reviewerAdd}
                      type="button"
                      disabled={writing || !reviewerLogin.trim()}
                      onClick={() => {
                        onMutateStringItem("reviewers", reviewerLogin, "POST");
                      }}
                    >
                      Add
                    </button>
                    <button
                      id={TRIAGE_CONTROL_IDS.reviewerRemove}
                      data-control-id={TRIAGE_CONTROL_IDS.reviewerRemove}
                      data-shortcut-target={TRIAGE_CONTROL_IDS.reviewerRemove}
                      type="button"
                      disabled={writing || !reviewerLogin.trim()}
                      onClick={() => {
                        onMutateStringItem("reviewers", reviewerLogin, "DELETE");
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>

                <form onSubmit={onSubmitProperties}>
                  <h4>Properties</h4>
                  <input
                    id={TRIAGE_CONTROL_IDS.propertiesTitle}
                    data-control-id={TRIAGE_CONTROL_IDS.propertiesTitle}
                    data-shortcut-target={TRIAGE_CONTROL_IDS.propertiesTitle}
                    type="text"
                    value={propTitle}
                    onChange={(event) => {
                      onPropTitleChange(event.target.value);
                    }}
                    placeholder="PR title"
                  />
                  <textarea
                    id={TRIAGE_CONTROL_IDS.propertiesBody}
                    data-control-id={TRIAGE_CONTROL_IDS.propertiesBody}
                    data-shortcut-target={TRIAGE_CONTROL_IDS.propertiesBody}
                    value={propBody}
                    onChange={(event) => {
                      onPropBodyChange(event.target.value);
                    }}
                    placeholder="PR description"
                    rows={4}
                  />
                  <select
                    id={TRIAGE_CONTROL_IDS.propertiesState}
                    data-control-id={TRIAGE_CONTROL_IDS.propertiesState}
                    data-shortcut-target={TRIAGE_CONTROL_IDS.propertiesState}
                    value={propState}
                    onChange={(event) => {
                      onPropStateChange(event.target.value as "open" | "closed");
                    }}
                  >
                    <option value="open">Open</option>
                    <option value="closed">Closed</option>
                  </select>
                  <input
                    id={TRIAGE_CONTROL_IDS.propertiesMilestone}
                    data-control-id={TRIAGE_CONTROL_IDS.propertiesMilestone}
                    data-shortcut-target={TRIAGE_CONTROL_IDS.propertiesMilestone}
                    type="text"
                    value={milestoneNumber}
                    onChange={(event) => {
                      onMilestoneNumberChange(event.target.value);
                    }}
                    placeholder="Milestone number (optional)"
                  />
                  <input
                    id={TRIAGE_CONTROL_IDS.propertiesProjects}
                    data-control-id={TRIAGE_CONTROL_IDS.propertiesProjects}
                    data-shortcut-target={TRIAGE_CONTROL_IDS.propertiesProjects}
                    type="text"
                    value={projectIdsCsv}
                    onChange={(event) => {
                      onProjectIdsCsvChange(event.target.value);
                    }}
                    placeholder="Project IDs CSV (optional)"
                  />
                  <button
                    id={TRIAGE_CONTROL_IDS.propertiesSubmit}
                    data-control-id={TRIAGE_CONTROL_IDS.propertiesSubmit}
                    data-shortcut-target={TRIAGE_CONTROL_IDS.propertiesSubmit}
                    type="submit"
                    disabled={writing}
                  >
                    Update properties
                  </button>
                </form>
              </div>
            </Disclosure>
          </section>
        </>
      )}

      {selectedId && !detailLoading && !detail && !detailError && selectedListItem && (
        <p className={styles.subtleText}>
          No detail data returned for {selectedListItem.repository} #{selectedListItem.number}.
        </p>
      )}
    </article>
  );
}
