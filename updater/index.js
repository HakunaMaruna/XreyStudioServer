// Мини-сервис обновления панели. Работает в отдельном контейнере с доступом к
// docker-сокету и каталогу репозитория: панель не получает ни того, ни другого.
// Включается профилем compose "updater"; без него кнопка обновления показывает
// ручную команду.
const http = require('http');
const { spawn } = require('child_process');
const { timingSafeEqual } = require('crypto');
const fs = require('fs');

const TOKEN = process.env.UPDATER_TOKEN || '';
const PORT = Number(process.env.PORT || 7070);
const WORKSPACE = process.env.WORKSPACE_DIR || '/workspace';
const COMPOSE_FILE = process.env.COMPOSE_FILE_PATH || `${WORKSPACE}/docker-compose.yml`;
const LOG_LIMIT = 64 * 1024;

let project = '';
let composeCmd = ['docker', 'compose'];
let running = false;
let startedAt = null;
let finishedAt = null;
let exitCode = null;
let log = '';
let current = null;

function append(chunk) {
  log = (log + chunk.toString()).slice(-LOG_LIMIT);
}

function composeProject() {
  if (project) return project;
  // Имя проекта compose совпадает с каталогом, а внутри контейнера он другой,
  // поэтому берём его из метки самого контейнера updater.
  return new Promise((resolve) => {
    const child = spawn('docker', [
      'inspect', '--format',
      '{{ index .Config.Labels "com.docker.compose.project" }}',
      process.env.HOSTNAME || '',
    ]);
    let out = '';
    child.stdout.on('data', (d) => (out += d.toString()));
    child.on('error', () => resolve(''));
    child.on('close', () => {
      project = out.trim();
      resolve(project);
    });
  });
}

// В Alpine плагин может стоять отдельным бинарём docker-compose, поэтому
// выбираем первый работающий вариант, а не полагаемся на `docker compose`.
async function detectCompose() {
  for (const candidate of [['docker', 'compose'], ['docker-compose']]) {
    const ok = await new Promise((resolve) => {
      const child = spawn(candidate[0], [...candidate.slice(1), 'version']);
      child.on('error', () => resolve(false));
      child.on('close', (code) => resolve(code === 0));
    });
    if (ok) {
      composeCmd = candidate;
      return;
    }
  }
}

// `git checkout <тег>` оставляет репозиторий в detached HEAD, где `git pull`
// невозможен. Поэтому перед pull возвращаемся на ветку: её имя берём из HEAD,
// а если HEAD отвязан — первую локальную ветку (origin/HEAD в старых клонах нет).
const BACK_TO_BRANCH = [
  // `for-each-ref` перечисляет только реальные ветки: `git branch` в detached
  // HEAD выдаёт первой псевдо-запись «(HEAD detached at ...)».
  `branch=$(git symbolic-ref -q --short HEAD || git for-each-ref --format='%(refname:short)' refs/heads | head -n 1)`,
  `test -z "$(git status --porcelain)" || { echo 'refusing update: working tree has uncommitted changes' >&2; exit 1; }`,
  'git checkout -q "${branch:-main}"',
  'git pull -q --ff-only',
];

// Теги в репозитории — с префиксом `v`, а панель отдаёт версию без него:
// проверяем оба варианта, иначе checkout падает на pathspec.
function checkoutTag(targetVersion) {
  return `( test -z "$(git status --porcelain)" || { echo 'refusing update: working tree has uncommitted changes' >&2; exit 1; }; tag=${shellQuote(targetVersion)}; git rev-parse -q --verify "refs/tags/$tag" >/dev/null || tag=v$tag; git checkout -q "$tag" )`;
}

async function updateCommand(targetVersion) {
  const name = await composeProject();
  const compose = [...composeCmd];
  if (name) compose.push('-p', name);
  compose.push('-f', COMPOSE_FILE);
  const composeString = compose.map(shellQuote).join(' ');
  return [
    `cd ${shellQuote(WORKSPACE)}`,
    'git fetch --tags --force origin',
    ...(targetVersion ? [checkoutTag(targetVersion)] : BACK_TO_BRANCH),
    `${composeString} build backend frontend agent`,
    `${composeString} up -d --no-deps backend frontend agent`,
  ].join(' && ');
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function authorized(req) {
  const expected = Buffer.from(TOKEN);
  const given = Buffer.from(String(req.headers['x-updater-token'] || ''));
  if (!expected.length || expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}

function status() {
  return {
    running,
    startedAt,
    finishedAt,
    exitCode,
    logTail: log.slice(-4000),
    project,
  };
}

function start(targetVersion) {
  running = true;
  startedAt = new Date().toISOString();
  finishedAt = null;
  exitCode = null;
  log = '';
  updateCommand(targetVersion).then((command) => {
    current = spawn('sh', ['-c', command], { cwd: WORKSPACE, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
    append(`$ ${command}\n`);
    current.stdout.on('data', append);
    current.stderr.on('data', append);
    current.on('error', (error) => {
      append(`spawn failed: ${error.message}\n`);
      running = false;
      finishedAt = new Date().toISOString();
      exitCode = -1;
    });
    current.on('close', (code) => {
      running = false;
      finishedAt = new Date().toISOString();
      exitCode = code;
      append(`\nexit code: ${code}\n`);
      current = null;
    });
  });
}

function json(res, code, body) {
  const payload = JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://updater');
  if (url.pathname === '/health') {
    return json(res, 200, { status: 'ok', running });
  }
  if (!authorized(req)) return json(res, 403, { error: 'Forbidden' });
  if (req.method === 'GET' && url.pathname === '/status') {
    return json(res, 200, status());
  }
  if (req.method === 'POST' && url.pathname === '/apply') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
      if (body.length > 8192) req.destroy();
    });
    req.on('end', () => {
      if (running) return json(res, 409, { started: false, error: 'Update already running', ...status() });
      let targetVersion = null;
      try {
        const parsed = body ? JSON.parse(body) : {};
        if (typeof parsed.targetVersion === 'string' && /^v?\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.]+)?$/.test(parsed.targetVersion)) {
          targetVersion = parsed.targetVersion;
        }
      } catch {
        return json(res, 400, { started: false, error: 'Invalid JSON body' });
      }
      start(targetVersion);
      json(res, 202, { started: true, targetVersion });
    });
    return undefined;
  }
  return json(res, 404, { error: 'Not found' });
});

if (!TOKEN) {
  console.error('UPDATER_TOKEN is required');
  process.exit(1);
}
if (!fs.existsSync(COMPOSE_FILE)) {
  console.warn(`compose file not found at ${COMPOSE_FILE}`);
}
detectCompose().then(() =>
  composeProject().then((name) => {
    console.log(`updater ready (project: ${name || 'unknown'}, compose: ${composeCmd.join(' ')})`);
    server.listen(PORT, () => console.log(`XSS updater listening on ${PORT}`));
  }),
);
