#!/usr/bin/env bash
set -euo pipefail

# Installs the position-manager skill into a personal runtime directory.
#   ./install.sh              # Claude Code, ~/.claude
#   ./install.sh --agents     # Codex, ~/.agents
#   ./install.sh -y           # skip the prompt
# For project-local or custom paths, use ./install-custom.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_NAME="position-manager"

BASE_DIR=".claude"
DOC_NAME="CLAUDE.md"
SKIP_CONFIRM=false

for arg in "$@"; do
  case "$arg" in
    --agents) BASE_DIR=".agents"; DOC_NAME="AGENTS.md" ;;
    --claude) BASE_DIR=".claude"; DOC_NAME="CLAUDE.md" ;;
    -y|--yes) SKIP_CONFIRM=true ;;
    -h|--help)
      echo "Usage: ./install.sh [--claude|--agents] [-y]"
      echo "Installs the position-manager skill into ~/$BASE_DIR/skills/$SKILL_NAME"
      exit 0
      ;;
  esac
done

BASE="$HOME/$BASE_DIR"
SKILL_DIR="$BASE/skills/$SKILL_NAME"
DOC_PATH="$BASE/$DOC_NAME"

echo "Position Manager skill installer"
echo "  skill -> $SKILL_DIR"
echo "  doc   -> $DOC_PATH"
echo ""

if [ "$SKIP_CONFIRM" = false ]; then
  read -r -p "Proceed? [Y/n] " reply
  case "$reply" in
    [Nn]*) echo "Cancelled."; exit 0 ;;
  esac
fi

mkdir -p "$BASE"
rm -rf "$SKILL_DIR"
mkdir -p "$SKILL_DIR"
cp -r "$SCRIPT_DIR/skill/." "$SKILL_DIR/"
cp -r "$SCRIPT_DIR/agents" "$SKILL_DIR/agents"
cp -r "$SCRIPT_DIR/commands" "$SKILL_DIR/commands"
cp -r "$SCRIPT_DIR/rules" "$SKILL_DIR/rules"
rm -rf "$SKILL_DIR/engine/node_modules"

if [ -f "$DOC_PATH" ]; then
  cp "$DOC_PATH" "$DOC_PATH.backup"
  echo "Backed up existing $DOC_NAME to $DOC_NAME.backup"
fi
cp "$SCRIPT_DIR/CLAUDE.md" "$DOC_PATH"

echo ""
echo "Installed."
echo "Try: \"render the health report for my wallet\""
echo "Run the engine tests: cd \"$SKILL_DIR/engine\" && node --test"
