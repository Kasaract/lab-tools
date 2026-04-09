import { Link } from "react-router-dom";

const tools = [
  {
    name: "Cell Count",
    description:
      "Upload stained microscope images to count positive vs negative cells and compute the proliferation index.",
    path: "/tools/cell-count",
  },
];

export function HomePage() {
  return (
    <div className="mx-auto max-w-3xl py-12">
      <div className="mb-12 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900">
          Welcome to Lab Tools
        </h1>
        <p className="mt-4 text-lg text-gray-500">
          A collection of tools for microscopy, image analysis, and beyond.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {tools.map((tool) => (
          <Link
            key={tool.path}
            to={tool.path}
            className="group rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition hover:border-blue-300 hover:shadow-md"
          >
            <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-700">
              {tool.name}
            </h3>
            <p className="mt-2 text-sm text-gray-500">{tool.description}</p>
          </Link>
        ))}

        {/* Placeholder for future tools */}
        <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-gray-200 p-6 text-sm text-gray-400">
          More tools coming soon
        </div>
      </div>
    </div>
  );
}
