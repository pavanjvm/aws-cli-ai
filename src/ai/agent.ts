import 'dotenv/config';
import { bedrock } from "@ai-sdk/amazon-bedrock"
import { generateText } from "ai"
import * as fs from "fs"
import * as path from "path"
import { IGNORE_PATTERNS } from "./tools/config.js"
import { TodoWriteTool, TodoReadTool, type Todo } from "./tools/index.js"

const model = bedrock("amazon.nova-pro-v1:0")

type Task = Todo

interface Message {
  role: "user" | "assistant" | "tool"
  content: string
  toolName?: string
  toolResult?: string
}

function parseIni(content: string): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {}
  let section = "default"
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#") || line.startsWith(";")) continue
    const sectionMatch = line.match(/^\[(.+)\]$/)
    if (sectionMatch) {
      section = sectionMatch[1] || "default"
      result[section] = result[section] || {}
      continue
    }
    const idx = line.indexOf("=")
    if (idx === -1) continue
    const key = line.substring(0, idx).trim()
    const value = line.substring(idx + 1).trim()
    result[section] = result[section] || {}
    result[section][key] = value
  }
  return result
}

function getAwsConfigStatus(): string {
  const sources: string[] = []
  let region: string | undefined
  let hasCreds = false

  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    hasCreds = true
    sources.push("env credentials")
  }
  if (process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION) {
    region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION
    sources.push("env region")
  }

  try {
    const credPath = path.resolve(process.env.HOME || "", ".aws", "credentials")
    if (fs.existsSync(credPath)) {
      const parsed = parseIni(fs.readFileSync(credPath, "utf-8"))
      const def = parsed["default"]
      if (def?.aws_access_key_id && def?.aws_secret_access_key) {
        hasCreds = true
        sources.push("~/.aws/credentials")
      }
    }
  } catch {}

  try {
    const cfgPath = path.resolve(process.env.HOME || "", ".aws", "config")
    if (fs.existsSync(cfgPath)) {
      const parsed = parseIni(fs.readFileSync(cfgPath, "utf-8"))
      const def = parsed["default"] || parsed["profile default"]
      if (!region && def?.region) {
        region = def.region
      }
      if (def?.region) {
        sources.push("~/.aws/config")
      }
    }
  } catch {}

  if (!hasCreds && !region) return "AWS config not detected (no credentials or region found)."

  const parts: string[] = []
  parts.push(hasCreds ? "credentials: detected" : "credentials: missing")
  parts.push(region ? `region: ${region}` : "region: missing")
  if (sources.length) parts.push(`sources: ${[...new Set(sources)].join(", ")}`)
  return `AWS config status: ${parts.join("; ")}.`
}

function getOpenAIWebSearchStatus(): string {
  if (!process.env.OPENAI_API_KEY) {
    return "OpenAI websearch unavailable (set OPENAI_API_KEY)."
  }
  const model = process.env.OPENAI_WEBSEARCH_MODEL || "o4-mini"
  return `OpenAI websearch available (model: ${model}).`
}

function extractActionLine(response: string): string | null {
  const lines = response
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean)
  for (const line of lines) {
    const cleaned = line.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "")
    if (/^(bash|read|ls|websearch|ask_user|ask_user_yesno|wait_user|update_task|done):/.test(cleaned)) {
      return cleaned
    }
  }
  return null
}

async function askQuestion(question: string, options: string[]): Promise<number> {
  console.log(`\n${question}`)
  options.forEach((opt, i) => console.log(`  ${i + 1}. ${opt}`))
  
  const readline = await import('readline')
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  
  return new Promise((resolve) => {
    rl.question('\nEnter your choice: ', (answer) => {
      rl.close()
      resolve(parseInt(answer) - 1)
    })
  })
}

