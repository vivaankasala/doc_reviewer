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
const resultFilename = document.getElementById("resultFilename");
const exportBtn = document.getElementById("exportBtn");
const newDocBtn = document.getElementById("newDocBtn");
const errorMessage = document.getElementById("errorMessage");
const retryBtn = document.getElementById("retryBtn");

let lastFile = null;

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

async function analyze(file) {
  lastFile = file;
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

    summaryList.innerHTML = "";
    data.summary.summary.forEach((bullet) => {
      const li = document.createElement("li");
      li.textContent = bullet;
      summaryList.appendChild(li);
    });

    documentTypeEl.textContent = data.summary.document_type
      ? `Document type: ${data.summary.document_type}`
      : "";

    risksList.innerHTML = "";
    if (data.summary.flagged_risks?.length) {
      risksCard.classList.remove("hidden");
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
      risksCard.classList.add("hidden");
    }

    resultFilename.textContent = data.filename || "Document Summary";
    show(resultsSection);
  } catch (err) {
    setError(err.message || "Something went wrong");
  }
}

async function exportSummary() {
  if (!lastFile) return;
  const formData = new FormData();
  formData.append("file", lastFile);

  try {
    const res = await fetch(`${API_BASE}/api/export/summary`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) throw new Error("Export failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "document-summary.txt";
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    setError(err.message || "Export failed");
  }
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
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

newDocBtn.addEventListener("click", () => {
  lastFile = null;
  fileInput.value = "";
  show(uploadSection);
});

retryBtn.addEventListener("click", () => {
  show(uploadSection);
});

function isSupported(name) {
  const ext = (name || "").toLowerCase().split(".").pop();
  return ["pdf", "docx", "png", "jpg", "jpeg", "tiff", "bmp"].includes(ext);
}
