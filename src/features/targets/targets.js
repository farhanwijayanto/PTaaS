import { h, icon } from '../../lib/dom.js';
import { button } from '../../components/ui/button.js';
import { badge } from '../../components/ui/badge.js';
import { statusDot } from '../../components/ui/status-dot.js';
import { toast } from '../../components/ui/toast.js';
import { navigate } from '../../lib/router.js';
import { pageHeader } from '../../components/layout/page-header.js';
import { PageContainer } from '../../components/layout/page-container.js';

export function TargetsPage() {
  let targets = [
    {
      id: 'target-dvwa',
      name: 'Damn Vulnerable Web Application (DVWA)',
      version: 'v2.0.4',
      ip: '10.10.2.10',
      difficulty: 'Beginner - Intermediate',
      status: 'running',
      desc: 'PHP/MySQL web application deliberately vulnerable. Ideal for testing SQL injection, file inclusion, XSS, and command injection.',
      tags: ['SQLi', 'XSS', 'CSRF', 'File Inclusion', 'Command Injection'],
      ports: '80/tcp (HTTP), 3306/tcp (MySQL)'
    },
    {
      id: 'target-metasploitable',
      name: 'Metasploitable 2',
      version: 'v2.0 Linux VM',
      ip: '10.10.2.20',
      difficulty: 'Beginner',
      status: 'running',
      desc: 'Intentionally vulnerable Ubuntu Linux virtual machine designed for security training and practicing Metasploit modules.',
      tags: ['VSFTPD Backdoor', 'Samba RCE', 'SSH Bruteforce', 'Apache Misconfig'],
      ports: '21/tcp, 22/tcp, 80/tcp, 139/tcp, 445/tcp'
    },
    {
      id: 'target-juiceshop',
      name: 'OWASP Juice Shop',
      version: 'v16.0.0',
      ip: '10.10.2.30',
      difficulty: 'Intermediate - Advanced',
      status: 'running',
      desc: 'Modern JavaScript (Node.js/Angular) web application covering the entire OWASP Top 10 vulnerabilities with interactive scoreboard.',
      tags: ['OWASP Top 10', 'JWT Tampering', 'NoSQL Injection', 'XXE', 'SSRF'],
      ports: '3000/tcp (HTTP Webapp)'
    }
  ];

  const host = h('div', { class: 'space-y-6' });

  function render() {
    host.innerHTML = '';

    const header = pageHeader({
      title: 'Lab Practice Targets',
      description: 'Pre-configured vulnerable machines running inside your isolated lab subnet (10.10.2.0/24).',
      action: button({
        variant: 'outline',
        size: 'sm',
        icon: 'refresh-cw',
        label: 'Reset All Targets',
        onClick: () => {
          toast.success('All lab practice targets restored to pristine snapshots');
        }
      })
    });

    const grid = h('div', { class: 'grid grid-cols-1 md:grid-cols-3 gap-4' },
      targets.map(t => h('div', {
        class: 'rounded-xl border border-line bg-surface p-5 space-y-4 flex flex-col justify-between hover:border-line-strong transition-colors'
      },
        h('div', { class: 'space-y-3' },
          h('div', { class: 'flex items-start justify-between gap-2' },
            h('div', {},
              h('h3', { class: 'font-semibold text-sm tracking-tight text-fg' }, t.name),
              h('span', { class: 'text-[11px] text-muted' }, t.version)
            ),
            statusDot('running')
          ),
          h('div', { class: 'flex items-center gap-2 font-mono text-xs' },
            badge({ label: t.ip, variant: 'outline', size: 'xs' }),
            h('span', { class: 'text-subtle text-[11px]' }, t.difficulty)
          ),
          h('p', { class: 'text-xs text-muted leading-relaxed' }, t.desc),
          h('div', { class: 'flex flex-wrap gap-1.5 pt-1' },
            t.tags.map(tag => badge({ label: tag, variant: 'neutral', size: 'xs' }))
          )
        ),

        h('div', { class: 'pt-3 border-t border-line space-y-2' },
          h('div', { class: 'text-[11px] font-mono text-subtle flex items-center justify-between' },
            h('span', {}, 'Exposed ports:'),
            h('span', { class: 'text-muted' }, t.ports)
          ),
          h('div', { class: 'grid grid-cols-2 gap-2 pt-1' },
            button({
              variant: 'outline',
              size: 'xs',
              icon: 'terminal',
              label: 'Scan in CLI',
              onClick: () => {
                navigate('/terminal');
                toast.info(`Switched to terminal. Target ${t.ip} ready.`);
              }
            }),
            button({
              variant: 'primary',
              size: 'xs',
              icon: 'external-link',
              label: 'Open in GUI',
              onClick: () => {
                navigate('/desktop');
                toast.info(`Switched to desktop GUI to exploit ${t.name}`);
              }
            })
          )
        )
      ))
    );

    host.appendChild(header);
    host.appendChild(grid);
  }

  render();
  return PageContainer({ variant: 'default' }, host);
}
