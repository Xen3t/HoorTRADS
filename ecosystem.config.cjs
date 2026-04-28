module.exports = {
  apps: [
    {
      name: 'HoorTRADS',
      cwd: __dirname,
      exec_mode: 'fork',
      instances: 1,
      max_memory_restart: '500M',
      time: true,
      merge_logs: true,
      out_file: './logs/out.log',
      error_file: './logs/err.log',

      // Next.js
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3300',
      env: { NODE_ENV: 'production' },
    },
  ],
}
