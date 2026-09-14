import path from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { BACKUP_FILENAME_PREFIX: prefix } = require(
  path.resolve(__dirname, '../../../../shared/backup-constants.cjs'),
) as { BACKUP_FILENAME_PREFIX: string };

/** Shared with Electron via `shared/backup-constants.cjs`. */
export const BACKUP_FILENAME_PREFIX = prefix;
