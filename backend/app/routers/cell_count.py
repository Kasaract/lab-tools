"""
Cell Count Analysis API Router
================================

Provides endpoints for cell count proliferation index analysis.

Endpoints:
  POST /api/cell-count/run
    - Accepts a microscope image (multipart file upload) + optional tuning parameters
    - Returns a JSON body with cell counts AND the annotated overlay image
"""

import base64

from fastapi import APIRouter, UploadFile, File, Form

from app.services.cell_count import analyze_cells

router = APIRouter()


@router.post("/run")
async def run_cell_count_analysis(
    file: UploadFile = File(...),
    pos_thresh: float = Form(0.7),
    neg_thresh: float = Form(0.45),
    pos_min_area: int = Form(30),
    neg_min_area: int = Form(20),
    pos_disk_radius: int = Form(2),
    neg_disk_radius: int = Form(1),
    watershed_footprint: int = Form(8),
):
    image_bytes = await file.read()
    result = analyze_cells(
        image_bytes,
        pos_thresh=pos_thresh,
        neg_thresh=neg_thresh,
        pos_min_area=pos_min_area,
        neg_min_area=neg_min_area,
        pos_disk_radius=pos_disk_radius,
        neg_disk_radius=neg_disk_radius,
        watershed_footprint=watershed_footprint,
    )

    overlay_b64 = base64.b64encode(result["overlay_bytes"]).decode("utf-8")

    return {
        "filename": file.filename,
        "positive": result["positive"],
        "negative": result["negative"],
        "index": result["index"],
        "overlay": overlay_b64,
    }
