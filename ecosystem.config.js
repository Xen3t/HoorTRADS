module.exports = {
  apps: [
    {
      name: 'HoorTRADS',
      script: 'node_modules/.bin/next',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        PORT: 3003,
      },
    },
  ],
}
