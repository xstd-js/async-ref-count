import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    dir: 'src',
    passWithNoTests: true,
    coverage: {
      provider: 'istanbul',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.{test,bench}.ts',
        'src/**/*.skip-test*.ts',
        'src/**/*.skip-test*/**/*.ts',
      ],
    },
  },
});
