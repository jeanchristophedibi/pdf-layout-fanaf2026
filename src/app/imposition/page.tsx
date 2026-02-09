"use client";

import { useState, useRef, useCallback } from "react";

interface BadFile {
  path: string;
  error: string;
}

type Status = "idle" | "uploading" | "processing" | "done" | "error";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ImpositionPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [paper, setPaper] = useState("A4");
  const [orientation, setOrientation] = useState("landscape");
  const [layout, setLayout] = useState("4x2");
  const [marginMm, setMarginMm] = useState(6.0);
  const [gapMm, setGapMm] = useState(3.0);
  const [status, setStatus] = useState<Status>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [badFiles, setBadFiles] = useState<BadFile[]>([]);
  const [totalBad, setTotalBad] = useState(0);
  const [resultInfo, setResultInfo] = useState<{ pages: number; sheets: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  const addFiles = useCallback((newFiles: File[]) => {
    const pdfFiles = newFiles.filter((f) => f.type === "application/pdf" || f.name.endsWith(".pdf"));
    if (pdfFiles.length === 0) return;
    setFiles((prev) => {
      const combined = [...prev, ...pdfFiles];
      if (combined.length > 800) {
        setErrorMessage("Maximum 800 fichiers autorisés.");
        return prev;
      }
      return combined;
    });
    setErrorMessage("");
    setBadFiles([]);
    setTotalBad(0);
    setResultInfo(null);
    setStatus("idle");
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files;
      if (!selected) return;
      addFiles(Array.from(selected));
      if (e.target) e.target.value = "";
    },
    [addFiles]
  );

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setIsDragging(false);
      if (e.dataTransfer.files) {
        addFiles(Array.from(e.dataTransfer.files));
      }
    },
    [addFiles]
  );

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = async () => {
    if (files.length === 0) {
      setErrorMessage("Veuillez sélectionner au moins un fichier PDF.");
      return;
    }

    setStatus("uploading");
    setStatusMessage("Upload des fichiers...");
    setErrorMessage("");
    setBadFiles([]);
    setTotalBad(0);
    setResultInfo(null);

    try {
      const formData = new FormData();
      files.forEach((f) => formData.append("files", f));
      formData.append("paper", paper);
      formData.append("orientation", orientation);
      formData.append("layout", layout);
      formData.append("margin_mm", String(marginMm));
      formData.append("gap_mm", String(gapMm));

      setStatus("processing");
      setStatusMessage("Imposition en cours...");

      const response = await fetch("/api/impose-8up", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        setStatus("error");
        setErrorMessage(errorData.error || "Erreur lors du traitement.");
        if (errorData.bad_files) {
          setBadFiles(errorData.bad_files);
          setTotalBad(errorData.total_bad || 0);
        }
        return;
      }

      const totalPages = parseInt(response.headers.get("X-Total-Pages") || "0", 10);
      const sheets = parseInt(response.headers.get("X-Sheets") || "0", 10);
      const badFilesHeader = response.headers.get("X-Bad-Files");
      const totalBadHeader = parseInt(response.headers.get("X-Total-Bad") || "0", 10);

      if (badFilesHeader) {
        try {
          const parsed = JSON.parse(badFilesHeader) as BadFile[];
          if (parsed.length > 0) {
            setBadFiles(parsed);
            setTotalBad(totalBadHeader);
          }
        } catch {
          // ignore
        }
      }

      setResultInfo({ pages: totalPages, sheets });

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") || "";
      const filenameMatch = disposition.match(/filename="(.+)"/);
      const filename = filenameMatch ? filenameMatch[1] : "LOT_output.pdf";

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setStatus("done");
      setStatusMessage(filename);
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Erreur réseau.");
    }
  };

  const isProcessing = status === "uploading" || status === "processing";

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 py-10 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="animate-fade-in-up mb-10">
          <h1 className="text-3xl font-bold text-gray-900 mb-1 tracking-tight">
            Imposition PDF 8-up
          </h1>
          <p className="text-gray-500">
            Uploadez vos fichiers PDF pour générer un document imposé (8 pages par feuille).
          </p>
        </div>

        {/* Upload Zone */}
        <div
          className="animate-fade-in-up bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6"
          style={{ animationDelay: "0.05s" }}
        >
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Fichiers PDF
          </label>
          <div
            className={`
              relative border-2 border-dashed rounded-xl p-10 text-center cursor-pointer
              transition-all duration-300 ease-out
              ${
                isDragging
                  ? "border-blue-500 bg-blue-50 scale-[1.01] drop-zone-active"
                  : "border-gray-300 hover:border-blue-400 hover:bg-blue-50/30"
              }
            `}
            onClick={() => fileInputRef.current?.click()}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />
            <div className={`transition-transform duration-300 ${isDragging ? "scale-110" : ""}`}>
              <svg
                className={`mx-auto h-12 w-12 transition-colors duration-300 ${isDragging ? "text-blue-500" : "text-gray-400"}`}
                stroke="currentColor"
                fill="none"
                viewBox="0 0 48 48"
              >
                <path
                  d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <p className="mt-3 text-sm text-gray-600">
              {isDragging
                ? "Relacher pour ajouter les fichiers"
                : "Cliquez ou glissez-déposez vos fichiers PDF"}
            </p>
            <p className="text-xs text-gray-400 mt-1">Maximum 800 fichiers</p>
          </div>

          {/* File List */}
          {files.length > 0 && (
            <div className="mt-4 animate-fade-in">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">
                  {files.length} fichier{files.length > 1 ? "s" : ""} sélectionné
                  {files.length > 1 ? "s" : ""}
                  <span className="text-gray-400 font-normal ml-2">
                    ({formatSize(files.reduce((s, f) => s + f.size, 0))} total)
                  </span>
                </span>
                <button
                  onClick={() => {
                    setFiles([]);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="text-sm text-red-500 hover:text-red-700 transition-colors"
                >
                  Tout supprimer
                </button>
              </div>
              <div className="max-h-52 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                {files.map((f, i) => (
                  <div
                    key={`${f.name}-${i}`}
                    className="flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 transition-colors animate-slide-in-right"
                    style={{ animationDelay: `${Math.min(i * 0.03, 0.5)}s` }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <svg className="h-4 w-4 text-red-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M4 18h12a2 2 0 002-2V6l-4-4H4a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className="truncate text-gray-800">{f.name}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-2">
                      <span className="text-gray-400 text-xs">{formatSize(f.size)}</span>
                      <button
                        onClick={() => removeFile(i)}
                        className="text-gray-300 hover:text-red-500 transition-colors"
                      >
                        &times;
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Options */}
        <div
          className="animate-fade-in-up bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6"
          style={{ animationDelay: "0.1s" }}
        >
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Options</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Format papier</label>
              <select
                value={paper}
                onChange={(e) => setPaper(e.target.value)}
                className="w-full rounded-lg border-gray-300 border px-3 py-2 text-sm bg-white transition-shadow focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
              >
                <option value="A4">A4</option>
                <option value="A3">A3</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Orientation</label>
              <select
                value={orientation}
                onChange={(e) => setOrientation(e.target.value)}
                className="w-full rounded-lg border-gray-300 border px-3 py-2 text-sm bg-white transition-shadow focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
              >
                <option value="landscape">Paysage</option>
                <option value="portrait">Portrait</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Layout</label>
              <select
                value={layout}
                onChange={(e) => setLayout(e.target.value)}
                className="w-full rounded-lg border-gray-300 border px-3 py-2 text-sm bg-white transition-shadow focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
              >
                <option value="4x2">4 x 2</option>
                <option value="2x4">2 x 4</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Marge (mm)</label>
              <input
                type="number"
                value={marginMm}
                onChange={(e) => setMarginMm(parseFloat(e.target.value) || 0)}
                min={0}
                max={50}
                step={0.5}
                className="w-full rounded-lg border-gray-300 border px-3 py-2 text-sm transition-shadow focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Gap (mm)</label>
              <input
                type="number"
                value={gapMm}
                onChange={(e) => setGapMm(parseFloat(e.target.value) || 0)}
                min={0}
                max={50}
                step={0.5}
                className="w-full rounded-lg border-gray-300 border px-3 py-2 text-sm transition-shadow focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="animate-fade-in-up flex items-center gap-4 mb-6" style={{ animationDelay: "0.15s" }}>
          <button
            onClick={handleSubmit}
            disabled={files.length === 0 || isProcessing}
            className={`
              relative px-7 py-3 rounded-xl font-medium text-white overflow-hidden
              transition-all duration-300 ease-out
              ${
                isProcessing
                  ? "bg-blue-600 animate-shimmer"
                  : "bg-blue-600 hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-500/25 active:scale-[0.97]"
              }
              disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none
            `}
          >
            {isProcessing ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {statusMessage}
              </span>
            ) : (
              "Générer le PDF"
            )}
          </button>
        </div>

        {/* Result Info */}
        {resultInfo && (
          <div className="animate-scale-in bg-green-50 border border-green-200 rounded-xl p-5 mb-6">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 h-8 w-8 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h3 className="text-green-800 font-semibold">Imposition réussie</h3>
                <p className="text-green-700 text-sm mt-0.5">
                  {resultInfo.pages} page{resultInfo.pages > 1 ? "s" : ""} source &rarr;{" "}
                  {resultInfo.sheets} feuille{resultInfo.sheets > 1 ? "s" : ""} imposée
                  {resultInfo.sheets > 1 ? "s" : ""}
                </p>
                {status === "done" && (
                  <p className="text-green-600 text-xs mt-1 animate-fade-in">
                    {statusMessage} téléchargé
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {errorMessage && (
          <div className="animate-scale-in bg-red-50 border border-red-200 rounded-xl p-5 mb-6">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 h-8 w-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <div>
                <h3 className="text-red-800 font-semibold">Erreur</h3>
                <p className="text-red-700 text-sm mt-0.5">{errorMessage}</p>
              </div>
            </div>
          </div>
        )}

        {/* Bad files report */}
        {badFiles.length > 0 && (
          <div className="animate-scale-in bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
              </div>
              <div className="min-w-0">
                <h3 className="text-amber-800 font-semibold">
                  {totalBad} fichier{totalBad > 1 ? "s" : ""} ignoré{totalBad > 1 ? "s" : ""}
                </h3>
                <ul className="text-sm text-amber-700 mt-1 space-y-0.5">
                  {badFiles.map((bf, i) => (
                    <li key={i} className="animate-fade-in" style={{ animationDelay: `${i * 0.05}s` }}>
                      <span className="font-mono text-xs">{bf.path}</span> &mdash; {bf.error}
                    </li>
                  ))}
                </ul>
                {totalBad > badFiles.length && (
                  <p className="text-xs text-amber-600 mt-2">
                    ... et {totalBad - badFiles.length} autre{totalBad - badFiles.length > 1 ? "s" : ""}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
