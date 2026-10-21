// Offline regression checks: real parser and route handlers, mocked database/session.
// Run: node scripts/test-biometric-punches.cjs
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const { NextRequest } = require('next/server');
const root = path.resolve(__dirname, '..');
function load(file, mocks = {}) {
  const module = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  vm.runInNewContext(output, { module, exports: module.exports, require: name => name in mocks ? mocks[name] : require(name), process, Buffer, Date, Map, URLSearchParams, console }, { filename: file });
  return module.exports;
}
const parser = load('lib/biometricPunch.ts');
const access = load('lib/attendanceCalendarAccess.ts');
const secret = 'test-only-'.repeat(8);
let session = { id: 'employee-1', role: 'ADMIN' }, reads = 0, writes = 0;
let employees = [{ id: 'employee-1', employeeCode: '7007' }];
const stored = new Map();
let failDatabase = false;
const prisma = {
  employee: {
    findMany: async () => employees,
    findFirst: async () => { reads++; return { id: 'employee-1' }; }
  },
  biometricPunch: {
    createMany: async ({ data }) => {
      if (failDatabase) throw Object.assign(new Error('test database failure'), { code: 'P1001' });
      writes++;
      let count = 0;
      for (const row of data) if (!stored.has(row.id)) { stored.set(row.id, row); count++; }
      return { count };
    },
    findMany: async ({ where }) => {
      reads++;
      return [...stored.values()].filter(p => p.employeeId === where.employeeId && p.punchedAt >= where.punchedAt.gte && p.punchedAt < where.punchedAt.lt && p.punchedAt <= where.punchedAt.lte).sort((a,b) => a.punchedAt - b.punchedAt);
    }
  }
};
const ingest = load('app/api/biometric-punches/ingest/route.ts', { '@/lib/prisma': { prisma }, '@/lib/biometricPunch': parser });
const get = load('app/api/biometric-punches/route.ts', {
  '@/lib/auth': { requireSession: async () => { if (!session) throw new Error('Unauthorized'); return session; } },
  '@/lib/prisma': { prisma }, '@/lib/biometricPunch': parser, '@/lib/attendanceCalendarAccess': access
});
const event = (mode = 'IN', time = '09:34:00') => ({ EmployeeCode: '00007007', PunchDateAndTime: `2026-10-20 ${time}`, PunchMode: mode, SerialNo: 'test-device' });
const request = (body, key = secret, contentType = 'application/json') => new NextRequest('https://dashboard.invalid/api/biometric-punches/ingest', { method: 'POST', headers: { 'x-biometric-key': key, 'content-type': contentType }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const read = (employeeId = 'employee-1', monthYear = '10/2026') => get.GET(new NextRequest(`https://dashboard.invalid/api/biometric-punches?${new URLSearchParams({employeeId, monthYear})}`));
async function main() {
  assert.equal(parser.parsePunchTime('2026-10-20 09:34:00').toISOString(), '2026-10-20T04:04:00.000Z');
  assert.equal(parser.parsePunchTime('2026-10-20T09:34:00+05:30').toISOString(), '2026-10-20T04:04:00.000Z');
  for (const bad of ['2026-02-30 09:00:00', '2026-10-20 24:01:00', '21/10/2026', '2026-10-20T09:00:00+14:30', '2099-01-01 00:00:00']) assert.throws(() => parser.parsePunchTime(bad));
  assert.equal(parser.parsePunchBatch(event('0'))[0].direction, 'UNKNOWN');
  assert.equal(parser.parsePunchBatch(event('OUT'))[0].direction, 'OUT');
  assert.equal(parser.punchCode('00007007'), '7007');
  assert.equal(parser.punchCode(' ab-01 '), 'AB-01');
  const range = parser.punchMonthRange('12/2026');
  assert.equal(range.end.toISOString(), '2026-12-31T18:30:00.000Z');
  assert.throws(() => parser.parsePunchBatch([]));
  assert.throws(() => parser.parsePunchBatch(Array(501).fill(event())));
  assert.throws(() => parser.parsePunchBatch({ ...event(), SerialNo: '' }));

  delete process.env.BIOMETRIC_INGEST_SECRET;
  assert.equal((await ingest.POST(request(event()))).status, 503);
  process.env.BIOMETRIC_INGEST_SECRET = secret;
  assert.equal((await ingest.POST(request(event(), 'wrong'))).status, 401);
  assert.equal(writes, 0);
  assert.equal((await ingest.POST(request('{invalid'))).status, 400);
  assert.equal((await ingest.POST(request('x'.repeat(1024*1024+1)))).status, 400);
  const first = await (await ingest.POST(request(event()))).json();
  assert.equal(first.data.saved, 1);
  const repeats = await Promise.all([ingest.POST(request(event())), ingest.POST(request(event()))]);
  for (const response of repeats) assert.equal((await response.json()).data.duplicates, 1);
  assert.equal(stored.size, 1);
  // Multiple IN punches stay IN. A later explicit OUT is stored separately.
  await ingest.POST(request([event('IN', '09:37:50'), event('OUT', '18:15:00')]));
  assert.equal(stored.size, 3);
  const unknown = await (await ingest.POST(request(event('9', '12:30:00')))).json();
  assert.equal(unknown.data.unknownDirection, 1);
  const absent = await (await ingest.POST(request({ ...event(), EmployeeCode: '9999' }))).json();
  assert.equal(absent.data.skipped[0].reason, 'Employee code not found');
  employees.push({ id: 'employee-2', employeeCode: '00007007' });
  const ambiguous = await (await ingest.POST(request(event()))).json();
  assert.equal(ambiguous.data.saved, 0);
  assert.equal(ambiguous.data.skipped[0].reason, 'Ambiguous employee code');
  employees.pop();
  const form = new URLSearchParams(event('OUT', '18:16:00')).toString();
  assert.equal((await ingest.POST(request(form, secret, 'application/x-www-form-urlencoded'))).status, 200);
  const query = new NextRequest('https://dashboard.invalid/api/biometric-punches/ingest?' + new URLSearchParams(event('IN', '09:35:00')), { method: 'POST', headers: { 'x-biometric-key': secret } });
  assert.equal((await ingest.POST(query)).status, 200);
  failDatabase = true;
  assert.equal((await ingest.POST(request(event()))).status, 503);
  failDatabase = false;

  for (const role of ['ADMIN', 'HR']) {
    session = { id: 'viewer', role };
    const response = await read();
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.punches.length, 6);
  }
  session = { id: 'employee-1', role: 'EMPLOYEE' };
  const before = reads;
  assert.equal((await read()).status, 403); // own punches are also blocked
  assert.equal((await read('employee-2')).status, 403);
  assert.equal(reads, before); // denied before touching punch storage
  session = null;
  assert.equal((await read()).status, 401);
  session = { id: 'viewer', role: 'ADMIN' };
  assert.equal((await read('employee-1', '03/2026')).status, 403);
  assert.equal((await read('employee-1', '13/2026')).status, 403);
  assert.equal((await read('employee-1', '09/2026')).status, 200);
  console.log('PASS: timestamp validation/IST/month boundaries, mapping ambiguity, duplicate retries, input formats/limits, failure retry, Admin/HR-only access. Mocked DB; not a live device test.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
