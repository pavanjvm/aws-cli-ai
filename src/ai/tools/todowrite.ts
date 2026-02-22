import z from "zod"
import * as fs from "fs"
import * as path from "path"
import { type ToolResult } from "./tool"

interface Todo {
  content: string
  status: "pending" | "in_progress" | "completed" | "failed"
  priority?: "high" | "medium" | "low"
}

export type { Todo }

const TODO_FILE = ".ai-todos.json"

export const TodoWriteTool = {
  name: "todowrite",
  description: "Create and manage todo list for deployment tasks",
  parameters: z.object({
    todos: z.array(z.object({
      content: z.string().describe("Description of the task"),
      status: z.enum(["pending", "in_progress", "completed", "failed"]).optional().describe("Task status"),
      priority: z.enum(["high", "medium", "low"]).optional().describe("Task priority"),
    })).describe("The todo list to save"),
  }),
  async execute(params: { todos: Todo[] }, ctx?: unknown): Promise<ToolResult> {
    await fs.promises.writeFile(TODO_FILE, JSON.stringify(params.todos, null, 2), "utf-8")
    const pending = params.todos.filter(t => t.status !== "completed").length
    return {
      output: `Saved ${params.todos.length} tasks (${pending} pending)`,
      metadata: { todos: params.todos },
    }
  },
}

export const TodoReadTool = {
  name: "todoread",
  description: "Read the current todo list",
  parameters: z.object({}),
  async execute(params: {}, ctx?: unknown): Promise<ToolResult> {
    try {
      const content = await fs.promises.readFile(TODO_FILE, "utf-8")
      const todos: Todo[] = JSON.parse(content)
      const pending = todos.filter(t => t.status !== "completed").length
      return {
        output: `${pending} of ${todos.length} tasks remaining\n\n${JSON.stringify(todos, null, 2)}`,
        metadata: { todos },
      }
    } catch {
      return { output: "No todo list found", metadata: { todos: [] } }
    }
  },
}
