import { Command } from 'commander';
import { runDeploymentAgent } from '../../ai/agent.js';

export const deployCommand = new Command('deploy')
  .description('Analyze code with AI and deploy to AWS')
  .action(async () => {
    await runDeploymentAgent()
  });
