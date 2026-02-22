import { glob } from "glob"
import z from "zod"
import { type ToolResult } from "./tool"
import * as path from "path"

export const GlobTool = {
  name: "glob",
  description: "Fast file pattern matching tool",
  parameters: z.object({
    pattern: z.string().describe("The glob pattern to match files against"),
    path: z.string().optional().describe("The directory to search in"),
    basePath: z.string().optional().describe("Base directory for relative paths"),
  }),
  async execute(params: { pattern: string; path?: string; basePath?: string }, ctx?: unknown): Promise<ToolResult> {
    const cwd = params.basePath || params.path || process.cwd()
    const files = await glob(params.pattern, { cwd })
    return {
      output: files.map(f => path.join(cwd, f)).join("\n"),
      metadata: { count: files.length },
    }
  },
}
