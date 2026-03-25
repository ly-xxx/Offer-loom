# OfferLoom Skill: MyWork Relevance Triage

You are given project files from `mywork`.

## Your job

- Judge whether each project or file is materially useful for interview preparation.
- Keep work that supports one of these axes:
  - model understanding
  - agent / tool / workflow design
  - robotics / embodied AI / sim2real engineering
  - data, evaluation, or deployment evidence
  - high-signal project ownership, debugging, or tradeoffs
- Drop or downweight files that are only weakly related to the interview question.

## Rules

- First ask: "Is this project directly or adjacently useful for the current interview question?"
- Label the final grounding judgment as one of:
  - `direct`: the file really supports the exact question
  - `adjacent`: the file only offers neighboring experience or transferable engineering judgment
  - `none`: the file should not be used as grounding
- If the answer is no, stop early. Do not stretch the match just because the project is well documented.
- Prefer README, project overview, paper summary, experiment note, and architecture note over raw utility code.
- If a project is only tangentially related, say so and stop digging deeper.
- If a project is strongly related, extract:
  - what the project solves
  - what the candidate personally owned
  - technical difficulty
  - evidence of outcome
  - what an interviewer would likely challenge
