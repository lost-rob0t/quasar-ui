export function zeroUsage() {
  return {
    costUsd: 0,
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    toolCalls: 0,
    iterations: 0,
    runtimeMs: 0
  };
}

export function addUsage(current, delta) {
  const result = { ...zeroUsage(), ...(current || {}) };
  for (const key of Object.keys(result)) result[key] += Number(delta?.[key] || 0);
  return result;
}

export function calculateCost(usage, pricing) {
  const input = Math.max(0, Number(usage?.inputTokens || 0) - Number(usage?.cachedTokens || 0));
  const cached = Math.max(0, Number(usage?.cachedTokens || 0));
  const output = Math.max(0, Number(usage?.outputTokens || 0));
  return (
    (input / 1_000_000) * Number(pricing?.inputPerMillionUsd || 0)
    + (cached / 1_000_000) * Number(pricing?.cachedInputPerMillionUsd ?? pricing?.inputPerMillionUsd ?? 0)
    + (output / 1_000_000) * Number(pricing?.outputPerMillionUsd || 0)
  );
}

export function budgetState(policy, usage, projected = {}) {
  const next = addUsage(usage, projected);
  const limits = [
    ["costUsd", "maxCostUsd", "Run cost"],
    ["inputTokens", "maxInputTokens", "Input tokens"],
    ["outputTokens", "maxOutputTokens", "Output tokens"],
    ["toolCalls", "maxToolCalls", "Tool calls"],
    ["iterations", "maxIterations", "Iterations"],
    ["runtimeMs", "maxRuntimeMs", "Runtime"]
  ];
  let highestRatio = 0;
  for (const [usageKey, policyKey, label] of limits) {
    const limit = Number(policy?.[policyKey] || 0);
    if (!limit) continue;
    const ratio = Number(next[usageKey] || 0) / limit;
    highestRatio = Math.max(highestRatio, ratio);
    if (ratio >= 1) return { state: "hard-stop", reason: `${label} limit reached`, ratio, usage: next };
  }
  const softLimit = Number(policy?.softLimitRatio ?? 0.8);
  if (highestRatio >= softLimit) return { state: "warning", reason: "Soft budget limit reached", ratio: highestRatio, usage: next };
  return { state: "ok", reason: "", ratio: highestRatio, usage: next };
}

export function remainingBudget(policy, usage) {
  return {
    costUsd: Math.max(0, Number(policy?.maxCostUsd || 0) - Number(usage?.costUsd || 0)),
    inputTokens: Math.max(0, Number(policy?.maxInputTokens || 0) - Number(usage?.inputTokens || 0)),
    outputTokens: Math.max(0, Number(policy?.maxOutputTokens || 0) - Number(usage?.outputTokens || 0)),
    toolCalls: Math.max(0, Number(policy?.maxToolCalls || 0) - Number(usage?.toolCalls || 0)),
    iterations: Math.max(0, Number(policy?.maxIterations || 0) - Number(usage?.iterations || 0)),
    runtimeMs: Math.max(0, Number(policy?.maxRuntimeMs || 0) - Number(usage?.runtimeMs || 0))
  };
}
