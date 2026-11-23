const { BASE_URL, loadContext, run } = require('./common');

module.exports = () => {
  const ctx = loadContext();
  return run('metrics', {
    url: `${BASE_URL}/api/metrics`,
    headers: { 'x-metrics-token': ctx.metricsToken },
  });
};
