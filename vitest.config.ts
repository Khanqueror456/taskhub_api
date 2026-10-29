import { defineConfig } from 'vitest/config';

export default defineConfig({

    test : {
        env : { RATE_LIMIT_ENABLED : 'false'},
        setupFiles : ['tests/setup.ts'],
    },
});