import difflib

from playwright.async_api import Page

from app.browser.types import FieldResult, FormFillResult

# Verified live against a real Greenhouse-hosted application page
# (job-boards.greenhouse.io/gitlab/jobs/...) during development — see
# README Phase 4 notes. Standard field IDs (first_name/last_name/email/
# phone/resume/cover_letter) and the question_<id> / react-select pattern
# for custom questions and EEO fields are stable across Greenhouse's
# hosted boards (job-boards.greenhouse.io and boards.greenhouse.io).

_MATCH_THRESHOLD = 0.5


def _normalize(text: str) -> str:
    return text.strip().rstrip("*").strip().lower()


def _best_match(label: str, answers: list[dict]) -> dict | None:
    normalized_label = _normalize(label)
    best: tuple[float, dict] | None = None
    for answer in answers:
        score = difflib.SequenceMatcher(
            None, normalized_label, _normalize(answer["question_text"])
        ).ratio()
        if score >= _MATCH_THRESHOLD and (best is None or score > best[0]):
            best = (score, answer)
    return best[1] if best else None


async def _fill_text_field(page: Page, field_id: str, value: str) -> bool:
    try:
        await page.fill(f"#{field_id}", value, timeout=5000)
        return True
    except Exception:
        return False


async def _fill_combobox(page: Page, field_id: str, search_text: str) -> bool:
    """Generic react-select fill (plan Section 4.4 form-filling): type the
    target text, let react-select's own filtering highlight the closest
    option (aria-activedescendant), press Enter to select it. Returns False
    — rather than guessing — if nothing matched, which is the safe failure
    mode for fields like EEO dropdowns where a wrong selection is worse
    than a skipped one."""
    try:
        locator = page.locator(f"#{field_id}")
        await locator.scroll_into_view_if_needed(timeout=5000)
        await locator.click(timeout=5000)
        await locator.type(search_text, delay=30)
        await page.wait_for_timeout(400)
        active = await locator.get_attribute("aria-activedescendant")
        if not active:
            await page.keyboard.press("Escape")
            return False
        await page.keyboard.press("Enter")
        return True
    except Exception:
        return False


async def _upload_file(page: Page, field_id: str, filename: str, mime_type: str, data: bytes) -> bool:
    try:
        await page.set_input_files(
            f"#{field_id}",
            files=[{"name": filename, "mimeType": mime_type, "buffer": data}],
            timeout=10000,
        )
        await page.wait_for_timeout(800)
        # Greenhouse swaps the raw <input type=file> out of the DOM for a
        # "<filename> [Remove file]" chip on success — that's the actual
        # success signal, not the input's continued presence.
        removed_button = page.locator(f"#upload-label-{field_id}").locator(
            "xpath=following-sibling::*//button[@aria-label='Remove file']"
        )
        return await removed_button.count() > 0
    except Exception:
        return False


async def fill_greenhouse_application(
    page: Page,
    apply_url: str,
    *,
    first_name: str,
    last_name: str,
    email: str,
    phone: str | None,
    resume_bytes: bytes,
    resume_filename: str,
    cover_letter_bytes: bytes | None,
    cover_letter_filename: str | None,
    answers: list[dict],
    eeo: dict,
) -> FormFillResult:
    result = FormFillResult()

    await page.goto(apply_url, wait_until="networkidle", timeout=30000)

    standard_fields = [
        ("first_name", "First name", first_name),
        ("last_name", "Last name", last_name),
        ("email", "Email", email),
    ]
    if phone:
        standard_fields.append(("phone", "Phone", phone))

    for field_id, label, value in standard_fields:
        if await page.locator(f"#{field_id}").count() == 0:
            continue
        ok = await _fill_text_field(page, field_id, value)
        result.fields.append(
            FieldResult(label, "filled" if ok else "failed", None if ok else "Could not fill field")
        )

    if await page.locator("#resume").count() > 0:
        ok = await _upload_file(page, "resume", resume_filename, "application/pdf", resume_bytes)
        result.fields.append(
            FieldResult("Resume", "filled" if ok else "failed", None if ok else "Upload didn't stick — attach manually")
        )

    if cover_letter_bytes and await page.locator("#cover_letter").count() > 0:
        ok = await _upload_file(
            page, "cover_letter", cover_letter_filename or "cover_letter.pdf", "application/pdf", cover_letter_bytes
        )
        result.fields.append(
            FieldResult("Cover letter", "filled" if ok else "failed", None if ok else "Upload didn't stick")
        )

    # Custom questions: discover every question_<id> field on the page and
    # match it against the provided answers by label similarity (plan
    # Section 4.4's form-discovery pass).
    discovered = await page.eval_on_selector_all(
        "[id^='question_']",
        """els => els.map(e => ({
            id: e.id,
            tag: e.tagName,
            role: e.getAttribute('role'),
            label: e.getAttribute('aria-label')
                || (e.getAttribute('aria-labelledby')
                    ? document.getElementById(e.getAttribute('aria-labelledby').split(' ')[0])?.textContent
                    : null),
        }))""",
    )
    seen_ids = set()
    for field in discovered:
        field_id = field["id"]
        if field_id in seen_ids or not field.get("label"):
            continue
        seen_ids.add(field_id)

        match = _best_match(field["label"], answers)
        if not match:
            result.unmatched_questions.append(field["label"])
            continue

        is_combobox = field.get("role") == "combobox"
        if is_combobox:
            ok = await _fill_combobox(page, field_id, match["answer_text"])
        else:
            ok = await _fill_text_field(page, field_id, match["answer_text"])
        result.fields.append(
            FieldResult(field["label"], "filled" if ok else "failed", None if ok else "Could not fill field")
        )

    # Voluntary EEO fields — only attempted if the profile has a value;
    # never guess (plan Section 7 — voluntary disclosures stay voluntary).
    eeo_field_map = {
        "gender": eeo.get("gender"),
        "hispanic_ethnicity": eeo.get("race"),
        "veteran_status": eeo.get("veteran_status"),
        "disability_status": eeo.get("disability_status"),
    }
    for field_id, value in eeo_field_map.items():
        if not value or await page.locator(f"#{field_id}").count() == 0:
            continue
        ok = await _fill_combobox(page, field_id, value)
        result.fields.append(
            FieldResult(field_id.replace("_", " ").title(), "filled" if ok else "skipped",
                        None if ok else "No matching option found for the value on file")
        )

    result.screenshot = await page.screenshot(full_page=True)
    # Deliberately never locate/click a submit button — plan Section 4.4's
    # stop-before-submit checkpoint. The caller marks the application
    # `form_filled_pending_review` and the human takes it from here.
    return result
