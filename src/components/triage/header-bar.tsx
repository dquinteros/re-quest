"use client";

import styles from "../pr-attention-manager.module.css";
import { TRIAGE_CONTROL_IDS } from "./contracts";

interface HeaderBarProps {
  viewerLabel: string | null;
  syncTimeLabel: string;
  syncing: boolean;
  signingOut: boolean;
  themeLabel: string;
  onRefresh: () => void;
  onSignOut: () => void;
  onShowShortcuts: () => void;
  onToggleTheme: () => void;
}

export function HeaderBar({
  viewerLabel,
  syncTimeLabel,
  syncing,
  signingOut,
  themeLabel,
  onRefresh,
  onSignOut,
  onShowShortcuts,
  onToggleTheme,
}: HeaderBarProps) {
  return (
    <section className={styles.headerRow}>
      <div>
        <h1 className={styles.title}>PR Attention Manager</h1>
        <p className={styles.subtitle}>Focused triage for pull requests that still need your action.</p>
      </div>
      <div className={styles.syncCluster}>
        {viewerLabel && <p className={styles.viewerText}>Signed in as {viewerLabel}</p>}
        <p className={styles.syncTime}>{syncTimeLabel}</p>
        <div className={styles.syncButtons}>
          <button
            type="button"
            className={styles.clearButton}
            onClick={onToggleTheme}
          >
            {themeLabel}
          </button>
          <button
            id={TRIAGE_CONTROL_IDS.shortcutsHelpButton}
            data-control-id={TRIAGE_CONTROL_IDS.shortcutsHelpButton}
            data-shortcut-target={TRIAGE_CONTROL_IDS.shortcutsHelpButton}
            type="button"
            className={styles.clearButton}
            onClick={onShowShortcuts}
          >
            Shortcuts (?)
          </button>
          <button
            id={TRIAGE_CONTROL_IDS.refreshFromGithub}
            data-control-id={TRIAGE_CONTROL_IDS.refreshFromGithub}
            data-shortcut-target={TRIAGE_CONTROL_IDS.refreshFromGithub}
            type="button"
            className={styles.refreshButton}
            onClick={onRefresh}
            disabled={syncing}
          >
            {syncing ? "Refreshing..." : "Refresh From GitHub"}
          </button>
          <button
            id={TRIAGE_CONTROL_IDS.signOut}
            data-control-id={TRIAGE_CONTROL_IDS.signOut}
            data-shortcut-target={TRIAGE_CONTROL_IDS.signOut}
            type="button"
            className={styles.signOutButton}
            onClick={onSignOut}
            disabled={signingOut}
          >
            {signingOut ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </div>
    </section>
  );
}
