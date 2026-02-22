import z from "zod"
import { type ToolResult } from "./tool"
import * as path from "path"

export const GrepTool = {
  name: "grep",
  description: "Fast content search tool using ripgrep",
  parameters: z.object({
    pattern: z.string().describe("The regex pattern to search for"),
    path: z.string().optional().describe("The directory to search in"),
    include: z.string().optional().describe("File pattern to include"),
    basePath: z.string().optional().describe("Base directory for relative paths"),
  }),
  async execute(params: { pattern: string; path?: string; include?: string; basePath?: string }, ctx?: unknown): Promise<ToolResult> {
    const searchPath = params.basePath || params.path || "."
    const args = ["-nH", "--hidden", "--no-messages", "--field-match-separator=|", "--regexp", params.pattern]
    if (params.include) {
      args.push("--glob", params.include)
    }
    args.push(searchPath)

    const proc = Bun.spawn(["rg", ...args], {
      stdout: "pipe",
      stderr: "pipe",
    })

    const output = await new Response(proc.stdout).text()
    const exitCode = await proc.exited

    if (exitCode === 1 || (exitCode === 2 && !output.trim())) {
      return { output: "No matches found", metadata: { matches: 0 } }
    }

    const lines = output.trim().split("\n").filter(l => l.length > 0)
    const limit = 100
    const truncated = lines.length > limit
    const finalLines = truncated ? lines.slice(0, limit) : lines

    let result = `Found ${lines.length} matches${truncated ? ` (showing first ${limit})` : ""}\n\n`
    
    let currentFile = ""
    for (const line of finalLines) {
      const parts = line.split("|")
      if (parts.length < 3) continue
      const filePath = parts[0]
      const lineNum = parts[1]
      const lineText = parts.slice(2).join("|")
      
      if (!filePath || !lineNum) continue
      
      if (filePath !== currentFile) {
        result += `${filePath}:\n`
        currentFile = filePath
      }
      result += `  Line ${lineNum}: ${lineText}\n`
    }

    if (truncated) {
      result += `\n(Results truncated. Use a more specific path or pattern)`
    }

    return { output: result, metadata: { matches: lines.length, truncated } }
  },
}
