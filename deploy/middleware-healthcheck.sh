#!/usr/bin/env bash
set -Eeuo pipefail

MYSQL_PWD=${MYSQL_ROOT_PASSWORD:?MYSQL_ROOT_PASSWORD is required}
export MYSQL_PWD
mysqladmin ping --protocol=tcp --host=127.0.0.1 --user=root --silent >/dev/null

exec 3<>/dev/tcp/127.0.0.1/9000
printf 'GET /minio/health/ready HTTP/1.0\r\nHost: localhost\r\nConnection: close\r\n\r\n' >&3
IFS= read -r status <&3
exec 3>&-
exec 3<&-
[[ "$status" == *' 200 '* ]]
