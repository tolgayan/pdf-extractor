const zipInput = document.getElementById("zip-input");
const dropZone = document.getElementById("drop-zone");
const statusEl = document.getElementById("status");
const fileNameEl = document.getElementById("file-name");
const htmlFrame = document.getElementById("html-frame");
const pdfPreview = document.getElementById("pdf-preview");
const emptyPreview = document.getElementById("empty-preview");
const shareButton = document.getElementById("share-button");
const downloadLink = document.getElementById("download-link");
const pasteButton = document.getElementById("paste-button");
const pasteTarget = document.getElementById("paste-target");

let currentPdfBlob = null;
let currentPdfUrl = null;
let currentPdfName = "fatura.pdf";

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const PAGE_MARGIN_MM = 8;
const RENDER_WAIT_MS = 900;

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      // The app still works without offline caching.
    });
  });
}

zipInput.addEventListener("change", () => {
  const file = zipInput.files?.[0];
  if (file) {
    convertZip(file);
  }
});

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("is-dragging");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("is-dragging");
});

dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("is-dragging");
  const file = event.dataTransfer?.files?.[0];
  if (isZipFile(file)) {
    convertZip(file);
  } else if (file) {
    setStatus("Lutfen .zip dosyasi sec.", true);
  }
});

pasteButton.addEventListener("click", async () => {
  setStatus("Zip'i yapistirmayi dene. iPhone'da izin sorarsa izin ver.");

  const clipboardFile = await readZipFromClipboard();
  if (clipboardFile) {
    convertZip(clipboardFile);
    return;
  }

  pasteTarget.focus();
});

pasteTarget.addEventListener("paste", (event) => {
  const file = findZipInFileList(event.clipboardData?.files);
  if (file) {
    event.preventDefault();
    convertZip(file);
    return;
  }

  const itemFile = findZipInClipboardItems(event.clipboardData?.items);
  if (itemFile) {
    event.preventDefault();
    convertZip(itemFile);
    return;
  }

  setStatus("Clipboard icinde zip dosyasi gorunmedi. WhatsApp'tan once Dosyalara Kaydet gerekebilir.", true);
});

shareButton.addEventListener("click", async () => {
  if (!currentPdfBlob) return;

  const pdfFile = new File([currentPdfBlob], currentPdfName, { type: "application/pdf" });
  if (navigator.canShare?.({ files: [pdfFile] })) {
    await navigator.share({ files: [pdfFile], title: currentPdfName });
    return;
  }

  downloadLink.click();
});

async function convertZip(file) {
  resetOutput();
  setStatus("Zip okunuyor...");
  fileNameEl.textContent = file.name;

  try {
    ensureLibraries();
    const zip = await JSZip.loadAsync(file);
    const htmlEntry = findHtmlEntry(zip);

    if (!htmlEntry) {
      throw new Error("Zip icinde HTML dosyasi bulunamadi.");
    }

    setStatus(`HTML bulundu: ${htmlEntry.name}`);
    fileNameEl.textContent = htmlEntry.name;

    const html = await htmlEntry.async("string");
    setStatus("HTML render ediliyor...");
    await loadHtmlIntoFrame(html, htmlEntry.name);

    setStatus("PDF olusturuluyor...");
    const pdfBlob = await renderFrameToPdf(htmlEntry.name);
    publishPdf(pdfBlob, htmlEntry.name);
    setStatus("PDF hazir. Paylasabilir veya indirebilirsin.");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "PDF olusturulamadi.", true);
  }
}

async function readZipFromClipboard() {
  if (!navigator.clipboard?.read) {
    return null;
  }

  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const zipType = item.types.find((type) => type === "application/zip" || type === "application/x-zip-compressed");
      if (zipType) {
        const blob = await item.getType(zipType);
        return new File([blob], "clipboard.zip", { type: blob.type || "application/zip" });
      }
    }
  } catch (error) {
    console.warn("Clipboard read failed", error);
  }

  return null;
}

function findZipInFileList(files) {
  return Array.from(files || []).find(isZipFile) || null;
}

function findZipInClipboardItems(items) {
  const item = Array.from(items || []).find((clipboardItem) => {
    return clipboardItem.kind === "file" && isZipLike(clipboardItem.type);
  });

  return item?.getAsFile?.() || null;
}

function isZipFile(file) {
  return Boolean(file && (isZipLike(file.type) || file.name?.toLowerCase().endsWith(".zip")));
}

function isZipLike(type) {
  return type === "application/zip" || type === "application/x-zip-compressed";
}

function ensureLibraries() {
  if (!window.JSZip || !window.html2canvas || !window.jspdf?.jsPDF) {
    throw new Error("PDF kutuphaneleri yuklenemedi. Internet baglantisini kontrol edip sayfayi yenile.");
  }
}

