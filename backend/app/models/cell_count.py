from pydantic import BaseModel


class CellCountResult(BaseModel):
    """Response schema for the cell count analysis endpoint."""

    filename: str
    positive: int       # Number of positive (DAB-stained) cells
    negative: int       # Number of negative (Hematoxylin-only) cells
    index: float        # Percentage of positive cells: positive / total * 100
