# Pinned to 3.12 rather than the latest interpreter — LangGraph/LangChain
# (added in Phase 1+) lag behind brand-new Python releases on wheel support.
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
