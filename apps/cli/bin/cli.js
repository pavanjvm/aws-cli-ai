#!/usr/bin/env bun
import { Command } from 'commander';
import { render } from 'ink';
import React from 'react';

const program = new Command();

program
  .name('aws-cli-ai')
  .description('AI-powered AWS deployment assistant')
  .version('0.1.0');

program
  .command('deploy')
  .description('Deploy your application')
  .option('-r, --region <region>', 'AWS region')
  .option('-s, --service <service>', 'Service name')
  .action(async (options) => {
    const { DeployApp } = await import('./src/components/DeployApp.js');
    const { unmount } = render(React.createElement(DeployApp, options));
    
    process.stdin.on('data', (data) => {
      if (data.toString().trim() === 'exit') {
        unmount();
        process.exit(0);
      }
    });
  });

program.parse(process.argv);
