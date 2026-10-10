import * as migration_20261006_102826_initial from './20261006_102826_initial';
import * as migration_20261006_103000_rate_limits from './20261006_103000_rate_limits';
import * as migration_20261006_105506_content_copy from './20261006_105506_content_copy';
import * as migration_20261006_125511_social_links from './20261006_125511_social_links';
import * as migration_20261006_134346_showcase from './20261006_134346_showcase';
import * as migration_20261006_223000_contact_notifications from './20261006_223000_contact_notifications';
import * as migration_20261008_090825_crm from './20261008_090825_crm';
import * as migration_20261008_102236_crm_v2 from './20261008_102236_crm_v2';
import * as migration_20261008_112152_crm_v3 from './20261008_112152_crm_v3';
import * as migration_20261008_173554_crm_mail from './20261008_173554_crm_mail';
import * as migration_20261008_185702_admin_rights from './20261008_185702_admin_rights';
import * as migration_20261009_150000_crm_mail_imap from './20261009_150000_crm_mail_imap';
import * as migration_20261010_020200_crm_suivi from './20261010_020200_crm_suivi';
import * as migration_20261010_105721_admin_roles from './20261010_105721_admin_roles';
import * as migration_20261010_113500_backup_state from './20261010_113500_backup_state';
import * as migration_20261010_155457_client_needs from './20261010_155457_client_needs';

export const migrations = [
  {
    up: migration_20261006_102826_initial.up,
    down: migration_20261006_102826_initial.down,
    name: '20261006_102826_initial',
  },
  {
    up: migration_20261006_103000_rate_limits.up,
    down: migration_20261006_103000_rate_limits.down,
    name: '20261006_103000_rate_limits',
  },
  {
    up: migration_20261006_105506_content_copy.up,
    down: migration_20261006_105506_content_copy.down,
    name: '20261006_105506_content_copy',
  },
  {
    up: migration_20261006_125511_social_links.up,
    down: migration_20261006_125511_social_links.down,
    name: '20261006_125511_social_links',
  },
  {
    up: migration_20261006_134346_showcase.up,
    down: migration_20261006_134346_showcase.down,
    name: '20261006_134346_showcase',
  },
  {
    up: migration_20261006_223000_contact_notifications.up,
    down: migration_20261006_223000_contact_notifications.down,
    name: '20261006_223000_contact_notifications',
  },
  {
    up: migration_20261008_090825_crm.up,
    down: migration_20261008_090825_crm.down,
    name: '20261008_090825_crm',
  },
  {
    up: migration_20261008_102236_crm_v2.up,
    down: migration_20261008_102236_crm_v2.down,
    name: '20261008_102236_crm_v2',
  },
  {
    up: migration_20261008_112152_crm_v3.up,
    down: migration_20261008_112152_crm_v3.down,
    name: '20261008_112152_crm_v3',
  },
  {
    up: migration_20261008_173554_crm_mail.up,
    down: migration_20261008_173554_crm_mail.down,
    name: '20261008_173554_crm_mail',
  },
  {
    up: migration_20261008_185702_admin_rights.up,
    down: migration_20261008_185702_admin_rights.down,
    name: '20261008_185702_admin_rights',
  },
  {
    up: migration_20261009_150000_crm_mail_imap.up,
    down: migration_20261009_150000_crm_mail_imap.down,
    name: '20261009_150000_crm_mail_imap',
  },
  {
    up: migration_20261010_020200_crm_suivi.up,
    down: migration_20261010_020200_crm_suivi.down,
    name: '20261010_020200_crm_suivi',
  },
  {
    up: migration_20261010_105721_admin_roles.up,
    down: migration_20261010_105721_admin_roles.down,
    name: '20261010_105721_admin_roles',
  },
  {
    up: migration_20261010_113500_backup_state.up,
    down: migration_20261010_113500_backup_state.down,
    name: '20261010_113500_backup_state',
  },
  {
    up: migration_20261010_155457_client_needs.up,
    down: migration_20261010_155457_client_needs.down,
    name: '20261010_155457_client_needs'
  },
];
