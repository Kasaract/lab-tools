import { useCallback, useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import { post } from "../lib/api";
import { MagnifierImage } from "../components/MagnifierImage";

/** Shape of the JSON response from POST /api/cell-count/run */
interface CellCountResult {
  filename: string;
  positive: number;
  negative: number;
  index: number;
  overlay: string; // base64-encoded PNG
}

/** Each uploaded image gets its own entry with independent analysis state */
interface ImageEntry {
  id: string;
  file: File;
  name: string;
  preview: string;        // object URL for display
  result: CellCountResult | null;
  loading: boolean;
  error: string | null;
}

let nextId = 0;

export function CellCountPage() {
  const [images, setImages] = useState<ImageEntry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dirInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [magnifier, setMagnifier] = useState(false);
  const [zoom, setZoom] = useState(3);
  const zoomLevels = [1, 2, 3, 5];
  const [showMarkers, setShowMarkers] = useState(true);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const renameRef = useRef<HTMLInputElement>(null);

  // Detection settings
  const [settings, setSettings] = useState({
    posThresh: 0.7,
    negThresh: 0.45,
    posMinArea: 30,
    negMinArea: 20,
    posDiskRadius: 2,
    negDiskRadius: 1,
    watershedFootprint: 8,
  });
  const updateSetting = <K extends keyof typeof settings>(key: K, val: typeof settings[K]) =>
    setSettings((s) => ({ ...s, [key]: val }));

  const active = images.find((img) => img.id === activeId) ?? null;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const key = e.key;
      if (key === "1" || key === "2" || key === "3" || key === "5") {
        setZoom(Number(key));
        setMagnifier(true);
      } else if (key === "m") {
        setShowMarkers((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const ARCHIVE_EXTENSIONS = [".tar", ".tar.gz", ".tgz", ".zip"];

  const isArchive = (name: string) =>
    ARCHIVE_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));

  /** Convert a base64 string + filename into a File object */
  const b64toFile = (b64: string, name: string): File => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    return new File([bytes], name, { type: mime });
  };

  /** Add image files directly to the image list */
  const addImageFiles = useCallback((files: File[]) => {
    const newEntries: ImageEntry[] = [];
    for (const f of files) {
      if (!f.type.startsWith("image/")) continue;
      newEntries.push({
        id: String(nextId++),
        file: f,
        name: f.name,
        preview: URL.createObjectURL(f),
        result: null,
        loading: false,
        error: null,
      });
    }
    if (newEntries.length === 0) return;
    setImages((prev) => [...prev, ...newEntries]);
    setActiveId(newEntries[newEntries.length - 1].id);
  }, []);

  /** Handle a mix of image files and archives */
  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const imageFiles: File[] = [];
      const archiveFiles: File[] = [];

      for (const f of Array.from(files)) {
        if (isArchive(f.name)) {
          archiveFiles.push(f);
        } else {
          imageFiles.push(f);
        }
      }

      // Add regular images immediately
      if (imageFiles.length > 0) addImageFiles(imageFiles);

      // Extract images from each archive
      for (const archive of archiveFiles) {
        try {
          const res = await post<{ images: { name: string; data: string }[] }>(
            "/api/upload/extract-archive",
            (() => { const fd = new FormData(); fd.append("file", archive); return fd; })()
          );
          const extracted = res.images.map((img) => b64toFile(img.data, img.name));
          addImageFiles(extracted);
        } catch (err) {
          console.error(`Failed to extract ${archive.name}:`, err);
        }
      }
    },
    [addImageFiles]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.length) addFiles(e.target.files);
      e.target.value = "";
    },
    [addFiles]
  );

  const removeImage = useCallback(
    (id: string) => {
      setImages((prev) => {
        const entry = prev.find((img) => img.id === id);
        if (entry) URL.revokeObjectURL(entry.preview);
        return prev.filter((img) => img.id !== id);
      });
      setActiveId((prev) => {
        if (prev !== id) return prev;
        // Select the previous image, or the next one if removing the first
        const idx = images.findIndex((img) => img.id === id);
        const next = images[idx - 1] ?? images[idx + 1];
        return next?.id ?? null;
      });
    },
    [images]
  );

  /** Update a specific image entry by id */
  const updateImage = useCallback(
    (id: string, patch: Partial<ImageEntry>) =>
      setImages((prev) =>
        prev.map((img) => (img.id === id ? { ...img, ...patch } : img))
      ),
    []
  );

  /** Run analysis on the active image */
  const analyze = useCallback(async () => {
    if (!active) return;
    updateImage(active.id, { loading: true, error: null });
    try {
      const formData = new FormData();
      formData.append("file", active.file);
      formData.append("pos_thresh", String(settings.posThresh));
      formData.append("neg_thresh", String(settings.negThresh));
      formData.append("pos_min_area", String(settings.posMinArea));
      formData.append("neg_min_area", String(settings.negMinArea));
      formData.append("pos_disk_radius", String(settings.posDiskRadius));
      formData.append("neg_disk_radius", String(settings.negDiskRadius));
      formData.append("watershed_footprint", String(settings.watershedFootprint));
      const res = await post<CellCountResult>("/api/cell-count/run", formData);
      updateImage(active.id, { result: res, loading: false });
    } catch (err) {
      updateImage(active.id, {
        error: err instanceof Error ? err.message : "Analysis failed",
        loading: false,
      });
    }
  }, [active, updateImage, settings]);

  const analyzedImages = images.filter((img) => img.result);

  const exportCsv = useCallback(() => {
    if (analyzedImages.length === 0) return;
    const header = "Image Name,Positive,Negative,Index (%)";
    const rows = analyzedImages.map((img) => {
      const r = img.result!;
      return `"${img.name}",${r.positive},${r.negative},${r.index}`;
    });
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cell_count_results.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [analyzedImages]);

  const downloadImage = useCallback((img: ImageEntry) => {
    if (!img.result) return;
    const a = document.createElement("a");
    a.href = `data:image/png;base64,${img.result.overlay}`;
    const baseName = img.name.replace(/\.[^.]+$/, "");
    a.download = `${baseName}_analyzed.png`;
    a.click();
  }, []);

  const exportAllImages = useCallback(async () => {
    if (analyzedImages.length === 0) return;
    const zip = new JSZip();
    for (const img of analyzedImages) {
      const baseName = img.name.replace(/\.[^.]+$/, "");
      zip.file(`${baseName}_analyzed.png`, img.result!.overlay, { base64: true });
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cell_count_images.zip";
    a.click();
    URL.revokeObjectURL(url);
  }, [analyzedImages]);

  const hasImages = images.length > 0;

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex gap-4">
        {/* Main area */}
        <div className="flex-1 min-w-0">
      {!hasImages ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-16 transition h-[75vh] ${
            dragOver
              ? "border-blue-400 bg-blue-50 dark:bg-blue-900/20"
              : "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:border-gray-400 dark:hover:border-gray-500"
          }`}
        >
          <svg
            className="mb-2 h-8 w-8 text-gray-300 dark:text-gray-600"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
            />
          </svg>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Drop images or an archive here, or click to browse
          </p>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            Supports .tar.gz, .zip, or{" "}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); dirInputRef.current?.click(); }}
              className="underline hover:text-gray-600 dark:hover:text-gray-300"
            >
              upload a folder
            </button>
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,.tar,.tar.gz,.tgz,.zip"
            multiple
            onChange={onFileChange}
            className="hidden"
          />
          {/* @ts-expect-error webkitdirectory is non-standard */}
          <input
            ref={dirInputRef}
            type="file"
            webkitdirectory=""
            onChange={onFileChange}
            className="hidden"
          />
        </div>
      ) : (
        <div>
          {/* Active image display */}
          {active && (
            <>
              <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                <MagnifierImage
                  src={
                    active.result && showMarkers
                      ? `data:image/png;base64,${active.result.overlay}`
                      : active.preview
                  }
                  alt={active.name}
                  enabled={magnifier}
                  zoom={zoom}
                />
              </div>

              {/* Compact toolbar */}
              <div className="mt-3 flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500 flex-nowrap">
                <div className="flex items-center gap-1 min-w-0">
                  <button
                    onClick={() => { setRenameValue(active.name); setRenaming(true); setTimeout(() => renameRef.current?.select(), 0); }}
                    className="shrink-0 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                    title="Rename"
                  >
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
                    </svg>
                  </button>
                  {renaming ? (
                    <input
                      ref={renameRef}
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => {
                        const v = renameValue.trim();
                        if (v && v !== active.name) updateImage(active.id, { name: v });
                        setRenaming(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                        if (e.key === "Escape") { setRenaming(false); }
                      }}
                      className="max-w-xs w-full rounded border border-gray-300 dark:border-gray-500 bg-white dark:bg-gray-700 px-1.5 py-0 text-xs text-gray-900 dark:text-gray-100 outline-none focus:border-blue-500"
                    />
                  ) : (
                    <span className="truncate">{active.name}</span>
                  )}
                </div>
                <div className="ml-auto flex items-center gap-2">
                  {active.result && (
                    <div className="flex items-center gap-3 mr-2 text-xs">
                      <span>
                        <span className="inline-block h-2 w-2 rounded-full bg-red-500 mr-1" />
                        {active.result.positive} pos
                      </span>
                      <span>
                        <span className="inline-block h-2 w-2 rounded-full bg-blue-500 mr-1" />
                        {active.result.negative} neg
                      </span>
                      <span className="font-medium text-gray-600 dark:text-gray-300">
                        Index: {active.result.index}%
                      </span>
                    </div>
                  )}
                  {active.result && (
                    <button
                      onClick={() => setShowMarkers((v) => !v)}
                      className={`rounded px-2 py-1 text-xs font-medium ${
                        showMarkers
                          ? "bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200"
                          : "text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                      }`}
                      title="Toggle markers"
                    >
                      Markers
                    </button>
                  )}
                  <div className="flex items-center">
                    <button
                      onClick={() => setMagnifier((v) => !v)}
                      className={`rounded-l px-2 py-1 text-xs font-medium border ${
                        magnifier
                          ? "bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-500"
                          : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 border-gray-200 dark:border-gray-600"
                      }`}
                      title="Toggle magnifying glass"
                    >
                      <svg className="inline h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                      </svg>
                    </button>
                    {magnifier && zoomLevels.map((z) => (
                      <button
                        key={z}
                        onClick={() => setZoom(z)}
                        className={`border-t border-b border-r px-1.5 py-1 text-xs last:rounded-r ${
                          zoom === z
                            ? "bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-500 font-medium"
                            : "text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 border-gray-200 dark:border-gray-600"
                        }`}
                      >
                        {z}x
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={analyze}
                    disabled={active.loading}
                    className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {active.loading ? "Analyzing..." : "Analyze"}
                  </button>
                  <button
                    onClick={() => removeImage(active.id)}
                    className="rounded px-2 py-1 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    Remove
                  </button>
                  {active.result && (
                    <button
                      onClick={() => downloadImage(active)}
                      className="rounded px-2 py-1 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                      title="Download this analyzed image"
                    >
                      Save
                    </button>
                  )}
                  {analyzedImages.length > 0 && (
                    <>
                      <span className="mx-1 text-gray-300 dark:text-gray-600">|</span>
                      <button
                        onClick={exportCsv}
                        className="rounded px-2 py-1 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                        title="Export results as CSV"
                      >
                        CSV
                      </button>
                      <button
                        onClick={exportAllImages}
                        className="rounded px-2 py-1 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                        title="Download all analyzed images as ZIP"
                      >
                        All Images
                      </button>
                    </>
                  )}
                </div>
              </div>

              {active.error && (
                <p className="mt-2 text-xs text-red-600 dark:text-red-400">{active.error}</p>
              )}
            </>
          )}

          {/* Thumbnail strip */}
          <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-1">
            {images.map((img) => (
              <button
                key={img.id}
                onClick={() => setActiveId(img.id)}
                className={`relative flex-shrink-0 rounded-md overflow-hidden border-2 transition ${
                  img.id === activeId
                    ? "border-blue-500"
                    : "border-transparent hover:border-gray-300 dark:hover:border-gray-600"
                }`}
              >
                <img
                  src={img.preview}
                  alt={img.name}
                  className="h-14 w-14 object-cover"
                />
                {/* Analysis status indicator */}
                {img.result && (
                  <div className="absolute bottom-0.5 right-0.5 h-2 w-2 rounded-full bg-green-400 ring-1 ring-white dark:ring-gray-800" />
                )}
                {img.loading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  </div>
                )}
              </button>
            ))}

            {/* Add more buttons */}
            <button
              onClick={() => inputRef.current?.click()}
              className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-md border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:border-gray-400 dark:hover:border-gray-500 hover:text-gray-500 dark:hover:text-gray-400"
              title="Add more images"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </button>
            <button
              onClick={() => dirInputRef.current?.click()}
              className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-md border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:border-gray-400 dark:hover:border-gray-500 hover:text-gray-500 dark:hover:text-gray-400"
              title="Upload a folder"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
              </svg>
            </button>
          </div>

          {/* Hidden file inputs */}
          <input
            ref={inputRef}
            type="file"
            accept="image/*,.tar,.tar.gz,.tgz,.zip"
            multiple
            onChange={onFileChange}
            className="hidden"
          />
          {/* @ts-expect-error webkitdirectory is non-standard */}
          <input
            ref={dirInputRef}
            type="file"
            webkitdirectory=""
            onChange={onFileChange}
            className="hidden"
          />
          </div>
      )}
          </div>

          {/* Settings panel */}
          <div className="w-56 shrink-0 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 self-start">
            <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-3">Detection Settings</h3>

            <div className="space-y-3">
              <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Positive (DAB)</p>
              <SettingSlider label="Sensitivity" tooltip="Threshold multiplier for stain detection. Lower = detects fainter cells." value={settings.posThresh} min={0.1} max={1.5} step={0.05}
                onChange={(v) => updateSetting("posThresh", v)} />
              <SettingSlider label="Min Area" tooltip="Minimum cell size in pixels. Smaller values detect tinier cells but may pick up noise." value={settings.posMinArea} min={5} max={200} step={5}
                onChange={(v) => updateSetting("posMinArea", v)} />
              <SettingSlider label="Cleanup" tooltip="Morphological disk radius. Higher values smooth more noise but may erode small cells." value={settings.posDiskRadius} min={1} max={5} step={1}
                onChange={(v) => updateSetting("posDiskRadius", v)} />

              <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide pt-1">Negative (Hematoxylin)</p>
              <SettingSlider label="Sensitivity" tooltip="Threshold multiplier for stain detection. Lower = detects fainter cells." value={settings.negThresh} min={0.1} max={1.5} step={0.05}
                onChange={(v) => updateSetting("negThresh", v)} />
              <SettingSlider label="Min Area" tooltip="Minimum cell size in pixels. Smaller values detect tinier cells but may pick up noise." value={settings.negMinArea} min={5} max={200} step={5}
                onChange={(v) => updateSetting("negMinArea", v)} />
              <SettingSlider label="Cleanup" tooltip="Morphological disk radius. Higher values smooth more noise but may erode small cells." value={settings.negDiskRadius} min={1} max={5} step={1}
                onChange={(v) => updateSetting("negDiskRadius", v)} />

              <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide pt-1">General</p>
              <SettingSlider label="Watershed" tooltip="Controls how aggressively touching cells are split apart. Lower = more splitting." value={settings.watershedFootprint} min={3} max={20} step={1}
                onChange={(v) => updateSetting("watershedFootprint", v)} />
            </div>
          </div>
        </div>
    </div>
  );
}

function SettingSlider({
  label, tooltip, value, min, max, step, onChange,
}: {
  label: string; tooltip?: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[11px] text-gray-600 dark:text-gray-400 flex items-center gap-1">
          {label}
          {tooltip && (
            <span className="relative group">
              <svg className="h-3 w-3 text-gray-400 dark:text-gray-500 cursor-help" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
              </svg>
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block w-40 rounded bg-gray-900 dark:bg-gray-700 px-2 py-1 text-[10px] text-white text-center leading-tight z-10">
                {tooltip}
              </span>
            </span>
          )}
        </span>
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-14 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-1 py-0 text-[11px] text-right text-gray-900 dark:text-gray-100 outline-none focus:border-blue-500"
        />
      </div>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1 accent-blue-600"
      />
    </div>
  );
}
