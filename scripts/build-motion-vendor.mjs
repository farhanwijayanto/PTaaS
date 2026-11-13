import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const OUT_DIR = path.resolve(process.cwd(), 'src/lib/vendor');
fs.mkdirSync(OUT_DIR, { recursive: true });

const bundles = [
  {
    name: 'motion-mini.mjs',
    code: `export { animate } from 'motion/mini';`,
  },
  {
    name: 'motion-core.mjs',
    code: `export { animate, scroll, inView, stagger, spring, frame, cancelFrame } from 'motion';`,
  },
  {
    name: 'lenis.mjs',
    code: `export { default } from 'lenis';`,
  },
];

console.log('=== MOTION & LENIS VENDOR BUNDLE SIZES ===');
for (const b of bundles) {
  const outFile = path.join(OUT_DIR, b.name);
  await esbuild.build({
    stdin: {
      contents: b.code,
      resolveDir: process.cwd(),
      loader: 'js',
    },
    bundle: true,
    minify: true,
    format: 'esm',
    target: ['es2020'],
    outfile: outFile,
  });
  const buf = fs.readFileSync(outFile);
  const gz = zlib.gzipSync(buf).length;
  console.log(`  ${b.name.padEnd(20)} raw=${(buf.length / 1024).toFixed(2)} KB   gzip=${(gz / 1024).toFixed(2)} KB`);
}
