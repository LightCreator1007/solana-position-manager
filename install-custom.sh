#!/usr/bin/env bash
set -euo pipefail

# Custom installer. Choose a personal or project-local install.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_NAME="position-manager"

echo "Position Manager skill installer (custom)"
echo "Where should it install?"
echo "  1) personal  ~/.claude"
echo "  2) project   ./.claude (current directory)"
read -r -p "Choice [1/2]: " choice

case "$choice" in
  2) BASE="$(pwd)/.claude" ;;
  *) BASE="$HOME/.claude" ;;
esac

SKILL_DIR="$BASE/skills/$SKILL_NAME"
CLAUDE_MD="$BASE/CLAUDE.md"

echo ""
echo "  skill   -> $SKILL_DIR"
echo "  CLAUDE  -> $CLAUDE_MD"
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

if [ -f "$CLAUDE_MD" ]; then
  cp "$CLAUDE_MD" "$CLAUDE_MD.backup"
  echo "Backed up existing CLAUDE.md to CLAUDE.md.backup"
fi
cp "$SCRIPT_DIR/CLAUDE.md" "$CLAUDE_MD"

echo ""
echo "Installed to $SKILL_DIR"
