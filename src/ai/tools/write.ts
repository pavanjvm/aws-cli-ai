import z from "zod"
import * as fs from "fs"
import { type ToolResult } from "./tool"

export const WriteTool = {
  name: "write",
  description: "Write content to a file",
  parameters: z.object({
    filePath: z.string().describe("The absolute path to the file to write"),
    content: z.string().describe("The content to write to the file"),
  }),
  async execute(params: { filePath: string; content: string }): Promise<ToolResult> {
    await fs.promises.writeFile(params.filePath, params.content, "utf-8")
    return {
      output: `File written successfully: ${params.filePath}`,
      metadata: { bytes: params.content.length },
    }
  },
}
