#!/bin/sh
# Restringe a substituição no template a um token hexadecimal sem caracteres de configuração.
set -eu
case "${API_ACCESS_TOKEN:-}" in
  ''|*[!a-fA-F0-9]*) echo 'API_ACCESS_TOKEN deve ser hexadecimal.' >&2; exit 1 ;;
esac
if [ "${#API_ACCESS_TOKEN}" -lt 32 ]; then
  echo 'API_ACCESS_TOKEN deve ter pelo menos 32 caracteres.' >&2
  exit 1
fi
