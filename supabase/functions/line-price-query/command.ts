import type { ParsedCommand } from "./types.ts";

const FORMAT_MESSAGE =
  "格式：查價 客戶名稱 產品編號\n範例：查價 長青商行 ABC-100";

function tokenize(input: string): string[] | null {
  const tokens: string[] = [];
  let index = 0;

  while (index < input.length) {
    while (index < input.length && /\s/.test(input[index])) {
      index++;
    }
    if (index === input.length) {
      break;
    }

    if (input[index] === '"') {
      const closingQuote = input.indexOf('"', index + 1);
      if (closingQuote === -1) {
        return null;
      }

      const token = input.slice(index + 1, closingQuote);
      if (
        token.length === 0 ||
        (closingQuote + 1 < input.length &&
          !/\s/.test(input[closingQuote + 1]))
      ) {
        return null;
      }

      tokens.push(token);
      index = closingQuote + 1;
      continue;
    }

    const start = index;
    while (index < input.length && !/\s/.test(input[index])) {
      if (input[index] === '"') {
        return null;
      }
      index++;
    }
    tokens.push(input.slice(start, index));
  }

  return tokens;
}

export function parseCommand(input: string): ParsedCommand {
  const tokens = tokenize(input);

  if (tokens === null || tokens.length !== 3 || tokens[0] !== "查價") {
    return { ok: false, message: FORMAT_MESSAGE };
  }

  return {
    ok: true,
    customer: tokens[1],
    sku: tokens[2],
  };
}
