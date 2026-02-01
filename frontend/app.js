const API_BASE = "";

// DOM refs
const uploadSection = document.getElementById("uploadSection");
const uploadZone = document.getElementById("uploadZone");
const fileInput = document.getElementById("fileInput");
const loadingSection = document.getElementById("loadingSection");
const resultsSection = document.getElementById("resultsSection");
const errorSection = document.getElementById("errorSection");
const summaryList = document.getElementById("summaryList");
const risksList = document.getElementById("risksList");
const questionsList = document.getElementById("questionsList");
const documentTypeEl = document.getElementById("documentType");
const risksCard = document.getElementById("risksCard");
const risksHeading = document.getElementById("risksHeading");
const scoreValue = document.getElementById("scoreValue");
const scoreGaugeFill = document.getElementById("scoreGaugeFill");
const documentCard = document.getElementById("documentCard");
const documentText = document.getElementById("documentText");
const resultFilename = document.getElementById("resultFilename");
const exportBtn = document.getElementById("exportBtn");
const newDocBtn = document.getElementById("newDocBtn");
const errorMessage = document.getElementById("errorMessage");
const retryBtn = document.getElementById("retryBtn");
const statWords = document.getElementById("statWords");
const statType = document.getElementById("statType");
const statRisks = document.getElementById("statRisks");
const docSearch = document.getElementById("docSearch");
const printBtn = document.getElementById("printBtn");
const themeToggle = document.getElementById("themeToggle");
const filterHigh = document.getElementById("filterHigh");
const filterMedium = document.getElementById("filterMedium");
const filterLow = document.getElementById("filterLow");

let lastFile = null;
let lastPastedText = null;
let lastFullText = "";
let lastRisks = [];
let lastData = null;

const inputTabs = document.querySelectorAll(".tab-btn");
const uploadPanel = document.getElementById("uploadPanel");
const pastePanel = document.getElementById("pastePanel");
const pasteTextarea = document.getElementById("pasteTextarea");
const analyzePasteBtn = document.getElementById("analyzePasteBtn");

// Theme
const savedTheme = localStorage.getItem("doc-reviewer-theme") || "light";
document.documentElement.setAttribute("data-theme", savedTheme);

themeToggle?.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("doc-reviewer-theme", next);
});

// Sections
function show(section) {
  [uploadSection, loadingSection, resultsSection, errorSection].forEach((el) =>
    el.classList.add("hidden")
  );
  section.classList.remove("hidden");
}

function setError(msg) {
  errorMessage.textContent = msg;
  show(errorSection);
}

