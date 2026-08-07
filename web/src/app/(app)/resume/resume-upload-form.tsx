"use client";

import { useActionState, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { recordUploadAndParse, type UploadActionState } from "./actions";

const initialState: UploadActionState = { error: null };
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

function fileTypeFromName(name: string): "pdf" | "docx" | null {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "docx";
  return null;
}

export function ResumeUploadForm({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState(recordUploadAndParse, initialState);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);

    const fileType = fileTypeFromName(file.name);
    if (!fileType) {
      setUploadError("Only PDF and DOCX files are supported.");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setUploadError("File must be 5 MB or smaller.");
      e.target.value = "";
      return;
    }

    setUploading(true);
    try {
      const supabase = createClient();
      const storagePath = `${userId}/${crypto.randomUUID()}.${fileType}`;
      const { error } = await supabase.storage.from("resumes").upload(storagePath, file, {
        contentType:
          fileType === "pdf"
            ? "application/pdf"
            : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: false,
      });
      if (error) {
        setUploadError(error.message);
        return;
      }

      const form = formRef.current!;
      (form.elements.namedItem("storagePath") as HTMLInputElement).value = storagePath;
      (form.elements.namedItem("originalFilename") as HTMLInputElement).value = file.name;
      (form.elements.namedItem("fileType") as HTMLInputElement).value = fileType;
      (form.elements.namedItem("fileSizeBytes") as HTMLInputElement).value = String(file.size);
      form.requestSubmit();
    } finally {
      setUploading(false);
    }
  }

  const busy = uploading || pending;

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-3">
      <input type="hidden" name="storagePath" />
      <input type="hidden" name="originalFilename" />
      <input type="hidden" name="fileType" />
      <input type="hidden" name="fileSizeBytes" />

      <label className="flex flex-col gap-2 text-sm">
        <span>Upload a resume (PDF or DOCX, up to 5 MB)</span>
        <input
          type="file"
          accept=".pdf,.docx"
          disabled={busy}
          onChange={handleFileChange}
          className="text-sm"
        />
      </label>

      {busy && (
        <p className="text-sm text-neutral-500">
          {uploading ? "Uploading…" : "Parsing your resume — this can take a moment…"}
        </p>
      )}
      {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
