import {
  blankCourse,
  chunkText,
  type Course,
  type Demonstration,
} from "./course-domain";
import { learningConfig } from "./learning-domain";

export function sampleCourse(): Course {
  const text =
    "Retrieval-augmented generation separates retrieval quality from generation quality. A relevant source can still be misquoted. An existing citation is not proof that the cited passage supports a claim.\n\nChunk boundaries should preserve jurisdiction, dates, and exceptions. Embeddings approximate semantic similarity, not truth. Metadata filtering and reranking can improve relevance but require held-out evaluation.\n\nEvaluate retrieval using recall and ranking metrics against labeled relevant passages. Evaluate generated claims for support, completeness, and appropriate abstention. Test failure cases including outdated evidence, contradictory documents, and questions without an answer in the collection.\n\nTo make a causal claim from an experiment, control confounding factors. Compare baseline and intervention on the same held-out examples. Report uncertainty and negative results. A small convenience sample limits generalization.";
  const data = blankCourse();
  data.syllabus =
    "CS 381 · Evidence-based AI Systems\nWeek 1: retrieval, embeddings, chunking.\nWeek 2: grounded generation and failure analysis.\nWeek 3: evaluation and responsible deployment.\nStudents build a small RAG pipeline, explain design choices, and defend results on unseen scenarios.";
  data.objectives = [
    {
      id: "o1",
      title:
        "Explain the difference between semantic similarity and factual support.",
      level: "Understand",
    },
    {
      id: "o2",
      title: "Design chunks that preserve scope and context.",
      level: "Apply",
    },
    {
      id: "o3",
      title: "Diagnose unsupported claims using retrieved evidence.",
      level: "Analyze",
    },
    {
      id: "o4",
      title: "Evaluate retrieval and answer quality separately.",
      level: "Evaluate",
    },
    {
      id: "o5",
      title: "Transfer an evaluation strategy to a changed dataset.",
      level: "Apply",
    },
  ];
  data.modules = [
    {
      id: "m1",
      title: "Foundations of retrieval",
      week: 1,
      concepts: ["Embeddings", "Chunking", "Metadata"],
      objectiveIds: ["o1", "o2"],
      prerequisites: [],
    },
    {
      id: "m2",
      title: "Grounded generation",
      week: 2,
      concepts: ["Claim support", "Citations", "Abstention"],
      objectiveIds: ["o3"],
      prerequisites: ["m1"],
    },
    {
      id: "m3",
      title: "Evaluation in practice",
      week: 3,
      concepts: ["Held-out data", "Faithfulness", "Distribution shift"],
      objectiveIds: ["o4", "o5"],
      prerequisites: ["m2"],
    },
  ];
  data.sources = [
    {
      id: "source1",
      name: "Professor notes · RAG evaluation",
      text,
      approved: true,
      chunks: chunkText(text, "source1"),
    },
  ];
  data.materials = [
    {
      id: "mat1",
      moduleId: "m1",
      title: "Similarity is not truth",
      kind: "Lecture notes",
      approved: true,
      sourceIds: ["source1-c1"],
      content:
        "Learning focus\nExplain why a similar passage can be irrelevant or outdated.\n\nCore idea\nAn embedding represents semantic similarity. It does not verify facts, dates, or jurisdiction. Preserve this metadata alongside your chunks.\n\nWorked example\nA query about a 2025 policy retrieves a 2022 policy with almost identical wording. The passage is similar, but the answer may be wrong.\n\nDiscussion\nWhat would you measure to distinguish a retrieval error from a generation error?\n\nPractice\nWrite one query for which an existing citation would fail to support the answer.",
    },
  ];
  data.checkpoints = [
    {
      id: "cp1",
      title: "Defend your RAG diagnosis",
      moduleId: "m3",
      objectiveIds: ["o3", "o4", "o5"],
      prompt:
        "A research assistant produces accurate-looking citations, but several answers are unsupported. Submit a short diagnosis and an evaluation plan. Include a small table or code excerpt if useful. Explain why your proposed measurements would reveal the failure.",
      rubric: [
        {
          objectiveId: "o3",
          criterion: "Evidence-based diagnosis",
          weight: 35,
          descriptor:
            "Identifies the unsupported claim, links it to a concrete passage, and distinguishes retrieval failure from generation failure.",
        },
        {
          objectiveId: "o4",
          criterion: "Evaluation design",
          weight: 40,
          descriptor:
            "Defines separate retrieval and answer-support measurements, a held-out set, and limits of the experiment.",
        },
        {
          objectiveId: "o5",
          criterion: "Transfer of understanding",
          weight: 25,
          descriptor:
            "Adapts the evaluation when documents conflict or the dataset changes, explaining assumptions and uncertainty.",
        },
      ],
      followupStrategy:
        "Ask the student to defend one specific design decision, then probe the weakest supported objective. Keep questions neutral and avoid supplying the answer.",
      transferPrompt:
        "Now the knowledge base contains two policies with conflicting dates, and some questions have no supported answer. How would you change your evaluation and system behavior?",
      dueAt: "",
      published: true,
    },
  ];
  data.graphApproved = true;
  data.learning = learningConfig(data);
  data.sources[0].moduleIds = ["m1"];
  data.learning.activities = [
    { id: "quick-similarity", moduleId: "m1", title: "Similarity ≠ support", kind: "Diagnostic", conceptIds: ["m1-concept-1"], question: "A query about a 2025 policy retrieves a nearly identical policy from 2022. What should you do before using it?", options: ["Trust the highest similarity score", "Check dates, scope, and whether the passage supports the specific claim", "Add a citation and accept the answer"], answer: 1, explanation: "Similarity measures closeness in meaning, not current applicability. Verify date, scope, and claim support before using the passage.", difficulty: "Foundation", sourceIds: ["source1-c1"], approved: true },
    { id: "quick-chunks", moduleId: "m1", title: "Keep the exception", kind: "Pulse check", conceptIds: ["m1-concept-2"], question: "A policy states a rule followed by an exception. Which chunk design best preserves the meaning?", options: ["Separate the exception from the rule", "Keep the rule, exception, and scope together", "Remove the exception to reduce tokens"], answer: 1, explanation: "Chunk boundaries should preserve exceptions, dates, and jurisdiction. Shorter chunks are not automatically better.", difficulty: "Core", sourceIds: ["source1-c1"], approved: true },
    { id: "quick-transfer", moduleId: "m1", title: "A new jurisdiction", kind: "Spaced review", conceptIds: ["m1-concept-1", "m1-concept-3"], question: "A campus assistant retrieves a correct rule for a different university. What is the strongest repair?", options: ["Increase response confidence", "Filter by institution and evaluate on held-out campus-specific questions", "Always return the top passage"], answer: 1, explanation: "Metadata filtering addresses scope, and held-out testing checks whether it improves retrieval. A plausible answer from the wrong institution is still unsupported.", difficulty: "Challenge", sourceIds: ["source1-c1"], approved: true },
    { id: "quick-citations", moduleId: "m2", title: "A citation is not proof", kind: "Exit ticket", conceptIds: ["m2-concept-1", "m2-concept-2"], question: "An answer cites a real document, but the passage never makes the claimed statement. Which conclusion is justified?", options: ["The answer is supported because the citation exists", "The cited passage does not support the claim", "All retrieval has failed"], answer: 1, explanation: "Citation existence and claim support are distinct. Check the passage before concluding whether retrieval or generation caused the error.", difficulty: "Core", sourceIds: ["source1-c1"], approved: true },
  ];
  data.audit = [
    {
      at: "2026-09-17T10:00:00Z",
      action: "Sample course graph approved by professor",
    },
  ];
  return {
    id: "sample-course",
    teacher_id: "preview-teacher",
    class_id: "preview-class",
    title: "CS 381 · Evidence-based AI Systems",
    data,
    version: 1,
    updated_at: "2026-09-17T10:00:00Z",
  };
}
export function sampleDemonstrations(c: Course): Demonstration[] {
  const cp = c.data.checkpoints[0];
  return [
    {
      id: "sample-evidence",
      course_id: c.id,
      student_id: "preview-student",
      checkpoint_id: cp.id,
      version: 1,
      status: "submitted",
      created_at: "2026-09-17T10:30:00Z",
      snapshot: {
        checkpoint: cp,
        objectives: c.data.objectives.filter((o) =>
          cp.objectiveIds.includes(o.id),
        ),
        courseTitle: c.title,
        revision: 1,
      },
      data: {
        disclosure:
          "Used Nova for practice and a code completion tool for boilerplate.",
        helpUsed: "Course notes and documentation.",
        questions: [
          {
            id: "q1",
            prompt:
              "Why is citation existence insufficient to validate the answer?",
            objectiveIds: ["o3"],
          },
          {
            id: "q2",
            prompt:
              "How will your test separate retrieval errors from generation errors?",
            objectiveIds: ["o4"],
          },
        ],
        evidence: [
          {
            id: "e1",
            kind: "artifact",
            prompt: cp.prompt,
            answer:
              "I would label a held-out set of questions and relevant passages, measure retrieval recall, and check whether each generated claim is supported by the retrieved context.",
            at: "2026-09-17T10:20:00Z",
            objectiveIds: cp.objectiveIds,
          },
          {
            id: "e2",
            kind: "explanation",
            prompt: "Explain your decisions.",
            answer:
              "A correct-looking citation only proves the document exists. The passage may have a different date or scope, so I would evaluate support separately from retrieval relevance.",
            at: "2026-09-17T10:22:00Z",
            objectiveIds: cp.objectiveIds,
          },
          {
            id: "e3",
            kind: "followup",
            prompt:
              "Why is citation existence insufficient to validate the answer?",
            answer:
              "I need the actual passage to entail the claim, not just a link to the document.",
            at: "2026-09-17T10:24:00Z",
            objectiveIds: ["o3"],
          },
          {
            id: "e4",
            kind: "followup",
            prompt:
              "How will your test separate retrieval errors from generation errors?",
            answer:
              "Run generation once with known relevant passages and once with the retrieved passages, holding other inputs fixed.",
            at: "2026-09-17T10:26:00Z",
            objectiveIds: ["o4"],
          },
          {
            id: "e5",
            kind: "transfer",
            prompt: cp.transferPrompt,
            answer:
              "I would add date filters and test questions with contradictory sources. I still need to specify how abstention is scored.",
            at: "2026-09-17T10:29:00Z",
            objectiveIds: cp.objectiveIds,
          },
        ],
        events: [
          {
            at: "2026-09-17T10:20:00Z",
            action: "Work submitted for follow-up",
          },
          { at: "2026-09-17T10:30:00Z", action: "Evidence bundle submitted" },
        ],
        evaluation: {
          source: "Example only",
          summary:
            "Illustrative evidence synthesis: the student distinguishes relevance from claim support, but the transfer response leaves abstention evaluation underspecified.",
          findings: [
            {
              objectiveId: "o3",
              level: "Strong",
              confidence: "High",
              rationale:
                "The explanation identifies why a citation can be insufficient.",
              evidenceIds: ["e2", "e3"],
              uncertainty: "No unseen claim-labeling task has been observed.",
            },
            {
              objectiveId: "o4",
              level: "Strong",
              confidence: "Medium",
              rationale:
                "The proposed controlled comparison separates retrieval and generation.",
              evidenceIds: ["e1", "e4"],
              uncertainty: "The plan has not been executed on a real dataset.",
            },
            {
              objectiveId: "o5",
              level: "Needs verification",
              confidence: "Low",
              rationale:
                "The changed-scenario response does not define an abstention metric.",
              evidenceIds: ["e5"],
              uncertainty:
                "A targeted follow-up is needed before confirming transfer.",
            },
          ],
          misconceptions: [
            "A valid citation can still fail to support a claim.",
          ],
          nextSteps: [
            "Ask for a concrete abstention scoring rule and one counterexample.",
          ],
        },
        review: null,
      },
    },
  ];
}
