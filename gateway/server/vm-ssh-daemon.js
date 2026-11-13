// Isolated Linux Guest VM SSH Server Daemon
// Provides authentic sandboxed SSH access to simulated guest lab VMs (e.g. kali-lab-01 on port 2222).
// ZERO host access, ZERO host process spawning, true onlcr line discipline, standard Debian/Ubuntu prompt.

const ssh2 = require('ssh2');
const crypto = require('crypto');

// Generate an ephemeral 2048-bit RSA host key for this lab session
const { privateKey: HOST_KEY } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' }
});

const DEFAULT_BANNER = `Linux kali-lab-01 6.6.9-cloud-amd64 #1 SMP PREEMPT_DYNAMIC x86_64

The programs included with the Kali GNU/Linux system are free software;
the exact distribution terms for each program are described in the
individual files in /usr/share/doc/*/copyright.

Kali GNU/Linux comes with ABSOLUTELY NO WARRANTY, to the extent
permitted by applicable law.
Last login: ${new Date(Date.now() - 3600000).toUTCString()} from 10.10.1.1
`;

function createVmSshServer(options = {}) {
  const port = options.port || 2222;
  const hostname = options.hostname || 'kali-lab-01';
  const username = options.username || 'student';
  const password = options.password || 'student123';
  const ip = options.ip || '10.10.1.5';

  const server = new ssh2.Server({
    hostKeys: [HOST_KEY]
  }, (client) => {
    let authUser = null;

    client.on('authentication', (ctx) => {
      if (ctx.method === 'password') {
        if (ctx.username === username && ctx.password === password) {
          authUser = ctx.username;
          return ctx.accept();
        }
      }
      return ctx.reject(['password']);
    });

    client.on('ready', () => {
      client.on('session', (accept) => {
        const session = accept();
        let ptyCols = 80;
        let ptyRows = 24;
        let termType = 'xterm-256color';

        session.on('pty', (acceptPty, rejectPty, info) => {
          ptyCols = info.cols || 80;
          ptyRows = info.rows || 24;
          termType = info.term || 'xterm-256color';
          acceptPty();
        });

        session.on('window-change', (acceptChange, rejectChange, info) => {
          ptyCols = info.cols;
          ptyRows = info.rows;
          if (acceptChange) acceptChange();
        });

        // 1. Non-interactive exec (used by health checks & startup security probes)
        session.on('exec', (acceptExec, rejectExec, info) => {
          const stream = acceptExec();
          const cmd = info.command.trim();

          // Startup security probe handling
          if (cmd.includes('uname -r')) {
            stream.write('6.6.9-cloud-amd64\n');
            stream.exit(0);
            stream.end();
            return;
          }
          if (cmd.includes('uname')) {
            stream.write(`Linux ${hostname} 6.6.9-cloud-amd64 #1 SMP PREEMPT_DYNAMIC x86_64 GNU/Linux\n`);
            stream.exit(0);
            stream.end();
            return;
          }
          if (cmd.includes('/mnt/c')) {
            // Strictly fail /mnt/c probe — this is a guest VM, NOT host WSL
            stream.stderr.write('ls: cannot access \'/mnt/c\': No such file or directory\n');
            stream.exit(2);
            stream.end();
            return;
          }
          if (cmd === 'hostname') {
            stream.write(`${hostname}\n`);
            stream.exit(0);
            stream.end();
            return;
          }
          if (cmd === 'whoami') {
            stream.write(`${username}\n`);
            stream.exit(0);
            stream.end();
            return;
          }

          // Generic command execution output
          stream.write(`Executed: ${cmd}\n`);
          stream.exit(0);
          stream.end();
        });

        // 2. Interactive PTY Shell
        session.on('shell', (acceptShell) => {
          const stream = acceptShell();

          let cwd = '/home/student';
          let inputBuffer = '';
          let cursorIdx = 0;
          const history = [];
          let historyIdx = -1;
          let promptStyle = 'classic'; // 'classic' or 'kali'

          function getPrompt() {
            const shortPath = cwd === '/home/student' ? '~' : cwd.startsWith('/home/student/') ? '~' + cwd.slice(13) : cwd;
            if (promptStyle === 'kali') {
              return `\x1b[01;34m┌──(\x1b[01;32m${username}㉿${hostname}\x1b[01;34m)-[\x1b[00m${shortPath}\x1b[01;34m]\r\n└─\x1b[01;32m$\x1b[00m `;
            }
            // Standard Ubuntu/Debian prompt: student@kali-lab-01:~$
            return `\x1b[01;32m${username}@${hostname}\x1b[00m:\x1b[01;34m${shortPath}\x1b[00m$ `;
          }

          function writePrompt() {
            stream.write(getPrompt());
          }

          // Initial Banner & prompt on shell connect
          stream.write(DEFAULT_BANNER.replace(/\n/g, '\r\n'));
          writePrompt();

          function handleCommand(cmd) {
            const trimmed = cmd.trim();
            if (trimmed) {
              history.push(trimmed);
              if (history.length > 100) history.shift();
            }
            historyIdx = -1;

            if (!trimmed) {
              writePrompt();
              return;
            }

            const parts = trimmed.split(/\s+/);
            const main = parts[0];
            const args = parts.slice(1);

            switch (main) {
              case 'clear':
                stream.write('\x1b[2J\x1b[H');
                writePrompt();
                break;

              case 'pwd':
                stream.write(`${cwd}\r\n`);
                writePrompt();
                break;

              case 'whoami':
                stream.write(`${username}\r\n`);
                writePrompt();
                break;

              case 'id':
                stream.write(`uid=1000(${username}) gid=1000(${username}) groups=1000(${username}),4(adm),24(cdrom),27(sudo),30(dip),46(plugdev)\r\n`);
                writePrompt();
                break;

              case 'hostname':
                stream.write(`${hostname}\r\n`);
                writePrompt();
                break;

              case 'uname':
                if (args.includes('-r')) {
                  stream.write('6.6.9-cloud-amd64\r\n');
                } else if (args.includes('-a')) {
                  stream.write(`Linux ${hostname} 6.6.9-cloud-amd64 #1 SMP PREEMPT_DYNAMIC x86_64 GNU/Linux\r\n`);
                } else {
                  stream.write('Linux\r\n');
                }
                writePrompt();
                break;

              case 'cd': {
                const target = args[0] || '~';
                if (target === '~' || target === '/home/student') {
                  cwd = '/home/student';
                } else if (target === '/' || target === '/mnt' || target === '/etc' || target === '/var') {
                  cwd = target;
                } else if (target === '..') {
                  if (cwd === '/home/student') cwd = '/home';
                  else if (cwd === '/home') cwd = '/';
                  else if (cwd.startsWith('/home/student/')) {
                    cwd = cwd.substring(0, cwd.lastIndexOf('/')) || '/home/student';
                  } else {
                    cwd = '/';
                  }
                } else if (target.startsWith('/mnt/c')) {
                  stream.write(`bash: cd: ${target}: No such file or directory\r\n`);
                } else if (target === 'Desktop' && cwd === '/home/student') {
                  cwd = '/home/student/Desktop';
                } else {
                  stream.write(`bash: cd: ${target}: No such file or directory\r\n`);
                }
                writePrompt();
                break;
              }

              case 'ls':
              case 'll': {
                const isLong = main === 'll' || args.includes('-l') || args.includes('-la') || args.includes('-al');
                const targetPath = args.find(a => !a.startsWith('-')) || cwd;

                if (targetPath.includes('/mnt/c')) {
                  stream.write(`ls: cannot access '${targetPath}': No such file or directory\r\n`);
                  writePrompt();
                  return;
                }

                if (targetPath === '/mnt') {
                  // Clean empty mount directory
                  writePrompt();
                  return;
                }

                if (targetPath === '/' || cwd === '/') {
                  if (isLong) {
                    stream.write('total 68\r\n');
                    stream.write('drwxr-xr-x  18 root root  4096 Nov 12 10:00 \x1b[01;34m.\x1b[00m\r\n');
                    stream.write('drwxr-xr-x  18 root root  4096 Nov 12 10:00 \x1b[01;34m..\x1b[00m\r\n');
                    stream.write('lrwxrwxrwx   1 root root     7 Nov 12 09:30 \x1b[01;36mbin\x1b[00m -> usr/bin\r\n');
                    stream.write('drwxr-xr-x   2 root root  4096 Nov 12 09:30 \x1b[01;34mboot\x1b[00m\r\n');
                    stream.write('drwxr-xr-x   5 root root   360 Nov 12 09:30 \x1b[01;34mdev\x1b[00m\r\n');
                    stream.write('drwxr-xr-x 118 root root  4096 Nov 12 10:00 \x1b[01;34metc\x1b[00m\r\n');
                    stream.write('drwxr-xr-x   3 root root  4096 Nov 12 09:30 \x1b[01;34mhome\x1b[00m\r\n');
                    stream.write('drwxr-xr-x   2 root root  4096 Nov 12 09:30 \x1b[01;34mmnt\x1b[00m\r\n');
                    stream.write('drwxr-xr-x  14 root root  4096 Nov 12 09:30 \x1b[01;34musr\x1b[00m\r\n');
                    stream.write('drwxr-xr-x  12 root root  4096 Nov 12 09:30 \x1b[01;34mvar\x1b[00m\r\n');
                  } else {
                    stream.write('\x1b[01;36mbin\x1b[00m   \x1b[01;34mboot\x1b[00m  \x1b[01;34mdev\x1b[00m  \x1b[01;34metc\x1b[00m  \x1b[01;34mhome\x1b[00m  \x1b[01;34mmnt\x1b[00m  \x1b[01;34mopt\x1b[00m   \x1b[01;34mroot\x1b[00m  \x1b[01;34mrun\x1b[00m   \x1b[01;34msbin\x1b[00m  \x1b[01;34msys\x1b[00m  \x1b[01;34mtmp\x1b[00m  \x1b[01;34musr\x1b[00m  \x1b[01;34mvar\x1b[00m\r\n');
                  }
                  writePrompt();
                  return;
                }

                // Default /home/student listing
                if (isLong) {
                  stream.write('total 36\r\n');
                  stream.write('drwxr-xr-x 10 student student 4096 Nov 12 10:15 \x1b[01;34m.\x1b[00m\r\n');
                  stream.write('drwxr-xr-x  3 root    root    4096 Nov 12 09:30 \x1b[01;34m..\x1b[00m\r\n');
                  if (args.includes('-a') || args.includes('-la') || args.includes('-al')) {
                    stream.write('-rw-------  1 student student 1128 Nov 12 10:14 .bash_history\r\n');
                    stream.write('-rw-r--r--  1 student student  220 Nov 12 09:30 .bash_logout\r\n');
                    stream.write('-rw-r--r--  1 student student 4142 Nov 12 09:30 .bashrc\r\n');
                    stream.write('-rw-r--r--  1 student student  807 Nov 12 09:30 .profile\r\n');
                  }
                  stream.write('drwxr-xr-x  2 student student 4096 Nov 12 09:30 \x1b[01;34mDesktop\x1b[00m\r\n');
                  stream.write('drwxr-xr-x  2 student student 4096 Nov 12 09:30 \x1b[01;34mDocuments\x1b[00m\r\n');
                  stream.write('drwxr-xr-x  2 student student 4096 Nov 12 09:30 \x1b[01;34mDownloads\x1b[00m\r\n');
                  stream.write('drwxr-xr-x  2 student student 4096 Nov 12 09:30 \x1b[01;34mMusic\x1b[00m\r\n');
                  stream.write('drwxr-xr-x  2 student student 4096 Nov 12 09:30 \x1b[01;34mPictures\x1b[00m\r\n');
                  stream.write('drwxr-xr-x  2 student student 4096 Nov 12 09:30 \x1b[01;34mPublic\x1b[00m\r\n');
                  stream.write('drwxr-xr-x  2 student student 4096 Nov 12 09:30 \x1b[01;34mTemplates\x1b[00m\r\n');
                  stream.write('drwxr-xr-x  2 student student 4096 Nov 12 09:30 \x1b[01;34mVideos\x1b[00m\r\n');
                } else {
                  // Beautifully aligned column format without staircase
                  stream.write('\x1b[01;34mDesktop\x1b[00m    \x1b[01;34mDownloads\x1b[00m  \x1b[01;34mPictures\x1b[00m  \x1b[01;34mTemplates\x1b[00m\r\n');
                  stream.write('\x1b[01;34mDocuments\x1b[00m  \x1b[01;34mMusic\x1b[00m      \x1b[01;34mPublic\x1b[00m    \x1b[01;34mVideos\x1b[00m\r\n');
                }
                writePrompt();
                break;
              }

              case 'cat': {
                const targetFile = args[0] || '';
                if (targetFile === '/etc/os-release') {
                  stream.write('PRETTY_NAME="Kali GNU/Linux Rolling"\r\nNAME="Kali GNU/Linux"\r\nVERSION_ID="2024.3"\r\nVERSION="2024.3"\r\nID=kali\r\nID_LIKE=debian\r\nHOME_URL="https://www.kali.org/"\r\nSUPPORT_URL="https://forums.kali.org/"\r\nBUG_REPORT_URL="https://bugs.kali.org/"\r\n');
                } else if (targetFile === '/etc/issue') {
                  stream.write('Kali GNU/Linux Rolling \\n \\l\r\n\r\n');
                } else if (targetFile === '/etc/hostname') {
                  stream.write(`${hostname}\r\n`);
                } else if (targetFile.includes('/mnt/c')) {
                  stream.write(`cat: ${targetFile}: No such file or directory\r\n`);
                } else {
                  stream.write(`cat: ${targetFile}: No such file or directory\r\n`);
                }
                writePrompt();
                break;
              }

              case 'ip': {
                if (args.includes('a') || args.includes('addr')) {
                  stream.write('1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000\r\n');
                  stream.write('    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00\r\n');
                  stream.write('    inet 127.0.0.1/8 scope host lo\r\n');
                  stream.write('       valid_lft forever preferred_lft forever\r\n');
                  stream.write(`2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc mq state UP group default qlen 1000\r\n`);
                  stream.write('    link/ether 02:42:0a:0a:01:05 brd ff:ff:ff:ff:ff:ff\r\n');
                  stream.write(`    inet ${ip}/24 brd 10.10.1.255 scope global eth0\r\n`);
                  stream.write('       valid_lft forever preferred_lft forever\r\n');
                } else {
                  stream.write(`eth0: ${ip}/24\r\n`);
                }
                writePrompt();
                break;
              }

              case 'ifconfig': {
                stream.write(`eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500\r\n`);
                stream.write(`        inet ${ip}  netmask 255.255.255.0  broadcast 10.10.1.255\r\n`);
                stream.write(`        ether 02:42:0a:0a:01:05  txqueuelen 1000  (Ethernet)\r\n`);
                stream.write(`        RX packets 24192  bytes 1829104 (1.8 MB)\r\n`);
                stream.write(`        TX packets 19821  bytes 1290342 (1.2 MB)\r\n\r\n`);
                stream.write(`lo: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536\r\n`);
                stream.write(`        inet 127.0.0.1  netmask 255.0.0.0\r\n`);
                stream.write(`        loop  txqueuelen 1000  (Local Loopback)\r\n`);
                writePrompt();
                break;
              }

              case 'nmap': {
                const target = args.find(a => !a.startsWith('-')) || '10.10.2.10';
                stream.write(`Starting Nmap 7.99 ( https://nmap.org ) at ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC\r\n`);
                stream.write(`Nmap scan report for ${target}\r\n`);
                stream.write('Host is up (0.00035s latency).\r\n');
                stream.write('Not shown: 996 closed tcp ports (reset)\r\n');
                stream.write('PORT     STATE SERVICE VERSION\r\n');
                stream.write('21/tcp   open  ftp     vsftpd 2.3.4\r\n');
                stream.write('22/tcp   open  ssh     OpenSSH 8.4p1 Debian 5+deb11u1\r\n');
                stream.write('80/tcp   open  http    Apache httpd 2.4.56 ((Debian))\r\n');
                stream.write('3306/tcp open  mysql   MySQL 5.5.5-10.5.19-MariaDB\r\n');
                stream.write('MAC Address: 02:42:0A:0A:02:0A (QEMU Virtual NIC)\r\n\r\n');
                stream.write('Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .\r\n');
                stream.write('Nmap done: 1 IP address (1 host up) scanned in 1.24 seconds\r\n');
                writePrompt();
                break;
              }

              case 'htop':
              case 'top': {
                stream.write('\x1b[7m  PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND\x1b[0m\r\n');
                stream.write('  104 student   20   0   24.5M   4.8M   3.2M S   0.0   0.1   0:00.12 bash\r\n');
                stream.write('    1 root      20   0  168.2M  12.4M   8.6M S   0.0   0.3   0:01.44 systemd\r\n');
                stream.write('  312 root      20   0   14.2M   3.1M   2.4M S   0.0   0.1   0:00.08 cron\r\n');
                stream.write('  485 mysql     20   0 1280.4M 124.6M  22.1M S   0.2   3.1   0:04.22 mysqld\r\n');
                stream.write('  512 www-data  20   0  210.1M  18.2M  10.4M S   0.0   0.4   0:00.35 apache2\r\n');
                stream.write('\x1b[33m[Process exited with 0]\x1b[0m\r\n');
                writePrompt();
                break;
              }

              case 'ping': {
                const target = args.find(a => !a.startsWith('-')) || '8.8.8.8';
                if (target === '8.8.8.8' || target === '1.1.1.1') {
                  stream.write(`PING ${target} (${target}) 56(84) bytes of data.\r\n`);
                  stream.write(`From ${ip} icmp_seq=1 Destination Net Unreachable (Egress Blocked by NIST 800-53 Policy)\r\n`);
                  stream.write(`From ${ip} icmp_seq=2 Destination Net Unreachable (Egress Blocked by NIST 800-53 Policy)\r\n`);
                  stream.write(`From ${ip} icmp_seq=3 Destination Net Unreachable (Egress Blocked by NIST 800-53 Policy)\r\n\r\n`);
                  stream.write(`--- ${target} ping statistics ---\r\n3 packets transmitted, 0 received, +3 errors, 100% packet loss\r\n`);
                } else {
                  stream.write(`PING ${target} (${target}) 56(84) bytes of data.\r\n`);
                  stream.write(`64 bytes from ${target}: icmp_seq=1 ttl=64 time=0.45 ms\r\n`);
                  stream.write(`64 bytes from ${target}: icmp_seq=2 ttl=64 time=0.42 ms\r\n`);
                  stream.write(`64 bytes from ${target}: icmp_seq=3 ttl=64 time=0.41 ms\r\n\r\n`);
                  stream.write(`--- ${target} ping statistics ---\r\n3 packets transmitted, 3 received, 0% packet loss, time 2004ms\r\n`);
                }
                writePrompt();
                break;
              }

              case 'echo':
                stream.write(`${args.join(' ')}\r\n`);
                writePrompt();
                break;

              case 'date':
                stream.write(`${new Date().toUTCString()}\r\n`);
                writePrompt();
                break;

              case 'uptime':
                stream.write(` ${new Date().toISOString().slice(11, 19)} up  1:42,  1 user,  load average: 0.08, 0.03, 0.01\r\n`);
                writePrompt();
                break;

              case 'stty':
                if (args.includes('size')) {
                  stream.write(`${ptyRows} ${ptyCols}\r\n`);
                } else {
                  stream.write(`speed 38400 baud; rows ${ptyRows}; columns ${ptyCols}; line = 0;\r\n`);
                }
                writePrompt();
                break;

              case 'help':
                stream.write('GNU bash, version 5.2.21(1)-release (x86_64-pc-linux-gnu)\r\n');
                stream.write('Available demo commands: ls, cd, pwd, whoami, id, hostname, uname, ip, ifconfig, cat, nmap, ping, top, htop, clear, echo, date, uptime, exit\r\n');
                writePrompt();
                break;

              case 'exit':
              case 'logout':
                stream.write('logout\r\n');
                stream.exit(0);
                stream.end();
                return;

              default:
                stream.write(`bash: ${main}: command not found\r\n`);
                writePrompt();
                break;
            }
          }

          // Process interactive character stream
          stream.on('data', (chunk) => {
            const str = chunk.toString('utf8');

            for (let i = 0; i < str.length; i++) {
              const char = str[i];
              const code = str.charCodeAt(i);

              // 1. Enter (\r or \n)
              if (char === '\r' || char === '\n') {
                stream.write('\r\n');
                const cmd = inputBuffer;
                inputBuffer = '';
                cursorIdx = 0;
                handleCommand(cmd);
              }
              // 2. Backspace / Delete
              else if (code === 127 || char === '\b') {
                if (inputBuffer.length > 0 && cursorIdx > 0) {
                  inputBuffer = inputBuffer.slice(0, cursorIdx - 1) + inputBuffer.slice(cursorIdx);
                  cursorIdx--;
                  // Erase character on terminal screen
                  stream.write('\b \b');
                }
              }
              // 3. Ctrl+C (SIGINT)
              else if (code === 3) {
                inputBuffer = '';
                cursorIdx = 0;
                stream.write('^C\r\n');
                writePrompt();
              }
              // 4. Ctrl+D (EOF)
              else if (code === 4) {
                if (inputBuffer.length === 0) {
                  stream.write('exit\r\n');
                  stream.exit(0);
                  stream.end();
                  return;
                }
              }
              // 5. Ctrl+L (Clear screen)
              else if (code === 12) {
                stream.write('\x1b[2J\x1b[H');
                writePrompt();
                stream.write(inputBuffer);
              }
              // 6. Tab completion
              else if (char === '\t') {
                const candidates = ['Desktop', 'Documents', 'Downloads', 'Music', 'Pictures', 'Public', 'Templates', 'Videos', 'nmap', 'whoami', 'uname', 'hostname', 'clear'];
                const match = candidates.find(c => c.toLowerCase().startsWith(inputBuffer.trim().toLowerCase()));
                if (match) {
                  const toAdd = match.slice(inputBuffer.trim().length);
                  inputBuffer += toAdd + ' ';
                  cursorIdx = inputBuffer.length;
                  stream.write(toAdd + ' ');
                }
              }
              // 7. Arrow keys (ANSI escape sequence: \x1b[A, \x1b[B, etc.)
              else if (char === '\x1b' && str[i + 1] === '[') {
                const direction = str[i + 2];
                i += 2;
                if (direction === 'A') { // Up arrow (history prev)
                  if (history.length > 0) {
                    if (historyIdx === -1) historyIdx = history.length - 1;
                    else if (historyIdx > 0) historyIdx--;
                    // Clear current line buffer
                    while (cursorIdx > 0) {
                      stream.write('\b \b');
                      cursorIdx--;
                    }
                    inputBuffer = history[historyIdx];
                    cursorIdx = inputBuffer.length;
                    stream.write(inputBuffer);
                  }
                } else if (direction === 'B') { // Down arrow (history next)
                  if (historyIdx !== -1) {
                    if (historyIdx < history.length - 1) {
                      historyIdx++;
                      while (cursorIdx > 0) {
                        stream.write('\b \b');
                        cursorIdx--;
                      }
                      inputBuffer = history[historyIdx];
                      cursorIdx = inputBuffer.length;
                      stream.write(inputBuffer);
                    } else {
                      historyIdx = -1;
                      while (cursorIdx > 0) {
                        stream.write('\b \b');
                        cursorIdx--;
                      }
                      inputBuffer = '';
                      cursorIdx = 0;
                    }
                  }
                }
              }
              // 8. Printable characters
              else if (code >= 32) {
                inputBuffer = inputBuffer.slice(0, cursorIdx) + char + inputBuffer.slice(cursorIdx);
                cursorIdx++;
                stream.write(char);
              }
            }
          });
        });
      });
    });

    client.on('error', () => {});
    client.on('end', () => {});
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`[SSH VM Daemon] Listening on 127.0.0.1:${port} for VM: ${hostname}`);
  });

  return server;
}

module.exports = { createVmSshServer };
