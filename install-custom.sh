#!/usr/bin/env bash
set -euo pipefail

# Custom installer. Choose a runtime (Claude Code or Codex) and a personal or
# project-local install.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_NAME="position-manager"

echo "Position Manager skill installer (custom)"
echo "Which runtime?"
echo "  1) Claude Code  (.claude / CLAUDE.md)"
echo "  2) Codex        (.agents / AGENTS.md)"
read -r -p "Choice [1/2]: " runtime
case "$runtime" in
  2) BASE_DIR=".agents"; DOC_NAME="AGENTS.md" ;;
  *) BASE_DIR=".claude"; DOC_NAME="CLAUDE.md" ;;
esac

echo "Where should it install?"
echo "  1) personal  ~/$BASE_DIR"
echo "  2) project   ./$BASE_DIR (current directory)"
read -r -p "Choice [1/2]: " scope
case "$scope" in
  2) BASE="$(pwd)/$BASE_DIR" ;;
  *) BASE="$HOME/$BASE_DIR" ;;
esac

SKILL_DIR="$BASE/skills/$SKILL_NAME"
DOC_PATH="$BASE/$DOC_NAME"

echo ""
echo "  skill -> $SKILL_DIR"
echo "  doc   -> $DOC_PATH"
read -r -p "Proceed? [Y/n] " reply
case "$reply" in
  [Nn]*) echo "Cancelled."; exit 0 ;;
esac

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
echo "Installed to $SKILL_DIR"
