import { Command } from 'commander';
import { deployCommand } from './commands/deploy.js';

const program = new Command();

program
  .name('aws-cli-ai')
  .version('1.0.0')
  .description('AI-powered CLI to analyze and deploy apps');

program.addCommand(deployCommand);

export default program;
