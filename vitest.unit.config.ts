import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    env: {
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/unit',
      REDIS_URL: 'redis://localhost:6379/15',
      JWT_ACCESS_SECRET: 'unit-test-access-secret-0123456789abcdef',
      JWT_REFRESH_SECRET: 'unit-test-refresh-secret-0123456789abcdef',
      RATE_LIMIT_ENABLED: 'false',
      JOB_BACKOFF_MS: '10',
      SMTP_HOST: 'smtp.test',
      SMTP_PORT: '2525',
      MAIL_FROM: 'TaskHub Test <test@taskhub.test>',
      APP_URL: 'https://app.example.test',
      OVERDUE_SCAN_CRON: '0 8 * * *',
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/generated/**', 'src/server.ts', 'src/worker.ts', 'src/types/**'],
      reporter: ['text', 'html'],
    },
  },
});