function showToast(msg, type = "success") {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// Display results
function displayResults(data, title, fullText) {
  lastData = data;
  lastFullText = fullText || "";
  lastRisks = data.summary.flagged_risks || [];

  // Summary
  summaryList.innerHTML = "";
  (data.summary.summary || []).forEach((bullet) => {
    const li = document.createElement("li");
    li.textContent = bullet;
    summaryList.appendChild(li);
  });

  documentTypeEl.textContent = data.summary.document_type
    ? `Document type: ${data.summary.document_type}`
    : "";

  // Questions
  const questions = data.summary.questions_to_ask || [];
  const qCard = document.getElementById("questionsCard");
  if (qCard) qCard.classList.toggle("hidden", !questions.length);
  questionsList.innerHTML = "";
  questions.forEach((q) => {
    const li = document.createElement("li");
    li.textContent = q;
    questionsList.appendChild(li);
  });

  // Stats bar
  const wc = data.summary.word_count || 0;
  const rc = lastRisks.length;
  if (statWords) statWords.textContent = wc.toLocaleString();
  if (statType) statType.textContent = data.summary.document_type || "Unknown";
  if (statRisks) statRisks.textContent = rc;

  // Score
  const score = calcScore(lastRisks);
  const color = scoreColor(score);
  if (scoreValue) scoreValue.textContent = score;
  if (scoreValue) scoreValue.style.color = color;
  if (scoreGaugeFill) {
    const circumference = 2 * Math.PI * 52;
    const offset = circumference - (score / 100) * circumference;
    scoreGaugeFill.style.strokeDashoffset = offset;
    scoreGaugeFill.style.stroke = color;
  }
  const label = document.getElementById("scoreLabel");
  if (label) label.textContent = scoreLabelText(score);

  // Risk filter visibility
  const riskFilterCard = document.getElementById("riskFilterCard");
  if (riskFilterCard) riskFilterCard.classList.toggle("hidden", !lastRisks.length);

  // Risks
  risksList.innerHTML = "";
  risksCard.classList.remove("hidden");
  if (lastRisks.length) {
    risksHeading.textContent = `Flagged Risks (${lastRisks.length})`;
    renderRisks();
  } else {
    risksHeading.textContent = "Risk Analysis";
    const noRisks = document.createElement("div");
    noRisks.className = "no-risks";
    noRisks.innerHTML = `No unusual or risky clauses detected in this document.`;
    risksList.appendChild(noRisks);
  }

  resultFilename.textContent = title || "Document Summary";

  // Document
  documentCard.classList.toggle("hidden", !fullText);
  documentText.innerHTML = fullText ? highlightRisksInText(fullText, lastRisks) : "";
  applySearchHighlight();

  show(resultsSection);
}

function renderRisks() {
  const filtered = getFilteredRisks();
  risksList.innerHTML = "";
  filtered.forEach((r, i) => {
    const div = document.createElement("div");
    div.className = `risk-item risk-${r.risk_level}`;
    div.dataset.riskIndex = String(lastRisks.indexOf(r));
    const clause = r.clause || "";
    div.innerHTML = `
      <div class="risk-level">${r.risk_level}</div>
      <div class="risk-description">${escapeHtml(r.description)}</div>
      <div class="risk-clause">${escapeHtml(clause)}</div>
      ${lastFullText ? `<div class="risk-actions"><button type="button" class="btn-jump">View in document</button></div>` : ""}
    `;
    const jumpBtn = div.querySelector(".btn-jump");
    if (jumpBtn) {
      jumpBtn.addEventListener("click", () => jumpToClause(clause));
    }
    risksList.appendChild(div);
  });
}

function getFilteredRisks() {
  const showHigh = filterHigh?.checked !== false;
  const showMedium = filterMedium?.checked !== false;
  const showLow = filterLow?.checked !== false;
  return lastRisks.filter((r) => {
    if (r.risk_level === "high") return showHigh;
    if (r.risk_level === "medium") return showMedium;
    return showLow;
  });
}

function jumpToClause(clause) {
  if (!clause || !documentText) return;
  const marks = documentText.querySelectorAll("mark.risk-highlight");
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();
  const clauseNorm = norm(clause);
  const snippet = clauseNorm.slice(0, 40);
  for (const m of marks) {
    if (norm(m.textContent).includes(snippet) || snippet.includes(norm(m.textContent).slice(0, 30))) {
      m.scrollIntoView({ behavior: "smooth", block: "center" });
      m.classList.add("highlight-search");
      setTimeout(() => m.classList.remove("highlight-search"), 1500);
      return;
    }
  }
  // Fallback: try first mark
  if (marks.length) marks[0].scrollIntoView({ behavior: "smooth", block: "center" });
}

[filterHigh, filterMedium, filterLow].forEach((cb) => {
  cb?.addEventListener("change", () => lastData && renderRisks());
});

// Search - highlight matches in document
function applySearchHighlight() {
  const q = (docSearch?.value || "").trim();
  if (!documentText) return;
  // Remove previous search highlights
  documentText.querySelectorAll("mark.highlight-search").forEach((m) => {
    const txt = document.createTextNode(m.textContent);
    m.parentNode.replaceChild(txt, m);
  });
  documentText.normalize();
  if (!q) return;
  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${esc})`, "gi");
  const walker = document.createTreeWalker(documentText, NodeFilter.SHOW_TEXT, null, false);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => {
    const text = node.textContent;
    const parts = text.split(regex);
    if (parts.length < 2) return;
    const frag = document.createDocumentFragment();
    const matchRegex = new RegExp(`^${esc}$`, "i");
    parts.forEach((part) => {
      if (matchRegex.test(part)) {
        const m = document.createElement("mark");
        m.className = "risk-highlight highlight-search";
        m.textContent = part;
        frag.appendChild(m);
      } else {
        frag.appendChild(document.createTextNode(part));
      }
    });
    node.parentNode.replaceChild(frag, node);
  });
}

docSearch?.addEventListener("input", debounce(() => {
  applySearchHighlight();
}, 300));

docSearch?.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    docSearch.value = "";
    applySearchHighlight();
    docSearch.blur();
  }
});

function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

// Collapsible
document.querySelectorAll(".collapse-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const id = btn.dataset.target;
    const card = document.getElementById(id);
    if (card) card.classList.toggle("collapsed");
  });
});

// Analyze
async function analyze(file) {
  lastFile = file;
  lastPastedText = null;
  show(loadingSection);
  if (docSearch) docSearch.value = "";

  const formData = new FormData();
  formData.append("file", file);

  try {
    const res = await fetch(`${API_BASE}/api/analyze`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const detail = Array.isArray(err.detail) ? err.detail[0]?.msg : err.detail;
      throw new Error(detail || res.statusText || "Analysis failed");
    }

    const data = await res.json();
    displayResults(data, data.filename || "Document Summary", data.full_text || "");
  } catch (err) {
    setError(err.message || "Something went wrong");
  }
}

async function analyzeText(text) {
  lastFile = null;
  lastPastedText = text;
  show(loadingSection);
  if (docSearch) docSearch.value = "";

  try {
    const res = await fetch(`${API_BASE}/api/analyze-text`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const detail = Array.isArray(err.detail) ? err.detail[0]?.msg : err.detail;
      throw new Error(detail || res.statusText || "Analysis failed");
    }

    const data = await res.json();
    displayResults({ summary: data.summary }, `Pasted text (${data.char_count} chars)`, text || "");
  } catch (err) {
    setError(err.message || "Something went wrong");
  }
}

// Export
async function exportSummary() {
  try {
    if (lastFile) {
      const formData = new FormData();
      formData.append("file", lastFile);
      const res = await fetch(`${API_BASE}/api/export/from-file`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const base = (lastFile.name || "document").replace(/\.[^.]+$/, "");
      downloadBlob(blob, `${base}-review.html`);
    } else if (lastPastedText) {
      const res = await fetch(`${API_BASE}/api/export/from-text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: lastPastedText }),
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      downloadBlob(blob, "document-review.txt");
    }
    showToast("Export downloaded");
  } catch (err) {
    showToast(err.message || "Export failed", "error");
  }
}

