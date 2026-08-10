from dataclasses import dataclass, field


@dataclass
class FieldResult:
    """Per-field outcome, surfaced to the user so they know exactly what to
    double-check before submitting — the review screenshot alone isn't
    enough for e.g. a react-select field that silently failed to match."""

    field_label: str
    status: str  # "filled" | "skipped" | "failed"
    detail: str | None = None


@dataclass
class FormFillResult:
    fields: list[FieldResult] = field(default_factory=list)
    unmatched_questions: list[str] = field(default_factory=list)
    screenshot: bytes | None = None

    @property
    def filled_count(self) -> int:
        return sum(1 for f in self.fields if f.status == "filled")

    @property
    def failed_count(self) -> int:
        return sum(1 for f in self.fields if f.status == "failed")
