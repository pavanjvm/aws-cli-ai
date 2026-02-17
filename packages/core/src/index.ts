import { generateText } from 'ai';

export interface DeploymentContext {
  region: string;
  service: string;
  environment: string;
}

export interface AgentResponse {
  action: string;
  commands: string[];
  explanation: string;
}

export class DeploymentAgent {
  private model: any;

  constructor(model: any) {
    this.model = model;
  }

  async analyzeDeployment(context: DeploymentContext): Promise<AgentResponse> {
    const prompt = `
      You are an AWS deployment assistant. Analyze this deployment request:
      - Region: ${context.region}
      - Service: ${context.service}
      - Environment: ${context.environment}

      Provide deployment commands and explain your reasoning.
    `;

    const { text } = await generateText({
      model: this.model,
      prompt,
    });

    return {
      action: 'deploy',
      commands: ['aws deploy...'],
      explanation: text,
    };
  }

  async suggestOptimizations(currentConfig: Record<string, any>): Promise<string[]> {
    return [
      'Consider using Spot instances for cost savings',
      'Enable auto-scaling for better reliability',
      'Use Secrets Manager for sensitive data',
    ];
  }
}

export const createDeploymentAgent = (model: any) => new DeploymentAgent(model);
