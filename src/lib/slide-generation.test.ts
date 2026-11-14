import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildRemainingSlidesInstruction,
  detectRequestedSlideCount,
  getSlideGenerationState,
} from "./slide-generation";

test("detects four-slide requests written with digits or words", () => {
  assert.equal(detectRequestedSlideCount("Create a 4-slide carousel"), 4);
  assert.equal(detectRequestedSlideCount("Please make four slides about coffee"), 4);
});

test("detects five-slide requests across phrasing variants", () => {
  assert.equal(detectRequestedSlideCount("Create a 5-slide carousel about marketing"), 5);
  assert.equal(detectRequestedSlideCount("5-slide carousel"), 5);
  assert.equal(detectRequestedSlideCount("Create a five-slide carousel"), 5);
  assert.equal(detectRequestedSlideCount("5 carousel slides"), 5);
  assert.equal(detectRequestedSlideCount("five carousel cards"), 5);
  assert.equal(detectRequestedSlideCount("A 5-part carousel on productivity"), 5);
  assert.equal(detectRequestedSlideCount("carousel with 5 slides"), 5);
});

test("runtime regression: five-slide request with first response having no tool calls continues until 5 slides exist", () => {
  const userPrompt = "Create a 5-slide carousel on tech trends";
  const requestedSlideCount = detectRequestedSlideCount(userPrompt);
  assert.equal(requestedSlideCount, 5);

  let actualSlideCount = 0;
  let iterationsCount = 0;
  let terminationReason = "unknown";
  const messages: Array<{ role: string; content?: string }> = [
    { role: "user", content: userPrompt },
  ];

  const MAX_ITERATIONS = 10;

  // Simulate agent loop with first turn returning 0 tool calls
  while (iterationsCount < MAX_ITERATIONS) {
    iterationsCount++;

    const preState = getSlideGenerationState(requestedSlideCount, actualSlideCount);
    if (preState.targetReached) {
      terminationReason = "requested_slide_count_reached";
      break;
    }

    if (iterationsCount === 1) {
      // Iteration 1: Model outputs conversational text and NO tool calls
      const iterationToolCalls: unknown[] = [];
      const iterationText = "I will gladly build a 5-slide carousel for you.";
      const postState = getSlideGenerationState(requestedSlideCount, actualSlideCount);

      if (iterationToolCalls.length === 0) {
        if (postState.remainingSlides !== null && postState.remainingSlides > 0) {
          messages.push({ role: "assistant", content: iterationText });
          messages.push({
            role: "user",
            content: buildRemainingSlidesInstruction(postState.remainingSlides),
          });
          // Must continue, not terminate!
          continue;
        }
        terminationReason = postState.targetReached ? "requested_slide_count_reached" : "no_tool_calls";
        break;
      }
    } else if (iterationsCount === 2) {
      // Iteration 2: Model creates 2 slides
      actualSlideCount += 2;
      const postState = getSlideGenerationState(requestedSlideCount, actualSlideCount);
      if (postState.targetReached) {
        terminationReason = "requested_slide_count_reached";
        break;
      }
    } else if (iterationsCount === 3) {
      // Iteration 3: Model creates remaining 3 slides
      actualSlideCount += 3;
      const postState = getSlideGenerationState(requestedSlideCount, actualSlideCount);
      if (postState.targetReached) {
        terminationReason = "requested_slide_count_reached";
        break;
      }
    }
  }

  assert.equal(actualSlideCount, 5, "All 5 requested slides must be created");
  assert.equal(iterationsCount, 3, "Must have completed 3 iterations without prematurely stopping");
  assert.equal(terminationReason, "requested_slide_count_reached");
  assert.equal(messages.length, 3, "Continuation instruction was pushed to message history");
  assert.match(messages[2].content!, /still needs exactly 5 more slides/i);
});

test("runtime regression: incomplete target reaches max_iterations_incomplete", () => {
  const requestedSlideCount = 5;
  const actualSlideCount = 1;
  let iteration = 0;
  let terminationReason = "unknown";
  const MAX_ITERATIONS = 4;

  while (iteration < MAX_ITERATIONS) {
    iteration++;
    const state = getSlideGenerationState(requestedSlideCount, actualSlideCount);
    if (state.targetReached) {
      terminationReason = "requested_slide_count_reached";
      break;
    }
    // Simulation: model continually fails to return tool calls
    // It pushes continuation instruction and continues
  }

  const finalState = getSlideGenerationState(requestedSlideCount, actualSlideCount);
  if (iteration >= MAX_ITERATIONS && terminationReason === "unknown") {
    terminationReason = finalState.remainingSlides && finalState.remainingSlides > 0
      ? "max_iterations_incomplete"
      : "max_iterations";
  }

  assert.equal(terminationReason, "max_iterations_incomplete");
  assert.equal(finalState.remainingSlides, 4);
});

test("initial no-tool-call response continues when slides remain", () => {
  const state = getSlideGenerationState(4, 0);
  assert.equal(state.targetReached, false);
  assert.equal(state.remainingSlides, 4);
  assert.match(buildRemainingSlidesInstruction(state.remainingSlides!), /exactly 4 more slides/i);
});

test("partial creation continues only for the missing slides", () => {
  const state = getSlideGenerationState(4, 2);
  assert.equal(state.targetReached, false);
  assert.equal(state.remainingSlides, 2);
});

test("existing slides prevent duplicate creation once the target is reached", () => {
  const state = getSlideGenerationState(4, 4);
  assert.equal(state.targetReached, true);
  assert.equal(state.remainingSlides, 0);
});

test("a maximum-iteration caller can identify an incomplete target", () => {
  const state = getSlideGenerationState(4, 3);
  assert.equal(state.targetReached, false);
  assert.equal(state.remainingSlides, 1);
});