function downloadBlob(blob, filename = "document-review.txt") {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Print
printBtn?.addEventListener("click", () => {
  window.print();
});

// Utilities
function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s ?? "";
  return div.innerHTML;
}

function normalizeWhitespace(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

function isInsideMark(html, pos) {
  const before = html.substring(0, pos);
  const openCount = (before.match(/<mark\s/g) || []).length;
  const closeCount = (before.match(/<\/mark>/g) || []).length;
  return openCount > closeCount;
}

function highlightRisksInText(text, risks) {
  if (!text) return "";
  let html = escapeHtml(text);

  if (risks.length) {
    const sortedRisks = [...risks].sort((a, b) => (b.clause?.length || 0) - (a.clause?.length || 0));
    sortedRisks.forEach((r) => {
      const clause = (r.clause || "").trim();
      if (clause.length < 5) return;

      const pattern = normalizeWhitespace(clause);
      const escaped = escapeHtml(pattern);
      if (escaped.length < 5) return;

      const regexSource = escaped.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
      try {
        const regex = new RegExp(regexSource, "gi");
        html = html.replace(regex, (match, offset) => {
          if (isInsideMark(html, offset)) return match;
          return `<mark class="risk-highlight risk-${r.risk_level}" title="${escapeHtml(r.description || "")}">${match}</mark>`;
        });
      } catch (_) {}
    });
  }

  return structureAsHtml(html);
}

function structureAsHtml(html) {
  const lines = html.split("\n");
  const result = [];
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const stripped = line.trim();

    if (!stripped) {
      if (inList) {
        result.push("</ul>");
        inList = false;
      }
      result.push("<br>");
      continue;
    }

    if (/^[\s]*(●|•|[-*]|\d+\.)\s/.test(line) || stripped.startsWith("●") || stripped.startsWith("•")) {
      if (!inList) {
        result.push("<ul class='doc-list'>");
        inList = true;
      }
      const content = stripped.replace(/^[\s]*(●|•|[-*]|\d+\.)\s*/, "");
      result.push(`<li class='doc-item'>${content}</li>`);
      continue;
    }

    if (inList) {
      result.push("</ul>");
      inList = false;
    }

    const isMainHeading = i === 0 && stripped.length < 80;
    const isShortHeading = stripped.length < 60 && !stripped.endsWith(".") && stripped[0] && stripped[0] === stripped[0].toUpperCase();
    if (isMainHeading) {
      result.push(`<h2 class='doc-title'>${stripped}</h2>`);
    } else if (isShortHeading) {
      result.push(`<h3 class='doc-heading'>${stripped}</h3>`);
    } else {
      result.push(`<p class='doc-para'>${line}</p>`);
    }
  }

  if (inList) result.push("</ul>");
  return result.join("\n");
}

