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

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (!selected) return;
    const arr = Array.from(selected);
    if (arr.length > 800) {
      setErrorMessage("Maximum 800 fichiers autorisés.");
      return;
    }
    setFiles(arr);
    setErrorMessage("");
    setBadFiles([]);
    setTotalBad(0);
    setResultInfo(null);
    setStatus("idle");
  }, []);

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

      // Extract metadata from headers
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
          // ignore parse errors
        }
      }

      setResultInfo({ pages: totalPages, sheets });

      // Download the PDF
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
      setStatusMessage(`Terminé ! ${filename} téléchargé.`);
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Erreur réseau.");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Imposition PDF 8-up
        </h1>
        <p className="text-gray-600 mb-8">
          Uploadez vos fichiers PDF pour générer un document imposé (8 pages par feuille).
        </p>

        {/* Upload Zone */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Fichiers PDF
          </label>
          <div
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />
            <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
              <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="mt-2 text-sm text-gray-600">
              Cliquez pour sélectionner des fichiers PDF
            </p>
            <p className="text-xs text-gray-400">
              Maximum 800 fichiers
            </p>
          </div>

          {/* File List */}
          {files.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">
                  {files.length} fichier{files.length > 1 ? "s" : ""} sélectionné{files.length > 1 ? "s" : ""}
                </span>
                <button
                  onClick={() => {
                    setFiles([]);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="text-sm text-red-600 hover:text-red-800"
                >
                  Tout supprimer
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto border rounded divide-y">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <svg className="h-4 w-4 text-red-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M4 18h12a2 2 0 002-2V6l-4-4H4a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className="truncate text-gray-800">{f.name}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-2">
                      <span className="text-gray-400">{formatSize(f.size)}</span>
                      <button
                        onClick={() => removeFile(i)}
                        className="text-gray-400 hover:text-red-600"
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
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Options</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Format papier</label>
              <select
                value={paper}
                onChange={(e) => setPaper(e.target.value)}
                className="w-full rounded border-gray-300 border px-3 py-2 text-sm bg-white"
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
                className="w-full rounded border-gray-300 border px-3 py-2 text-sm bg-white"
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
                className="w-full rounded border-gray-300 border px-3 py-2 text-sm bg-white"
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
                className="w-full rounded border-gray-300 border px-3 py-2 text-sm"
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
                className="w-full rounded border-gray-300 border px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={handleSubmit}
            disabled={files.length === 0 || status === "uploading" || status === "processing"}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {status === "uploading" || status === "processing" ? (
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

          {status === "done" && (
            <span className="text-green-600 font-medium">{statusMessage}</span>
          )}
        </div>

        {/* Result Info */}
        {resultInfo && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <h3 className="text-green-800 font-medium mb-1">Imposition réussie</h3>
            <p className="text-green-700 text-sm">
              {resultInfo.pages} page{resultInfo.pages > 1 ? "s" : ""} source &rarr;{" "}
              {resultInfo.sheets} feuille{resultInfo.sheets > 1 ? "s" : ""} imposée{resultInfo.sheets > 1 ? "s" : ""}
            </p>
          </div>
        )}

        {/* Error */}
        {errorMessage && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <h3 className="text-red-800 font-medium mb-1">Erreur</h3>
            <p className="text-red-700 text-sm">{errorMessage}</p>
          </div>
        )}

        {/* Bad files report */}
        {badFiles.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <h3 className="text-yellow-800 font-medium mb-2">
              {totalBad} fichier{totalBad > 1 ? "s" : ""} ignoré{totalBad > 1 ? "s" : ""}
            </h3>
            <ul className="text-sm text-yellow-700 space-y-1">
              {badFiles.map((bf, i) => (
                <li key={i}>
                  <span className="font-mono">{bf.path}</span> &mdash; {bf.error}
                </li>
              ))}
            </ul>
            {totalBad > badFiles.length && (
              <p className="text-xs text-yellow-600 mt-2">
                ... et {totalBad - badFiles.length} autre{totalBad - badFiles.length > 1 ? "s" : ""}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
