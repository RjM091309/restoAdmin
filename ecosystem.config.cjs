module.exports = {
  apps: [
    {
      name: 'resto-nodeserver',
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
    {
      name: 'resto-pyserver',
      cwd: './pyserver',
      script: './.venv/bin/python',
      args: '-m uvicorn main:app --host 0.0.0.0 --port 2100 --no-access-log',
      instances: 1,
      exec_mode: 'fork',
      env: {
        PYTHONUNBUFFERED: '1',
        PORT: 2100,
      },
    },
  ],
};