function findHtmlEntry(zip) {
  const entries = Object.values(zip.files)
    .filter((entry) => !entry.dir && entry.name.toLowerCase().endsWith(".html"))
    .sort((a, b) => a.name.localeCompare(b.name));

  return entries[0] || null;
}

async function loadHtmlIntoFrame(html, entryName) {
  const normalizedHtml = addBaseElement(html, entryName);
  await new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("HTML yuklenirken zaman asimi olustu.")), 10000);
    htmlFrame.onload = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    htmlFrame.srcdoc = normalizedHtml;
  });

  await waitForFrameAssets();
  await delay(RENDER_WAIT_MS);
}

function addBaseElement(html, entryName) {
  const baseHref = entryName.includes("/") ? entryName.slice(0, entryName.lastIndexOf("/") + 1) : "";
  const base = `<base href="${escapeHtml(baseHref)}">`;

  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${base}`);
  }

  return `${base}${html}`;
}

async function waitForFrameAssets() {
  const doc = htmlFrame.contentDocument;
  if (!doc) {
    throw new Error("HTML onizlemesi acilamadi.");
  }

  if (doc.fonts?.ready) {
    await doc.fonts.ready.catch(() => {});
  }

  const images = Array.from(doc.images || []);
  await Promise.all(images.map((image) => {
    if (image.complete) return Promise.resolve();
    return new Promise((resolve) => {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", resolve, { once: true });
    });
  }));
}

async function renderFrameToPdf(entryName) {
  const doc = htmlFrame.contentDocument;
  const body = doc?.body;
  if (!body) {
    throw new Error("HTML govdesi okunamadi.");
  }

  const content = findMainContent(body);
  const width = Math.max(content.scrollWidth, content.offsetWidth, 800);
  const height = Math.max(content.scrollHeight, content.offsetHeight, body.scrollHeight);

  htmlFrame.style.width = `${Math.max(width + 40, 980)}px`;
  htmlFrame.style.height = `${Math.max(height + 40, 1200)}px`;
  await delay(100);

  const canvas = await html2canvas(content, {
    backgroundColor: "#ffffff",
    scale: Math.min(window.devicePixelRatio || 2, 2),
    useCORS: true,
    windowWidth: Math.max(width + 40, 980),
    windowHeight: Math.max(height + 40, 1200)
  });

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF("p", "mm", "a4", true);
  const usableWidth = A4_WIDTH_MM - PAGE_MARGIN_MM * 2;
  const usableHeight = A4_HEIGHT_MM - PAGE_MARGIN_MM * 2;
  const pxPerMm = canvas.width / usableWidth;
  const pageHeightPx = Math.floor(usableHeight * pxPerMm);
  let renderedHeight = 0;
  let pageIndex = 0;

  while (renderedHeight < canvas.height) {
    if (pageIndex > 0) {
      pdf.addPage();
    }

    const sliceHeight = Math.min(pageHeightPx, canvas.height - renderedHeight);
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = sliceHeight;
    const context = pageCanvas.getContext("2d");
    context.drawImage(canvas, 0, renderedHeight, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

    const imageData = pageCanvas.toDataURL("image/jpeg", 0.94);
    const imageHeightMm = sliceHeight / pxPerMm;
    pdf.addImage(imageData, "JPEG", PAGE_MARGIN_MM, PAGE_MARGIN_MM, usableWidth, imageHeightMm);

    renderedHeight += sliceHeight;
    pageIndex += 1;
  }

  currentPdfName = `${entryName.replace(/.*\//, "").replace(/\.html?$/i, "")}.pdf`;
  return pdf.output("blob");
}

function findMainContent(body) {
  const fixedWidthTables = Array.from(body.querySelectorAll("table[width='800'], table[width='800px']"));
  if (fixedWidthTables.length > 0) {
    return body;
  }

  return body;
}

function publishPdf(blob) {
  currentPdfBlob = blob;
  if (currentPdfUrl) {
    URL.revokeObjectURL(currentPdfUrl);
  }

  currentPdfUrl = URL.createObjectURL(blob);
  pdfPreview.src = currentPdfUrl;
  downloadLink.href = currentPdfUrl;
  downloadLink.download = currentPdfName;
  downloadLink.classList.remove("disabled");
  downloadLink.removeAttribute("aria-disabled");
  shareButton.disabled = false;
  emptyPreview.classList.add("is-hidden");
}

function resetOutput() {
  currentPdfBlob = null;
  if (currentPdfUrl) {
    URL.revokeObjectURL(currentPdfUrl);
  }
  currentPdfUrl = null;
  currentPdfName = "fatura.pdf";
  pdfPreview.removeAttribute("src");
  shareButton.disabled = true;
  downloadLink.removeAttribute("href");
  downloadLink.classList.add("disabled");
  downloadLink.setAttribute("aria-disabled", "true");
  emptyPreview.classList.remove("is-hidden");
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
