"""
Batch Upload Router
====================

Extracts images from uploaded archives (.tar, .tar.gz, .tgz, .zip)
and returns them as base64-encoded entries the frontend can display.
"""

import base64
import io
import tarfile
import zipfile
from pathlib import PurePosixPath

from fastapi import APIRouter, HTTPException, UploadFile, File

router = APIRouter()

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".webp"}


def _is_image(name: str) -> bool:
    return PurePosixPath(name).suffix.lower() in IMAGE_EXTENSIONS


def _is_hidden(name: str) -> bool:
    basename = PurePosixPath(name).name
    return basename.startswith(".") or basename.startswith("._")


@router.post("/extract-archive")
async def extract_archive(file: UploadFile = File(...)):
    """
    Accept a tar or zip archive and return all image files found inside.

    Returns JSON:
      - images: list of { name, data } where data is a base64-encoded image
    """
    raw = await file.read()
    filename = (file.filename or "").lower()

    images: list[dict[str, str]] = []

    if filename.endswith(".zip"):
        try:
            zf = zipfile.ZipFile(io.BytesIO(raw))
        except zipfile.BadZipFile:
            raise HTTPException(status_code=400, detail="Invalid zip archive")

        for info in zf.infolist():
            if info.is_dir():
                continue
            if not _is_image(info.filename) or _is_hidden(info.filename):
                continue
            data = zf.read(info.filename)
            images.append({
                "name": PurePosixPath(info.filename).name,
                "data": base64.b64encode(data).decode("utf-8"),
            })
        zf.close()
    else:
        try:
            tar = tarfile.open(fileobj=io.BytesIO(raw))
        except tarfile.TarError:
            raise HTTPException(status_code=400, detail="Invalid tar archive")

        for member in tar.getmembers():
            if not member.isfile():
                continue
            if not _is_image(member.name) or _is_hidden(member.name):
                continue
            f = tar.extractfile(member)
            if f is None:
                continue
            data = f.read()
            images.append({
                "name": PurePosixPath(member.name).name,
                "data": base64.b64encode(data).decode("utf-8"),
            })
        tar.close()

    if not images:
        raise HTTPException(status_code=400, detail="No images found in archive")

    return {"images": images}


# Keep old endpoint as alias for backwards compatibility
@router.post("/extract-tar")
async def extract_tar(file: UploadFile = File(...)):
    return await extract_archive(file)
