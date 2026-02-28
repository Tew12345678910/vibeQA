"""
Browser-Use agent: run TestPlan, return simple payload (routes, good_points, problems).
Uses bedrock_agentcore BrowserClient + browser_use (same pattern as src/tools/browser_tool.py).
"""
import asyncio
import contextlib
import json
import os
import re
from typing import Optional

# Disable browser_use telemetry / cloud sync before any browser_use imports (avoids "Failed to send event to cloud: HTTP 405")
os.environ.setdefault("BROWSER_USE_DISABLE_TELEMETRY", "true")
os.environ.setdefault("ANONYMIZED_TELEMETRY", "false")

from .schemas import RouteAuditResult, SimpleAuditPayload, TestPlan


SYSTEM_PROMPT = """
You are a Browser-Use autonomous QA + UX audit agent. You audit only UI/UX (user interface and user experience).

INPUT
You will receive a Test Plan JSON with: baseUrl and routes (paths to visit).

SCOPE — UI/UX ONLY
- good_points and problems must be about UI/UX only: layout, navigation, accessibility (a11y), visual hierarchy, forms, labels, readability, responsiveness, contrast, call-to-action placement, focus order, touch targets, empty/error states. Do NOT include non-UI/UX topics (e.g. business strategy, content accuracy, SEO, backend performance).

CRITICAL — VISIT EVERY ROUTE
- You MUST visit every route listed in the plan, in order. Do not stop or report until you have opened and assessed each route (baseUrl + path).
- If a URL times out, retry up to 5 times for that route, then add a problem for that route and continue to the next.

TASK
1) For each route: navigate to baseUrl + path, assess the page for UI/UX (desktop and mobile if possible), note good_points and problems. Then move to the next route.
2) Only after you have visited every route, produce your final output.

AGENT STEP FORMAT
- At each step use the agent's required format (thinking, evaluation_previous_goal, next_goal). Do not output raw JSON in place of a step. Use actions (go_to_url, extract, etc.) to navigate and gather information.

SPECIFICITY
- good_points: Which route/page, what exactly worked well for UI/UX, and why it matters (e.g. "On /: Clear primary nav with visible current page; supports keyboard and screen readers.").
- problems: Which route/page, what is wrong from a UI/UX perspective, what you observed, and a concrete recommendation (e.g. "On /: The primary CTA is low contrast; increase contrast or add a border so it stands out.").
- Be concrete so a developer can locate and fix issues. No vague one-liners.

EFFICIENCY
- One or two tool calls per route is often enough.

FINAL OUTPUT — STRICT JSON ONLY
When you have finished visiting all routes, your final response must be exactly one valid JSON object and nothing else.
- No introductory text (e.g. no "All routes have been visited...", no "Here are the findings:").
- No markdown, no code fences, no bullets or prose. Only the JSON.
- Start with { and end with }. Use exactly these three keys: "routes", "good_points", "problems".

Format:
{"routes": ["/", "/about"], "good_points": ["On /: ..."], "problems": ["On /: ..."]}

Example (values should be your actual UI/UX findings):
{"routes": ["/", "/about"], "good_points": ["On /: Clear primary nav with visible current page; supports keyboard and screen readers."], "problems": ["On /about: Contact form email field has no visible label or aria-label (WCAG 4.1.2)."]}
""".strip()

# Per-route task: one route only, strict JSON. Enforces visiting every endpoint by running the agent once per route.
SINGLE_ROUTE_PROMPT = """
You are a UI/UX audit agent. You report only on what the user SEES and INTERACTS WITH on the page.

STRICT UI/UX ONLY — INCLUDE:
- Layout, visual hierarchy, spacing, alignment.
- Navigation (menus, links, breadcrumbs, current page indication).
- Forms: labels, placeholders, validation feedback, button clarity.
- Readability: typography, contrast, text size.
- CTAs and buttons: visibility, prominence, placement.
- Accessibility: focus order, keyboard use, aria-labels, alt text, color contrast (WCAG).
- Responsiveness: tap targets, stacking on narrow viewports.

DO NOT INCLUDE (these are NOT UI/UX findings):
- Business process, "transaction process", "simple flow", "easy to use" (unless you mean a specific UI element).
- Security claims, "enterprise-grade", "safe", "verified" — unless you mean a visible trust badge or UI cue.
- Content meaning or "lack of information about X" — do not report "lack of detailed information" or "lack of information about UI/UX audit" as a problem. Only report missing UI elements (e.g. missing form label, missing error message, missing heading).
- Marketing copy or value proposition. Stay visual and interaction-focused.

TASK
1) Navigate to the URL given below.
2) Look at the page: layout, nav, forms, contrast, buttons, links. Use one or two tool calls if needed.
3) Your final response must be exactly one valid JSON object. No intro text, no markdown. Only the JSON.

OUTPUT — ONLY THIS JSON
{"route": "<path>", "good_points": ["<one string per finding>"], "problems": ["<one string per finding>"]}

Good point example: "Primary nav shows current page; main CTA is above the fold with sufficient contrast."
Problem example: "I'm Interested button has low contrast against background; consider a stronger color or border."
""".strip()


