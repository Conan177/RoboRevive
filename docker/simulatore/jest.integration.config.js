module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test-integration/**/*.test.js'],
  testTimeout: 60000, // avviare un container richiede più dei 5 s di default
  maxWorkers: 1,      // un container alla volta
};