import { useEffect, useRef, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

type FeedbackType = "bug" | "suggestion";

export function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [type, setType] = useState<FeedbackType>("bug");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<(string | null)[]>([]);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const DISMISS_MS = 2000;

  useEffect(() => {
    if (!sent) return;
    const timer = setTimeout(close, DISMISS_MS);
    return () => clearTimeout(timer);
  }, [sent]);

  const reset = () => {
    setName("");
    setEmail("");
    setMessage("");
    previews.forEach((u) => u && URL.revokeObjectURL(u));
    setFiles([]);
    setPreviews([]);
    setError(null);
    setSent(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("name", name);
      fd.append("email", email);
      fd.append("type", type);
      fd.append("message", message);
      for (const f of files) fd.append("attachments", f);

      const res = await fetch(`${API_BASE}/api/feedback/submit`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      setSent(true);
    } catch {
      setError("Failed to send. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const FADE_MS = 200;

  const close = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => {
      setOpen(false);
      setClosing(false);
      reset();
    }, FADE_MS);
  };

  const addFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;
    const added = Array.from(newFiles);
    const newPreviews = added.map((f) =>
      f.type.startsWith("image/") ? URL.createObjectURL(f) : null
    );
    setFiles((prev) => [...prev, ...added]);
    setPreviews((prev) => [...prev, ...newPreviews]);
  };

  const removeFile = (idx: number) => {
    const url = previews[idx];
    if (url) URL.revokeObjectURL(url);
    setFiles((prev) => prev.filter((_, i) => i !== idx));
    setPreviews((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="rounded-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-1.5 text-gray-500 dark:text-gray-400 shadow hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200 transition"
          title="Send feedback"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 0 1 1.037-.443 48.2 48.2 0 0 0 5.887-.37c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
          </svg>
        </button>
      )}

      {open && (
        <>
        <div
          className="fixed inset-0 z-40 bg-black/30 transition-opacity duration-200"
          style={{ opacity: closing ? 0 : 1 }}
          onClick={close}
        />
        <div
          className="relative z-50 w-96 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl transition-all duration-200"
          style={{ opacity: closing ? 0 : 1, transform: closing ? "scale(0.95)" : "scale(1)" }}
        >
          <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-4 py-2.5">
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Feedback</span>
            <button onClick={close} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {sent ? (
            <div
              className="p-4 text-center"
              style={{
                animation: `fadeOut ${DISMISS_MS}ms ease-in forwards`,
              }}
            >
              <p className="text-sm text-green-600 dark:text-green-400 font-medium">Thanks! Your feedback has been sent.</p>
              <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                <div
                  className="h-full bg-green-500 rounded-full"
                  style={{
                    animation: `shrink ${DISMISS_MS}ms linear forwards`,
                  }}
                />
              </div>
              <style>{`
                @keyframes shrink { from { width: 100%; } to { width: 0%; } }
                @keyframes fadeOut { 0% { opacity: 1; } 70% { opacity: 1; } 100% { opacity: 0; } }
              `}</style>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3 p-4">
              {/* Type toggle */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setType("bug")}
                  className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium transition ${
                    type === "bug"
                      ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                  }`}
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    {/* antennae */}
                    <path d="M8 2l2 4M16 2l-2 4" />
                    {/* head */}
                    <circle cx="12" cy="8" r="3" />
                    {/* body */}
                    <ellipse cx="12" cy="16" rx="5" ry="6" />
                    {/* segment line */}
                    <path d="M7 16h10" />
                    {/* left legs */}
                    <path d="M7 13l-3-2M7 16l-3 0M7 19l-3 2" />
                    {/* right legs */}
                    <path d="M17 13l3-2M17 16l3 0M17 19l3 2" />
                  </svg>
                  Bug Report
                </button>
                <button
                  type="button"
                  onClick={() => setType("suggestion")}
                  className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium transition ${
                    type === "suggestion"
                      ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                  }`}
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
                  </svg>
                  Suggestion
                </button>
              </div>

              <input
                type="text"
                placeholder="Your name *"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 focus:outline-none"
              />
              <input
                type="email"
                placeholder="Your email *"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 focus:outline-none"
              />
              <textarea
                placeholder={type === "bug" ? "Describe the bug..." : "Share your idea..."}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                rows={5}
                className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 focus:outline-none resize-none"
              />

              {/* Attachments */}
              <div>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
                  </svg>
                  Attach files
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept="image/*,.pdf,.txt,.log"
                  onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
                  className="hidden"
                />
                {files.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {files.map((f, i) => (
                      <div key={i} className="group relative">
                        {previews[i] ? (
                          <img
                            src={previews[i]!}
                            alt={f.name}
                            className="h-12 w-12 rounded border border-gray-200 dark:border-gray-600 object-cover"
                          />
                        ) : (
                          <div className="flex h-12 w-12 items-center justify-center rounded border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700">
                            <span className="text-[8px] text-gray-400 dark:text-gray-500 text-center leading-tight truncate px-0.5">{f.name.split(".").pop()}</span>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => removeFile(i)}
                          className="absolute -top-1 -right-1 hidden group-hover:flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white"
                        >
                          <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

              <button
                type="submit"
                disabled={sending}
                className="w-full rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {sending ? "Sending..." : "Send"}
              </button>
            </form>
          )}
        </div>
        </>
      )}
    </div>
  );
}
