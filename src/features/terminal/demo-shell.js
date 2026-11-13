/**
 * Deterministic in-memory demo shell for xterm.js.
 * Zero network calls, zero WebSockets, zero host/process access.
 */

const FS = {
  '/home/student': {
    type: 'dir',
    entries: ['notes.txt', 'targets.txt', 'scans', 'scripts'],
  },
  '/home/student/scans': {
    type: 'dir',
    entries: ['initial-nmap.txt'],
  },
  '/home/student/scripts': {
    type: 'dir',
    entries: ['enum.sh'],
  },
  '/home/student/notes.txt': {
    type: 'file',
    content: [
      '# Lab Notes — Cohort CS-401 (Demo)',
      '- Target subnet: 10.10.2.0/24',
      '- Practice target: 10.10.2.10 (metasploit-01)',
      '- Egress outside tenant VPC is blocked by NIST guard ACL.',
    ].join('\n'),
  },
  '/home/student/targets.txt': {
    type: 'file',
    content: [
      '10.10.2.10  metasploit-01.lab.internal',
      '10.10.2.11  dvwa-web-01.lab.internal',
      '10.10.2.12  juice-shop-01.lab.internal',
    ].join('\n'),
  },
  '/home/student/scans/initial-nmap.txt': {
    type: 'file',
    content: [
      'Nmap scan report for 10.10.2.10',
      'PORT     STATE SERVICE VERSION',
      '22/tcp   open  ssh     OpenSSH 8.9p1 Ubuntu',
      '80/tcp   open  http    Apache httpd 2.4.52',
      '3306/tcp open  mysql   MySQL 8.0.35',
    ].join('\n'),
  },
  '/home/student/scripts/enum.sh': {
    type: 'file',
    content: '#!/usr/bin/env bash\necho "[demo] enumerating 10.10.2.0/24..."\n',
  },
  '/etc/os-release': {
    type: 'file',
    content: 'PRETTY_NAME="Kali GNU/Linux Rolling (Demo Simulation)"\nID=kali\nVERSION_ID="2024.3"\n',
  },
};

