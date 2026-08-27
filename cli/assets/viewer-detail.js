import { colorOf, documentName, resolveRelativeDocumentPath, STATUS_COLOR, worstStatus } from "./viewer-model.js";

const ALLOWED_TAGS = new Set([
  "A", "BLOCKQUOTE", "BR", "CODE", "DEL", "EM", "H1", "H2", "H3", "H4", "H5", "H6",
  "HR", "IMG", "LI", "OL", "P", "PRE", "STRONG", "TABLE", "TBODY", "TD", "TH", "THEAD", "TR", "UL"
]);
const DROP_TAGS = new Set(["EMBED", "FORM", "IFRAME", "INPUT", "LINK", "META", "OBJECT", "SCRIPT", "STYLE"]);

export function createDetailRenderer({ panel, container, onSelectDocument, getState }) {
  let activeRequest = null;

  function showPlaceholder(message = "选择一个 topic 或文档查看详情") {
    activeRequest?.abort();
    const placeholder = element("div", "placeholder", message);
    container.replaceChildren(placeholder);
    panel.classList.remove("open");
  }

  function showTopic(topic, state, topicColors) {
    activeRequest?.abort();
    const documents = state.nodes.filter((node) => node.topic === topic);
    const title = element("h2");
    const swatch = element("span", "swatch");
    swatch.style.backgroundColor = colorOf(topicColors, topic);
    swatch.style.width = "12px";
    swatch.style.height = "12px";
    swatch.style.marginRight = "7px";
    title.append(swatch, `${topic}/`);

    const tokenCount = documents.reduce((sum, node) => sum + node.estimatedTokens, 0);
    const description = element(
      "div",
      "desc",
      `${documents.length} docs · ~${tokenCount} tokens · 状态最差 ${worstStatus(documents)}`
    );
    const cards = documents.map((node) => {
      const card = element("button", "topic-doc-card");
      card.type = "button";
      card.addEventListener("click", () => onSelectDocument(node.path));
      const cardTitle = element("span", "title");
      const dot = element("span", "dot");
      dot.style.backgroundColor = STATUS_COLOR[node.status];
      cardTitle.append(dot, documentName(node.path), element("span", "kind", node.kind));
      card.append(cardTitle, element("span", "description", node.description));
      return card;
    });
    container.replaceChildren(title, description, ...cards);
    openPanel();
  }

  async function showDocument(path, state) {
    activeRequest?.abort();
    activeRequest = new AbortController();
    const request = activeRequest;
    container.replaceChildren(element("div", "placeholder", "正在加载文档…"));
    openPanel();

    try {
      const response = await fetch(`/api/doc?path=${encodeURIComponent(path)}`, { signal: request.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const documentData = await response.json();
      if (request !== activeRequest) return;
      renderDocument(path, documentData, state);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      const message = error instanceof Error ? error.message : String(error);
      container.replaceChildren(element("div", "placeholder", `加载失败：${message}`));
    }
  }

  function renderDocument(path, documentData, state) {
    const node = state.nodes.find((item) => item.path === path);
    const frontmatter = documentData.frontmatter ?? {};
    const title = element("h2", null, path);
    const description = element("div", "desc", frontmatter.description ?? "");
    const meta = element("div", "meta-row");
    meta.append(
      element("span", "chip", frontmatter.kind ?? "?"),
      statusChip(node?.status ?? "fresh"),
      element("span", "chip", `~${documentData.estimatedTokens} tokens · ${documentData.lineCount} lines`)
    );

    const content = [title, description, meta];
    const relations = frontmatter.relations ?? {};
    const requires = relationBlock("requires", relations.requires);
    const related = relationBlock("related", relations.related);
    if (requires) content.push(requires);
    if (related) content.push(related);

    const codePaths = frontmatter.code?.paths ?? [];
    if (codePaths.length) {
      const paths = element("div", "meta-row");
      paths.append(...codePaths.map((codePath) => element("span", "code-path", codePath)));
      content.push(paths);
    }

    const body = element("div");
    body.id = "doc-body";
    renderMarkdown(body, documentData.body ?? "", path, getState(), onSelectDocument);
    content.push(body);
    container.replaceChildren(...content);
    panel.scrollTop = 0;
  }

  function relationBlock(label, targets) {
    if (!targets?.length) return null;
    const block = element("div", "rel-block");
    const heading = element("b", null, `${label}: `);
    block.append(heading);
    targets.forEach((target, index) => {
      if (index > 0) block.append(" · ");
      const link = element("button", "rel-link", target);
      link.type = "button";
      link.addEventListener("click", () => onSelectDocument(target));
      block.append(link);
    });
    return block;
  }

  function openPanel() {
    panel.classList.add("open");
  }

  function closePanel() {
    panel.classList.remove("open");
  }

  return { showPlaceholder, showTopic, showDocument, closePanel };
}

function statusChip(status) {
  const chip = element("span", "chip", status);
  chip.style.color = STATUS_COLOR[status] ?? STATUS_COLOR.fresh;
  return chip;
}

function renderMarkdown(target, source, documentPath, state, onSelectDocument) {
  const normalized = replaceCodeReferences(String(source));
  let rendered;
  try {
    rendered = window.marked.parse(normalized);
  } catch {
    const fallback = element("pre", null, source);
    target.replaceChildren(fallback);
    return;
  }

  const template = document.createElement("template");
  template.innerHTML = rendered;
  sanitizeFragment(template.content);
  for (const code of template.content.querySelectorAll("code")) {
    if (code.textContent.startsWith("⌁ ")) code.classList.add("coderef");
  }
  for (const link of template.content.querySelectorAll("a[href]")) {
    const href = link.getAttribute("href") ?? "";
    if (/^(https?:|mailto:)/i.test(href)) {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      continue;
    }
    if (href.startsWith("#")) continue;
    const targetPath = resolveRelativeDocumentPath(documentPath, href);
    if (state.nodes.some((node) => node.path === targetPath)) {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        onSelectDocument(targetPath);
      });
    }
  }
  target.replaceChildren(template.content);
}

