const { writeResults } = require('./common');
const login = require('./login');
const users = require('./users');
const metrics = require('./metrics');
const traffic = require('./traffic');
const subscription = require('./subscription');

const scenarios = { login, users, metrics, traffic, subscription };
const selected = process.argv.slice(2);
const names = selected.length ? selected : Object.keys(scenarios);

(async () => {
  const summaries = [];
  for (const name of names) {
    if (!scenarios[name]) throw new Error(`Unknown scenario: ${name}`);
    summaries.push(await scenarios[name]());
  }
  const file = writeResults(summaries);
  console.log(`Results written to ${file}`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
