/**
 * Generates a realistic HTML report where async I/O wait dominates wall time.
 * Scenario: An Express API server handling requests with database queries,
 * Redis caching, and HTTP calls to external services.
 */

import { renderHtml } from '../src/reporter/html.js';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Helper to build source snippet HTML matching the source-reader format
function srcSnippet(lines, hotLineNum) {
  let html = '<pre class="source-snippet"><code>';
  for (const [lineNum, code] of lines) {
    const isHot = lineNum === hotLineNum;
    const cls = isHot ? 'src-line src-hot' : 'src-line';
    html += `<div class="${cls}"><span class="src-lineno">${lineNum}</span>${code}</div>`;
  }
  html += '</code></pre>';
  return html;
}

// Token helpers
const kw = (s) => `<span class="tok-kw">${s}</span>`;
const str = (s) => `<span class="tok-str">${s}</span>`;
const num = (s) => `<span class="tok-num">${s}</span>`;
const cmt = (s) => `<span class="tok-cmt">${s}</span>`;

// ── Source snippets ──

const clientQuerySource = srcSnippet([
  [277, `  ${cmt('// Send query to the PostgreSQL server')}`],
  [278, ``],
  [279, `  ${kw('async')} query(text, values) {`],
  [280, `    ${kw('const')} result = ${kw('await')} ${kw('this')}.connection.query(`],
  [281, `      text,`],
  [282, `      values,`],
  [283, `    );`],
  [284, `    ${kw('return')} ${kw('this')}._processResult(result);`],
  [285, `  }`],
  [286, ``],
  [287, `  ${cmt('// Parse incoming message from connection')}`],
  [288, `  _parseMessage(msg) {`],
  [289, `    ${kw('const')} parsed = ${kw('this')}.parser.parse(msg);`],
  [290, `    ${kw('return')} parsed;`],
  [291, `  }`],
], 284);

const getUsersSource = srcSnippet([
  [35, `  ${cmt('// GET /users - list all users with pagination')}`],
  [36, ``],
  [37, `  ${kw('export')} ${kw('async')} ${kw('function')} getUsers(req, res) {`],
  [38, `    ${kw('const')} { page = ${num('1')}, limit = ${num('20')} } = req.query;`],
  [39, `    ${kw('const')} offset = (page - ${num('1')}) * limit;`],
  [40, ``],
  [41, `    ${kw('const')} users = ${kw('await')} db.query(`],
  [42, `      ${str('`SELECT * FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2`')},`],
  [43, `      [limit, offset]`],
  [44, `    );`],
  [45, ``],
  [46, `    ${kw('const')} total = ${kw('await')} db.query(${str("'SELECT COUNT(*) FROM users'")});`],
  [47, `    res.json({ users: users.rows, total: total.rows[${num('0')}].count });`],
  [48, `  }`],
  [49, ``],
], 42);

const verifyTokenSource = srcSnippet([
  [8, `  ${cmt('// JWT token verification middleware')}`],
  [9, ``],
  [10, `  ${kw('export')} ${kw('async')} ${kw('function')} verifyToken(req, res, next) {`],
  [11, `    ${kw('const')} token = req.headers.authorization?.split(${str("' '")})[ ${num('1')}];`],
  [12, `    ${kw('if')} (!token) ${kw('return')} res.status(${num('401')}).json({ error: ${str("'No token'")} });`],
  [13, ``],
  [14, `    ${kw('const')} cached = ${kw('await')} redis.get(${str('`auth:${token}`')});`],
  [15, `    ${kw('if')} (cached) { req.user = JSON.parse(cached); ${kw('return')} next(); }`],
  [16, ``],
  [17, `    ${kw('const')} decoded = ${kw('await')} jwt.verify(token, process.env.JWT_SECRET);`],
  [18, `    ${kw('await')} redis.set(${str('`auth:${token}`')}, JSON.stringify(decoded), ${str("'EX'")}, ${num('300')});`],
  [19, `    req.user = decoded;`],
  [20, `    next();`],
  [21, `  }`],
  [22, ``],
], 15);

