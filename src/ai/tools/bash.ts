import z from "zod"
import { type ToolResult } from "./tool"

export const BashTool = {
  name: "bash",
  description: "Execute shell commands",
  parameters: z.object({
    command: z.string().describe("The command to execute"),
    timeout: z.number().optional().describe("Timeout in milliseconds"),
  }),
  async execute(params: { command: string; timeout?: number }, ctx?: unknown): Promise<ToolResult> {
    const proc = Bun.spawn(params.command.split(" "), {
      stdout: "pipe",
      stderr: "pipe",
    })

    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])

    const output = stdout + (stderr ? `\nStderr: ${stderr}` : "")
    return {
      output: output || "(no output)",
      metadata: { exitCode: await proc.exited },
    }
  },
}
