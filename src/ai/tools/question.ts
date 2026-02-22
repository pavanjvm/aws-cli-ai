import z from "zod"
import { type ToolResult } from "./tool"

interface QuestionOption {
  label: string
  description?: string
}

interface Question {
  header: string
  question: string
  options: QuestionOption[]
}

export const QuestionTool = {
  name: "question",
  description: "Ask questions to the user with predefined options",
  parameters: z.object({
    questions: z.array(z.object({
      header: z.string().describe("Short label for the question"),
      question: z.string().describe("The complete question"),
      options: z.array(z.object({
        label: z.string().describe("Option label"),
        description: z.string().optional().describe("Option description"),
      })).describe("Available choices"),
    })).describe("Questions to ask"),
  }),
  async execute(params: { questions: Question[] }): Promise<ToolResult> {
    console.log("\n" + "=".repeat(50))
    for (const q of params.questions) {
      console.log(`\n${q.header}`)
      console.log(q.question)
      q.options.forEach((opt, i) => {
        console.log(`  ${i + 1}. ${opt.label}${opt.description ? ` - ${opt.description}` : ""}`)
      })
    }
    console.log("\n" + "=".repeat(50))
    
    return {
      output: "Questions displayed to user. Awaiting response...",
      metadata: { questions: params.questions },
    }
  },
}
