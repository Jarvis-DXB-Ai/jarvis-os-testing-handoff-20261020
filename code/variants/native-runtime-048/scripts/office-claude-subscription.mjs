#!/usr/bin/env node
import { runSubscriptionCli } from './office-subscription-runner.mjs';
await runSubscriptionCli('claude', process.argv.slice(2));
