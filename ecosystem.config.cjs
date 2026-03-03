module.exports = {
  apps: [
    {
      name: 'resto-backend',
      cwd: './server',
      script: 'app.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
        PORT: 2000,
      },
    },
    {
      name: 'resto-frontend',
      cwd: '.',
      script: 'npm',
      args: 'run dev',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
    },
  ],
};

