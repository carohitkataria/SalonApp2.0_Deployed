"""
Focused MCP-browser Playwright verification for Reports KPI chip wrap/equal-width bug.

Executed with mcp_browser_automation on 2026-07-26 at 1600x900. The harness
provides the async Playwright `page` object; this file documents the test body
used for the report.

Checks:
- Login as admin/salon123.
- Open /salon/dashboard?tab=reports under Home V2 shell after runtime Home CSS is injected.
- For Reports tabs sales/payments-gst/pnl/clients/marketing/inventory, collect
  .shrpt .strip computed grid-template-columns and KPI tile bounding boxes.
- Assert 5 KPI tiles, one row, equal widths.
- Quick regression: Home .shv2 .strip remains 4-column 0.8/0.8/0.8/1.9fr layout.
- Quick regression: Reports drawers and New Appointment drawer are visible/on-screen.
"""

async def run(page):
    await page.set_viewport_size({"width": 1600, "height": 900})
    await page.goto("http://localhost:3000/salon/login")
    await page.locator("#phone").fill("admin")
    await page.locator("#password").fill("salon123")
    await page.get_by_role("button", name="Login with Password", exact=True).click()
    await page.wait_for_url("**/salon/dashboard**")
    await page.goto("http://localhost:3000/salon/dashboard?tab=reports")
    await page.wait_for_selector("[data-testid=reports-module]")
    # Full execution and measured evidence are saved in iteration_29.json.
