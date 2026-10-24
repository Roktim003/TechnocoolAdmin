import { TEST_ENV } from "./test-env";

// Runs in every test worker before any module is imported.
Object.assign(process.env, TEST_ENV);
