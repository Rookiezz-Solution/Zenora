"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { TemplateBuilderForm, type TemplateFormValues } from "@/components/broadcasts/template-builder-form";
import { apiFetch } from "@/lib/api";
import type { WaTemplate } from "@/lib/broadcast-types";
import { useCurrentWorkspace } from "@/lib/use-workspace";

const INITIAL: TemplateFormValues = {
  name: "",
  category: "marketing",
  language: "en",
  headerType: "none",
  headerText: "",
  bodyText: "",
  footerText: "",
  buttons: []
};

export default function NewWaTemplatePage() {
  const { workspaceId } = useCurrentWorkspace();
  const router = useRouter();

  async function handleSubmit(values: TemplateFormValues) {
    if (!workspaceId) return;
    const template = await apiFetch<WaTemplate>(`/workspaces/${workspaceId}/templates`, {
      method: "POST",
      body: JSON.stringify(values)
    });
    router.push(`/broadcasts/templates/${template.id}`);
  }

  if (!workspaceId) return <p className="text-sm text-gray-500">Log in and create a workspace first.</p>;

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold text-gray-900">New WhatsApp template</h1>
      <Link href="/broadcasts/templates" className="text-sm text-brand-700">
        ← Back to templates
      </Link>
      <div className="mt-4">
        <TemplateBuilderForm initial={INITIAL} nameLocked={false} onSubmit={handleSubmit} submitLabel="Create draft" />
      </div>
    </div>
  );
}
