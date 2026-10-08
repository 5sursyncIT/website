#!/bin/sh
set -eu
# Official repository was configured after inspection. No firewall or INA change.
sudo -n env NEEDRESTART_MODE=l apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo -n docker version
sudo -n docker compose version
sudo -n sysctl net.ipv4.ip_forward
sudo -n ufw status
sudo -n nginx -t
systemctl is-active nginx ssh docker
