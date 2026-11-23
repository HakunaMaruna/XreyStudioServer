const { BASE_URL, loadContext, run } = require('./common');

module.exports = () => {
  const ctx = loadContext();
  return run('traffic', {
    url: `${BASE_URL}/api/nodes/${ctx.nodeId}/traffic`,
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${ctx.nodeToken}`,
    },
    body: JSON.stringify({
      entries: [{ subscriptionToken: ctx.subscriptionToken, up: 1024, down: 2048 }],
    }),
  });
};
