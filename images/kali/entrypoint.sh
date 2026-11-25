#!/usr/bin/env bash
set -euo pipefail

# Apply per-VM strong password passed via environment or one-time secret file, then scrub env.
VM_PASS=""
if [[ -n "${PTAAS_VM_PASSWORD_FILE:-}" && -r "${PTAAS_VM_PASSWORD_FILE}" ]]; then
  VM_PASS="$(cat "${PTAAS_VM_PASSWORD_FILE}")"
  rm -f "${PTAAS_VM_PASSWORD_FILE}" || true
elif [[ -n "${PTAAS_VM_PASSWORD:-}" ]]; then
  VM_PASS="${PTAAS_VM_PASSWORD}"
elif [[ -n "${PASSWORD:-}" ]]; then
  VM_PASS="${PASSWORD}"
fi

if [[ -n "${VM_PASS}" ]]; then
  echo "student:${VM_PASS}" | chpasswd
  mkdir -p /home/student/.vnc
  printf '%s\n' "${VM_PASS}" | vncpasswd -f > /home/student/.vnc/passwd
  chmod 600 /home/student/.vnc/passwd
  chown -R student:student /home/student/.vnc
fi

unset PTAAS_VM_PASSWORD PASSWORD VNC_PW

rm -rf /var/run/xrdp/*.pid /run/xrdp/*.pid /var/run/dbus/pid /run/dbus/pid /tmp/.X*-lock /tmp/.X11-unix/* 2>/dev/null || true
mkdir -p /var/run/sshd /run/xrdp /var/run/xrdp /var/run/dbus
if [[ -e /etc/ssl/private/ssl-cert-snakeoil.key ]]; then
  chmod 755 /etc/ssl/private 2>/dev/null || true
  chgrp xrdp /etc/ssl/private/ssl-cert-snakeoil.key 2>/dev/null || true
  chmod 640 /etc/ssl/private/ssl-cert-snakeoil.key 2>/dev/null || true
fi
/usr/sbin/sshd -p "${SSH_PORT:-2222}" || true
service xrdp start || true
su - student -c "vncserver :1 -geometry ${VNC_RESOLUTION:-1920x1080} -depth 24" || true

trap 'exit 0' TERM INT
while true; do
  sleep 2 &
  wait $!
done
