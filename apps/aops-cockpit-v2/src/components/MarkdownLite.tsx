import { useMemo, type ReactNode } from "react";

// Dependency-free markdown-lite renderer for hosted doc bodies. Line-based:
// #..#### headings (with anchor slugs for the outline), ``` code fences,
// -/* bullets, > quotes, plain paragraphs. Everything renders as TEXT nodes —
// no raw-HTML injection surface. Inline markup (bold/links) stays literal;
// docs remain readable and safe without pulling a markdown dependency into
// the workspace lockfile.

export function markdownAnchorSlug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9çğıöşü\s-]/gi, "")
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

interface Block {
  kind: "heading" | "code" | "bullet" | "quote" | "paragraph";
  level?: number;
  lines: string[];
}

function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (/^```/.test(line)) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1;
      blocks.push({ kind: "code", lines: code });
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length, lines: [heading[2]] });
      index += 1;
      continue;
    }
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      const bullets: string[] = [];
      while (index < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[index])) {
        bullets.push(lines[index].replace(/^\s*([-*+]|\d+\.)\s+/, ""));
        index += 1;
      }
      blocks.push({ kind: "bullet", lines: bullets });
      continue;
    }
    if (/^\s*>/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^\s*>/.test(lines[index])) {
        quote.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      blocks.push({ kind: "quote", lines: quote });
      continue;
    }
    if (line.trim() === "") {
      index += 1;
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() !== "" && !/^(#{1,6}\s|```|\s*([-*+]|\d+\.)\s|\s*>)/.test(lines[index])) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push({ kind: "paragraph", lines: paragraph });
  }
  return blocks;
}

export function MarkdownLite({ markdown }: { markdown: string }): ReactNode {
  const blocks = useMemo(() => parseBlocks(markdown), [markdown]);
  return (
    <div className="aops-mdlite">
      {blocks.map((block, index) => {
        if (block.kind === "heading") {
          const level = Math.min(block.level ?? 1, 6);
          const Tag = (`h${Math.min(level + 2, 6)}`) as "h3" | "h4" | "h5" | "h6";
          return (
            <Tag key={index} id={markdownAnchorSlug(block.lines[0])} className={`aops-mdlite-h aops-mdlite-h${level}`}>
              {block.lines[0]}
            </Tag>
          );
        }
        if (block.kind === "code") {
          return (
            <pre key={index} className="aops-mdlite-code">
              {block.lines.join("\n")}
            </pre>
          );
        }
        if (block.kind === "bullet") {
          return (
            <ul key={index} className="aops-mdlite-list">
              {block.lines.map((line, itemIndex) => (
                <li key={itemIndex}>{line}</li>
              ))}
            </ul>
          );
        }
        if (block.kind === "quote") {
          return (
            <blockquote key={index} className="aops-mdlite-quote">
              {block.lines.join("\n")}
            </blockquote>
          );
        }
        return <p key={index}>{block.lines.join(" ")}</p>;
      })}
    </div>
  );
}
