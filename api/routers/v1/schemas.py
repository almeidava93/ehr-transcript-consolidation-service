from enum import StrEnum

from agents import ModelSettings
from pydantic import BaseModel, ConfigDict, Field, field_validator


class EHRData(BaseModel):
    "General class to store EHR data with unknown structure."

    model_config = ConfigDict(extra="allow")


class TranscriptChunk(BaseModel):
    t: str = Field(pattern="^\d{2}:\d{2}:\d{2}$")
    speaker: str
    text: str


class PredictionRequest(BaseModel):
    ehr_data: EHRData
    transcript_chunk: TranscriptChunk


class NotificationType(StrEnum):
    information_missing = "information_missing"
    information_conflict = "information_conflict"


class Notification(BaseModel):
    type: NotificationType = Field(
        description="Type of error detected when comparing EHR data with the transcript chunk."
    )
    message: str = Field(
        description="Description of the error detected when comparing EHR data with the transcript chunk."
    )


class PredictionResponse(BaseModel):
    notifications: list[Notification] = Field(
        default_factory=list,
        description="List of notifications. Should be empty if no errors are detected when comparing EHR data with the transcript chunk.",
    )


class AgentArgs(BaseModel):
    model: str
    name: str
    instructions: str
    model_settings: ModelSettings
    output_type: type[BaseModel] = PredictionResponse

    @field_validator("model_settings", mode="before")
    def validate_model_settings(cls, value: dict):
        return ModelSettings(**value)


class Config(BaseModel):
    agent_args: AgentArgs
    input_prompt_template: str
