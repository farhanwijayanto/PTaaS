const GuacamoleLite = require('guacamole-lite');

const PORT = Number.parseInt(process.env.PORT || '8080', 10);
const GUACD_HOST = process.env.GUACD_HOST || 'ptaas-guacd';
const GUACD_PORT = Number.parseInt(process.env.GUACD_PORT || '4822', 10);
const GUAC_SECRET_KEY = process.env.GUAC_SECRET_KEY || '';

if (GUAC_SECRET_KEY.length !== 32) {
  console.error('[ptaas-guac-ws] GUAC_SECRET_KEY must be exactly 32 characters (AES-256-CBC).');
  process.exit(1);
}

const websocketOptions = {
  port: PORT,
};

const guacdOptions = {
  host: GUACD_HOST,
  port: GUACD_PORT,
};

const clientOptions = {
  crypt: {
    cypher: 'AES-256-CBC',
    key: GUAC_SECRET_KEY,
  },
  log: {
    level: process.env.GUAC_LOG_LEVEL || 'ERRORS',
  },
};

new GuacamoleLite(websocketOptions, guacdOptions, clientOptions);
console.log(`[ptaas-guac-ws] Listening on :${PORT} -> guacd ${GUACD_HOST}:${GUACD_PORT}`);
