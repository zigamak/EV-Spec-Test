"""Alembic environment — wired to the Supabase Postgres connection string.

Incremental, task-scoped migrations only. See docs/stack-profile.md
"Migration conventions" before adding a revision. Do not hand-edit a
revision file once it has been merged to main — a schema change after
that point is a new revision.
"""
import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Supabase Postgres connection string — never hardcoded, never committed.
# Set in the deploy environment (Render) and locally via .env (gitignored).
# Supabase's dashboard copy-paste uses the plain "postgresql://" scheme,
# which SQLAlchemy resolves to the psycopg2 driver; this project installs
# psycopg (v3, see api/requirements.txt), so normalize the scheme here
# rather than requiring a hand-edited connection string.
db_url = os.environ.get("SUPABASE_DB_URL")
if db_url:
    if db_url.startswith("postgresql://"):
        db_url = db_url.replace("postgresql://", "postgresql+psycopg://", 1)
    config.set_main_option("sqlalchemy.url", db_url)

# No ORM models (SQLAlchemy Core per docs/stack-profile.md) — hand-written
# revisions are preferred over --autogenerate for anything touching RLS,
# CHECK constraints, or jsonb columns. target_metadata stays None so
# --autogenerate is not silently relied on for those cases.
target_metadata = None


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
