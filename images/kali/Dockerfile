# PTaaS Cloud — Kali Linux Desktop Container for Local Docker Dev Fallback
FROM kalilinux/kali-rolling:latest

ENV DEBIAN_FRONTEND=noninteractive
ENV USER=student
ENV HOME=/home/student

RUN apt-get update && apt-get install -y --no-install-recommends \
    kali-desktop-xfce \
    xrdp \
    tigervnc-standalone-server \
    tigervnc-common \
    dbus-x11 \
    sudo \
    curl \
    ca-certificates \
    net-tools \
    firefox-esr \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -s /bin/bash student && \
    echo "student:student123" | chpasswd && \
    usermod -aG sudo student

RUN mkdir -p /home/student/.vnc && \
    echo "student123" | vncpasswd -f > /home/student/.vnc/passwd && \
    chmod 600 /home/student/.vnc/passwd && \
    echo "xfce4-session" > /home/student/.xsession && \
    chown -R student:student /home/student

EXPOSE 3389 5901

CMD service xrdp start && su - student -c "vncserver :1 -geometry 1920x1080 -depth 24" && tail -f /dev/null
