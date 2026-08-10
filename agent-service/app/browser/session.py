from contextlib import asynccontextmanager

import httpx
from playwright.async_api import async_playwright

from app.config import settings

_BROWSERBASE_API_URL = "https://api.browserbase.com/v1/sessions"


@asynccontextmanager
async def open_browser_page():
    """Yields (page, browserbase_session_id) for the form-filler agent.
    Uses Browserbase when configured (production — plan Section 3), falls
    back to a locally-launched headless Chromium otherwise so this agent is
    usable in local dev without a Browserbase account (see README). The
    fallback is a dev convenience, not a resilience feature — it only
    triggers when BROWSERBASE_API_KEY/PROJECT_ID are unset, never on a
    Browserbase API failure.

    NOTE: the Browserbase branch is built against their documented REST API
    (api.browserbase.com/v1/sessions -> connectUrl, connected via
    Playwright's connect_over_cdp) but wasn't exercised against a live
    Browserbase account during development — no account was available.
    Verify this against a real session before relying on it in production.
    """
    if settings.browserbase_api_key and settings.browserbase_project_id:
        async with _browserbase_page() as result:
            yield result
    else:
        async with _local_page() as result:
            yield result


@asynccontextmanager
async def _browserbase_page():
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            _BROWSERBASE_API_URL,
            headers={"X-BB-API-Key": settings.browserbase_api_key},
            json={"projectId": settings.browserbase_project_id},
        )
        resp.raise_for_status()
        session = resp.json()
        session_id = session["id"]
        connect_url = session["connectUrl"]

    async with async_playwright() as playwright:
        browser = await playwright.chromium.connect_over_cdp(connect_url)
        try:
            context = browser.contexts[0] if browser.contexts else await browser.new_context()
            page = context.pages[0] if context.pages else await context.new_page()
            yield page, session_id
        finally:
            await browser.close()


@asynccontextmanager
async def _local_page():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        try:
            page = await browser.new_page()
            yield page, None
        finally:
            await browser.close()