function resolvePath(cwd, target) {
  if (!target || target === '~') return '/home/student';
  const raw = target.startsWith('~/')
    ? '/home/student/' + target.slice(2)
    : target.startsWith('/')
      ? target
      : `${cwd}/${target}`;
  const parts = [];
  for (const seg of raw.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return '/' + parts.join('/');
}

function formatCwd(cwd) {
  if (cwd === '/home/student') return '~';
  if (cwd.startsWith('/home/student/')) return '~/' + cwd.slice('/home/student/'.length);
  return cwd || '/';
}

export function createDemoShell({ term, vmName = 'kali-lab-01', vmIp = '10.10.1.5', getPromptStyle, onLog }) {
  let cwd = '/home/student';
  let line = '';
  const history = [];
  let historyIdx = -1;

  const write = (text) => {
    const crlf = text.replace(/\r?\n/g, '\r\n');
    term.write(crlf);
    onLog?.(crlf);
  };

  const getPrompt = () => {
    const shortCwd = formatCwd(cwd);
    if (getPromptStyle?.() === 'kali') {
      return `\r\n\x1b[1;34m┌──(\x1b[1;32mstudent㉿${vmName}\x1b[1;34m)-[\x1b[0m${shortCwd}\x1b[1;34m]\r\n└─\x1b[1;32m$\x1b[0m `;
    }
    return `\x1b[1;32mstudent@${vmName}\x1b[0m:\x1b[1;34m${shortCwd}\x1b[0m$ `;
  };

  const printPrompt = () => write(getPrompt());

  const runCommand = (rawInput) => {
    const trimmed = rawInput.trim();
    if (!trimmed) return;

    // Support simple "cmd1 && cmd2" from snippet buttons
    if (trimmed.includes('&&')) {
      for (const part of trimmed.split('&&')) {
        runCommand(part);
      }
      return;
    }

    const tokens = trimmed.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
    const cmd = tokens[0];
    const args = tokens.slice(1).map((a) => a.replace(/^['"]|['"]$/g, ''));

    switch (cmd) {
      case 'help':
        write(
          [
            'PTaaS Cloud Demo Shell — deterministic allow-listed simulation:',
            '  whoami, id, hostname, uname -a, date, pwd',
            '  ls [path], cd <dir>, cat <file>, echo <text>, clear, history',
            '  ip a | ip -br a, ping <host>, nmap <target>, htop, msfconsole',
            '',
          ].join('\n')
        );
        break;

      case 'whoami':
        write('student\n');
        break;

      case 'id':
        write('uid=1000(student) gid=1000(student) groups=1000(student),27(sudo),134(wireshark)\n');
        break;

      case 'hostname':
        write(`${vmName}\n`);
        break;

      case 'pwd':
        write(`${cwd}\n`);
        break;

      case 'date':
        write('Thu Nov 12 21:27:29 UTC 2026\n');
        break;

      case 'uname':
        if (args.includes('-a') || args.includes('-r')) {
          write(`Linux ${vmName} 6.6.9-cloud-amd64 #1 SMP PREEMPT_DYNAMIC x86_64 GNU/Linux\n`);
        } else {
          write('Linux\n');
        }
        break;

      case 'echo':
        write(args.join(' ') + '\n');
        break;

      case 'clear':
        term.clear();
        break;

      case 'history':
        history.forEach((hCmd, i) => write(`  ${String(i + 1).padStart(3, ' ')}  ${hCmd}\n`));
        break;

      case 'ls': {
        const target = resolvePath(cwd, args.find((a) => !a.startsWith('-')) || cwd);
        const node = FS[target];
        if (!node) {
          write(`ls: cannot access '${args[0] || target}': No such file or directory\n`);
        } else if (node.type === 'file') {
          write(`${target.split('/').pop()}\n`);
        } else {
          const colored = node.entries.map((name) => {
            const child = FS[`${target === '/' ? '' : target}/${name}`];
            return child?.type === 'dir' ? `\x1b[1;34m${name}/\x1b[0m` : name;
          });
          write(colored.join('  ') + '\n');
        }
        break;
      }

      case 'cd': {
        const target = resolvePath(cwd, args[0] || '~');
        const node = FS[target];
        if (!node) {
          write(`bash: cd: ${args[0]}: No such file or directory\n`);
        } else if (node.type !== 'dir') {
          write(`bash: cd: ${args[0]}: Not a directory\n`);
        } else {
          cwd = target;
        }
        break;
      }

      case 'cat': {
        if (!args[0]) {
          write('cat: missing file operand\n');
          break;
        }
        const target = resolvePath(cwd, args[0]);
        const node = FS[target];
        if (!node) {
          write(`cat: ${args[0]}: No such file or directory\n`);
        } else if (node.type === 'dir') {
          write(`cat: ${args[0]}: Is a directory\n`);
        } else {
          write(node.content + '\n');
        }
        break;
      }

      case 'ip':
        if (args.includes('-br')) {
          write(
            [
              'lo               UNKNOWN        127.0.0.1/8',
              `eth0             UP             ${vmIp}/24`,
              'vxlan-4096       UP             10.10.2.1/24',
              '',
            ].join('\n')
          );
        } else {
          write(
            [
              '1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 state UNKNOWN',
              '    inet 127.0.0.1/8 scope host lo',
              '2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1450 state UP',
              `    inet ${vmIp}/24 brd 10.10.1.255 scope global eth0`,
              '',
            ].join('\n')
          );
        }
        break;

      case 'ping': {
        const target = args.find((a) => !a.startsWith('-')) || '10.10.2.10';
        if (target === '8.8.8.8' || target === '1.1.1.1') {
          write(
            [
              `PING ${target} (${target}) 56(84) bytes of data.`,
              `From ${vmIp} icmp_seq=1 Packet filtered (NIST egress ACL drop)`,
              `--- ${target} ping statistics ---`,
              '1 packets transmitted, 0 received, +1 errors, 100% packet loss',
              '',
            ].join('\n')
          );
        } else {
          write(
            [
              `PING ${target} (${target}) 56(84) bytes of data.`,
              `64 bytes from ${target}: icmp_seq=1 ttl=64 time=0.42 ms`,
              `64 bytes from ${target}: icmp_seq=2 ttl=64 time=0.39 ms`,
              `--- ${target} ping statistics ---`,
              '2 packets transmitted, 2 received, 0% packet loss, time 1001ms',
              '',
            ].join('\n')
          );
        }
        break;
      }

      case 'nmap': {
        const target = args.find((a) => !a.startsWith('-')) || '10.10.2.10';
        write(
          [
            'Starting Nmap 7.94SVN ( https://nmap.org ) [Demo Simulation]',
            `Nmap scan report for ${target}`,
            'Host is up (0.00045s latency).',
            'Not shown: 997 closed tcp ports (reset)',
            'PORT     STATE SERVICE VERSION',
            '22/tcp   open  ssh     OpenSSH 8.9p1 Ubuntu 3ubuntu0.6',
            '80/tcp   open  http    Apache httpd 2.4.52 ((Ubuntu))',
            '3306/tcp open  mysql   MySQL 8.0.35',
            '',
            'Nmap done: 1 IP address (1 host up) scanned in 1.18 seconds',
            '',
          ].join('\n')
        );
        break;
      }

      case 'htop':
        write('[Demo simulation] PID 1240 student 20 0 142M 24M S 0.7% 0.6% /usr/bin/bash\n');
        break;

      case 'msfconsole':
        write('[Demo simulation] Metasploit Framework console is disabled in static demo mode.\n');
        break;

      case 'exit':
        write('logout (demo session stays active; type "help" for commands)\n');
        break;

      default:
        write(`bash: ${cmd}: command not found\n`);
        break;
    }
  };

  function boot() {
    term.clear();
    write(
      [
        `Linux ${vmName} 6.6.9-cloud-amd64 #1 SMP PREEMPT_DYNAMIC x86_64`,
        '',
        'PTaaS Cloud Demo Terminal — deterministic in-memory simulation.',
        'Type "help" to list available commands.',
        '',
      ].join('\n')
    );
    printPrompt();
  }

  function handleData(data) {
    for (let i = 0; i < data.length; i++) {
      const ch = data[i];
      if (ch === '\r' || ch === '\n') {
        write('\r\n');
        if (line.trim()) {
          history.push(line);
          historyIdx = history.length;
        }
        runCommand(line);
        line = '';
        printPrompt();
      } else if (ch === '\x7f' || ch === '\b') {
        if (line.length > 0) {
          line = line.slice(0, -1);
          term.write('\b \b');
        }
      } else if (ch === '\x03') {
        // Ctrl+C
        write('^C\r\n');
        line = '';
        printPrompt();
      } else if (ch === '\x0c') {
        // Ctrl+L
        term.clear();
        printPrompt();
        if (line) term.write(line);
      } else if (ch === '\x1b') {
        // Handle Up/Down arrows (CSI A / CSI B)
        const seq = data.slice(i, i + 3);
        if (seq === '\x1b[A') {
          i += 2;
          if (historyIdx > 0) {
            historyIdx--;
            term.write('\b \b'.repeat(line.length));
            line = history[historyIdx] || '';
            term.write(line);
          }
        } else if (seq === '\x1b[B') {
          i += 2;
          if (historyIdx < history.length) {
            historyIdx++;
            term.write('\b \b'.repeat(line.length));
            line = history[historyIdx] || '';
            term.write(line);
          }
        }
      } else if (ch >= ' ' && ch !== '\x7f') {
        line += ch;
        term.write(ch);
      }
    }
  }

  function refreshPrompt() {
    write('\r\n');
    printPrompt();
    if (line) term.write(line);
  }

  return { boot, handleData, refreshPrompt };
}
