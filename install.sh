#!/usr/bin/env bash
set -euo pipefail

# Standard installer. Installs to ~/.claude with defaults.
# For project-local or custom paths, use ./install-custom.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_NAME="position-manager"
CLAUDE_HOME="$HOME/.claude"
SKILL_DIR="$CLAUDE_HOME/skills/$SKILL_NAME"
CLAUDE_MD="$CLAUDE_HOME/CLAUDE.md"

SKIP_CONFIRM=false
case "${1:-}" in
  -y|--yes) SKIP_CONFIRM=true ;;
  -h|--help)
    echo "Usage: ./install.sh [-y]"
    echo "Installs the position-manager skill into ~/.claude/skills/$SKILL_NAME"
    exit 0
    ;;
esac

echo "Position Manager skill installer"
echo "  skill   -> $SKILL_DIR"
echo "  CLAUDE  -> $CLAUDE_MD"
echo ""

if [ "$SKIP_CONFIRM" = false ]; then
  read -r -p "Proceed? [Y/n] " reply
  case "$reply" in
    [Nn]*) echo "Cancelled."; exit 0 ;;
  esac
fi

mkdir -p "$SKILL_DIR" "$CLAUDE_HOME"

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
echo "Installed."
echo "Try: \"render the health report for my wallet\""
echo "Run the engine tests: cd \"$SKILL_DIR/engine\" && node --test"
