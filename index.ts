import 'dotenv/config';
import 'dotenv/load';
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
import(path.resolve(__dirname, '.env'))

import program from './src/cli/index.js';

const deployIndex = process.argv.indexOf('--deploy')
const pathIndex = process.argv.indexOf('--path')

// If --deploy flag is passed, run the deployment agent
if (deployIndex !== -1) {
  // If --path is provided, change to that directory
  if (pathIndex !== -1) {
    const targetPath = process.argv[pathIndex + 1]
    if (targetPath) {
      console.log(`Changing to: ${targetPath}`)
      process.chdir(targetPath)
    }
  }
  
  try {
    const { runDeploymentAgent } = await import('./src/ai/agent.js')
    await runDeploymentAgent()
  } catch (err) {
    console.error("Deployment agent failed:", err)
    process.exitCode = 1
  }
} else {
  program.parse(process.argv);
}