function calcScore(risks) {
  if (!risks.length) return 100;
  let penalty = 0;
  risks.forEach((r) => {
    if (r.risk_level === "low") penalty += 8;
    else if (r.risk_level === "medium") penalty += 20;
    else penalty += 35;
  });
  return Math.max(0, 100 - penalty);
}

function scoreColor(score) {
  if (score >= 80) return "#16a34a";
  if (score >= 50) return "#ca8a04";
  return "#dc2626";
}

function scoreLabelText(score) {
  if (score >= 90) return "Very safe to sign";
  if (score >= 70) return "Generally safe";
  if (score >= 50) return "Review flagged items";
  return "Exercise caution";
}

// Event listeners
uploadZone?.addEventListener("click", () => fileInput?.click());

uploadZone?.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadZone.classList.add("dragover");
});

uploadZone?.addEventListener("dragleave", () => {
  uploadZone.classList.remove("dragover");
});

uploadZone?.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadZone.classList.remove("dragover");
  const file = e.dataTransfer?.files?.[0];
  if (file && isSupported(file.name)) {
    analyze(file);
  } else {
    setError("Unsupported file type. Use PDF, DOCX, or images.");
  }
});

fileInput?.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) analyze(file);
});

exportBtn?.addEventListener("click", exportSummary);

inputTabs?.forEach((btn) => {
  btn.addEventListener("click", () => {
    inputTabs.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    if (btn.dataset.tab === "upload") {
      uploadPanel?.classList.add("active");
      pastePanel?.classList.remove("active");
    } else {
      pastePanel?.classList.add("active");
      uploadPanel?.classList.remove("active");
    }
  });
});

analyzePasteBtn?.addEventListener("click", () => {
  const text = pasteTextarea?.value?.trim();
  if (!text) {
    setError("Please paste some text to analyze.");
    show(errorSection);
    return;
  }
  analyzeText(text);
});

newDocBtn?.addEventListener("click", () => {
  lastFile = null;
  lastPastedText = null;
  lastData = null;
  lastRisks = [];
  lastFullText = "";
  fileInput.value = "";
  pasteTextarea.value = "";
  if (docSearch) docSearch.value = "";
  show(uploadSection);
});

retryBtn?.addEventListener("click", () => {
  show(uploadSection);
});

function isSupported(name) {
  const ext = (name || "").toLowerCase().split(".").pop();
  return ["pdf", "docx", "png", "jpg", "jpeg", "tiff", "bmp"].includes(ext);
}
