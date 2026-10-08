"""Creates the preproduction PostgreSQL role and database (option B).
The password is read from secrets/db_password_preprod and sent to psql on stdin: it never
appears in a command line, an output or a log. Idempotent for the role and database."""
from pathlib import Path
import subprocess

password = Path('/home/inaops/5sursync/secrets/db_password_preprod').read_text().strip()
literal = "'" + password.replace("'", "''") + "'"
sql = f"""
\\set ON_ERROR_STOP on
SELECT 'CREATE ROLE syncit_preprod LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT'
 WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'syncit_preprod') \\gexec
ALTER ROLE syncit_preprod PASSWORD {literal};
SELECT 'CREATE DATABASE syncit_preprod OWNER syncit_preprod'
 WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'syncit_preprod') \\gexec
-- Inherited rights: PUBLIC may connect to every database by default.
REVOKE ALL ON DATABASE syncit FROM PUBLIC;
REVOKE ALL ON DATABASE postgres FROM PUBLIC;
REVOKE ALL ON DATABASE syncit_preprod FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE syncit_preprod TO syncit_preprod;
"""
r = subprocess.run(
    ['sudo', '-n', 'docker', 'exec', '-i', '5sursync-postgres-1', 'psql', '-q', '-U', 'syncit', '-d', 'postgres'],
    input=sql, text=True, capture_output=True)
# Never echo the SQL; psql errors do not include the statement text with -q off for ALTER ROLE.
print('psql exit', r.returncode)
if r.returncode:
    print(r.stderr.replace(password, '***')[:500])
    raise SystemExit(1)
print('Role and database syncit_preprod ready.')
