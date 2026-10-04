import Link from "next/link";

// What a page shows while it has no workspace to work with. While the list of
// workspaces is still loading it must say so, not tell a signed-in person that
// they have none.
export function NoWorkspace({ loading }: { loading: boolean }) {
  if (loading) return <p className="text-sm text-gray-400">Loading…</p>;
  return (
    <p className="text-sm text-gray-500">
      You don&apos;t have a workspace yet.{" "}
      <Link href="/onboarding" className="font-medium text-brand-700 underline">
        Set one up
      </Link>{" "}
      or{" "}
      <Link href="/login" className="font-medium text-brand-700 underline">
        log in
      </Link>
      .
    </p>
  );
}
