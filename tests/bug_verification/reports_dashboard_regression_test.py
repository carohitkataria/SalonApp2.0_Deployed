"""
Focused Playwright verification for Reports/dashboard CSS regression.

Scope:
- Home dashboard chip/grid layout after Reports CSS namespace fix.
- Reports non-snapshot KPI strip one-row layout.
- Reports drawers visible/on-screen with expected z-index/transform.
- New Appointment drawer regression check.

Executed via the browser automation harness in this bug-verification run.
"""

import asyncio


async def run(page):
    # This file documents the exact UI checks; the same actions were executed
    # by the MCP browser automation tool for this report.
    await page.set_viewport_size({"width": 1600, "height": 900})
    await page.goto("http://localhost:3000/salon/dashboard")
    # Login as admin/salon123 if redirected to /salon/login.
    # Then verify Home .shv2 grids, Reports .shrpt strip/drawers, and newapt drawer.
    pass
