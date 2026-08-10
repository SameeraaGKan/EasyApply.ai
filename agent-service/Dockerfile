# Pinned to 3.12 rather than the latest interpreter — LangGraph/LangChain
# (added in Phase 1+) lag behind brand-new Python releases on wheel support.
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# No `playwright install chromium` here deliberately — this image doesn't
# bundle a local browser binary, so BROWSERBASE_API_KEY/BROWSERBASE_PROJECT_ID
# must be set at deploy time (Railway/Fly.io env vars). Without them, the
# form-filler agent's local-Chromium fallback (app/browser/session.py) will
# fail at runtime since there's no browser here to launch — that fallback
# exists only for local dev, where `playwright install chromium` has been
# run on the host.

# Run as a non-root user rather than the image's root default.
RUN useradd --create-home --uid 1000 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
