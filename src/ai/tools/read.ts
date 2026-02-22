import z from "zod"
import * as fs from "fs"
import * as path from "path"
import { define, type ToolResult } from "./tool"

const DEFAULT_LIMIT = 2000
const MAX_LINE_LENGTH = 2000

interface ReadParams {
  filePath: string
  offset?: number
  limit?: number
  basePath?: string
}

export const ReadTool = define("read", {
  description: "Read a file or directory from the local filesystem",
  parameters: z.object({
    filePath: z.string().describe("The absolute path to the file or directory to read"),
    offset: z.number().optional().describe("The line number to start reading from (1-indexed)"),
    limit: z.number().optional().describe("The maximum number of lines to read (defaults to 2000)"),
    basePath: z.string().optional().describe("Base directory for relative paths"),
  }),
  async execute(params: ReadParams, ctx?: unknown): Promise<ToolResult> {
    let filepath = params.filePath
    if (!path.isAbsolute(filepath) && params.basePath) {
      filepath = path.join(params.basePath, filepath)
    }
    filepath = path.resolve(filepath)
    
    const stat = await fs.promises.stat(filepath).catch(() => null)
    if (!stat) {
      throw new Error(`File not found: ${filepath}`)
    }

    if (stat.isDirectory()) {
      const entries = await fs.promises.readdir(filepath)
      const entriesWithType = await Promise.all(
        entries.map(async (entry) => {
          const entryPath = path.join(filepath, entry)
          const entryStat = await fs.promises.stat(entryPath).catch(() => null)
          if (entryStat?.isDirectory()) return entry + "/"
          return entry
        })
      )
      entriesWithType.sort()
      
      return {
        output: `<path>${filepath}</path>\n<type>directory</type>\n<entries>\n${entriesWithType.join("\n")}\n</entries>`,
        metadata: { type: "directory", count: entries.length },
      }
    }

    const content = await fs.promises.readFile(filepath, "utf-8")
    const allLines = content.split("\n")
    
    const offset = params.offset ?? 1
    const limit = params.limit ?? DEFAULT_LIMIT
    const start = offset - 1
    
    if (start >= allLines.length) {
      throw new Error(`Offset ${offset} is out of range (file has ${allLines.length} lines)`)
    }
    
    const lines = allLines.slice(start, start + limit)
    const truncated = start + lines.length < allLines.length
    
    const formattedLines = lines.map((line, i) => {
      const truncatedLine = line.length > MAX_LINE_LENGTH 
        ? line.substring(0, MAX_LINE_LENGTH) + "..." 
        : line
      return `${start + i + 1}: ${truncatedLine}`
    })

    let output = `<path>${filepath}</path>\n<type>file</type>\n<content>\n`
    output += formattedLines.join("\n")
    
    if (truncated) {
      output += `\n\n(File has more lines. Use 'offset' parameter to read beyond line ${start + lines.length})`
    } else {
      output += `\n\n(End of file - total ${allLines.length} lines)`
    }
    output += "\n</content>"

    return {
      output,
      metadata: { type: "file", totalLines: allLines.length, truncated },
    }
  },
})
