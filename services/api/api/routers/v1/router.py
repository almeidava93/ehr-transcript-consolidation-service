from fastapi import APIRouter

from api.routers.v1.schemas import PredictionRequest, PredictionResponse
from api.routers.v1.service import PredictionService


router = APIRouter(
    prefix="/v1",
)


@router.post("/predict", response_model=PredictionResponse)
async def predict(request: PredictionRequest):
    return await PredictionService.predict(request)
