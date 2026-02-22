import z from "zod"
import * as fs from "fs"
import * as path from "path"
import { define, type ToolResult } from "./tool"
import { IGNORE_PATTERNS } from "./config"

interface ListParams {
  path?: string
  basePath?: string
}

export const ListTool = define("list", {
  description: "List files in a directory",
  parameters: z.object({
    path: z.string().optional().describe("The directory path to list"),
    basePath: z.string().optional().describe("Base directory for relative paths"),
  }),
  async execute(params: ListParams, ctx?: unknown): Promise<ToolResult> {
    let searchPath = params.path || "."
    if (params.basePath) {
      searchPath = path.join(params.basePath, searchPath)
    }
    searchPath = path.resolve(searchPath)
    
    const entries = await fs.promises.readdir(searchPath, { withFileTypes: true })
    
    const filtered = entries
      .filter(e => !IGNORE_PATTERNS.includes(e.name))
      .map(e => {
        if (e.isDirectory()) return e.name + "/"
        return e.name
      })
      .sort()

    return {
      output: `<path>${searchPath}</path>\n<entries>\n${filtered.join("\n")}\n</entries>`,
      metadata: { count: filtered.length },
    }
  },
})
