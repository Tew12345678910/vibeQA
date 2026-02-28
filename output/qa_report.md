# UI QA Report

- Total test cases: 9
- Passed: 6
- Failed: 3

## Failing Cases

### AUTO-004 - UI text inferred from code for /about
- Path: `/about`
- Screenshot: `/Users/tew/Documents/qateam/output/screenshots/AUTO-004.png`
- Assertion failure: `must include text 'About Product'` (actual: `text missing`)
- Assertion failure: `must include text 'Contact Support'` (actual: `text missing`)

### GL-002 - Guideline check 2
- Path: `/about`
- Screenshot: `/Users/tew/Documents/qateam/output/screenshots/GL-002.png`
- Assertion failure: `must include text 'About Product'` (actual: `text missing`)

### GL-004 - Guideline check 4
- Path: `/about`
- Screenshot: `/Users/tew/Documents/qateam/output/screenshots/GL-004.png`
- Assertion failure: `must not include text 'Deprecated Banner'` (actual: `text present`)

## AI Coding Agent Fix Tasks

1. **AUTO-004: text_present failed**
   - Severity: `medium`
   - File hint: `/Users/tew/Documents/qateam/sample_project/src/routes.tsx:25`
   - Issue: `must include text 'About Product'; actual=text missing`
   - Recommendation: Ensure expected text 'About Product' is rendered. If copy changed intentionally, update test expectations and source-of-truth text together.
2. **AUTO-004: text_present failed**
   - Severity: `medium`
   - File hint: `/Users/tew/Documents/qateam/sample_project/src/routes.tsx:26`
   - Issue: `must include text 'Contact Support'; actual=text missing`
   - Recommendation: Ensure expected text 'Contact Support' is rendered. If copy changed intentionally, update test expectations and source-of-truth text together.
3. **GL-002: text_present failed**
   - Severity: `medium`
   - File hint: `/Users/tew/Documents/qateam/guides/human_guideline.txt:8`
   - Issue: `must include text 'About Product'; actual=text missing`
   - Recommendation: Ensure expected text 'About Product' is rendered. If copy changed intentionally, update test expectations and source-of-truth text together.
4. **GL-004: text_absent failed**
   - Severity: `medium`
   - File hint: `/Users/tew/Documents/qateam/guides/human_guideline.txt:10`
   - Issue: `must not include text 'Deprecated Banner'; actual=text present`
   - Recommendation: Remove or gate text 'Deprecated Banner' in the UI for this route.
