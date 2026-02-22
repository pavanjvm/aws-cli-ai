import { ReadTool, ListTool, GlobTool, GrepTool, BashTool, TodoWriteTool, TodoReadTool } from "./index.js"

export interface ToolExecutor {
  execute: (name: string, args: Record<string, unknown>) => Promise<{ output: string; metadata?: Record<string, unknown> }>
}

export function createToolExecutor(basePath?: string): ToolExecutor {
  const ctx = {}
  return {
    async execute(name: string, args: Record<string, unknown>) {
      const toolArgs = { ...args, basePath } as any
      
      switch (name) {
        case "read":
          return await ReadTool.execute(toolArgs, ctx)
        case "ls":
        case "list":
          return await ListTool.execute(toolArgs, ctx)
        case "glob":
          return await GlobTool.execute(toolArgs, ctx)
        case "grep":
          return await GrepTool.execute(toolArgs, ctx)
        case "bash":
          return await BashTool.execute(toolArgs, ctx)
        case "todowrite":
          return await TodoWriteTool.execute(toolArgs as any, ctx)
        case "todoread":
          return await TodoReadTool.execute({}, ctx)
        default:
          throw new Error(`Unknown tool: ${name}`)
      }
    }
  }
}

export function getToolDefinitions(basePath?: string) {
  return [
    { 
      name: "read", 
      description: ReadTool.description, 
      inputSchema: ReadTool.parameters,
    },
    { 
      name: "ls", 
      description: ListTool.description, 
      inputSchema: ListTool.parameters,
    },
    { 
      name: "glob", 
      description: GlobTool.description, 
      inputSchema: GlobTool.parameters,
    },
    { 
      name: "grep", 
      description: GrepTool.description, 
      inputSchema: GrepTool.parameters,
    },
    { 
      name: "bash", 
      description: BashTool.description, 
      inputSchema: BashTool.parameters,
    },
  ]
}
