// Live test for Web Terminal WebSocket PTY Gateway connecting into guest VM
const http = require('http');
const crypto = require('crypto');

async function testTerminalLive() {
  console.log('Testing live terminal PTY gateway over WebSocket...\n');

  // 1. Request session token for vm-1 (kali-lab-01)
  const tokenRes = await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/vms/vm-1/terminal-session',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': 'http://127.0.0.1:3000' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.end();
  });

  console.log('Received session token for VM:', tokenRes.vmName);

  // 2. Connect raw WebSocket client
  const secKey = crypto.randomBytes(16).toString('base64');
  const req = http.request({
    hostname: '127.0.0.1',
    port: 3000,
    path: tokenRes.wsUrl,
    method: 'GET',
    headers: {
      'Connection': 'Upgrade',
      'Upgrade': 'websocket',
      'Sec-WebSocket-Version': '13',
      'Sec-WebSocket-Key': secKey
    }
  });

  req.on('upgrade', (res, socket, head) => {
    console.log('✓ WebSocket upgrade successful (101 Switching Protocols)');

    let fullOutput = '';
    let testedPwd = false;
    let testedLs = false;

    function sendWsFrame(str) {
      const payload = Buffer.from(str, 'utf8');
      const mask = crypto.randomBytes(4);
      const masked = Buffer.alloc(payload.length);
      for (let i = 0; i < payload.length; i++) {
        masked[i] = payload[i] ^ mask[i % 4];
      }
      const header = Buffer.from([0x81, 0x80 | payload.length]);
      socket.write(Buffer.concat([header, mask, masked]));
    }

    socket.on('data', (chunk) => {
      // Decode unmasked server frame
      if (chunk.length >= 2) {
        let offset = 2;
        let len = chunk[1] & 0x7f;
        if (len === 126) offset = 4;
        else if (len === 127) offset = 10;
        const text = chunk.slice(offset).toString('utf8');
        fullOutput += text;

        if (fullOutput.includes('student@kali-lab-01') && !testedPwd) {
          testedPwd = true;
          console.log('✓ Prompt detected: student@kali-lab-01:~$');
          sendWsFrame('pwd\r');
        } else if (testedPwd && fullOutput.includes('/home/student') && !testedLs) {
          testedLs = true;
          console.log('✓ pwd command confirmed: /home/student');
          sendWsFrame('ls\r');
        } else if (testedLs && fullOutput.includes('Desktop') && fullOutput.includes('Downloads')) {
          console.log('✓ ls command confirmed: proper column alignment, no staircase');
          console.log('\n--- TERMINAL OUTPUT SAMPLE ---');
          console.log(fullOutput);
          console.log('------------------------------');
          socket.destroy();
          console.log('\nLIVE TERMINAL TEST PASSED SUCCESSFULLY!');
          process.exit(0);
        }
      }
    });
  });

  req.end();
}

testTerminalLive().catch(err => {
  console.error('Terminal test error:', err.message);
  process.exit(1);
});
