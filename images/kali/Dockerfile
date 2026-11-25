# PTaaS Cloud — Golden Kali Linux Lab Image (Build Once, Run Many)
# Pinned base image tag (never `:latest`). Rebuild manually or in CI when tools change.
# Usage: node scripts/prepare-images.mjs --build
ARG BASE_IMAGE=kalilinux/kali-rolling:2024.3
FROM ${BASE_IMAGE}

ENV DEBIAN_FRONTEND=noninteractive
ENV USER=student
ENV HOME=/home/student
ENV VNC_RESOLUTION=1920x1080
ENV SSH_PORT=2222
ENV RDP_PORT=3389

# Bake required pentest tools, desktop, fonts, RDP/VNC/SSH servers once into the golden image.
RUN apt-get update && apt-get install -y --no-install-recommends \
    kali-desktop-xfce \
    xrdp \
    tigervnc-standalone-server \
    tigervnc-common \
    openssh-server \
    dbus-x11 \
    sudo \
    curl \
    ca-certificates \
    net-tools \
    iputils-ping \
    fonts-dejavu-core \
    nmap \
    metasploit-framework \
    wireshark-common \
    tshark \
    sqlmap \
    hydra \
    john \
    && rm -rf /var/lib/apt/lists/*

# Create non-root student account with locked password (unique per-VM password is set at runtime).
RUN useradd -m -s /bin/bash -G sudo,shadow student && \
    passwd -l student && \
    mkdir -p /var/run/sshd /run/xrdp /home/student/.vnc && \
    echo "xfce4-session" > /home/student/.xsession && \
    sed -i 's/^#Port 22/Port 2222/' /etc/ssh/sshd_config && \
    sed -i 's/^#PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config && \
    sed -i 's/^#PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config && \
    chown -R student:student /home/student

COPY entrypoint.sh /usr/local/bin/ptaas-entrypoint.sh
RUN chmod 755 /usr/local/bin/ptaas-entrypoint.sh

EXPOSE 2222 3389 5901

HEALTHCHECK --interval=10s --timeout=3s --retries=3 --start-period=15s \
  CMD ss -tln | grep -qE ":(3389|2222) "

ENTRYPOINT ["/usr/local/bin/ptaas-entrypoint.sh"]
