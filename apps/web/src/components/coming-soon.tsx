export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
      <span className="mt-2 inline-block rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">Coming soon</span>
      <p className="mt-3 text-sm text-gray-600">{description}</p>
    </div>
  );
}
