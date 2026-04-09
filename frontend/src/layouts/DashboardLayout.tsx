import { useCallback, useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { FeedbackWidget } from "../components/FeedbackWidget";
import { Sidebar } from "../components/Sidebar";

export function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dark, setDark] = useState(true);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const toggleTheme = useCallback(() => setDark((v) => !v), []);

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/30"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-10 items-center border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded p-1 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
              />
            </svg>
          </button>
          <span className="ml-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
            Lab Tools
          </span>

          {/* Dark mode sliding toggle — right side */}
          <button
            onClick={toggleTheme}
            className="ml-auto flex h-5 w-9 items-center rounded-full bg-gray-200 dark:bg-gray-600 p-0.5 transition-colors"
            title={dark ? "Switch to light mode" : "Switch to dark mode"}
          >
            <div
              className={`flex h-4 w-4 items-center justify-center rounded-full bg-white shadow-sm transition-transform ${
                dark ? "translate-x-4" : "translate-x-0"
              }`}
            >
              {dark ? (
                <svg className="h-2.5 w-2.5 text-gray-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
                </svg>
              ) : (
                <svg className="h-2.5 w-2.5 text-amber-500" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
                </svg>
              )}
            </div>
          </button>
        </header>

        <main className="flex-1 overflow-hidden p-4">
          <Outlet />
        </main>
      </div>

      <FeedbackWidget />
    </div>
  );
}
