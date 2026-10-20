#!/usr/bin/env node
import { runSubscriptionCli } from './office-subscription-runner.mjs';
await runSubscriptionCli('codex', process.argv.slice(2));
