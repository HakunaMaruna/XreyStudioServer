#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 HakunaMaruna
#
# Guard rail: every tracked source file must carry an SPDX identifier and the
# repository must ship the full AGPL text plus the NOTICE file.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

fail=0

check_file() {
  if [ ! -f "$1" ]; then
    echo "MISSING: $1"
    fail=1
    return
  fi
  if ! grep -q "$2" "$1"; then
    echo "INVALID: $1 does not contain '$2'"
    fail=1
  fi
}

check_file LICENSE 'GNU AFFERO GENERAL PUBLIC LICENSE'
check_file NOTICE 'SPDX-License-Identifier: AGPL-3.0-or-later'

while IFS= read -r file; do
  if ! grep -q 'SPDX-License-Identifier: AGPL-3.0-or-later' "$file"; then
    echo "NO SPDX HEADER: $file"
    fail=1
  fi
  stale="SPDX-License-Identifier: ""MIT"
  if grep -q "$stale" "$file"; then
    echo "STALE MIT HEADER: $file"
    fail=1
  fi
done < <(git ls-files '*.ts' '*.tsx' '*.js' '*.mjs' '*.sh')

if [ "$fail" -ne 0 ]; then
  echo 'Licensing check failed.'
  exit 1
fi

echo 'Licensing check passed: AGPL-3.0-or-later.'
