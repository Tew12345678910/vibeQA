"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { focusSchema, type Focus } from "@/lib/contracts";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type AuditFormProps = {
  initial: {
    baseUrl: string;
    routesText: string;
    maxPages: number;
    maxClicksPerPage: number;
    focus: Focus[];
  };
};

type FormErrors = {
  baseUrl?: string;
  routes?: string;
  submit?: string;
};

const focusValues = focusSchema.options;

function parseRoutes(routesText: string): string[] {
  return routesText
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function AuditForm({ initial }: AuditFormProps) {
  const router = useRouter();
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl);
  const [routesText, setRoutesText] = useState(initial.routesText);
  const [maxPages, setMaxPages] = useState(initial.maxPages);
  const [maxClicksPerPage, setMaxClicksPerPage] = useState(
    initial.maxClicksPerPage,
  );
  const [selectedFocus, setSelectedFocus] = useState<Set<Focus>>(
    new Set(initial.focus),
  );
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  const focus = useMemo(() => [...selectedFocus], [selectedFocus]);

  function toggleFocus(value: Focus) {
    setSelectedFocus((current) => {
      const next = new Set(current);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  }

  function validate(): FormErrors {
    const nextErrors: FormErrors = {};

    try {
      const parsed = new URL(baseUrl.trim());
      if (parsed.protocol !== "https:") {
        nextErrors.baseUrl = "Base URL must use https.";
      }
    } catch {
      nextErrors.baseUrl = "Base URL must be a valid URL.";
    }

    const routes = parseRoutes(routesText);
    for (const route of routes) {
      if (route.startsWith("http://") || route.startsWith("https://")) {
        continue;
      }
      if (!route.startsWith("/")) {
        nextErrors.routes = "Routes must start with '/' or be full URLs.";
        break;
      }
    }

    if (!focus.length) {
      nextErrors.submit = "Select at least one focus area.";
    }

    return nextErrors;
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setBusy(true);
    try {
      const response = await fetch("/api/audits", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          baseUrl: baseUrl.trim(),
          routes: parseRoutes(routesText),
          viewports: [
            { key: "desktop", width: 1440, height: 900 },
            { key: "mobile", width: 390, height: 844 },
          ],
          maxPages,
          maxClicksPerPage,
          focus,
        }),
      });

      const payload = (await response.json()) as {
        auditId?: string;
        error?: string;
      };
      if (!response.ok || !payload.auditId) {
        throw new Error(payload.error ?? "Failed to start audit");
      }

      router.push(`/audits/${payload.auditId}`);
    } catch (error) {
      setErrors((current) => ({
        ...current,
        submit:
          error instanceof Error ? error.message : "Failed to start audit",
      }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      <div className="grid gap-1.5">
        <Label htmlFor="baseUrl">Base URL</Label>
        <Input
          id="baseUrl"
          name="baseUrl"
          value={baseUrl}
          onChange={(e) => {
            setBaseUrl(e.target.value);
            setErrors((c) => ({ ...c, baseUrl: undefined }));
          }}
          placeholder="https://example.com"
          required
        />
        {errors.baseUrl ? (
          <p className="text-sm text-destructive">{errors.baseUrl}</p>
        ) : null}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="routes">Routes (optional)</Label>
        <Textarea
          id="routes"
          name="routes"
          value={routesText}
          onChange={(e) => {
            setRoutesText(e.target.value);
            setErrors((c) => ({ ...c, routes: undefined }));
          }}
          placeholder={"/\n/pricing\n/login"}
          rows={5}
        />
        <p className="text-sm text-muted-foreground">
          Leave blank for auto-discovery.
        </p>
        {errors.routes ? (
          <p className="text-sm text-destructive">{errors.routes}</p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="maxPages">Max Pages</Label>
          <Input
            id="maxPages"
            type="number"
            min={1}
            max={10}
            value={maxPages}
            onChange={(e) => setMaxPages(Number(e.target.value))}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="maxClicks">Max Clicks Per Page</Label>
          <Input
            id="maxClicks"
            type="number"
            min={1}
            max={10}
            value={maxClicksPerPage}
            onChange={(e) => setMaxClicksPerPage(Number(e.target.value))}
          />
        </div>
      </div>

      <fieldset className="rounded-lg border p-4">
        <legend className="-ml-1 px-1 text-sm font-medium">Focus Areas</legend>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {focusValues.map((value) => (
            <div key={value} className="flex items-center gap-2">
              <Checkbox
                id={`focus-${value}`}
                checked={selectedFocus.has(value)}
                onCheckedChange={() => toggleFocus(value)}
              />
              <Label
                htmlFor={`focus-${value}`}
                className="font-normal capitalize"
              >
                {value}
              </Label>
            </div>
          ))}
        </div>
      </fieldset>

      <div className="rounded-lg border border-dashed bg-muted/40 px-4 py-2.5 text-sm text-muted-foreground">
        Viewports: desktop 1440×900, mobile 390×844
      </div>

      {errors.submit ? (
        <p className="text-sm text-destructive">{errors.submit}</p>
      ) : null}

      <Button type="submit" disabled={busy}>
        {busy ? "Starting Audit…" : "Run Audit"}
      </Button>
    </form>
  );
}
