#!/usr/bin/env bash
# Org-specific leak grep over tracked files. Called by .github/workflows/leak-guard.yml
# and by .gvt-agent.json commands.validate, so the rules live in one place and a
# violation fails the local gate, not only CI. Exits 1 on any hit.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

# Always blocked, everywhere: local filesystem paths and usernames
# are never legitimate in a committed file.
always='C:/repos/|C:/Users/|fninoles'
# Blocked in code/config only: the `@genvidtech` npm scope is a public
# org, so naming a `@genvidtech/...` package in prose docs (CHANGELOG,
# *.md) is fine — but it should not be hardcoded in code/config/CI.
code_only='@genvidtech|genvidtech/'
# Exclude the files that define the patterns above, which would self-match.
guard=(':!.github/workflows/leak-guard.yml' ':!.github/scripts/leak-guard.sh')
found=0
# xargs exits 123 when every grep finds nothing, which is the clean case.
if git ls-files -z -- "${guard[@]}" | xargs -0 grep -nE "$always"; then
  echo "::error::leak pattern found (local path / username — blocked everywhere)"
  found=1
fi
# plugin/package.json and plugin/package-lock.json are exempt:
# the plugin's own dependency manifest must name the scoped leaf
# package; code reaches it only via the "#audit-core" imports
# alias. See ADR-0060. Code outside plugin/ cannot use that alias;
# import the plugin's own module instead.
if git ls-files -z -- "${guard[@]}" ':!*.md' ':!plugin/package.json' ':!plugin/package-lock.json' | xargs -0 grep -nE "$code_only"; then
  echo "::error::internal npm-scope reference found in a non-doc file"
  found=1
fi
if [ "$found" -ne 0 ]; then exit 1; fi
echo "no leak patterns found"