def _extract_json(text: str) -> str:
    text = (text or "").strip()
    if "<thinking>" in text.lower():
        idx = text.lower().rfind("</thinking>")
        if idx != -1:
            text = text[idx + len("</thinking>"):].strip()
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    start = text.find("{")
    if start != -1:
        depth = 0
        for i in range(start, len(text)):
            if text[i] == "{":
                depth += 1
            elif text[i] == "}":
                depth -= 1
                if depth == 0:
                    return text[start : i + 1]
    return ""


def _content_from_result(raw_result) -> Optional[str]:
    """Extract string content from browser_use run result (AgentHistoryList)."""
    if raw_result is None:
        return None
    content = None
    if hasattr(raw_result, "final_result"):
        final = raw_result.final_result()
        content = (final.strip() if isinstance(final, str) else str(final or "")) or None
    if (not content or not content.strip()) and hasattr(raw_result, "result"):
        res = raw_result.result
        content = (res.strip() if isinstance(res, str) else str(res or "")) or content
    if (not content or not content.strip()) and hasattr(raw_result, "history") and raw_result.history:
        last_step = raw_result.history[-1] if hasattr(raw_result.history, "__getitem__") else None
        if last_step is not None:
            if hasattr(last_step, "result"):
                res = last_step.result
                content = (res.strip() if isinstance(res, str) else str(res or "")) or content
            else:
                content = str(last_step) if not content else content
    return (content or "").strip() or None


def _parse_content_to_payload(content: str, route_path: Optional[str] = None) -> Optional[SimpleAuditPayload]:
    """Parse agent output (JSON, prose, or markdown) into SimpleAuditPayload with routes as List[RouteAuditResult]."""
    if not content:
        return None
    # Try single-route JSON first when we have a known route
    if route_path is not None:
        try:
            single = _extract_json(content)
            if single:
                raw = json.loads(single)
                if "route" in raw and ("good_points" in raw or "problems" in raw):
                    return SimpleAuditPayload(
                        routes=[
                            RouteAuditResult(
                                route=raw.get("route", route_path),
                                good_points=raw.get("good_points", []),
                                problems=raw.get("problems", []),
                            )
                        ]
                    )
        except (json.JSONDecodeError, ValueError):
            pass
    # Standard JSON (flat routes, good_points, problems)
    to_parse = _extract_json(content)
    if to_parse:
        try:
            raw = json.loads(to_parse)
            routes_flat = raw.get("routes", [])
            gp = raw.get("good_points", raw.get("goodPoints", []))
            pr = raw.get("problems", raw.get("issues", []))
            if isinstance(routes_flat, list) and routes_flat:
                return SimpleAuditPayload(
                    routes=[RouteAuditResult(route=routes_flat[0], good_points=gp, problems=pr)]
                )
            return SimpleAuditPayload(
                routes=[RouteAuditResult(route="/", good_points=gp, problems=pr)]
            )
        except (json.JSONDecodeError, ValueError):
            pass
    # Prose / markdown fallbacks
    parsed = _parse_prose_findings(content)
    if parsed is not None:
        return parsed
    parsed = _parse_markdown_findings(content)
    if parsed is not None:
        return parsed
    return None


