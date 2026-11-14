const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
};

export function detectRequestedSlideCount(message: string): number | null {
  const match = message.toLowerCase().match(
    /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)[\s-]*(?:carousel[\s-]+)?(?:slides?|cards?|parts?)\b/
  );
  if (!match) return null;

  const count = /^\d+$/.test(match[1]) ? Number(match[1]) : NUMBER_WORDS[match[1]];
  return Number.isSafeInteger(count) && count > 0 ? count : null;
}

export function getSlideGenerationState(
  requestedSlideCount: number | null,
  actualSlideCount: number
) {
  const remainingSlides = requestedSlideCount === null
    ? null
    : Math.max(0, requestedSlideCount - actualSlideCount);

  return {
    requestedSlideCount,
    actualSlideCount,
    remainingSlides,
    targetReached: remainingSlides === 0 && requestedSlideCount !== null,
  };
}

export function buildRemainingSlidesInstruction(remainingSlides: number): string {
  return [
    `The carousel still needs exactly ${remainingSlides} more slide${remainingSlides === 1 ? "" : "s"}.`,
    "Call create_slide for each remaining slide now.",
    "Do not recreate or modify slides that already exist, and do not finish with chat text until the target count is reached.",
  ].join(" ");
}
