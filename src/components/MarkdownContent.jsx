import { Children } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

function headingSlug(value) {
  return String(value).toLowerCase().trim().replace(/[`*_]/g, "").replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-") || "section";
}

function safeHtmlDocument(source) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src https: data: blob:; media-src https: data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'"><style>html{color-scheme:dark}body{margin:0;padding:18px;background:#0d0e12;color:#d8d4dc;font:14px/1.6 Inter,system-ui,sans-serif}button{border:1px solid #6f4ba1;background:#15131c;color:#c69cff;padding:8px 12px;cursor:pointer}a{color:#b780ff}</style></head><body>${source}</body></html>`;
}

function videoFileURL(value) {
  try {
    const url = new URL(value, window.location.origin);
    return /\.(mp4|webm|m4v|mov|ogv)$/i.test(url.pathname);
  } catch {
    return false;
  }
}

function resolveEmbedURL(value) {
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");

    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : null;
    }
    if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
      const parts = url.pathname.split("/").filter(Boolean);
      const id = url.searchParams.get("v") || (parts[0] === "embed" || parts[0] === "shorts" ? parts[1] : "");
      return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : null;
    }
    if (host === "vimeo.com" || host === "player.vimeo.com") {
      const id = url.pathname.split("/").filter(Boolean).find((part) => /^\d+$/.test(part));
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }
    if (host === "bilibili.com" || host === "m.bilibili.com") {
      const match = url.pathname.match(/\/video\/(BV[0-9A-Za-z]+|av\d+)/i);
      if (!match) return null;
      const id = match[1];
      return /^BV/i.test(id)
        ? `https://player.bilibili.com/player.html?bvid=${encodeURIComponent(id)}`
        : `https://player.bilibili.com/player.html?aid=${encodeURIComponent(id.slice(2))}`;
    }
  } catch {
    return null;
  }
  return null;
}

export function MarkdownContent({ body = "", className = "markdown-body", allowHtmlSandbox = true }) {
  const heading = (level) => function Heading({ children, ...props }) {
    const text = Children.toArray(children).join("");
    const Tag = `h${level}`;
    return <Tag id={headingSlug(text)} {...props}>{children}</Tag>;
  };

  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          h2: heading(2),
          h3: heading(3),
          a({ href = "", title, children, ...props }) {
            const label = Children.toArray(children).join("").trim();
            if (videoFileURL(href)) {
              return <figure className="embedded-media"><video controls playsInline preload="metadata" src={href} /><figcaption>{label}</figcaption></figure>;
            }
            if (/^embed(?:\s*:.*)?$/i.test(label)) {
              const embedURL = resolveEmbedURL(href);
              if (embedURL) {
                return <figure className="embedded-media embedded-media-frame"><iframe src={embedURL} title={title || label || "Embedded video"} loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerPolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-presentation" allowFullScreen /><figcaption>{title || label}</figcaption></figure>;
              }
            }
            return <a href={href} title={title} target="_blank" rel="noreferrer noopener" {...props}>{children}</a>;
          },
          img({ src, alt, ...props }) {
            return <figure className="embedded-media"><img src={src} alt={alt ?? ""} loading="lazy" {...props} />{alt ? <figcaption>{alt}</figcaption> : null}</figure>;
          },
          pre({ children, ...props }) {
            const child = Children.count(children) === 1 ? Children.only(children) : null;
            if (allowHtmlSandbox && child?.props?.className === "language-html-sandbox") {
              const source = String(child.props.children ?? "").replace(/\n$/, "");
              return <iframe className="knowledge-sandbox" title="Interactive HTML example" sandbox="allow-scripts" srcDoc={safeHtmlDocument(source)} />;
            }
            return <pre {...props}>{children}</pre>;
          },
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