def _parse_prose_findings(content: str) -> Optional[SimpleAuditPayload]:
    """When the agent returns prose instead of JSON, try to extract routes, good_points, problems."""
    if not content or not isinstance(content, str):
        return None
    text = content.strip()
    routes: list = []
    good_points: list = []
    problems: list = []

    def collect_bullets(paragraph: str) -> list:
        items = []
        for line in paragraph.split("\n"):
            line = line.strip()
            if line.startswith("- ") or line.startswith("* "):
                items.append(line[2:].strip())
        return items

    # Try "Routes Visited:" or "Routes:" section
    for label in ("Routes Visited:", "Routes:", "routes visited:", "routes:"):
        idx = text.find(label)
        if idx != -1:
            rest = text[idx + len(label):]
            end = rest.find("\n\n")
            block = rest[:end] if end != -1 else rest
            for line in block.split("\n"):
                line = line.strip()
                if line.startswith("- ") or line.startswith("* "):
                    path = line[2:].strip()
                    if path.startswith("/") or path == "/":
                        routes.append(path if path.startswith("/") else f"/{path}")
            break

    # Try "Good Points:" section
    for label in ("Good Points:", "good_points:", "Good points:"):
        idx = text.find(label)
        if idx != -1:
            rest = text[idx + len(label):]
            end = rest.find("\n\nProblems:")
            if end == -1:
                end = rest.find("\n\nproblems:")
            if end == -1:
                end = rest.find("\n\nProblem:")
            block = rest[:end] if end != -1 else rest
            good_points = collect_bullets(block)
            break

    # Try "Problems:" section
    for label in ("Problems:", "problems:", "Problem:"):
        idx = text.find(label)
        if idx != -1:
            rest = text[idx + len(label):]
            end = rest.find("\n\nGood Points:")
            if end == -1:
                end = rest.find("\n\ngood_points:")
            if end == -1:
                end = rest.find("\n\nRoutes ")
            if end == -1:
                end = len(rest)
            block = rest[:end] if end != -1 else rest
            problems = collect_bullets(block)
            break

    if not routes and not good_points and not problems:
        return None
    route_str = routes[0] if routes else "/"
    return SimpleAuditPayload(
        routes=[RouteAuditResult(route=route_str, good_points=good_points, problems=problems)],
    )


def _parse_markdown_findings(content: str) -> Optional[SimpleAuditPayload]:
    """Parse markdown-style output: ## Page (path), ### Good Points, ### Problems; or results.md: ..."""
    if not content or not isinstance(content, str):
        return None
    text = content.strip()
    # If agent said "findings in results.md" or "Attachments: results.md:", use the part after the markdown content
    for marker in ("results.md:", "results.md\n", "```\n"):
        i = text.find(marker)
        if i != -1:
            text = text[i + len(marker):].strip()
    # If agent said "findings in results.md" or "Attachments: results.md:", use the part after the markdown content
    for marker in ("results.md:", "results.md\n", "```\n"):
        i = text.find(marker)
        if i != -1:
            text = text[i + len(marker):].strip()
    routes: list = []
    good_points: list = []
    problems: list = []

    def collect_bullets(paragraph: str) -> list:
        items = []
        for line in paragraph.split("\n"):
            line = line.strip()
            if line.startswith("- ") or line.startswith("* "):
                items.append(line[2:].strip())
        return items

    # Split by ## sections (e.g. "## Landing Page (/)")
    sections = re.split(r"\n##\s+", text)
    for i, block in enumerate(sections):
        if not block.strip():
            continue
        # First line may be "Landing Page (/)" or "Page Title (/path)"
        route_match = re.match(r"^[^\n]*\((/[^)]*)\)", block)
        route = route_match.group(1) if route_match else ("/" if i == 0 else "")
        if route and route not in routes:
            routes.append(route)
        # ### Good Points
        gp_match = re.search(r"###\s*Good Points?\s*\n(.*?)(?=###|\Z)", block, re.DOTALL | re.IGNORECASE)
        if gp_match:
            for item in collect_bullets(gp_match.group(1)):
                if item and item not in good_points:
                    good_points.append(item if route and ("On " in item or item.startswith("/")) else f"On {route}: {item}")
        # ### Problems?
        pr_match = re.search(r"###\s*Problems?\s*\n(.*?)(?=###|\Z)", block, re.DOTALL | re.IGNORECASE)
        if pr_match:
            for item in collect_bullets(pr_match.group(1)):
                if item and item not in problems:
                    problems.append(item if route and ("On " in item or item.startswith("/")) else f"On {route}: {item}")

    # Also try flat ### Good Points / ### Problems if no ## sections
    if not routes and not good_points and not problems:
        for label in ("### Good Points", "### Good points"):
            idx = text.find(label)
            if idx != -1:
                rest = text[idx + len(label):]
                end = rest.find("### Problems") or rest.find("### Problem")
                end = rest.find("###", 1) if end == -1 else end
                block = rest[:end] if end != -1 else rest
                good_points = collect_bullets(block)
                break
        for label in ("### Problems", "### Problem"):
            idx = text.find(label)
            if idx != -1:
                rest = text[idx + len(label):]
                end = rest.find("### Good")
                block = rest[:end] if end != -1 else rest
                problems = collect_bullets(block)
                break
        if good_points or problems:
            routes = ["/"]

    if not routes and not good_points and not problems:
        return None
    route_str = routes[0] if routes else "/"
    return SimpleAuditPayload(
        routes=[RouteAuditResult(route=route_str, good_points=good_points, problems=problems)],
    )


