import z from "zod"
import * as fs from "fs"
import { type ToolResult } from "./tool"

export const EditTool = {
  name: "edit",
  description: "Perform exact string replacements in files",
  parameters: z.object({
    filePath: z.string().describe("The absolute path to the file to modify"),
    oldString: z.string().describe("The text to replace"),
    newString: z.string().describe("The text to replace it with"),
    replaceAll: z.boolean().optional().describe("Replace all occurrences"),
  }),
  async execute(params: { filePath: string; oldString: string; newString: string; replaceAll?: boolean }): Promise<ToolResult> {
    const content = await fs.promises.readFile(params.filePath, "utf-8")
    
    if (!content.includes(params.oldString)) {
      throw new Error(`oldString not found in file: ${params.filePath}`)
    }

    const newContent = params.replaceAll 
      ? content.split(params.oldString).join(params.newString)
      : content.replace(params.oldString, params.newString)

    await fs.promises.writeFile(params.filePath, newContent, "utf-8")
    return {
      output: `File edited successfully: ${params.filePath}`,
      metadata: {},
    }
  },
}
