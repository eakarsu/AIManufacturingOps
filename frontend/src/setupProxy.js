const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function configureProxy(app) {
  const target = `http://127.0.0.1:${process.env.BACKEND_PORT || 4103}`;
  app.use('/api', createProxyMiddleware({ target, changeOrigin: true }));
};