def simple_payload_from_block(plan: TestPlan, block_reason: str) -> SimpleAuditPayload:
    """Return a simple payload when the agent is blocked or all parse attempts fail."""
    return SimpleAuditPayload(
        routes=[
            RouteAuditResult(route=r.path, good_points=[], problems=[block_reason[:500]] if i == 0 else [])
            for i, r in enumerate(plan.routes)
        ],
    )


async def _run_audit_async(plan: TestPlan) -> SimpleAuditPayload:
    """Run the audit: one agent run per route so every endpoint is visited."""
    from bedrock_agentcore.tools.browser_client import BrowserClient
    from browser_use import Agent as BrowserUseAgent
    from browser_use.browser.session import BrowserSession
    from browser_use.browser import BrowserProfile
    from langchain_aws import ChatBedrockConverse

    region = os.getenv("AGENTCORE_BROWSER_REGION") or os.getenv("BEDROCK_REGION", "us-west-2")
    model_id = os.getenv("BEDROCK_MODEL_ID", "us.amazon.nova-pro-v1:0")
    base_url = str(plan.project.baseUrl).rstrip("/")

    if not plan.routes:
        return SimpleAuditPayload(routes=[])

    client = BrowserClient(region=region)
    browser_session = None
    route_results: list = []  # List[RouteAuditResult]

    try:
        # Use the same Browser tool ID as in AgentCore console so IAM and permissions match (avoids HTTP 403).
        browser_identifier = os.getenv("AGENTCORE_BROWSER_ID") or os.getenv("BEDROCK_BROWSER_ID")
        if browser_identifier:
            client.start(identifier=browser_identifier)
        else:
            client.start()
        ws_url, headers = client.generate_ws_headers()
        browser_profile = BrowserProfile(headers=headers, timeout=180000)
        browser_session = BrowserSession(
            cdp_url=ws_url,
            browser_profile=browser_profile,
            keep_alive=True,
        )
        await browser_session.start()

        bedrock_chat = ChatBedrockConverse(model_id=model_id, region_name=region)

        for idx, route in enumerate(plan.routes):
            path = route.path if route.path.startswith("/") else f"/{route.path}"
            url = f"{base_url}{path}"
            task = f"{SINGLE_ROUTE_PROMPT}\n\nURL to open and audit: {url}\nRoute path for your JSON: {path}\n\nReturn ONLY the JSON object."

            browser_use_agent = BrowserUseAgent(
                task=task,
                llm=bedrock_chat,
                browser_session=browser_session,
                use_vision=False,
            )
            try:
                raw_result = await browser_use_agent.run()
            except Exception as e:
                route_results.append(
                    RouteAuditResult(route=path, good_points=[], problems=[f"Agent error — {str(e)[:200]}"])
                )
                continue

            content = _content_from_result(raw_result)
            if not content:
                route_results.append(
                    RouteAuditResult(route=path, good_points=[], problems=["Agent did not return any output."])
                )
                continue

            parsed = _parse_content_to_payload(content, route_path=path)
            if parsed and parsed.routes:
                route_results.extend(parsed.routes)
            else:
                route_results.append(
                    RouteAuditResult(
                        route=path,
                        good_points=[],
                        problems=["Could not parse output. Return a JSON object with route, good_points, problems."],
                    )
                )

        return SimpleAuditPayload(routes=route_results)

    except Exception as e:
        return simple_payload_from_block(plan, str(e)[:500])

    finally:
        if browser_session:
            with contextlib.suppress(Exception):
                await browser_session.close()
            await asyncio.sleep(0.5)
        with contextlib.suppress(Exception):
            client.stop()


def run_browser_use_agent(plan: TestPlan) -> SimpleAuditPayload:
    """Sync entry point for the API. Runs the async audit (bedrock_agentcore + browser_use)."""
    return asyncio.run(_run_audit_async(plan))
