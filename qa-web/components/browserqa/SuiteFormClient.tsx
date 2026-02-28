"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, FileText, Folder, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { focusSchema, type Focus } from "@/lib/contracts";
import { createSuite } from "@/lib/browserqa/suite-store";

type FormErrors = {
  name?: string;
  projectPath?: string;
  baseUrl?: string;
  submit?: string;
};

const defaultFocus: Focus[] = [
  "usability",
  "accessibility",
  "security",
  "content",
  "functional",
];

function parseRoutes(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function SuiteFormClient() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [projectPath, setProjectPath] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [guidelinePath, setGuidelinePath] = useState("");
  const [routesText, setRoutesText] = useState("");
  const [maxPages, setMaxPages] = useState(6);
  const [maxClicksPerPage, setMaxClicksPerPage] = useState(6);
  const [focus, setFocus] = useState<Set<Focus>>(new Set(defaultFocus));
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);

  const toggleFocus = (value: Focus) => {
    setFocus((current) => {
      const next = new Set(current);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  };

  const validate = (): FormErrors => {
    const nextErrors: FormErrors = {};

    if (!name.trim()) {
      nextErrors.name = "Name is required";
    }

    if (!projectPath.trim()) {
      nextErrors.projectPath = "Project path is required";
    }

    if (!baseUrl.trim()) {
      nextErrors.baseUrl = "Base URL is required";
    } else {
      try {
        new URL(baseUrl);
      } catch {
        nextErrors.baseUrl = "Invalid URL format";
      }
    }

    if (focus.size === 0) {
      nextErrors.submit = "Select at least one focus area";
    }

    return nextErrors;
  };

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);

    const suite = createSuite({
      name: name.trim(),
      projectPath: projectPath.trim(),
      baseUrl: baseUrl.trim(),
      guidelinePath: guidelinePath.trim() || undefined,
      routes: parseRoutes(routesText),
      maxPages: Math.max(1, Math.min(10, maxPages)),
      maxClicksPerPage: Math.max(1, Math.min(10, maxClicksPerPage)),
      focus: [...focus],
    });

    router.push(`/suites/${suite.id}`);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <section className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild className="text-slate-400 hover:bg-slate-800 hover:text-slate-100">
          <Link href="/suites">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-slate-100">Create Test Suite</h1>
          <p className="mt-2 text-slate-400">Set up a new QA test suite for your project</p>
        </div>
      </section>

      <Card className="border-slate-800 bg-slate-900/70">
        <CardContent className="p-6">
          <form onSubmit={onSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="suite-name" className="text-slate-300">
                Suite Name <span className="text-red-300">*</span>
              </Label>
              <Input
                id="suite-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g., E-Commerce Tests"
                className="border-slate-700 bg-slate-900 text-slate-100"
              />
              {errors.name ? <p className="text-sm text-red-300">{errors.name}</p> : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="suite-project" className="text-slate-300">
                Project Path <span className="text-red-300">*</span>
              </Label>
              <div className="relative">
                <Folder className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input
                  id="suite-project"
                  value={projectPath}
                  onChange={(event) => setProjectPath(event.target.value)}
                  placeholder="/workspace/my-project"
                  className="border-slate-700 bg-slate-900 pl-10 text-slate-100"
                />
              </div>
              {errors.projectPath ? <p className="text-sm text-red-300">{errors.projectPath}</p> : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="suite-url" className="text-slate-300">
                Base URL <span className="text-red-300">*</span>
              </Label>
              <div className="relative">
                <ExternalLink className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input
                  id="suite-url"
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.target.value)}
                  placeholder="https://example.com"
                  className="border-slate-700 bg-slate-900 pl-10 text-slate-100"
                />
              </div>
              {errors.baseUrl ? <p className="text-sm text-red-300">{errors.baseUrl}</p> : null}
              <p className="text-xs text-slate-500">Use a hosted HTTPS URL. Localhost/private targets are blocked by the API.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="suite-guideline" className="text-slate-300">
                Guideline Path <span className="text-slate-500">(optional)</span>
              </Label>
              <div className="relative">
                <FileText className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input
                  id="suite-guideline"
                  value={guidelinePath}
                  onChange={(event) => setGuidelinePath(event.target.value)}
                  placeholder="/workspace/guidelines/qa.md"
                  className="border-slate-700 bg-slate-900 pl-10 text-slate-100"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="suite-routes" className="text-slate-300">Routes (optional)</Label>
              <Textarea
                id="suite-routes"
                value={routesText}
                onChange={(event) => setRoutesText(event.target.value)}
                rows={4}
                placeholder="/\n/pricing\n/login"
                className="border-slate-700 bg-slate-900 text-slate-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="suite-max-pages" className="text-slate-300">Max Pages</Label>
                <Input
                  id="suite-max-pages"
                  type="number"
                  min={1}
                  max={10}
                  value={maxPages}
                  onChange={(event) => setMaxPages(Number(event.target.value))}
                  className="border-slate-700 bg-slate-900 text-slate-100"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="suite-max-clicks" className="text-slate-300">Max Clicks Per Page</Label>
                <Input
                  id="suite-max-clicks"
                  type="number"
                  min={1}
                  max={10}
                  value={maxClicksPerPage}
                  onChange={(event) => setMaxClicksPerPage(Number(event.target.value))}
                  className="border-slate-700 bg-slate-900 text-slate-100"
                />
              </div>
            </div>

            <fieldset className="space-y-3 rounded-lg border border-slate-800 bg-slate-800/30 p-4">
              <legend className="px-1 text-sm text-slate-400">Focus Areas</legend>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {focusSchema.options.map((entry) => (
                  <label key={entry} className="flex items-center gap-2 text-sm capitalize text-slate-200">
                    <Checkbox
                      checked={focus.has(entry)}
                      onCheckedChange={() => toggleFocus(entry)}
                    />
                    {entry}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-4 text-sm text-slate-300">
              <p className="font-medium text-blue-300">What&apos;s next?</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-400">
                <li>Create the suite config.</li>
                <li>Open suite detail and click &quot;Run Suite&quot; to call the audit API.</li>
                <li>Track results in the Runs and Issues pages.</li>
              </ul>
            </div>

            {errors.submit ? <p className="text-sm text-red-300">{errors.submit}</p> : null}

            <div className="flex items-center gap-3 pt-2">
              <Button asChild variant="secondary" className="flex-1 bg-slate-800 text-slate-100 hover:bg-slate-700">
                <Link href="/suites">Cancel</Link>
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="flex-1 bg-blue-500 text-slate-950 hover:bg-blue-400"
              >
                <Save className="mr-2 h-4 w-4" />
                Create Suite
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
