"use client";

import type { FormEvent } from "react";
import type { TrackedRepository } from "@/types/pr";
import styles from "../pr-attention-manager.module.css";
import {
  TRIAGE_CONTROL_IDS,
  trackedRepoRemoveControlId,
} from "./contracts";

interface TrackedRepoManagerProps {
  trackedRepos: TrackedRepository[];
  trackedReposLoading: boolean;
  trackedReposError: string | null;
  addableRepos: TrackedRepository[];
  availableReposLoading: boolean;
  availableReposError: string | null;
  selectedRepoToAdd: string;
  repoWriting: boolean;
  onSelectedRepoToAddChange: (value: string) => void;
  onAddTrackedRepo: (event: FormEvent<HTMLFormElement>) => void;
  onRemoveTrackedRepo: (fullName: string) => void;
}

export function TrackedRepoManager({
  trackedRepos,
  trackedReposLoading,
  trackedReposError,
  addableRepos,
  availableReposLoading,
  availableReposError,
  selectedRepoToAdd,
  repoWriting,
  onSelectedRepoToAddChange,
  onAddTrackedRepo,
  onRemoveTrackedRepo,
}: TrackedRepoManagerProps) {
  const selectorPlaceholder = availableReposLoading
    ? "Loading repositories..."
    : addableRepos.length > 0
      ? "Select repository"
      : "No repositories available";

  return (
    <section className={styles.repoManagerSection}>
      <header className={styles.repoHeader}>
        <h2>Tracked repositories</h2>
        <span>{trackedRepos.length} tracked</span>
      </header>

      <form className={styles.repoForm} onSubmit={onAddTrackedRepo}>
        <select
          id={TRIAGE_CONTROL_IDS.trackedRepoInput}
          data-control-id={TRIAGE_CONTROL_IDS.trackedRepoInput}
          data-shortcut-target={TRIAGE_CONTROL_IDS.trackedRepoInput}
          value={selectedRepoToAdd}
          onChange={(event) => {
            onSelectedRepoToAddChange(event.target.value);
          }}
          disabled={repoWriting || availableReposLoading || addableRepos.length === 0}
        >
          <option value="">{selectorPlaceholder}</option>
          {addableRepos.map((repo) => (
            <option key={repo.fullName} value={repo.fullName}>
              {repo.fullName}
            </option>
          ))}
        </select>
        <button
          id={TRIAGE_CONTROL_IDS.trackedRepoAdd}
          data-control-id={TRIAGE_CONTROL_IDS.trackedRepoAdd}
          data-shortcut-target={TRIAGE_CONTROL_IDS.trackedRepoAdd}
          type="submit"
          disabled={repoWriting || availableReposLoading || !selectedRepoToAdd}
        >
          Add repo
        </button>
      </form>

      {availableReposError && <p className={styles.errorText}>Available repos: {availableReposError}</p>}
      {trackedReposLoading && <p className={styles.subtleText}>Loading tracked repositories...</p>}
      {trackedReposError && <p className={styles.errorText}>Tracked repos: {trackedReposError}</p>}

      {!trackedReposLoading && !trackedRepos.length && (
        <p className={styles.subtleText}>
          No repositories tracked yet. Select one above to start syncing pull requests.
        </p>
      )}

      <ul className={styles.repoList}>
        {trackedRepos.map((repo) => {
          const removeControlId = trackedRepoRemoveControlId(repo.fullName);
          return (
            <li key={repo.fullName} className={styles.repoListItem}>
              <span>{repo.fullName}</span>
              <button
                type="button"
                id={removeControlId}
                data-control-id={removeControlId}
                data-shortcut-target={removeControlId}
                className={styles.repoRemoveButton}
                disabled={repoWriting}
                onClick={() => {
                  onRemoveTrackedRepo(repo.fullName);
                }}
              >
                Remove
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
