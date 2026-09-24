import { z } from "zod";
import type { Demonstration, EvidenceItem } from "./course-domain";
export const answersSchema = z.object({
  artifact: z.string().max(25000),
  explanation: z.string().max(15000),
  followupAnswers: z.record(z.string(), z.string().max(8000)).default({}),
  transfer: z.string().max(10000).default(""),
  reflection: z.string().max(5000).default(""),
  disclosure: z.string().max(3000).default(""),
  helpUsed: z.string().max(3000).default(""),
});
export function saveAnswers(d: Demonstration, input: unknown) {
  const b = answersSchema.parse(input);
  const cp = d.snapshot.checkpoint;
  const old = d.data.evidence;
  const now = new Date().toISOString();
  const evidence: EvidenceItem[] = [];
  const add = (
    id: string,
    kind: EvidenceItem["kind"],
    prompt: string,
    answer: string,
    objectiveIds: string[],
  ) => {
    if (answer.trim())
      evidence.push({
        id,
        kind,
        prompt,
        answer,
        objectiveIds,
        at: old.find((e) => e.id === id && e.answer === answer)?.at || now,
      });
  };
  const changed =
    d.data.questions.length > 0 &&
    (old.find((e) => e.kind === "artifact")?.answer !== b.artifact ||
      old.find((e) => e.kind === "explanation")?.answer !== b.explanation);
  if (changed) {
    delete d.data.dialogue;
    d.data.questions = [];
    d.data.evaluation = null;
    d.status = "draft";
    d.data.events.push({
      at: now,
      action: "Initial work changed; follow-ups must be regenerated",
    });
  }
  if(!changed&&d.data.dialogue){
    const edited=d.data.questions.findIndex(q=>{const prior=old.find(e=>e.id===q.id);return prior&&prior.answer!==(b.followupAnswers[q.id]||"");});
    if(edited>=0){
      d.data.questions=d.data.questions.slice(0,edited+1);
      d.data.dialogue.turns=d.data.dialogue.turns.filter(t=>d.data.questions.some(q=>q.id===t.questionId));
      d.data.dialogue.status="active";d.data.dialogue.reason="A previous answer changed; review the updated reasoning.";
      d.data.evaluation=null;d.status="followup";
    }
  }
  add("artifact", "artifact", cp.prompt, b.artifact, cp.objectiveIds);
  add(
    "explanation",
    "explanation",
    "Explain your reasoning and justify your choices.",
    b.explanation,
    cp.objectiveIds,
  );
  if (!changed) {
    d.data.questions.forEach((q) =>
      add(
        q.id,
        "followup",
        q.prompt,
        b.followupAnswers[q.id] || "",
        q.objectiveIds,
      ),
    );
    add("transfer", "transfer", cp.transferPrompt, b.transfer, cp.objectiveIds);
    add("reflection", "reflection", "What changed in your understanding, what was difficult, and what will you do next?", b.reflection, cp.objectiveIds);
  }
  d.data.evidence = evidence;
  d.data.disclosure = b.disclosure;
  d.data.helpUsed = b.helpUsed;
  return d;
}
