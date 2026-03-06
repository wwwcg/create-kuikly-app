#!/usr/bin/env node

import { createCli } from './cli';

const program = createCli();
program.parseAsync(process.argv).catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
