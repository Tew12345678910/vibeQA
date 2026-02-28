"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { educationLevelSchema, focusSchema, type EducationLevel, type Focus } from "../lib/contracts";

type AuditFormProps = {
  initial: {
    baseUrl: string;
    routesText: string;
    maxPages: number;
    maxClicksPerPage: number;
    educationLevel: EducationLevel;
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
  const [maxClicksPerPage, setMaxClicksPerPage] = useState(initial.maxClicksPerPage);
  const [educationLevel, setEducationLevel] = useState<EducationLevel>(initial.educationLevel);
  const [selectedFocus, setSelectedFocus] = useState<Set<Focus>>(new Set(initial.focus));
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
    if (Object.keys(nextErrors).length) {
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/audits", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          baseUrl: baseUrl.trim(),
          routes: parseRoutes(routesText),
          viewports: [
            { key: "desktop", width: 1440, height: 900 },
            { key: "mobile", width: 390, height: 844 },
          ],
          maxPages,
          maxClicksPerPage,
          educationLevel,
          focus,
        }),
      });

      const payload = (await response.json()) as { auditId?: string; error?: string };
      if (!response.ok || !payload.auditId) {
        throw new Error(payload.error ?? "Failed to start audit");
      }

      router.push(`/audits/${payload.auditId}`);
    } catch (error) {
      setErrors((current) => ({
        ...current,
        submit: error instanceof Error ? error.message : "Failed to start audit",
      }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="audit-form" onSubmit={onSubmit}>
      <label>
        Base URL
        <input
          name="baseUrl"
          value={baseUrl}
          onChange={(event) => {
            setBaseUrl(event.target.value);
            setErrors((current) => ({ ...current, baseUrl: undefined }));
          }}
          placeholder="https://example.com"
          required
        />
      </label>
      {errors.baseUrl ? <p className="error-text">{errors.baseUrl}</p> : null}

      <label>
        Routes (optional)
        <textarea
          name="routes"
          value={routesText}
          onChange={(event) => {
            setRoutesText(event.target.value);
            setErrors((current) => ({ ...current, routes: undefined }));
          }}
          placeholder="/\n/pricing\n/login"
          rows={5}
        />
      </label>
      <p className="muted">Leave blank for auto-discovery.</p>
      {errors.routes ? <p className="error-text">{errors.routes}</p> : null}

      <div className="grid cols-2">
        <label>
          Max Pages
          <input
            type="number"
            min={1}
            max={10}
            value={maxPages}
            onChange={(event) => setMaxPages(Number(event.target.value))}
          />
        </label>
        <label>
          Max Clicks Per Page
          <input
            type="number"
            min={1}
            max={10}
            value={maxClicksPerPage}
            onChange={(event) => setMaxClicksPerPage(Number(event.target.value))}
          />
        </label>
      </div>

      <label>
        Education Level
        <select
          value={educationLevel}
          onChange={(event) => setEducationLevel(educationLevelSchema.parse(event.target.value))}
        >
          {educationLevelSchema.options.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>

      <fieldset>
        <legend>Focus Areas</legend>
        <div className="checkbox-grid">
          {focusValues.map((value) => (
            <label key={value} className="checkbox-item">
              <input
                type="checkbox"
                checked={selectedFocus.has(value)}
                onChange={() => toggleFocus(value)}
              />
              {value}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="viewport-note">
        Viewports: desktop 1440x900, mobile 390x844
      </div>

      {errors.submit ? <p className="error-text">{errors.submit}</p> : null}
      <button className="primary" type="submit" disabled={busy}>
        {busy ? "Starting Audit..." : "Run Audit"}
      </button>
    </form>
  );
}
