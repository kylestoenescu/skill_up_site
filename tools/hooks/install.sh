#!/bin/sh
#
# Point git at the version-controlled hooks in this directory.
#
#     sh tools/hooks/install.sh
#
# Git's default hook directory (.git/hooks) is NOT version controlled, so a hook
# written there is invisible to git, lost on a fresh clone, and impossible to
# review in a diff. core.hooksPath moves the lookup into the repo instead.
#
# It is a local setting, so it has to be run once per clone — that's the one
# tradeoff. It also REPLACES .git/hooks entirely, so any hook living there stops
# running; this repo has none, but worth knowing before you add one.

set -e

cd "$(git rev-parse --show-toplevel)"

git config core.hooksPath tools/hooks

# Git needs the executable bit to run a hook. On Windows the working-tree bit
# is often meaningless, so also record it in the index for other clones.
chmod +x tools/hooks/pre-push 2>/dev/null || true
git update-index --chmod=+x tools/hooks/pre-push 2>/dev/null || true

echo "hooks installed: core.hooksPath -> tools/hooks"
echo "active hook: pre-push (asset stamp + test suite)"
echo "bypass once with: git push --no-verify"
