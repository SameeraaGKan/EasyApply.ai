import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.config import settings

# Mirrors web/src/lib/encryption.ts exactly — AES-256-GCM,
# iv(12) || ciphertext || authTag(16), base64-encoded. Python's AESGCM
# already appends the tag to the ciphertext on encrypt and expects it there
# on decrypt, which is the same layout Node's crypto module produces when
# you concatenate cipher.update()+final() with cipher.getAuthTag() — so no
# re-framing is needed between the two, just matching nonce placement.
#
# Only used to decrypt (the Form-Filler agent reads profiles.eeo_* directly
# from Neon to fill EEO form fields — see app/agents/form_filler.py); all
# writes happen from the web app.


def _get_key() -> bytes:
    if not settings.profile_encryption_key:
        raise RuntimeError("PROFILE_ENCRYPTION_KEY is not set")
    key = base64.b64decode(settings.profile_encryption_key)
    if len(key) != 32:
        raise RuntimeError("PROFILE_ENCRYPTION_KEY must decode to exactly 32 bytes (AES-256)")
    return key


def decrypt_field(encoded: str) -> str:
    combined = base64.b64decode(encoded)
    if len(combined) < 12 + 16:
        raise ValueError("Malformed encrypted field")
    nonce = combined[:12]
    ciphertext_and_tag = combined[12:]
    aesgcm = AESGCM(_get_key())
    plaintext = aesgcm.decrypt(nonce, ciphertext_and_tag, None)
    return plaintext.decode("utf-8")


def decrypt_nullable(encoded: str | None) -> str | None:
    if not encoded:
        return None
    return decrypt_field(encoded)


def encrypt_field(plaintext: str) -> str:
    """Not used in normal operation (writes happen from the web app), but
    kept for the cross-language round-trip test and any future Python-side
    write path."""
    nonce = os.urandom(12)
    aesgcm = AESGCM(_get_key())
    ciphertext_and_tag = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
    return base64.b64encode(nonce + ciphertext_and_tag).decode("ascii")
