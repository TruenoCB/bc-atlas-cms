#!/usr/bin/env bash
set -Eeuo pipefail

OUTPUT_FILE=.env.middleware
FORCE=0

usage() {
  cat <<'EOF'
Usage: bc-middleware-config [--output PATH] [--force]

Interactively creates a mode-0600 middleware environment file. Passwords are
read with terminal echo disabled; for CI, pre-set MYSQL_PASSWORD,
MYSQL_ROOT_PASSWORD, MINIO_ROOT_USER, and MINIO_ROOT_PASSWORD in the process
environment instead of passing secrets as command-line arguments.
EOF
}

while (($#)); do
  case "$1" in
    --output)
      [[ $# -ge 2 ]] || { printf '%s\n' '--output requires a path' >&2; exit 64; }
      OUTPUT_FILE=$2
      shift 2
      ;;
    --force)
      FORCE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown option: %s\n' "$1" >&2
      usage >&2
      exit 64
      ;;
  esac
done

if [[ -e "$OUTPUT_FILE" && "$FORCE" != '1' ]]; then
  printf '%s already exists; use --force only when intentional.\n' "$OUTPUT_FILE" >&2
  exit 73
fi

prompt_plain() {
  local name=$1
  local label=$2
  local default_value=$3
  local value=${!name:-}
  if [[ -z "$value" ]]; then
    if [[ ! -t 0 ]]; then
      value=$default_value
    else
      read -r -p "${label} [${default_value}]: " value
      value=${value:-$default_value}
    fi
  fi
  printf -v "$name" '%s' "$value"
}

prompt_secret() {
  local name=$1
  local label=$2
  local value=${!name:-}
  local confirmation
  if [[ -z "$value" ]]; then
    if [[ ! -t 0 ]]; then
      printf '%s must be set for non-interactive configuration.\n' "$name" >&2
      exit 64
    fi
    read -r -s -p "${label}: " value
    printf '\n'
    read -r -s -p "Confirm ${label}: " confirmation
    printf '\n'
    if [[ "$value" != "$confirmation" ]]; then
      printf '%s values do not match.\n' "$label" >&2
      exit 65
    fi
  fi
  printf -v "$name" '%s' "$value"
}

validate_identifier() {
  local name=$1
  local value=${!name}
  if [[ ! "$value" =~ ^[A-Za-z0-9_]+$ ]]; then
    printf '%s may contain only letters, digits, and underscores.\n' "$name" >&2
    exit 65
  fi
}

validate_secret() {
  local name=$1
  local value=${!name}
  if ((${#value} < 12)); then
    printf '%s must contain at least 12 characters.\n' "$name" >&2
    exit 65
  fi
  if [[ "$value" == *$'\n'* || "$value" == *$'\r'* || "$value" == *"'"* ]]; then
    printf "%s cannot contain a newline, carriage return, or single quote.\n" "$name" >&2
    exit 65
  fi
}

dotenv_literal() {
  local name=$1
  local value=${!name}
  printf "%s='%s'\n" "$name" "$value"
}

prompt_plain MYSQL_DATABASE 'MySQL database' bc_cms
prompt_plain MYSQL_USER 'MySQL application user' bc
prompt_secret MYSQL_PASSWORD 'MySQL application password'
prompt_secret MYSQL_ROOT_PASSWORD 'MySQL root password'
prompt_plain MINIO_ROOT_USER 'MinIO root user' bc-minio
prompt_secret MINIO_ROOT_PASSWORD 'MinIO root password'

validate_identifier MYSQL_DATABASE
validate_identifier MYSQL_USER
if [[ "$MYSQL_USER" == root ]]; then
  printf '%s\n' 'MYSQL_USER must be a dedicated application account, not root.' >&2
  exit 65
fi
validate_secret MYSQL_PASSWORD
validate_secret MYSQL_ROOT_PASSWORD
validate_secret MINIO_ROOT_PASSWORD
if [[ "$MINIO_ROOT_USER" == *$'\n'* || "$MINIO_ROOT_USER" == *$'\r'* || "$MINIO_ROOT_USER" == *"'"* ]]; then
  printf '%s\n' 'MINIO_ROOT_USER contains an unsupported character.' >&2
  exit 65
fi

umask 077
mkdir -p "$(dirname "$OUTPUT_FILE")"
{
  printf '%s\n' \
    'BASE_IMAGE=bc-atlas-cms-base' \
    'BASE_TAG=2026.08.12' \
    'BASE_VERSION=2026.08.12' \
    'MYSQL_IMAGE=mysql:8.4' \
    'NODE_IMAGE=node:24.18.1-bookworm-slim' \
    'GO_IMAGE=golang:1.24.8-bookworm' \
    'MINIO_SOURCE_REPOSITORY=https://github.com/minio/minio.git' \
    'MINIO_SOURCE_REF=7aac2a2c5b7c882e68c1ce017d8256be2feea27f' \
    'MYSQL_BIND=127.0.0.1' \
    'MYSQL_PORT=3306' \
    'MINIO_BIND=127.0.0.1' \
    'MINIO_API_PORT=9000' \
    'MINIO_CONSOLE_PORT=9001'
  dotenv_literal MYSQL_DATABASE
  dotenv_literal MYSQL_USER
  dotenv_literal MYSQL_PASSWORD
  dotenv_literal MYSQL_ROOT_PASSWORD
  dotenv_literal MINIO_ROOT_USER
  dotenv_literal MINIO_ROOT_PASSWORD
} >"$OUTPUT_FILE"
chmod 0600 "$OUTPUT_FILE"

printf 'Created %s with mode 0600. Secret values were not printed.\n' "$OUTPUT_FILE"
