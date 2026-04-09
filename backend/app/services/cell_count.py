"""
Cell Count Analysis Service
============================

Performs automated counting of positive (stained) vs negative (unstained)
cells in immunohistochemistry (IHC) microscope images and computes the
proliferation index.

Pipeline overview:
  1. Color deconvolution   — separates the image into DAB (brown) and Hematoxylin (blue) channels
  2. Thresholding          — creates binary masks of nuclei in each channel
  3. Morphological cleanup — removes noise and fills holes
  4. Watershed             — splits touching/overlapping nuclei
  5. Contour extraction    — finds cell boundaries for visualization
  6. Overlay rendering     — draws colored contours on the original image

References:
  - Ruifrok & Johnston (2001) — color deconvolution method for IHC stain separation
  - scikit-image `color.separate_stains` with the `hdx_from_rgb` matrix
"""

import io
import numpy as np
import cv2
from PIL import Image
from skimage.color import separate_stains, hdx_from_rgb
from skimage.filters import threshold_otsu
from skimage.morphology import (
    opening,
    closing,
    remove_small_objects,
    disk,
)
from skimage.segmentation import watershed
from skimage.measure import label, regionprops
from scipy import ndimage


def analyze_cells(
    image_bytes: bytes,
    *,
    pos_thresh: float = 0.7,
    neg_thresh: float = 0.45,
    pos_min_area: int = 30,
    neg_min_area: int = 20,
    pos_disk_radius: int = 2,
    neg_disk_radius: int = 1,
    watershed_footprint: int = 8,
) -> dict:
    """
    Main entry point: accepts raw image bytes, returns analysis results.

    All detection parameters can be overridden by the caller.
    """
    # --- Load image ---
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img_array = np.array(img)

    # --- Step 1: Color deconvolution ---
    stains = separate_stains(img_array, hdx_from_rgb)

    # Channel 0 = Hematoxylin (blue counterstain, marks all nuclei)
    # Channel 1 = DAB (brown chromogen, marks positive nuclei)
    hematoxylin_channel = stains[:, :, 0]
    dab_channel = stains[:, :, 1]

    # --- Step 2 & 3: Detect nuclei in each channel ---
    positive_mask, positive_labels = _detect_nuclei(
        dab_channel,
        min_area=pos_min_area,
        disk_radius=pos_disk_radius,
        thresh_scale=pos_thresh,
        watershed_footprint=watershed_footprint,
    )
    negative_mask, negative_labels = _detect_nuclei(
        hematoxylin_channel,
        min_area=neg_min_area,
        disk_radius=neg_disk_radius,
        thresh_scale=neg_thresh,
        watershed_footprint=watershed_footprint,
    )

    # --- Remove double-counted nuclei ---
    # A DAB-positive cell also stains with hematoxylin, so it appears in
    # both channels. For each negative-labeled region, if more than 30%
    # of its pixels overlap the positive mask, reclassify the entire
    # region as positive. This prevents mixed red/blue contours on cells
    # that are clearly DAB-stained.
    for region in regionprops(negative_labels):
        region_mask = negative_labels == region.label
        overlap = np.sum(region_mask & positive_mask) / region.area
        if overlap > 0.3:
            # Absorb into positive mask and labels
            positive_mask[region_mask] = True
            negative_mask[region_mask] = False
        else:
            # No significant overlap — just remove any pixel-level overlap
            negative_mask[region_mask & positive_mask] = False

    # Re-label both after reclassification
    positive_labels = label(positive_mask)
    negative_labels = label(negative_mask)

    # --- Count cells ---
    positive_count = _count_cells(positive_labels)
    negative_count = _count_cells(negative_labels)
    total = positive_count + negative_count
    index = (positive_count / total * 100) if total > 0 else 0.0

    # --- Step 5 & 6: Draw overlay ---
    overlay = _draw_overlay(img_array, positive_labels, negative_labels)

    # --- Encode overlay to PNG bytes ---
    overlay_img = Image.fromarray(overlay)
    buf = io.BytesIO()
    overlay_img.save(buf, format="PNG")
    overlay_bytes = buf.getvalue()

    return {
        "positive": positive_count,
        "negative": negative_count,
        "index": round(index, 1),
        "overlay_bytes": overlay_bytes,
    }


def _detect_nuclei(
    channel: np.ndarray,
    min_area: int = 40,
    disk_radius: int = 2,
    thresh_scale: float = 0.85,
    watershed_footprint: int = 8,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Detect individual nuclei in a single deconvolved stain channel.

    Args:
        channel:              2D array from color deconvolution
        min_area:             minimum object area in pixels to keep
        disk_radius:          radius of the morphological structuring element
        thresh_scale:         multiplier on the Otsu threshold (< 1.0 = more permissive)
        watershed_footprint:  size of the local max filter for watershed seeds
    """
    try:
        thresh = threshold_otsu(channel)
    except ValueError:
        empty = np.zeros(channel.shape, dtype=bool)
        return empty, label(empty)

    # Scale threshold to catch lighter-stained cells
    binary = channel > (thresh * thresh_scale)

    # Morphological cleanup — smaller disk to preserve small nuclei
    selem = disk(disk_radius)
    binary = opening(binary, selem)
    binary = closing(binary, selem)

    # Remove tiny noise objects
    binary = remove_small_objects(binary, min_size=min_area)

    # --- Watershed segmentation to split touching nuclei ---
    distance = ndimage.distance_transform_edt(binary)
    # Less smoothing to preserve individual peaks in clusters
    distance = ndimage.gaussian_filter(distance, sigma=1)

    # Smaller footprint = more seeds = better splitting of adjacent cells
    local_max = ndimage.maximum_filter(distance, size=watershed_footprint) == distance
    local_max[~binary] = False

    markers = label(local_max)
    labels = watershed(-distance, markers, mask=binary)

    clean_mask = labels > 0
    return clean_mask, labels


def _count_cells(labels: np.ndarray) -> int:
    """Count the number of distinct labeled regions (cells)."""
    return len(regionprops(labels))


def _draw_overlay(
    img: np.ndarray,
    positive_labels: np.ndarray,
    negative_labels: np.ndarray,
) -> np.ndarray:
    """
    Draw colored contours on the original image to visualize detected cells.

    - Red contours  = positive (DAB-stained) cells
    - Blue contours = negative (Hematoxylin-only) cells
    """
    overlay = img.copy()
    _draw_label_contours(overlay, positive_labels, color=(255, 0, 0), thickness=2)
    _draw_label_contours(overlay, negative_labels, color=(0, 100, 255), thickness=2)
    return overlay


def _draw_label_contours(
    img: np.ndarray,
    labels: np.ndarray,
    color: tuple[int, int, int],
    thickness: int = 2,
) -> None:
    """
    Draw contours around EACH labeled region individually.

    Previously this drew contours on a single binary mask, which caused
    touching cells to merge into one big blob. Now each label gets its
    own contour so adjacent cells are outlined separately.
    """
    for region_label in range(1, labels.max() + 1):
        cell_mask = (labels == region_label).astype(np.uint8) * 255
        contours, _ = cv2.findContours(cell_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        cv2.drawContours(img, contours, -1, color, thickness)
