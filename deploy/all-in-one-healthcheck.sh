#!/usr/bin/env bash
set -Eeuo pipefail

exec 3<>/dev/tcp/127.0.0.1/8080
printf 'GET /api/health HTTP/1.0\r\nHost: localhost\r\nConnection: close\r\n\r\n' >&3
IFS= read -r status <&3
exec 3>&-
exec 3<&-
[[ "$status" == *' 200 '* ]]
