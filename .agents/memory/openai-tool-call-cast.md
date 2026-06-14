---
name: OpenAI tool_call type casting
description: How to safely iterate tool_calls on OpenAI chat completion messages without TS errors from the discriminated union type.
---

# Problem
`ChatCompletionMessageToolCall` is a discriminated union in the OpenAI SDK. Accessing `.function.name`, `.function.arguments`, or `.id` directly on items from `msg.tool_calls` causes TS2339 errors because some union members don't have a `.function` property.

# Fix
Cast each element before accessing its properties:

```typescript
for (const rawCall of msg.tool_calls) {
  const call = rawCall as { id: string; function: { name: string; arguments: string } };
  const args = JSON.parse(call.function.arguments);
  // ... use call.function.name, call.id
  toolResultsArr.push({ role: "tool", content: result, tool_call_id: call.id });
}
```

**Why:** The SDK models custom/function tool calls as a union. Rather than narrowing with `if (rawCall.type === "function")`, casting is cleaner when we know all calls in practice will be function calls.

**How to apply:** Any server route that iterates `msg.tool_calls` from an OpenAI chat response should use this cast pattern. See `artifacts/api-server/src/routes/platform/marketplace.ts` and `routes/ide/agent.ts`.