function replaceCodeReferences(source) {
  return source.replace(/<CodeRef\s+([^>]*?)\/>/g, (_match, attributes) => {
    const path = /path="([^"]*)"/.exec(attributes)?.[1] ?? "";
    const symbol = /symbol="([^"]*)"/.exec(attributes)?.[1] ?? "";
    const label = `⌁ ${path}${symbol ? ` · ${symbol}` : ""}`.replace(/`/g, "ˋ");
    return `\`${label}\``;
  });
}

function sanitizeFragment(fragment) {
  const elements = [...fragment.querySelectorAll("*")].reverse();
  for (const node of elements) {
    if (DROP_TAGS.has(node.tagName)) {
      node.remove();
      continue;
    }
    if (!ALLOWED_TAGS.has(node.tagName)) {
      node.replaceWith(...node.childNodes);
      continue;
    }
    for (const attribute of [...node.attributes]) {
      if (!isAllowedAttribute(node, attribute.name, attribute.value)) node.removeAttribute(attribute.name);
    }
  }
}

function isAllowedAttribute(node, name, value) {
  const normalized = name.toLowerCase();
  if (node.tagName === "A" && ["href", "title"].includes(normalized)) {
    return normalized !== "href" || isSafeUrl(value);
  }
  if (node.tagName === "IMG" && ["src", "alt", "title"].includes(normalized)) {
    return normalized !== "src" || isSafeUrl(value);
  }
  if (["TD", "TH"].includes(node.tagName) && ["colspan", "rowspan"].includes(normalized)) {
    return /^\d{1,2}$/.test(value);
  }
  return false;
}

function isSafeUrl(value) {
  const trimmed = value.trim();
  return /^(https?:|mailto:|#|\/|\.\.?\/)/i.test(trimmed) || !/^[a-z][a-z\d+.-]*:/i.test(trimmed);
}

function element(tagName, className, text) {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
