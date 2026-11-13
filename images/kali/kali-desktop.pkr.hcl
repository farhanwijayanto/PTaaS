# PTaaS Cloud — Kali Linux Golden Image Packer Definition
# Target: QEMU / KVM with libvirt
# Output: kali-2024.3-xfce-v1.qcow2

packer {
  required_plugins {
    qemu = {
      version = ">= 1.0.10"
      source  = "github.com/hashicorp/qemu"
    }
  }
}

source "qemu" "kali-xfce" {
  iso_url           = "https://cdimage.kali.org/kali-2024.3/kali-linux-2024.3-installer-amd64.iso"
  iso_checksum      = "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  output_directory  = "build/kali-2024.3-xfce-v1"
  shutdown_command  = "sudo shutdown -P now"
  disk_size         = "30G"
  format            = "qcow2"
  accelerator       = "kvm"
  http_directory    = "http"
  ssh_username      = "student"
  ssh_password      = "student"
  ssh_timeout       = "20m"
  vm_name           = "kali-2024.3-xfce-v1.qcow2"
  net_device        = "virtio-net"
  disk_interface    = "virtio"
  qemuargs = [
    ["-m", "4096M"],
    ["-smp", "2"],
    ["-cpu", "host"]
  ]
}

build {
  sources = ["source.qemu.kali-xfce"]

  provisioner "shell" {
    inline = [
      "sudo apt-get update",
      "sudo DEBIAN_FRONTEND=noninteractive apt-get install -y kali-desktop-xfce kali-tools-top10 xrdp tigervnc-standalone-server qemu-guest-agent dbus-x11 firefox-esr",
      "sudo systemctl enable qemu-guest-agent",
      "sudo systemctl enable xrdp",
      "echo 'xfce4-session' > /home/student/.xsession",
      "sudo chown student:student /home/student/.xsession",
      "# Disable screensaver and screen locking",
      "mkdir -p /home/student/.config/xfce4/xfconf/xfce-perchannel-xml",
      "echo '<channel name=\"xfce4-screensaver\" version=\"1.0\"><property name=\"saver\" type=\"empty\"><property name=\"enabled\" type=\"bool\" value=\"false\"/></property></channel>' > /home/student/.config/xfce4/xfconf/xfce-perchannel-xml/xfce4-screensaver.xml",
      "# Restrict RDP firewall to gateway subnet only",
      "sudo ufw default deny incoming",
      "sudo ufw allow from 10.10.0.0/16 to any port 3389 proto tcp",
      "sudo ufw allow from 10.10.0.0/16 to any port 5901 proto tcp",
      "sudo ufw enable"
    ]
  }
}
