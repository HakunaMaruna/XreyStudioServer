const { BASE_URL, loadContext, run } = require('./common');

module.exports = () => {
  const ctx = loadContext();
  return run('subscription', {
    url: `${BASE_URL}/api/subscriptions/${ctx.subscriptionToken}/json`,
  });
};
