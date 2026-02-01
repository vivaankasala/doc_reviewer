const API_BASE = "";

const uploadSection = document.getElementById("uploadSection");
const uploadZone = document.getElementById("uploadZone");
const fileInput = document.getElementById("fileInput");
const loadingSection = document.getElementById("loadingSection");
const resultsSection = document.getElementById("resultsSection");
const errorSection = document.getElementById("errorSection");
const summaryList = document.getElementById("summaryList");
const risksList = document.getElementById("risksList");
const documentTypeEl = document.getElementById("documentType");
const risksCard = document.getElementById("risksCard");
const risksHeading = document.getElementById("risksHeading");
const scoreValue = document.getElementById("scoreValue");
const scoreGaugeFill = document.getElementById("scoreGaugeFill");
const scoreLabel = document.getElementById("scoreLabel");
const resultFilename = document.getElementById("resultFilename");
const exportBtn = document.getElementById("exportBtn");
const newDocBtn = document.getElementById("newDocBtn");
const errorMessage = document.getElementById("errorMessage");
const retryBtn = document.getElementById("retryBtn");

let lastFile = null;
let lastPastedText = null;

const inputTabs = document.querySelectorAll(".tab-btn");
const uploadPanel = document.getElementById("uploadPanel");
const pastePanel = document.getElementById("pastePanel");
const pasteTextarea = document.getElementById("pasteTextarea");
const analyzePasteBtn = document.getElementById("analyzePasteBtn");

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

function displayResults(data, title) {
  summaryList.innerHTML = "";
  data.summary.summary.forEach((bullet) => {
      const li = document.createElement("li");
      li.textContent = bullet;
      summaryList.appendChild(li);
    });

    documentTypeEl.textContent = data.summary.document_type
      ? `Document type: ${data.summary.document_type}`
      : "";

    const score = calcScore(data.summary.flagged_risks || []);
    const color = scoreColor(score);
    scoreValue.textContent = score;
    scoreValue.style.color = color;
    scoreGaugeFill.style.background = `conic-gradient(
      ${color} 0deg ${score * 3.6}deg,
      var(--border) ${score * 3.6}deg 360deg
    )`;
    scoreLabel.textContent = scoreLabelText(score);

    risksList.innerHTML = "";
    risksCard.classList.remove("hidden");
    if (data.summary.flagged_risks?.length) {
      risksHeading.textContent = "⚠️ Flagged Risks";
      data.summary.flagged_risks.forEach((r) => {
        const div = document.createElement("div");
        div.className = `risk-item risk-${r.risk_level}`;
        div.innerHTML = `
          <div class="risk-level">${r.risk_level}</div>
          <div class="risk-description">${escapeHtml(r.description)}</div>
          <div class="risk-clause">${escapeHtml(r.clause)}</div>
        `;
        risksList.appendChild(div);
      });
    } else {
      risksHeading.textContent = "Risk Analysis";
      const noRisks = document.createElement("div");
      noRisks.className = "no-risks";
      noRisks.innerHTML = `<span class="no-risks-icon">&#10003;</span> No unusual or risky clauses detected in this document.`;
      risksList.appendChild(noRisks);
    }

    resultFilename.textContent = title || "Document Summary";
    show(resultsSection);
}

async function analyze(file) {
  lastFile = file;
  lastPastedText = null;
  show(loadingSection);

  const formData = new FormData();
  formData.append("file", file);

  try {
    const res = await fetch(`${API_BASE}/api/analyze`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || res.statusText || "Analysis failed");
    }

    const data = await res.json();
    displayResults(data, data.filename || "Document Summary");
  } catch (err) {
    setError(err.message || "Something went wrong");
  }
}

async function analyzeText(text) {
  lastFile = null;
  lastPastedText = text;
  show(loadingSection);

  try {
    const res = await fetch(`${API_BASE}/api/analyze-text`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || res.statusText || "Analysis failed");
    }

    const data = await res.json();
    displayResults({ summary: data.summary }, `Pasted text (${data.char_count} chars)`);
  } catch (err) {
    setError(err.message || "Something went wrong");
  }
}

async function exportSummary() {
  try {
    if (lastFile) {
      const formData = new FormData();
      formData.append("file", lastFile);
      const res = await fetch(`${API_BASE}/api/export/summary`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      downloadBlob(blob);
    } else if (lastPastedText) {
      const res = await fetch(`${API_BASE}/api/analyze-text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: lastPastedText }),
      });
      if (!res.ok) throw new Error("Export failed");
      const data = await res.json();
      const content = buildExportContent(data.summary);
      const blob = new Blob([content], { type: "text/plain" });
      downloadBlob(blob);
    }
  } catch (err) {
    setError(err.message || "Export failed");
  }
}

function downloadBlob(blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "document-summary.txt";
  a.click();
  URL.revokeObjectURL(url);
}

function buildExportContent(summary) {
  const lines = ["# Document Summary", "", "## Key Points", ""];
  summary.summary.forEach((b) => lines.push(`- ${b}`));
  lines.push("");
  if (summary.document_type) {
    lines.push(`**Document type:** ${summary.document_type}`);
    lines.push("");
  }
  if (summary.flagged_risks?.length) {
    lines.push("## Flagged Risks", "");
    summary.flagged_risks.forEach((r, i) => {
      lines.push(`### ${i + 1}. [${r.risk_level.toUpperCase()}] ${r.description}`);
      lines.push("");
      lines.push(`> ${r.clause.slice(0, 500)}${r.clause.length > 500 ? "..." : ""}`);
      lines.push("");
    });
  }
  return lines.join("\n");
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
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
  if (score >= 80) return "var(--risk-low)";
  if (score >= 50) return "var(--risk-medium)";
  return "var(--risk-high)";
}

function scoreLabelText(score) {
  if (score >= 90) return "Very safe to sign";
  if (score >= 70) return "Generally safe";
  if (score >= 50) return "Review flagged items";
  return "Exercise caution";
}

uploadZone.addEventListener("click", () => fileInput.click());

uploadZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadZone.classList.add("dragover");
});

uploadZone.addEventListener("dragleave", () => {
  uploadZone.classList.remove("dragover");
});

uploadZone.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadZone.classList.remove("dragover");
  const file = e.dataTransfer?.files?.[0];
  if (file && isSupported(file.name)) {
    analyze(file);
  } else {
    setError("Unsupported file type. Use PDF, DOCX, or images.");
  }
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) analyze(file);
});

exportBtn.addEventListener("click", exportSummary);

inputTabs.forEach((btn) => {
  btn.addEventListener("click", () => {
    inputTabs.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    if (btn.dataset.tab === "upload") {
      uploadPanel.classList.add("active");
      pastePanel.classList.remove("active");
    } else {
      pastePanel.classList.add("active");
      uploadPanel.classList.remove("active");
    }
  });
});

analyzePasteBtn.addEventListener("click", () => {
  const text = pasteTextarea.value?.trim();
  if (!text) {
    setError("Please paste some text to analyze.");
    show(errorSection);
    return;
  }
  analyzeText(text);
});

newDocBtn.addEventListener("click", () => {
  lastFile = null;
  lastPastedText = null;
  fileInput.value = "";
  pasteTextarea.value = "";
  show(uploadSection);
});

retryBtn.addEventListener("click", () => {
  show(uploadSection);
});

function isSupported(name) {
  const ext = (name || "").toLowerCase().split(".").pop();
  return ["pdf", "docx", "png", "jpg", "jpeg", "tiff", "bmp"].includes(ext);
}
