#!/usr/bin/env bash
# Run the studio (web page + scheduler) as a user service: it starts with your session,
# restarts if it crashes, and runs at low priority so the machine stays responsive.
#   bash scripts/install-studio-service.sh          install and start
#   systemctl --user status wata-studio             is it running?
#   journalctl --user -u wata-studio -f             its log
#   systemctl --user disable --now wata-studio      stop and remove from startup
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node)"
mkdir -p "$HOME/.config/systemd/user"
cat > "$HOME/.config/systemd/user/wata-studio.service" <<UNIT
[Unit]
Description=Wata video studio (Huy Kể Chuyện): web page + scheduler
After=network-online.target

[Service]
WorkingDirectory=$ROOT
ExecStart=$NODE $ROOT/src/cli.ts studio
Environment=PATH=$(dirname "$NODE"):/usr/local/bin:/usr/bin:/bin
Nice=10
IOSchedulingClass=idle
Restart=on-failure
RestartSec=30

[Install]
WantedBy=default.target
UNIT
systemctl --user daemon-reload
systemctl --user enable --now wata-studio
echo "✔ Studio running: http://127.0.0.1:5175"
echo "  To keep it running while logged out: sudo loginctl enable-linger $USER"