async function askYesNo(question: string): Promise<boolean> {
  const readline = await import('readline')
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  
  return new Promise((resolve) => {
    rl.question(`\n${question} (yes/no): `, (answer) => {
      rl.close()
      resolve(answer.toLowerCase() === "yes" || answer.toLowerCase() === "y")
    })
  })
}

async function askInput(question: string): Promise<string> {
  const readline = await import('readline')
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

  return new Promise((resolve) => {
    rl.question(`\n${question}\n> `, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

function getSystemPrompt(tasks: Task[], history: Message[], currentTask?: Task, awsStatus?: string, webStatus?: string): string {
  const pendingTasks = tasks.filter(t => t.status === "pending" || t.status === "in_progress")
  const completedTasks = tasks.filter(t => t.status === "completed")
  const lastTool = [...history].reverse().find(h => h.role === "tool")
  const awsConfigured = awsStatus?.includes("credentials: detected") && awsStatus?.includes("region:")
  
  return `You are an autonomous AWS deployment agent. Your job is to deploy the application to AWS.

## Current State
- Completed tasks: ${completedTasks.length}
- Pending tasks: ${pendingTasks.length}
- Total tasks: ${tasks.length}
${awsStatus ? `\n## AWS Config\n${awsStatus}` : ""}
${webStatus ? `\n## OpenAI Websearch\n${webStatus}` : ""}

## Current Task
${currentTask ? currentTask.content : "None"}

## Pending Tasks
${pendingTasks.map((t, i) => `${i + 1}. ${t.content}`).join("\n")}

## Recent History
${history.slice(-5).map(h => `${h.role}: ${h.content.substring(0, 200)}`).join("\n")}

## Last Tool Output
${lastTool?.toolResult ? lastTool.toolResult.substring(0, 800) : "None"}

## Your Options
1. Execute a bash command using the "bash" tool
2. Read a file using the "read" tool
3. List directory using the "ls" tool
4. Use "websearch" to look up the latest AWS CLI commands when a command fails
5. Ask user for free-text input using "ask_user"
6. Ask user a yes/no question using "ask_user_yesno"
7. Pause for human assistance using "wait_user"
8. Update task status using "update_task"
9. Report completion using "done"

## Rules
- Execute ONE action at a time
- After each command, analyze the result and decide next step
- If a task fails, try to fix it or ask user
- Keep the user informed of progress
- Focus on the current task first; do not skip tasks
- Do not mark a task complete unless the command succeeds (exit code 0)
- If AWS config indicates credentials and region are detected, do NOT ask the user to run "aws configure". Instead proceed with commands or ask for specific missing info.
- If you need human assistance or manual steps, use "wait_user" and continue after the user confirms.
- Use websearch only when a command fails and OpenAI Websearch is available.
- When all deployment tasks are complete, report "done"

What is your next step? Use the format:
- bash: <command>
- read: <filepath>
- ls: <directory>
- websearch: <query>
- ask_user: <question>
- ask_user_yesno: <question>
- wait_user: <message>
- update_task: <task_index> <status>
- done: <final message>`
}

async function executeBash(command: string): Promise<string> {
  console.log(`\n> ${command}\n`)
  
  const proc = Bun.spawn(["sh", "-c", command], {
    stdout: "pipe",
    stderr: "pipe",
  })

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])

  const exitCode = await proc.exited
  
  const output = stdout + (stderr ? `\nStderr: ${stderr}` : "")
  console.log(output)
  
  return `Exit code: ${exitCode}\nOutput: ${output}`
}

async function executeOpenAIWebSearch(query: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  const model = process.env.OPENAI_WEBSEARCH_MODEL || "o4-mini"

  if (!apiKey) {
    return "OpenAI websearch unavailable: missing OPENAI_API_KEY."
  }

  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        tools: [{ type: "web_search" }],
        tool_choice: "auto",
        input: query,
        include: ["web_search_call.action.sources"],
      }),
    })

    const text = await res.text()
    if (!res.ok) {
      return `OpenAI websearch error: ${res.status} ${res.statusText}\n${text.slice(0, 2000)}`
    }

    let data: any
    try {
      data = JSON.parse(text)
    } catch {
      return `OpenAI websearch raw response:\n${text.slice(0, 2000)}`
    }

    const outputs = Array.isArray(data?.output) ? data.output : []
    const textParts: string[] = []
    const sources: { title: string; url: string }[] = []

    for (const item of outputs) {
      if (item?.type === "message" && Array.isArray(item?.content)) {
        for (const c of item.content) {
          const textVal = c?.text || c?.value
          if (typeof textVal === "string" && textVal.trim()) {
            textParts.push(textVal.trim())
          }
          const annotations = Array.isArray(c?.annotations) ? c.annotations : []
          for (const a of annotations) {
            if (a?.type === "url_citation" && a?.url) {
              sources.push({ title: a?.title || "Untitled", url: a.url })
            }
          }
        }
      }
      if (item?.type === "web_search_call" && item?.action?.sources) {
        const actionSources = Array.isArray(item.action.sources) ? item.action.sources : []
        for (const s of actionSources) {
          if (s?.url) {
            sources.push({ title: s?.title || "Untitled", url: s.url })
          }
        }
      }
    }

    const uniqueSources = Array.from(
      new Map(sources.map(s => [s.url, s])).values()
    )
    const sourceLines = uniqueSources
      .slice(0, 5)
      .map((s, i) => `${i + 1}. ${s.title}\n${s.url}`)
      .join("\n")

    return [
      `OpenAI websearch results for: ${query}`,
      textParts.length ? textParts.join("\n\n").slice(0, 2000) : "No text output returned.",
      sourceLines ? `Sources:\n${sourceLines}` : "",
    ]
      .filter(Boolean)
      .join("\n\n")
  } catch (err: any) {
    return `OpenAI websearch failed: ${err?.message || err}`
  }
}

async function runAgentLoop(tasks: Task[], awsStatus?: string, webStatus?: string): Promise<{ history: Message[]; completed: boolean }> {
  const history: Message[] = []
  let maxIterations = 50
  let iteration = 0
  const maxTaskAttempts = 100
  const taskAttempts = new Map<string, number>()
  const promptedTasks = new Set<string>()
  let completed = false
  
  console.log("\n" + "=".repeat(50))
  console.log("=== DEPLOYMENT AGENT LOOP STARTED ===")
  console.log("=".repeat(50))
  
  while (iteration < maxIterations) {
    iteration++
    console.log(`\n--- Iteration ${iteration} ---`)
    
    // Check if all tasks are done
    const pending = tasks.filter(t => t.status === "pending" || t.status === "in_progress")
    if (pending.length === 0) {
      console.log("\n✓ All tasks completed!")
      completed = true
      break
    }
    
    const currentTask = pending[0]
    if (!currentTask) {
      console.log("No current task to execute")
      break
    }
    
    currentTask.status = "in_progress"
    await TodoWriteTool.execute({ todos: tasks }, {})
    
    // Ask AI what to do next
    const prompt = getSystemPrompt(tasks, history, currentTask, awsStatus, webStatus)
    
    const result = await generateText({
      model,
      prompt,
    })
    
    const response = result.text?.trim() || ""
    const actionLine = extractActionLine(response)
    console.log(`\nAgent decision: ${response.substring(0, 300)}`)
    
    history.push({ role: "assistant", content: response })
    
    // Parse and execute the action
    if (actionLine && actionLine.startsWith("bash:")) {
      const command = actionLine.substring(5).trim()
      const output = await executeBash(command)
      history.push({ role: "tool", content: command, toolName: "bash", toolResult: output })
      
      // Auto-mark as complete if successful
      if (output.includes("Exit code: 0")) {
        currentTask.status = "completed"
        console.log("✓ Task marked complete")
      } else {
        const attemptKey = currentTask.content
        const attempts = (taskAttempts.get(attemptKey) || 0) + 1
        taskAttempts.set(attemptKey, attempts)
        currentTask.status = "pending"
        console.log(`✗ Task failed (attempt ${attempts})`)
        if (attempts > maxTaskAttempts && !promptedTasks.has(attemptKey)) {
          promptedTasks.add(attemptKey)
          const continue_ = await askYesNo(`Task failed ${attempts} times. Continue trying?`)
          if (!continue_) {
            currentTask.status = "failed"
            await TodoWriteTool.execute({ todos: tasks }, {})
            console.log("\nUser stopped the deployment.")
            break
          }
        }
      }
      await TodoWriteTool.execute({ todos: tasks }, {})
      
    } else if (actionLine && actionLine.startsWith("websearch:")) {
      const query = actionLine.substring(10).trim()
      const output = await executeOpenAIWebSearch(query)
      history.push({ role: "tool", content: query, toolName: "websearch", toolResult: output })
      
    } else if (actionLine && actionLine.startsWith("ask_user_yesno:")) {
      const question = actionLine.substring(16).trim()
      const answer = await askYesNo(question)
      history.push({ role: "tool", content: question, toolResult: answer ? "yes" : "no" })
      
    } else if (actionLine && actionLine.startsWith("ask_user:")) {
      const question = actionLine.substring(9).trim()
      const awsConfigured = awsStatus?.includes("credentials: detected") && awsStatus?.includes("region:")
      if (awsConfigured && /aws configure|configure aws/i.test(question)) {
        const answer = "AWS is already configured (credentials and region detected). Proceed without running aws configure."
        console.log(answer)
        history.push({ role: "tool", content: question, toolResult: answer })
      } else {
        const answer = await askInput(question)
        history.push({ role: "tool", content: question, toolResult: answer })
      }
      
    } else if (actionLine && actionLine.startsWith("wait_user:")) {
      const message = actionLine.substring(10).trim() || "Waiting for human assistance. Type 'done' when ready to continue."
      let answer = await askInput(message)
      while (answer.toLowerCase() !== "done" && answer.toLowerCase() !== "ready") {
        answer = await askInput("Type 'done' or 'ready' to continue.")
      }
      history.push({ role: "tool", content: message, toolResult: answer })
      
    } else if (actionLine && actionLine.startsWith("update_task:")) {
      const parts = actionLine.substring(12).trim().split(" ")
      const taskIdx = parseInt(parts[0] || "0") - 1
      const status = (parts[1] || "pending") as Task["status"]
      if (tasks[taskIdx]) {
        tasks[taskIdx].status = status
        await TodoWriteTool.execute({ todos: tasks }, {})
        console.log(`Updated task ${taskIdx + 1} to ${status}`)
      }
      
    } else if ((actionLine && actionLine.startsWith("done:")) || response.includes("deployment complete") || response.includes("all done")) {
      console.log("\n✓ Agent reports deployment complete!")
      completed = true
      break
      
    } else {
      // Try to find a task and execute it
      console.log("No clear action, trying next pending task...")
      if (currentTask) {
        const output = await executeBash(currentTask.content)
        history.push({ role: "tool", content: currentTask.content, toolName: "bash", toolResult: output })
        if (output.includes("Exit code: 0")) {
          currentTask.status = "completed"
        } else {
          const attemptKey = currentTask.content
          const attempts = (taskAttempts.get(attemptKey) || 0) + 1
          taskAttempts.set(attemptKey, attempts)
          currentTask.status = "pending"
          if (attempts > maxTaskAttempts && !promptedTasks.has(attemptKey)) {
            promptedTasks.add(attemptKey)
            const continue_ = await askYesNo(`Task failed ${attempts} times. Continue trying?`)
            if (!continue_) {
              currentTask.status = "failed"
              await TodoWriteTool.execute({ todos: tasks }, {})
              console.log("\nUser stopped the deployment.")
              break
            }
          }
        }
        await TodoWriteTool.execute({ todos: tasks }, {})
      }
    }
    
    // No periodic user prompt; run until tasks complete or max iterations reached.
  }
  
  if (iteration >= maxIterations) {
    console.log("\nMax iterations reached.")
  }

  return { history, completed }
}

async function generateDeploymentSummary(tasks: Task[], history: Message[]): Promise<string> {
  const toolHistory = history
    .filter(h => h.role === "tool")
    .map(h => `${h.toolName || "tool"}: ${h.content}\n${(h.toolResult || "").substring(0, 1200)}`)
    .join("\n\n")

  const prompt = `Summarize the completed deployment for the user.

Requirements:
- Provide a short summary of what was deployed.
- List any discovered endpoints/URLs (app URL, API URL, database endpoint, etc.).
- If an endpoint is not present in the logs, say "Not found" for that item.
- Keep it concise (bulleted list is fine).

Tasks:
${tasks.map(t => `- ${t.content} [${t.status}]`).join("\n")}

Tool outputs:
${toolHistory}
`

  const result = await generateText({ model, prompt })
  return result.text || ""
}

async function analyzeCodebase(projectPath: string): Promise<string> {
  console.log(`\nAnalyzing: ${projectPath}\n`)
  
  const analysis: string[] = []
  
  try {
    const packageJson = JSON.parse(await fs.promises.readFile(path.join(projectPath, "package.json"), "utf-8"))
    analysis.push("## Package.json")
    analysis.push(`Name: ${packageJson.name}`)
    analysis.push(`Type: ${packageJson.type || "commonjs"}`)
    analysis.push("\n### Dependencies")
    if (packageJson.dependencies) {
      analysis.push(Object.keys(packageJson.dependencies).join(", "))
    }
    if (packageJson.devDependencies) {
      analysis.push("\n### Dev Dependencies")
      analysis.push(Object.keys(packageJson.devDependencies).join(", "))
    }
  } catch {
    analysis.push("No package.json found")
  }
  
  const entries = await fs.promises.readdir(projectPath, { withFileTypes: true })
  const filtered = entries
    .filter(e => !IGNORE_PATTERNS.includes(e.name) && !e.name.startsWith("."))
    .map(e => e.isDirectory() ? `${e.name}/` : e.name)
    .sort()
  
  analysis.push("\n## Directory Structure")
  analysis.push(filtered.join("\n"))
  
  return analysis.join("\n")
}

async function runAnalyzer(req: any, analysis: string): Promise<string> {
  console.log("\n--- Generating Architecture ---\n")
  
  const prompt = `You are an expert software architect. Based on the codebase analysis and user requirements, recommend AWS deployment architecture.

## User Requirements
- Scale: ${req.scale}
- Zero-downtime: ${req.zeroDowntime ? "Required" : "Not required"}
- Data type: ${req.dataType}
- Optimization: ${req.optimization}

## Codebase Analysis
${analysis}

Provide:
1. Project Overview
2. Recommended AWS Services
3. Architecture Description
4. Key AWS Resources to create
5. Deployment approach with specific AWS CLI commands`

  const result = await generateText({ model, prompt })
  return result.text || ""
}

async function runCostAgent(architecture: string, req: any): Promise<string> {
  console.log("\n--- Calculating Costs ---\n")
  
  const prompt = `Calculate monthly cost for this AWS architecture.

## Architecture
${architecture}

Provide in this format:
## Cost Summary
**Total Monthly Cost: $XX.XX USD**

## Service Breakdown
| Service | Config | Cost |`
  
  const result = await generateText({ model, prompt })
  return result.text || ""
}

export async function runDeploymentAgent() {
  console.log("\n=== AWS Deployment Agent ===\n")
  console.log(`Project: ${process.cwd()}\n`)
  const awsStatus = getAwsConfigStatus()
  console.log(`${awsStatus}\n`)
  const webStatus = getOpenAIWebSearchStatus()
  console.log(`${webStatus}\n`)
  
  // Collect requirements
  const scaleOptions = ["Hobby (<1k)", "Startup (1k-50k)", "High scale (50k+)"]
  const scaleIdx = await askQuestion("What scale?", scaleOptions)
  
  const downtimeOptions = ["Yes - simple", "No - zero-downtime"]
  const zeroDowntime = await askQuestion("Zero downtime?", downtimeOptions) === 1
  
  const dataOptions = ["No sensitive", "PII", "Financial", "Enterprise"]
  const dataIdx = await askQuestion("Data type?", dataOptions)
  
  const optOptions = ["Lowest cost", "Balanced", "Performance"]
  const optIdx = await askQuestion("Optimize for?", optOptions)
  
  const requirements = {
    scale: scaleOptions[scaleIdx] ?? "Hobby",
    zeroDowntime,
    dataType: dataOptions[dataIdx] ?? "No sensitive",
    optimization: optOptions[optIdx] ?? "Balanced",
  }
  
  // Analyze codebase
  const analysis = await analyzeCodebase(process.cwd())
  console.log(analysis)
  
  // Generate architecture
  const architecture = await runAnalyzer(requirements, analysis)
  console.log("\n" + "=".repeat(50))
  console.log("=== PROPOSED ARCHITECTURE ===\n")
  console.log(architecture)
  
  // Cost estimation
  const cost = await runCostAgent(architecture, requirements)
  console.log("\n" + "=".repeat(50))
  console.log("=== COST ESTIMATION ===\n")
  console.log(cost)
  
  // User approval
  const approved = await askYesNo("Approve this architecture?")
  if (!approved) {
    console.log("Not approved. Exiting.")
    return
  }
  
  console.log("\n--- Generating Deployment Tasks ---\n")
  
  const taskPrompt = `Based on this architecture, generate deployment tasks as JSON array:
${architecture}

Format:
[
  {"content": "aws <command>", "status": "pending", "priority": "high/medium/low"}
]

Constraints:
- Use region us-east-1 for all AWS commands.
- If creating S3 buckets in us-east-1, do NOT include --create-bucket-configuration LocationConstraint=us-east-1.

Output ONLY valid JSON, no other text.`
  
  console.log("Calling AI for tasks...")
  
  const taskResult = await generateText({ model, prompt: taskPrompt }).catch((err: any) => {
    console.log("Error generating tasks:", err?.message || err)
    return { text: "" }
  })
  
  console.log("Got response, parsing...")
  
  const jsonMatch = taskResult.text?.match(/\[[\s\S]*\]/)
  
  let tasks: Task[] = []
  if (jsonMatch) {
    try {
      tasks = JSON.parse(jsonMatch[0])
      console.log(`✓ Generated ${tasks.length} tasks`)
    } catch (e) {
      console.log("Failed to parse tasks, using default")
      tasks = [{ content: "echo 'Setup deployment'", status: "pending", priority: "high" }]
    }
  } else {
    console.log("No JSON found, using default task")
    tasks = [{ content: "echo 'Setup deployment'", status: "pending", priority: "high" }]
  }
  
  console.log("\nTasks to execute:")
  tasks.forEach((t, i) => console.log(`  ${i + 1}. ${t.content}`))
  
  await TodoWriteTool.execute({ todos: tasks }, {})
  
  console.log("\nStarting agent loop...")
  
  // Run agent loop
  const { history, completed } = await runAgentLoop(tasks, awsStatus, webStatus)
  
  if (completed) {
    const summary = await generateDeploymentSummary(tasks, history)
    console.log("\n=== DEPLOYMENT SUMMARY ===\n")
    console.log(summary)
  }

  console.log("\n=== DEPLOYMENT FINISHED ===\n")
}