const sendCommandSource = srcSnippet([
  [185, `  ${cmt('// Send a command to the Redis server')}`],
  [186, ``],
  [187, `  ${kw('async')} sendCommand(command, ...args) {`],
  [188, `    ${kw('if')} (!${kw('this')}.status === ${str("'ready'")}) {`],
  [189, `      ${kw('await')} ${kw('this')}.ready();`],
  [190, `    }`],
  [191, ``],
  [192, `    ${kw('return')} ${kw('new')} Promise((resolve, reject) =&gt; {`],
  [193, `      ${kw('this')}.stream.write(${kw('this')}.encoder.encode(command, args));`],
  [194, `      ${kw('this')}.callbacks.push({ resolve, reject });`],
  [195, `    });`],
  [196, `  }`],
  [197, ``],
  [198, `  ${cmt('// Parse reply from Redis server')}`],
  [199, `  parseReply(data) {`],
], 192);

const connectSource = srcSnippet([
  [60, `  ${cmt('// Establish TCP connection to target host')}`],
  [61, ``],
  [62, `  ${kw('async')} ${kw('function')} connect({ hostname, port, protocol }) {`],
  [63, `    ${kw('const')} socket = protocol === ${str("'https:'")} `],
  [64, `      ? tls.connect(port, hostname, { servername: hostname })`],
  [65, `      : net.connect(port, hostname);`],
  [66, ``],
  [67, `    ${kw('await')} once(socket, ${str("'connect'")});`],
  [68, ``],
  [69, `    ${kw('if')} (protocol === ${str("'https:'")}) {`],
  [70, `      ${kw('await')} once(socket, ${str("'secureConnect'")});`],
  [71, `    }`],
  [72, ``],
  [73, `    ${kw('return')} socket;`],
  [74, `  }`],
], 67);

