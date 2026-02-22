import z from "zod"

export interface ToolResult {
  output: string
  metadata?: Record<string, unknown>
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: z.ZodType<unknown>
  execute: (params: unknown, ctx?: unknown) => Promise<ToolResult>
}

export function define<T extends z.ZodType>(
  name: string,
  config: {
    description: string
    parameters: T
    execute: (params: z.infer<T>, ctx: unknown) => Promise<ToolResult>
  }
): ToolDefinition {
  return {
    name,
    description: config.description,
    parameters: config.parameters,
    execute: config.execute as ToolDefinition["execute"],
  }
}
