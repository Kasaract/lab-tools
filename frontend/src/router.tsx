import { createBrowserRouter } from "react-router-dom";
import { DashboardLayout } from "./layouts/DashboardLayout";
import { CellCountPage } from "./pages/CellCountPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <DashboardLayout />,
    children: [
      { index: true, element: <CellCountPage /> },
      { path: "tools/cell-count", element: <CellCountPage /> },
    ],
  },
]);
