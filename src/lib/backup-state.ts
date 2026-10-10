import { database } from "@/lib/database";
// Backup and restore facts, written by deployment/backup.sh and deployment/restore-test.sh
// (table app_backup_events). The CRM only reads them: the existence of a dump file is not
// proof it restores, so "last restore tested" is a recorded event or nothing at all.
export type BackupEvent = {
  kind: "backup" | "restore-test";
  outcome: "ok" | "failed";
  reference: string;
  size_bytes: string | null;
  detail: string;
  created_at: Date;
};
export type BackupState = {
  lastBackup: BackupEvent | null;
  lastRestoreTest: BackupEvent | null;
  recent: BackupEvent[];
  available: boolean;
};
const empty: BackupState = { lastBackup: null, lastRestoreTest: null, recent: [], available: false };
export async function backupState(): Promise<BackupState> {
  try {
    const { rows } = await database().query<BackupEvent>(
      `SELECT kind,outcome,reference,size_bytes,detail,created_at
         FROM app_backup_events ORDER BY created_at DESC LIMIT 20`,
    );
    return {
      lastBackup: rows.find((r) => r.kind === "backup" && r.outcome === "ok") ?? null,
      lastRestoreTest: rows.find((r) => r.kind === "restore-test" && r.outcome === "ok") ?? null,
      recent: rows.slice(0, 8),
      available: true,
    };
  } catch {
    // Table missing (migration not applied yet) or database unreachable: say nothing
    // rather than claim a backup state that was never measured.
    return empty;
  }
}
// How old a fact is, in whole days.
export const ageInDays = (date: Date | null | undefined) =>
  date ? Math.floor((Date.now() - new Date(date).getTime()) / 86400000) : null;