const data = {
  timestamp: '2026-03-03T14:22:08.431Z',
  projectName: '@acme/api-server',
  wallTimeUs:   12_340_000,   // 12.34s wall time
  totalTimeUs:   1_870_000,   // 1.87s CPU time  (~15% utilization)
  totalAsyncTimeUs: 9_820_000, // 9.82s async I/O wait
  otherCount: 3,
  packages: [
    // ── pg (postgres driver) — heaviest async waiter ──
    {
      name: 'pg',
      isFirstParty: false,
      depChain: ['pg'],
      timeUs:   180_000,
      pct: 9.6,
      sampleCount: 182,
      asyncTimeUs: 4_210_000,
      asyncPct: 42.9,
      asyncOpCount: 48,
      otherCount: 0,
      files: [
        {
          name: 'lib/client.js',
          timeUs: 120_000,
          pct: 6.4,
          sampleCount: 121,
          asyncTimeUs: 2_850_000,
          asyncPct: 29.0,
          asyncOpCount: 24,
          otherCount: 0,
          functions: [
            {
              name: 'Client.query:284',
              timeUs: 95_000,
              pct: 5.1,
              sampleCount: 96,
              asyncTimeUs: 2_640_000,
              asyncPct: 26.9,
              asyncOpCount: 24,
              sourceHtml: clientQuerySource,
              asyncCallStack: [
                { pkg: '@acme/api-server', file: 'src/routes/users.ts', functionId: 'getUsers:42' },
                { pkg: '@acme/api-server', file: 'src/db/queries.ts', functionId: 'findAll:18' },
                { pkg: 'pg', file: 'lib/client.js', functionId: 'Client.query:284' },
              ],
            },
            {
              name: 'Client._parseMessage:310',
              timeUs: 25_000,
              pct: 1.3,
              sampleCount: 25,
              asyncTimeUs: 210_000,
              asyncPct: 2.1,
              asyncOpCount: 0,
            },
          ],
        },
        {
          name: 'lib/connection.js',
          timeUs: 60_000,
          pct: 3.2,
          sampleCount: 61,
          asyncTimeUs: 1_360_000,
          asyncPct: 13.8,
          asyncOpCount: 24,
          otherCount: 0,
          functions: [
            {
              name: 'Connection.connect:45',
              timeUs: 60_000,
              pct: 3.2,
              sampleCount: 61,
              asyncTimeUs: 1_360_000,
              asyncPct: 13.8,
              asyncOpCount: 24,
            },
          ],
        },
      ],
    },

    // ── ioredis — second heaviest async waiter ──
    {
      name: 'ioredis',
      isFirstParty: false,
      depChain: ['ioredis'],
      timeUs:   95_000,
      pct: 5.1,
      sampleCount: 96,
      asyncTimeUs: 2_870_000,
      asyncPct: 29.2,
      asyncOpCount: 312,
      otherCount: 0,
      files: [
        {
          name: 'built/Redis.js',
          timeUs: 68_000,
          pct: 3.6,
          sampleCount: 69,
          asyncTimeUs: 1_940_000,
          asyncPct: 19.8,
          asyncOpCount: 156,
          otherCount: 0,
          functions: [
            {
              name: 'Redis.sendCommand:192',
              timeUs: 52_000,
              pct: 2.8,
              sampleCount: 53,
              asyncTimeUs: 1_680_000,
              asyncPct: 17.1,
              asyncOpCount: 156,
              sourceHtml: sendCommandSource,
            },
            {
              name: 'Redis.parseReply:240',
              timeUs: 16_000,
              pct: 0.9,
              sampleCount: 16,
              asyncTimeUs: 260_000,
              asyncPct: 2.6,
              asyncOpCount: 0,
            },
          ],
        },
        {
          name: 'built/connectors/StandaloneConnector.js',
          timeUs: 27_000,
          pct: 1.4,
          sampleCount: 27,
          asyncTimeUs: 930_000,
          asyncPct: 9.5,
          asyncOpCount: 156,
          otherCount: 0,
          functions: [
            {
              name: 'StandaloneConnector.connect:28',
              timeUs: 27_000,
              pct: 1.4,
              sampleCount: 27,
              asyncTimeUs: 930_000,
              asyncPct: 9.5,
              asyncOpCount: 156,
            },
          ],
        },
      ],
    },

    // ── undici (HTTP client) ──
    {
      name: 'undici',
      isFirstParty: false,
      depChain: ['undici'],
      timeUs:   140_000,
      pct: 7.5,
      sampleCount: 141,
      asyncTimeUs: 1_890_000,
      asyncPct: 19.2,
      asyncOpCount: 36,
      otherCount: 0,
      files: [
        {
          name: 'lib/core/connect.js',
          timeUs: 85_000,
          pct: 4.5,
          sampleCount: 86,
          asyncTimeUs: 1_120_000,
          asyncPct: 11.4,
          asyncOpCount: 18,
          otherCount: 0,
          functions: [
            {
              name: 'connect:67',
              timeUs: 85_000,
              pct: 4.5,
              sampleCount: 86,
              asyncTimeUs: 1_120_000,
              asyncPct: 11.4,
              asyncOpCount: 18,
              sourceHtml: connectSource,
            },
          ],
        },
        {
          name: 'lib/client.js',
          timeUs: 55_000,
          pct: 2.9,
          sampleCount: 55,
          asyncTimeUs: 770_000,
          asyncPct: 7.8,
          asyncOpCount: 18,
          otherCount: 0,
          functions: [
            {
              name: 'Client.dispatch:140',
              timeUs: 55_000,
              pct: 2.9,
              sampleCount: 55,
              asyncTimeUs: 770_000,
              asyncPct: 7.8,
              asyncOpCount: 18,
            },
          ],
        },
      ],
    },

    // ── First-party code — moderate CPU, some async ──
    {
      name: '@acme/api-server',
      isFirstParty: true,
      timeUs:   680_000,
      pct: 36.4,
      sampleCount: 684,
      asyncTimeUs: 420_000,
      asyncPct: 4.3,
      asyncOpCount: 12,
      otherCount: 1,
      files: [
        {
          name: 'src/routes/users.ts',
          timeUs: 210_000,
          pct: 11.2,
          sampleCount: 211,
          asyncTimeUs: 180_000,
          asyncPct: 1.8,
          asyncOpCount: 6,
          otherCount: 0,
          functions: [
            {
              name: 'getUsers:42',
              timeUs: 130_000,
              pct: 7.0,
              sampleCount: 131,
              asyncTimeUs: 120_000,
              asyncPct: 1.2,
              asyncOpCount: 3,
              sourceHtml: getUsersSource,
            },
            {
              name: 'getUserById:78',
              timeUs: 80_000,
              pct: 4.3,
              sampleCount: 80,
              asyncTimeUs: 60_000,
              asyncPct: 0.6,
              asyncOpCount: 3,
            },
          ],
        },
        {
          name: 'src/middleware/auth.ts',
          timeUs: 190_000,
          pct: 10.2,
          sampleCount: 191,
          asyncTimeUs: 140_000,
          asyncPct: 1.4,
          asyncOpCount: 3,
          otherCount: 0,
          functions: [
            {
              name: 'verifyToken:15',
              timeUs: 190_000,
              pct: 10.2,
              sampleCount: 191,
              asyncTimeUs: 140_000,
              asyncPct: 1.4,
              asyncOpCount: 3,
              sourceHtml: verifyTokenSource,
            },
          ],
        },
        {
          name: 'src/serializers/user.ts',
          timeUs: 160_000,
          pct: 8.6,
          sampleCount: 161,
          asyncTimeUs: 0,
          asyncPct: 0,
          asyncOpCount: 0,
          otherCount: 0,
          functions: [
            {
              name: 'serializeUser:8',
              timeUs: 110_000,
              pct: 5.9,
              sampleCount: 110,
            },
            {
              name: 'serializeAddress:34',
              timeUs: 50_000,
              pct: 2.7,
              sampleCount: 51,
            },
          ],
        },
      ],
    },

    // ── express — some CPU overhead ──
    {
      name: 'express',
      isFirstParty: false,
      depChain: ['express'],
      timeUs:   320_000,
      pct: 17.1,
      sampleCount: 322,
      asyncTimeUs: 210_000,
      asyncPct: 2.1,
      asyncOpCount: 6,
      otherCount: 1,
      files: [
        {
          name: 'lib/router/index.js',
          timeUs: 180_000,
          pct: 9.6,
          sampleCount: 181,
          asyncTimeUs: 120_000,
          asyncPct: 1.2,
          asyncOpCount: 3,
          otherCount: 0,
          functions: [
            {
              name: 'processParams:291',
              timeUs: 110_000,
              pct: 5.9,
              sampleCount: 111,
              asyncTimeUs: 80_000,
              asyncPct: 0.8,
              asyncOpCount: 2,
            },
            {
              name: 'matchLayer:156',
              timeUs: 70_000,
              pct: 3.7,
              sampleCount: 70,
              asyncTimeUs: 40_000,
              asyncPct: 0.4,
              asyncOpCount: 1,
            },
          ],
        },
        {
          name: 'lib/response.js',
          timeUs: 95_000,
          pct: 5.1,
          sampleCount: 96,
          asyncTimeUs: 60_000,
          asyncPct: 0.6,
          asyncOpCount: 2,
          otherCount: 0,
          functions: [
            {
              name: 'res.json:241',
              timeUs: 95_000,
              pct: 5.1,
              sampleCount: 96,
              asyncTimeUs: 60_000,
              asyncPct: 0.6,
              asyncOpCount: 2,
            },
          ],
        },
      ],
    },

    // ── zlib (compression) — small async ──
    {
      name: 'zlib',
      isFirstParty: false,
      timeUs:   125_000,
      pct: 6.7,
      sampleCount: 126,
      asyncTimeUs: 220_000,
      asyncPct: 2.2,
      asyncOpCount: 18,
      otherCount: 0,
      files: [
        {
          name: 'lib/zlib.js',
          timeUs: 125_000,
          pct: 6.7,
          sampleCount: 126,
          asyncTimeUs: 220_000,
          asyncPct: 2.2,
          asyncOpCount: 18,
          otherCount: 0,
          functions: [
            {
              name: 'Gzip.flush:189',
              timeUs: 125_000,
              pct: 6.7,
              sampleCount: 126,
              asyncTimeUs: 220_000,
              asyncPct: 2.2,
              asyncOpCount: 18,
            },
          ],
        },
      ],
    },
  ],
};

const html = renderHtml(data);
const outPath = resolve('assets/async-report-screenshot.html');
writeFileSync(outPath, html, 'utf-8');
console.log(`Written to ${outPath}`);
