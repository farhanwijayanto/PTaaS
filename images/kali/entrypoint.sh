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
  if command -v vncpasswd >/dev/null 2>&1; then
    mkdir -p /home/student/.vnc
    printf '%s\n' "${VM_PASS}" | vncpasswd -f > /home/student/.vnc/passwd
    chmod 600 /home/student/.vnc/passwd
    chown -R student:student /home/student/.vnc
  fi
fi

unset PTAAS_VM_PASSWORD PASSWORD VNC_PW

rm -rf /var/run/xrdp/*.pid /run/xrdp/*.pid /var/run/dbus/pid /run/dbus/pid /tmp/.X*-lock /tmp/.X11-unix/* 2>/dev/null || true
mkdir -p /var/run/sshd /run/xrdp /var/run/xrdp /run/dbus /var/run/dbus

# Ensure student can authenticate xfce4-screensaver under no-new-privileges:true
usermod -aG shadow student 2>/dev/null || true
if [[ ! -f /home/student/.xsession ]]; then
  echo "xfce4-session" > /home/student/.xsession
  chown student:student /home/student/.xsession 2>/dev/null || true
fi

# Configure xfce4-screensaver PAM (X11 lock screen only; xrdp/sshd keep strict per-VM passwords)
if [[ -w /etc/pam.d/xfce4-screensaver && -w /usr/local/bin ]]; then
  cat > /usr/local/bin/ptaas-lockscreen-auth <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
[[ "${PAM_USER:-}" == "student" ]] || exit 1
PASS="$(tr -d '\0\r\n')"
[[ "${PASS}" == "kali" || "${PASS}" == "student" ]] && exit 0
exit 1
EOF
  chmod 755 /usr/local/bin/ptaas-lockscreen-auth
  cat > /etc/pam.d/xfce4-screensaver <<'EOF'
auth sufficient pam_unix.so
auth sufficient pam_exec.so quiet expose_authtok /usr/local/bin/ptaas-lockscreen-auth
auth requisite pam_deny.so
auth optional pam_gnome_keyring.so
EOF
fi

if [[ -e /etc/ssl/private/ssl-cert-snakeoil.key ]]; then
  chmod 755 /etc/ssl/private 2>/dev/null || true
  chgrp xrdp /etc/ssl/private/ssl-cert-snakeoil.key 2>/dev/null || true
  chmod 640 /etc/ssl/private/ssl-cert-snakeoil.key 2>/dev/null || true
fi
dbus-daemon --system --fork 2>/dev/null || true
/usr/sbin/sshd -p "${SSH_PORT:-2222}" || true
service xrdp start || true
if command -v vncserver >/dev/null 2>&1; then
  su - student -c "vncserver :1 -geometry ${VNC_RESOLUTION:-1920x1080} -depth 24" || true
fi

trap 'exit 0' TERM INT
while true; do
  sleep 2 &
  wait $!
done
