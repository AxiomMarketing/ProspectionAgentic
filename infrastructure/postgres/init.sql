-- Create additional databases
CREATE DATABASE n8n_prod;
CREATE DATABASE langfuse_prod;
CREATE DATABASE metabase_prod;

-- Create extensions on main database
\c prospection_prod;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Create roles
CREATE ROLE app_user WITH LOGIN PASSWORD 'changeme';
GRANT CONNECT ON DATABASE prospection_prod TO app_user;

CREATE ROLE metabase_reader WITH LOGIN PASSWORD 'changeme_reader';
GRANT CONNECT ON DATABASE prospection_prod TO metabase_reader;
