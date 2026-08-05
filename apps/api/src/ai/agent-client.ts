import type { AgentName, VaultRagChunk } from "@markos/shared-types";
import { resolveModelSetting } from "../admin/model-settings-service";
import { requestAi } from "./request";

export interface AgentRunResponse {
  model: string;
  prompt_version: string;
  tokens_in: number;
  tokens_out: number;
  output: Record<string, unknown>;
}

export async function runAiAgent(input: {
  agent: AgentName;
  context: VaultRagChunk[];
  inputs?: Record<string, unknown>;
  locale: string;
  promptTemplate?: { body: string; version: string };
  task: string;
  workspaceId: string;
}): Promise<AgentRunResponse> {
  const model = await resolveModelSetting("LLM_PRIMARY_MODEL");
  const body = {
    workspace_id: input.workspaceId,
    agent: input.agent,
    task: input.task,
    locale: input.locale,
    context: input.context.map((chunk) => ({
      section: chunk.section,
      key: chunk.key,
      value: chunk.value,
      score: chunk.score
    })),
    ...(input.inputs === undefined ? {} : { inputs: input.inputs }),
    ...(input.promptTemplate === undefined ? {} : { prompt_template: input.promptTemplate }),
    model
  };

  return requestAi<AgentRunResponse>("/ai/agents/run", { body });
}
